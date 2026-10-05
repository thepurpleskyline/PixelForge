// Sanity-audit rendered PNGs: non-black pixel ratio + dominant colors.
// Skips cleanly when the optional `canvas` package is not installed.
const fs = require('fs');
let createCanvas, loadImage;
try { ({ createCanvas, loadImage } = require('canvas')); }
catch (e) { console.log('node-canvas not installed — skipping pixel audit (logic tests still ran).'); process.exit(0); }
(async () => {
  for (const f of ['pacman-title.png', 'pacman-shot.png']) {
    const img = await loadImage(process.env.PACMAN_SHOT_DIR + '/' + f);
    const c = createCanvas(560, 640);
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, 560, 640).data;
    let nonBlack = 0;
    const colors = {};
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (r + g + b > 30) nonBlack++;
      const key = (r >> 5) << 10 | (g >> 5) << 5 | (b >> 5);
      colors[key] = (colors[key] || 0) + 1;
    }
    const top = Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k, n]) => `rgb(${((k >> 10) & 7) * 32 + 16},${((k >> 5) & 7) * 32 + 16},${(k & 7) * 32 + 16})x${n}`)
      .join('  ');
    console.log(`${f}: nonBlack=${nonBlack}/${560 * 640} (${(100 * nonBlack / (560 * 640)).toFixed(1)}%)  ${top}`);
  }
})();
