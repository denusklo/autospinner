// Regression + verification suite for algorithm.js (run: `node verify.js`)
// This is the canonical check required by CLAUDE.md R2 before shipping any
// algorithm.js change. Exit code 0 = all pass.
const {Board, MatchFinder, ComboMaximizer, BeamSearchSolver, BoardSimulator, DoraSolver, TargetPlanner, solveMaxFirstCombos, CELL_FLAGS} =
  require('./algorithm.js');

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  if (!ok) failures++;
}
function mk(rows) { const b = new Board(); b.fromArray(rows); return b; }

// --- BoardSimulator: exact forward model ---

// U1: a run of 4 is ONE combo. (Legacy MatchFinder double-counts it — known
// defect, kept for backward compat; BoardSimulator is the source of truth.)
const run4 = mk([
  [0,0,0,0,1,2],
  [3,4,5,1,2,3],
  [4,5,1,2,3,4],
  [5,1,2,3,4,5],
  [1,2,3,4,5,1],
]);
check('U1 run-of-4 = 1 group', BoardSimulator.findComboGroups(run4).length, 1);
check('U1 legacy MatchFinder overcounts (documents defect)', new MatchFinder(run4).findMatches().length, 2);

// U2: L-shaped connected match merges into ONE 5-cell combo via flood fill
const lshape = mk([
  [0,1,2,3,4,5],
  [0,2,3,4,5,1],
  [0,0,0,4,1,2],
  [5,1,2,3,4,5],
  [1,2,3,4,5,1],
]);
const lg = BoardSimulator.findComboGroups(lshape);
check('U2 L-shape group count', lg.length, 1);
check('U2 L-shape cell count', lg[0].cells.length, 5);

// U3a: single clear, no cascade
const single = mk([
  [2,1,3,4,5,1],
  [2,3,4,5,1,3],
  [1,4,5,1,3,4],
  [2,5,1,3,4,5],
  [0,0,0,3,5,4],
]);
check('U3a totalCombos', BoardSimulator.resolve(single).totalCombos, 1);
check('U3a chains', BoardSimulator.resolve(single).chains, 1);

// U3b: engineered cascade. Note for future test authors: gravity moves each
// column independently, so a post-fall horizontal line requires columns to
// drop by DIFFERENT amounts — build cascades with an L-shaped first clear.
// Wave 1: horizontal 0s at (0..2,4) + vertical 0s at (2,2..4) merge into one
// 5-cell combo. Columns then drop 1,1,3 cells; the three 4s land on row 4.
const cascade = mk([
  [1,2,3,3,1,2],
  [2,3,4,5,2,3],
  [5,1,0,1,3,4],
  [4,4,0,2,4,5],
  [0,0,0,3,5,1],
]);
const cr = BoardSimulator.resolve(cascade);
check('U3b cascade totalCombos', cr.totalCombos, 2);
check('U3b chains', cr.chains, 2);
check('U3b wave-1 group is merged L (5 cells)', cr.groups[0].cells.length, 5);

// U4: resolve() must not mutate its input
const before = JSON.stringify(cascade.grid);
BoardSimulator.resolve(cascade);
check('U4 input board untouched', JSON.stringify(cascade.grid) === before, true);

// --- DoraSolver: solution well-formedness on fixed boards ---
const BOARDS = [
  [[0,1,2,3,4,5],[1,2,3,4,5,0],[2,3,4,5,0,1],[3,4,5,0,1,2],[4,5,0,1,2,3]],
  [[0,0,1,1,2,2],[3,3,4,4,5,5],[0,1,0,1,2,3],[2,2,3,3,4,4],[5,5,0,0,1,1]],
  [[5,1,5,2,0,2],[1,5,1,0,2,0],[5,1,3,2,0,4],[3,4,3,4,3,4],[4,3,4,3,4,3]],
  [[0,2,4,0,2,4],[2,4,0,2,4,0],[4,0,2,4,0,2],[0,2,4,0,2,4],[2,4,0,2,4,0]],
  [[1,1,2,3,3,0],[2,5,3,1,0,4],[1,2,5,0,4,3],[5,3,0,4,2,1],[3,0,4,2,1,5]],
];

let oldTotal = 0, newTotal = 0;
for (let i = 0; i < BOARDS.length; i++) {
  const base = mk(BOARDS[i]);
  const sol = new DoraSolver(base, {beamWidth: 200, maxPath: 30}).solve();

  // Well-formedness
  const p = sol.path;
  let wellFormed = p[0].x === sol.startX && p[0].y === sol.startY
    && sol.moves.length === p.length - 1;
  for (let j = 1; j < p.length; j++) {
    const d = Math.abs(p[j].x - p[j - 1].x) + Math.abs(p[j].y - p[j - 1].y);
    if (d !== 1) wellFormed = false; // 4-dir mode: every step is one cell
  }
  check(`board#${i + 1} solution well-formed`, wellFormed, true);
  check(`board#${i + 1} comboCount matches independent resolve`,
    BoardSimulator.resolve(sol.board).totalCombos, sol.comboCount);
  newTotal += sol.comboCount;

  // Legacy pipeline for comparison (deterministic path: target + beam)
  const target = new ComboMaximizer(base).generateTargetBoard();
  const oldSol = new BeamSearchSolver(base, 30, 40, false).solve(target);
  oldTotal += oldSol.board ? BoardSimulator.resolve(oldSol.board).totalCombos : 0;
}
console.log(`A/B cascade-aware combos: legacy=${oldTotal} DoraSolver=${newTotal}`);
check('A/B DoraSolver >= legacy pipeline', newTotal >= oldTotal, true);

// --- Sealed columns (real-game special mode, PROJECT-FACTS P6/P9): runes in
// sealed columns can be dragged but never dissolve ---

// S1: run of 3 spanning col 0 clears normally; sealing col 0 leaves a pair -> nothing clears
const sealA = mk([
  [0,0,0,1,2,3],
  [1,2,3,4,5,0],
  [2,3,4,5,0,1],
  [3,4,5,0,1,2],
  [4,5,0,1,2,3],
]);
check('S1 unsealed baseline clears', BoardSimulator.resolve(sealA).totalCombos, 1);
check('S1 sealed col 0 blocks the group', BoardSimulator.resolve(sealA, {sealedColumns: [0]}).totalCombos, 0);

// S2: a group fully inside cols 1-4 still clears when 0 and 5 are sealed
const sealB = mk([
  [1,0,0,0,2,3],
  [2,3,4,5,1,0],
  [3,4,5,1,2,4],
  [4,5,1,2,3,5],
  [5,1,2,3,4,1],
]);
check('S2 inner group clears under seal', BoardSimulator.resolve(sealB, {sealedColumns: [0, 5]}).totalCombos, 1);
check('S2 same board unsealed identical', BoardSimulator.resolve(sealB).totalCombos, 1);

// S3: DoraSolver under seal stays self-consistent and never clears sealed cells
const sealSol = new DoraSolver(mk(BOARDS[1]), {beamWidth: 100, maxPath: 20, sealedColumns: [0, 5]}).solve();
const sealSim = BoardSimulator.resolve(sealSol.board, {sealedColumns: [0, 5]});
check('S3 comboCount consistent under seal', sealSim.totalCombos, sealSol.comboCount);
check('S3 no cleared cell in sealed columns',
  sealSim.groups.every(g => g.cells.every(([x]) => x !== 0 && x !== 5)), true);

// --- Per-cell CELL_FLAGS: general board-effect constraints, composable with
// sealedColumns (future-proofing for combined effects) ---

const emptyFlags = () => Array.from({length: 5}, () => Array(6).fill(0));

// S4: per-cell NO_DISSOLVE breaks the same run S1 tested column-sealing on
const f4 = emptyFlags();
f4[0][0] = CELL_FLAGS.NO_DISSOLVE;
check('S4 per-cell NO_DISSOLVE blocks the group', BoardSimulator.resolve(sealA, {flags: f4}).totalCombos, 0);

// S5: NO_PICKUP+NO_SWAP (frozen rune) — solver never starts on it or enters it
const f5 = emptyFlags();
f5[2][3] = CELL_FLAGS.NO_PICKUP | CELL_FLAGS.NO_SWAP;
const frozenSol = new DoraSolver(mk(BOARDS[2]), {beamWidth: 100, maxPath: 20, flags: f5}).solve();
check('S5 path avoids frozen cell (3,2)', frozenSol.path.every(p => !(p.x === 3 && p.y === 2)), true);
check('S5 still finds combos around it', frozenSol.comboCount > 0, true);

// S6: combination — sealed cols 0,5 AND a frozen cell AND a per-cell no-dissolve
const f6 = emptyFlags();
f6[1][2] = CELL_FLAGS.NO_PICKUP | CELL_FLAGS.NO_SWAP;
f6[3][3] = CELL_FLAGS.NO_DISSOLVE;
const comboSol = new DoraSolver(mk(BOARDS[1]), {beamWidth: 100, maxPath: 20, sealedColumns: [0, 5], flags: f6}).solve();
const comboSim = BoardSimulator.resolve(comboSol.board, {sealedColumns: [0, 5], flags: f6});
check('S6 combined constraints: comboCount consistent', comboSim.totalCombos, comboSol.comboCount);
check('S6 combined constraints: path avoids frozen cell (2,1)', comboSol.path.every(p => !(p.x === 2 && p.y === 1)), true);
check('S6 combined constraints: no cleared cell sealed or no-dissolve',
  comboSim.groups.every(g => g.cells.every(([x, y]) => x !== 0 && x !== 5 && !(x === 3 && y === 3))), true);

// --- minFirstCombos: steer the beam toward a FIRST-wave combo target ---

// S7: on BOARDS[4] the weight-optimal solution has only 3 first-wave combos;
// with minFirstCombos=4 the solver must return a qualifying path instead
// (accepting a small weight trade-off).
const b5base = new DoraSolver(mk(BOARDS[4]), {beamWidth: 200, maxPath: 30}).solve();
check('S7 baseline first-wave combos (documents the trade-off)', b5base.firstCombos, 3);
const b5min = new DoraSolver(mk(BOARDS[4]), {beamWidth: 200, maxPath: 30, minFirstCombos: 4}).solve();
check('S7 steered solution meets first-combo target', b5min.firstCombos >= 4, true);
check('S7 steered firstCombos consistent with independent resolve',
  BoardSimulator.resolve(b5min.board).firstCombos, b5min.firstCombos);
let s7wf = b5min.path[0].x === b5min.startX && b5min.path[0].y === b5min.startY
  && b5min.moves.length === b5min.path.length - 1;
for (let j = 1; j < b5min.path.length; j++) {
  const d = Math.abs(b5min.path[j].x - b5min.path[j - 1].x) + Math.abs(b5min.path[j].y - b5min.path[j - 1].y);
  if (d !== 1) s7wf = false;
}
check('S7 steered solution well-formed', s7wf, true);

// --- Beam dedup + pair steering (search-quality upgrades) ---

// S8: dedup keeps the search deterministic — identical runs, identical output
const s8a = new DoraSolver(mk(BOARDS[2]), {beamWidth: 100, maxPath: 20}).solve();
const s8b = new DoraSolver(mk(BOARDS[2]), {beamWidth: 100, maxPath: 20}).solve();
check('S8 deterministic across runs', JSON.stringify(s8a.path), JSON.stringify(s8b.path));
check('S8 pairPotential counts pairs (sealA row0 pair after sealing col 0)',
  new DoraSolver(sealA, {sealedColumns: [0]}).pairPotential(sealA) >= 1, true);

// --- TargetPlanner: near-guaranteed first-wave targets (PROJECT-FACTS P10) ---

// S9: a real board (live 2026-07-07) where DoraSolver@beam800 found only
// first=2 — the planner must construct first=5, and prove N=7 impossible
// (7 triples need 21 cells; only 20 are resolvable with cols 0,5 sealed).
const hardBoard = mk([
  [4,0,5,2,5,2],
  [4,4,1,1,0,4],
  [2,2,5,5,1,1],
  [4,3,0,4,1,1],
  [2,1,3,2,0,2],
]);
const tp5 = new TargetPlanner(hardBoard, {sealedColumns: [0, 5], minFirstCombos: 5}).solve();
check('S9 planner reaches first=5 where beam search failed', tp5.reason, 'ok');
check('S9 planner solution verifies independently',
  BoardSimulator.resolve(tp5.solution.board, {sealedColumns: [0, 5]}).firstCombos >= 5, true);
let s9wf = tp5.solution.path[0].x === tp5.solution.startX && tp5.solution.path[0].y === tp5.solution.startY
  && tp5.solution.moves.length === tp5.solution.path.length - 1;
for (let j = 1; j < tp5.solution.path.length; j++) {
  const d = Math.abs(tp5.solution.path[j].x - tp5.solution.path[j - 1].x)
    + Math.abs(tp5.solution.path[j].y - tp5.solution.path[j - 1].y);
  if (d !== 1) s9wf = false;
}
check('S9 planner path well-formed', s9wf, true);
check('S9 planner proves N=7 infeasible in 20 cells',
  new TargetPlanner(hardBoard, {sealedColumns: [0, 5], minFirstCombos: 7}).solve().reason, 'no-feasible-target');

// --- Exact-N mode (combo shields: extra combos harmful) ---

const ex4 = new TargetPlanner(hardBoard, {sealedColumns: [0, 5], minFirstCombos: 4, exact: true}).solve();
check('S11 planner exact-4 hits exactly 4', ex4.reason === 'ok'
  && BoardSimulator.resolve(ex4.solution.board, {sealedColumns: [0, 5]}).firstCombos === 4, true);
const dex3 = new DoraSolver(hardBoard, {sealedColumns: [0, 5], beamWidth: 200, maxPath: 30, minFirstCombos: 3, exactFirstCombos: true}).solve();
check('S11 DoraSolver exact-3 hits exactly 3', dex3.firstCombos, 3);

// --- Router v2 (group-aware scoring + assignment potential): 7 first-wave
// groups routable on a live board where router v1 failed at beam 1600 ---
const seven = mk([
  [1,1,0,3,5,0],
  [0,0,1,3,4,4],
  [5,4,4,2,5,5],
  [5,1,1,4,0,2],
  [4,3,2,3,1,5],
]);
const r7min = new TargetPlanner(seven, {minFirstCombos: 7, beamWidth: 1000, maxPath: 120, maxTargets: 6}).solve();
check('S12 router v2 constructs 7+ first-wave combos', r7min.reason, 'ok');
check('S12 honest (independent resolve)', BoardSimulator.resolve(r7min.solution.board).firstCombos >= 7, true);

// --- First-wave RUNE count (楊玉環 "NUM N": clear >= N runes first batch) ---

// S14: BoardSimulator reports firstRunes = orbs dissolved in wave 1
const fr = BoardSimulator.resolve(run4); // run-of-4 in row 0 => 4 runes, 1 combo
check('S14 firstRunes counts wave-1 orbs', fr.firstRunes, 4);
check('S14 firstCombos still counts groups', fr.firstCombos, 1);

// S15: DoraSolver can target a first-wave rune count; solution meets it and
// is honest against an independent resolve
const runeSol = new DoraSolver(mk(BOARDS[2]), {beamWidth: 200, maxPath: 30, minFirstRunes: 9}).solve();
check('S15 solution meets first-rune target', runeSol.firstRunes >= 9, true);
check('S15 firstRunes consistent with independent resolve',
  BoardSimulator.resolve(runeSol.board).firstRunes, runeSol.firstRunes);

// S16: exact rune mode — firstRunes must EQUAL the target (overshoot rejected)
const exactRunes = new DoraSolver(mk(BOARDS[2]), {beamWidth: 200, maxPath: 30, minFirstRunes: 12, exactFirstRunes: true}).solve();
check('S16 exact rune target hit precisely', exactRunes.firstRunes, 12);
check('S16 exact honest (independent resolve)', BoardSimulator.resolve(exactRunes.board).firstRunes, 12);

// --- Clear-all-of-type (boss "首批消除所有X符石"): every rune of the listed
// type(s) must dissolve in the FIRST wave. STRICT about sealed columns /
// NO_DISSOLVE cells: required runes there must be dragged OUT and dissolved;
// parking a required rune into one never satisfies the demand ---

// C1: BoardSimulator reports per-type wave-1 counts (cascade waves excluded)
check('C1 firstClearedByType counts wave-1 orbs by type',
  BoardSimulator.resolve(run4).firstClearedByType, [4,0,0,0,0,0]);
check('C1 cascade wave-2 orbs not counted',
  BoardSimulator.resolve(cascade).firstClearedByType, [5,0,0,0,0,0]);

// C2: single type — board with hearts (0,0),(0,1),(1,2): all 3 must go wave 1
const caBoard = mk([
  [5,2,1,3,4,1],
  [5,1,2,0,3,2],
  [1,5,3,0,4,3],
  [2,3,4,1,0,2],
  [4,1,2,3,2,4],
]);
check('C2 board is stable (no free matches)', BoardSimulator.resolve(caBoard).totalCombos, 0);
const ca2 = new DoraSolver(caBoard, {beamWidth: 200, maxPath: 20, clearTypes: [5]}).solve();
check('C2 first wave clears ALL hearts', ca2.firstClearedByType[5], 3);
check('C2 honest (independent resolve)',
  BoardSimulator.resolve(ca2.board).firstClearedByType[5], 3);

// C3: multiple types — all hearts AND all waters (3 each) in the first wave
const ca3 = new DoraSolver(caBoard, {beamWidth: 300, maxPath: 25, clearTypes: [5, 0]}).solve();
check('C3 first wave clears ALL hearts and ALL waters',
  [ca3.firstClearedByType[5], ca3.firstClearedByType[0]], [3, 3]);
const ca3sim = BoardSimulator.resolve(ca3.board);
check('C3 honest (independent resolve)',
  [ca3sim.firstClearedByType[5], ca3sim.firstClearedByType[0]], [3, 3]);

// C4: thorn-fenced column — a required heart sits IN sealed col 0 at (0,2);
// the solver must drag it out and dissolve all 3 hearts, clearing nothing
// inside the sealed column
const caSealed = mk([
  [0,1,2,3,4,0],
  [1,2,5,0,1,2],
  [5,3,1,2,3,4],
  [1,0,5,4,0,1],
  [2,4,1,0,2,3],
]);
check('C4 board is stable under seal', BoardSimulator.resolve(caSealed, {sealedColumns: [0]}).totalCombos, 0);
const ca4 = new DoraSolver(caSealed, {beamWidth: 200, maxPath: 12, sealedColumns: [0], clearTypes: [5]}).solve();
const ca4sim = BoardSimulator.resolve(ca4.board, {sealedColumns: [0]});
check('C4 sealed heart extracted and all hearts cleared wave 1', ca4sim.firstClearedByType[5], 3);
check('C4 nothing dissolved inside the sealed column',
  ca4sim.groups.every(g => g.cells.every(([x]) => x !== 0)), true);
let ca4wf = ca4.path[0].x === ca4.startX && ca4.path[0].y === ca4.startY
  && ca4.moves.length === ca4.path.length - 1;
for (let j = 1; j < ca4.path.length; j++) {
  const d = Math.abs(ca4.path[j].x - ca4.path[j - 1].x) + Math.abs(ca4.path[j].y - ca4.path[j - 1].y);
  if (d !== 1) ca4wf = false;
}
check('C4 extraction path well-formed', ca4wf, true);

// C5: provably infeasible — only 2 hearts exist (a group needs 3), so no
// solution can qualify; the returned fallback must show hearts UNCLEARED
// (the CLI abort gate keys on cleared < total)
const caTwo = mk([
  [5,2,1,3,4,1],
  [4,1,2,0,3,2],
  [1,5,3,0,4,3],
  [2,3,4,1,0,2],
  [4,1,2,3,2,4],
]);
const ca5 = new DoraSolver(caTwo, {beamWidth: 100, maxPath: 12, clearTypes: [5]}).solve();
check('C5 2-heart demand cannot be met (cleared stays 0 of 2)', ca5.firstClearedByType[5], 0);

// C6: composes with start pinning — pinned seed honored AND all hearts cleared
const ca6 = new DoraSolver(caBoard, {beamWidth: 300, maxPath: 20, clearTypes: [5], startCells: [{x: 1, y: 2}]}).solve();
check('C6 start pin honored under clear-all', [ca6.startX, ca6.startY], [1, 2]);
check('C6 all hearts still cleared wave 1', ca6.firstClearedByType[5], 3);

// --- Priority cells (electric runes, P11): first-wave clearing rewarded,
// cell itself untouchable (NO_PICKUP|NO_SWAP) but still dissolvable ---

// S13: electric Wood at (3,2) sits under a ready vertical wood triple
// (3,0),(3,1),(3,2). With the cell flagged untouchable and prioritized, the
// solver must produce a solution whose FIRST wave clears it, with a path
// that never enters (3,2).
const elecBoard = mk([
  [2,0,1,2,4,5],
  [0,1,0,2,5,4],
  [1,0,5,2,0,1],
  [5,4,1,0,1,0],
  [4,5,0,1,3,3],
]);
const f13 = Array.from({length: 5}, () => Array(6).fill(0));
f13[2][3] = CELL_FLAGS.NO_PICKUP | CELL_FLAGS.NO_SWAP;
const elecSol = new DoraSolver(elecBoard, {
  beamWidth: 100, maxPath: 15, flags: f13, priorityCells: [{x: 3, y: 2}],
}).solve();
const elecSim = BoardSimulator.resolve(elecSol.board, {flags: f13});
const elecFirstWave = new Set();
for (const g of elecSim.groups.slice(0, elecSim.firstCombos)) for (const [x, y] of g.cells) elecFirstWave.add(x * 10 + y);
check('S13 first wave clears the electric cell', elecFirstWave.has(3 * 10 + 2), true);
check('S13 path never enters the electric cell', elecSol.path.every(p => !(p.x === 3 && p.y === 2)), true);

// --- solveMaxFirstCombos: find the highest achievable first-wave target ---

// S10: on hardBoard the bound is min(colorBound 8, floor(20/3)=6) = 6; the
// planner is known to reach 5, so max mode must achieve >= 5 and stay honest.
const maxRes = solveMaxFirstCombos(hardBoard, {sealedColumns: [0, 5]});
check('S10 bound computed correctly', maxRes.bound, 6);
check('S10 max mode achieves at least 5', maxRes.achieved >= 5, true);
check('S10 achieved is honest (independent resolve)',
  BoardSimulator.resolve(maxRes.solution.board, {sealedColumns: [0, 5]}).firstCombos >= maxRes.achieved, true);

// --- Start/end pinning (phone --start/--end): restrict seed + final cell ---

// Invariant every pinned solution must satisfy: either no path was found
// (moves 0) or both endpoints match the pins exactly. A path that silently
// ignores a pin is the failure this feature must never produce.
const pinsRespected = (sol, start, end) => {
  if (sol.moves.length === 0) return true; // degenerate -> caller aborts
  const a = sol.path[0], b = sol.path[sol.path.length - 1];
  return (!start || (a.x === start.x && a.y === start.y))
      && (!end || (b.x === end.x && b.y === end.y));
};

// SP1: startCells restricts the seed — solution begins exactly there
const sp1 = new DoraSolver(mk(BOARDS[1]), {beamWidth: 200, maxPath: 12, startCells: [{x: 5, y: 1}]}).solve();
check('SP1 start pin: startX,startY', [sp1.startX, sp1.startY], [5, 1]);
check('SP1 start pin: path[0] is the start cell', [sp1.path[0].x, sp1.path[0].y], [5, 1]);

// SP2: endCell forces the LAST held cell (reachable within maxPath)
const sp2 = new DoraSolver(mk(BOARDS[1]), {beamWidth: 200, maxPath: 12, endCell: {x: 2, y: 2}}).solve();
const sp2last = sp2.path[sp2.path.length - 1];
check('SP2 end pin: last path cell is the end cell', [sp2last.x, sp2last.y], [2, 2]);

// SP3: start === end (the user's "5,1 -> 5,1" loop) — a real closed drag
const sp3 = new DoraSolver(mk(BOARDS[1]), {beamWidth: 400, maxPath: 8, startCells: [{x: 5, y: 1}], endCell: {x: 5, y: 1}}).solve();
const sp3last = sp3.path[sp3.path.length - 1];
check('SP3 loop starts at pin', [sp3.path[0].x, sp3.path[0].y], [5, 1]);
check('SP3 loop ends at pin', [sp3last.x, sp3last.y], [5, 1]);
check('SP3 loop actually moves (non-empty)', sp3.moves.length > 0, true);
let sp3wf = true;
for (let j = 1; j < sp3.path.length; j++) {
  const d = Math.abs(sp3.path[j].x - sp3.path[j - 1].x) + Math.abs(sp3.path[j].y - sp3.path[j - 1].y);
  if (d !== 1) sp3wf = false;
}
check('SP3 loop well-formed (unit steps)', sp3wf, true);

// SP4: unreachable end within maxPath -> degenerate (moves 0), caller aborts.
// (5,1)->(0,4) is Manhattan distance 8; maxPath 2 cannot reach it.
const sp4 = new DoraSolver(mk(BOARDS[1]), {beamWidth: 200, maxPath: 2, startCells: [{x: 5, y: 1}], endCell: {x: 0, y: 4}}).solve();
check('SP4 unreachable end -> no path (moves 0)', sp4.moves.length, 0);

// SP5: composes with sealedColumns — pins honored AND sealed cells never clear
const sp5 = new DoraSolver(mk(BOARDS[1]), {beamWidth: 200, maxPath: 20, startCells: [{x: 2, y: 2}], sealedColumns: [0, 5]}).solve();
check('SP5 start pin honored under seal', [sp5.startX, sp5.startY], [2, 2]);
check('SP5 comboCount consistent under seal', BoardSimulator.resolve(sp5.board, {sealedColumns: [0, 5]}).totalCombos, sp5.comboCount);
check('SP5 no cleared cell in sealed columns',
  BoardSimulator.resolve(sp5.board, {sealedColumns: [0, 5]}).groups.every(g => g.cells.every(([x]) => x !== 0 && x !== 5)), true);

// SP6: composes with minFirstRunes steering — pins never violated
const sp6 = new DoraSolver(mk(BOARDS[2]), {beamWidth: 300, maxPath: 12, startCells: [{x: 5, y: 1}], endCell: {x: 5, y: 1}, minFirstRunes: 3}).solve();
check('SP6 pins respected while steering firstRunes', pinsRespected(sp6, {x: 5, y: 1}, {x: 5, y: 1}), true);

// SP7: planner path (solveMaxFirstCombos + TargetPlanner) also seeds from the
// pin — every produced solution must start there
const sp7 = solveMaxFirstCombos(hardBoard, {sealedColumns: [0, 5], startCells: [{x: 1, y: 4}]});
check('SP7 maxFirstCombos honors start pin', [sp7.solution.startX, sp7.solution.startY], [1, 4]);
check('SP7 maxFirstCombos still honest', BoardSimulator.resolve(sp7.solution.board, {sealedColumns: [0, 5]}).firstCombos >= sp7.achieved, true);
const sp7tp = new TargetPlanner(hardBoard, {sealedColumns: [0, 5], minFirstCombos: 5, startCells: [{x: 1, y: 4}]}).solve();
check('SP7 planner never routes from a non-pinned start',
  sp7tp.reason !== 'ok' || (sp7tp.solution.startX === 1 && sp7tp.solution.startY === 4), true);

// --- Regression: PROJECT-FACTS §4a smoke test must stay stable ---
const smoke = mk([[0,0,0,1,2,3],[1,2,3,4,5,0],[2,3,4,5,0,1],[3,4,5,0,1,2],[4,5,0,1,2,3]]);
check('REG MatchFinder smoke score', new MatchFinder(smoke).calculateScore().score, 55);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
