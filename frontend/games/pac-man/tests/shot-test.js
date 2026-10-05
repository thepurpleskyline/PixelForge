// Drive the game to a mid-run state and dump a PNG of the canvas via node-canvas if present.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(__dirname + '/../pac-man.html', 'utf8');
const script = html.split('<script>')[1].split('</' + 'script>')[0];

// Use node-canvas for a real image (installed separately); fall back to fake if absent.
const fakeCanvas = { width: 0, height: 0, style: {}, getContext: () => makeCtx(), addEventListener: () => {} };
let realCanvas = null;
try {
  const { createCanvas } = require('canvas');
  realCanvas = createCanvas(560, 640);
  realCanvas.style = {};                 // node-canvas has no style
  realCanvas.addEventListener = () => {}; // node-canvas has no addEventListener
} catch (e) {}

function makeCtx() {
  if (realCanvas) return realCanvas.getContext('2d');
  const noop = () => {};
  return new Proxy({}, { get: (t, p) => (p === 'canvas' ? fakeCanvas : noop), set: () => true });
}
const sandbox = {
  document: { getElementById: () => (realCanvas || fakeCanvas) },
  window: { devicePixelRatio: 1, addEventListener: () => {} },
  performance: { now: () => simTime },
  requestAnimationFrame: cb => { rafCb = cb; },
  localStorage: { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = v; } },
  Math, Date, String, Array, Object, console,
};
let rafCb = null, simTime = 0;
vm.createContext(sandbox);
vm.runInContext(script, sandbox, { filename: 'pac-man.js' });
const game = sandbox.window.__pacmanGame;
const frame = () => { simTime += 1000 / 60; rafCb(simTime); };

game.start(); // title -> ready -> run
// 8s of real play (pac wanders by keyboard policy), then snap a screenshot.
const dirs = [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
let lastInput = 0;
for (let s = 0; s < 8; s++) {
  for (let i = 0; i < 60; i++) {
    const t = simTime;
    if (game.state === 'run' && t - lastInput > 220 + Math.random() * 500) {
      lastInput = t;
      game.pac.nextDir = dirs[(Math.random() * dirs.length) | 0];
    }
    frame();
  }
  if (game.state === 'over') { game.reset(); game.ready(); }
}
console.log('state at shot:', game.state, 'score', game.score, 'ghosts', game.ghosts.map(g => g.state).join(','), 'pelletsLeft', game.pellets.remaining);

if (realCanvas) {
  const shotDir = process.env.PACMAN_SHOT_DIR || __dirname;
  fs.writeFileSync(shotDir + '/pacman-shot.png', realCanvas.toBuffer('image/png'));
  console.log('WROTE pacman-shot.png');
} else {
  console.log('node-canvas not available; skipping PNG (logic verified above).');
}
