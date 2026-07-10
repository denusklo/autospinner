// TOS Auto Spinner - Rune Movement Algorithm

/**
 * Per-cell constraint flags for real-game board effects (PROJECT-FACTS P9).
 * Passed as a 5x6 bitmask grid `flags[y][x]`; flags are POSITIONAL — they
 * stay with the cell, not the rune (matches the sealed-column observation;
 * per-rune travelling effects use a different mechanism — see FROZEN below).
 * Combine freely: e.g. a frozen rune = NO_PICKUP | NO_SWAP.
 */
const CELL_FLAGS = {
  NO_DISSOLVE: 1, // cell never joins a match group (sealed column/tile)
  NO_PICKUP: 2,   // rune cannot be grabbed as the held rune
  NO_SWAP: 4,     // cell cannot be entered/displaced by a drag path
};

/**
 * Frozen rune (PROJECT-FACTS P16 ice mechanic): a PER-RUNE travelling effect,
 * unlike the positional CELL_FLAGS above. In-game an ICED rune is fully
 * normal and dissolvable, but if it survives a spin round it FREEZES for 3
 * rounds. A frozen rune moves, swaps, and falls like any other rune (the ice
 * shell travels WITH it) but never joins a match group until the freeze
 * expires (between turns — so within one solve it simply never dissolves).
 * Modeled as a 7th rune value on the board grid: excluded from run scans,
 * pair potential, and color-count bounds. Its base element is irrelevant
 * while frozen. (The dissolvable iced pre-state needs no special value — it
 * plays as its base element.) Only BoardSimulator / DoraSolver /
 * TargetPlanner understand this value — never feed frozen boards to the
 * legacy solvers (MatchFinder etc.), which would match 6s as a color.
 */
const FROZEN = 6;

// Attribute rune types (屬性珠): every element except Heart. Used by the
// first-wave attribute-combo target (首消N屬) for steering/qualification.
const ATTR_TYPES = [0, 1, 2, 3, 4];

/**
 * Shielded rune (PROJECT-FACTS P24, corrected 2026-07-10 — see P30/L40): a
 * PER-RUNE travelling status, same family as FROZEN above (travels WITH the
 * dragged rune, so it needs the same in-band board-value trick — a plain
 * positional Set can't follow a rune through a drag path). UNLIKE frozen,
 * a shielded rune matches and dissolves completely normally (joins runs with
 * plain runes of the same color, counts toward clear-type demands, etc.) —
 * the ONLY special rule is at the WHOLE-BOARD level: if a color still has
 * >=1 shielded rune before this move, it must still have >=1 AFTER every
 * cascade wave resolves (User-stated: "if board has zero shield rune, the
 * card cannot attack"). Modeled as SHIELD_BASE + baseType (values 7..12 for
 * the 6 rune types) so the value travels through Board.swap/set/clone
 * exactly like FROZEN does, with no extra per-call wiring needed anywhere
 * that only moves values around. Anywhere board values are inspected for
 * their MATCHABLE type (run scans, pair potential, clear-type totals),
 * convert through `baseType()` first; anywhere the raw distinction matters
 * (is this specific cell shielded right now), use `isShielded()`.
 */
const SHIELD_BASE = 7;

/**
 * Cursed rune (PROJECT-FACTS P37, corrected P38: originally modeled
 * POSITIONALLY like the fire-hazard mechanic — WRONG, per live User
 * correction: "the curse badge will follow the rune unlike fire-hazard
 * mechanic"). Same PER-RUNE travelling family as shield/FROZEN above, so it
 * needs the same in-band board-value trick. UNLIKE shield (a per-COLOR count
 * floor), a cursed rune's rule is a hard per-INSTANCE "never": it matches
 * and dissolves completely normally (joins runs with plain runes of the
 * same color), but a board where a cursed cell's rune actually gets swept
 * into ANY wave's dissolving group is simply forbidden as an answer — same
 * "matches normally, reject the outcome" posture as the ORIGINAL
 * hazardPositions fix (P22/P23/L34), just tracked by RUNE IDENTITY (this
 * board value) instead of a fixed board COORDINATE, since the User confirmed
 * this effect travels with the dragged rune through swaps/gravity, a plain
 * position Set cannot follow that.
 */
const CURSE_BASE = 13;
const TYPE_OF_TABLE = [0, 1, 2, 3, 4, 5, FROZEN, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5];
function baseType(v) { return v >= 0 ? TYPE_OF_TABLE[v] : v; }
function isShielded(v) { return v >= SHIELD_BASE && v < CURSE_BASE; }
function isCursed(v) { return v >= CURSE_BASE; }

// Reusable scratch buffers for BoardSimulator.findComboGroups (hot path:
// millions of calls per solve; per-call allocation made GC ~46% of solver
// CPU). Safe because the function never re-enters and JS isolates are
// single-threaded (each worker thread is its own isolate with its own copy).
let comboBlocked = new Uint8Array(30);
let comboMarked = new Uint8Array(30);
let comboVisited = new Uint8Array(30);
const comboStack = [];

/**
 * Fire-route constraint (AutoDora spec §4.4, "--fire-route"): every cell the
 * finger LEAVES catches fire; the fire lasts `fireLen` moves, and a move that
 * re-enters a still-burning cell is forbidden. As the finger advances the
 * oldest fired cell is released. `path` includes the CURRENT cell as its last
 * element, so the burning window is the `fireLen` cells immediately BEFORE it
 * (the current cell you're standing on is not a re-entry target). Returns true
 * if moving to (nx,ny) is blocked. fireLen<=0 disables the constraint.
 * (Subsumes the no-immediate-backtrack rule for fireLen>=1.)
 */
/**
 * Compact board-state key (internal dedup/cache use only): one char per cell
 * (rune values -1..6 → char codes 49..56), ~half the bytes of the old
 * `grid.join(';')` key so Map/Set hashing and key retention cost less. The
 * mapping is bijective per board size, so dedup/cache semantics are
 * unchanged. Callers append one held-cell char (33 + cell index) for
 * board+cell keys; those live in separate Sets/Maps from bare grid keys,
 * so the two key kinds never collide.
 */
const keyScratch = [];
function gridKeyOf(board) {
  const g = board.grid, h = board.height, w = board.width;
  keyScratch.length = w * h;
  let i = 0;
  for (let y = 0; y < h; y++) {
    const row = g[y];
    for (let x = 0; x < w; x++) keyScratch[i++] = row[x] + 50;
  }
  return String.fromCharCode.apply(String, keyScratch);
}

function fireBlocked(path, nx, ny, fireLen) {
  if (fireLen <= 0) return false;
  const end = path.length - 1; // current cell index — excluded (you're on it)
  for (let i = end - 1; i >= 0 && i >= end - fireLen; i--) {
    if (path[i].x === nx && path[i].y === ny) return true;
  }
  return false;
}

// Touch-conversion card skill: perform one drag step from (x,y) to (nx,ny)
// on `board` (mutated in place), converting the touched destination cell to
// `convertType` first if this move's 1-indexed touch number is within
// `convertCount`. `touchIndex` = the caller's current path length BEFORE
// appending this move (path starts at length 1 with just the start cell, so
// the first move is touch #1). No-op swap (plain Board.swap) when
// convertType is null or convertCount is 0.
function applyDragSwap(board, x, y, nx, ny, touchIndex, convertType, convertCount) {
  if (convertType !== null && touchIndex <= convertCount) {
    board.set(nx, ny, convertType);
  }
  board.swap(x, y, nx, ny);
}

function firstWaveNoOk(sim, types) {
  for (const t of types ?? []) {
    if ((sim.firstClearedByType[t] ?? 0) > 0) return false;
  }
  return true;
}

// --first-wave-have (P32): the mirror image of firstWaveNoOk — every listed
// type must clear AT LEAST ONE rune in wave 1 (not necessarily all of it,
// unlike clearTypes/P14). Callers are expected to pass an already-feasible
// list (autospin.js drops types with too few runes on the board before
// calling the solver, per the CLEAR_ALL_INFEASIBLE-style interactive prompt).
function firstWaveHaveOk(sim, types) {
  for (const t of types ?? []) {
    if ((sim.firstClearedByType[t] ?? 0) === 0) return false;
  }
  return true;
}

/**
 * Represents the game board state
 */
class Board {
  constructor(width = 6, height = 5) {
    this.width = width;
    this.height = height;
    this.grid = [];
  }

  /**
   * Initialize board from array
   * @param {Array<Array<number>>} grid - 2D array where numbers represent rune types
   * Rune types: 0=Water, 1=Fire, 2=Wood, 3=Light, 4=Dark, 5=Heart
   */
  fromArray(grid) {
    this.grid = grid.map(row => [...row]);
  }

  /**
   * Get rune at position
   */
  get(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return -1;
    }
    return this.grid[y][x];
  }

  /**
   * Set rune at position
   */
  set(x, y, value) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.grid[y][x] = value;
    }
  }

  /**
   * Swap two positions
   */
  swap(x1, y1, x2, y2) {
    const temp = this.get(x1, y1);
    this.set(x1, y1, this.get(x2, y2));
    this.set(x2, y2, temp);
  }

  /**
   * Clone the board
   */
  clone() {
    const newBoard = new Board(this.width, this.height);
    newBoard.fromArray(this.grid);
    return newBoard;
  }

  /**
   * Print board to console (for debugging)
   */
  print() {
    const symbols = ['💧', '🔥', '🌿', '💡', '🌙', '❤️'];
    console.log('Board:');
    for (let y = 0; y < this.height; y++) {
      let row = '';
      for (let x = 0; x < this.width; x++) {
        const rune = this.get(x, y);
        row += symbols[rune] || '?';
      }
      console.log(row);
    }
  }
}

/**
 * Find matches on the board
 */
class MatchFinder {
  constructor(board) {
    this.board = board;
  }

  /**
   * Find all matches of 3 or more
   * @returns {Array<Object>} Array of match objects with {type, positions}
   */
  findMatches() {
    const matches = [];
    const matched = new Set();

    // Check horizontal matches
    for (let y = 0; y < this.board.height; y++) {
      for (let x = 0; x < this.board.width - 2; x++) {
        const type = this.board.get(x, y);
        if (type === -1) continue;

        let count = 1;
        let positions = [[x, y]];

        for (let dx = 1; x + dx < this.board.width; dx++) {
          if (this.board.get(x + dx, y) === type) {
            count++;
            positions.push([x + dx, y]);
          } else {
            break;
          }
        }

        if (count >= 3) {
          matches.push({type, positions, direction: 'horizontal'});
          positions.forEach(pos => matched.add(`${pos[0]},${pos[1]}`));
        }
      }
    }

    // Check vertical matches
    for (let x = 0; x < this.board.width; x++) {
      for (let y = 0; y < this.board.height - 2; y++) {
        const type = this.board.get(x, y);
        if (type === -1) continue;

        let count = 1;
        let positions = [[x, y]];

        for (let dy = 1; y + dy < this.board.height; dy++) {
          if (this.board.get(x, y + dy) === type) {
            count++;
            positions.push([x, y + dy]);
          } else {
            break;
          }
        }

        if (count >= 3) {
          matches.push({type, positions, direction: 'vertical'});
          positions.forEach(pos => matched.add(`${pos[0]},${pos[1]}`));
        }
      }
    }

    return matches;
  }

  /**
   * Calculate score for current board state
   */
  calculateScore() {
    const matches = this.findMatches();
    let score = 0;

    for (const match of matches) {
      // Basic scoring: more runes = higher score
      score += match.positions.length * 10;

      // Bonus for longer matches
      if (match.positions.length >= 4) {
        score += 20;
      }
      if (match.positions.length >= 5) {
        score += 50;
      }
    }

    // Bonus for number of combos
    score += matches.length * 25;

    return {score, comboCount: matches.length, matches};
  }
}

/**
 * Path finder for rune movement
 */
class PathFinder {
  constructor(board, startX, startY) {
    this.board = board;
    this.startX = startX;
    this.startY = startY;
  }

  /**
   * Generate a movement path
   * @param {Array<string>} directions - Array of directions ('up', 'down', 'left', 'right')
   * @returns {Object} Final board state and path
   */
  generatePath(directions) {
    const board = this.board.clone();
    const path = [{x: this.startX, y: this.startY}];
    let currentX = this.startX;
    let currentY = this.startY;

    for (const dir of directions) {
      let nextX = currentX;
      let nextY = currentY;

      switch (dir) {
        case 'up':
          nextY = Math.max(0, currentY - 1);
          break;
        case 'down':
          nextY = Math.min(board.height - 1, currentY + 1);
          break;
        case 'left':
          nextX = Math.max(0, currentX - 1);
          break;
        case 'right':
          nextX = Math.min(board.width - 1, currentX + 1);
          break;
      }

      // Swap positions on the board
      board.swap(currentX, currentY, nextX, nextY);

      currentX = nextX;
      currentY = nextY;
      path.push({x: currentX, y: currentY});
    }

    return {board, path};
  }

  /**
   * Find best path using simple heuristic search
   * @param {number} maxMoves - Maximum number of moves
   * @returns {Object} Best path and resulting score
   */
  findBestPath(maxMoves = 20) {
    let bestScore = 0;
    let bestPath = [];
    let bestBoard = null;

    // Simple random search (can be improved with better algorithms)
    const directions = ['up', 'down', 'left', 'right'];
    const attempts = 100;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const moves = [];
      for (let i = 0; i < maxMoves; i++) {
        moves.push(directions[Math.floor(Math.random() * directions.length)]);
      }

      const result = this.generatePath(moves);
      const matcher = new MatchFinder(result.board);
      const scoreData = matcher.calculateScore();

      if (scoreData.score > bestScore) {
        bestScore = scoreData.score;
        bestPath = result.path;
        bestBoard = result.board;
      }
    }

    return {
      path: bestPath,
      score: bestScore,
      board: bestBoard
    };
  }
}

/**
 * Maximizes combos by finding optimal board arrangement
 */
class ComboMaximizer {
  constructor(board) {
    this.board = board;
  }

  /**
   * Count runes by type
   * @returns {Array<number>} Count for each rune type (0-5)
   */
  countRunes() {
    const counts = [0, 0, 0, 0, 0, 0];
    for (let y = 0; y < this.board.height; y++) {
      for (let x = 0; x < this.board.width; x++) {
        const rune = this.board.get(x, y);
        if (rune >= 0 && rune < 6) {
          counts[rune]++;
        }
      }
    }
    return counts;
  }

  /**
   * Generate optimal target board using greedy placement
   * @returns {Board} Target board with maximized combos
   */
  generateTargetBoard() {
    const counts = this.countRunes();
    const targetBoard = new Board(this.board.width, this.board.height);

    // Initialize with -1 (empty)
    targetBoard.grid = Array(this.board.height).fill(0).map(() => Array(this.board.width).fill(-1));

    // Sort rune types by count (descending) to place most abundant runes first
    const runeTypes = counts.map((count, type) => ({type, count}))
                            .filter(r => r.count > 0)
                            .sort((a, b) => b.count - a.count);

    let placementsMade = [];

    // Try to place runes in combos (prioritize longer combos)
    for (const {type, count} of runeTypes) {
      let remaining = count;

      // Try to place 5-combos horizontally
      while (remaining >= 5) {
        const pos = this.findEmptyRow(targetBoard, 5);
        if (pos) {
          for (let i = 0; i < 5; i++) {
            targetBoard.set(pos.x + i, pos.y, type);
          }
          placementsMade.push({type, size: 5, orientation: 'horizontal'});
          remaining -= 5;
        } else {
          break;
        }
      }

      // Try to place 4-combos horizontally
      while (remaining >= 4) {
        const pos = this.findEmptyRow(targetBoard, 4);
        if (pos) {
          for (let i = 0; i < 4; i++) {
            targetBoard.set(pos.x + i, pos.y, type);
          }
          placementsMade.push({type, size: 4, orientation: 'horizontal'});
          remaining -= 4;
        } else {
          break;
        }
      }

      // Try to place 3-combos horizontally
      while (remaining >= 3) {
        const pos = this.findEmptyRow(targetBoard, 3);
        if (pos) {
          for (let i = 0; i < 3; i++) {
            targetBoard.set(pos.x + i, pos.y, type);
          }
          placementsMade.push({type, size: 3, orientation: 'horizontal'});
          remaining -= 3;
        } else {
          break;
        }
      }

      // Place remaining runes in available spots (try to group them)
      if (remaining > 0) {
        const emptyPositions = this.findAllEmptyPositions(targetBoard);
        for (let i = 0; i < Math.min(remaining, emptyPositions.length); i++) {
          const pos = emptyPositions[i];
          targetBoard.set(pos.x, pos.y, type);
        }
      }
    }

    return targetBoard;
  }

  /**
   * Find an empty horizontal row segment of specified length
   */
  findEmptyRow(board, length) {
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x <= board.width - length; x++) {
        let allEmpty = true;
        for (let i = 0; i < length; i++) {
          if (board.get(x + i, y) !== -1) {
            allEmpty = false;
            break;
          }
        }
        if (allEmpty) {
          return {x, y};
        }
      }
    }
    return null;
  }

  /**
   * Find all empty positions on the board
   */
  findAllEmptyPositions(board) {
    const positions = [];
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        if (board.get(x, y) === -1) {
          positions.push({x, y});
        }
      }
    }
    return positions;
  }
}

/**
 * Beam Search Solver for finding optimal paths
 */
class BeamSearchSolver {
  constructor(board, beamWidth = 10, maxMoves = 25, verbose = true) {
    this.board = board;
    this.beamWidth = beamWidth; // Number of best candidates to keep
    this.maxMoves = maxMoves;
    this.verbose = verbose; // Whether to log progress
  }

  /**
   * Calculate heuristic: how close is current board to target board
   * Lower is better (distance to target)
   */
  calculateDistanceToTarget(currentBoard, targetBoard) {
    let distance = 0;
    const width = currentBoard.width;
    const height = currentBoard.height;

    // Count runes in correct positions
    let correctPositions = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (currentBoard.get(x, y) === targetBoard.get(x, y)) {
          correctPositions++;
        }
      }
    }

    // Higher correct positions = lower distance
    distance = (width * height) - correctPositions;
    return distance;
  }

  /**
   * Find path to target board using beam search
   * @param {Board} targetBoard - The target board configuration (optional)
   * @param {number} startX - Starting position X
   * @param {number} startY - Starting position Y
   * @returns {Object} Best path found and resulting score
   */
  findPathToTarget(targetBoard, startX, startY) {
    const directions = ['up', 'down', 'left', 'right'];

    // State: {board, path, currentX, currentY, score, distance}
    let beam = [{
      board: this.board.clone(),
      path: [{x: startX, y: startY}],
      currentX: startX,
      currentY: startY,
      moves: []
    }];

    let bestResult = null;
    let bestScore = -Infinity;
    let noImprovementCount = 0;

    for (let moveCount = 0; moveCount < this.maxMoves; moveCount++) {
      const candidates = [];
      const seenStates = new Set(); // Deduplicate board states

      // Progress logging every 5 moves
      if (this.verbose && moveCount % 5 === 0 && moveCount > 0) {
        console.log(`Move ${moveCount}/${this.maxMoves}: Best score so far: ${bestScore} (${bestResult?.comboCount || 0} combos)`);
      }

      // Generate all possible next states
      for (const state of beam) {
        for (const dir of directions) {
          const newState = this.makeMove(state, dir);
          if (newState) {
            // Create hash of board state to avoid duplicates
            const stateHash = this.hashBoard(newState.board);
            if (seenStates.has(stateHash)) {
              continue; // Skip duplicate states
            }
            seenStates.add(stateHash);

            // Calculate fitness: combination of score and distance to target
            const matcher = new MatchFinder(newState.board);
            const scoreData = matcher.calculateScore();

            let distance = 0;
            if (targetBoard) {
              distance = this.calculateDistanceToTarget(newState.board, targetBoard);
            }

            // Fitness = score - (distance penalty)
            // Higher score is better, lower distance is better
            newState.score = scoreData.score;
            newState.distance = distance;
            newState.fitness = targetBoard ? scoreData.score - (distance * 1.5) : scoreData.score;
            newState.comboCount = scoreData.comboCount;

            candidates.push(newState);

            // Track best result so far
            if (scoreData.score > bestScore) {
              bestScore = scoreData.score;
              noImprovementCount = 0;
              bestResult = {
                path: newState.path,
                moves: newState.moves,
                score: scoreData.score,
                comboCount: scoreData.comboCount,
                board: newState.board
              };
            }
          }
        }
      }

      if (candidates.length === 0) break;

      // Keep only top beamWidth candidates
      candidates.sort((a, b) => b.fitness - a.fitness);
      beam = candidates.slice(0, this.beamWidth);

      // Early termination if no improvement for several iterations
      noImprovementCount++;
      if (noImprovementCount > 10 && bestScore > 0) {
        if (this.verbose) {
          console.log(`Early termination at move ${moveCount} (no improvement for 10 iterations)`);
        }
        break;
      }
    }

    return bestResult || {path: [{x: startX, y: startY}], moves: [], score: 0, comboCount: 0};
  }

  /**
   * Create a hash of the board state for deduplication
   */
  hashBoard(board) {
    let hash = '';
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        hash += board.get(x, y);
      }
    }
    return hash;
  }

  /**
   * Make a move in a given direction
   */
  makeMove(state, direction) {
    const {board, path, currentX, currentY, moves} = state;
    let nextX = currentX;
    let nextY = currentY;

    switch (direction) {
      case 'up':
        nextY = currentY - 1;
        break;
      case 'down':
        nextY = currentY + 1;
        break;
      case 'left':
        nextX = currentX - 1;
        break;
      case 'right':
        nextX = currentX + 1;
        break;
    }

    // Check bounds
    if (nextX < 0 || nextX >= board.width || nextY < 0 || nextY >= board.height) {
      return null;
    }

    // Create new state
    const newBoard = board.clone();
    newBoard.swap(currentX, currentY, nextX, nextY);

    return {
      board: newBoard,
      path: [...path, {x: nextX, y: nextY}],
      currentX: nextX,
      currentY: nextY,
      moves: [...moves, direction]
    };
  }

  /**
   * Find best path from all starting positions
   * @param {Board} targetBoard - Optional target board to aim for
   * @returns {Object} Best solution found
   */
  solve(targetBoard = null) {
    let bestOverall = {score: 0, path: [], startX: 0, startY: 0};

    // If no target provided, just maximize score
    if (!targetBoard) {
      // Try a subset of starting positions (not all to save time)
      const positions = this.getSampledStartPositions();

      for (const {x, y} of positions) {
        const result = this.findPathToTarget(null, x, y);
        if (result.score > bestOverall.score) {
          bestOverall = {
            score: result.score,
            path: result.path,
            moves: result.moves,
            comboCount: result.comboCount,
            startX: x,
            startY: y,
            board: result.board
          };
        }
      }
    } else {
      // Try all starting positions when we have a target
      const totalPositions = this.board.width * this.board.height;
      let positionsTried = 0;

      for (let y = 0; y < this.board.height; y++) {
        for (let x = 0; x < this.board.width; x++) {
          positionsTried++;
          if (this.verbose) {
            console.log(`Trying start position (${x}, ${y}) [${positionsTried}/${totalPositions}]...`);
          }

          const result = this.findPathToTarget(targetBoard, x, y);
          if (result.score > bestOverall.score) {
            if (this.verbose) {
              console.log(`  ✓ New best! Score: ${result.score}, Combos: ${result.comboCount}`);
            }
            bestOverall = {
              score: result.score,
              path: result.path,
              moves: result.moves,
              comboCount: result.comboCount,
              startX: x,
              startY: y,
              board: result.board
            };
          } else if (this.verbose) {
            console.log(`  Score: ${result.score}`);
          }
        }
      }
    }

    return bestOverall;
  }

  /**
   * Get sampled starting positions (to reduce computation)
   */
  getSampledStartPositions() {
    const positions = [];
    const width = this.board.width;
    const height = this.board.height;

    // Sample corners, center, and a few random positions
    positions.push({x: 0, y: 0}); // Top-left
    positions.push({x: width - 1, y: 0}); // Top-right
    positions.push({x: 0, y: height - 1}); // Bottom-left
    positions.push({x: width - 1, y: height - 1}); // Bottom-right
    positions.push({x: Math.floor(width / 2), y: Math.floor(height / 2)}); // Center

    // Add some random positions
    for (let i = 0; i < 10; i++) {
      positions.push({
        x: Math.floor(Math.random() * width),
        y: Math.floor(Math.random() * height)
      });
    }

    return positions;
  }
}

/**
 * Unlimited-time intensive solver using parallel beam search
 */
class UnlimitedSolver {
  constructor(board) {
    this.board = board;
  }

  /**
   * Run exhaustive search with no time limit
   * Uses iterative deepening and multiple beam widths
   */
  async solve(targetBoard = null, onProgress = null) {
    console.log('=== UNLIMITED SEARCH MODE ===');
    console.log('This will run until no better solution is found');
    console.log('Press Ctrl+C in console to stop early');

    let globalBest = {score: 0, path: [], startX: 0, startY: 0};
    let iterationCount = 0;
    let noImprovementIterations = 0;
    const maxNoImprovement = 5; // Stop after 5 full iterations with no improvement

    // Phase 1: Wide beam search with increasing depth
    const beamWidths = [50, 100, 150];
    const moveLimits = [30, 50, 70, 100];

    for (const beamWidth of beamWidths) {
      for (const maxMoves of moveLimits) {
        iterationCount++;
        console.log(`\n--- Iteration ${iterationCount}: Beam=${beamWidth}, Moves=${maxMoves} ---`);

        const result = await this.runParallelSearch(targetBoard, beamWidth, maxMoves, onProgress);

        if (result.score > globalBest.score) {
          globalBest = result;
          noImprovementIterations = 0;
          console.log(`🎯 NEW GLOBAL BEST! Score: ${result.score}, Combos: ${result.comboCount}`);
        } else {
          noImprovementIterations++;
          console.log(`No improvement (${result.score} <= ${globalBest.score})`);
        }

        // Update UI if callback provided
        if (onProgress) {
          onProgress({
            iteration: iterationCount,
            bestScore: globalBest.score,
            bestCombos: globalBest.comboCount,
            currentBeam: beamWidth,
            currentMoves: maxMoves
          });
        }
      }
    }

    // Phase 2: Targeted search from best positions
    console.log('\n--- Phase 2: Refinement ---');
    console.log('Focusing on most promising starting positions...');

    // Try the best starting position with extreme parameters
    const ultraSolver = new BeamSearchSolver(this.board, 200, 150, false); // Silent for now
    const ultraResult = ultraSolver.solve(targetBoard);

    if (ultraResult.score > globalBest.score) {
      globalBest = ultraResult;
      console.log(`🎯 ULTRA SEARCH IMPROVED! Score: ${ultraResult.score}, Combos: ${ultraResult.comboCount}`);
    }

    console.log('\n=== SEARCH COMPLETE ===');
    console.log(`Final Best Score: ${globalBest.score}`);
    console.log(`Final Best Combos: ${globalBest.comboCount}`);
    console.log(`Iterations Run: ${iterationCount}`);
    console.log('========================\n');

    return globalBest;
  }

  /**
   * Run beam search from all starting positions in parallel (simulated)
   */
  async runParallelSearch(targetBoard, beamWidth, maxMoves, onProgress) {
    const positions = this.getAllStartPositions();
    let best = {score: 0, path: [], startX: 0, startY: 0};

    // Process positions in batches to avoid blocking UI too long
    const batchSize = 5;
    for (let i = 0; i < positions.length; i += batchSize) {
      const batch = positions.slice(i, Math.min(i + batchSize, positions.length));

      // Process batch
      for (const pos of batch) {
        const solver = new BeamSearchSolver(this.board, beamWidth, maxMoves, false); // Silent mode
        const result = solver.findPathToTarget(targetBoard, pos.x, pos.y);

        if (result.score > best.score) {
          best = {
            ...result,
            startX: pos.x,
            startY: pos.y
          };
        }
      }

      // Yield to browser to keep UI responsive
      await this.sleep(10);

      if (onProgress && i % 10 === 0) {
        onProgress({
          positionsChecked: i,
          totalPositions: positions.length,
          bestScore: best.score
        });
      }
    }

    return best;
  }

  /**
   * Get all possible starting positions
   */
  getAllStartPositions() {
    const positions = [];
    for (let y = 0; y < this.board.height; y++) {
      for (let x = 0; x < this.board.width; x++) {
        positions.push({x, y});
      }
    }
    return positions;
  }

  /**
   * Sleep helper for async operation
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main solver class
 */
class RuneSolver {
  constructor(boardState) {
    this.board = new Board();
    this.board.fromArray(boardState);
  }

  /**
   * Find the best move
   * @returns {Object} Best starting position and path
   */
  solve() {
    let bestOverall = {score: 0, path: [], startX: 0, startY: 0};

    // Try starting from each position
    for (let y = 0; y < this.board.height; y++) {
      for (let x = 0; x < this.board.width; x++) {
        const pathFinder = new PathFinder(this.board, x, y);
        const result = pathFinder.findBestPath(30);

        if (result.score > bestOverall.score) {
          bestOverall = {
            score: result.score,
            path: result.path,
            startX: x,
            startY: y,
            board: result.board
          };
        }
      }
    }

    return bestOverall;
  }
}

/**
 * Exact forward model of the puzzle (per docs/autodora-algorithm-spec.md §2 Steps 3-4).
 * Unlike MatchFinder, this: (a) never double-counts runs of 4+, (b) merges
 * L/T-shaped connected matches into one combo via flood fill, (c) simulates
 * clear -> gravity -> cascade chains. No skyfall: cleared cells stay empty
 * (spec §7 states skyfall is animation-only for solving).
 * Rune encoding is this project's (0=Water..5=Heart), NOT the spec's — see
 * PROJECT-FACTS.md F9.
 */
class BoardSimulator {
  /**
   * Find combo groups on a static board.
   * @param {number[]} sealedColumns columns whose runes can be dragged but
   *   never dissolve (real-game special mode, PROJECT-FACTS P6/P9); sealed
   *   cells break runs and never join groups.
   * @param {number[][]|null} flags per-cell CELL_FLAGS bitmask grid; cells
   *   with NO_DISSOLVE behave like sealed cells. Composes with sealedColumns.
   * @param {Iterable<number>|null} twoMatch rune types that dissolve at a run of
   *   TWO instead of three (boss mechanic, `--2-match`). Everything else needs 3.
   * @param {Iterable<number>|null} noSolvableTypes rune types that never dissolve,
   *   even when aligned in a valid run.
   * @returns {Array<{type: number, cells: Array<[number, number]>}>}
   */
  static findComboGroups(board, sealedColumns = [], flags = null, twoMatch = null, noSolvableTypes = null) {
    // HOT PATH: called for every beam child and every cascade wave (millions
    // of times per solve). Internals use flat Uint8Arrays and bitmasks
    // instead of Sets/nested bool arrays/closures — the results (group
    // discovery order, cell order within groups) are bit-identical to the
    // original implementation (guarded by verify.js U1-U3/S/TM checks and a
    // fixed-board diff at the 2026-07-09 rewrite).
    const w = board.width, h = board.height, g = board.grid;
    let sealedMask = 0;
    for (const c of sealedColumns) sealedMask |= 1 << c;
    let twoMask = 0;
    if (twoMatch) for (const t of twoMatch) twoMask |= 1 << t;
    let noSolveMask = 0;
    if (noSolvableTypes) for (const t of noSolvableTypes) noSolveMask |= 1 << t;
    const n = w * h;
    // Module-level scratch reused across calls (this function never calls
    // itself and each JS isolate is single-threaded, so no reentrancy): GC
    // churn from per-call buffers was ~46% of solver CPU before this.
    if (comboBlocked.length < n) {
      comboBlocked = new Uint8Array(n); comboMarked = new Uint8Array(n); comboVisited = new Uint8Array(n);
    }
    const blocked = comboBlocked, marked = comboMarked, visited = comboVisited;
    blocked.fill(0, 0, n); marked.fill(0, 0, n); visited.fill(0, 0, n);
    for (let y = 0; y < h; y++) {
      const frow = flags === null ? null : flags[y];
      for (let x = 0; x < w; x++) {
        if (((sealedMask >>> x) & 1) === 1 || (frow !== null && (frow[x] & CELL_FLAGS.NO_DISSOLVE) !== 0)) {
          blocked[y * w + x] = 1;
        }
      }
    }

    // Row scan: mark maximal runs meeting the type's threshold (advance past
    // each run — no double count)
    for (let y = 0; y < h; y++) {
      const row = g[y], base = y * w;
      let x = 0;
      while (x < w) {
        const type = baseType(row[x]);
        if (type === -1 || type === FROZEN || ((noSolveMask >>> type) & 1) === 1 || blocked[base + x] === 1) { x++; continue; }
        let end = x + 1;
        while (end < w && blocked[base + end] === 0 && baseType(row[end]) === type) end++;
        if (end - x >= (((twoMask >>> type) & 1) === 1 ? 2 : 3)) {
          for (let i = x; i < end; i++) marked[base + i] = 1;
        }
        x = end;
      }
    }

    // Column scan
    for (let x = 0; x < w; x++) {
      if (((sealedMask >>> x) & 1) === 1) continue;
      let y = 0;
      while (y < h) {
        const type = baseType(g[y][x]);
        if (type === -1 || type === FROZEN || ((noSolveMask >>> type) & 1) === 1 || blocked[y * w + x] === 1) { y++; continue; }
        let end = y + 1;
        while (end < h && blocked[end * w + x] === 0 && baseType(g[end][x]) === type) end++;
        if (end - y >= (((twoMask >>> type) & 1) === 1 ? 2 : 3)) {
          for (let i = y; i < end; i++) marked[i * w + x] = 1;
        }
        y = end;
      }
    }

    // Flood fill (explicit stack) merging orthogonally-connected same-color
    // marked cells. Neighbor order (+x, -x, +y, -y) matches the original.
    const groups = [];
    const stack = comboStack;
    stack.length = 0;
    for (let y0 = 0; y0 < h; y0++) {
      for (let x0 = 0; x0 < w; x0++) {
        const i0 = y0 * w + x0;
        if (marked[i0] === 0 || visited[i0] === 1) continue;
        const type = baseType(g[y0][x0]);
        const cells = [];
        stack.length = 0;
        stack.push(i0);
        visited[i0] = 1;
        while (stack.length > 0) {
          const ci = stack.pop();
          const cx = ci % w, cy = (ci - cx) / w;
          cells.push([cx, cy]);
          if (cx + 1 < w && visited[ci + 1] === 0 && marked[ci + 1] === 1 && baseType(g[cy][cx + 1]) === type) {
            visited[ci + 1] = 1; stack.push(ci + 1);
          }
          if (cx - 1 >= 0 && visited[ci - 1] === 0 && marked[ci - 1] === 1 && baseType(g[cy][cx - 1]) === type) {
            visited[ci - 1] = 1; stack.push(ci - 1);
          }
          if (cy + 1 < h && visited[ci + w] === 0 && marked[ci + w] === 1 && baseType(g[cy + 1][cx]) === type) {
            visited[ci + w] = 1; stack.push(ci + w);
          }
          if (cy - 1 >= 0 && visited[ci - w] === 0 && marked[ci - w] === 1 && baseType(g[cy - 1][cx]) === type) {
            visited[ci - w] = 1; stack.push(ci - w);
          }
        }
        groups.push({type, cells});
      }
    }
    return groups;
  }

  /**
   * Clear matches, apply gravity, repeat until stable (spec §2 Step 4).
   * Mutates a clone; the input board is untouched.
   * @param {Iterable<number>|null} options.hazardPositions x*10+y packed
   *   positions that must NEVER appear in any dissolving group, in ANY
   *   cascade wave (P22) — matched using NORMAL (unmodified) run rules, not
   *   a structural exclusion; see hazardViolated below.
   * @returns {{totalCombos, firstCombos, firstRunes, firstClearedByType, chains, groups, boardAfter, hazardViolated, shieldViolated, shieldRemaining, shieldTotal}}
   *   firstRunes = total orbs dissolved in the FIRST wave (some bosses, e.g.
   *   楊玉環 "NUM N", require clearing >= N runes in the first batch to deal
   *   damage — distinct from combo COUNT). firstClearedByType[t] = orbs of
   *   type t dissolved in the first wave (clear-all-of-type demands).
   *   hazardViolated = true if any wave's dissolve touched a hazardPositions
   *   cell — the caller must treat this board as an invalid/forbidden
   *   outcome, not merely a suboptimal one.
   *   shieldViolated = true if, for some type t, the board started with
   *   shieldTotal[t] > 0 and ended with shieldRemaining[t] === 0 across all
   *   cascade waves (P30) — a shielded rune CAN dissolve normally, it's only
   *   forbidden to reduce a color's shield count to zero (User-stated: "if
   *   board has zero shield rune, the card cannot attack").
   *   reserveViolated = true if, for some type t in options.reserveTypes, its
   *   on-board count dropped below its OWN min-run threshold (2 for a
   *   twoMatch type, else 3) across all cascade waves combined — i.e. this
   *   wave didn't just clear some of type t, it left too few to ever form
   *   another whole combo of it. Used by `--first-wave-have` (P32): when a
   *   co-listed type can't be achieved this round (too few on the board),
   *   the achievable types must not be drained past their own combo floor,
   *   so a future spin can still form a fresh combo of them once the
   *   deficient type is replenished by skyfall.
   */
  static resolve(board, options = {}) {
    const sealedColumns = options.sealedColumns ?? [];
    const flags = options.flags ?? null;
    const twoMatch = options.twoMatch ?? null;
    const noSolvableTypes = options.noSolvableTypes ?? null;
    // Positional "never dissolve here" hazard cells (P22, fixed 2026-07-10 —
    // see LESSONS L34). UNLIKE sealedColumns/CELL_FLAGS.NO_DISSOLVE, this is
    // NOT a structural match-finding exclusion: the User confirmed live that
    // the real game does NOT break a run at a hazard cell — a run of 4
    // touching one hazard cell dissolves ALL 4, hazard cell included, same
    // as normal match-3 rules. The old NO_DISSOLVE modeling was WRONG here:
    // it silently "trimmed" a 4-run to a 3-run excluding the hazard cell,
    // which the solver treated as a perfectly good, hazard-safe outcome —
    // while the real game actually sweeps the hazard cell into the SAME
    // dissolve. So matching runs NORMALLY (hazard cells fully eligible,
    // exactly like the real engine) and instead flagging the RESULT as
    // invalid whenever any group in ANY wave touches a hazard position is
    // the only model consistent with what was observed live.
    // Accepts EITHER a pre-packed Set (what DoraSolver/TargetPlanner hold
    // internally) OR a plain array of {x,y} (what autospin.js builds from
    // recognition and passes to both solver constructors AND direct
    // resolve() diagnostic calls) — normalize here so callers don't need to
    // track which form a given call site expects.
    const hazardPositions = options.hazardPositions
      ? (options.hazardPositions instanceof Set ? options.hazardPositions
        : new Set(options.hazardPositions.map(p => p.x * 10 + p.y)))
      : null;
    const work = board.clone();
    let totalCombos = 0, firstCombos = 0, firstAttrCombos = 0, firstRunes = 0, chains = 0;
    const firstClearedByType = Array(6).fill(0);
    const allGroups = [];
    let hazardViolated = false;
    // Curse mechanic (P37, corrected P38): a PER-RUNE "never dissolve" —
    // checked the same place/way as shield's decrement below (BEFORE the
    // cell is cleared to -1), since a cursed rune can travel through
    // gravity/cascades to a different cell than where it started.
    let curseViolated = false;
    // Shield mechanic (P24, corrected P30/L40): count per-type shielded
    // runes present at the start, decrement as they're actually swept into a
    // dissolving group (checked BEFORE the cell is cleared to -1, below).
    const shieldTotal = Array(6).fill(0);
    for (let y = 0; y < work.height; y++) {
      for (let x = 0; x < work.width; x++) {
        const v = work.get(x, y);
        if (isShielded(v)) shieldTotal[baseType(v)]++;
      }
    }
    const shieldRemaining = shieldTotal.slice();
    // Reserve-floor types (P32, --first-wave-have's partial-infeasibility
    // fallback): track total cleared per type across ALL waves (not just
    // wave 1 — a type drained via later cascades is just as unavailable next
    // round), compared against its own min-run threshold at the end.
    const reserveTypes = options.reserveTypes ?? null;
    const twoMatchSet = twoMatch ? new Set(twoMatch) : null;
    const minRunOf = t => twoMatchSet && twoMatchSet.has(t) ? 2 : 3;
    const reserveTotal = Array(6).fill(0);
    if (reserveTypes) {
      for (let y = 0; y < work.height; y++) {
        for (let x = 0; x < work.width; x++) {
          const bt = baseType(work.get(x, y));
          if (bt >= 0 && bt < FROZEN) reserveTotal[bt]++;
        }
      }
    }
    const totalClearedByType = Array(6).fill(0);

    while (true) {
      const groups = BoardSimulator.findComboGroups(work, sealedColumns, flags, twoMatch, noSolvableTypes);
      if (groups.length === 0) break;
      chains++;
      if (chains === 1) {
        firstCombos = groups.length;
        // Attribute combos = wave-1 groups of any NON-Heart type (首消N屬:
        // 屬性珠 are all runes except Heart; repeats of one attribute count).
        firstAttrCombos = groups.reduce((n, g) => n + (g.type !== 5 ? 1 : 0), 0);
        firstRunes = groups.reduce((s, g) => s + g.cells.length, 0);
        for (const g of groups) firstClearedByType[g.type] += g.cells.length;
      }
      totalCombos += groups.length;
      allGroups.push(...groups);
      for (const g of groups) totalClearedByType[g.type] += g.cells.length;

      if (hazardPositions && !hazardViolated) {
        outer: for (const g of groups) {
          for (const [x, y] of g.cells) {
            if (hazardPositions.has(x * 10 + y)) { hazardViolated = true; break outer; }
          }
        }
      }

      for (const g of groups) {
        for (const [x, y] of g.cells) {
          const v = work.get(x, y);
          if (isShielded(v)) shieldRemaining[baseType(v)]--;
          if (isCursed(v)) curseViolated = true;
          work.set(x, y, -1);
        }
      }

      // Gravity: per column, compact non-empty cells to the bottom
      for (let x = 0; x < work.width; x++) {
        let writeY = work.height - 1;
        for (let y = work.height - 1; y >= 0; y--) {
          const v = work.get(x, y);
          if (v !== -1) {
            work.set(x, writeY, v);
            if (writeY !== y) work.set(x, y, -1);
            writeY--;
          }
        }
      }
    }

    const shieldViolated = shieldTotal.some((n, t) => n > 0 && shieldRemaining[t] < 1);
    const reserveViolated = reserveTypes
      ? [...reserveTypes].some(t => (reserveTotal[t] - totalClearedByType[t]) < minRunOf(t))
      : false;
    return {totalCombos, firstCombos, firstAttrCombos, firstRunes, firstClearedByType, totalClearedByType, chains, groups: allGroups, boardAfter: work, hazardViolated, shieldViolated, shieldRemaining, shieldTotal, reserveViolated, curseViolated};
  }
}

/**
 * Beam-search solver ported from docs/autodora-algorithm-spec.md (DoraHeart V2),
 * adapted to this project: rune encoding 0=Water..5=Heart (PROJECT-FACTS F9),
 * board grid[y][x] 6 wide x 5 high, 4-directional by default (8-dir is spec
 * default but diagonal drags are UNVERIFIED on the louisalflame simulator —
 * enable via moveMode: 8 only after a real-browser test).
 *
 * Spec-published constants used as-is: comboBonus x4 (spec §2 Step 5), final
 * tiebreak order weight desc -> combos desc -> path length asc (spec §2 Step 8),
 * no-immediate-backtrack rule (spec §1), defaults maxPath=30 / beamWidth=450
 * (spec §7). Constants in TUNABLE were NOT published (spec §9) — tune via A/B
 * on fixed boards, never by feel.
 */
class DoraSolver {
  constructor(board, options = {}) {
    this.board = board;
    this.beamWidth = options.beamWidth ?? 450;
    this.maxPath = options.maxPath ?? 30;
    this.moveMode = options.moveMode ?? 4;
    this.verbose = options.verbose ?? false;
    // Columns that cannot dissolve (draggable-through only); the beam search
    // then implicitly parks scarce runes there and pulls useful ones out.
    this.sealedColumns = options.sealedColumns ?? [];
    // Per-cell CELL_FLAGS bitmask grid (positional; composes with sealedColumns)
    this.flags = options.flags ?? null;
    // Cells whose FIRST-WAVE clearing is heavily rewarded (e.g. electric runes,
    // P11: they interrupt drags and block attacking until dissolved). First
    // wave only — after gravity their coordinates no longer identify them.
    this.priorityCells = options.priorityCells ?? [];
    // Target for FIRST-wave combos (before cascades). When > 0 the beam is
    // steered toward it and the best solution reaching it is returned, even
    // if a higher-weight solution with fewer first-wave combos exists.
    this.minFirstCombos = options.minFirstCombos ?? 0;
    // When true the target is EXACT: solutions must have firstCombos === N
    // (overshoot is penalized in steering and disqualified), for combo-shield
    // style mechanics where extra combos are harmful.
    this.exactFirstCombos = options.exactFirstCombos ?? false;
    // Target for FIRST-wave ATTRIBUTE combos (首消N屬, boss "首批消除N組
    // 屬性符石"): wave-1 combo groups of any NON-Heart type. Repeats of one
    // attribute count (3 Light groups = 3); Heart groups are simply not
    // counted — they are neither forbidden nor rewarded by this target.
    // Optional target (same tier as minFirstCombos), steered the same way.
    this.minFirstAttrCombos = options.minFirstAttrCombos ?? 0;
    // When true firstAttrCombos must equal the target exactly — overshoot is
    // penalized in steering and disqualified (combo-shield style).
    this.exactFirstAttrCombos = options.exactFirstAttrCombos ?? false;
    // Minimum FIRST-WAVE RUNE count (orbs dissolved in wave 1). Some bosses
    // (楊玉環 "NUM N") require >= N runes cleared first batch to deal damage.
    // Steered like minFirstCombos; overshoot is fine (more runes = still ok).
    this.minFirstRunes = options.minFirstRunes ?? 0;
    // When true, firstRunes must equal the target exactly — overshoot is
    // penalized in steering and disqualified.
    this.exactFirstRunes = options.exactFirstRunes ?? false;
    // Optional start/end pinning (phone --start/--end). Coordinates are {x,y}
    // = {column, row}. startCells: the drag may only BEGIN from one of these
    // cells (default null = every pickable cell is seeded). endCells: the
    // held rune must OCCUPY ANY ONE of these cells at the END of the returned
    // path (default null = any) — a pure eligibility filter, not a bias, so
    // when multiple end cells are given the solver naturally picks whichever
    // qualifying one scores best under the SAME weight/steer scoring already
    // used for everything else (2026-07-10, User-requested: "multiple end
    // point to input and can end at any of it, outcome with best combo").
    // Both are orthogonal to every scoring/steering knob — they only restrict
    // which cells seed the beam and which states are eligible to be the final
    // answer, so they compose with sealedColumns/flags/first-wave targets/
    // priority cells unchanged. If no end cell is ever reached within maxPath
    // the solver returns the degenerate empty solution (moves=0), and the
    // caller aborts (phone: [TOS] ABORT=start-end). Accepts either
    // options.endCells (array) or the legacy options.endCell (single {x,y})
    // for backward compatibility.
    this.startCells = options.startCells ?? null;
    this.endCells = options.endCells ?? (options.endCell ? [options.endCell] : null);
    // Fire-route trail length (see fireBlocked). 0 = off. When >0 the drag may
    // not re-enter any of the last `fireRoute` cells it left (self-avoiding
    // within a sliding window). Orthogonal to scoring; composes with everything.
    this.fireRoute = options.fireRoute ?? 0;
    // Touch-conversion card skill (2026-07-10, User-requested): the first
    // `convertCount` runes the finger TOUCHES while dragging (i.e. every
    // move's destination cell, in move order — NOT the start cell, which
    // holds the picked-up rune) turn into `convertType` as they're touched,
    // BEFORE the swap displaces them. The picked-up rune itself is never
    // converted (it's never the swap's "destination" side), so it always
    // rides unconverted to wherever the drag ends — matching the User's
    // worked example ("first picked rune is wood, first 5 touched become
    // water, the picked wood rune stays wood"). convertCount may be
    // Infinity (CLI "max"/"all") for the whole path. Implemented as a
    // stateful per-move effect (applyDragSwap below) rather than a post-hoc
    // position mask, so REVISITED cells are handled correctly for free: a
    // cell touched a 2nd time within the budget converts again (still ends
    // up convertType either way); count is by MOVE, not by distinct cell.
    // Orthogonal to scoring — bakes directly into the board every step sees,
    // so ordinary weight/combo steering already routes around it optimally
    // with no extra steering code needed. UNVERIFIED interaction: touching a
    // frozen/shielded/cursed rune strips its status (converts to a plain
    // convertType orb) — no live confirmation yet that this matches the
    // real game.
    this.convertType = options.convertType ?? null;
    this.convertCount = options.convertCount ?? 0;
    // Want-group target (2026-07-10, User-requested): an OPTIONAL steering
    // target (best-effort, NOT a mandatory demand like clearTypes — never
    // aborts, never gates bestHardOnly) for "somewhere across EVERY cascade
    // wave, a match group of EXACTLY `wantGroupSize` cells of type
    // `wantGroupType` dissolves". Unlike minFirstCombos (wave-1 only), this
    // checks `sim.groups` (BoardSimulator.resolve already returns every
    // wave's groups, not just wave 1) — no BoardSimulator change needed. No
    // dedicated constructive planner yet (User confirmed best-effort is
    // fine) — steered the same way as other optional targets: a flat reward
    // when met, plus pairPotential(board, [wantGroupType]) as a cheap
    // (imprecise — it rewards ANY adjacency of the type, not specifically
    // clustering toward exactly N) partial-progress nudge while unmet.
    this.wantGroupType = options.wantGroupType ?? null;
    this.wantGroupSize = options.wantGroupSize ?? 0;
    // Rune types that dissolve at a run of 2 instead of 3 (boss `--2-match`).
    // Threaded into every BoardSimulator.resolve so scoring/combos reflect it.
    this.twoMatch = options.twoMatch ?? null;
    // Rune types that never dissolve at all, even when aligned.
    this.noSolvableTypes = [...new Set(options.noSolvableTypes ?? [])];
    // Rune types forbidden from dissolving in the FIRST wave. They may still
    // dissolve after gravity/cascades; only the opening dissolve is blocked.
    this.firstWaveNoTypes = [...new Set(options.firstWaveNoTypes ?? [])];
    // Rune types that must EACH clear at least one rune in the FIRST wave
    // (P32, `--first-wave-have`) — mirror image of firstWaveNoTypes. Callers
    // (autospin.js) are expected to have already dropped any type that's
    // provably infeasible this round (too few on the board), same pattern as
    // clearTypes' CLEAR_ALL_INFEASIBLE prompt.
    this.firstWaveHaveTypes = [...new Set(options.firstWaveHaveTypes ?? [])];
    // Types that must not be drained below their own min-run threshold
    // across ANY wave (P32's partial-infeasibility fallback: when a sibling
    // --first-wave-have type can't be achieved this round, the achievable
    // ones must keep enough on the board for a future combo, not just be
    // freely consumed). Threaded straight into BoardSimulator.resolve.
    this.reserveTypes = [...new Set(options.reserveTypes ?? [])];
    // POSITIONAL cells that must never dissolve, in ANY wave (P22, fixed
    // 2026-07-10, L34) — see BoardSimulator.resolve's hazardPositions doc.
    // UNLIKE sealedColumns/flags, this does NOT exclude the cell from
    // matching; a violating board is simply forbidden as a final answer
    // (calculateWeight forces weight=-Infinity and solve() never lets it
    // become best/bestQualified/bestHardOnly — see qualifies() below).
    this.hazardPositions = options.hazardPositions
      ? new Set(options.hazardPositions.map(p => p.x * 10 + p.y)) : null;
    // Parallel-driver hooks (phone/parallel.js; browser-pure, both inert by
    // default). emitFrontier: run only maxPath steps, then return the live
    // beam as plain serializable states plus best/bestQualified found so far
    // — instead of a single pick. seedBeam: resume a search from such states
    // (the normal per-cell seeding is skipped; the constructor board must
    // still be the ORIGINAL board so clearTypeTotals stay correct). Running
    // prefix (emitFrontier) then resume (seedBeam) with the same beamWidth
    // and split maxPath reproduces a direct solve EXACTLY (verify.js PW).
    this.seedBeam = options.seedBeam ?? null;
    this.emitFrontier = options.emitFrontier ?? false;
    // First-wave CLEAR-ALL demand (boss "首批消除所有X符石"): every rune of
    // each listed type must dissolve in the FIRST wave. Required count per
    // type = its total count on the input board (drags conserve runes), so
    // this is STRICT about sealed columns / NO_DISSOLVE cells: runes there
    // cannot dissolve, hence the solver must drag required runes OUT of them
    // (steered via the trapped-rune penalty), and parking a required rune
    // INTO one can never satisfy the demand. Composes with every other knob;
    // e.g. clearTypes: [5] = all Hearts, [5, 0] = all Hearts and all Waters.
    this.clearTypes = [...new Set(options.clearTypes ?? [])];
    this.clearTypeTotals = Array(6).fill(0);
    if (this.clearTypes.length > 0) {
      for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
          const v = board.get(x, y);
          // Shielded runes ARE owed here (baseType) — they dissolve normally
          // (P30); only true FROZEN runes never dissolve and stay un-owed.
          const bt = baseType(v);
          if (bt >= 0 && bt < FROZEN) this.clearTypeTotals[bt]++;
        }
      }
    }
    // TUNABLE (spec §9: exact values unpublished). colorWeights indexed by
    // PROJECT encoding: [Water, Fire, Wood, Light, Dark, Heart].
    this.tunable = Object.assign({
      colorWeights: [1, 1, 1, 1, 1, 1],
      comboBonus: 4,      // spec-published
      bigGroupBonus: 1,   // per orb beyond 3 in a combo group
      chainBonus: 2,      // per cascade wave beyond the first
      firstComboSteer: 8, // beam-steering bonus per first-wave combo up to minFirstCombos
      pairSteer: 0.5,     // partial-progress bonus per adjacent same-color pair
                          // (only while below the minFirstCombos target)
      priorityClearBonus: 25, // per priorityCell cleared in the first wave —
                          // dominates ordinary combo trade-offs ("highest priority")
    }, options.tunable || {});
    // Precomputed once for the per-child steering helpers (pairPotential /
    // trappedRequiredCount run on every beam expansion): flat grid marking
    // cells that can never dissolve (sealed column or NO_DISSOLVE flag).
    this._nd = new Uint8Array(board.width * board.height);
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        if (this.sealedColumns.includes(x)
            || (this.flags !== null && (this.flags[y][x] & CELL_FLAGS.NO_DISSOLVE) !== 0)) {
          this._nd[y * board.width + x] = 1;
        }
      }
    }
  }

  static get DIRS8() {
    return [
      {dx: 0, dy: -1, name: 'up'},
      {dx: 1, dy: -1, name: 'up-right'},
      {dx: 1, dy: 0, name: 'right'},
      {dx: 1, dy: 1, name: 'down-right'},
      {dx: 0, dy: 1, name: 'down'},
      {dx: -1, dy: 1, name: 'down-left'},
      {dx: -1, dy: 0, name: 'left'},
      {dx: -1, dy: -1, name: 'up-left'},
    ];
  }

  get dirs() {
    const all = DoraSolver.DIRS8;
    return this.moveMode === 8 ? all : all.filter(d => d.dx === 0 || d.dy === 0);
  }

  /**
   * Partial progress toward first-wave groups: adjacent same-color pairs in
   * the dissolvable area. Lets the beam see "almost-groups" as progress so
   * setup-heavy paths survive pruning (only used below the first-combo target).
   * @param {number[]|null} types restrict to these rune types (clearTypes
   *   steering); null = all types.
   */
  pairPotential(board, types = null) {
    const w = board.width, h = board.height, g = board.grid, nd = this._nd;
    let pairs = 0;
    for (let y = 0; y < h; y++) {
      const row = g[y], base = y * w;
      for (let x = 0; x < w; x++) {
        if (nd[base + x] === 1) continue;
        const t = baseType(row[x]);
        if (t === -1 || t === FROZEN) continue; // frozen pairs can never become a group
        if (this.noSolvableTypes.includes(t)) continue;
        if (types !== null && !types.includes(t)) continue;
        if (x + 1 < w && nd[base + x + 1] === 0 && baseType(row[x + 1]) === t) pairs++;
        if (y + 1 < h && nd[base + w + x] === 0 && baseType(g[y + 1][x]) === t) pairs++;
      }
    }
    return pairs;
  }

  /**
   * clearTypes runes currently sitting in undissolvable cells (sealed columns
   * / NO_DISSOLVE). Each one provably blocks the clear-all demand until it is
   * dragged out, so steering penalizes them — a dense gradient toward
   * extracting required runes from thorn-fenced columns.
   */
  trappedRequiredCount(board) {
    const w = board.width, nd = this._nd;
    let n = 0;
    for (let y = 0; y < board.height; y++) {
      const row = board.grid[y], base = y * w;
      for (let x = 0; x < w; x++) {
        if (nd[base + x] === 1 && this.clearTypes.includes(baseType(row[x]))) n++;
      }
    }
    return n;
  }

  /**
   * Spec §2 Step 5 (calculateWeight), on the fully-resolved cascade result.
   */
  calculateWeight(board) {
    const sim = BoardSimulator.resolve(board, {sealedColumns: this.sealedColumns, flags: this.flags, twoMatch: this.twoMatch, noSolvableTypes: this.noSolvableTypes, hazardPositions: this.hazardPositions, reserveTypes: this.reserveTypes.length > 0 ? this.reserveTypes : null});
    // A hazard violation (P22) is not merely suboptimal — it's forbidden.
    // -Infinity keeps it out of the beam naturally (never wins a searchScore
    // comparison) AND out of best/bestQualified/bestHardOnly (see solve()'s
    // explicit `!sim.hazardViolated` gate below — weight alone isn't enough
    // if EVERY reachable state happens to violate it).
    // Same treatment for a shield violation (P30): reducing a color's
    // shielded-rune count to zero is forbidden, not merely suboptimal.
    // Same again for a reserve violation (P32): draining a --first-wave-have
    // sibling type below its own combo floor is forbidden, not suboptimal.
    // Same again for a curse violation (P37/P38): a cursed rune dissolving,
    // in ANY wave, is forbidden, not suboptimal.
    if (sim.hazardViolated || sim.shieldViolated || sim.reserveViolated || sim.curseViolated) return {weight: -Infinity, sim};
    const t = this.tunable;
    let weight = 0;
    for (const g of sim.groups) {
      weight += t.colorWeights[g.type] ?? 1;
      weight += Math.max(0, g.cells.length - 3) * t.bigGroupBonus;
    }
    weight += sim.totalCombos * t.comboBonus;
    weight += Math.max(0, sim.chains - 1) * t.chainBonus;
    if (this.priorityCells.length > 0) {
      const firstWave = new Set();
      for (const g of sim.groups.slice(0, sim.firstCombos)) {
        for (const [x, y] of g.cells) firstWave.add(x * 10 + y);
      }
      for (const pc of this.priorityCells) {
        if (firstWave.has(pc.x * 10 + pc.y)) weight += t.priorityClearBonus;
      }
    }
    return {weight, sim};
  }

  /**
   * Steering + soft-qualification for one already-resolved candidate board
   * (extracted 2026-07-10, L54/P50, from solve()'s beam-expansion loop as a
   * PURE mechanical move — same formulas, same `this.` field reads, zero
   * behavior change; verify.js's full suite re-passing after the extraction
   * is the proof). Exists as its own method so RearrangeSolver (a permutation
   * search, not a drag-path search) can construct a plain DoraSolver purely
   * as a SCORING ENGINE — `new DoraSolver(board, options).steerFor(candidate,
   * sim)` — and get byte-identical demand semantics (minFirstCombos,
   * minFirstAttrCombos, wantGroup, minFirstRunes, clearTypes,
   * firstWaveNoTypes, firstWaveHaveTypes) without duplicating this logic.
   * @param {Board} board candidate board (post-move/post-swap)
   * @param {object} sim BoardSimulator.resolve(board) result — caller
   *   already has this from calculateWeight(board)
   * @returns {{steer, clearAllOk, firstWaveNoOk, wantGroupOk, firstWaveHaveOk,
   *   hazardOk, shieldOk, reserveOk, curseOk, comboCount, firstCombos,
   *   firstAttrCombos, firstRunes, firstClearedByType, chains}}
   */
  steerFor(board, sim) {
    // Steer the beam toward the first-combo target (no effect when 0);
    // below the target, adjacent pairs count as partial progress
    let steer = 0;
    if (this.minFirstCombos > 0) {
      steer = Math.min(sim.firstCombos, this.minFirstCombos) * this.tunable.firstComboSteer;
      if (this.exactFirstCombos) {
        steer -= Math.max(0, sim.firstCombos - this.minFirstCombos) * this.tunable.firstComboSteer;
      }
      if (sim.firstCombos < this.minFirstCombos) {
        steer += this.pairPotential(board) * this.tunable.pairSteer;
      }
    }
    // Steer toward the first-wave ATTRIBUTE-combo target (首消N屬):
    // identical shape to minFirstCombos, but only non-Heart groups
    // count and partial progress only looks at non-Heart pairs.
    if (this.minFirstAttrCombos > 0) {
      steer += Math.min(sim.firstAttrCombos, this.minFirstAttrCombos) * this.tunable.firstComboSteer;
      if (this.exactFirstAttrCombos) {
        steer -= Math.max(0, sim.firstAttrCombos - this.minFirstAttrCombos) * this.tunable.firstComboSteer;
      }
      if (sim.firstAttrCombos < this.minFirstAttrCombos) {
        steer += this.pairPotential(board, ATTR_TYPES) * this.tunable.pairSteer;
      }
    }
    // Steer toward the want-group target: a match group of EXACTLY
    // wantGroupSize cells of wantGroupType, dissolving in ANY wave
    // (checked against sim.groups, which already spans every
    // cascade wave — no wave-1 restriction like the targets above).
    // Best-effort: a flat reward when met, else a cheap adjacency
    // nudge (not size-aware — pairPotential doesn't know "exactly
    // N", just "more same-color adjacency of this type").
    let wantGroupOk = this.wantGroupType === null;
    if (this.wantGroupType !== null) {
      wantGroupOk = sim.groups.some(g => g.type === this.wantGroupType && g.cells.length === this.wantGroupSize);
      if (wantGroupOk) {
        steer += this.tunable.firstComboSteer;
      } else {
        steer += this.pairPotential(board, [this.wantGroupType]) * this.tunable.pairSteer;
      }
    }
    // Steer toward a first-wave RUNE-count target (楊玉環 NUM). Reward
    // runes up to the target; below it, pairs are partial progress.
    // In exact mode overshoot is penalized just as hard as shortfall.
    if (this.minFirstRunes > 0) {
      steer += Math.min(sim.firstRunes, this.minFirstRunes) * this.tunable.firstComboSteer;
      if (this.exactFirstRunes) {
        steer -= Math.max(0, sim.firstRunes - this.minFirstRunes) * this.tunable.firstComboSteer;
      }
      if (sim.firstRunes < this.minFirstRunes) {
        steer += this.pairPotential(board) * this.tunable.pairSteer;
      }
    }
    // Steer toward the clear-all demand: reward each required-type rune
    // dissolved in wave 1, penalize required runes still trapped in
    // undissolvable cells (must be dragged out first), and count
    // required-color adjacent pairs as partial progress while unmet.
    let clearAllOk = true;
    if (this.clearTypes.length > 0) {
      let cleared = 0;
      for (const t of this.clearTypes) {
        cleared += sim.firstClearedByType[t];
        if (sim.firstClearedByType[t] < this.clearTypeTotals[t]) clearAllOk = false;
      }
      steer += cleared * this.tunable.firstComboSteer;
      steer -= this.trappedRequiredCount(board) * this.tunable.firstComboSteer;
      if (!clearAllOk) {
        steer += this.pairPotential(board, this.clearTypes) * this.tunable.pairSteer;
      }
    }
    const firstWaveNoClear = this.firstWaveNoTypes.reduce((n, t) => n + sim.firstClearedByType[t], 0);
    const firstWaveNoOk = firstWaveNoClear === 0;
    if (this.firstWaveNoTypes.length > 0) {
      steer -= firstWaveNoClear * this.tunable.firstComboSteer * 2;
    }
    // Steer toward the --first-wave-have demand: reward each listed
    // type's FIRST rune cleared in wave 1 (only the first — once a
    // type is satisfied, more of it is no better for THIS demand),
    // and count adjacent pairs of still-unsatisfied types as partial
    // progress, same shape as clearAllOk's steering above.
    let haveCount = 0;
    for (const t of this.firstWaveHaveTypes) {
      if (sim.firstClearedByType[t] > 0) { haveCount++; steer += this.tunable.firstComboSteer; }
    }
    const firstWaveHaveOkLocal = haveCount === this.firstWaveHaveTypes.length;
    if (this.firstWaveHaveTypes.length > 0 && !firstWaveHaveOkLocal) {
      const unmet = this.firstWaveHaveTypes.filter(t => sim.firstClearedByType[t] === 0);
      steer += this.pairPotential(board, unmet) * this.tunable.pairSteer;
    }
    return {
      steer, clearAllOk, firstWaveNoOk, wantGroupOk,
      firstWaveHaveOk: firstWaveHaveOkLocal,
      hazardOk: !sim.hazardViolated,
      shieldOk: !sim.shieldViolated,
      reserveOk: !sim.reserveViolated,
      curseOk: !sim.curseViolated,
      comboCount: sim.totalCombos, firstCombos: sim.firstCombos,
      firstAttrCombos: sim.firstAttrCombos,
      firstRunes: sim.firstRunes, firstClearedByType: sim.firstClearedByType,
      chains: sim.chains,
    };
  }

  /**
   * Beam search: seed every cell -> expand (no immediate backtrack) -> score
   * -> sort -> prune to beamWidth -> repeat maxPath times (spec §2 Steps 1-7).
   * @returns best solution, interface-compatible with content.js consumers:
   *   {startX, startY, path, moves, score, comboCount, firstCombos, chains, board}
   */
  solve() {
    const f = (x, y) => this.flags === null ? 0 : this.flags[y][x];
    const startSet = this.startCells ? new Set(this.startCells.map(c => c.x + ',' + c.y)) : null;
    let beam = [];
    if (this.seedBeam) {
      // Resume from serialized frontier states (see constructor note). Fields
      // are exactly what expansion reads: board/x/y/start/path/moves/prevDir.
      for (const s of this.seedBeam) {
        const b = new Board(this.board.width, this.board.height);
        b.fromArray(s.grid);
        beam.push({
          board: b, x: s.x, y: s.y, startX: s.startX, startY: s.startY,
          path: s.path.map(p => ({x: p.x, y: p.y})), moves: [...s.moves],
          prevDir: s.prevDir ? {dx: s.prevDir.dx, dy: s.prevDir.dy, name: s.prevDir.name} : null,
          weight: -Infinity,
        });
      }
    } else {
      for (let y = 0; y < this.board.height; y++) {
        for (let x = 0; x < this.board.width; x++) {
          if (f(x, y) & CELL_FLAGS.NO_PICKUP) continue;
          if (startSet && !startSet.has(x + ',' + y)) continue;
          beam.push({
            board: this.board, x, y, startX: x, startY: y,
            path: [{x, y}], moves: [], prevDir: null, weight: -Infinity,
          });
        }
      }
    }

    let best = null, bestQualified = null, bestHardOnly = null;
    const better = (a, b) => {
      if (b === null) return true;
      if (a.weight !== b.weight) return a.weight > b.weight;
      if (a.comboCount !== b.comboCount) return a.comboCount > b.comboCount;
      return a.moves.length < b.moves.length;
    };

    // Weight, steering, and qualification are functions of the child BOARD
    // alone (never the path or held cell), and ~40% of expansions revisit a
    // board already scored (measured on a live clear-all run) — cache the
    // whole score bundle by grid key across steps. Bounded: wiped when huge
    // (only near-limitless sequential runs ever hit the cap).
    const scoreCache = new Map();

    for (let step = 0; step < this.maxPath; step++) {
      const children = [];
      // Dedup BEFORE scoring: two same-step states with the same board and
      // held cell have identical futures AND identical scores (the weight
      // and every steering term are functions of the board alone), so the
      // first occurrence is exactly what a post-scoring dedup would keep —
      // and the expensive BoardSimulator.resolve for every duplicate is
      // skipped entirely (the single biggest cost in the search).
      const seen = new Set();
      for (const s of beam) {
        for (const dir of this.dirs) {
          if (s.prevDir && dir.dx === -s.prevDir.dx && dir.dy === -s.prevDir.dy) continue;
          const nx = s.x + dir.dx, ny = s.y + dir.dy;
          if (nx < 0 || nx >= this.board.width || ny < 0 || ny >= this.board.height) continue;
          if (f(nx, ny) & CELL_FLAGS.NO_SWAP) continue;
          if (fireBlocked(s.path, nx, ny, this.fireRoute)) continue;

          const childBoard = s.board.clone();
          applyDragSwap(childBoard, s.x, s.y, nx, ny, s.path.length, this.convertType, this.convertCount);
          const gridKey = gridKeyOf(childBoard);
          const cellKey = gridKey + String.fromCharCode(33 + ny * this.board.width + nx);
          if (seen.has(cellKey)) continue;
          seen.add(cellKey);
          let sc = scoreCache.get(gridKey);
          if (sc === undefined) {
            const {weight, sim} = this.calculateWeight(childBoard);
            const steered = this.steerFor(childBoard, sim);
            sc = {weight, ...steered};
            if (scoreCache.size >= 1000000) scoreCache.clear();
            scoreCache.set(gridKey, sc);
          }
          const child = {
            board: childBoard, x: nx, y: ny,
            startX: s.startX, startY: s.startY,
            path: [...s.path, {x: nx, y: ny}],
            moves: [...s.moves, dir.name],
            prevDir: dir, weight: sc.weight, searchScore: sc.weight + sc.steer,
            comboCount: sc.comboCount, firstCombos: sc.firstCombos,
            firstAttrCombos: sc.firstAttrCombos,
            firstRunes: sc.firstRunes, firstClearedByType: sc.firstClearedByType,
            chains: sc.chains,
          };
          children.push(child);
          // endCells gate: a state is only eligible as the final answer when
          // the held rune sits on ANY ONE of endCells (children still expand
          // freely, so a path may pass through and come back). null = no
          // constraint. Multiple end cells are not weighted/preferred among
          // themselves — better() below picks the best-scoring one naturally.
          const endOk = this.endCells === null || this.endCells.some(e => nx === e.x && ny === e.y);
          // hazardOk/shieldOk/reserveOk/curseOk gate EVERY tier
          // unconditionally (P22/P30/P32/P37): a hazard, shield, reserve-
          // floor, or curse violation is forbidden, not merely undesirable,
          // so it must never become best/bestQualified/bestHardOnly even
          // when no other demand is active. Weight alone (-Infinity in
          // calculateWeight) isn't sufficient — if EVERY reachable state
          // happened to violate it, `better()` would still pick one of them
          // without this gate.
          const constraintsOk = sc.hazardOk && sc.shieldOk && sc.reserveOk && sc.curseOk;
          if (constraintsOk && endOk && better(child, best)) best = child;
          const qualifies = (this.minFirstCombos === 0 || (this.exactFirstCombos
              ? sc.firstCombos === this.minFirstCombos
              : sc.firstCombos >= this.minFirstCombos))
            && (this.minFirstAttrCombos === 0 || (this.exactFirstAttrCombos
              ? sc.firstAttrCombos === this.minFirstAttrCombos
              : sc.firstAttrCombos >= this.minFirstAttrCombos))
            && (this.minFirstRunes === 0 || (this.exactFirstRunes
              ? sc.firstRunes === this.minFirstRunes
              : sc.firstRunes >= this.minFirstRunes))
            && sc.clearAllOk
            && sc.firstWaveNoOk
            && sc.firstWaveHaveOk
            && sc.wantGroupOk;
          if ((this.minFirstCombos > 0 || this.minFirstAttrCombos > 0 || this.minFirstRunes > 0
                || this.clearTypes.length > 0 || this.firstWaveNoTypes.length > 0 || this.firstWaveHaveTypes.length > 0 || this.wantGroupType !== null)
              && qualifies && constraintsOk && endOk && better(child, bestQualified)) bestQualified = child;
          // clearTypes, firstWaveNoTypes, and firstWaveHaveTypes are all
          // MANDATORY demands, unlike minFirstCombos/minFirstRunes which are
          // optional targets. Track the best hard-demand-satisfying state on
          // its own so an unreachable combo/rune target (e.g. --first-combos
          // max asking for more combos than compose with clearing every
          // required rune) can't make the final pick silently drop a
          // mandatory demand and fall all the way to the fully-unconstrained
          // `best`.
          if ((this.clearTypes.length > 0 || this.firstWaveNoTypes.length > 0 || this.firstWaveHaveTypes.length > 0)
              && sc.clearAllOk && sc.firstWaveNoOk && sc.firstWaveHaveOk && constraintsOk && endOk && better(child, bestHardOnly)) {
            bestHardOnly = child;
          }
        }
      }
      if (children.length === 0) break;
      // children are already unique (deduped at generation, above); a stable
      // sort keeps first-occurrence order on ties, same as the old
      // insertion-ordered Map dedup.
      children.sort((a, b) => b.searchScore - a.searchScore);
      beam = children.slice(0, this.beamWidth);
      if (this.verbose && step % 5 === 4) {
        console.log(`[DoraSolver] step ${step + 1}/${this.maxPath} best weight=${best.weight} combos=${best.comboCount}`);
      }
    }

    if (this.emitFrontier) {
      // Parallel-prefix mode: hand the live beam (as plain states a worker's
      // seedBeam can resume) plus the answers found during the prefix to the
      // driver, which merges them with the workers' picks.
      return {
        frontier: beam.map(s => ({
          grid: s.board.grid.map(row => [...row]),
          x: s.x, y: s.y, startX: s.startX, startY: s.startY,
          path: s.path, moves: s.moves,
          prevDir: s.prevDir ? {dx: s.prevDir.dx, dy: s.prevDir.dy, name: s.prevDir.name} : null,
          searchScore: s.searchScore ?? -Infinity,
        })),
        best: best === null ? null : this._solution(best),
        bestQualified: bestQualified === null ? null : this._solution(bestQualified),
        bestHardOnly: bestHardOnly === null ? null : this._solution(bestHardOnly),
      };
    }

    // Prefer the solution meeting every demand; if the optional combo/rune
    // target is unreachable jointly with a MANDATORY clear-all demand, prefer
    // a solution that still satisfies clear-all over the fully-unconstrained
    // best (which may violate it) — see bestClearAllOnly comment above.
    const pick = bestQualified ?? bestHardOnly ?? best;
    if (pick === null) {
      return {startX: 0, startY: 0, path: [{x: 0, y: 0}], moves: [], score: 0, comboCount: 0, firstCombos: 0, firstAttrCombos: 0, firstRunes: 0, firstClearedByType: Array(6).fill(0), chains: 0, board: this.board.clone()};
    }
    return this._solution(pick);
  }

  _solution(pick) {
    return {
      startX: pick.startX, startY: pick.startY,
      path: pick.path, moves: pick.moves,
      score: pick.weight, comboCount: pick.comboCount,
      firstCombos: pick.firstCombos, firstAttrCombos: pick.firstAttrCombos,
      firstRunes: pick.firstRunes,
      firstClearedByType: pick.firstClearedByType, chains: pick.chains,
      board: pick.board,
    };
  }
}

/**
 * Two-phase first-wave-combo planner (PROJECT-FACTS P10). DoraSolver's beam
 * search finds first-wave targets only when the setup is shallow; this class
 * trades total-weight optimization for a NEAR-GUARANTEE on first-wave combos:
 *
 *  Phase 1 (planTargets): enumerate concrete placements of N disjoint triples
 *  in the dissolvable area with a color assignment that respects movable rune
 *  counts and keeps same-color groups non-adjacent. If none exists the demand
 *  is PROVABLY infeasible (reason 'no-feasible-target').
 *
 *  Phase 2 (routeToTarget): beam-search a drag path that realizes a target
 *  arrangement, scored by cells-already-correct plus a distance potential —
 *  a dense objective that climbs steadily, unlike combo counts which only
 *  materialize at the end. Each routed result is verified with
 *  BoardSimulator before being accepted (accidental merges are rejected).
 */
class TargetPlanner {
  constructor(board, options = {}) {
    this.board = board;
    this.sealedColumns = options.sealedColumns ?? [];
    this.flags = options.flags ?? null;
    this.target = options.minFirstCombos ?? 5;
    // Combo floor for the CLEAR-ALL path: 0 unless the caller explicitly asked
    // for first-wave combos. Distinct from `this.target` (which defaults to 5
    // for the combo-count planner) so a clear-all-only request isn't silently
    // gated to >=5 combos and told "routing-failed".
    this.clearAllComboFloor = options.minFirstCombos ?? 0;
    this.exact = options.exact ?? false; // require firstCombos === target, not >=
    // First-wave ATTRIBUTE-combo demand (首消N屬, non-Heart groups). When set,
    // planTargets' color assignment simply excludes Heart, so every
    // constructed combo counts toward the demand; routed results are also
    // verified against sim.firstAttrCombos (cascade-formed Heart groups don't
    // count but don't hurt either, except in exactAttr mode).
    this.attrTarget = options.minFirstAttrCombos ?? 0;
    this.exactAttr = options.exactFirstAttrCombos ?? false;
    this.maxPath = options.maxPath ?? 60;
    this.beamWidth = options.beamWidth ?? 300;
    this.maxTargets = options.maxTargets ?? 8;
    this.verbose = options.verbose ?? false;
    // Start/end pinning (same semantics as DoraSolver). Threaded into
    // routeToTarget's beam. NOTE: a hard endCell rarely coexists with "all
    // target cells matched" (completing the last group usually parks the held
    // rune on a target cell, not on an arbitrary endCell), so an end-pinned
    // planner request will often report routing-failed — DoraSolver's steering
    // is the primary engine for start/end. startCells alone routes fine.
    this.startCells = options.startCells ?? null;
    this.endCells = options.endCells ?? (options.endCell ? [options.endCell] : null);
    this.fireRoute = options.fireRoute ?? 0; // see fireBlocked
    // Touch-conversion (see DoraSolver's constructor comment) — same
    // semantics, applied via the same applyDragSwap helper in routeToTarget.
    this.convertType = options.convertType ?? null;
    this.convertCount = options.convertCount ?? 0;
    this.twoMatch = options.twoMatch ?? null; // types dissolving at run of 2
    this.noSolvableTypes = [...new Set(options.noSolvableTypes ?? [])];
    this.firstWaveNoTypes = [...new Set(options.firstWaveNoTypes ?? [])];
    // --first-wave-have (P32) and its reserve-floor fallback — VERIFICATION-
    // ONLY here (same reasoning as firstWaveNoTypes/hazardPositions): a
    // routed target that doesn't satisfy the demand, or that drains a
    // reserve-floor type too far, is rejected rather than steered around.
    this.firstWaveHaveTypes = [...new Set(options.firstWaveHaveTypes ?? [])];
    this.reserveTypes = [...new Set(options.reserveTypes ?? [])];
    // POSITIONAL never-dissolve hazard cells (P22) — VERIFICATION-ONLY here,
    // same reasoning as clearTypes just below: a routed target that happens
    // to sweep a hazard cell into a dissolve is rejected, never constructed.
    this.hazardPositions = options.hazardPositions
      ? new Set(options.hazardPositions.map(p => p.x * 10 + p.y)) : null;
    // Clear-all-of-type demand, VERIFICATION-ONLY here: phase 1 targets
    // first-wave combo count, not required-type coverage, so routed targets
    // violating clearTypes are rejected rather than constructed. DoraSolver's
    // clearTypes steering is the primary engine for clear-all demands; this
    // filter just keeps a planner fallback from returning a violating path.
    this.clearTypes = [...new Set(options.clearTypes ?? [])];
    this.clearTypeTotals = Array(6).fill(0);
    if (this.clearTypes.length > 0) {
      for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
          const v = board.get(x, y);
          const bt = baseType(v); // shielded runes ARE owed (P30); frozen never are
          if (bt >= 0 && bt < FROZEN) this.clearTypeTotals[bt]++;
        }
      }
    }
  }

  flag(x, y) { return this.flags === null ? 0 : this.flags[y][x]; }
  dissolvable(x, y) {
    return !this.sealedColumns.includes(x) && (this.flag(x, y) & CELL_FLAGS.NO_DISSOLVE) === 0;
  }
  movable(x, y) { return (this.flag(x, y) & CELL_FLAGS.NO_SWAP) === 0; }

  static shapesAdjacent(a, b) {
    for (const [ax, ay] of a.cells) {
      for (const [bx, by] of b.cells) {
        if (Math.abs(ax - bx) + Math.abs(ay - by) === 1) return true;
      }
    }
    return false;
  }

  /** Phase 1. Returns up to maxTargets targets (arrays of {x,y,type}), sorted
   * easiest-to-route first (most cells already correct). */
  planTargets() {
    const w = this.board.width, h = this.board.height, N = this.target;
    const usable = (x, y) => this.dissolvable(x, y) && this.movable(x, y);
    const shapes = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x + 2 < w && usable(x, y) && usable(x + 1, y) && usable(x + 2, y)) {
          shapes.push({cells: [[x, y], [x + 1, y], [x + 2, y]]});
        }
        if (y + 2 < h && usable(x, y) && usable(x, y + 1) && usable(x, y + 2)) {
          shapes.push({cells: [[x, y], [x, y + 1], [x, y + 2]]});
        }
      }
    }
    const counts = Array(6).fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = this.board.get(x, y);
        if (this.movable(x, y) && v >= 0 && v < FROZEN) counts[v]++;
      }
    }

    // Color a chosen shape set: per shape prefer colors already overlapping its
    // cells (cheap routing), respecting counts and same-color non-adjacency.
    const assignColors = (set) => {
      const remaining = counts.slice();
      const assignment = new Array(set.length).fill(-1);
      const rec = (i) => {
        if (i === set.length) return true;
        const options = [];
        for (let c = 0; c < 6; c++) {
          if (this.firstWaveNoTypes.includes(c) || this.noSolvableTypes.includes(c)) continue;
          if (this.attrTarget > 0 && c === 5) continue; // 首消N屬: construct non-Heart combos only
          if (remaining[c] < 3) continue;
          let clash = false;
          for (let j = 0; j < i; j++) {
            if (assignment[j] === c && TargetPlanner.shapesAdjacent(set[i], set[j])) { clash = true; break; }
          }
          if (clash) continue;
          const overlap = set[i].cells.filter(([x, y]) => this.board.get(x, y) === c).length;
          options.push({c, overlap});
        }
        options.sort((a, b) => b.overlap - a.overlap || remaining[b.c] - remaining[a.c]);
        for (const {c} of options) {
          assignment[i] = c; remaining[c] -= 3;
          if (rec(i + 1)) return true;
          assignment[i] = -1; remaining[c] += 3;
        }
        return false;
      };
      if (!rec(0)) return null;
      return set.map((s, i) => s.cells.map(([x, y]) => ({x, y, type: assignment[i]})));
    };

    // Enumerate disjoint N-subsets of shapes (capped), color each.
    const results = [];
    let setsTried = 0;
    const chosen = [], used = new Set();
    const dfs = (start) => {
      if (results.length >= this.maxTargets * 6 || setsTried > 8000) return;
      if (chosen.length === N) {
        setsTried++;
        const t = assignColors(chosen);
        if (t) results.push(t);
        return;
      }
      for (let i = start; i < shapes.length; i++) {
        if (shapes.length - i < N - chosen.length) break;
        if (shapes[i].cells.some(([x, y]) => used.has(x * 10 + y))) continue;
        chosen.push(shapes[i]);
        shapes[i].cells.forEach(([x, y]) => used.add(x * 10 + y));
        dfs(i + 1);
        chosen.pop();
        shapes[i].cells.forEach(([x, y]) => used.delete(x * 10 + y));
        if (results.length >= this.maxTargets * 6 || setsTried > 8000) return;
      }
    };
    dfs(0);

    const overlapOf = t => t.flat().filter(c => this.board.get(c.x, c.y) === c.type).length;
    results.sort((a, b) => overlapOf(b) - overlapOf(a));
    return results.slice(0, this.maxTargets);
  }

  /** Phase 2: find a drag path after which every target cell holds its color.
   * @param groups array of groups, each an array of {x,y,type}. Scoring is
   * group-aware: completing a group is a large score cliff (the beam builds
   * one group at a time and refuses to break finished ones), and the distance
   * potential uses a greedy ONE-TO-ONE assignment of spare runes to unmatched
   * cells — at high N runes compete for slots, and per-cell nearest-rune
   * potentials double-count the same rune and mislead the search. */
  routeToTarget(groups) {
    const w = this.board.width, h = this.board.height;
    const flat = groups.flat();
    const total = flat.length;
    const wantAt = new Map(flat.map(c => [c.x * 10 + c.y, c.type]));

    const statsOf = (board) => {
      let matched = 0, completed = 0;
      for (const g of groups) {
        let m = 0;
        for (const c of g) if (board.get(c.x, c.y) === c.type) m++;
        matched += m;
        if (m === g.length) completed++;
      }
      return {matched, completed};
    };
    const potentialOf = (board) => {
      const unmatched = [];
      for (const c of flat) if (board.get(c.x, c.y) !== c.type) unmatched.push(c);
      if (unmatched.length === 0) return 0;
      const spares = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const t = board.get(x, y);
          if (wantAt.get(x * 10 + y) === t) continue; // serving its own cell
          spares.push({x, y, t});
        }
      }
      const pairs = [];
      for (let i = 0; i < unmatched.length; i++) {
        for (let j = 0; j < spares.length; j++) {
          if (spares[j].t !== unmatched[i].type) continue;
          pairs.push({i, j, d: Math.abs(spares[j].x - unmatched[i].x) + Math.abs(spares[j].y - unmatched[i].y)});
        }
      }
      pairs.sort((a, b) => a.d - b.d);
      const cellDone = new Array(unmatched.length).fill(false);
      const runeDone = new Array(spares.length).fill(false);
      let p = 0, assigned = 0;
      for (const pr of pairs) {
        if (cellDone[pr.i] || runeDone[pr.j]) continue;
        cellDone[pr.i] = true; runeDone[pr.j] = true;
        p += pr.d;
        if (++assigned === unmatched.length) break;
      }
      p += (unmatched.length - assigned) * 50;
      return p;
    };
    const scoreOf = s => s.completed * 20000 + s.matched * 1000 - s.potential - s.path.length * 0.5;

    const startSet = this.startCells ? new Set(this.startCells.map(c => c.x + ',' + c.y)) : null;
    const atEnd = (x, y) => this.endCells === null || this.endCells.some(e => x === e.x && y === e.y);
    let beam = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!this.movable(x, y) || (this.flag(x, y) & CELL_FLAGS.NO_PICKUP)) continue;
        if (startSet && !startSet.has(x + ',' + y)) continue;
        const st = statsOf(this.board);
        beam.push({
          board: this.board, x, y, startX: x, startY: y,
          path: [{x, y}], moves: [], prevDir: null,
          matched: st.matched, completed: st.completed, potential: potentialOf(this.board),
        });
      }
    }

    const dirs = DoraSolver.DIRS8.filter(d => d.dx === 0 || d.dy === 0);
    for (let step = 0; step < this.maxPath; step++) {
      const children = [];
      for (const s of beam) {
        for (const dir of dirs) {
          if (s.prevDir && dir.dx === -s.prevDir.dx && dir.dy === -s.prevDir.dy) continue;
          const nx = s.x + dir.dx, ny = s.y + dir.dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          if (!this.movable(nx, ny)) continue;
          if (fireBlocked(s.path, nx, ny, this.fireRoute)) continue;
          const childBoard = s.board.clone();
          applyDragSwap(childBoard, s.x, s.y, nx, ny, s.path.length, this.convertType, this.convertCount);
          const st = statsOf(childBoard);
          const child = {
            board: childBoard, x: nx, y: ny,
            startX: s.startX, startY: s.startY,
            path: [...s.path, {x: nx, y: ny}],
            moves: [...s.moves, dir.name],
            prevDir: dir,
            matched: st.matched, completed: st.completed, potential: potentialOf(childBoard),
          };
          if (child.matched === total && atEnd(child.x, child.y)) {
            return {
              startX: child.startX, startY: child.startY,
              path: child.path, moves: child.moves, board: child.board,
            };
          }
          children.push(child);
        }
      }
      if (children.length === 0) break;
      const seen = new Map();
      for (const c of children) {
        const key = gridKeyOf(c.board) + String.fromCharCode(33 + c.y * w + c.x);
        const prev = seen.get(key);
        if (prev === undefined || scoreOf(c) > scoreOf(prev)) seen.set(key, c);
      }
      const unique = [...seen.values()];
      unique.sort((a, b) => scoreOf(b) - scoreOf(a));
      beam = unique.slice(0, this.beamWidth);
    }
    return null;
  }

  /**
   * @returns {{solution: object|null, reason: string, targetsTried: number}}
   * reason: 'ok' | 'no-feasible-target' (provably impossible under the caps)
   *         | 'routing-failed' (targets exist; no drag path found — try a
   *           wider beamWidth / longer maxPath)
   */
  // ---- clear-all-of-type via coverage lines (PROJECT-FACTS P14) ----
  // DoraSolver's beam can't gather every rune of a scattered scarce type into
  // one dissolving group (C=4,5 MUST be a single group), so it MISSes clear-all
  // (measured: 3/5 even at beam 16000, no pins). The fix is CONSTRUCTIVE but
  // MINIMAL: build a target that only places the required runes into dissolving
  // straight lines (NO extra combo triples — augmenting the target makes it too
  // big for routeToTarget to realize AND land on the end pin), route each
  // placement, and keep the routed board with the most (incidental) combos.
  // Coverage-only targets route reliably WITH the end pin; augmented ones don't.

  /** All straight-line placements of `len` usable cells of `type` (h and v). */
  linePlacements(type, len) {
    if (this.noSolvableTypes.includes(type)) return [];
    const w = this.board.width, h = this.board.height;
    const usable = (x, y) => this.dissolvable(x, y) && this.movable(x, y);
    const out = [];
    if (len <= w) for (let y = 0; y < h; y++) for (let x = 0; x <= w - len; x++) {
      const cells = []; let ok = true;
      for (let i = 0; i < len && ok; i++) { if (!usable(x + i, y)) ok = false; else cells.push({x: x + i, y, type}); }
      if (ok) out.push(cells);
    }
    if (len <= h) for (let x = 0; x < w; x++) for (let y = 0; y <= h - len; y++) {
      const cells = []; let ok = true;
      for (let i = 0; i < len && ok; i++) { if (!usable(x, y + i)) ok = false; else cells.push({x, y: y + i, type}); }
      if (ok) out.push(cells);
    }
    return out;
  }

  /** Partition C (>=3) into line-lengths each in [3,6] (greedy 3s, remainder folded). */
  static partitionCount(C) {
    if (C <= 6) return [C];
    const parts = []; let rem = C;
    while (rem > 6) { parts.push(3); rem -= 3; }
    if (rem < 3) parts[parts.length - 1] += rem; else parts.push(rem);
    return parts;
  }

  /** Coverage placements for one type: each is a list of disjoint dissolving
   * lines whose cells together cover the type's full count. Capped. */
  coverageSets(type, budget = 30) {
    const parts = TargetPlanner.partitionCount(this.clearTypeTotals[type]);
    const results = [];
    const dfs = (i, chosen, used) => {
      if (results.length >= budget) return;
      if (i === parts.length) { results.push(chosen.map(g => g.slice())); return; }
      for (const line of this.linePlacements(type, parts[i])) {
        if (line.some(c => used.has(c.x + ',' + c.y))) continue;
        line.forEach(c => used.add(c.x + ',' + c.y));
        dfs(i + 1, [...chosen, line], used);
        line.forEach(c => used.delete(c.x + ',' + c.y));
        if (results.length >= budget) return;
      }
    };
    dfs(0, [], new Set());
    return results;
  }

  /** Coverage-only candidate targets for the clear-all demand (cartesian across
   * types, hard-capped). Each target = array of dissolving line-groups. */
  planClearAllTargets() {
    if (this.clearTypes.some(t => this.firstWaveNoTypes.includes(t) || this.noSolvableTypes.includes(t))) return [];
    const perType = this.clearTypes.map(t => this.coverageSets(t, 30));
    if (perType.some(list => list.length === 0)) return [];
    let combos = [[]];
    for (const list of perType) {
      const next = [];
      for (const acc of combos) {
        const cells = new Set(acc.flat().map(c => c.x + ',' + c.y));
        for (const cov of list) {
          if (cov.flat().some(c => cells.has(c.x + ',' + c.y))) continue;
          next.push([...acc, ...cov]);
          if (next.length >= 30) break;
        }
        if (next.length >= 30) break;
      }
      combos = next;
      if (combos.length === 0) return [];
    }
    return combos;
  }

  /** Route many coverage placements; keep the one that clears everything (and
   * meets any first-combo target) with the MOST total combos.
   * @param {Array|null} targetsOverride route only these targets instead of
   *   planning them here — used by phone/parallel.js to shard the (mutually
   *   independent) placements across worker threads. */
  solveClearAll(targetsOverride = null) {
    const targets = targetsOverride ?? this.planClearAllTargets();
    if (targets.length === 0) return {solution: null, reason: 'no-feasible-target', targetsTried: 0};
    let best = null, bestCombos = -1, tried = 0;
    const budget = Math.max(this.maxTargets, 30);
    for (const target of targets) {
      if (tried >= budget) break;
      tried++;
      const route = this.routeToTarget(target);
      if (route === null) continue;
      const sim = BoardSimulator.resolve(route.board, {sealedColumns: this.sealedColumns, flags: this.flags, twoMatch: this.twoMatch, noSolvableTypes: this.noSolvableTypes, hazardPositions: this.hazardPositions, reserveTypes: this.reserveTypes.length > 0 ? this.reserveTypes : null});
      if (sim.hazardViolated || sim.shieldViolated || sim.reserveViolated || sim.curseViolated) continue;
      if (!firstWaveHaveOk(sim, this.firstWaveHaveTypes)) continue;
      if (!firstWaveNoOk(sim, this.firstWaveNoTypes)) continue;
      if (this.clearTypes.some(t => sim.firstClearedByType[t] < this.clearTypeTotals[t])) continue;
      if (this.clearAllComboFloor > 0 && (this.exact ? sim.firstCombos !== this.clearAllComboFloor : sim.firstCombos < this.clearAllComboFloor)) continue;
      if (this.attrTarget > 0 && (this.exactAttr ? sim.firstAttrCombos !== this.attrTarget : sim.firstAttrCombos < this.attrTarget)) continue;
      if (sim.totalCombos > bestCombos) {
        bestCombos = sim.totalCombos;
        best = {
          startX: route.startX, startY: route.startY,
          path: route.path, moves: route.moves, board: route.board,
          score: sim.totalCombos * 4, comboCount: sim.totalCombos,
          firstCombos: sim.firstCombos, firstAttrCombos: sim.firstAttrCombos,
          firstRunes: sim.firstRunes,
          firstClearedByType: sim.firstClearedByType, chains: sim.chains,
        };
        if (this.verbose) console.log(`[TargetPlanner] clear-all target #${tried}: combos=${sim.totalCombos}`);
      }
    }
    return best ? {solution: best, reason: 'ok', targetsTried: tried}
                : {solution: null, reason: 'routing-failed', targetsTried: tried};
  }

  // ---- first-wave-have via minimal coverage (PROJECT-FACTS P32/P33) ----
  // Requiring N DIFFERENT types to each dissolve at least once in wave 1 is
  // a much tighter simultaneous target than DoraSolver's greedy beam steering
  // reliably finds (measured live: 5 types, only 2/5 achieved at beam 6400 —
  // a genuine local optimum, not a bug). Unlike clear-all (which must cover
  // a type's FULL count via coverageSets' partitioned multi-line dfs), "have"
  // only needs ONE min-run line per type — so this reuses `linePlacements`
  // directly with no partitioning, then the SAME cartesian-product-across-
  // types + routeToTarget machinery as planClearAllTargets/solveClearAll.

  /** Single min-run-length line placements of `type` — candidates for "at
   * least one dissolve" (P32), as opposed to coverageSets' full-count
   * partition (clear-all, P14). */
  haveSets(type) {
    const minRun = this.twoMatch && [...this.twoMatch].includes(type) ? 2 : 3;
    return this.linePlacements(type, minRun);
  }

  /** Coverage-only candidate targets for the --first-wave-have demand: ONE
   * min-run dissolving line per listed type (cartesian across types, hard-
   * capped), never overlapping. Mirrors planClearAllTargets exactly, just
   * with haveSets (single line) instead of coverageSets (partitioned full
   * coverage) per type. */
  planHaveTargets() {
    if (this.firstWaveHaveTypes.some(t => this.firstWaveNoTypes.includes(t) || this.noSolvableTypes.includes(t))) return [];
    const perType = this.firstWaveHaveTypes.map(t => this.haveSets(t));
    if (perType.some(list => list.length === 0)) return [];
    let combos = [[]];
    for (const list of perType) {
      const next = [];
      for (const acc of combos) {
        const cells = new Set(acc.flat().map(c => c.x + ',' + c.y));
        for (const line of list) {
          if (line.some(c => cells.has(c.x + ',' + c.y))) continue;
          next.push([...acc, line]);
          if (next.length >= 30) break;
        }
        if (next.length >= 30) break;
      }
      combos = next;
      if (combos.length === 0) return [];
    }
    return combos;
  }

  /** Route many have-coverage placements; keep the one that satisfies every
   * listed type (and the reserve floor / every other flag) with the MOST
   * total combos. Same shape as solveClearAll(targetsOverride).
   * @param {Array|null} targetsOverride route only these targets instead of
   *   planning them here — used by phone/parallel.js to shard placements
   *   across worker threads. */
  solveHave(targetsOverride = null) {
    const targets = targetsOverride ?? this.planHaveTargets();
    if (targets.length === 0) return {solution: null, reason: 'no-feasible-target', targetsTried: 0};
    let best = null, bestCombos = -1, tried = 0;
    const budget = Math.max(this.maxTargets, 30);
    for (const target of targets) {
      if (tried >= budget) break;
      tried++;
      const route = this.routeToTarget(target);
      if (route === null) continue;
      const sim = BoardSimulator.resolve(route.board, {sealedColumns: this.sealedColumns, flags: this.flags, twoMatch: this.twoMatch, noSolvableTypes: this.noSolvableTypes, hazardPositions: this.hazardPositions, reserveTypes: this.reserveTypes.length > 0 ? this.reserveTypes : null});
      if (sim.hazardViolated || sim.shieldViolated || sim.reserveViolated || sim.curseViolated) continue;
      if (!firstWaveHaveOk(sim, this.firstWaveHaveTypes)) continue;
      if (!firstWaveNoOk(sim, this.firstWaveNoTypes)) continue;
      if (this.clearAllComboFloor > 0 && (this.exact ? sim.firstCombos !== this.clearAllComboFloor : sim.firstCombos < this.clearAllComboFloor)) continue;
      if (this.attrTarget > 0 && (this.exactAttr ? sim.firstAttrCombos !== this.attrTarget : sim.firstAttrCombos < this.attrTarget)) continue;
      if (sim.totalCombos > bestCombos) {
        bestCombos = sim.totalCombos;
        best = {
          startX: route.startX, startY: route.startY,
          path: route.path, moves: route.moves, board: route.board,
          score: sim.totalCombos * 4, comboCount: sim.totalCombos,
          firstCombos: sim.firstCombos, firstAttrCombos: sim.firstAttrCombos,
          firstRunes: sim.firstRunes,
          firstClearedByType: sim.firstClearedByType, chains: sim.chains,
        };
        if (this.verbose) console.log(`[TargetPlanner] have target #${tried}: combos=${sim.totalCombos}`);
      }
    }
    return best ? {solution: best, reason: 'ok', targetsTried: tried}
                : {solution: null, reason: 'routing-failed', targetsTried: tried};
  }

  solve() {
    // Clear-all needs constructive coverage (beam search MISSes scattered scarce
    // types); route many coverage placements and keep the highest-combo one.
    if (this.clearTypes.length > 0) return this.solveClearAll();
    // first-wave-have across several DIFFERENT types is a much tighter
    // simultaneous target than DoraSolver's greedy steering reliably finds
    // (P32/P33) — same constructive-coverage escape hatch as clear-all.
    if (this.firstWaveHaveTypes.length > 0) return this.solveHave();
    const targets = this.planTargets();
    if (targets.length === 0) return {solution: null, reason: 'no-feasible-target', targetsTried: 0};
    let tried = 0;
    for (const target of targets) {
      tried++;
      const route = this.routeToTarget(target);
      if (route === null) continue;
      const sim = BoardSimulator.resolve(route.board, {sealedColumns: this.sealedColumns, flags: this.flags, twoMatch: this.twoMatch, noSolvableTypes: this.noSolvableTypes, hazardPositions: this.hazardPositions, reserveTypes: this.reserveTypes.length > 0 ? this.reserveTypes : null});
      if (sim.hazardViolated || sim.shieldViolated || sim.reserveViolated || sim.curseViolated) continue;
      if (!firstWaveHaveOk(sim, this.firstWaveHaveTypes)) continue;
      // reject accidental merges/extras (exact) or shortfalls (both modes)
      if (this.exact ? sim.firstCombos !== this.target : sim.firstCombos < this.target) continue;
      if (this.attrTarget > 0 && (this.exactAttr ? sim.firstAttrCombos !== this.attrTarget : sim.firstAttrCombos < this.attrTarget)) continue;
      if (!firstWaveNoOk(sim, this.firstWaveNoTypes)) continue;
      // reject routes that violate a clear-all-of-type demand
      if (this.clearTypes.some(t => sim.firstClearedByType[t] < this.clearTypeTotals[t])) continue;
      if (this.verbose) console.log(`[TargetPlanner] target #${tried} routed in ${route.moves.length} moves, first=${sim.firstCombos}`);
      return {
        solution: {
          startX: route.startX, startY: route.startY,
          path: route.path, moves: route.moves, board: route.board,
          score: sim.totalCombos * 4, comboCount: sim.totalCombos,
          firstCombos: sim.firstCombos, firstAttrCombos: sim.firstAttrCombos,
          firstRunes: sim.firstRunes,
          firstClearedByType: sim.firstClearedByType, chains: sim.chains,
        },
        reason: 'ok', targetsTried: tried,
      };
    }
    return {solution: null, reason: 'routing-failed', targetsTried: tried};
  }
}

/**
 * 排珠 rearrangement mode (P50, 2026-07-10, User-requested + User-confirmed
 * design). A card skill: runes can be dragged to ANY position and released
 * WITHOUT triggering a dissolve — only when the stage's timer expires does a
 * normal full cascade resolve run. User-confirmed model: multiple SEPARATE
 * drags are allowed before time runs out (not one continuous drag), no
 * gravity happens between releases (the board is frozen except for the
 * drags themselves), the drag budget is effectively unlimited, and at
 * time-up the resolve is a FULL cascade (same as BoardSimulator.resolve()
 * everywhere else) — so the existing demand flags (--clear-all,
 * --want-group, --first-combos, etc.) should compose with this mode using
 * their EXISTING meaning, just solved by choosing the best PERMUTATION of
 * the existing runes instead of searching a single drag path.
 *
 * Why this reframes the problem entirely: adjacent-cell TRANSPOSITIONS
 * (direct swaps, which is this project's drag model — see Board.swap) on
 * any CONNECTED graph generate the full symmetric group on that graph's
 * nodes (a standard result, and NOT the same as the classic sliding
 * 15-puzzle's single-blank model, which has a real parity obstruction —
 * there is no such obstruction here because every move is a genuine pairwise
 * swap, not a slide into one hole). So with "unlimited" multi-drag budget
 * and no intervening gravity/dissolve, ANY permutation of the runes within
 * one connected region of "swappable" cells is achievable via SOME finite
 * sequence of real drags. The solving problem is therefore NOT "find the
 * best drag path" (DoraSolver's job) but "find the best ARRANGEMENT of the
 * existing runes" — then, separately, decompose that arrangement into an
 * actual executable sequence of drags (decomposeRearrangement below).
 *
 * Movability: a cell can participate in ANY swap unless CELL_FLAGS.NO_SWAP
 * is set on it (hurricane/locked cells — P9/P29). NO_PICKUP does NOT reduce
 * reachability here (unlike single-drag solving): a NO_PICKUP cell's rune
 * can still be relocated by a DIFFERENT drag that swaps something else INTO
 * it, displacing it out — NO_PICKUP only restricts which cell a PHYSICAL
 * drag may START from, and decomposeRearrangement never needs to start a
 * drag on a NO_PICKUP cell to relocate its contents (see BFS donor search:
 * a NO_PICKUP cell is only ever the DESTINATION of the final swap in a
 * chain, never required to be the drag's start). Sealed columns (P6) do NOT
 * restrict movability at all (only dissolve, which BoardSimulator.resolve
 * already models) — a rune can be dragged into or out of a sealed column
 * freely under this mode, same as ordinary dragging.
 *
 * Runes are STRICTLY confined to their own connected component of
 * swappable cells — there is no path a drag could ever take between two
 * disconnected regions, so cross-component rearrangement is impossible by
 * construction, not a search limitation.
 */
class RearrangeSolver {
  constructor(board, options = {}) {
    this.board = board;
    // A plain DoraSolver, constructed with the SAME options, is used purely
    // as a SCORING ENGINE (calculateWeight/steerFor) — never .solve()d. This
    // reuses its constructor's setup (clearTypeTotals, _nd, tunable
    // defaults) and its steering logic byte-for-byte with zero duplication;
    // see steerFor's doc comment for why this is safe.
    this.scorer = new DoraSolver(board, options);
    this.flags = options.flags ?? null;
    this.sealedColumns = options.sealedColumns ?? [];
    this.beamWidth = options.rearrangeBeamWidth ?? 60;
    this.maxSteps = options.rearrangeMaxSteps ?? 40;
    this.verbose = options.verbose ?? false;
  }

  flag(x, y) { return this.flags === null ? 0 : this.flags[y][x]; }
  movable(x, y) { return (this.flag(x, y) & CELL_FLAGS.NO_SWAP) === 0; }

  /** Connected components of swappable cells (4-directional grid adjacency,
   * restricted to movable() cells). Each component is an array of {x,y};
   * components of size <2 have nothing to rearrange and are skipped by
   * solve(). @returns {Array<Array<{x,y}>>} */
  movableComponents() {
    const w = this.board.width, h = this.board.height;
    const seen = new Set();
    const components = [];
    for (let y0 = 0; y0 < h; y0++) {
      for (let x0 = 0; x0 < w; x0++) {
        if (!this.movable(x0, y0) || seen.has(y0 * w + x0)) continue;
        const comp = [];
        const queue = [{x: x0, y: y0}];
        seen.add(y0 * w + x0);
        while (queue.length > 0) {
          const {x, y} = queue.shift();
          comp.push({x, y});
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const key = ny * w + nx;
            if (seen.has(key) || !this.movable(nx, ny)) continue;
            seen.add(key);
            queue.push({x: nx, y: ny});
          }
        }
        components.push(comp);
      }
    }
    return components;
  }

  /** Score one candidate board via the shared DoraSolver scoring engine.
   * @returns {{searchScore, weight, comboCount, ...steerFor fields, constraintsOk}} */
  scoreBoard(board) {
    const {weight, sim} = this.scorer.calculateWeight(board);
    const steered = this.scorer.steerFor(board, sim);
    const constraintsOk = steered.hazardOk && steered.shieldOk && steered.reserveOk && steered.curseOk;
    return {weight, searchScore: weight + steered.steer, constraintsOk, ...steered};
  }

  /**
   * Beam search over SWAP moves (not drag-path moves): each step tries
   * swapping every pair of cells within one connected movable component,
   * keeps the top beamWidth boards by searchScore, repeats maxSteps times.
   * Mirrors DoraSolver.solve()'s best/bestQualified/bestHardOnly tiering
   * (same qualifies/constraintsOk shape) so the SAME demand flags behave
   * identically in meaning, just searched via permutations instead of paths.
   * @returns {{board, score, comboCount, firstCombos, firstAttrCombos,
   *   firstRunes, firstClearedByType, chains, movableCells}} same solution
   *   shape as DoraSolver's _solution() minus path/moves/startX/startY
   *   (there is no single drag path — see decomposeRearrangement).
   */
  solve() {
    const components = this.movableComponents().filter(c => c.length >= 2);
    let board = this.board.clone();
    const movableCells = components.flat();
    const opts = this.scorer;

    const better = (a, b) => {
      if (b === null) return true;
      if (a.weight !== b.weight) return a.weight > b.weight;
      return a.comboCount > b.comboCount;
    };
    const hasOptionalTarget = opts.minFirstCombos > 0 || opts.minFirstAttrCombos > 0
      || opts.minFirstRunes > 0 || opts.wantGroupType !== null;
    const hasHardDemand = opts.clearTypes.length > 0 || opts.firstWaveNoTypes.length > 0 || opts.firstWaveHaveTypes.length > 0;

    for (const comp of components) {
      let beam = [board];
      let best = null, bestQualified = null, bestHardOnly = null;
      const consider = b => {
        const sc = this.scoreBoard(b);
        if (!sc.constraintsOk) return null;
        const cand = {board: b, weight: sc.weight, searchScore: sc.searchScore, comboCount: sc.comboCount,
          firstCombos: sc.firstCombos, firstAttrCombos: sc.firstAttrCombos, firstRunes: sc.firstRunes,
          firstClearedByType: sc.firstClearedByType, chains: sc.chains};
        if (better(cand, best)) best = cand;
        const qualifies = (opts.minFirstCombos === 0 || (opts.exactFirstCombos
            ? sc.firstCombos === opts.minFirstCombos : sc.firstCombos >= opts.minFirstCombos))
          && (opts.minFirstAttrCombos === 0 || (opts.exactFirstAttrCombos
            ? sc.firstAttrCombos === opts.minFirstAttrCombos : sc.firstAttrCombos >= opts.minFirstAttrCombos))
          && (opts.minFirstRunes === 0 || (opts.exactFirstRunes
            ? sc.firstRunes === opts.minFirstRunes : sc.firstRunes >= opts.minFirstRunes))
          && sc.clearAllOk && sc.firstWaveNoOk && sc.firstWaveHaveOk && sc.wantGroupOk;
        if ((hasOptionalTarget || hasHardDemand) && qualifies && better(cand, bestQualified)) bestQualified = cand;
        if (hasHardDemand && sc.clearAllOk && sc.firstWaveNoOk && sc.firstWaveHaveOk && better(cand, bestHardOnly)) bestHardOnly = cand;
        return cand;
      };
      consider(board); // the current (no-op) arrangement is always a valid candidate

      for (let step = 0; step < this.maxSteps; step++) {
        const children = [];
        const seen = new Set();
        for (const b of beam) {
          for (let i = 0; i < comp.length; i++) {
            for (let j = i + 1; j < comp.length; j++) {
              const a = comp[i], c = comp[j];
              if (b.get(a.x, a.y) === b.get(c.x, c.y)) continue; // no-op swap
              const child = b.clone();
              child.swap(a.x, a.y, c.x, c.y);
              const key = gridKeyOf(child);
              if (seen.has(key)) continue;
              seen.add(key);
              const cand = consider(child);
              if (cand) children.push(cand);
            }
          }
        }
        if (children.length === 0) break;
        children.sort((x, y) => y.searchScore - x.searchScore);
        beam = children.slice(0, this.beamWidth).map(c => c.board);
        if (this.verbose && step % 5 === 4) {
          console.log(`[RearrangeSolver] component(${comp.length} cells) step ${step + 1}/${this.maxSteps} best weight=${best ? best.weight : 'n/a'}`);
        }
      }
      const pick = bestQualified ?? bestHardOnly ?? best;
      if (pick) board = pick.board;
    }

    const finalSc = this.scoreBoard(board);
    return {
      board, score: finalSc.weight, comboCount: finalSc.comboCount,
      firstCombos: finalSc.firstCombos, firstAttrCombos: finalSc.firstAttrCombos,
      firstRunes: finalSc.firstRunes, firstClearedByType: finalSc.firstClearedByType,
      chains: finalSc.chains, movableCells,
    };
  }
}

/**
 * Decompose a target rearrangement into an executable SEQUENCE of separate
 * drags (排珠, RearrangeSolver's companion).
 *
 * Algorithm: prune cells in LEAF ORDER of a spanning tree over the movable
 * region (one tree per connected component). Removing a LEAF from a tree
 * never disconnects the rest of it — this is what guarantees termination
 * and correctness where a naive "lock in scan order" approach can strand a
 * cell whose donor becomes unreachable once the shrinking search graph
 * disconnects (caught live in this project's own testing before shipping:
 * a fixed row-major scan order locked cells whose donors later became
 * unreachable, leaving the replayed board with 10+ mismatched cells).
 *
 * INVARIANT (why every donor search below is guaranteed to succeed): at
 * every point, {board values among not-yet-pruned cells} as a MULTISET
 * equals {target values among not-yet-pruned cells}. True initially
 * (RearrangeSolver only performs swaps within a component, which conserves
 * the multiset) and preserved by induction — fixing a leaf L moves values
 * around ONLY among cells that remain not-yet-pruned (the donor's path),
 * then L (now matching its target) is removed from both sides equally.
 * So the needed value for the CURRENT leaf always exists among not-yet-
 * pruned cells, and since that set stays connected (leaf-pruning invariant)
 * a BFS search from the leaf is GUARANTEED to reach it.
 *
 * The BFS donor search itself uses the FULL grid-adjacency graph (not
 * restricted to tree edges) among not-yet-pruned cells, for shorter/more
 * natural drag paths than tree-only routing would give — the spanning tree
 * is used ONLY to decide a safe PROCESSING ORDER, not to constrain paths.
 *
 * --convert composition (2026-07-10, User-requested + User-confirmed
 * design): the touch-conversion card skill (P46) can be layered on top —
 * "only the FIRST drag converts, and the touched-rune count can be
 * infinite (--convert TYPE:max)". Only the first PHYSICAL drag actually
 * generated (not the first leaf processed — some leaves already match
 * their target and need no drag at all) applies `applyDragSwap`'s
 * conversion semantics to its own path: the picked-up rune (path[0], never
 * a swap DESTINATION) still always rides unconverted to the end, exactly
 * like single-drag mode. Because this happens strictly AFTER
 * RearrangeSolver already chose the target board, it is a pure EXECUTION
 * side-effect on top of an already-fixed plan — same "bonus, not a
 * requirement" model as single-drag --convert composing with --clear-all
 * (P48): the search never needs to know about it.
 *
 * Consequence for the leaf-pruning invariant above: forcing some of the
 * first drag's LEFT-BEHIND cells to convertType is a genuine rune-TYPE
 * change, which the multiset-conservation proof above assumed never
 * happens — so after the first drag, a LATER leaf's exact needed value may
 * no longer exist anywhere among not-yet-pruned cells (converted away).
 * bfsFindDonor returning null is therefore a real, expected outcome once
 * conversion is active (not "never happens" as in the no-convert case) —
 * handled by skipping that leaf's fix entirely (best-effort: it keeps
 * whatever value conversion left it with) rather than crashing. The
 * happens ONLY when conversion consumed the last copy of a value some
 * not-yet-fixed cell's target needed — since the first drag is a single,
 * fixed event (not repeated), this is a bounded, one-time risk from that
 * one drag, not a growing problem across the sequence. Left unmeasured
 * live: how often it actually triggers in practice (a live probe in this
 * project's own testing, with convertCount=Infinity across a wide first
 * drag, found zero misses — but that is one data point, not a guarantee).
 *
 * @param {Board} originalBoard the board before any drags
 * @param {Board} targetBoard RearrangeSolver's chosen final arrangement
 * @param {Array<{x,y}>} movableCells cells eligible to participate (same
 *   list RearrangeSolver.solve() returns — everything outside this set is
 *   assumed identical between originalBoard/targetBoard and is left alone)
 * @param {number|null} convertType rune type the first drag's touched
 *   (left-behind) cells convert to; null = no conversion (default)
 * @param {number} convertCount how many of the first drag's touches
 *   convert (1-indexed by touch order); may be Infinity for the whole drag
 * @returns {{drags: Array<{startX, startY, path: Array<{x,y}>, moves:
 *   string[]}>, board: Board}} `board` is the ACTUAL final board — equal to
 *   targetBoard when convertType is null, but DIFFERENT from it once
 *   conversion is active (the whole point of returning it): callers doing
 *   any post-decomposition demand check (--clear-all, --want-group, etc.)
 *   must use THIS board, never targetBoard, or they'd be checking against
 *   an arrangement that no longer exists after real conversion happened.
 */
function decomposeRearrangement(originalBoard, targetBoard, movableCells, convertType = null, convertCount = 0) {
  const board = originalBoard.clone();
  const drags = [];
  const w = originalBoard.width, h = originalBoard.height;
  const cellKey = (x, y) => y * w + x;
  const dirName = (dx, dy) => dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
  const movableSet = new Set(movableCells.map(c => cellKey(c.x, c.y)));
  const cellOf = new Map(movableCells.map(c => [cellKey(c.x, c.y), c]));

  // Spanning tree(s) via BFS from an arbitrary root per connected component
  // (a component here can only be entered from within — grid-adjacency
  // restricted to movableSet — so BFS naturally stays inside one component).
  const treeAdj = new Map(movableCells.map(c => [cellKey(c.x, c.y), new Set()]));
  const seenForTree = new Set();
  for (const root of movableCells) {
    const rk = cellKey(root.x, root.y);
    if (seenForTree.has(rk)) continue;
    seenForTree.add(rk);
    const queue = [root];
    while (queue.length > 0) {
      const cur = queue.shift();
      const ck = cellKey(cur.x, cur.y);
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const nk = cellKey(nx, ny);
        if (!movableSet.has(nk) || seenForTree.has(nk)) continue;
        seenForTree.add(nk);
        treeAdj.get(ck).add(nk);
        treeAdj.get(nk).add(ck);
        queue.push({x: nx, y: ny});
      }
    }
  }

  const pruned = new Set();
  const degree = new Map([...treeAdj].map(([k, nbrs]) => [k, nbrs.size]));

  const bfsFindDonor = (from, neededValue) => {
    const visited = new Set([cellKey(from.x, from.y)]);
    let frontier = [{x: from.x, y: from.y, path: [{x: from.x, y: from.y}]}];
    while (frontier.length > 0) {
      const next = [];
      for (const node of frontier) {
        if (!(node.x === from.x && node.y === from.y) && board.get(node.x, node.y) === neededValue) {
          return node.path;
        }
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const nx = node.x + dx, ny = node.y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const key = cellKey(nx, ny);
          if (visited.has(key) || pruned.has(key) || !movableSet.has(key)) continue;
          visited.add(key);
          next.push({x: nx, y: ny, path: [...node.path, {x: nx, y: ny}]});
        }
      }
      frontier = next;
    }
    // Without conversion this is provably unreachable (invariant above);
    // WITH conversion (convertType !== null) it's a real, expected outcome
    // once earlier drags have converted away the last supply of a value —
    // the caller treats null as "skip this leaf, best-effort".
    return null;
  };

  let leaves = [...degree.entries()].filter(([, d]) => d <= 1).map(([k]) => k);
  while (leaves.length > 0) {
    const lk = leaves.pop();
    if (pruned.has(lk)) continue;
    const leaf = cellOf.get(lk);
    if (board.get(leaf.x, leaf.y) !== targetBoard.get(leaf.x, leaf.y)) {
      const needed = targetBoard.get(leaf.x, leaf.y);
      const path = bfsFindDonor(leaf, needed);
      if (path !== null) {
        // path runs leaf -> ... -> donor; reverse so index0 = donor (drag
        // start) and the drag ends AT the leaf, delivering donor's value
        // there via the same swap-chain semantics used everywhere else.
        const dragPath = [...path].reverse();
        // --convert (see doc comment above): ONLY the first drag actually
        // generated applies conversion, via the SAME applyDragSwap used by
        // single-drag mode (touchIndex = path length BEFORE this move,
        // 1-indexed) — the picked-up rune at dragPath[0] is never a swap
        // destination, so it always still rides unconverted to the leaf.
        const applyConvert = convertType !== null && drags.length === 0;
        let cur = dragPath[0];
        const moves = [];
        for (let i = 1; i < dragPath.length; i++) {
          const nxt = dragPath[i];
          if (applyConvert) applyDragSwap(board, cur.x, cur.y, nxt.x, nxt.y, i, convertType, convertCount);
          else board.swap(cur.x, cur.y, nxt.x, nxt.y);
          moves.push(dirName(nxt.x - cur.x, nxt.y - cur.y));
          cur = nxt;
        }
        drags.push({startX: dragPath[0].x, startY: dragPath[0].y, path: dragPath, moves});
      }
    }
    pruned.add(lk);
    for (const nk of treeAdj.get(lk)) {
      if (pruned.has(nk)) continue;
      degree.set(nk, degree.get(nk) - 1);
      if (degree.get(nk) <= 1) leaves.push(nk);
    }
  }
  return {drags, board};
}

/**
 * Find the MAXIMUM achievable first-wave combo count on a board (P10):
 * upper-bound it from movable rune counts and resolvable-cell geometry, take
 * the DoraSolver result as the baseline, then let TargetPlanner construct
 * each higher N from the bound downward. Returns the best solution found —
 * never null (worst case: the plain DoraSolver solution).
 * @returns {{solution: object, achieved: number, bound: number}}
 */
/**
 * Upper bound on achievable first-wave combos from movable rune counts and
 * resolvable-cell geometry (P10). Shared with phone/parallel.js's
 * solveMaxFirstCombosParallel so the two never drift out of sync.
 */
function computeMaxFirstCombosBound(board, options = {}) {
  const sealedColumns = options.sealedColumns ?? [];
  const flags = options.flags ?? null;
  const firstWaveNoTypes = options.firstWaveNoTypes ?? [];
  const noSolvableTypes = options.noSolvableTypes ?? [];
  const flag = (x, y) => flags === null ? 0 : flags[y][x];
  const counts = Array(6).fill(0);
  let resolvableCells = 0;
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const v = board.get(x, y);
      if ((flag(x, y) & CELL_FLAGS.NO_SWAP) === 0 && v >= 0 && v < FROZEN && !noSolvableTypes.includes(v)) counts[v]++;
      if (!sealedColumns.includes(x) && v !== FROZEN && !noSolvableTypes.includes(v)
          && (flag(x, y) & (CELL_FLAGS.NO_DISSOLVE | CELL_FLAGS.NO_SWAP)) === 0) resolvableCells++;
    }
  }
  const colorBound = counts.reduce((s, c, t) => s + (firstWaveNoTypes.includes(t) ? 0 : Math.floor(c / 3)), 0);
  return Math.min(colorBound, Math.floor(resolvableCells / 3));
}

function solveMaxFirstCombos(board, options = {}) {
  const sealedColumns = options.sealedColumns ?? [];
  const flags = options.flags ?? null;
  const startCells = options.startCells ?? null;
  const endCells = options.endCells ?? (options.endCell ? [options.endCell] : null);
  const fireRoute = options.fireRoute ?? 0;
  const twoMatch = options.twoMatch ?? null;
  const clearTypes = options.clearTypes ?? [];
  const firstWaveNoTypes = options.firstWaveNoTypes ?? [];
  const firstWaveHaveTypes = options.firstWaveHaveTypes ?? [];
  const reserveTypes = options.reserveTypes ?? [];
  const noSolvableTypes = options.noSolvableTypes ?? [];
  const hazardPositions = options.hazardPositions ?? null;
  const minFirstAttrCombos = options.minFirstAttrCombos ?? 0;
  const exactFirstAttrCombos = options.exactFirstAttrCombos ?? false;
  const convertType = options.convertType ?? null;
  const convertCount = options.convertCount ?? 0;
  const wantGroupType = options.wantGroupType ?? null;
  const wantGroupSize = options.wantGroupSize ?? 0;
  const bound = computeMaxFirstCombosBound(board, options);

  const dora = new DoraSolver(board, {
    beamWidth: options.beamWidth ?? 200, maxPath: options.maxPath ?? 30,
    sealedColumns, flags, minFirstCombos: bound, minFirstAttrCombos, exactFirstAttrCombos,
    priorityCells: options.priorityCells ?? [], startCells, endCells, fireRoute, twoMatch, clearTypes, firstWaveNoTypes, firstWaveHaveTypes, reserveTypes, noSolvableTypes, hazardPositions, convertType, convertCount, wantGroupType, wantGroupSize,
  }).solve();
  let best = dora, achieved = dora.firstCombos;

  for (let n = bound; n > achieved; n--) {
    const res = new TargetPlanner(board, {
      sealedColumns, flags, minFirstCombos: n, minFirstAttrCombos, exactFirstAttrCombos,
      beamWidth: options.plannerBeamWidth ?? 300,
      maxPath: options.plannerMaxPath ?? 60,
      startCells, endCells, fireRoute, twoMatch, clearTypes, firstWaveNoTypes, firstWaveHaveTypes, reserveTypes, noSolvableTypes, hazardPositions, convertType, convertCount,
    }).solve();
    if (res.solution) { best = res.solution; achieved = n; break; }
  }
  return {solution: best, achieved, bound};
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {Board, MatchFinder, PathFinder, RuneSolver, ComboMaximizer, BeamSearchSolver, UnlimitedSolver, BoardSimulator, DoraSolver, TargetPlanner, RearrangeSolver, decomposeRearrangement, solveMaxFirstCombos, computeMaxFirstCombosBound, CELL_FLAGS, FROZEN, SHIELD_BASE, CURSE_BASE, applyDragSwap};
}
