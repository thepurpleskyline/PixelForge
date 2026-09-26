from flask import Flask, jsonify, session, render_template
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask import request
from sqlalchemy.exc import IntegrityError, OperationalError, DataError
import os
import jwt
from datetime import datetime, timedelta
from functools import wraps
import redis
import uuid
from flask import send_from_directory

frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))

app = Flask(
    __name__,
    template_folder=frontend_dir,
    static_folder=frontend_dir,
    static_url_path='')

# Connects Flask to the database file in the same folder
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(app.instance_path, 'pixelforge.db')
app.config['SECRET_KEY'] =  os.environ.get('SECRET_KEY', 'dev-key-change-this')
app.config['JWT_ACCESS_EXPIRES'] = timedelta(minutes=15)
app.config['JWT_REFRESH_EXPIRES'] = timedelta(days=7)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

#redis for blacklisting tokens.
redis_client = redis.Redis(
    host=os.environ.get('REDIS_HOST', 'localhost'),
    port=6379,
    decode_responses=True
)

db = SQLAlchemy(app)

# This class is the Translator. It maps the 'games' table to Python.
class Game(db.Model):
    __tablename__ = 'games'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    route_name = db.Column(db.String(100), nullable=False)

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    refresh_token = db.Column(db.Text, nullable=True)

class Score(db.Model):
    __tablename__ = 'scores'
    id = db.Column(db.Integer, primary_key=True)
    score = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime, default=db.func.current_timestamp())
    
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    game_id = db.Column(db.Integer, db.ForeignKey('games.id'), nullable=False)
    
    user = db.relationship('User', backref='scores')
    game = db.relationship('Game', backref='scores')


def create_tokens(user_id, username):
    """Generate both access and refresh tokens"""
    #Access token with short expiration
    access_payload = {
        'user_id': user_id,
        'username': username,
        'type': 'access',
        'exp': datetime.utcnow() + app.config['JWT_ACCESS_EXPIRES']
    }
    access_token = jwt.encode(
        access_payload,
        app.config['SECRET_KEY'],
        algorithm='HS256'
    )
    #Refresh token with longer expiration
    refresh_payload = {
        'user_id': user_id,
        'username': username,
        'type': 'refresh',
        'exp': datetime.utcnow() + app.config['JWT_REFRESH_EXPIRES']
    }
    refresh_token = jwt.encode(
        refresh_payload,
        app.config['SECRET_KEY'],
        algorithm='HS256'
    )
    return access_token, refresh_token

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')

        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"message": "Token is required"}), 401
        
        token = auth_header.split(' ')[1]

        try:
            #check if token is blacklisted
            if redis_client.exists(f"blacklist:{token}"):
                return jsonify({"message": "Token has been revoked"}), 401
            
            payload = jwt.decode(
                token,
                app.config['SECRET_KEY'],
                algorithms=['HS256']
            )
            # Ensure it's an access token
            if payload.get('type') != 'access':
                return jsonify({"message": "Invalid token type"}), 401
            
            current_user = {
                'id': payload['user_id'],
                'username': payload['username']
            }
        except jwt.ExpiredSignatureError:
            return jsonify({"message": "Access token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"message": "Invalid token"}), 401
        
        return f(current_user, *args, **kwargs)
    return decorated


@app.route('/api/register', methods=['POST'])
def register():
    try:
        data = request.json #Grabs the data from the html form.
    
        if not data.get('username') or not data.get('password'):
            return jsonify({"message": "Credentials required"}), 400
        
        hashed_pw = generate_password_hash(data['password'])
        new_user = User(username=data['username'], password_hash=hashed_pw)
    
    
        db.session.add(new_user) 
        db.session.commit()
        return jsonify({"message": "Pilot registered successfully!"}), 201
   
    except IntegrityError as e:
        # Duplicate username or invalid foreign key
        db.session.rollback()
        return jsonify({"message": f"Database conflict: {str(e)}"}), 400

    except DataError as e:
        # Data too long, wrong type, etc.
        db.session.rollback()
        return jsonify({"message": f"Invalid data: {str(e)}"}), 400

    except OperationalError as e:
        # Database connection problem
        return jsonify({"message": f"Database error: {str(e)}"}), 500

    except Exception as e:
        # Any other unepected error
        db.session.rollback()
        return jsonify({"message": f"Unepected error: {str(e)}"}), 500

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.json
        if not data or not data.get('username') or not data.get('password'):
            return jsonify({"message": "Credentials required"}), 400

        user = User.query.filter_by(username=data['username']).first()

        if user and check_password_hash(user.password_hash, data['password']):
            access_token, refresh_token = create_tokens(user.id, user.username)

            user.refresh_token = refresh_token
            db.session.commit()

            return jsonify({"message": f"Welcome back, {user.username}!",
                            "access_token": access_token,
                            "refresh_token": refresh_token,
                            "user": {
                                "id": user.id,
                                "username": user.username
                            }
            }), 200
        else:
            return jsonify({"message": "Invalid username or password"}), 401
        
    except Exception as e:
        return jsonify({"message": f"Error: {str(e)}"}), 500
    
@app.route('/api/refresh', methods=['POST'])
def refresh_token():
    """Get a new access token using a valid refresh token"""
    try:
        data = request.json
        refresh_token = data.get('refresh_token')

        if not refresh_token:
            return jsonify({"message": "Refresh token required"}), 400
        
        # Verify the refresh token
        payload = jwt.decode(
            refresh_token,
            app.config['SECRET_KEY'],
            algorithms=['HS256']
        )
        if payload.get('type') != 'refresh':
            return jsonify({"message": "Invalid token type"}), 401
        
        #Check if the refresh token matches what's in db
        user = User.query.get(payload['user_id'])
        if not user or user.refresh_token != refresh_token:
            return jsonify({"message": "Invalid refresh token"}), 401
        
        # Generate new access token
        new_access_payload = {
            'user_id': user.id,
            'username': user.username,
            'type': 'access',
            'exp': datetime.utcnow() + app.config['JWT_ACCESS_EXPIRES']
        }
        new_access_token = jwt.encode(
            new_access_payload,
            app.config['SECRET_KEY'],
            algorithm='HS256'
        )
        return jsonify({"access_token": new_access_token}), 200
    
    except jwt.ExpiredSignatureError:
        return jsonify({"message": "Refresh token expired"}), 401
    except jwt.InvalidTokenError:
        return jsonify({"message": "Invalid refresh token"}), 401
    except Exception as e:
        return jsonify({"message": f"Error: {str(e)}"}), 500


@app.route('/api/submit-score', methods=['POST'])
@token_required
def submit_score(current_user):
    try:
        data = request.json
        game_session_id = data.get('game_session_id')
        score_val = data.get('score')

        if not game_session_id or score_val is None:
            return jsonify({"message": "game_session_id and score are required"}), 400

        # Fetch session from Redis
        session_key = f"game_session:{game_session_id}"
        session_raw = redis_client.get(session_key)

        if not session_raw:
            return jsonify({"message": "Invalid or expired game session"}), 400

        # Parse session: user_id:game_id:start_timestamp
        s_user_id, s_game_id, s_start_time = session_raw.split(':')
        s_user_id = int(s_user_id)
        s_game_id = int(s_game_id)
        s_start_time = int(s_start_time)

        # Ensure session belongs to current user
        if s_user_id != current_user['id']:
            return jsonify({"message": "Session user mismatch"}), 403

        # Minimum time check (e.g., must spend at least 3 seconds playing)
        now_ts = int(datetime.utcnow().timestamp())
        if (now_ts - s_start_time) < 3:
            return jsonify({"message": "Score submitted too quickly"}), 400

        # Save score
        new_score = Score(
            score=score_val,
            user_id=current_user['id'],
            game_id=s_game_id
        )
        db.session.add(new_score)
        
        # Burn the session token instantly so it can never be used again
        redis_client.delete(session_key)

        db.session.commit()
        return jsonify({"message": "Score submitted successfully!"}), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({"message": f"Unexpected error: {str(e)}"}), 500
    

@app.route('/api/logout', methods=['POST'])
@token_required
def logout(current_user):
    try:
        # Extract raw access token from Authorization header
        auth_header = request.headers.get('Authorization')
        token = auth_header.split(' ')[1]

        # Decode token to calculate remaining TTL (Time To Live)
        payload = jwt.decode(
            token,
            app.config['SECRET_KEY'],
            algorithms=['HS256']
        )
        # Calculate seconds remaining until expiration
        exp_timestamp = payload['exp']
        now_timestamp = datetime.utcnow().timestamp()
        ttl = int(exp_timestamp - now_timestamp)

        # Add access token to Redis blacklist with TTL is still valid
        if ttl > 0:
            redis_client.setex(f"blacklist:{token}", ttl, "revoked")

        # Invalidate the refresh token in the database
        user = User.query.get(current_user['id'])
        if user:
            user.refresh_token = None
            db.session.commit()

        return jsonify({"message": "Successfully logged out"}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"message": f"Logout failed: {str(e)}"}), 500


@app.route('/api/game/start', methods=['POST'])
@token_required
def start_game_session(current_user):
    try:
        data = request.json
        game_id = data.get('game_id')

        if not game_id:
            return jsonify({"message": "game_id is required"}), 400

        # Verify game exists in DB
        game = Game.query.get(game_id)
        if not game:
            return jsonify({"message": "Game not found"}), 404

        # Generate a unique session ID
        session_id = str(uuid.uuid4())

        # Store session data in Redis with a TTL of 30 minutes
        # Store start time so we can check duration on score submission
        session_data = f"{current_user['id']}:{game_id}:{int(datetime.utcnow().timestamp())}"
        redis_client.setex(f"game_session:{session_id}", 1800, session_data)

        return jsonify({
            "game_session_id": session_id,
            "message": "Game session started successfully"
        }), 201

    except Exception as e:
        return jsonify({"message": f"Failed to start game session: {str(e)}"}), 500


@app.route('/api/games', methods=['GET'])
def get_games():
    # Python asks the DB for all games
    all_games = Game.query.all()
    
    # Turn the database rows into a list of dictionaries
    games_list = []
    for game in all_games:
        games_list.append({
            "id": game.id,
            "title": game.title,
            "route": game.route_name
        })
    
    return jsonify(games_list)

# Serve static frontend assets (JS, CSS, etc.)
@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('../frontend', filename)

# Serve the main homepage at http://127.0.0.1:5000/
@app.route('/')
def index():
    return send_from_directory('../frontend', 'pixelforge.html')

if __name__ == '__main__':
    app.run(debug=True)
