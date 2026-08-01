from flask import Flask, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask import request
from sqlalchemy.exc import IntegrityError, OperationalError, DataError
import os
import jwt
from datetime import datetime, timedelta
from functools import wraps
import redis

app = Flask(__name__)

# Connects Flask to the database file in the same folder
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///pixelforge.db'
app.config['SECRET_KEY'] =  os.envron.get('SECRET_KEY', 'dev-key-change-this')
app.config['JWT_ACCESS_EXPIRES'] = timedelta(minutes=15)
app.config['JWT_REFRESH_EXPIRES'] = timedelta(days=7)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

#redis for blacklisting tokens.
redis_client = redis.Redis(
    host=os.environ.get('REDIS_HOST', 'localhost'),
    port=6379,
    decode_response=True
)

db = SQLAlchemy(app)

# This class is the "Translator". It maps the 'games' table to Python.
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
    refresh_token = db.Column(db.text, nullable=True)

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
def submit_score():
    try:
        data = request.json
        new_score = Score(
            score=data['score'],
            user_id=data['user_id'],
            game_id=data['game_id']
        )
        db.session.add(new_score)
        db.session.commit()
        return jsonify({"message": "Score submitted successfully!"}), 201
    
    except IntegrityError as e:
        db.session.rollback()
        return jsonify({"message": f"Database conflict: {str(e)}"}), 400

    except DataError as e:
        db.session.rollback()
        return jsonify({"message": f"Invalid data: {str(e)}"}), 400

    except OperationalError as e:
        return jsonify({"message": f"Database error: {str(e)}"}), 500

    except Exception as e:
        db.session.rollback()
        return jsonify({"message": f"Unexpected error: {str(e)}"}), 500

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

if __name__ == '__main__':
    app.run(debug=True)
