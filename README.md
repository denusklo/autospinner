# TOS Auto Spinner

A Chrome (Manifest V3) extension that plays the Tower of Saviors orb-spinning simulator at
<https://louisalflame.github.io/TOSwebsite/canvas.html> automatically: it reads the 6×5 board
from canvas pixels, solves it with a cascade-aware beam search (`DoraSolver`, ported from the
AutoDora / DoraHeart V2 spec), and executes the drag with synthesized mouse events.

Vanilla JS. No build step, no dependencies.

## Install

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select this folder (`C:\Projects\autospinner`)
4. Navigate to the simulator page — a floating control panel appears in the top-right corner

(Icons are already included. If you ever need to regenerate them, open `generate-icons.html`.)

## Use

1. On the simulator page, click **Max Combo Spin** in the control panel
2. The solver runs (~0.2 s), then drags the orb along the computed path
3. Diagnostics go to the DevTools console as single-line `[TOS] KEY=value` entries
   (`BOARD`, `SOLUTION`, `PATH`, `RESULT`) — when reporting a problem, paste only those lines

Tip: keep DevTools **undocked** (DevTools ⋮ menu → Dock side → separate window); docked
DevTools resizes the viewport and the simulator's canvas may blank out on resize.

## Files

| File | Purpose |
|---|---|
| `algorithm.js` | Pure solving logic (Board, BoardSimulator, DoraSolver + legacy solvers) — runs under Node |
| `content.js` | Browser side: board reading, drag execution, control panel |
| `popup.html` / `popup.js` | Extension popup |
| `verify.js` | Regression suite: `node verify.js` (must pass before shipping algorithm changes) |
| `docs/autodora-algorithm-spec.md` | Algorithm reference (beam search spec the solver was ported from) |
| `test-algorithm.html` | Manual in-browser algorithm playground |

## Developing

Developer rules, verified project facts, and workflow docs live in `CLAUDE.md` and
`.claude/harness/` — start there. The one-line version: run `node verify.js` after touching
`algorithm.js`, and never trust a board fact you haven't checked against
`.claude/harness/PROJECT-FACTS.md`.
