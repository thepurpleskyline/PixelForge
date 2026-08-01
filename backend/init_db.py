# init_db.py
from app import app, db, Game

with app.app_context():
    print("Connecting to database...")
    # This creates the tables based on your 'class Game'
    db.create_all()
    
    print("Checking for existing games...")
    if not Game.query.first():
        print("Adding seed games...")
        # We can even automate adding your 6 games here
        games = [
            Game(title='Tetris', route_name='tetris'),
            Game(title='Snake', route_name='snake'),
            Game(title='Pong', route_name='pong'),
            Game(title='Minesweeper', route_name='minesweeper'),
            Game(title='Pac-Man', route_name='pacman'),
            Game(title='Asteroids', route_name='asteroids')
        ]
        db.session.bulk_save_objects(games)
        db.session.commit()
        print("Database initialized and seeded!")
    else:
        print("Database already contains data. Skipping seed.")
