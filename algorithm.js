// TOS Auto Spinner - Rune Movement Algorithm

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

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {Board, MatchFinder, PathFinder, RuneSolver, ComboMaximizer, BeamSearchSolver, UnlimitedSolver};
}
