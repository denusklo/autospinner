'use strict';
/**
 * Parallel solve driver — Node worker_threads sharding for the two slow
 * engines (DoraSolver beam search and TargetPlanner clear-all routing).
 * Node-ONLY: algorithm.js stays browser-pure; all threading lives here.
 *
 * DoraSolver sharding (solveDoraParallel): a wide beam is data-parallel per
 * step, but per-step synchronization would ship the whole beam between
 * threads 100 times. Instead: run a short PREFIX in-process with the full
 * beam (DoraSolver emitFrontier), split the resulting frontier round-robin
 * by score rank across K workers, and let each worker finish the remaining
 * steps independently at beamWidth/K (DoraSolver seedBeam). Total expansion
 * work stays ~= the sequential run, wall time ~= 1/K. This shards even a
 * pinned --start (1 seed cell), which start-cell partitioning cannot.
 * The result is a PARTITIONED beam, not the sequential beam: each shard
 * prunes locally, so the pick can differ slightly from the single-threaded
 * answer in either direction (verify.js PW proves prefix+resume itself is
 * exact; the partitioning is the only source of divergence).
 *
 * Clear-all sharding (solveClearAllParallel): coverage targets are mutually
 * independent routing problems — planned once in-process (cheap), routed in
 * parallel via TargetPlanner.solveClearAll(targetsOverride). Merge keeps the
 * serial tie-break: most total combos, then earliest-planned target.
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const { Board, DoraSolver, TargetPlanner, solveMaxFirstCombos, computeMaxFirstCombosBound, FROZEN } = require('../algorithm.js');

/** Leave one core for the OS/adb; at least 1. Override with --workers. */
function defaultWorkers() {
  return Math.max(1, os.cpus().length - 1);
}

// Strictly better under DoraSolver's tie-break (weight desc, combos desc,
// moves asc). b may be null. Merging keeps the EARLIER candidate on full
// ties, matching the sequential search's first-found-wins behavior.
function betterSol(a, b) {
  if (b === null) return true;
  if (a.score !== b.score) return a.score > b.score;
  if (a.comboCount !== b.comboCount) return a.comboCount > b.comboCount;
  return a.moves.length < b.moves.length;
}
const mergePick = (a, b) => (b !== null && b !== undefined && betterSol(b, a ?? null) ? b : (a ?? null));

/** Does a finished solution meet every hard demand in `options`? Mirrors the
 * `qualifies` conjunction inside DoraSolver.solve (workers already gate their
 * own picks; this re-derives the flag across the worker boundary). */
function qualifies(sol, options, clearTypeTotals) {
  if (sol.moves.length === 0) return false;
  const last = sol.path[sol.path.length - 1];
  if (options.endCell && (last.x !== options.endCell.x || last.y !== options.endCell.y)) return false;
  const minC = options.minFirstCombos ?? 0, minR = options.minFirstRunes ?? 0;
  if (minC > 0 && (options.exactFirstCombos ? sol.firstCombos !== minC : sol.firstCombos < minC)) return false;
  if (minR > 0 && (options.exactFirstRunes ? sol.firstRunes !== minR : sol.firstRunes < minR)) return false;
  for (const t of options.clearTypes ?? []) {
    if (sol.firstClearedByType[t] < clearTypeTotals[t]) return false;
  }
  for (const t of options.firstWaveNoTypes ?? []) {
    if ((sol.firstClearedByType[t] ?? 0) > 0) return false;
  }
  return true;
}

function hasDemands(options) {
  return (options.minFirstCombos ?? 0) > 0 || (options.minFirstRunes ?? 0) > 0
    || (options.clearTypes ?? []).length > 0 || (options.firstWaveNoTypes ?? []).length > 0;
}

// clearTypes is a MANDATORY demand (P14), unlike minFirstCombos/minFirstRunes
// which are optional targets — mirrors DoraSolver.solve's sc.clearAllOk so a
// worker's final pick can be classified into the bestClearAllOnly tier when
// it satisfies clear-all but missed an unreachable combo/rune target.
function hardDemandsSatisfied(sol, options, clearTypeTotals) {
  for (const t of options.firstWaveNoTypes ?? []) {
    if ((sol.firstClearedByType[t] ?? 0) > 0) return false;
  }
  const clearTypes = options.clearTypes ?? [];
  for (const t of clearTypes ?? []) {
    if (sol.firstClearedByType[t] < clearTypeTotals[t]) return false;
  }
  return true;
}

function reviveBoard(sol) {
  if (sol && sol.board && !(sol.board instanceof Board)) {
    const b = new Board();
    b.fromArray(sol.board);
    sol.board = b;
  }
  return sol;
}

// Driver-managed keys must not leak into worker DoraSolver options.
function plainOptions(options) {
  const o = { ...options };
  delete o.seedBeam;
  delete o.emitFrontier;
  delete o.verbose;
  return o;
}

function runWorker(payload) {
  return new Promise((resolve, reject) => {
    // Bigger young generation: the beam allocates hard (children/paths/key
    // strings) and default scavenger sizing cost ~15% (measured with
    // --max-semi-space-size=64; workers only expose the resourceLimits knob).
    const w = new Worker(__filename, { workerData: payload, resourceLimits: { maxYoungGenerationSizeMb: 128 } });
    w.once('message', resolve);
    w.once('error', reject);
    w.once('exit', code => { if (code !== 0) reject(new Error(`solver worker exited with code ${code}`)); });
  });
}

/**
 * Drop-in parallel replacement for `new DoraSolver(board, options).solve()`.
 * Same options, same result shape; async. workers<=1 falls back to the exact
 * sequential solve.
 */
async function solveDoraParallel(board, options = {}, workers = defaultWorkers()) {
  const opts = plainOptions(options);
  const beamWidth = opts.beamWidth ?? 450;
  const maxPath = opts.maxPath ?? 30;
  if (workers <= 1 || maxPath <= 4) return new DoraSolver(board, opts).solve();

  // Prefix in-process until the frontier is wide enough to shard (a pinned
  // start seeds only ~3 states at step 1). Prefix steps cost little: the
  // frontier is far below beamWidth this early.
  let steps = Math.min(3, maxPath - 1);
  let pre = new DoraSolver(board, { ...opts, maxPath: steps, emitFrontier: true }).solve();
  let frontier = pre.frontier;
  let best = pre.best, bestQualified = pre.bestQualified, bestHardOnly = pre.bestHardOnly ?? pre.bestClearAllOnly;
  while (frontier.length > 0 && frontier.length < workers * 4 && steps < maxPath - 1) {
    const more = new DoraSolver(board, { ...opts, maxPath: 1, emitFrontier: true, seedBeam: frontier }).solve();
    steps += 1;
    frontier = more.frontier;
    best = mergePick(best, more.best);
    bestQualified = mergePick(bestQualified, more.bestQualified);
    bestHardOnly = mergePick(bestHardOnly, more.bestHardOnly ?? more.bestClearAllOnly);
  }

  // Same fallback priority as DoraSolver.solve(): a solution meeting every
  // demand, else one still satisfying the MANDATORY clear-all demand (P14),
  // else the fully-unconstrained best.
  const finalize = () => {
    const pick = bestQualified ?? bestHardOnly ?? best;
    if (pick === null) {
      return { startX: 0, startY: 0, path: [{ x: 0, y: 0 }], moves: [], score: 0, comboCount: 0, firstCombos: 0, firstRunes: 0, firstClearedByType: Array(6).fill(0), chains: 0, board: board.clone() };
    }
    return reviveBoard(pick);
  };

  const remaining = maxPath - steps;
  if (frontier.length === 0 || remaining <= 0) return finalize();

  // Round-robin by score rank so every shard spans the score spectrum.
  frontier.sort((a, b) => b.searchScore - a.searchScore);
  const K = Math.min(workers, frontier.length);
  const shards = Array.from({ length: K }, () => []);
  frontier.forEach((s, i) => shards[i % K].push(s));

  const clearTypeTotals = Array(6).fill(0);
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const v = board.get(x, y);
      if (v >= 0 && v < FROZEN) clearTypeTotals[v]++;
    }
  }

  const perBeam = Math.max(32, Math.ceil(beamWidth / K));
  const results = await Promise.all(shards.map(shard => runWorker({
    mode: 'dora',
    boardGrid: board.grid,
    options: { ...opts, beamWidth: perBeam, maxPath: remaining },
    seedBeam: shard,
  })));

  const demands = hasDemands(opts);
  for (const r of results) {
    if (!r || r.moves.length === 0) continue;
    const sol = reviveBoard(r);
    if (demands && qualifies(sol, opts, clearTypeTotals)) bestQualified = mergePick(bestQualified, sol);
    else if (((opts.clearTypes ?? []).length > 0 || (opts.firstWaveNoTypes ?? []).length > 0)
        && hardDemandsSatisfied(sol, opts, clearTypeTotals)) {
      bestHardOnly = mergePick(bestHardOnly, sol);
    } else best = mergePick(best, sol);
  }
  return finalize();
}

/**
 * Parallel TargetPlanner.solveClearAll: plans coverage targets ONCE (pure
 * board geometry — planClearAllTargets never depends on beamWidth), then
 * routes them at an ESCALATING beam width, stopping at the first success.
 *
 * Why escalate instead of using a fixed width: L22 showed single/no-pin (or
 * end-only) clear-all cases route reliably at beam 300. But a HARD dual
 * start+end pin can need far more width to route at all — measured live
 * (2026-07-09): 2000 and 4000 both routing-failed, 8000 succeeded, on a case
 * that is genuinely solvable (5/5 hearts) but was silently reported as a
 * MISS by an earlier fixed cap of 2000. A flat low cap trades correctness
 * for speed on hard-but-solvable cases; a flat high cap (inheriting the
 * caller's full --beam, e.g. 16000+) wastes tens of seconds on cases that
 * are either easy (would've routed at 300) or truly impossible (routing
 * width can never fix a structural infeasibility). Escalating gets both:
 * fast on easy/impossible cases, correct on hard-but-solvable ones.
 *
 * `reason: 'no-feasible-target'` (not enough board geometry to even
 * construct a coverage placement) is beam-INDEPENDENT — checked once,
 * before any routing attempt, since escalating the beam can never fix it.
 * Same {solution, reason, targetsTried} shape as
 * TargetPlanner.solve()/solveClearAll(); targetsTried sums across all
 * escalation steps actually attempted.
 */
async function solveClearAllParallel(board, plannerOptions = {}, workers = defaultWorkers()) {
  const opts = plainOptions(plannerOptions);
  const planner = new TargetPlanner(board, opts);
  const targets = planner.planClearAllTargets();
  if (targets.length === 0) return { solution: null, reason: 'no-feasible-target', targetsTried: 0 };
  const budget = Math.max(planner.maxTargets, 30);
  const capped = targets.slice(0, budget);

  const ceiling = opts.beamWidth ?? 300;
  const steps = [...new Set([300, 2000, 8000, 20000].filter(b => b < ceiling)), ceiling];

  let tried = 0;
  for (const beam of steps) {
    const stepOpts = { ...opts, beamWidth: beam };
    if (workers <= 1) {
      const res = new TargetPlanner(board, stepOpts).solveClearAll(capped);
      tried += res.targetsTried;
      if (res.solution) return { solution: res.solution, reason: 'ok', targetsTried: tried };
      continue;
    }
    const K = Math.min(workers, capped.length);
    const shards = Array.from({ length: K }, () => []);
    capped.forEach((t, i) => shards[i % K].push({ index: i, target: t }));
    const results = await Promise.all(shards.map(shard => runWorker({
      mode: 'clear-all', boardGrid: board.grid, options: stepOpts, targets: shard,
    })));
    let best = null, bestCombos = -1, bestIndex = Infinity;
    for (const r of results) {
      tried += r.tried;
      if (!r.solution) continue;
      if (r.solution.comboCount > bestCombos || (r.solution.comboCount === bestCombos && r.index < bestIndex)) {
        best = reviveBoard(r.solution); bestCombos = r.solution.comboCount; bestIndex = r.index;
      }
    }
    if (best) return { solution: best, reason: 'ok', targetsTried: tried };
  }
  return { solution: null, reason: 'routing-failed', targetsTried: tried };
}

/**
 * Parallel replacement for algorithm.js's solveMaxFirstCombos (--first-combos
 * max). Mirrors its bound -> DoraSolver -> TargetPlanner-descent structure
 * exactly (computeMaxFirstCombosBound is the SHARED bound calc, so the two
 * never drift), but runs the DoraSolver step via solveDoraParallel and each
 * TargetPlanner descent step via solveClearAllParallel when clearTypes is
 * set. The combo-count-only planner path (no clearTypes) stays sequential —
 * TargetPlanner.solve() early-returns on the first routed target and is
 * already fast (P10: ~0.24-0.5s), so sharding it would add worker-spawn
 * overhead for no benefit.
 */
async function solveMaxFirstCombosParallel(board, options = {}, workers = defaultWorkers()) {
  const opts = plainOptions(options);
  if (workers <= 1) return solveMaxFirstCombos(board, opts);

  const sealedColumns = opts.sealedColumns ?? [];
  const flags = opts.flags ?? null;
  const startCells = opts.startCells ?? null;
  const endCell = opts.endCell ?? null;
  const fireRoute = opts.fireRoute ?? 0;
  const twoMatch = opts.twoMatch ?? null;
  const clearTypes = opts.clearTypes ?? [];
  const firstWaveNoTypes = opts.firstWaveNoTypes ?? [];
  const noSolvableTypes = opts.noSolvableTypes ?? [];
  const bound = computeMaxFirstCombosBound(board, opts);

  const dora = await solveDoraParallel(board, {
    beamWidth: opts.beamWidth ?? 200, maxPath: opts.maxPath ?? 30,
    sealedColumns, flags, minFirstCombos: bound,
    priorityCells: opts.priorityCells ?? [], startCells, endCell, fireRoute, twoMatch, clearTypes, firstWaveNoTypes, noSolvableTypes,
  }, workers);
  let best = dora, achieved = dora.firstCombos;

  for (let n = bound; n > achieved; n--) {
    const plannerOpts = {
      sealedColumns, flags, minFirstCombos: n,
      beamWidth: opts.plannerBeamWidth ?? 300,
      maxPath: opts.plannerMaxPath ?? 60,
      startCells, endCell, fireRoute, twoMatch, clearTypes, firstWaveNoTypes, noSolvableTypes,
    };
    const res = clearTypes.length > 0
      ? await solveClearAllParallel(board, plannerOpts, workers)
      : new TargetPlanner(board, plannerOpts).solve();
    if (res.solution) { best = res.solution; achieved = n; break; }
  }
  return { solution: best, achieved, bound };
}

// ---------- worker side ----------
if (!isMainThread && workerData && (workerData.mode === 'dora' || workerData.mode === 'clear-all')) {
  const board = new Board();
  board.fromArray(workerData.boardGrid);
  if (workerData.mode === 'dora') {
    const sol = new DoraSolver(board, { ...workerData.options, seedBeam: workerData.seedBeam }).solve();
    sol.board = sol.board.grid; // Board instances don't structured-clone
    parentPort.postMessage(sol);
  } else {
    // Route this shard's coverage targets; report the shard's best plus the
    // planned index of that target so the master can keep the serial order
    // preference on combo ties.
    let best = null, bestCombos = -1, bestIndex = Infinity, tried = 0;
    const planner = new TargetPlanner(board, workerData.options);
    for (const { index, target } of workerData.targets) {
      const res = planner.solveClearAll([target]);
      tried += 1;
      if (!res.solution) continue;
      if (res.solution.comboCount > bestCombos
          || (res.solution.comboCount === bestCombos && index < bestIndex)) {
        best = res.solution;
        bestCombos = res.solution.comboCount;
        bestIndex = index;
      }
    }
    if (best) best.board = best.board.grid;
    parentPort.postMessage({ solution: best, tried, index: bestIndex });
  }
}

module.exports = { solveDoraParallel, solveClearAllParallel, solveMaxFirstCombosParallel, defaultWorkers };
