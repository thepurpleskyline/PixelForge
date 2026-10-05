// Rainbow Tower — build pipeline for js13k
// Reads src/index.html, minifies the game script with Terser, packs it with
// Roadroller, re-inlines it into a minimal HTML shell (CSS + DOM taken from the
// source so there is a single source of truth), writes dist/index.html, and zips
// it. The ZIP is what the js13k competition weighs (limit: 13 312 bytes).
//
//   nvm use && pnpm install
//   nvm use && pnpm run build   # build + zip, prints the final byte count vs budget
//
import fs from 'fs';
import { execSync } from 'child_process';

const SRC = 'src/index.html';
const OUT = 'dist';
const BUDGET = 13312;

const raw = fs.readFileSync(SRC, 'utf8');

// --- pull the three pieces out of the source ---------------------------------
const script = raw.match(/<script>([\s\S]*)<\/script>/)[1];
const styleRaw = (raw.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
// body = everything between </style> and <script>
const bodyRaw = raw.split('</style>')[1].split('<script>')[0];

// crude but safe CSS/HTML minify (this project's markup is simple & controlled)
const styleMin = styleRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').replace(/\s+/g, ' ').trim();
const bodyMin = bodyRaw.replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();

const shell = js =>
  `<!doctype html><meta charset=utf-8>` +
  `<meta name=viewport content="width=device-width,initial-scale=1,user-scalable=no">` +
  `<title>Rainbow Tower</title><style>${styleMin}</style>${bodyMin}<script>${js}</script>`;

// --- minify + pack -----------------------------------------------------------
const { minify } = await import('terser');
const min = await minify(script, {
  compress: { passes: 8, unsafe: true, unsafe_math: true, unsafe_arrows: true, unsafe_methods: true, unsafe_undefined: true,
    pure_getters: true, booleans_as_integers: true, drop_console: true, hoist_props: true, toplevel: true },
  // mangle OUR object properties too, by explicit whitelist — never a DOM/WebAudio name
  mangle: { toplevel: true, properties: { regex: /^(halfArc|hzo1|hzo2|aamp|abase|aspd|arange|lastDrop|ang0|bimp|bph|wasOnR|onPlat|noCut|minY|squash|coyote|grounded|alive|mover|bounce|ground|rocket|cake|hero|chain|gait|onR|dbl|inv|mag|dis|grav|fric|maxRun|cutJump|rSpanA|rHump|rSolid|rDis|rMax|rCd|rDropGap|magMax|magCost|magGnd|magAir|magGem|hpMax|hpHit|hpCake|waterStart|waterSpeed0|waterAccel|waterClamp|colBase|colDecay|trailLen|stompV|springBase|springRise|springMax|rushLen|boostLen|boostV|flyLen|flyV|flyRun|flyAcc|ang|life|dir|vis|sx|sy|str|big|amp|aph|col|vx|vy|va|age|next|step|loop|buf|cd|hp|onR)$/ } },   // never 'type' (WebAudio) or 'max' (Math.max)
  format: { comments: false },
});

// Roadroller's optimizer is stochastic: the same input packs to a slightly different
// size every run. Pack a few times and keep the best — worth 20-50 B for a few seconds.
const { Packer } = await import('roadroller');
const TRIES = +(process.env.RR_TRIES || 6);
let packed = null;
for (let i = 0; i < TRIES; i++) {
  const packer = new Packer([{ data: min.code, type: 'js', action: 'eval' }], { numAbbreviations: 0 });   // measured ~30 B better than the default on this source
  await packer.optimize(1);
  const { firstLine, secondLine } = packer.makeDecoder();
  const out = firstLine + '\n' + secondLine;
  if (packed == null || out.length < packed.length) packed = out;
}

// --- write outputs -----------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
const html = shell(packed);
fs.writeFileSync(`${OUT}/index.html`, html);

// zip it (needs the `zip` CLI; on Windows use your own zipper or 7-Zip)
let zipBytes = null;
try {
  execSync(`cd ${OUT} && rm -f rainbow-tower.zip && zip -9 -X -q rainbow-tower.zip index.html`, { stdio: 'ignore' });
  zipBytes = fs.statSync(`${OUT}/rainbow-tower.zip`).size;
} catch (e) {
  console.warn('  (could not run `zip` — install it, or zip dist/index.html yourself)');
}

// --- report ------------------------------------------------------------------
const kb = n => (n / 1024).toFixed(2) + ' KB';
console.log('terser-min :', min.code.length, 'B');
console.log('roadroller :', packed.length, 'B (' + kb(packed.length) + ')');
console.log('index.html :', html.length, 'B');
if (zipBytes != null) {
  const pct = (100 * zipBytes / BUDGET).toFixed(1);
  console.log('----------------------------------------');
  console.log('ZIP        :', zipBytes, 'B  (' + pct + '% of 13 312 B budget, ' + (BUDGET - zipBytes) + ' B free)');
  if (zipBytes > BUDGET) console.error('  ⚠ OVER BUDGET');
}
