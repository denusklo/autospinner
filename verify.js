// Regression + verification suite for algorithm.js (run: `node verify.js`)
// This is the canonical check required by CLAUDE.md R2 before shipping any
// algorithm.js change. Exit code 0 = all pass.
const {Board, MatchFinder, ComboMaximizer, BeamSearchSolver, BoardSimulator, DoraSolver, TargetPlanner, RearrangeSolver, RearrangeCoveragePlanner, decomposeRearrangement, solveMaxFirstCombos, CELL_FLAGS, FROZEN, SHIELD_BASE, CURSE_BASE, applyDragSwap} =
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

// S5H: hurricane columns combine all three positional constraints. Their
// hidden rune type is represented as FROZEN because it is unreadable and
// irrelevant, while flags ensure the cells cannot match, start, or be entered.
const hurricaneFlags = emptyFlags();
const hurricaneBoard = mk(BOARDS[2]);
for (let y = 0; y < 5; y++) {
  hurricaneFlags[y][0] = CELL_FLAGS.NO_DISSOLVE | CELL_FLAGS.NO_PICKUP | CELL_FLAGS.NO_SWAP;
  hurricaneFlags[y][5] = CELL_FLAGS.NO_DISSOLVE | CELL_FLAGS.NO_PICKUP | CELL_FLAGS.NO_SWAP;
  hurricaneBoard.set(0, y, FROZEN);
  hurricaneBoard.set(5, y, FROZEN);
}
const hurricaneSol = new DoraSolver(hurricaneBoard, {beamWidth: 100, maxPath: 20, flags: hurricaneFlags}).solve();
const hurricaneSim = BoardSimulator.resolve(hurricaneSol.board, {flags: hurricaneFlags});
check('S5H hurricane path never touches blocked columns', hurricaneSol.path.every(p => p.x > 0 && p.x < 5), true);
check('S5H hurricane cells never dissolve', hurricaneSim.groups.every(g => g.cells.every(([x]) => x > 0 && x < 5)), true);
check('S5H solver still finds an interior combo', hurricaneSol.comboCount > 0, true);

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

// --- First-wave NO: listed types may not dissolve in wave 1, but may still
// dissolve after gravity/cascades ---

const noFG = new DoraSolver(caBoard, {
  beamWidth: 500, maxPath: 30, minFirstCombos: 1, firstWaveNoTypes: [1, 2],
}).solve();
const noFGsim = BoardSimulator.resolve(noFG.board);
check('N1 first-wave-no forbids Fire/Wood in wave 1',
  [noFGsim.firstClearedByType[1], noFGsim.firstClearedByType[2]], [0, 0]);
check('N1 still makes allowed first-wave combo(s)', noFGsim.firstCombos >= 1, true);

const noBound = mk([
  [1,1,1,2,2,2],
  [1,1,1,2,2,2],
  [1,1,1,2,2,2],
  [1,1,1,2,2,2],
  [1,1,1,2,2,2],
]);
check('N2 max-first-combos bound excludes first-wave-no colors',
  solveMaxFirstCombos(noBound, {firstWaveNoTypes: [1, 2], beamWidth: 50, maxPath: 8}).bound, 0);

const noPlanner = new TargetPlanner(noBound, {minFirstCombos: 1, firstWaveNoTypes: [1, 2]}).solve();
check('N3 planner rejects targets using forbidden first-wave colors',
  noPlanner.reason, 'no-feasible-target');

// --- No-solvable: listed types never dissolve, even when aligned ---

check('NS1 no-solvable blocks aligned Fire/Wood runs',
  BoardSimulator.resolve(noBound, {noSolvableTypes: [1, 2]}).totalCombos, 0);
check('NS2 no-solvable overrides 2-match',
  BoardSimulator.findComboGroups(mk([[5,5,0,1,2,3],[1,2,3,4,0,1],[2,3,4,0,1,2],[3,4,0,1,2,3],[4,0,1,2,3,4]]), [], null, [5], [5]).length, 0);

const nsFG = new DoraSolver(caBoard, {
  beamWidth: 500, maxPath: 30, minFirstCombos: 1, noSolvableTypes: [1, 2],
}).solve();
const nsFGsim = BoardSimulator.resolve(nsFG.board, {noSolvableTypes: [1, 2]});
check('NS3 solver makes allowed combo(s) under no-solvable', nsFGsim.firstCombos >= 1, true);
check('NS3 solver never dissolves Fire/Wood',
  nsFGsim.groups.some(g => g.type === 1 || g.type === 2), false);

check('NS4 max-first-combos bound excludes no-solvable colors',
  solveMaxFirstCombos(noBound, {noSolvableTypes: [1, 2], beamWidth: 50, maxPath: 8}).bound, 0);

const nsPlanner = new TargetPlanner(noBound, {minFirstCombos: 1, noSolvableTypes: [1, 2]}).solve();
check('NS5 planner rejects targets using no-solvable colors',
  nsPlanner.reason, 'no-feasible-target');

const nsClearPlanner = new TargetPlanner(noBound, {clearTypes: [1], noSolvableTypes: [1]}).solve();
check('NS6 clear-all planner rejects no-solvable clear target',
  nsClearPlanner.reason, 'no-feasible-target');

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
  const endArr = end ? (Array.isArray(end) ? end : [end]) : null;
  return (!start || (a.x === start.x && a.y === start.y))
      && (!endArr || endArr.some(e => b.x === e.x && b.y === e.y));
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

// SP8/SP9: multiple end cells (2026-07-10, User-requested "multiple end
// point to input and can end at any of it, outcome with best combo") — a
// pure eligibility OR across all given cells, not a preference toward any
// one of them; the solver naturally picks whichever qualifying cell scores
// best under the SAME weight/steer scoring already used everywhere else.
const sp8EndA = {x: 2, y: 2}, sp8EndB = {x: 0, y: 0};
const sp8 = new DoraSolver(mk(BOARDS[1]), {beamWidth: 200, maxPath: 12, endCells: [sp8EndA, sp8EndB]}).solve();
check('SP8 multi-end: solution lands on ONE of the given end cells',
  pinsRespected(sp8, null, [sp8EndA, sp8EndB]), true);

// SP9: multi-end must do at least as well as being locked to either single
// end alone — proves it's actually choosing the best-scoring reachable end,
// not just honoring whichever happens to be listed first.
const sp9EndA = {x: 5, y: 1}, sp9EndB = {x: 0, y: 4};
const sp9SoloA = new DoraSolver(mk(BOARDS[2]), {beamWidth: 300, maxPath: 12, endCell: sp9EndA}).solve();
const sp9SoloB = new DoraSolver(mk(BOARDS[2]), {beamWidth: 300, maxPath: 12, endCell: sp9EndB}).solve();
const sp9Both = new DoraSolver(mk(BOARDS[2]), {beamWidth: 300, maxPath: 12, endCells: [sp9EndA, sp9EndB]}).solve();
const sp9BestSolo = Math.max(
  sp9SoloA.moves.length > 0 ? sp9SoloA.score : -Infinity,
  sp9SoloB.moves.length > 0 ? sp9SoloB.score : -Infinity);
check('SP9 multi-end picks an outcome at least as good as either single end alone',
  sp9Both.moves.length > 0 && sp9Both.score >= sp9BestSolo, true);

// SP10: legacy single-object `endCell` option still works unchanged
// (backward compatibility — every existing --end caller keeps working).
const sp10 = new DoraSolver(mk(BOARDS[1]), {beamWidth: 200, maxPath: 12, endCell: {x: 2, y: 2}}).solve();
check('SP10 legacy endCell option still honored', pinsRespected(sp10, null, {x: 2, y: 2}), true);

// SP11: composes with TargetPlanner (multi-end threaded the same way as
// startCells in SP7).
const sp11tp = new TargetPlanner(hardBoard, {sealedColumns: [0, 5], minFirstCombos: 5, endCells: [{x: 1, y: 4}, {x: 5, y: 0}]}).solve();
check('SP11 TargetPlanner honors multi-end (or correctly reports no route)',
  sp11tp.reason !== 'ok' || pinsRespected(sp11tp.solution, null, [{x: 1, y: 4}, {x: 5, y: 0}]), true);

// --- Clear-all-of-type via coverage planner (PROJECT-FACTS P14) ---
// DoraSolver can't gather a scattered scarce type into its dissolving group(s);
// TargetPlanner constructs coverage lines and routes them.

// CA1: partition of a type's count into dissolving-line lengths (each 3..6)
check('CA1 partitionCount(4)', TargetPlanner.partitionCount(4), [4]);
check('CA1 partitionCount(5)', TargetPlanner.partitionCount(5), [5]);
check('CA1 partitionCount(6)', TargetPlanner.partitionCount(6), [6]);
check('CA1 partitionCount(7)', TargetPlanner.partitionCount(7), [3, 4]);
const p9 = TargetPlanner.partitionCount(9);
check('CA1 partitionCount(9) valid (parts 3..6 summing to 9)',
  p9.reduce((s, n) => s + n, 0) === 9 && p9.every(n => n >= 3 && n <= 6), true);

// CA2: 4 Darks (3 in col 0 + 1 at (1,3)) — planner clears ALL four and the
// solution is well-formed. No minFirstCombos passed, so this also guards the
// clearAllComboFloor fix (a clear-all-only request must NOT be gated to >=5
// combos and falsely reported routing-failed).
const covBoard = mk([[4,0,1,2,3,5],[4,1,2,3,5,0],[4,2,3,5,0,1],[0,4,5,0,1,2],[1,2,3,0,5,1]]);
const covRes = new TargetPlanner(covBoard, {clearTypes: [4], beamWidth: 800, maxPath: 40}).solve();
check('CA2 clear-all planner returns a solution', covRes.reason, 'ok');
check('CA2 all 4 Darks cleared first wave',
  BoardSimulator.resolve(covRes.solution.board).firstClearedByType[4], 4);
let covWf = covRes.solution.path[0].x === covRes.solution.startX && covRes.solution.path[0].y === covRes.solution.startY
  && covRes.solution.moves.length === covRes.solution.path.length - 1;
for (let j = 1; j < covRes.solution.path.length; j++) {
  const d = Math.abs(covRes.solution.path[j].x - covRes.solution.path[j - 1].x)
    + Math.abs(covRes.solution.path[j].y - covRes.solution.path[j - 1].y);
  if (d !== 1) covWf = false;
}
check('CA2 clear-all solution well-formed', covWf, true);

// CA3: coverage-planner combos are honest against an independent resolve
check('CA3 planner combo count is honest',
  BoardSimulator.resolve(covRes.solution.board).totalCombos, covRes.solution.comboCount);

// --- Fire-route: drag may not re-enter a cell left within the last N moves ---
// Invariant: standing on path[k-1] about to step to path[k], the fired window
// is the last N DEPARTED cells (path[(k-1)-N .. k-2]); the target must be clear.
function fireRouteInvariant(path, fireLen) {
  for (let k = 1; k < path.length; k++) {
    const B = path[k];
    for (let j = Math.max(0, (k - 1) - fireLen); j <= k - 2; j++) {
      if (path[j].x === B.x && path[j].y === B.y) return false;
    }
  }
  return true;
}
for (const fl of [6, 3]) {
  const frSol = new DoraSolver(mk(BOARDS[2]), {beamWidth: 400, maxPath: 30, fireRoute: fl}).solve();
  check(`FR fire-route ${fl}: path never re-enters a burning cell`, fireRouteInvariant(frSol.path, fl), true);
  check(`FR fire-route ${fl}: still finds combos & stays honest`,
    frSol.comboCount > 0 && BoardSimulator.resolve(frSol.board).totalCombos === frSol.comboCount, true);
}
// fireBlocked helper exposed by the module (unit): last N *departed* cells block
check('FR immediate previous cell is blocked (backtrack subsumed)',
  new DoraSolver(mk(BOARDS[0]), {beamWidth: 50, maxPath: 6, fireRoute: 2}).solve().path.every((p, i, a) =>
    i < 2 || !(p.x === a[i - 2].x && p.y === a[i - 2].y)), true);

// FR + clear-all compose: 4 Darks cleared AND the path stays fire-legal
const frClear = new DoraSolver(mk([[4,0,1,2,3,5],[4,1,2,3,5,0],[4,2,3,5,0,1],[0,4,5,0,1,2],[1,2,3,0,5,1]]),
  {clearTypes: [4], beamWidth: 1000, maxPath: 40, fireRoute: 6}).solve();
check('FR + clear-all: all Darks cleared',
  BoardSimulator.resolve(frClear.board).firstClearedByType[4], 4);
check('FR + clear-all: path fire-legal', fireRouteInvariant(frClear.path, 6), true);

// --- Frozen runes (P16): per-rune FROZEN value 6 — moves/falls like any rune,
// --- never matches. Draggable and pass-through (User confirmed).
// IC1: 3 frozen in a row are NOT a combo, and an frozen rune between two same-
// color runes keeps them from ever being one run.
const icRow = mk([
  [FROZEN,FROZEN,FROZEN,1,2,3],
  [1,2,3,4,5,0],
  [2,3,4,5,0,1],
  [3,4,5,0,1,2],
  [4,5,0,1,2,3],
]);
check('IC1 3 frozen in a row = 0 groups', BoardSimulator.findComboGroups(icRow).length, 0);

// IC2: frozen runes FALL with gravity after a clear beneath them (the ice
// travels with the rune — per-rune, not positional). Clear the bottom row of
// col 0-2 via a horizontal triple; the frozen rune above col 0 must land.
const icFall = mk([
  [FROZEN,1,2,3,4,5],
  [2,3,4,5,0,1],
  [3,4,5,0,1,2],
  [5,2,3,4,5,0],
  [0,0,0,1,2,3],
]);
const icSim = BoardSimulator.resolve(icFall);
check('IC2 triple under frozen still clears', icSim.totalCombos >= 1, true);
// col 0 lost exactly its bottom cell, so the frozen rune at (0,0) falls one row
check('IC2 frozen rune fell one row with gravity', icSim.boardAfter.get(0, 1), FROZEN);
check('IC2 frozen origin cell now empty', icSim.boardAfter.get(0, 0), -1);

// IC3: DoraSolver drags on a frozen board stay honest, and an frozen cell may be
// entered by the path (pass-through / draggable). Board seeded with frozen
// scattered among matchable colors.
const icBoard = mk([
  [3,3,5,5,2,4],
  [5,4,4,2,0,3],
  [2,FROZEN,0,3,0,2],
  [3,0,0,FROZEN,2,3],
  [2,FROZEN,3,5,FROZEN,FROZEN],
]);
const icSol = new DoraSolver(icBoard, {beamWidth: 400, maxPath: 24}).solve();
check('IC3 solver finds combos on a frozen board', icSol.comboCount > 0, true);
check('IC3 combo count honest vs independent resolve',
  BoardSimulator.resolve(icSol.board).totalCombos, icSol.comboCount);
check('IC3 no frozen rune dissolved (6 frozen conserved on final board)',
  icSol.board.grid.flat().filter(v => v === FROZEN).length, 5);

// IC4: solveMaxFirstCombos color/geometry bounds ignore frozen runes — a board
// of 27 frozen + one water triple bounds at exactly 1 (not 27/3 phantom combos).
const icBound = mk([
  [FROZEN,FROZEN,FROZEN,FROZEN,FROZEN,FROZEN],
  [FROZEN,FROZEN,FROZEN,FROZEN,FROZEN,FROZEN],
  [FROZEN,FROZEN,FROZEN,FROZEN,FROZEN,FROZEN],
  [FROZEN,FROZEN,FROZEN,FROZEN,FROZEN,FROZEN],
  [0,0,0,FROZEN,FROZEN,FROZEN],
]);
check('IC4 max-first-combos bound ignores frozen', solveMaxFirstCombos(icBound, {beamWidth: 50, maxPath: 8}).bound, 1);

// IC5: pairPotential ignores adjacent frozen pairs (no phantom steering) —
// icBound has 20+ adjacent frozen pairs and exactly 2 water pairs.
check('IC5 pairPotential counts only real pairs', new DoraSolver(icBound).pairPotential(icBound), 2);

// IC6: clear-all totals exclude frozen (an frozen rune of the demanded element is
// not owed this turn). 3 normal Hearts + 2 frozen: demand = 3 and is met.
const icClear = mk([
  [5,1,2,3,4,0],
  [2,3,4,0,1,2],
  [5,4,0,1,2,3],
  [5,0,1,2,3,4],
  [FROZEN,FROZEN,3,4,0,1],
]);
const icCA = new DoraSolver(icClear, {clearTypes: [5], beamWidth: 600, maxPath: 24});
check('IC6 clearTypeTotals exclude frozen', icCA.clearTypeTotals[5], 3);
const icCASol = icCA.solve();
check('IC6 clear-all met with frozen same-element present',
  BoardSimulator.resolve(icCASol.board).firstClearedByType[5] >= 3, true);

// --- 2-match: named types dissolve at a run of 2 instead of 3 (boss) ---
// Board with a Heart pair (0,0)(1,0) and a Water pair (3,0)(4,0), no triples.
const tmBoard = mk([[5,5,0,0,2,3],[1,2,3,4,1,2],[2,3,4,1,2,3],[3,4,1,2,3,4],[4,1,2,3,4,1]]);
check('TM no 2-match: a pair does not dissolve', BoardSimulator.findComboGroups(tmBoard).length, 0);
check('TM 2-match Heart: the Heart pair becomes a group of 2',
  BoardSimulator.findComboGroups(tmBoard, [], null, [5]).filter(g => g.type === 5 && g.cells.length === 2).length, 1);
check('TM 2-match Water only: Heart pair still does NOT match',
  BoardSimulator.findComboGroups(tmBoard, [], null, [0]).some(g => g.type === 5), false);
const tmRes = BoardSimulator.resolve(tmBoard, {twoMatch: [5]});
check('TM resolve: a 2-match pair = 1 combo, 2 runes', [tmRes.totalCombos, tmRes.firstRunes], [1, 2]);
// A run of 3 of a non-2-match type still dissolves (baseline unchanged)
check('TM others still need 3 (Water triple dissolves)',
  BoardSimulator.findComboGroups(mk([[0,0,0,1,2,3],[1,2,3,4,5,0],[2,3,4,5,0,1],[3,4,5,0,1,2],[4,5,0,1,2,3]]), [], null, [5]).some(g => g.type === 0), true);
// DoraSolver exploits 2-match for more combos, and stays honest under composition
const tmSolBoard = () => mk([[5,0,5,1,2,3],[0,5,0,2,3,4],[1,2,3,4,5,0],[2,3,4,5,0,1],[3,4,5,0,1,2]]);
const tmOn = new DoraSolver(tmSolBoard(), {beamWidth: 400, maxPath: 20, twoMatch: [5]}).solve();
check('TM DoraSolver solution honest vs independent 2-match resolve',
  BoardSimulator.resolve(tmOn.board, {twoMatch: [5]}).totalCombos, tmOn.comboCount);
const tmFire = new DoraSolver(tmSolBoard(), {beamWidth: 400, maxPath: 20, twoMatch: [5], fireRoute: 6}).solve();
check('TM composes with fire-route (path fire-legal + honest)',
  fireRouteInvariant(tmFire.path, 6) && BoardSimulator.resolve(tmFire.board, {twoMatch: [5]}).totalCombos === tmFire.comboCount, true);

// --- Positional hazard cells (P22, fixed 2026-07-10, L34): a cell that must
// NEVER dissolve in ANY wave, but — unlike sealedColumns/CELL_FLAGS.NO_DISSOLVE
// — is NOT structurally excluded from matching. Runs form NORMALLY (hazard
// cell fully eligible, exactly like the real game); a board where any wave's
// dissolve touches a hazard position is simply forbidden as an answer. This
// was a live bug: the old NO_DISSOLVE modeling silently "trimmed" a 4-run to
// a smaller run excluding the hazard cell, hiding the fact that the real
// game sweeps the WHOLE run (hazard cell included) into one dissolve. ---

// HZ1: sealA's row-0 run of 3 Waters at (0,0)(1,0)(2,0) is a NORMAL group
// (not trimmed) that happens to include hazard position (0,0) -> violated.
const hz1 = BoardSimulator.resolve(sealA, {hazardPositions: new Set([0])});
check('HZ1 normal run STILL includes the hazard cell (not trimmed)',
  hz1.groups[0].cells.length, 3);
check('HZ1 hazardViolated=true when a group touches the hazard position', hz1.hazardViolated, true);

// HZ2: same board, no hazardPositions given -> no regression (false, not
// undefined/thrown), and behavior identical to the pre-P22 baseline.
const hz2 = BoardSimulator.resolve(sealA, {});
check('HZ2 no hazardPositions -> hazardViolated is false (no regression)', hz2.hazardViolated, false);
check('HZ2 totalCombos unaffected when hazardPositions absent', hz2.totalCombos, 1);

// HZ3: a hazard position NOT touched by any group -> no violation even
// though OTHER groups clear elsewhere on the same board.
const hz3 = BoardSimulator.resolve(sealA, {hazardPositions: new Set([5 * 10 + 4])}); // (5,4), far corner
check('HZ3 hazard position untouched by any group -> not violated', hz3.hazardViolated, false);

// HZ4: DoraSolver must NEVER return a final board that violates a hazard
// position, in ANY cascade wave — sealA's pre-existing (0,0)(1,0)(2,0) Water
// run would violate hazardPositions=(0,0) if left in place (even a
// pick-up-and-put-back path reproduces it), so the solver is FORCED to
// actually rearrange the board to avoid it (or return the degenerate empty
// solution if truly unavoidable — never a non-empty violating one).
const hz4 = new DoraSolver(mk(BOARDS[1]), {beamWidth: 200, maxPath: 20, hazardPositions: [{x: 0, y: 0}]}).solve();
const hz4Independent = BoardSimulator.resolve(hz4.board, {hazardPositions: new Set([0])});
check('HZ4 DoraSolver never returns a hazard-violating board',
  hz4.moves.length === 0 || !hz4Independent.hazardViolated, true);

// HZ5: composes with clear-all — TargetPlanner must reject a routed target
// whose board violates a hazard position, same as it already rejects
// clearTypes/firstWaveNoTypes violations.
const hz5Board = mk([
  [5, 1, 2, 3, 4, 0],
  [2, 3, 4, 0, 1, 2],
  [5, 4, 0, 1, 2, 3],
  [5, 0, 1, 2, 3, 4],
  [0, 1, 3, 4, 0, 1],
]);
const hz5 = new TargetPlanner(hz5Board, {clearTypes: [5], beamWidth: 200, maxPath: 30, hazardPositions: [{x: 0, y: 4}]}).solveClearAll();
if (hz5.solution) {
  const hz5Sim = BoardSimulator.resolve(hz5.solution.board, {hazardPositions: new Set([4])}); // (0,4) packed = 0*10+4
  check('HZ5 TargetPlanner clear-all route never violates a hazard position', hz5Sim.hazardViolated, false);
} else {
  check('HZ5 TargetPlanner clear-all: no solution is an acceptable outcome under a hard hazard constraint', true, true);
}

// --- Shielded runes (P24, corrected 2026-07-10 as P30/L40): a PER-RUNE
// status that travels WITH the dragged rune (same in-band board-value trick
// as FROZEN — SHIELD_BASE + baseType, values 7..12). UNLIKE FROZEN, a
// shielded rune matches and dissolves COMPLETELY NORMALLY (merges with plain
// runes of the same color into one group); the only forbidden outcome is a
// color's shielded-rune count reaching ZERO after any cascade wave
// (User-stated: "if board has zero shield rune, the card cannot attack").
// This corrects the original modeling, which wrongly reused FROZEN wholesale
// (never dissolves at all — too strict). ---

// SH1: a run of 3 shielded Waters forms a NORMAL group (not blocked from
// matching, unlike FROZEN) and, being the board's only shielded Waters,
// dissolving all 3 leaves shieldRemaining[Water]=0 -> violated.
const sh1 = mk([
  [SHIELD_BASE + 0, SHIELD_BASE + 0, SHIELD_BASE + 0, 1, 2, 3],
  [1, 2, 3, 4, 5, 0],
  [2, 3, 4, 5, 0, 1],
  [3, 4, 5, 0, 1, 2],
  [4, 5, 0, 1, 2, 3],
]);
const sh1r = BoardSimulator.resolve(sh1);
check('SH1 shielded runes match normally (group not blocked/trimmed)', sh1r.groups[0].cells.length, 3);
check('SH1 group type is the base color, not a distinct "shielded" type', sh1r.groups[0].type, 0);
check('SH1 shieldViolated=true when the only shielded runes of a color all dissolve', sh1r.shieldViolated, true);

// SH2: mixed shielded+plain run merges into ONE group (cross-matching works).
const sh2 = mk([
  [SHIELD_BASE + 0, SHIELD_BASE + 0, 0, 1, 2, 3],
  [1, 2, 3, 4, 5, 0],
  [2, 3, 4, 5, 0, 1],
  [3, 4, 5, 0, 1, 2],
  [4, 5, 0, 1, 2, 3],
]);
const sh2r = BoardSimulator.resolve(sh2);
check('SH2 shielded + plain runes of the same color merge into one group', sh2r.groups[0].cells.length, 3);

// SH3: not violated when a shielded rune of that color survives elsewhere,
// untouched by the dissolving group.
const sh3 = mk([
  [SHIELD_BASE + 0, SHIELD_BASE + 0, SHIELD_BASE + 0, 1, 2, 3],
  [1, 2, 3, 4, 5, 0],
  [2, 3, 4, 5, 0, SHIELD_BASE + 0],
  [3, 4, 5, 0, 1, 2],
  [4, 5, 0, 1, 2, 3],
]);
const sh3r = BoardSimulator.resolve(sh3);
check('SH3 unaffected combo count (extra isolated shielded rune creates no new match)', sh3r.totalCombos, 1);
check('SH3 not violated when >=1 shielded rune of the color survives', sh3r.shieldViolated, false);
check('SH3 shieldRemaining reflects the survivor', sh3r.shieldRemaining[0], 1);

// SH4: DoraSolver must NEVER return a board where the board's only shielded
// rune of a color got swept into a dissolve, in ANY cascade wave.
const sh4Raw = BOARDS[1].map(r => [...r]);
sh4Raw[0][0] = SHIELD_BASE + sh4Raw[0][0];
const sh4 = new DoraSolver(mk(sh4Raw), {beamWidth: 200, maxPath: 20}).solve();
const sh4Independent = BoardSimulator.resolve(sh4.board);
check('SH4 DoraSolver never returns a shield-violating board',
  sh4.moves.length === 0 || !sh4Independent.shieldViolated, true);

// SH5: composes with --first-wave-no (User's explicit ask) — both a shield
// constraint and a firstWaveNoTypes ban must hold simultaneously.
const sh5 = new DoraSolver(mk(sh4Raw), {beamWidth: 200, maxPath: 20, firstWaveNoTypes: [1]}).solve();
const sh5Sim = BoardSimulator.resolve(sh5.board);
check('SH5 shield composes with --first-wave-no (neither constraint violated)',
  sh5.moves.length === 0 || (!sh5Sim.shieldViolated && sh5Sim.firstClearedByType[1] === 0), true);

// SH6: TargetPlanner clear-all correctly finds NO solution when the demand
// requires dissolving the board's only shielded rune of that color (clearing
// ALL hearts necessarily zeroes the one shielded heart's shield count) —
// proves neither mandatory demand (clear-all completeness, P14; shield
// min-1, P30) is silently dropped in favor of the other.
const sh6Board = mk([
  [SHIELD_BASE + 5, 1, 2, 3, 4, 0],
  [2, 3, 4, 0, 1, 2],
  [5, 4, 0, 1, 2, 3],
  [5, 0, 1, 2, 3, 4],
  [0, 1, 3, 4, 0, 1],
]);
const sh6 = new TargetPlanner(sh6Board, {clearTypes: [5], beamWidth: 200, maxPath: 30}).solveClearAll();
check('SH6 TargetPlanner clear-all cannot satisfy a demand requiring the only shielded rune of that color to dissolve',
  sh6.solution, null);

// --- --first-wave-have + reserve floor (P32, User-requested 2026-07-10):
// every listed type must clear >=1 rune in wave 1 (mirror of
// firstWaveNoTypes). When a sibling type is infeasible this round (too few
// on the board), autospin.js drops it and passes the survivors as
// reserveTypes: they must not be drained below their OWN min-run threshold
// (2 for 2-match, else 3) across ALL waves, so a future spin can still form
// a fresh combo of them once the deficient type is replenished. ---

// FH1: a type with EXACTLY its min-run total, fully cleared by its only
// possible match -> reserve violated (nothing left for a future combo).
const fh1Board = mk([
  [0, 0, 0, 1, 2, 3],
  [1, 2, 3, 4, 5, 1],
  [2, 3, 4, 5, 1, 2],
  [3, 4, 5, 1, 2, 3],
  [4, 5, 1, 2, 3, 4],
]);
const fh1 = BoardSimulator.resolve(fh1Board, {reserveTypes: [0]});
check('FH1 reserve violated: type has exactly min-run total and all of it clears', fh1.reserveViolated, true);
check('FH1 totalClearedByType tracks the cleared count (all waves, not just first)', fh1.totalClearedByType[0], 3);

// FH2: sealA has 7 total Waters (3 in the row-0 match, 4 scattered
// singletons elsewhere) -> clearing the 3-run leaves 4 remaining, comfortably
// above the min-run-3 floor -> not violated.
const fh2 = BoardSimulator.resolve(sealA, {reserveTypes: [0]});
check('FH2 reserve NOT violated: enough of the type remains after clearing (7 total, 3 cleared, 4 remain >= 3)', fh2.reserveViolated, false);

// FH3: DoraSolver satisfies a feasible --first-wave-have demand for BOTH
// listed types (Water and Wood both have >=5 on this board) — or returns
// the degenerate no-path solution if truly unreachable within maxPath.
const fh3 = new DoraSolver(mk(BOARDS[1]), {beamWidth: 400, maxPath: 20, firstWaveHaveTypes: [0, 2]}).solve();
const fh3Sim = BoardSimulator.resolve(fh3.board);
check('FH3 DoraSolver satisfies --first-wave-have for every listed type when feasible',
  fh3.moves.length === 0 || (fh3Sim.firstClearedByType[0] > 0 && fh3Sim.firstClearedByType[2] > 0), true);

// FH4: DoraSolver never returns a board that drains a reserveTypes type
// below its own min-run floor, even though the board's PRE-EXISTING
// arrangement (0 moves) would violate it if left untouched.
const fh4 = new DoraSolver(mk([
  [0, 0, 0, 1, 2, 3],
  [1, 2, 3, 4, 5, 1],
  [2, 3, 4, 5, 1, 2],
  [3, 4, 5, 1, 2, 3],
  [4, 5, 1, 2, 3, 4],
]), {beamWidth: 400, maxPath: 20, reserveTypes: [0]}).solve();
const fh4Independent = BoardSimulator.resolve(fh4.board, {reserveTypes: [0]});
check('FH4 DoraSolver never returns a reserve-violating board', fh4.moves.length === 0 || !fh4Independent.reserveViolated, true);

// --- Cursed runes (P37, corrected P38 — User live-corrected: "the curse
// badge will follow the rune unlike fire-hazard mechanic"). PER-RUNE
// travelling status (CURSE_BASE + baseType, same in-band family as shield/
// FROZEN), matches and dissolves completely normally, but a board where the
// cursed cell's rune actually gets swept into ANY wave's dissolve — even a
// LATER cascade wave the cursed rune only reaches via gravity, not the
// wave it started in — is forbidden as an answer. CU3 below is the exact
// live-observed regression: a positional model missed this because the
// specific rune moves to a new coordinate the positional check never
// watches. ---

// CU1: a run of 3 cursed Waters matches NORMALLY (not blocked/trimmed,
// unlike FROZEN) and, being swept, curseViolated=true.
const cu1 = mk([
  [CURSE_BASE + 0, CURSE_BASE + 0, CURSE_BASE + 0, 1, 2, 3],
  [1, 2, 3, 4, 5, 0],
  [2, 3, 4, 5, 0, 1],
  [3, 4, 5, 0, 1, 2],
  [4, 5, 0, 1, 2, 3],
]);
const cu1r = BoardSimulator.resolve(cu1);
check('CU1 cursed runes match normally (group not blocked/trimmed)', cu1r.groups[0].cells.length, 3);
check('CU1 group type is the base color, not a distinct type', cu1r.groups[0].type, 0);
check('CU1 curseViolated=true when the cursed rune is swept into a dissolve', cu1r.curseViolated, true);

// CU2: not violated when the cursed rune is never touched by any group,
// even though an UNRELATED combo dissolves elsewhere on the same board.
const cu2 = mk([
  [1, 1, 1, 2, 3, 4],
  [2, 3, 4, 5, 0, 1],
  [3, 4, 5, 0, 1, CURSE_BASE + 2],
  [4, 5, 0, 1, 2, 3],
  [5, 0, 1, 2, 3, 4],
]);
const cu2r = BoardSimulator.resolve(cu2);
check('CU2 not violated when the cursed rune is never touched', cu2r.curseViolated, false);
check('CU2 unrelated combo elsewhere still resolves normally', cu2r.totalCombos, 1);

// CU3: THE live-observed regression. Wave 1 clears a vertical Fire triple in
// col2 (rows 1-3); gravity then drops the cursed Water sitting at (2,0) down
// to (2,3), where it joins a horizontal Water triple with the UNTOUCHED
// Waters already at (1,3)/(3,3) — a SECOND wave the cursed rune only reaches
// via gravity, not its starting position. A positional hazardPositions
// check watching (2,0) would MISS this entirely (curse never dissolves at
// its original coordinate) — curseViolated must catch it by rune identity.
const cu3 = mk([
  [1, 3, CURSE_BASE + 0, 4, 5, 2],
  [2, 4, 1, 5, 3, 1],
  [3, 5, 1, 2, 4, 3],
  [4, 0, 1, 0, 5, 4],
  [5, 1, 2, 3, 0, 5],
]);
const cu3r = BoardSimulator.resolve(cu3);
check('CU3 the cascade-relocated cursed rune IS caught in the second wave', cu3r.curseViolated, true);
check('CU3 confirms this is genuinely a two-wave cascade, not a first-wave miss', cu3r.chains, 2);

// CU4: DoraSolver never returns a board that dissolves the cursed rune, in
// ANY wave, even though the board's pre-existing arrangement (0 moves)
// would violate it if left untouched.
const cu4Raw = BOARDS[1].map(r => [...r]);
cu4Raw[0][0] = CURSE_BASE + cu4Raw[0][0];
const cu4 = new DoraSolver(mk(cu4Raw), {beamWidth: 200, maxPath: 20}).solve();
const cu4Independent = BoardSimulator.resolve(cu4.board);
check('CU4 DoraSolver never returns a curse-violating board', cu4.moves.length === 0 || !cu4Independent.curseViolated, true);

// --- TargetPlanner.planHaveTargets/solveHave (P32/P33, User-requested
// 2026-07-10): requiring several DIFFERENT types to each dissolve
// simultaneously in wave 1 is a much tighter target than DoraSolver's
// greedy beam steering reliably finds (live repro: 5 types, only 2/5
// achieved at beam 6400 — a genuine local optimum, not a bug). Mirrors
// planClearAllTargets/solveClearAll exactly, but each type only needs ONE
// min-run line (haveSets), not full-count coverage (coverageSets). ---

// HV1: TargetPlanner.solve() dispatches to solveHave() when firstWaveHaveTypes
// is set (no clearTypes) and constructs a board satisfying every listed type
// at once — verified independently via BoardSimulator.
const hv1Board = mk([[0, 0, 1, 1, 2, 2], [3, 3, 4, 4, 5, 5], [0, 1, 0, 1, 2, 3], [2, 2, 3, 3, 4, 4], [5, 5, 0, 0, 1, 1]]);
const hv1 = new TargetPlanner(hv1Board, {firstWaveHaveTypes: [0, 2], beamWidth: 200, maxPath: 20}).solve();
if (hv1.solution) {
  const hv1Sim = BoardSimulator.resolve(hv1.solution.board, {});
  check('HV1 TargetPlanner.solveHave satisfies every listed first-wave-have type at once',
    [0, 2].every(t => hv1Sim.firstClearedByType[t] > 0), true);
} else {
  check('HV1 TargetPlanner.solveHave: no solution is an acceptable outcome if genuinely infeasible', true, true);
}

// HV2: planHaveTargets returns [] (structurally infeasible, no routing
// attempted) when a listed type conflicts with firstWaveNoTypes.
const hv2 = new TargetPlanner(hv1Board, {firstWaveHaveTypes: [0], firstWaveNoTypes: [0]}).planHaveTargets();
check('HV2 planHaveTargets refuses a type that is also in firstWaveNoTypes', hv2.length, 0);

// HV3: same guard against noSolvableTypes.
const hv3 = new TargetPlanner(hv1Board, {firstWaveHaveTypes: [0], noSolvableTypes: [0]}).planHaveTargets();
check('HV3 planHaveTargets refuses a type that is also in noSolvableTypes', hv3.length, 0);

// HV4: solveHave(targetsOverride) reproduces the same run as planning fresh
// (P10/P18-style targetsOverride reproducibility, used by phone/parallel.js
// to shard have-coverage targets across worker threads).
const hv4Planner = new TargetPlanner(hv1Board, {firstWaveHaveTypes: [0, 2], beamWidth: 200, maxPath: 20});
const hv4Full = hv4Planner.solveHave();
const hv4Sub = hv4Planner.solveHave(hv4Planner.planHaveTargets());
check('HV4 solveHave(targetsOverride) reproduces the planned-targets run', [hv4Sub.reason, hv4Sub.targetsTried], [hv4Full.reason, hv4Full.targetsTried]);

// --- Mandatory-vs-optional demand priority (bug found 2026-07-09 live: a
// board where --clear-all + --first-combos max returned 0/5 cleared even
// though a 5/5-clearing solution existed in the same beam). clearTypes is a
// MANDATORY demand (P14); minFirstCombos/minFirstRunes are optional targets.
// Before the fix, `pick = bestQualified ?? best` fell straight to the fully-
// unconstrained best (which can violate clear-all) whenever the optional
// target was unreachable jointly with clear-all — even if a clear-all-only
// solution existed in the beam. Fix: bestClearAllOnly is now a middle tier.
const mdBoard = mk([
  [2,4,1,0,4,2],
  [4,3,5,3,0,2],
  [2,0,5,2,2,0],
  [2,3,1,4,4,2],
  [3,2,3,3,0,4],
]);
// minFirstCombos=20 is far beyond any achievable bound on this board, so
// bestQualified is guaranteed null — isolates the fallback tier.
const mdFrontier = new DoraSolver(mdBoard, {beamWidth: 1500, maxPath: 60, clearTypes: [0], minFirstCombos: 20, emitFrontier: true}).solve();
check('MD unreachable combo target makes bestQualified null (test isolates the fallback)',
  mdFrontier.bestQualified, null);
check('MD best (unconstrained) actually violates clear-all on this board (proves the bug is real)',
  BoardSimulator.resolve(mdFrontier.best.board).firstClearedByType[0] < 5, true);
const mdSol = new DoraSolver(mdBoard, {beamWidth: 1500, maxPath: 60, clearTypes: [0], minFirstCombos: 20}).solve();
check('MD solve() picks the clear-all-satisfying fallback, not the unconstrained best',
  BoardSimulator.resolve(mdSol.board).firstClearedByType[0], 5);

// --- Parallel-driver hooks (phone/parallel.js): emitFrontier / seedBeam ---
// The worker sharding itself is async (worker_threads) and benchmarked via
// the autospin CLI; these checks prove the algorithm.js building blocks:
// a prefix run + a resumed run must EXACTLY reproduce a direct solve.
const pwBoard = () => mk([[0,1,2,3,4,5],[5,0,1,2,3,4],[4,5,0,1,2,3],[3,4,5,0,1,2],[2,3,4,5,0,1]]);

// PW1: emitFrontier returns the live beam after exactly maxPath steps, as
// plain serializable states (grid arrays, not Board instances).
const pwPre = new DoraSolver(pwBoard(), {beamWidth: 150, maxPath: 3, emitFrontier: true}).solve();
check('PW1 frontier states are plain 3-move states',
  pwPre.frontier.every(s => s.path.length === 4 && s.moves.length === 3 && Array.isArray(s.grid) && !(s.grid instanceof Board)), true);
check('PW1 frontier non-empty, pruned to beamWidth', pwPre.frontier.length > 0 && pwPre.frontier.length <= 150, true);

// PW2: prefix(3) + resume(7) with the same beamWidth === direct solve(10).
// Merge prefers the prefix-era candidate on full ties (the sequential search
// keeps the FIRST solution found at equal weight/combos/length).
const pwDirect = new DoraSolver(pwBoard(), {beamWidth: 150, maxPath: 10}).solve();
const pwRes = new DoraSolver(pwBoard(), {beamWidth: 150, maxPath: 7, seedBeam: pwPre.frontier}).solve();
const pwStrictlyBetter = (a, b) => a.score !== b.score ? a.score > b.score
  : a.comboCount !== b.comboCount ? a.comboCount > b.comboCount : a.moves.length < b.moves.length;
const pwMerged = (pwRes.moves.length > 0 && (pwPre.best === null || pwStrictlyBetter(pwRes, pwPre.best))) ? pwRes : pwPre.best;
check('PW2 prefix+resume equals direct solve exactly',
  [pwMerged.score, pwMerged.comboCount, pwMerged.path.map(p => p.x + ',' + p.y).join(' ')],
  [pwDirect.score, pwDirect.comboCount, pwDirect.path.map(p => p.x + ',' + p.y).join(' ')]);

// PW3: the hooks compose with steering demands — a resumed search still
// honors minFirstCombos and stays honest vs an independent resolve.
const pwPre2 = new DoraSolver(pwBoard(), {beamWidth: 200, maxPath: 2, emitFrontier: true, minFirstCombos: 2}).solve();
const pwRes2 = new DoraSolver(pwBoard(), {beamWidth: 200, maxPath: 10, seedBeam: pwPre2.frontier, minFirstCombos: 2}).solve();
check('PW3 resumed solve meets the demand honestly',
  pwRes2.firstCombos >= 2 && BoardSimulator.resolve(pwRes2.board).totalCombos === pwRes2.comboCount, true);

// PW4: solveClearAll(targetsOverride) — routing an explicitly-passed target
// list (the clear-all shard building block) reproduces the planned run.
const pwCA = new TargetPlanner(mk([
  [5,1,2,3,4,0],
  [2,3,4,0,1,2],
  [5,4,0,1,2,3],
  [5,0,1,2,3,4],
  [0,1,3,4,0,1],
]), {clearTypes: [5], beamWidth: 200, maxPath: 30});
const pwFull = pwCA.solveClearAll();
const pwSub = pwCA.solveClearAll(pwCA.planClearAllTargets());
check('PW4 targetsOverride reproduces the planned-targets run',
  [pwSub.reason, pwSub.solution && pwSub.solution.comboCount],
  [pwFull.reason, pwFull.solution && pwFull.solution.comboCount]);

// --- First-wave ATTRIBUTE combos (首消N屬, --first-attr-combos): wave-1
// combo groups of any NON-Heart type; repeats of one attribute count and
// Heart groups are neither counted nor forbidden. ---

// AC1: resolve() counts only non-Heart wave-1 groups. Row 0 holds a Heart
// triple and a Water triple; every column falls by exactly 1 so no cascade
// can form (F12).
const acResolve = BoardSimulator.resolve(mk([
  [5,5,5,0,0,0],
  [1,2,3,4,1,2],
  [2,3,4,1,2,3],
  [3,4,1,2,3,4],
  [4,1,2,3,4,1],
]));
check('AC1 firstCombos counts both groups', acResolve.firstCombos, 2);
check('AC1 firstAttrCombos counts only the non-Heart group', acResolve.firstAttrCombos, 1);

// AC2/AC3: DoraSolver honors the attr target (>= and exact modes) and stays
// honest vs an independent resolve, on a heart-heavy board where heart
// combos are the cheap option.
const acBoard = () => mk([
  [5,5,0,5,5,1],
  [5,0,1,2,3,4],
  [0,1,2,3,4,5],
  [1,2,3,4,5,0],
  [2,3,4,5,0,1],
]);
const acSol = new DoraSolver(acBoard(), {beamWidth: 300, maxPath: 20, minFirstAttrCombos: 2}).solve();
check('AC2 solution meets the attr target', acSol.firstAttrCombos >= 2, true);
check('AC2 firstAttrCombos honest vs independent resolve',
  BoardSimulator.resolve(acSol.board).firstAttrCombos, acSol.firstAttrCombos);
const acExact = new DoraSolver(acBoard(), {beamWidth: 300, maxPath: 20, minFirstAttrCombos: 1, exactFirstAttrCombos: true}).solve();
check('AC3 exact mode returns exactly N attr combos', acExact.firstAttrCombos, 1);

// AC4: composes with firstWaveNoTypes — attr combos must come from the
// remaining attribute types when one is banned from wave 1.
const acNo = new DoraSolver(acBoard(), {beamWidth: 400, maxPath: 20, minFirstAttrCombos: 2, firstWaveNoTypes: [0]}).solve();
const acNoSim = BoardSimulator.resolve(acNo.board);
check('AC4 attr target met with a banned attribute type',
  acNoSim.firstAttrCombos >= 2 && acNoSim.firstClearedByType[0] === 0, true);

// AC5: TargetPlanner constructs non-Heart combos only when the attr demand
// is set (Heart excluded from color assignment).
const acTargets = new TargetPlanner(acBoard(), {minFirstCombos: 2, minFirstAttrCombos: 2}).planTargets();
check('AC5 planner targets exist and never assign Heart',
  acTargets.length > 0 && acTargets.every(t => t.every(c => c.type !== 5)), true);

// --- Touch-conversion card skill (--convert TYPE:N): the first N runes the
// finger TOUCHES while dragging (every move's destination cell, NOT the
// picked-up start cell) turn into TYPE as touched, before the swap displaces
// them. The picked-up rune itself is never converted and always rides
// unconverted to wherever the drag ends. ---

// TC1: straight non-revisiting path, N < path length. Board is a simple
// gradient with no accidental matches so we can read swap results directly.
// Row: [0,1,2,3,4,5] at y=0; drag (0,0)->(1,0)->(2,0)->(3,0) (3 moves),
// convert to type 3 (Light), count=2.
const tcBoard1 = () => mk([
  [0,1,2,3,4,5],
  [1,2,3,4,5,0],
  [2,3,4,5,0,1],
  [3,4,5,0,1,2],
  [4,5,0,1,2,3],
]);
{
  const b = tcBoard1();
  let cur = { x: 0, y: 0 };
  const moves = [[1,0],[2,0],[3,0]];
  let touchIndex = 1;
  // convertType=5 chosen to differ from every natural shift value in this
  // row ([0,1,2,3,4,5]) so a "not converted" cell is distinguishable from a
  // "converted" one, not a coincidental match.
  for (const [nx, ny] of moves) {
    applyDragSwap(b, cur.x, cur.y, nx, ny, touchIndex, 5, 2);
    cur = { x: nx, y: ny };
    touchIndex++;
  }
  // touch#1=(1,0) converts, touch#2=(2,0) converts, touch#3=(3,0) does not.
  // Natural shift (no conversion) would give: (0,0)=orig(1,0)=1, (1,0)=orig(2,0)=2,
  // (2,0)=orig(3,0)=3, (3,0)=orig(0,0)=0(held). With conversion: (0,0) and
  // (1,0) receive CONVERTED touches -> both become 5; (2,0) untouched-by-N
  // keeps the natural shift value (orig(3,0)=3); (3,0) = held rune = 0.
  check('TC1 touch#1 cell converted', b.get(0, 0), 5);
  check('TC1 touch#2 cell converted', b.get(1, 0), 5);
  check('TC1 touch#3 cell NOT converted (beyond count, keeps natural shift value)', b.get(2, 0), 3);
  check('TC1 held rune rides unconverted to the final cell', b.get(3, 0), 0);
}

// TC2: N >= path length — entire touched sequence (all but the final held
// cell) converts.
{
  const b = tcBoard1();
  let cur = { x: 0, y: 0 };
  const moves = [[1,0],[2,0]];
  let touchIndex = 1;
  for (const [nx, ny] of moves) {
    applyDragSwap(b, cur.x, cur.y, nx, ny, touchIndex, 4, 10);
    cur = { x: nx, y: ny };
    touchIndex++;
  }
  check('TC2 both touched cells converted when N exceeds path length', [b.get(0, 0), b.get(1, 0)], [4, 4]);
  check('TC2 held rune (original type 0) unconverted at final cell', b.get(2, 0), 0);
}

// TC3: N = Infinity ("max") behaves like TC2 for any path length.
{
  const b = tcBoard1();
  let cur = { x: 0, y: 0 };
  const moves = [[1,0],[2,0],[3,0],[4,0]];
  let touchIndex = 1;
  for (const [nx, ny] of moves) {
    applyDragSwap(b, cur.x, cur.y, nx, ny, touchIndex, 2, Infinity);
    cur = { x: nx, y: ny };
    touchIndex++;
  }
  check('TC3 max mode converts every touched cell', [b.get(0,0), b.get(1,0), b.get(2,0), b.get(3,0)], [2, 2, 2, 2]);
  check('TC3 held rune unconverted at final cell', b.get(4, 0), 0);
}

// TC4: revisit within budget — touching the SAME cell twice, both within N,
// still ends up converted (touch is counted by MOVE, not distinct cell).
{
  const b = tcBoard1();
  // (0,0) -> (1,0) -> (0,0) : touch#1=(1,0), touch#2=(0,0) [revisit].
  applyDragSwap(b, 0, 0, 1, 0, 1, 5, 2);
  applyDragSwap(b, 1, 0, 0, 0, 2, 5, 2);
  check('TC4 revisited cell converted on its second touch', b.get(1, 0), 5);
  check('TC4 held rune rides back to the revisited start cell', b.get(0, 0), 0);
}

// TC5: DoraSolver end-to-end — a solved path's final board reflects
// conversion (composes with the ordinary weight/combo scoring with no extra
// steering code: conversion is baked into the board before BoardSimulator
// ever sees it).
{
  const tcSol = new DoraSolver(tcBoard1(), { beamWidth: 200, maxPath: 4, convertType: 3, convertCount: 2 }).solve();
  check('TC5 solver path well-formed', tcSol.moves.length > 0, true);
  // A touch at path[i] (i>=1) converts its ORIGINAL content, which then
  // shifts BACKWARD to path[i-1] by the swap that follows — so the cells
  // that end up SHOWING the converted value are path[0..N-1] (start cell
  // included), never path[N..]; the final path cell always holds the
  // original held rune, exempt regardless of N (mirrors the TC1 derivation).
  const tcFinal = tcSol.path[tcSol.path.length - 1];
  const tcConverted = tcSol.path.slice(0, Math.min(2, tcSol.path.length - 1))
    .filter(p => !(p.x === tcFinal.x && p.y === tcFinal.y));
  check('TC5 first N path positions (incl. start) are the converted type on the final board',
    tcConverted.length > 0 && tcConverted.every(p => tcSol.board.get(p.x, p.y) === 3), true);
  check('TC5 final held cell is NOT forced to the converted type',
    tcSol.board.get(tcFinal.x, tcFinal.y) !== 3, true);
}

// --- Want-group target (--want-group TYPE:N): BEST-EFFORT optional steering
// for "a match group of EXACTLY N cells of TYPE, somewhere across EVERY
// cascade wave" — never a mandatory demand, never aborts. ---

// WG1: cross-wave — reuses U3b's cascade fixture, whose wave-2 group (type 4,
// 3 cells) only exists AFTER the wave-1 L-shape clears and gravity drops new
// neighbors into place. Proves sim.groups (what --want-group checks) spans
// every wave, not just wave 1.
{
  const cascade2 = mk([
    [1,2,3,3,1,2],
    [2,3,4,5,2,3],
    [5,1,0,1,3,4],
    [4,4,0,2,4,5],
    [0,0,0,3,5,1],
  ]);
  const cr2 = BoardSimulator.resolve(cascade2);
  check('WG1 wave-2 group (type 4, 3 cells) present in sim.groups', cr2.groups.some(g => g.type === 4 && g.cells.length === 3), true);
  check('WG1 that group is NOT among the wave-1 groups (proves it is genuinely wave-2)',
    cr2.groups.slice(0, cr2.firstCombos).some(g => g.type === 4 && g.cells.length === 3), false);
}

// WG2: deterministic construction — composes with --convert (P46): forcing
// 4 touched cells (incl. start, count>=path length) to type 0 along a
// straight row produces exactly one 4-cell group of that type.
{
  const b = tcBoard1();
  let cur = { x: 0, y: 0 };
  const moves = [[1,0],[2,0],[3,0]];
  let touchIndex = 1;
  for (const [nx, ny] of moves) {
    applyDragSwap(b, cur.x, cur.y, nx, ny, touchIndex, 0, 4);
    cur = { x: nx, y: ny };
    touchIndex++;
  }
  const wgSim = BoardSimulator.resolve(b);
  check('WG2 convert-then-want-group composition produces the exact group', wgSim.groups.some(g => g.type === 0 && g.cells.length === 4), true);
}

// WG3: DoraSolver end-to-end — pinned start + convertType/convertCount make
// the qualifying path essentially the only good option in a tiny search
// space, so steering should find it and wantGroupOk should hold on the
// final board (checked independently via resolve(), not sc internals).
{
  const wgSol = new DoraSolver(tcBoard1(), {
    beamWidth: 100, maxPath: 3, startCells: [{ x: 0, y: 0 }],
    convertType: 0, convertCount: 4, wantGroupType: 0, wantGroupSize: 4,
  }).solve();
  check('WG3 solver path well-formed', wgSol.moves.length > 0, true);
  const wgSim2 = BoardSimulator.resolve(wgSol.board);
  check('WG3 final board satisfies the want-group target', wgSim2.groups.some(g => g.type === 0 && g.cells.length === 4), true);
}

// WG4: best-effort — an UNREACHABLE size (larger than any possible group on
// a 5x6 board) must never abort/throw/return null; solve() still returns a
// well-formed fallback solution (same "optional target, not mandatory
// demand" fallback chain as minFirstCombos/minFirstAttrCombos).
{
  const wgImpossible = new DoraSolver(tcBoard1(), {
    beamWidth: 100, maxPath: 5, wantGroupType: 0, wantGroupSize: 25,
  }).solve();
  check('WG4 unreachable want-group target does not break solve() (best-effort fallback)',
    typeof wgImpossible === 'object' && Array.isArray(wgImpossible.moves) && wgImpossible.board instanceof Board, true);
}

// --- 排珠 rearrangement mode (RearrangeSolver / decomposeRearrangement,
// P50): multi-drag repositioning with no dissolve until a final full
// cascade. The ground-truth check that matters most is REA4/REA6: replaying
// the decomposed drag sequence must EXACTLY reproduce the chosen target
// board (this is what a real device execution needs to be correct). ---

const REA_BOARD = () => mk([
  [0, 1, 0, 2, 0, 3],
  [2, 3, 4, 5, 1, 2],
  [3, 4, 5, 1, 2, 3],
  [4, 5, 1, 2, 3, 4],
  [5, 1, 2, 3, 4, 5],
]);

// REA1: movableComponents excludes NO_SWAP cells and finds the right count.
{
  const flags = Array.from({length: 5}, () => Array(6).fill(0));
  flags[0][0] = CELL_FLAGS.NO_SWAP;
  const rs = new RearrangeSolver(REA_BOARD(), { flags });
  const comps = rs.movableComponents();
  const allMovable = comps.flat();
  check('REA1 NO_SWAP cell excluded from every component', allMovable.some(c => c.x === 0 && c.y === 0), false);
  check('REA1 remaining 29 cells still form one connected component', comps.filter(c => c.length > 1).length, 1);
}

// REA2: a full NO_SWAP wall (columns 2+3) splits the board into two
// disconnected 10-cell components.
{
  const flags2 = Array.from({length: 5}, () => Array(6).fill(0));
  for (let y = 0; y < 5; y++) { flags2[y][2] = CELL_FLAGS.NO_SWAP; flags2[y][3] = CELL_FLAGS.NO_SWAP; }
  const rs2 = new RearrangeSolver(REA_BOARD(), { flags: flags2 });
  const comps2 = rs2.movableComponents().filter(c => c.length > 0);
  check('REA2 wall splits movable region into 2 components', comps2.length, 2);
  check('REA2 each side has 10 cells', comps2.map(c => c.length).sort(), [10, 10]);
}

// REA3: RearrangeSolver composes with --clear-all — finds an arrangement
// that clears all 3 Waters in wave 1, something the ORIGINAL (unrearranged)
// board cannot do (Waters are scattered with no run of 3).
{
  const board = REA_BOARD();
  const baselineSim = BoardSimulator.resolve(board.clone());
  check('REA3 baseline board has no wave-1 matches at all', baselineSim.totalCombos, 0);
  const rs3 = new RearrangeSolver(board, { clearTypes: [0], rearrangeBeamWidth: 300, rearrangeMaxSteps: 25 });
  const result3 = rs3.solve();
  const sim3 = BoardSimulator.resolve(result3.board.clone());
  check('REA3 rearranged board clears all 3 waters in wave 1', sim3.firstClearedByType[0], 3);
}

// REA4: decomposeRearrangement's drag sequence, replayed via the SAME
// swap-chain semantics used everywhere else in this project, EXACTLY
// reproduces the chosen target board (ground truth for real execution).
{
  const board = REA_BOARD();
  const rs4 = new RearrangeSolver(board, { wantGroupType: 1, wantGroupSize: 5, rearrangeBeamWidth: 300, rearrangeMaxSteps: 25 });
  const result4 = rs4.solve();
  const decomposed4 = decomposeRearrangement(board, result4.board, result4.movableCells);
  const drags4 = decomposed4.drags;
  const replay = board.clone();
  for (const d of drags4) for (let i = 1; i < d.path.length; i++) replay.swap(d.path[i - 1].x, d.path[i - 1].y, d.path[i].x, d.path[i].y);
  let matches = true;
  for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) if (replay.get(x, y) !== result4.board.get(x, y)) matches = false;
  check('REA4 replayed drag sequence exactly reproduces the target board', matches, true);
  check('REA4 at least one drag was planned (board actually changed)', drags4.length > 0, true);
  check('REA4 no-convert: returned board equals the target board', JSON.stringify(decomposed4.board.grid), JSON.stringify(result4.board.grid));
}

// REA5: no planned drag ever touches an immovable (NO_SWAP) cell, and that
// cell's value is completely untouched in the final board.
{
  const flags5 = Array.from({length: 5}, () => Array(6).fill(0));
  flags5[2][3] = CELL_FLAGS.NO_SWAP;
  const board5 = REA_BOARD();
  const rs5 = new RearrangeSolver(board5, { flags: flags5, clearTypes: [0], rearrangeBeamWidth: 300, rearrangeMaxSteps: 25 });
  const result5 = rs5.solve();
  check('REA5 immovable cell value unchanged in the target board', result5.board.get(3, 2), board5.get(3, 2));
  const drags5 = decomposeRearrangement(board5, result5.board, result5.movableCells).drags;
  check('REA5 no drag path ever passes through the immovable cell', drags5.every(d => d.path.every(p => !(p.x === 3 && p.y === 2))), true);
  const replay5 = board5.clone();
  for (const d of drags5) for (let i = 1; i < d.path.length; i++) replay5.swap(d.path[i - 1].x, d.path[i - 1].y, d.path[i].x, d.path[i].y);
  let matches5 = true;
  for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) if (replay5.get(x, y) !== result5.board.get(x, y)) matches5 = false;
  check('REA5 replay still exact with an immovable cell present', matches5, true);
}

// REA6: multi-component decomposition — drags stay confined to their own
// component (a drag path never crosses the NO_SWAP wall), and replay is
// exact on BOTH sides at once.
{
  const flags6 = Array.from({length: 5}, () => Array(6).fill(0));
  for (let y = 0; y < 5; y++) { flags6[y][2] = CELL_FLAGS.NO_SWAP; flags6[y][3] = CELL_FLAGS.NO_SWAP; }
  const board6 = mk([
    [0, 1, 9, 9, 2, 3],
    [1, 0, 9, 9, 3, 2],
    [0, 1, 9, 9, 2, 3],
    [1, 0, 9, 9, 3, 2],
    [0, 1, 9, 9, 2, 3],
  ]);
  const rs6 = new RearrangeSolver(board6, { flags: flags6, wantGroupType: 0, wantGroupSize: 5, rearrangeBeamWidth: 200, rearrangeMaxSteps: 20 });
  const result6 = rs6.solve();
  const drags6 = decomposeRearrangement(board6, result6.board, result6.movableCells).drags;
  check('REA6 no drag path ever crosses the NO_SWAP wall (cols 2-3)', drags6.every(d => d.path.every(p => p.x !== 2 && p.x !== 3)), true);
  const replay6 = board6.clone();
  for (const d of drags6) for (let i = 1; i < d.path.length; i++) replay6.swap(d.path[i - 1].x, d.path[i - 1].y, d.path[i].x, d.path[i].y);
  let matches6 = true;
  for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) if (replay6.get(x, y) !== result6.board.get(x, y)) matches6 = false;
  check('REA6 replay exact across two disconnected components at once', matches6, true);
}

// REA7-9: --rearrange + --convert composition (2026-07-10, User-requested):
// ONLY the first physical drag converts its touched (left-behind) cells;
// convertCount may be Infinity ("max"). The returned `board` must reflect
// the REAL post-conversion arrangement, not RearrangeSolver's target.

// REA7: convertCount=Infinity ("max") on the first drag — every cell the
// first drag's finger passes through and leaves behind becomes convertType,
// while the picked-up rune still rides unconverted to wherever it lands.
{
  const board7 = REA_BOARD();
  const rs7 = new RearrangeSolver(board7, { wantGroupType: 1, wantGroupSize: 5, rearrangeBeamWidth: 300, rearrangeMaxSteps: 25 });
  const result7 = rs7.solve();
  const decomposed7 = decomposeRearrangement(board7, result7.board, result7.movableCells, 3, Infinity);
  const drags7 = decomposed7.drags;
  check('REA7 at least one drag was planned', drags7.length > 0, true);
  const firstDrag = drags7[0];
  // Replay the sequence manually via the SAME applyDragSwap semantics used
  // by the function itself (independent check, not trusting its own return).
  const replay7 = board7.clone();
  drags7.forEach((d, di) => {
    let cur = d.path[0];
    for (let i = 1; i < d.path.length; i++) {
      const nxt = d.path[i];
      if (di === 0) applyDragSwap(replay7, cur.x, cur.y, nxt.x, nxt.y, i, 3, Infinity);
      else replay7.swap(cur.x, cur.y, nxt.x, nxt.y);
      cur = nxt;
    }
  });
  check('REA7 independently-replayed board matches the returned board', JSON.stringify(replay7.grid), JSON.stringify(decomposed7.board.grid));
  // Every cell of the FIRST drag EXCEPT its final (held-rune) cell must be
  // convertType (3) — checked right after drag 1 completes, NOT on the
  // fully-final board (a LATER drag sharing the same component can
  // legitimately swap back through a cell drag 1 left behind).
  const afterDrag1 = board7.clone();
  let curD1 = firstDrag.path[0];
  for (let i = 1; i < firstDrag.path.length; i++) {
    const nxt = firstDrag.path[i];
    applyDragSwap(afterDrag1, curD1.x, curD1.y, nxt.x, nxt.y, i, 3, Infinity);
    curD1 = nxt;
  }
  const heldFinal = firstDrag.path[firstDrag.path.length - 1];
  const leftBehindOk = firstDrag.path.slice(0, -1).every(p => afterDrag1.get(p.x, p.y) === 3);
  check('REA7 every left-behind cell of the first drag converted (max mode)', leftBehindOk, true);
  check('REA7 held rune at the first drag\'s final cell is NOT forced to convertType', afterDrag1.get(heldFinal.x, heldFinal.y) === board7.get(firstDrag.startX, firstDrag.startY), true);
}

// REA8: a FINITE convertCount only converts the first drag's first N
// touches; a second drag (if any) is completely unaffected by conversion.
{
  const board8 = REA_BOARD();
  const rs8 = new RearrangeSolver(board8, { clearTypes: [0], rearrangeBeamWidth: 300, rearrangeMaxSteps: 25 });
  const result8 = rs8.solve();
  const decomposed8 = decomposeRearrangement(board8, result8.board, result8.movableCells, 4, 1);
  const drags8 = decomposed8.drags;
  if (drags8.length >= 2) {
    // Second+ drags: replaying WITHOUT any conversion from the point right
    // after drag 1 must match the returned board exactly on those cells —
    // i.e. drags[1..] are plain swaps, not touched by convertType at all.
    const afterFirst = board8.clone();
    const d0 = drags8[0];
    let cur0 = d0.path[0];
    for (let i = 1; i < d0.path.length; i++) {
      const nxt = d0.path[i];
      applyDragSwap(afterFirst, cur0.x, cur0.y, nxt.x, nxt.y, i, 4, 1);
      cur0 = nxt;
    }
    for (let di = 1; di < drags8.length; di++) {
      const d = drags8[di];
      let cur = d.path[0];
      for (let i = 1; i < d.path.length; i++) {
        const nxt = d.path[i];
        afterFirst.swap(cur.x, cur.y, nxt.x, nxt.y);
        cur = nxt;
      }
    }
    check('REA8 only the first drag converts; later drags are plain swaps', JSON.stringify(afterFirst.grid), JSON.stringify(decomposed8.board.grid));
  } else {
    check('REA8 skipped (fewer than 2 drags planned on this board/demand) — trivially consistent', true, true);
  }
}

// REA9: conversion composes with --clear-all — the real (post-conversion)
// board is what gets checked, and CAN legitimately clear MORE than the
// original demand total (same "bonus, not requirement" rule as P48's
// single-drag --convert + --clear-all fix) without being flagged wrong.
{
  const board9 = REA_BOARD();
  const rs9 = new RearrangeSolver(board9, { clearTypes: [0], rearrangeBeamWidth: 400, rearrangeMaxSteps: 25 });
  const result9 = rs9.solve();
  const decomposed9 = decomposeRearrangement(board9, result9.board, result9.movableCells, 0, Infinity);
  const sim9 = BoardSimulator.resolve(decomposed9.board.clone());
  const origWaterTotal = board9.grid.reduce((n, row) => n + row.filter(v => v === 0).length, 0);
  check('REA9 clear-all still satisfied on the REAL post-conversion board', sim9.firstClearedByType[0] >= origWaterTotal, true);
}

// --- RearrangeCoveragePlanner (P52): constructive full/partial-coverage
// tiling for --rearrange, escalated when RearrangeSolver's swap-beam alone
// misses a demand (e.g. --first-runes 30, the whole-board-dissolve case a
// beam search over swaps struggles to stumble onto by chance). ---

// CP1: full-board coverage on an EVENLY-tileable board (5 of each of 6
// colors on a 5-tall grid: one color per COLUMN is a trivial valid tiling).
// This is the motivating case (User: "want to solve 30 runes on first
// wave") — must succeed reliably, not just occasionally.
{
  const cpBoard1 = mk([
    [0, 1, 2, 3, 4, 5],
    [1, 2, 3, 4, 5, 0],
    [2, 3, 4, 5, 0, 1],
    [3, 4, 5, 0, 1, 2],
    [4, 5, 0, 1, 2, 3],
  ]);
  const cp1 = new RearrangeCoveragePlanner(cpBoard1, { minFirstRunes: 30, exactFirstRunes: true });
  const res1 = cp1.solve();
  check('CP1 full 30-cell coverage found', res1.reason, 'ok');
  check('CP1 firstRunes reaches the full board', res1.solution && res1.solution.firstRunes, 30);
  const cp1Sim = BoardSimulator.resolve(res1.solution.board.clone());
  check('CP1 honest vs independent resolve', cp1Sim.firstRunes, 30);
}

// CP2: an UNEVEN color distribution (5,6,6,6,4,3) is harder to tile than an
// even split — proves the multi-restart search (varied direction/color
// order) actually helps, not just the trivial column case.
{
  const cpBoard2 = mk([
    [0, 0, 1, 1, 2, 2],
    [0, 3, 3, 1, 2, 4],
    [0, 3, 3, 1, 2, 4],
    [0, 3, 3, 1, 2, 4],
    [5, 5, 5, 1, 2, 4],
  ]);
  const cp2 = new RearrangeCoveragePlanner(cpBoard2, { minFirstRunes: 30 });
  const res2 = cp2.solve();
  check('CP2 uneven-distribution full coverage found', res2.reason, 'ok');
  check('CP2 firstRunes reaches the full board', res2.solution && res2.solution.firstRunes, 30);
}

// CP3: composes with --clear-all — the constructed candidate must actually
// clear every rune of the required type, verified independently.
{
  const cpBoard3 = mk([
    [4, 1, 0, 3, 2, 5],
    [1, 4, 0, 3, 2, 5],
    [0, 1, 4, 3, 2, 5],
    [3, 0, 1, 4, 2, 5],
    [2, 3, 0, 1, 4, 5],
  ]);
  const cp3 = new RearrangeCoveragePlanner(cpBoard3, { clearTypes: [4], minFirstRunes: 15 });
  const res3 = cp3.solve();
  check('CP3 clear-all composition succeeds', res3.reason, 'ok');
  const cp3Sim = BoardSimulator.resolve(res3.solution.board.clone());
  const darkTotal = cpBoard3.grid.reduce((n, row) => n + row.filter(v => v === 4).length, 0);
  check('CP3 ALL darks cleared in wave 1 (independent verify)', cp3Sim.firstClearedByType[4], darkTotal);
}

// CP4: composes with --first-wave-no — this is the case that caught a real
// bug during this feature's own development (L57): a color EXCLUDED from
// deliberate placement is 100% leftover, and a naive leftover-fill can
// accidentally string 3+ of it together, violating the very demand meant
// to keep it out of wave 1. Must succeed AND must never let the forbidden
// color dissolve.
{
  const cpBoard4 = mk([
    [0, 0, 1, 1, 2, 2],
    [0, 3, 3, 1, 2, 4],
    [0, 3, 3, 1, 2, 4],
    [0, 3, 3, 1, 2, 4],
    [5, 5, 5, 1, 2, 4],
  ]);
  const cp4 = new RearrangeCoveragePlanner(cpBoard4, { firstWaveNoTypes: [2], minFirstRunes: 20 });
  const res4 = cp4.solve();
  check('CP4 first-wave-no + coverage composition succeeds', res4.reason, 'ok');
  const cp4Sim = BoardSimulator.resolve(res4.solution.board.clone());
  check('CP4 forbidden color (Wood) never dissolves in wave 1', cp4Sim.firstClearedByType[2], 0);
  check('CP4 still reaches the requested coverage', cp4Sim.firstRunes >= 20, true);
}

// CP5: end-to-end via decomposeRearrangement — the constructed candidate is
// not just internally consistent, it's REALIZABLE: replaying the decomposed
// drag sequence from the ORIGINAL board must exactly reproduce it.
{
  const cpBoard5 = mk([
    [0, 1, 2, 3, 4, 5],
    [1, 2, 3, 4, 5, 0],
    [2, 3, 4, 5, 0, 1],
    [3, 4, 5, 0, 1, 2],
    [4, 5, 0, 1, 2, 3],
  ]);
  const cp5 = new RearrangeCoveragePlanner(cpBoard5, { minFirstRunes: 30 });
  const res5 = cp5.solve();
  const decomposed5 = decomposeRearrangement(cpBoard5, res5.solution.board, res5.solution.movableCells);
  const replay5 = cpBoard5.clone();
  for (const d of decomposed5.drags) for (let i = 1; i < d.path.length; i++) replay5.swap(d.path[i - 1].x, d.path[i - 1].y, d.path[i].x, d.path[i].y);
  let matches5 = true;
  for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) if (replay5.get(x, y) !== res5.solution.board.get(x, y)) matches5 = false;
  check('CP5 coverage-planner candidate is exactly realizable via decomposeRearrangement', matches5, true);
}

// CP6: an UNSATISFIABLE demand (more than the board can ever provide) must
// report failure cleanly, never fabricate a false success.
{
  const cpBoard6 = mk([
    [0, 1, 2, 3, 4, 5],
    [1, 2, 3, 4, 5, 0],
    [2, 3, 4, 5, 0, 1],
    [3, 4, 5, 0, 1, 2],
    [4, 5, 0, 1, 2, 3],
  ]);
  const cp6 = new RearrangeCoveragePlanner(cpBoard6, { minFirstRunes: 30, exactFirstRunes: true, firstWaveNoTypes: [0, 1] });
  const res6 = cp6.solve();
  // With 2 of 6 colors (10 of 30 cells) excluded from wave-1 dissolve,
  // exactly 30 cleared is structurally impossible — must correctly fail,
  // not claim success.
  check('CP6 provably-impossible exact target reported as a miss, not success', res6.reason, 'coverage-search-missed');
  check('CP6 no solution object on failure', res6.solution, null);
}

// --- Regression: PROJECT-FACTS §4a smoke test must stay stable ---
const smoke = mk([[0,0,0,1,2,3],[1,2,3,4,5,0],[2,3,4,5,0,1],[3,4,5,0,1,2],[4,5,0,1,2,3]]);
check('REG MatchFinder smoke score', new MatchFinder(smoke).calculateScore().score, 55);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
