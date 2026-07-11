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
const { Board, BoardSimulator, DoraSolver, TargetPlanner, RearrangeSolver, RearrangeCoveragePlanner, decomposeRearrangement, solveRearrangeConvertAware, computeMovableComponents, enumerateConversionCandidates, buildConvertedBoard, orderConversionCandidatesByBound, applyDragSwap, solveMaxFirstCombos, computeMaxFirstCombosBound, FROZEN, SHIELD_BASE, CURSE_BASE } = require('../algorithm.js');

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
  const endCells = options.endCells ?? (options.endCell ? [options.endCell] : null);
  if (endCells && !endCells.some(e => last.x === e.x && last.y === e.y)) return false;
  const minC = options.minFirstCombos ?? 0, minR = options.minFirstRunes ?? 0;
  const minAC = options.minFirstAttrCombos ?? 0;
  if (minC > 0 && (options.exactFirstCombos ? sol.firstCombos !== minC : sol.firstCombos < minC)) return false;
  if (minAC > 0 && (options.exactFirstAttrCombos ? sol.firstAttrCombos !== minAC : sol.firstAttrCombos < minAC)) return false;
  if (minR > 0 && (options.exactFirstRunes ? sol.firstRunes !== minR : sol.firstRunes < minR)) return false;
  for (const t of options.clearTypes ?? []) {
    if (sol.firstClearedByType[t] < clearTypeTotals[t]) return false;
  }
  for (const t of options.firstWaveNoTypes ?? []) {
    if ((sol.firstClearedByType[t] ?? 0) > 0) return false;
  }
  for (const t of options.firstWaveHaveTypes ?? []) {
    if ((sol.firstClearedByType[t] ?? 0) === 0) return false;
  }
  const wantType = options.wantGroupType ?? null;
  if (wantType !== null) {
    // Best-effort target (P46-adjacent) — sol.firstClearedByType only
    // covers wave 1, but "any wave" needs the full group list, which isn't
    // in the _solution() shape returned across the worker boundary. Cheap
    // to re-derive: one resolve() call per worker result, not per beam step.
    const sim = BoardSimulator.resolve(sol.board, {
      sealedColumns: options.sealedColumns, flags: options.flags, twoMatch: options.twoMatch,
      noSolvableTypes: options.noSolvableTypes, hazardPositions: options.hazardPositions,
      reserveTypes: (options.reserveTypes ?? []).length > 0 ? options.reserveTypes : null,
    });
    if (!sim.groups.some(g => g.type === wantType && g.cells.length === (options.wantGroupSize ?? 0))) return false;
  }
  return true;
}

function hasDemands(options) {
  return (options.minFirstCombos ?? 0) > 0 || (options.minFirstAttrCombos ?? 0) > 0
    || (options.minFirstRunes ?? 0) > 0
    || (options.clearTypes ?? []).length > 0 || (options.firstWaveNoTypes ?? []).length > 0
    || (options.firstWaveHaveTypes ?? []).length > 0 || (options.wantGroupType ?? null) !== null;
}

// clearTypes and firstWaveHaveTypes are MANDATORY demands (P14/P32), unlike
// minFirstCombos/minFirstRunes which are optional targets — mirrors
// DoraSolver.solve's sc.clearAllOk/sc.firstWaveHaveOk so a worker's final
// pick can be classified into the bestClearAllOnly tier when it satisfies
// the mandatory demands but missed an unreachable combo/rune target.
function hardDemandsSatisfied(sol, options, clearTypeTotals) {
  for (const t of options.firstWaveNoTypes ?? []) {
    if ((sol.firstClearedByType[t] ?? 0) > 0) return false;
  }
  for (const t of options.firstWaveHaveTypes ?? []) {
    if ((sol.firstClearedByType[t] ?? 0) === 0) return false;
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
      return { startX: 0, startY: 0, path: [{ x: 0, y: 0 }], moves: [], score: 0, comboCount: 0, firstCombos: 0, firstAttrCombos: 0, firstRunes: 0, firstClearedByType: Array(6).fill(0), chains: 0, board: board.clone() };
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
      // Shielded/cursed runes ARE owed here (P30/P37) — both dissolve
      // normally; only true FROZEN runes never dissolve and stay un-owed.
      const bt = v >= CURSE_BASE ? v - CURSE_BASE : (v >= SHIELD_BASE ? v - SHIELD_BASE : v);
      if (bt >= 0 && bt < FROZEN) clearTypeTotals[bt]++;
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
    else if (((opts.clearTypes ?? []).length > 0 || (opts.firstWaveNoTypes ?? []).length > 0 || (opts.firstWaveHaveTypes ?? []).length > 0)
        && hardDemandsSatisfied(sol, opts, clearTypeTotals)) {
      bestHardOnly = mergePick(bestHardOnly, sol);
    } else best = mergePick(best, sol);
  }
  return finalize();
}

// Shared demand-check for the rearrange-convert-aware candidate loop —
// duplicated intentionally (not imported from algorithm.js, which stays
// browser-pure and has no worker-boundary concerns) but kept byte-identical
// to solveRearrangeConvertAware's own `demandMissed` closure so master and
// worker never drift.
function rearrangeConvertDemandMissed(sim, opts, clearTotals) {
  return ((opts.minFirstCombos ?? 0) > 0 && (opts.exactFirstCombos ? sim.firstCombos !== opts.minFirstCombos : sim.firstCombos < opts.minFirstCombos)) ||
    ((opts.minFirstAttrCombos ?? 0) > 0 && (opts.exactFirstAttrCombos ? sim.firstAttrCombos !== opts.minFirstAttrCombos : sim.firstAttrCombos < opts.minFirstAttrCombos)) ||
    ((opts.minFirstRunes ?? 0) > 0 && (opts.exactFirstRunes ? sim.firstRunes !== opts.minFirstRunes : sim.firstRunes < opts.minFirstRunes)) ||
    (opts.clearTypes ?? []).some(t => sim.firstClearedByType[t] < clearTotals[t]) ||
    (opts.firstWaveHaveTypes ?? []).some(t => sim.firstClearedByType[t] === 0);
}

// Evaluate ONE conversion candidate end-to-end — shared by the in-process
// sequential prefix AND the worker-side message handler (same module,
// loaded fresh in both the main thread and every worker), so the two never
// drift out of sync the way hand-duplicated copies would.
//
// P59 shape, mirroring solveRearrangeConvertAware's loop exactly: for
// rune-count demands the cheap RearrangeCoveragePlanner runs FIRST (its
// solutions are exactly realizable, and live profiling put it at ~0.4s vs
// ~31-35s for a beam-160 RearrangeSolver pass); the expensive beam runs
// only when the planner missed AND the master granted `allowExpensive`
// (withheld for bound-doomed candidates once the best-effort budget is
// spent). Returns `{path, empty: true}` when nothing was produced.
function evaluateRearrangeConvertCandidate(board, opts, clearTotals, path, allowExpensive = true) {
  const convertedBoard = buildConvertedBoard(board, path, opts.convertType);
  const minRunes = opts.minFirstRunes ?? 0;
  const missed = s => rearrangeConvertDemandMissed(s, opts, clearTotals);
  let candidateBoard = null, engine = null, sim = null;

  if (minRunes > 0) { // planner-first fast path
    const planned = new RearrangeCoveragePlanner(convertedBoard, opts).solve();
    if (planned.solution) {
      candidateBoard = planned.solution.board; engine = 'RearrangeCoveragePlanner';
      sim = BoardSimulator.resolve(planned.solution.board.clone(), opts);
    }
  }

  if ((sim === null || missed(sim)) && allowExpensive) {
    const rsResult = new RearrangeSolver(convertedBoard, opts).solve();
    let rsSim = BoardSimulator.resolve(rsResult.board.clone(), opts);
    if (minRunes === 0 && missed(rsSim)) {
      // original order for non-rune-count demands: planner only as escalation
      const planned = new RearrangeCoveragePlanner(convertedBoard, opts).solve();
      if (planned.solution) {
        const plannerSim = BoardSimulator.resolve(planned.solution.board.clone(), opts);
        if (!missed(plannerSim) || plannerSim.firstRunes > rsSim.firstRunes) {
          candidateBoard = planned.solution.board; engine = 'RearrangeCoveragePlanner'; sim = plannerSim;
          rsSim = null;
        }
      }
    }
    if (rsSim !== null && (sim === null || !missed(rsSim) || (missed(sim) && rsSim.firstRunes > sim.firstRunes))) {
      candidateBoard = rsResult.board; engine = 'RearrangeSolver'; sim = rsSim;
    }
  }
  if (sim === null) return { path, empty: true };
  return {
    path, board: candidateBoard.grid, engine,
    sim: { firstCombos: sim.firstCombos, firstAttrCombos: sim.firstAttrCombos, firstRunes: sim.firstRunes, firstClearedByType: sim.firstClearedByType },
  };
}

/**
 * Parallel replacement for `solveRearrangeConvertAware` (P56). Each
 * candidate first-drag corridor already runs a fully independent fresh
 * solve in the sequential version, so distributing candidates across
 * workers changes wall time only, never the answer's quality relative to
 * trying the same candidate SET.
 *
 * TWO earlier designs were measured LIVE and both were slower than
 * sequential:
 *   1. Batches-of-`workers` rounds, `Promise.all` per batch: paid a full
 *      worker-spawn round on every batch instead of once.
 *   2. One-shot STATIC pre-sharding (candidates split into K fixed groups
 *      before knowing which would succeed): the `Promise.all` barrier
 *      waited for the SLOWEST shard to exhaust its whole list even when an
 *      early candidate in a DIFFERENT shard already succeeded.
 *   3. A "fix" for #2 — a rolling pool where K workers each pull ONE
 *      candidate at a time from a shared cursor, spawning a FRESH worker
 *      per candidate — was ALSO slower, including on the exhaustive
 *      (every-candidate-needed) case that should be parallelism's best
 *      case. Root cause, isolated directly: a brand-new worker's first
 *      `RearrangeSolver`/`BoardSimulator` call pays real cold-JIT/module-
 *      load tax (measured ~1.3s of pure warmup on a candidate whose actual
 *      work was ~80ms) — `solveDoraParallel`/`solveClearAllParallel` never
 *      pay this because they spawn K workers ONCE and feed each MANY
 *      items, amortizing warmup across a whole shard; spawning fresh per
 *      candidate pays the full tax on every single one.
 *
 * Fix: a PERSISTENT worker pool — spawn exactly `K = min(workers,
 * candidates.length)` long-lived workers ONCE, each staying alive for the
 * whole call. The master hands out candidates one at a time via
 * `postMessage`; each worker computes and replies, then either receives
 * the next candidate (reusing its now-JIT-warm state) or is terminated
 * once the master has nothing left to give it. The moment any result
 * fully satisfies the demand, the master stops dispatching new work and
 * terminates every worker immediately (killing any others mid-flight is
 * safe and cheap — they're discarded, not awaited). This gets both
 * properties right: true global early-stop (no slow-shard-dominates
 * problem) AND warmup amortized across a whole call (no per-candidate
 * cold-start tax).
 *
 * @returns same shape as `solveRearrangeConvertAware`
 */
function solveRearrangeConvertAwareParallel(board, options = {}, workers = defaultWorkers()) {
  const opts = plainOptions(options);
  if (workers <= 1) return Promise.resolve(solveRearrangeConvertAware(board, opts));

  const movableCells = computeMovableComponents(board, opts.flags ?? null).flat();
  const convertType = opts.convertType;
  const convertCount = opts.convertCount ?? Infinity;
  const maxCandidates = opts.conversionCandidates ?? 24;
  // Bound-ordered + bound-pruned exactly like the sequential function (P59)
  // — same skip proof applies (see solveRearrangeConvertAware's loop): a
  // skipped candidate can neither satisfy a minFirstRunes demand nor beat
  // the incumbent best-effort, so parallel and sequential stay
  // answer-quality-equivalent, just faster.
  const candidates = orderConversionCandidatesByBound(board,
    enumerateConversionCandidates(board, movableCells, maxCandidates), opts);

  if (candidates.length === 0) {
    // Same degenerate fallback as the sequential function (no candidates
    // generated — e.g. every movable cell is isolated).
    const result = new RearrangeSolver(board, opts).solve();
    const decomposed = decomposeRearrangement(board, result.board, movableCells, convertType, convertCount);
    return Promise.resolve({ drags: decomposed.drags, board: decomposed.board, engine: 'RearrangeSolver(no-candidates)', movableCells });
  }

  const clearTotals = Array(6).fill(0);
  for (const row of board.grid) for (const v of row) {
    const bt = v >= CURSE_BASE ? v - CURSE_BASE : (v >= SHIELD_BASE ? v - SHIELD_BASE : v);
    if (bt >= 0 && bt < FROZEN) clearTotals[bt]++;
  }
  const demandMissed = sim => rearrangeConvertDemandMissed(sim, opts, clearTotals);

  let best = null, bestSim = null, bestPath = null, bestEngine = null;
  const record = r => {
    if (r.empty) return false; // doomed candidate, beam budget withheld, planner found nothing
    const stillMissed = demandMissed(r.sim);
    const better = bestSim === null
      || (!stillMissed && demandMissed(bestSim))
      || (stillMissed === demandMissed(bestSim) && r.sim.firstRunes > bestSim.firstRunes);
    if (better) { best = r; bestSim = r.sim; bestPath = r.path; bestEngine = r.engine; }
    return !stillMissed;
  };

  // Small in-process SEQUENTIAL prefix before fanning out (measured live,
  // 2026-07-11): candidates near the front of the list frequently already
  // satisfy the demand on real boards — when that happens, sequential
  // solving needs exactly ONE candidate, but a worker pool with K>1 workers
  // ALWAYS pays for K candidates running concurrently before any of them
  // can report back (there's no way to know in advance which candidate
  // will succeed, so all K initial dispatches happen before any result is
  // known). Paying for a small, bounded sequential prefix first is cheap
  // insurance against that common case; only once the prefix is exhausted
  // WITHOUT success do we know this is a genuinely hard/exhaustive board,
  // which is exactly the case where fanning out actually pays off.
  // P59 bound prune + expensive-beam budget, shared shape with the
  // sequential loop (see solveRearrangeConvertAware's loop comment for the
  // safety proof). bestSim is read FRESH on every call (it tightens as
  // results land), so later candidates prune more aggressively than earlier
  // ones — including mid-flight in the worker dispatch loop below.
  const minRunes = opts.minFirstRunes ?? 0;
  const doomed = c => minRunes > 0 && c.bound < minRunes;
  const prunable = c => doomed(c) && bestSim !== null && bestSim.firstRunes >= c.bound;
  let expensiveBudget = 1;
  const grantExpensive = c => {
    if (!doomed(c)) return true;
    if (expensiveBudget > 0) { expensiveBudget--; return true; }
    return false;
  };

  const PREFIX = Math.min(4, candidates.length);
  let prefixTried = 0;
  for (; prefixTried < PREFIX; prefixTried++) {
    const c = candidates[prefixTried];
    if (prunable(c)) continue;
    const r = evaluateRearrangeConvertCandidate(board, opts, clearTotals, c.path, grantExpensive(c));
    if (record(r)) { prefixTried += 1; break; }
  }
  const remaining = candidates.slice(prefixTried);
  if ((bestSim !== null && !demandMissed(bestSim)) || remaining.length === 0) {
    return Promise.resolve(finishRearrangeConvertAware(board, opts, movableCells, convertType, convertCount, best, bestPath, bestEngine, 1, candidates.length));
  }

  const K = Math.min(workers, remaining.length);
  let nextIndex = 0, stop = false, active = K;

  return new Promise((resolve, reject) => {
    const finish = () => resolve(finishRearrangeConvertAware(board, opts, movableCells, convertType, convertCount, best, bestPath, bestEngine, K, candidates.length));
    const pool = [];
    const settled = new Set(); // guards against terminate()+decrement happening twice for one worker
    const settle = w => {
      if (settled.has(w)) return;
      settled.add(w);
      w.terminate();
      active -= 1;
      if (active === 0) finish();
    };
    const dispatchNext = w => {
      if (settled.has(w)) return;
      while (!stop && nextIndex < remaining.length && prunable(remaining[nextIndex])) nextIndex++;
      if (stop || nextIndex >= remaining.length) { settle(w); return; }
      const c = remaining[nextIndex++];
      w.postMessage({ path: c.path, allowExpensive: grantExpensive(c) });
    };
    for (let i = 0; i < K; i++) {
      const w = new Worker(__filename, {
        workerData: { mode: 'rearrange-convert-worker', boardGrid: board.grid, options: opts },
        resourceLimits: { maxYoungGenerationSizeMb: 128 },
      });
      pool.push(w);
      w.on('message', r => {
        if (settled.has(w)) return;
        if (!stop && record(r)) {
          stop = true;
          for (const sibling of pool) if (sibling !== w) settle(sibling);
        }
        dispatchNext(w);
      });
      w.on('error', reject);
      dispatchNext(w);
    }
  });
}

// Shared phase1/phase2 finisher for solveRearrangeConvertAwareParallel — the
// winning candidate's real first drag plus a conversion-free
// decomposeRearrangement, identical to the sequential function's tail.
function finishRearrangeConvertAware(board, opts, movableCells, convertType, convertCount, best, bestPath, bestEngine, K, candidateCount) {
  const bestBoard = new Board();
  bestBoard.fromArray(best.board);

  // Phase 1: the ACTUAL first drag, with real conversion applied — same
  // mechanics as the sequential function, run once here (cheap; not worth
  // sharding — measured ~2ms).
  const convertedBoard = buildConvertedBoard(board, bestPath, convertType);
  let cur = bestPath[0];
  const moves1 = [];
  const dirName = (dx, dy) => dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
  for (let i = 1; i < bestPath.length; i++) {
    const nxt = bestPath[i];
    moves1.push(dirName(nxt.x - cur.x, nxt.y - cur.y));
    cur = nxt;
  }
  const phase1Drag = { startX: bestPath[0].x, startY: bestPath[0].y, path: bestPath, moves: moves1 };

  // Phase 2: realize the winning candidate's board from convertedBoard with
  // NO further conversion — guaranteed exact, same as the sequential path.
  const phase2 = decomposeRearrangement(convertedBoard, bestBoard, movableCells, null, 0);

  return {
    drags: [phase1Drag, ...phase2.drags],
    board: phase2.board,
    engine: `ConvertAware(${bestEngine},candidates=${candidateCount},workers=${K})`,
    movableCells,
  };
}

/**
 * Parallel TargetPlanner.solveClearAll: plans coverage targets ONCE (pure
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
 * Parallel TargetPlanner.solveHave (P32/P33): same escalating-beam structure
 * as solveClearAllParallel, but for --first-wave-have's minimal-coverage
 * targets (ONE min-run line per demanded type, not full-count clearance).
 * Requiring several DIFFERENT types to each dissolve simultaneously in wave
 * 1 is a much tighter target than DoraSolver's beam steering reliably finds
 * (measured live: 5 types, only 2/5 achieved at beam 6400 — a genuine local
 * optimum) — this constructs the coverage directly instead of hoping the
 * beam stumbles onto it.
 */
async function solveHaveParallel(board, plannerOptions = {}, workers = defaultWorkers()) {
  const opts = plainOptions(plannerOptions);
  const planner = new TargetPlanner(board, opts);
  const targets = planner.planHaveTargets();
  if (targets.length === 0) return { solution: null, reason: 'no-feasible-target', targetsTried: 0 };
  const budget = Math.max(planner.maxTargets, 30);
  const capped = targets.slice(0, budget);

  const ceiling = opts.beamWidth ?? 300;
  const steps = [...new Set([300, 2000, 8000, 20000].filter(b => b < ceiling)), ceiling];

  let tried = 0;
  for (const beam of steps) {
    const stepOpts = { ...opts, beamWidth: beam };
    if (workers <= 1) {
      const res = new TargetPlanner(board, stepOpts).solveHave(capped);
      tried += res.targetsTried;
      if (res.solution) return { solution: res.solution, reason: 'ok', targetsTried: tried };
      continue;
    }
    const K = Math.min(workers, capped.length);
    const shards = Array.from({ length: K }, () => []);
    capped.forEach((t, i) => shards[i % K].push({ index: i, target: t }));
    const results = await Promise.all(shards.map(shard => runWorker({
      mode: 'have', boardGrid: board.grid, options: stepOpts, targets: shard,
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
  const endCells = opts.endCells ?? (opts.endCell ? [opts.endCell] : null);
  const fireRoute = opts.fireRoute ?? 0;
  const twoMatch = opts.twoMatch ?? null;
  const clearTypes = opts.clearTypes ?? [];
  const firstWaveNoTypes = opts.firstWaveNoTypes ?? [];
  const firstWaveHaveTypes = opts.firstWaveHaveTypes ?? [];
  const reserveTypes = opts.reserveTypes ?? [];
  const noSolvableTypes = opts.noSolvableTypes ?? [];
  const hazardPositions = opts.hazardPositions ?? null;
  const minFirstAttrCombos = opts.minFirstAttrCombos ?? 0;
  const exactFirstAttrCombos = opts.exactFirstAttrCombos ?? false;
  const convertType = opts.convertType ?? null;
  const convertCount = opts.convertCount ?? 0;
  const wantGroupType = opts.wantGroupType ?? null;
  const wantGroupSize = opts.wantGroupSize ?? 0;
  const bound = computeMaxFirstCombosBound(board, opts);

  const dora = await solveDoraParallel(board, {
    beamWidth: opts.beamWidth ?? 200, maxPath: opts.maxPath ?? 30,
    sealedColumns, flags, minFirstCombos: bound, minFirstAttrCombos, exactFirstAttrCombos,
    priorityCells: opts.priorityCells ?? [], startCells, endCells, fireRoute, twoMatch, clearTypes, firstWaveNoTypes, firstWaveHaveTypes, reserveTypes, noSolvableTypes, hazardPositions, convertType, convertCount, wantGroupType, wantGroupSize,
  }, workers);
  let best = dora, achieved = dora.firstCombos;

  for (let n = bound; n > achieved; n--) {
    const plannerOpts = {
      sealedColumns, flags, minFirstCombos: n, minFirstAttrCombos, exactFirstAttrCombos, convertType, convertCount,
      beamWidth: opts.plannerBeamWidth ?? 300,
      maxPath: opts.plannerMaxPath ?? 60,
      startCells, endCells, fireRoute, twoMatch, clearTypes, firstWaveNoTypes, firstWaveHaveTypes, reserveTypes, noSolvableTypes, hazardPositions,
    };
    const res = clearTypes.length > 0
      ? await solveClearAllParallel(board, plannerOpts, workers)
      : firstWaveHaveTypes.length > 0
        ? await solveHaveParallel(board, plannerOpts, workers)
        : new TargetPlanner(board, plannerOpts).solve();
    if (res.solution) { best = res.solution; achieved = n; break; }
  }
  return { solution: best, achieved, bound };
}

// ---------- worker side ----------
if (!isMainThread && workerData && (workerData.mode === 'dora' || workerData.mode === 'clear-all' || workerData.mode === 'have')) {
  const board = new Board();
  board.fromArray(workerData.boardGrid);
  if (workerData.mode === 'dora') {
    const sol = new DoraSolver(board, { ...workerData.options, seedBeam: workerData.seedBeam }).solve();
    sol.board = sol.board.grid; // Board instances don't structured-clone
    parentPort.postMessage(sol);
  } else {
    // Route this shard's coverage targets; report the shard's best plus the
    // planned index of that target so the master can keep the serial order
    // preference on combo ties. 'clear-all' (P14, full-count coverage) and
    // 'have' (P32/P33, one-line-per-type coverage) share this shard loop —
    // only which TargetPlanner method routes each target differs.
    let best = null, bestCombos = -1, bestIndex = Infinity, tried = 0;
    const planner = new TargetPlanner(board, workerData.options);
    for (const { index, target } of workerData.targets) {
      const res = workerData.mode === 'have' ? planner.solveHave([target]) : planner.solveClearAll([target]);
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

if (!isMainThread && workerData && workerData.mode === 'rearrange-convert-worker') {
  // Persistent worker for solveRearrangeConvertAwareParallel: board/opts/
  // clearTotals setup happens ONCE per worker lifetime (not once per
  // candidate) — the master feeds this worker candidates one at a time via
  // postMessage, reusing this already-JIT-warm worker across all of them,
  // which is the whole point of this design (see the master function's
  // doc comment for why a fresh-worker-per-candidate design was slower).
  const board = new Board();
  board.fromArray(workerData.boardGrid);
  const opts = workerData.options;
  const clearTotals = Array(6).fill(0);
  for (const row of board.grid) for (const v of row) {
    const bt = v >= CURSE_BASE ? v - CURSE_BASE : (v >= SHIELD_BASE ? v - SHIELD_BASE : v);
    if (bt >= 0 && bt < FROZEN) clearTotals[bt]++;
  }
  parentPort.on('message', msg => {
    parentPort.postMessage(evaluateRearrangeConvertCandidate(board, opts, clearTotals, msg.path, msg.allowExpensive ?? true));
  });
}

module.exports = { solveDoraParallel, solveClearAllParallel, solveHaveParallel, solveMaxFirstCombosParallel, solveRearrangeConvertAwareParallel, defaultWorkers };
