// Renders media/art.html to the PNGs shipped with the entry (cover + icons).
// Not part of the 13 kB build — run it only when the artwork changes:
//   nvm use && node media/make.mjs
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const art = 'file://' + path.join(dir, 'art.html');
const chrome = ['google-chrome', 'chromium-browser', 'chromium']
  .find(c => { try { execFileSync('which', [c], { stdio: 'ignore' }); return true; } catch { return false; } });
if (!chrome) { console.error('no chrome/chromium found — install one to render the art'); process.exit(1); }

// [file, width, height, mode, max bytes] — the caps are the submission limits
const OUT = [
  ['cover-1280x720.png', 1280, 720, 'cover'],   // 16:9 master cover
  ['cover-1200x630.png', 1200, 630, 'cover'],   // social / OG card
  ['cover-800x500.png',   800, 500, 'cover', 256 * 1024],   // submission cover
  ['thumbnail-320x320.png', 320, 320, 'icon', 64 * 1024],   // submission thumbnail
  ['icon-512.png',        512, 512, 'icon'],
  ['icon-192.png',        192, 192, 'icon'],
  ['mark-512.png',        512, 512, 'mark'],   // simplified mark, readable when tiny
  ['apple-touch-icon.png',180, 180, 'mark'],
  ['favicon-32.png',       32,  32, 'mark'],
  ['favicon-16.png',       16,  16, 'mark'],
];

for (const [file, w, h, mode, cap] of OUT) {
  const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--virtual-time-budget=4000', '--dump-dom', `${art}?w=${w}&h=${h}&mode=${mode}`],
    { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
  const m = dom.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
  if (!m) { console.error(`${file}: the page did not return a PNG`); process.exit(1); }
  const out = path.join(dir, file);
  fs.writeFileSync(out, Buffer.from(m[1], 'base64'));
  console.log(file.padEnd(22), w + 'x' + h, fs.statSync(out).size, 'B');
  if (cap) {                                   // squeeze it under the submission cap
    try { execFileSync('python3', [path.join(dir, 'shrink.py'), out, String(cap)], { stdio: 'inherit' }); }
    catch { console.error(`  ${file}: could not shrink (needs python3 + Pillow)`); process.exitCode = 1; }
  }
}
