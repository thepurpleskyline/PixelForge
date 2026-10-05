# init_db.py
from app import app, db, Game

# Define the master list of games you want in the system
DEFAULT_GAMES = [
    {"title": "HexGL",
     "route_name": "/games/hexgl/index.html",
     "thumbnail": "/games/hexgl/thumb.png"
     },
    {"title": "2048",
     "route_name": "/games/2048/index.html",
     "thumbnail": "/games/2048/thumb.png"
     },
    {"title": "Astray",
     "route_name": "/games/astray/index.html",
     "thumbnail": "/games/astray/thumb.png"
     },
    {"title": "Bounce Back",
     "route_name": "/games/bounce-back/index.html",
     "thumbnail": "/games/bounce-back/thumb.png"
     },
    {"title": "Pacman",
     "route_name": "/games/pac-man/index.html",
     "thumbnail": "/games/pac-man/thumb.png"
     },
    {"title": "Rainbow Tower",
     "route_name": "/games/rainbow-tower/src/index.html",
     "thumbnail": "/games/rainbow-tower/thumb.png"
     },
    {"title": "Space Huggers",
     "route_name": "/games/space-huggers/index.html",
     "thumbnail": "/games/space-huggers/thumb.png"
     },
    {"title": "Tower Building",
     "route_name": "/games/tower-building/index.html",
     "thumbnail": "/games/tower-building/thumb.png"
     }
]

with app.app_context():
    print("Ensuring database tables exist...")
    db.create_all()

    print("Syncing database with DEFAULT_GAMES...")

    valid_titles = {game['title'] for game in DEFAULT_GAMES}
    deleted_count = 0
    existing_db_games = Game.query.all()

    for db_game in existing_db_games:
        if db_game.title not in valid_titles:
            db.session.delete(db_game)
            deleted_count += 1
            print(f" - Removed stale Entry: {db_game.title}.")

    # Add missing games or update existing routes
    added_count = 0
    updated_count = 0

    for game_data in DEFAULT_GAMES:
        existing_game = Game.query.filter_by(title=game_data['title']).first()

        if not existing_game:
            new_game = Game(
                title=game_data['title'],
                route_name=game_data['route_name'],
                thumbnail=game_data['thumbnail']
            )
            db.session.add(new_game)
            added_count += 1
            print(f" + Added missing game: {game_data['title']}")
        else:
            if existing_game.route_name != game_data['route_name'] or existing_game.thumbnail != game_data['thumbnail']:
                existing_game.route_name = game_data['route_name']
                existing_game.thumbnail = game_data['thumbnail']
                updated_count += 1
                print(f" ~ Updated metadata for: {game_data['title']}")

    if added_count > 0 or deleted_count > 0 or updated_count > 0 or db.session.dirty:
        db.session.commit()
        print(f"\nSync complete! Summary: +{added_count} added, -{deleted_count} removed, ~{updated_count} updated.")
    else:
        print("\nDatabase is already up to date. No changes made.")