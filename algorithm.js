// TOS Auto Spinner - Rune Movement Algorithm

/**
 * Per-cell constraint flags for real-game board effects (PROJECT-FACTS P9).
 * Passed as a 5x6 bitmask grid `flags[y][x]`; flags are POSITIONAL — they
 * stay with the cell, not the rune (matches the sealed-column observation;
 * a future per-rune travelling effect needs a different mechanism).
 * Combine freely: e.g. a frozen rune = NO_PICKUP | NO_SWAP.
 */
const CELL_FLAGS = {
  NO_DISSOLVE: 1, // cell never joins a match group (sealed column/tile)
  NO_PICKUP: 2,   // rune cannot be grabbed as the held rune
  NO_SWAP: 4,     // cell cannot be entered/displaced by a drag path
};

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
function fireBlocked(path, nx, ny, fireLen) {
  if (fireLen <= 0) return false;
  const end = path.length - 1; // current cell index — excluded (you're on it)
  for (let i = end - 1; i >= 0 && i >= end - fireLen; i--) {
    if (path[i].x === nx && path[i].y === ny) return true;
  }
  return false;
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
   * @returns {Array<{type: number, cells: Array<[number, number]>}>}
   */
  static findComboGroups(board, sealedColumns = [], flags = null) {
    const w = board.width, h = board.height;
    const sealed = new Set(sealedColumns);
    const blocked = (x, y) => sealed.has(x) ||
      (flags !== null && (flags[y][x] & CELL_FLAGS.NO_DISSOLVE) !== 0);
    const marked = Array.from({length: h}, () => Array(w).fill(false));

    // Row scan: mark maximal runs of 3+ (advance past each run — no double count)
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        const type = board.get(x, y);
        if (type === -1 || blocked(x, y)) { x++; continue; }
        let end = x + 1;
        while (end < w && !blocked(end, y) && board.get(end, y) === type) end++;
        if (end - x >= 3) {
          for (let i = x; i < end; i++) marked[y][i] = true;
        }
        x = end;
      }
    }

    // Column scan
    for (let x = 0; x < w; x++) {
      if (sealed.has(x)) continue;
      let y = 0;
      while (y < h) {
        const type = board.get(x, y);
        if (type === -1 || blocked(x, y)) { y++; continue; }
        let end = y + 1;
        while (end < h && !blocked(x, end) && board.get(x, end) === type) end++;
        if (end - y >= 3) {
          for (let i = y; i < end; i++) marked[i][x] = true;
        }
        y = end;
      }
    }

    // Flood fill (explicit stack) merging orthogonally-connected same-color marked cells
    const groups = [];
    const visited = Array.from({length: h}, () => Array(w).fill(false));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!marked[y][x] || visited[y][x]) continue;
        const type = board.get(x, y);
        const cells = [];
        const stack = [[x, y]];
        visited[y][x] = true;
        while (stack.length > 0) {
          const [cx, cy] = stack.pop();
          cells.push([cx, cy]);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            if (visited[ny][nx] || !marked[ny][nx]) continue;
            if (board.get(nx, ny) !== type) continue;
            visited[ny][nx] = true;
            stack.push([nx, ny]);
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
   * @returns {{totalCombos, firstCombos, firstRunes, firstClearedByType, chains, groups, boardAfter}}
   *   firstRunes = total orbs dissolved in the FIRST wave (some bosses, e.g.
   *   楊玉環 "NUM N", require clearing >= N runes in the first batch to deal
   *   damage — distinct from combo COUNT). firstClearedByType[t] = orbs of
   *   type t dissolved in the first wave (clear-all-of-type demands).
   */
  static resolve(board, options = {}) {
    const sealedColumns = options.sealedColumns ?? [];
    const flags = options.flags ?? null;
    const work = board.clone();
    let totalCombos = 0, firstCombos = 0, firstRunes = 0, chains = 0;
    const firstClearedByType = Array(6).fill(0);
    const allGroups = [];

    while (true) {
      const groups = BoardSimulator.findComboGroups(work, sealedColumns, flags);
      if (groups.length === 0) break;
      chains++;
      if (chains === 1) {
        firstCombos = groups.length;
        firstRunes = groups.reduce((s, g) => s + g.cells.length, 0);
        for (const g of groups) firstClearedByType[g.type] += g.cells.length;
      }
      totalCombos += groups.length;
      allGroups.push(...groups);

      for (const g of groups) {
        for (const [x, y] of g.cells) work.set(x, y, -1);
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

    return {totalCombos, firstCombos, firstRunes, firstClearedByType, chains, groups: allGroups, boardAfter: work};
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
    // Minimum FIRST-WAVE RUNE count (orbs dissolved in wave 1). Some bosses
    // (楊玉環 "NUM N") require >= N runes cleared first batch to deal damage.
    // Steered like minFirstCombos; overshoot is fine (more runes = still ok).
    this.minFirstRunes = options.minFirstRunes ?? 0;
    // When true, firstRunes must equal the target exactly — overshoot is
    // penalized in steering and disqualified.
    this.exactFirstRunes = options.exactFirstRunes ?? false;
    // Optional start/end pinning (phone --start/--end). Coordinates are {x,y}
    // = {column, row}. startCells: the drag may only BEGIN from one of these
    // cells (default null = every pickable cell is seeded). endCell: the held
    // rune must OCCUPY this cell at the END of the returned path (default null
    // = any). Both are orthogonal to every scoring/steering knob — they only
    // restrict which cells seed the beam and which states are eligible to be
    // the final answer, so they compose with sealedColumns/flags/first-wave
    // targets/priority cells unchanged. If endCell is never reached within
    // maxPath the solver returns the degenerate empty solution (moves=0), and
    // the caller aborts (phone: [TOS] ABORT=start-end).
    this.startCells = options.startCells ?? null;
    this.endCell = options.endCell ?? null;
    // Fire-route trail length (see fireBlocked). 0 = off. When >0 the drag may
    // not re-enter any of the last `fireRoute` cells it left (self-avoiding
    // within a sliding window). Orthogonal to scoring; composes with everything.
    this.fireRoute = options.fireRoute ?? 0;
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
        for (let x = 0; x < board.width; x++) this.clearTypeTotals[board.get(x, y)]++;
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
    const sealed = new Set(this.sealedColumns);
    const nd = (x, y) => sealed.has(x) ||
      (this.flags !== null && (this.flags[y][x] & CELL_FLAGS.NO_DISSOLVE) !== 0);
    let pairs = 0;
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        if (nd(x, y)) continue;
        const t = board.get(x, y);
        if (t === -1) continue;
        if (types !== null && !types.includes(t)) continue;
        if (x + 1 < board.width && !nd(x + 1, y) && board.get(x + 1, y) === t) pairs++;
        if (y + 1 < board.height && !nd(x, y + 1) && board.get(x, y + 1) === t) pairs++;
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
    const sealed = new Set(this.sealedColumns);
    let n = 0;
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        if (!sealed.has(x) && (this.flags === null || (this.flags[y][x] & CELL_FLAGS.NO_DISSOLVE) === 0)) continue;
        if (this.clearTypes.includes(board.get(x, y))) n++;
      }
    }
    return n;
  }

  /**
   * Spec §2 Step 5 (calculateWeight), on the fully-resolved cascade result.
   */
  calculateWeight(board) {
    const sim = BoardSimulator.resolve(board, {sealedColumns: this.sealedColumns, flags: this.flags});
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
   * Beam search: seed every cell -> expand (no immediate backtrack) -> score
   * -> sort -> prune to beamWidth -> repeat maxPath times (spec §2 Steps 1-7).
   * @returns best solution, interface-compatible with content.js consumers:
   *   {startX, startY, path, moves, score, comboCount, firstCombos, chains, board}
   */
  solve() {
    const f = (x, y) => this.flags === null ? 0 : this.flags[y][x];
    const startSet = this.startCells ? new Set(this.startCells.map(c => c.x + ',' + c.y)) : null;
    let beam = [];
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

    let best = null, bestQualified = null;
    const better = (a, b) => {
      if (b === null) return true;
      if (a.weight !== b.weight) return a.weight > b.weight;
      if (a.comboCount !== b.comboCount) return a.comboCount > b.comboCount;
      return a.moves.length < b.moves.length;
    };

    for (let step = 0; step < this.maxPath; step++) {
      const children = [];
      for (const s of beam) {
        for (const dir of this.dirs) {
          if (s.prevDir && dir.dx === -s.prevDir.dx && dir.dy === -s.prevDir.dy) continue;
          const nx = s.x + dir.dx, ny = s.y + dir.dy;
          if (nx < 0 || nx >= this.board.width || ny < 0 || ny >= this.board.height) continue;
          if (f(nx, ny) & CELL_FLAGS.NO_SWAP) continue;
          if (fireBlocked(s.path, nx, ny, this.fireRoute)) continue;

          const childBoard = s.board.clone();
          childBoard.swap(s.x, s.y, nx, ny);
          const {weight, sim} = this.calculateWeight(childBoard);
          // Steer the beam toward the first-combo target (no effect when 0);
          // below the target, adjacent pairs count as partial progress
          let steer = 0;
          if (this.minFirstCombos > 0) {
            steer = Math.min(sim.firstCombos, this.minFirstCombos) * this.tunable.firstComboSteer;
            if (this.exactFirstCombos) {
              steer -= Math.max(0, sim.firstCombos - this.minFirstCombos) * this.tunable.firstComboSteer;
            }
            if (sim.firstCombos < this.minFirstCombos) {
              steer += this.pairPotential(childBoard) * this.tunable.pairSteer;
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
              steer += this.pairPotential(childBoard) * this.tunable.pairSteer;
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
            steer -= this.trappedRequiredCount(childBoard) * this.tunable.firstComboSteer;
            if (!clearAllOk) {
              steer += this.pairPotential(childBoard, this.clearTypes) * this.tunable.pairSteer;
            }
          }
          const child = {
            board: childBoard, x: nx, y: ny,
            startX: s.startX, startY: s.startY,
            path: [...s.path, {x: nx, y: ny}],
            moves: [...s.moves, dir.name],
            prevDir: dir, weight, searchScore: weight + steer,
            comboCount: sim.totalCombos, firstCombos: sim.firstCombos,
            firstRunes: sim.firstRunes, firstClearedByType: sim.firstClearedByType,
            chains: sim.chains,
          };
          children.push(child);
          // endCell gate: a state is only eligible as the final answer when
          // the held rune sits on endCell (children still expand freely, so a
          // path may pass through endCell and come back). null = no constraint.
          const endOk = this.endCell === null || (nx === this.endCell.x && ny === this.endCell.y);
          if (endOk && better(child, best)) best = child;
          const qualifies = (this.minFirstCombos === 0 || (this.exactFirstCombos
              ? sim.firstCombos === this.minFirstCombos
              : sim.firstCombos >= this.minFirstCombos))
            && (this.minFirstRunes === 0 || (this.exactFirstRunes
              ? sim.firstRunes === this.minFirstRunes
              : sim.firstRunes >= this.minFirstRunes))
            && clearAllOk;
          if ((this.minFirstCombos > 0 || this.minFirstRunes > 0 || this.clearTypes.length > 0)
              && qualifies && endOk && better(child, bestQualified)) bestQualified = child;
        }
      }
      if (children.length === 0) break;
      // Deduplicate interchangeable states (same board + same held cell):
      // identical futures, so keep only the best-scoring one. Frees beam
      // slots for genuinely different boards instead of near-clones.
      const seen = new Map();
      for (const c of children) {
        const key = c.board.grid.join(';') + '#' + c.x + ',' + c.y;
        const prev = seen.get(key);
        if (prev === undefined || c.searchScore > prev.searchScore) seen.set(key, c);
      }
      const unique = [...seen.values()];
      unique.sort((a, b) => b.searchScore - a.searchScore);
      beam = unique.slice(0, this.beamWidth);
      if (this.verbose && step % 5 === 4) {
        console.log(`[DoraSolver] step ${step + 1}/${this.maxPath} best weight=${best.weight} combos=${best.comboCount}`);
      }
    }

    // Prefer the best solution meeting the first-combo target; fall back to
    // the global best (caller checks firstCombos and may abort).
    const pick = bestQualified ?? best;
    if (pick === null) {
      return {startX: 0, startY: 0, path: [{x: 0, y: 0}], moves: [], score: 0, comboCount: 0, firstCombos: 0, firstRunes: 0, firstClearedByType: Array(6).fill(0), chains: 0, board: this.board.clone()};
    }
    return {
      startX: pick.startX, startY: pick.startY,
      path: pick.path, moves: pick.moves,
      score: pick.weight, comboCount: pick.comboCount,
      firstCombos: pick.firstCombos, firstRunes: pick.firstRunes,
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
    this.endCell = options.endCell ?? null;
    this.fireRoute = options.fireRoute ?? 0; // see fireBlocked
    // Clear-all-of-type demand, VERIFICATION-ONLY here: phase 1 targets
    // first-wave combo count, not required-type coverage, so routed targets
    // violating clearTypes are rejected rather than constructed. DoraSolver's
    // clearTypes steering is the primary engine for clear-all demands; this
    // filter just keeps a planner fallback from returning a violating path.
    this.clearTypes = [...new Set(options.clearTypes ?? [])];
    this.clearTypeTotals = Array(6).fill(0);
    if (this.clearTypes.length > 0) {
      for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) this.clearTypeTotals[board.get(x, y)]++;
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
        if (this.movable(x, y)) counts[this.board.get(x, y)]++;
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
    const atEnd = (x, y) => this.endCell === null || (x === this.endCell.x && y === this.endCell.y);
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
          childBoard.swap(s.x, s.y, nx, ny);
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
        const key = c.board.grid.join(';') + '#' + c.x + ',' + c.y;
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
   * meets any first-combo target) with the MOST total combos. */
  solveClearAll() {
    const targets = this.planClearAllTargets();
    if (targets.length === 0) return {solution: null, reason: 'no-feasible-target', targetsTried: 0};
    let best = null, bestCombos = -1, tried = 0;
    const budget = Math.max(this.maxTargets, 30);
    for (const target of targets) {
      if (tried >= budget) break;
      tried++;
      const route = this.routeToTarget(target);
      if (route === null) continue;
      const sim = BoardSimulator.resolve(route.board, {sealedColumns: this.sealedColumns, flags: this.flags});
      if (this.clearTypes.some(t => sim.firstClearedByType[t] < this.clearTypeTotals[t])) continue;
      if (this.clearAllComboFloor > 0 && (this.exact ? sim.firstCombos !== this.clearAllComboFloor : sim.firstCombos < this.clearAllComboFloor)) continue;
      if (sim.totalCombos > bestCombos) {
        bestCombos = sim.totalCombos;
        best = {
          startX: route.startX, startY: route.startY,
          path: route.path, moves: route.moves, board: route.board,
          score: sim.totalCombos * 4, comboCount: sim.totalCombos,
          firstCombos: sim.firstCombos, firstRunes: sim.firstRunes,
          firstClearedByType: sim.firstClearedByType, chains: sim.chains,
        };
        if (this.verbose) console.log(`[TargetPlanner] clear-all target #${tried}: combos=${sim.totalCombos}`);
      }
    }
    return best ? {solution: best, reason: 'ok', targetsTried: tried}
                : {solution: null, reason: 'routing-failed', targetsTried: tried};
  }

  solve() {
    // Clear-all needs constructive coverage (beam search MISSes scattered scarce
    // types); route many coverage placements and keep the highest-combo one.
    if (this.clearTypes.length > 0) return this.solveClearAll();
    const targets = this.planTargets();
    if (targets.length === 0) return {solution: null, reason: 'no-feasible-target', targetsTried: 0};
    let tried = 0;
    for (const target of targets) {
      tried++;
      const route = this.routeToTarget(target);
      if (route === null) continue;
      const sim = BoardSimulator.resolve(route.board, {sealedColumns: this.sealedColumns, flags: this.flags});
      // reject accidental merges/extras (exact) or shortfalls (both modes)
      if (this.exact ? sim.firstCombos !== this.target : sim.firstCombos < this.target) continue;
      // reject routes that violate a clear-all-of-type demand
      if (this.clearTypes.some(t => sim.firstClearedByType[t] < this.clearTypeTotals[t])) continue;
      if (this.verbose) console.log(`[TargetPlanner] target #${tried} routed in ${route.moves.length} moves, first=${sim.firstCombos}`);
      return {
        solution: {
          startX: route.startX, startY: route.startY,
          path: route.path, moves: route.moves, board: route.board,
          score: sim.totalCombos * 4, comboCount: sim.totalCombos,
          firstCombos: sim.firstCombos, firstRunes: sim.firstRunes,
          firstClearedByType: sim.firstClearedByType, chains: sim.chains,
        },
        reason: 'ok', targetsTried: tried,
      };
    }
    return {solution: null, reason: 'routing-failed', targetsTried: tried};
  }
}

/**
 * Find the MAXIMUM achievable first-wave combo count on a board (P10):
 * upper-bound it from movable rune counts and resolvable-cell geometry, take
 * the DoraSolver result as the baseline, then let TargetPlanner construct
 * each higher N from the bound downward. Returns the best solution found —
 * never null (worst case: the plain DoraSolver solution).
 * @returns {{solution: object, achieved: number, bound: number}}
 */
function solveMaxFirstCombos(board, options = {}) {
  const sealedColumns = options.sealedColumns ?? [];
  const flags = options.flags ?? null;
  const startCells = options.startCells ?? null;
  const endCell = options.endCell ?? null;
  const fireRoute = options.fireRoute ?? 0;
  const clearTypes = options.clearTypes ?? [];
  const flag = (x, y) => flags === null ? 0 : flags[y][x];

  const counts = Array(6).fill(0);
  let resolvableCells = 0;
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if ((flag(x, y) & CELL_FLAGS.NO_SWAP) === 0) counts[board.get(x, y)]++;
      if (!sealedColumns.includes(x)
          && (flag(x, y) & (CELL_FLAGS.NO_DISSOLVE | CELL_FLAGS.NO_SWAP)) === 0) resolvableCells++;
    }
  }
  const colorBound = counts.reduce((s, c) => s + Math.floor(c / 3), 0);
  const bound = Math.min(colorBound, Math.floor(resolvableCells / 3));

  const dora = new DoraSolver(board, {
    beamWidth: options.beamWidth ?? 200, maxPath: options.maxPath ?? 30,
    sealedColumns, flags, minFirstCombos: bound,
    priorityCells: options.priorityCells ?? [], startCells, endCell, fireRoute, clearTypes,
  }).solve();
  let best = dora, achieved = dora.firstCombos;

  for (let n = bound; n > achieved; n--) {
    const res = new TargetPlanner(board, {
      sealedColumns, flags, minFirstCombos: n,
      beamWidth: options.plannerBeamWidth ?? 300,
      maxPath: options.plannerMaxPath ?? 60,
      startCells, endCell, fireRoute, clearTypes,
    }).solve();
    if (res.solution) { best = res.solution; achieved = n; break; }
  }
  return {solution: best, achieved, bound};
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {Board, MatchFinder, PathFinder, RuneSolver, ComboMaximizer, BeamSearchSolver, UnlimitedSolver, BoardSimulator, DoraSolver, TargetPlanner, solveMaxFirstCombos, CELL_FLAGS};
}
