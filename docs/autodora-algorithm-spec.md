# AutoDora (自走銅鑼) — Orb-Puzzle Solver Algorithm Spec

Source: https://doraheart.cutevisor.workers.dev/ (18-slide deck, "DoraHeart V2" solver engine)
This document is a full extraction/translation of every slide's content, including all pseudocode
shown, intended as an implementation reference for a coding agent. Where the original slides gave
qualitative descriptions rather than exact numeric constants, that is flagged explicitly — those
values will need to be chosen/tuned during implementation, they were not published on the page.

---

## 0. High-Level Summary

The engine solves a Puzzle-&-Dragons-style "orb drop" puzzle using **beam search**:

1. Simulate "pick up one orb, drag it along a path, swap orbs as you go."
2. At every step, expand each surviving candidate path into up to 7 children (one per direction,
   excluding immediate backtrack).
3. Score each candidate with a hand-written value function (`calculateWeight`).
4. Sort by score and prune to the top `resultsBufferSize` candidates (the "beam width").
5. Repeat for `maxPath` steps.
6. Return the single best final path: start point + direction sequence.

Conceptually this is closer to a chess engine (known rules + heuristic evaluation + tree search)
than to an LLM's probabilistic token continuation.

---

## 1. Problem Definition (Slide 01)

- **Board**: `rows × cols` array of orbs.
  - Base size: 6×5.
  - With "ToS" skill extensions, can expand up to 6×8.
  - `MAX_BOARD = 48` (i.e., max cells = 48, consistent with 6×8).
- **Cell encoding**: each cell is **1 byte**.
  - Low 5 bits = orb type/color.
  - High bits = flags (see §3.2 flag bits).
- **Orb types** (index : color):
  - 0 = Fire
  - 1 = Water
  - 2 = Wood
  - 3 = Light
  - 4 = Dark
  - 5 = Heart (recovery/heal orb)
- **Movement**: 8 directions, indices `0..7` (standard 8-directional: up/down/left/right + 4
  diagonals), defined by a `movePoint()` function.
- **Constraint**: cannot immediately reverse direction — i.e., next direction cannot equal
  `(currentDir + 4) % 8` (this is the "no immediate backtrack" rule).
- **Objective**: maximize combo count and a computed weighted score (`weight` / `finalweight`).

---

## 2. Core Algorithm Steps (Slides 02–09)

### Step 1 — Seed Generation (`solveBoard()`)

For every cell on the board (or a specific caller-supplied `initPoint`), create one initial
candidate state with that cell as the starting point (the orb "picked up"). Skip cells containing
a "weathered" orb (see §3.2) — they cannot be a starting point.

```
for y in rows: for x in cols:
  if isWeathered(x, y): continue
  seed = newCandidate(start = (x, y))
  pool.push(seed)   // each seed is expanded stepwise later
```

Example: a 30-cell board produces up to 30 seed candidates explored in parallel.

### Step 2 — State Expansion (`solveBoardStep()`)

For every surviving candidate state, spawn a copy per viable direction (up to 7, since the
immediate-reverse direction is excluded). `moveOrbInResult()` performs the orb swap and appends the
direction taken to the candidate's `path`.

```
for each survivingState s:
  for dir in 0..7:
    if cannotMove(dir) or isImmediateReverse(dir): continue
    childState = copy(s)
    swapOrb(childState, dir)
    score(childState)
    pool.push(childState)
```

### Step 3 — Combo Detection (`findCombos()`)

1. **Row scan**: scan each row left-to-right for 3+ consecutive same-color orbs; mark matches into
   a `resultBoard`.
2. **Column scan**: same, scanning columns top-to-bottom.
3. **Grouping**: run an explicit-stack flood fill over marked cells to merge orthogonally-connected
   same-color matched cells into a single combo group.
4. **Full-line detection**: while flood-filling, also detect whether a combo group spans an entire
   row or an entire column (feeds into the Row/Column-clear bonus mechanic, §4.1).

Marked/matched cells are candidates for removal; each group is tagged with a combo count.

### Step 4 — Clear & Chain (`findResult` loop)

After combos are found:
1. Set matched cells to empty.
2. Apply gravity — orbs fall to fill empty space below (`dropOrbInBoard`).
3. Re-scan (`findCombos`) — if the drop creates new matches, this forms a **chain**; repeat until
   no new combos are found.
4. The count from the *first* iteration of this loop is stored separately as `firstCombosCount`.

```
while true:
  c = findCombos(board)
  if c == 0: break
  removeMatches(board)
  dropOrbs(board)
  combosCount += c
```

### Step 5 — Scoring (`calculateWeight()`)

The most complex part of the engine. Converts one candidate solution into a live score `weight`
and a final score `finalweight`. Score is a sum of these components (exact numeric coefficients
were NOT published on the page except where noted — see the puzzle-shield tier table in §4.3,
which IS exact):

- **Base per-color weight × combo count** — each orb color has a configurable base weight;
  multiplied by how many combos of that color occurred.
- **Attack-type bonus**: bonuses for reaching 4/5/6/7/8/9-orb combos, and for the longest chain
  achieved.
- **Combo-count bonus**: `comboCount × 4` (this multiplier of 4 is stated explicitly on the slide).
- **Color-pattern bonus**: bonuses for 3-color / 4-color / 5-color combo patterns.
- **Special-orb adjustments**:
  - Weathered-orb clears and "priority" orbs → positive bonus.
  - "Reserved" orbs → negative penalty.
- Additional mechanic-specific terms are added in from §4 (row/column clear, weathering bonus,
  puzzle shield, fire path penalty) — these all feed into the same `weight`/`finalweight`
  accumulation, not separate systems.

### Step 6 — Pruning / Beam Width (`solveBoardStep`, continued)

After each expansion round, sort the candidate pool by `weight` using `qsort` (descending — highest
score first), then truncate the pool to the top `resultsBufferSize` entries. This "beam width" is
the single key parameter that bounds both time and memory cost, and is what makes the search
tractable.

```
if pool.size > bufferSize:
  qsort(pool, by = weight, descending)
  pool.size = bufferSize   // drop the tail
```

### Step 7 — Iteration Loop

Repeat: **expand → score → sort → prune** for `maxPath` total steps. Each round takes the surviving
beam, expands every state in up to 7 directions, scores each child with `calculateWeight`, sorts,
keeps only the top `resultsBufferSize` (beam width), and carries survivors into the next step.

### Step 8 — Final Output

Sort final candidates using `compareFinalResult`, with sort priority:
1. `finalweight` (descending, primary)
2. combo count (descending, tiebreak)
3. path length (tiebreak)

The top result is the answer. Returned to the caller (originally Java) as a `DoraResult` struct
containing:
- `mInitX`, `mInitY` — the starting point.
- `mDirs[]` — the sequence of directions to drag through.

---

## 3. Data Structures & Encoding

### 3.1 Board cell (1 byte per cell)
- Bits 0–4 (low 5 bits): orb type (0=Fire, 1=Water, 2=Wood, 3=Light, 4=Dark, 5=Heart — needs only
  3 bits actually, but 5 bits reserved per spec language; implement as you see fit as long as type
  and flags are packed into a single byte).
- Bits 5–7 (high bits): flags — 3 flag bits mentioned: **priority**, **weathered**
  (`ORB_FLAG_WEATHERING`), **reserved**.

### 3.2 Orb flags
- `ORB_FLAG_WEATHERING` — marks a "weathered" orb (see §4.2).
- Priority flag — orb marked as priority (contributes positive scoring bonus).
- Reserved flag — orb marked as reserved (contributes negative scoring penalty).

### 3.3 Result / candidate structs
- `SODoraResult` — lightweight "handle" struct containing a pointer/index (`data`) into the actual
  result data. This is what gets sorted by `qsort`, to avoid moving large structs during sorting.
- `SODoraResultData` — the heavier struct (described as "200+ bytes") holding full candidate state
  (board copy, path, weight, flags, etc.). Stays in a pool, unmoved; only the lightweight handles
  are reordered — effectively an index-based sort.
- `SODynamicArray` — a reusable dynamic array/memory pool allocated once per run and reused across
  the whole solve. `cleanDynamicArray` resets it via `memset` + relinking pointers rather than
  `free`, so the hot loop performs zero `malloc`/`free` calls.

### 3.4 Key parameters
- `rows`, `cols` — board dimensions (6×5 up to 6×8; `MAX_BOARD = 48` cells max).
- `maxPath` — number of expansion iterations (steps the dragged orb travels). Default shown in the
  interactive demo: **30**.
- `resultsBufferSize` — beam width (max candidates kept after each prune). Default shown in the
  interactive demo: **450**.
- `initPoint` — optional caller-specified fixed starting cell (otherwise all cells are seeded).
- `maxHurtCount` — threshold for the fire-path mechanic (see §4.4).
- `firePathSize` — decay/reset value used for fire-path trail marking.
- `W_EXTRA` — a weighting constant used in the weathering-orb bonus formula (exact value not
  published; see §4.2).

---

## 4. Special Mechanics (Slides 10–13)

These are not separate systems — each folds directly into `calculateWeight`'s score accumulation
and/or into which cells can be a valid start/path point.

### 4.1 Row / Column Clear Bonus

Some levels reward clearing an entire row or column in one combo.

- During flood fill (Step 3 / `findCombos`), additionally check whether a combo group spans an
  entire row or an entire column.
- Tag matches with `COMBO_FLAG_ROW` or `COMBO_FLAG_COL`.
- Scoring adds extra weight for these:
  - **Row mode** (`hasRowMode`): a full row of one color gives a large bonus; when row-clear mode
    is active, seeding is restricted to only that specific orb type as valid starting points.
  - **Column mode** (`columnMode[j]`): a specific target column must be filled with one uniform
    color; each additional matching orb in that column multiplies the bonus by **×12**.

### 4.2 Weathered Orbs

- Flag: `ORB_FLAG_WEATHERING`.
- **Restriction**: a weathered orb cannot be a start point, and cannot be a destination cell for a
  move (i.e. it blocks the drag path — you cannot move another orb into its cell).
- Both seeding (Step 1) and expansion (Step 2) skip/exclude weathered cells accordingly.
- **Bonus**: if a weathered orb ends up cleared as part of a combo/chain, increment
  `weatheringCount`, and add a scoring bonus of `weatheringCount × W_EXTRA × 2`.
- Net effect: this incentivizes the search to "detour" toward clearing weathered orbs even though
  they obstruct movement.

### 4.3 Puzzle Shield

- Level mechanic: specific target cells (`puzzleshield[]` array) must be covered by orbs of a
  **single uniform color**.
- `calculateWeight` counts, among the puzzle-shield cells, the largest count of any single color
  present, and applies a tiered bonus based on coverage. **This tier table is given explicitly on
  the slide (exact values):**

| Coverage (# same-color cells in shield) | Bonus |
|---|---|
| Full coverage | ×28 multiplier → stated as **+280** |
| 6 cells | +120 |
| 5 cells | +100 |
| 4 cells | +80 |
| 3 cells | +60 |
| 2 cells | +40 |

(Note: "full coverage" bonus is described both as a ×28 multiplier and as a flat +280 in the
source — treat +280 as the realized value for a full-coverage puzzle shield of the size shown in
the example; scale the ×28 multiplier if your puzzle-shield cell count differs.)

### 4.4 Fire Path

- Mechanic: while dragging, every cell the drag path passes over leaves a "fire" trail, tracked in
  `usedboard`.
- If the path re-enters (steps on) a cell whose fire trail hasn't yet faded, increment
  `hurtcount`.
- Setting a cell's trail: `usedboard[pos] = firePathSize` when stepped on.
- Each subsequent step, the entire board's trail values decay by `-1` (fading over time/steps).
- If `hurtcount` exceeds `maxHurtCount`, that candidate's weight is force-set to **-50**
  (effectively discarding/invalidating the solution — a hard penalty rather than a soft one).

```
if usedboard[pos] > 0: hurtcount++    // stepped on an unfaded trail
usedboard[pos] = firePathSize
// every step: decay entire board's trail values by -1
if hurtcount > maxHurtCount: weight = -50
```

---

## 5. Implementation / Performance Constraints (Slide 14)

This was originally built for old, low-RAM/low-CPU phones needing real-time solving. Design
choices driven by that constraint (worth replicating for performance parity, though not
functionally required for correctness):

1. **Memory pool reuse**: `SODynamicArray` allocated once and reused for the entire solve run.
   `cleanDynamicArray` does NOT free memory — it `memset`s and relinks pointers. The hot
   expand/score/prune loop performs **zero** `malloc`/`free` calls.
2. **Bit-packing**: one `char`/byte per board cell — low 5 bits = orb type, high 3 bits = flags
   (priority / weathered / reserved). Keeps the whole board extremely compact.
3. **Sorting lightweight handles**: `qsort` operates on small handle structs (`SODoraResult`,
   containing just a pointer/index into the data), not on the full ~200+-byte
   `SODoraResultData` structs — this is effectively an index/handle sort rather than sorting large
   data directly.
4. **Hard cap doubles as pruning**: `resultsBufferSize` bounds both time and space simultaneously.
   Flood fill is implemented with an explicit stack (not recursion, to avoid stack-depth issues on
   constrained devices). Struct copies use bulk `memcpy`.

---

## 6. Turbo Mode Variant (Slide 15)

An alternate mode (function `dora_solve`) that ignores color-balance strategy and just tries to
maximize raw combo count:

1. Flatten all orb color weights to `1` (uniform) initially.
2. Estimate the theoretical maximum number of combos achievable on the current board.
3. Iteratively pick a color, set its weight higher (e.g., **10** as shown in the pseudocode) than
   the rest, and re-run the solve.
4. Repeat, cycling through colors, until the result reaches (or gets close to) the estimated
   theoretical max combo count, or all colors have been tried.

```
do:
  solveBoard(board)
  if reachedMaxCombos: break
  // pick a different color, set it to a high weight, retry
  weights[cnt].weight = 10
while cnt <= 6
```

Note: `cnt <= 6` suggests iterating across up to 7 indices — likely the 6 orb colors (0–5) plus
one extra slot/sentinel; confirm against actual color count (6) when implementing.

---

## 7. Interactive Simulator — Reference Default Parameters (Slide 16)

The live demo on the page exposes these as configurable parameters, useful as sane defaults if
none are otherwise specified:

- **Move mode**: 8-directional (diagonals included) by default; toggle to 4-directional (up/down/
  left/right only, no diagonals).
- **Row-clear mode**: toggle, "entire row same color, prioritized."
- **Column-clear mode**: toggle, "entire column same color, bonus weighted."
- **Fire-path mode**: toggle, "penalize re-treading your own trail."
- **Skyfall simulation**: toggle for new-orb-drop-in animation after clears (stated as
  animation-only, not affecting scoring/solving logic).
- **maxPath (steps)**: default **30**.
- **Beam width (`resultsBufferSize`)**: default **450**.
- **Animation speed**: normal (cosmetic only).
- **Board size options**: 6×5 (base), 6×6, 6×7, 6×8 (extended).
- **Color-count modes**: normal (6 colors), 3-color, 4-color, 5-color restricted modes.

The demo's output readouts: combo count, weight, path length, solve time.

---

## 8. Summary / Design Philosophy (Slide 17)

- **Beam search**: expand → score → prune, iterated for `maxPath` steps.
- **Hand-written value function**: `calculateWeight` encodes all domain knowledge into the scoring
  function (as opposed to a learned evaluator).
- **Exact simulator**: `findCombos` + gravity drop precisely reproduces the actual game's clear/
  chain rules — the search operates over a perfectly accurate forward model, not an approximation.
- **Five special mechanics** (row/column clear, weathered orbs, puzzle shield, fire path, and the
  base color/combo scoring) all feed into the *same* single scoring-and-pruning system rather than
  being handled as separate subsystems.
- Design is pervasively shaped by **memory and speed constraints** of the era (old low-end phones).
- Philosophically framed as closer to a **chess engine** (known/deterministic rules + heuristic
  evaluation + tree search) than to an LLM's probabilistic next-token generation — with a nod to
  how modern "reasoning" LLMs are reintroducing explicit search on top of neural evaluators.

---

## 9. Gaps / Things Left Unspecified on the Source Page

Flag these clearly to whoever implements this — they are not given exact values in the source and
will require either reverse-engineering from actual game behavior, or reasonable default choices:

- Exact per-color base weights used in `calculateWeight`.
- Exact bonus magnitudes for 4/5/6/7/8/9-combo "attack-type" bonuses and "longest chain" bonus.
- Exact bonus magnitudes for 3/4/5-color pattern bonuses.
- Exact magnitude of the "priority" orb bonus and "reserved" orb penalty.
- Exact value of `W_EXTRA` (weathering bonus constant).
- Exact row-clear (`hasRowMode`) bonus magnitude (column-clear multiplier of ×12 IS given).
- Exact `maxHurtCount` default value (only the effect — force weight to -50 — is given).
- Exact `movePoint()` direction-index-to-offset mapping (standard 8-directional assumed: this is
  conventional enough that any standard 8-dir offset table should work, e.g. dir 0=N going
  clockwise, but the source doesn't pin down the exact indexing convention).

Everything else in this document (algorithm structure, data layout, control flow, all pseudocode,
puzzle-shield tier table, column-clear ×12 multiplier, combo-count ×4 multiplier, default
maxPath=30/beamWidth=450, fire-path -50 penalty rule) is stated explicitly in the source and can be
implemented as-is.
