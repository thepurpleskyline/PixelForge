// Focused diagnostic: ghost house release timing + power pellet fright, zero player input.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(__dirname + '/../pac-man.html', 'utf8');
const script = html.split('<script>')[1].split('</' + 'script>')[0];

function makeCtx() {
  const noop = () => {};
  return new Proxy({}, {
    get: (t, prop) => {
      if (prop === 'canvas') return fakeCanvas;
      if (prop === 'measureText') return () => ({ width: 10 });
      return noop;
    },
    set: () => true
  });
}
const fakeCanvas = { width: 0, height: 0, style: {}, getContext: () => makeCtx(), addEventListener: () => {} };
const sandbox = {
  document: { getElementById: () => fakeCanvas },
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

function frame() { simTime += 1000 / 60; rafCb(simTime); }

game.ready(); // straight to ready -> run
console.log('t(s) runTime state  blinky pinky  inky   clyde  fright');
for (let s = 1; s <= 25; s++) {
  for (let i = 0; i < 60; i++) frame();
  const st = game.ghosts.map(g => g.state.padStart(6));
  console.log(`${String(s).padStart(4)} ${game.runTime.toFixed(1).padStart(8)} ${game.state.padEnd(5)} ${st.join(' ')}`);
  if (game.state === 'dying' || game.state === 'over') { game.ready(); }
}
console.log('\nFINAL:', game.state, 'lives', game.lives);
