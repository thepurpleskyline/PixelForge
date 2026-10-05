// Maze validation: row lengths + BFS connectivity (with tunnel wrap)
// The maze is extracted from the real game source so the two can never drift.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../pac-man.html', 'utf8');
const m = html.match(/const MAZE = \[([\s\S]*?)\];/);
if (!m) { console.error('FAIL: could not locate MAZE in pac-man.html'); process.exit(1); }
// Each row is a quoted string possibly followed by a comma — pull the content between the quotes.
const MAZE = m[1].split('\n')
  .map(s => { const q = s.match(/"([^"]*)"/); return q ? q[1] : null; })
  .filter(s => s !== null);

const COLS = MAZE[0].length;
const ROWS = MAZE.length;
console.log("Dims:", COLS, "x", ROWS);

// check all rows same length
let ok = true;
MAZE.forEach((row, i) => {
  if (row.length !== COLS) { ok = false; console.log(`  row ${i} is ${row.length} (expected ${COLS})`); }
});
console.log("All rows equal width:", ok);

// grid: 0 walkable, 1 wall, 2 door
const grid = MAZE.map(row => row.split('').map(ch => ch === '#' ? 1 : ch === '-' ? 2 : 0));
const isTunnelRow = r => (MAZE[r][0] === ' ' && MAZE[r][COLS-1] === ' ');
const tunnelRows = [];
for (let r = 0; r < ROWS; r++) if (isTunnelRow(r)) tunnelRows.push(r);
console.log("Tunnel rows:", tunnelRows);

// count pellets
let pellets = 0, power = 0;
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const ch = MAZE[r][c];
  if (ch === '.') pellets++;
  if (ch === 'o' || ch === '?') power++;
}
console.log("Pellets:", pellets, " Power:", power, " Total:", pellets + power);

// find pac start (the center gap in the power-pellet row area) -> use row with the "  " gap
let pacStart = null;
for (let r = 0; r < ROWS; r++) {
  const idx = MAZE[r].indexOf("  ");
  if (idx >= 0 && pellets >= 0) { /* candidate */ }
}
// pac start: the row that has the 2-space center gap
for (let r = 0; r < ROWS; r++) {
  const idx = MAZE[r].indexOf("  ");
  if (idx >= 0) { pacStart = { c: idx + 1, r }; } // center of the gap
}
console.log("Pac start cell:", pacStart);

// BFS over walkable cells (door passable for ghosts; use door=walkable for connectivity test)
function walkable(c, r) { return grid[r][c] !== 1; } // walls block; door counts walkable
const seen = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
const q = [];
function push(c, r) {
  let nc = c;
  if (nc < 0 || nc >= COLS) { if (isTunnelRow(r)) nc = (nc + COLS) % COLS; else return; }
  if (r < 0 || r >= ROWS) return;
  if (seen[r][nc]) return;
  if (!walkable(nc, r)) return;
  seen[r][nc] = true; q.push([nc, r]);
}
push(pacStart.c, pacStart.r);
const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
while (q.length) {
  const [c, r] = q.shift();
  for (const [dx, dy] of dirs) push(c + dx, r + dy);
}
let unreachablePellets = 0;
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  if ((MAZE[r][c] === '.' || MAZE[r][c] === 'o' || MAZE[r][c] === '?') && !seen[r][c]) {
    unreachablePellets++;
    console.log(`  UNREACHABLE pellet at ${c},${r} (${MAZE[r][c]})`);
  }
}
console.log("Unreachable pellets:", unreachablePellets, unreachablePellets === 0 ? "✓ all reachable" : "✗ FIX NEEDED");

// print a visual grid
const SYM = { '#': '██', '.': '·', 'o': '◎', '-': '╪', ' ': ' ', '?': '?' };
console.log("\n" + MAZE.map(r => r.split('').map(ch => SYM[ch] || ch).join('')).join("\n"));
