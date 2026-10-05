# PAC-MAN

A classic PAC-MAN clone in a single HTML file. No dependencies, no assets — everything (maze, sprites, audio) is drawn and synthesized at runtime.

[![screenshot](docs/title.png)](docs/title.png)

## Play

Just open [`pac-man.html`](pac-man.html) in any modern browser. That's it.

- **Arrows / WASD** — move
- **P** — pause (also pauses automatically on window blur)
- **M** — mute / unmute (saved in localStorage)
- **Swipe** — move on mobile

Your high score persists in `localStorage`.

## Features

- Authentic 28×29 maze (246 dots, validated reachable by BFS)
- Four ghosts with the original AI personalities:
  - **Blinky** (red) — chases your exact position
  - **Pinky** (pink) — ambushes 4 tiles ahead of your heading
  - **Inky** (cyan) — flanks using Blinky as a lever
  - **Clyde** (orange) — chases until close, then retreats home
- Chase / scatter cycles, ghost-house release stagger (0s / 4s / 8s / 13s)
- Power pellets with escalating combo (200 → 400 → 800 → 1600), eyes return home, ghosts revive
- Bonus fruit at 70 and 170 dots, tunnel with its speed penalty
- Lives, level progression with speed-up, full death / game-over / reset lifecycle
- WebAudio retro sound effects — waka-waka, power-up, ghost-eat, death jingle

## Tests

The game logic is pure JS and runs headless in Node. The suite in [`tests/`](tests/)
boots the real game code in a `vm` sandbox with a fake canvas, then:

- `maze-test.js` — validates the maze geometry (uniform rows, tunnel rows, pellet counts, BFS reachability of every dot)
- `sim-test.js` — full lifecycle: title → ready → run → death → game over → reset, every ghost state machine, tunnel wrapping, 200s of simulated play
- `house-test.js` — verifies the classic ghost-house release stagger

```bash
cd tests && npm install   # node-canvas for pixel-level render audits
node maze-test.js && node sim-test.js && node house-test.js
```

## How it works

The whole game fits in one file (`pac-man.html`, ~850 lines):

- **Movement** — actors walk cell-centre to cell-centre; direction changes buffer until the next cell centre and snap when aligned, so turning feels crisp.
- **Ghosts** — at each cell centre a ghost picks the walkable direction (no reversing) minimising distance to its personality target; in fright mode it picks randomly.
- **Rendering** — the maze is pre-baked into wall-outline segments (blue, flashing white on level clear) so drawing is one stroke path per frame.

## License

MIT — see [LICENSE](LICENSE).
