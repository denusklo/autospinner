// Regression + verification suite for algorithm.js (run: `node verify.js`)
// This is the canonical check required by CLAUDE.md R2 before shipping any
// algorithm.js change. Exit code 0 = all pass.
const {Board, MatchFinder, ComboMaximizer, BeamSearchSolver, BoardSimulator, DoraSolver} =
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

// --- Regression: PROJECT-FACTS §4a smoke test must stay stable ---
const smoke = mk([[0,0,0,1,2,3],[1,2,3,4,5,0],[2,3,4,5,0,1],[3,4,5,0,1,2],[4,5,0,1,2,3]]);
check('REG MatchFinder smoke score', new MatchFinder(smoke).calculateScore().score, 55);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
