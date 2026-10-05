let currentGameSessionId = null;

// Modal Controls
function openLogin() {
    document.getElementById("loginOverlay").style.display = "flex";
    document.body.style.overflow = "hidden";
}

function closeLogin() {
    document.getElementById("loginOverlay").style.display = "none";
    document.body.style.overflow = "visible";
}

function openRegister() {
    closeLogin();
    document.getElementById("registerOverlay").style.display = "flex";
    document.body.style.overflow = "hidden";
}

function closeRegister() {
    document.getElementById("registerOverlay").style.display = "none";
    document.body.style.overflow = "auto";
}

function showStatus(msg) {
    const banner = document.getElementById("statusBanner");
    if (banner) banner.innerText = msg;
}

// 1. User Registration Handler
async function handleRegistration() {
    const username = document.getElementById("regUsername").value.trim();
    const pass = document.getElementById("regPassword").value;
    const confirm = document.getElementById("confirmPassword").value;

    if (!username || !pass) {
        alert("Please fill in all credentials.");
        return;
    }

    if (pass !== confirm) {
        alert("Error: Passwords do not match!");
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: pass })
        });

        const data = await response.json();

        if (response.ok) {
            alert("Pilot registered successfully! You can now log in.");
            closeRegister();
            openLogin();
        } else {
            alert(`Registration failed: ${data.message}`);
        }
    } catch (err) {
        alert("Server error connecting to registration endpoint.");
    }
}

// 2. User Login Handler
async function handleLogin() {
    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!username || !password) {
        alert("Username and password are required.");
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password })
        });

        const data = await response.json();

        if (response.ok) {
            // Save access token to local storage
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('refresh_token', data.refresh_token);
            localStorage.setItem('username', data.user.username);

            closeLogin();
            updateNavState();
            showStatus(`Welcome back, ${data.user.username}!`);
        } else {
            alert(`Login failed: ${data.message}`);
        }
    } catch (err) {
        alert("Server error connecting to login endpoint.");
    }
}

// 3. User Logout Handler
async function logoutUser() {
    const token = localStorage.getItem('access_token');
    
    if (token) {
        try {
            await fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (e) {
            console.log("Logout notification to server failed, clearing local session anyway.");
        }
    }

    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('username');
    updateNavState();
    showStatus("Logged out successfully.");
}

// Update Navbar visibility based on auth status
function updateNavState() {
    const token = localStorage.getItem('access_token');
    const user = localStorage.getItem('username');

    if (token) {
        document.getElementById('navLogin').style.display = 'none';
        document.getElementById('navRegister').style.display = 'none';
        document.getElementById('navLogout').style.display = 'inline';
        document.getElementById('navLogout').innerText = `Logout (${user})`;
    } else {
        document.getElementById('navLogin').style.display = 'inline';
        document.getElementById('navRegister').style.display = 'inline';
        document.getElementById('navLogout').style.display = 'none';
    }
}

async function loadGames() {
    const gameGrid = document.getElementById('gameGrid');
    if (!gameGrid) return;

    try {
        const response = await fetch('/api/games');
        const games = await response.json();

        gameGrid.innerHTML = ''; //Clear container

        if (games.length === 0) {
            gameGrid.innerHTML = '<p class="no-games">No games available yet.</p>';
            return;
        }

        games.forEach(game => {
            const card = document.createElement('div');
            card.className = 'game-card';

            // Fallback thumbnail if none is provided
            const thumbSrc = game.thumbnail || '/img/placeholder.png';

            // Build card dynamically
            card.innerHTML = `
                <div class="card-thumb">
                    <img src="${thumbSrc}" alt="${game.title}" />
                </div>
                <div class="game-info">
                    <h3>${game.title}</h3>
                </div>
                <button class="play-button" onclick="launchGame('${game.route_name}')">Play Now</button>
            `;

            gameGrid.appendChild(card);
        });
    } catch (err) {
        console.error("Failed to load games:", err);
        gameGrid.innerHTML = '<p class="error">Error loading game library.</p>';
    }
}

// Initialize game library on page load
document.addEventListener('DOMContentLoaded', () => {
    updateNavState();
    loadGames();
});

// 4. Launch Game Session Flow
function launchGame(gamePath) {
    const token = localStorage.getItem('access_token');

    if (!token) {
        alert("Authentication required. Please log in to play.");
        openLogin();
        return;
    }

    // Set iframe src and display overlay
    document.getElementById('gameFrame').src = gamePath;
    document.getElementById('gameOverlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeGame() {
    document.getElementById('gameOverlay').style.display = 'none';
    document.getElementById('gameFrame').src = '';
    document.body.style.overflow = 'auto';
//  currentGameSessionId = null;
    showStatus("");

    // Exit fullscreen if active when closing
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => console.log(err));
    }
}

// New helper function for HTML5 Fullscreen API
function toggleFullscreen() {
    const iframe = document.getElementById('gameFrame');

    if (!document.fullscreenElement) {
        iframe.requestFullscreen().catch(err => {
            console.error(`Fullscreen request failed: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}
// 5. Listen for Game Over score events emitted by iframe game
//window.addEventListener('message', async (event) => {
//  if (event.data && event.data.type === 'GAME_OVER') {
//        const score = event.data.score;
//        await submitScore(score);
//    }
//});

// Submit Score to Flask Backend
//async function submitScore(score) {
//    const token = localStorage.getItem('access_token');
//
//    if (!currentGameSessionId || !token) {
//        showStatus("Error: No active session or user token found.");
//        return;
//    }
//
//    try {
//        showStatus("Saving score to leaderboard...");
//
//        const response = await fetch('/api/submit-score', {
//            method: 'POST',
//            headers: {
//                'Content-Type': 'application/json',
//                'Authorization': `Bearer ${token}`
//            },
//            body: JSON.stringify({
//                game_session_id: currentGameSessionId,
//                score: score
//            })
//        });
//
//        const data = await response.json();
//
//        if (response.ok) {
//            showStatus(`Score saved! (${score} pts)`);
//            currentGameSessionId = null; // Session used
//        } else {
//            showStatus(`Score submission error: ${data.message}`);
//        }
//    } catch (err) {
//        showStatus("Network error saving score.");
//    }
//}

// Run state check on DOM load
//document.addEventListener('DOMContentLoaded', updateNavState);