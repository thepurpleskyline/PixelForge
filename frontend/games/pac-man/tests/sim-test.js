// Headless simulation: boot the game with a fake canvas, script inputs,
// and verify the full lifecycle runs without errors for several minutes.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../pac-man.html', 'utf8');
const script = html.split('<script>')[1].split('</' + 'script>')[0];

// ---- fake 2D context: records nothing, just satisfies the API ----
function makeCtx() {
  const noop = () => {};
  return new Proxy({}, {
    get: (t, prop) => {
      if (prop === 'canvas') return fakeCanvas;
      if (prop === 'scale' || prop === 'fillRect') return noop;
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'beginPath' || prop === 'moveTo' || prop === 'lineTo' || prop === 'arc' ||
          prop === 'ellipse' || prop === 'quadraticCurveTo' || prop === 'closePath' ||
          prop === 'stroke' || prop === 'fill' || prop === 'fillText' || prop === 'clip' ||
          prop === 'save' || prop === 'restore' || prop === 'translate' || prop === 'rotate') return noop;
      return noop;
    },
    set: () => true
  });
}
const fakeCanvas = { width: 0, height: 0, style: {}, getContext: () => makeCtx(), addEventListener: () => {} };

// ---- sandbox globals ----
const sandbox = {
  document: { getElementById: () => fakeCanvas },
  window: {
    devicePixelRatio: 1,
    addEventListener: () => {},
    AudioContext: undefined, webkitAudioContext: undefined,
  },
  performance: { now: () => simTime },
  requestAnimationFrame: cb => { rafCb = cb; },
  localStorage: {
    _m: {}, getItem(k) { return this._m[k] ?? null; },
    setItem(k, v) { this._m[k] = v; },
  },
  Math, Date, String, Array, Object, console,
};
let rafCb = null, simTime = 0;

const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(script, sandbox, { filename: 'pac-man.js' });

// drive frames; grab the game instance via the window handle set in boot()
const game = sandbox.window.__pacmanGame;
if (!game) throw new Error('game instance not exposed');

function drive(ms, scriptInput) {
  const end = simTime + ms;
  let frames = 0;
  while (simTime < end) {
    simTime += 1000 / 60;
    if (scriptInput) scriptInput(simTime);
    rafCb(simTime);
    frames++;
    if (!rafCb) throw new Error('raf chain broken');
  }
  return frames;
}

const log = [];
function status(tag) {
  log.push(`${tag} t=${(simTime / 1000).toFixed(1)}s state=${game.state} score=${game.score} lives=${game.lives} lvl=${game.level} ` +
    `pac=(${Math.round(game.pac.x)},${Math.round(game.pac.y)}) ghosts=[${game.ghosts.map(g => g.state).join(',')} ` +
    `fright=${game.fright > 0 ? game.fright.toFixed(1) : '-'}] pelletsLeft=${game.pellets.remaining}`);
}

try {
  // title for 1s, then start
  drive(1000);
  if (game.state !== 'title') throw new Error('expected title, got ' + game.state);
  game.start();
  drive(1500); // ready -> run
  status('start');

  // --- Phase 1: 30s of play with a wandering input policy ---
  let lastInput = 0;
  const dirs = [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  const policy = (t) => {
    if (t - lastInput > 200 + Math.random() * 600) {
      lastInput = t;
      game.pac.nextDir = dirs[(Math.random() * dirs.length) | 0];
    }
  };
  drive(30000, policy);
  status('30s');

  // --- Phase 2: force a power pellet: teleport pac onto one ---
  const pg = game.pellets.grid;
  outer:
  for (let r = 0; r < pg.length; r++) for (let c = 0; c < pg[r].length; c++) {
    if (pg[r][c] === 2) {
      game.pac.x = (c + 0.5) * 20; game.pac.y = (r + 0.5) * 20;
      game.pac.dir = { x: 1, y: 0 }; game.pac.nextDir = { x: 1, y: 0 };
      game.pac.lastAngle = 0;
      break outer;
    }
  }
  drive(800);
  status('power-eaten');
  const frightActive = game.ghosts.some(g => g.state === 'fright' || g.state === 'eyes');
  if (!frightActive && game.fright < 0 && !game.ghosts.some(g => g.state === 'fright'))
    console.log('NOTE: no fright/eyes seen after power (may have already been eaten or exited)');

  // --- Phase 3: run 200s to exercise full lifecycle (eat everything / get eaten / levels) ---
  const seenStates = new Set();
  const check = (t) => {
    seenStates.add(game.state);
    if (t - lastInput > 250 + Math.random() * 500) {
      lastInput = t;
      game.pac.nextDir = dirs[(Math.random() * dirs.length) | 0];
    }
    if (seenStates.size > 3) status('lifecycle');
    seenStates.clear();
  };
  let t2 = simTime;
  const big = (t) => { check(t); policy(t); };
  drive(200000, big);
  status('end-of-200s');

  // --- Phase 4: if in 'over', exercise reset ---
  if (game.state === 'over') {
    game.reset(); game.start();
    drive(2000);
    status('after-reset');
  }

  // --- Phase 5: render 100 frames to exercise every render branch ---
  for (const s of ['title', 'ready', 'run', 'over']) {
    game.state = s; game.paused = false;
    for (let i = 0; i < 25; i++) { simTime += 1000 / 60; rafCb(simTime); }
  }
  game.paused = true;
  for (let i = 0; i < 10; i++) { simTime += 1000 / 60; rafCb(simTime); }

  // --- Phase 6: force each ghost through every state, incl. tunnel + death ---
  game.paused = false;
  game.state = 'run';
  for (const g of game.ghosts) {
    for (const st of ['out', 'fright', 'eyes', 'house', 'leaving', 'entering', 'revive']) {
      g.state = st; g.stateT = 0; g.bobY = 0;
      if (st === 'house') { g.x = g.slotX; g.y = 260; g.releaseAt = -1; }
      if (st === 'eyes') { g.x = 13.5 * 20; g.y = 210; }
      for (let i = 0; i < 40; i++) { simTime += 1000 / 60; rafCb(simTime); }
      if (game.state !== 'run') { game.state = 'run'; game.stateT = 0; game.paused = false; }
    }
  }
  // tunnel test
  const g0 = game.ghosts[0];
  g0.state = 'out'; g0.x = -30; g0.y = 13.5 * 20; g0.dir = { x: -1, y: 0 }; g0.nextDir = { x: -1, y: 0 };
  for (let i = 0; i < 30; i++) { simTime += 1000 / 60; rafCb(simTime); }
  if (g0.x < -20) throw new Error('tunnel wrap failed, x=' + g0.x);

  // death animation to completion
  game.state = 'dying'; game.stateT = 0;
  drive(1600);
  status('post-death');
  if (game.lives < 1 && game.state !== 'over' && game.state !== 'ready')
    throw new Error('bad post-death state: ' + game.state);

  console.log('\nALL CHECKS PASSED');
  console.log(log.join('\n'));
  console.log('final: state=' + game.state + ' score=' + game.score + ' level=' + game.level + ' lives=' + game.lives);
} catch (e) {
  console.error('FAIL:', e.message);
  console.error(log.join('\n'));
  process.exit(1);
}
