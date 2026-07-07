// TOS Auto Spinner - Content Script
console.log('TOS Auto Spinner loaded!');

class TOSAutoSpinner {
  constructor() {
    this.canvas = null;
    this.boardData = [];
    this.isRunning = false;
    this.boardWidth = 6;
    this.boardHeight = 5;

    this.init();
  }

  init() {
    // Wait for page to fully load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    console.log('Setting up TOS Auto Spinner...');

    // Find the canvas element
    this.findCanvas();

    // Inject control panel
    this.injectControlPanel();

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'start') {
        this.start();
        sendResponse({success: true});
      } else if (request.action === 'stop') {
        this.stop();
        sendResponse({success: true});
      } else if (request.action === 'inspect') {
        this.inspectPage();
        sendResponse({success: true});
      }
      return true;
    });
  }

  findCanvas() {
    // Look for canvas elements
    const canvases = document.getElementsByTagName('canvas');
    console.log('Found canvases:', canvases.length);

    // First try to find DragCanvas specifically
    for (let canvas of canvases) {
      if (canvas.id === 'DragCanvas' || canvas.className.includes('DragCanvas')) {
        this.canvas = canvas;
        console.log('Found DragCanvas:', {
          id: canvas.id,
          className: canvas.className,
          width: this.canvas.width,
          height: this.canvas.height,
          offsetLeft: this.canvas.offsetLeft,
          offsetTop: this.canvas.offsetTop
        });
        return;
      }
    }

    // Fallback: use largest canvas
    if (canvases.length > 0) {
      let largestCanvas = canvases[0];
      let maxArea = 0;

      for (let canvas of canvases) {
        const area = canvas.width * canvas.height;
        if (area > maxArea) {
          maxArea = area;
          largestCanvas = canvas;
        }
      }

      this.canvas = largestCanvas;
      console.log('Selected canvas (fallback):', {
        width: this.canvas.width,
        height: this.canvas.height,
        offsetLeft: this.canvas.offsetLeft,
        offsetTop: this.canvas.offsetTop
      });
    }
  }

  inspectPage() {
    console.log('=== TOS Page Inspection ===');

    // Find all canvases
    const canvases = document.getElementsByTagName('canvas');
    console.log('Canvases found:', canvases.length);
    for (let i = 0; i < canvases.length; i++) {
      console.log(`Canvas ${i}:`, {
        id: canvases[i].id,
        width: canvases[i].width,
        height: canvases[i].height,
        className: canvases[i].className
      });
    }

    // Look for global variables that might contain game state
    console.log('Window properties (looking for game-related):');
    for (let key in window) {
      if (key.toLowerCase().includes('board') ||
          key.toLowerCase().includes('rune') ||
          key.toLowerCase().includes('gem') ||
          key.toLowerCase().includes('tos') ||
          key.toLowerCase().includes('game') ||
          key.toLowerCase().includes('stone') ||
          key.toLowerCase().includes('data')) {
        try {
          const value = window[key];
          if (value && typeof value === 'object') {
            console.log(`  ${key}:`, value);
          } else if (Array.isArray(value)) {
            console.log(`  ${key} (array):`, value);
          }
        } catch (e) {
          // Skip properties we can't access
        }
      }
    }

    // Check for any div elements that might be runes
    const allDivs = document.getElementsByTagName('div');
    console.log('Total divs:', allDivs.length);

    // Try to read canvas pixel data
    this.analyzeCanvasColors();
  }

  /**
   * Analyze canvas to detect rune colors
   * This is a fallback method if we can't find the board state in JavaScript
   */
  analyzeCanvasColors() {
    if (!this.canvas) {
      console.log('No canvas found for analysis');
      return;
    }

    try {
      const ctx = this.canvas.getContext('2d');
      const cellWidth = this.canvas.width / this.boardWidth;
      const cellHeight = this.canvas.height / this.boardHeight;

      console.log('Analyzing canvas colors...');
      console.log('Cell dimensions:', {cellWidth, cellHeight});

      // Sample the center of each cell
      for (let y = 0; y < this.boardHeight; y++) {
        for (let x = 0; x < this.boardWidth; x++) {
          const centerX = Math.floor(cellWidth * (x + 0.5));
          const centerY = Math.floor(cellHeight * (y + 0.5));

          const pixel = ctx.getImageData(centerX, centerY, 1, 1).data;
          console.log(`Cell (${x}, ${y}): RGB(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`);
        }
      }
    } catch (e) {
      console.error('Could not analyze canvas:', e);
    }
  }

  /**
   * Map RGB color to rune type
   * Rune types: 0=Water, 1=Fire, 2=Wood, 3=Light, 4=Dark, 5=Heart
   */
  rgbToRuneType(r, g, b) {
    // Define color signatures for each rune type
    const colors = [
      { type: 0, name: 'Water', r: 64, g: 193, b: 241 },   // Blue
      { type: 1, name: 'Fire', r: 153, g: 34, b: 0 },      // Red
      { type: 2, name: 'Wood', r: 34, g: 204, b: 34 },     // Green
      { type: 3, name: 'Light', r: 136, g: 85, b: 0 },     // Yellow/Gold
      { type: 4, name: 'Dark', r: 153, g: 0, b: 148 },     // Purple
      { type: 5, name: 'Heart', r: 238, g: 34, b: 136 }    // Pink
    ];

    // Find closest color match
    let minDistance = Infinity;
    let bestMatch = 0;

    for (const color of colors) {
      const distance = Math.sqrt(
        Math.pow(r - color.r, 2) +
        Math.pow(g - color.g, 2) +
        Math.pow(b - color.b, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = color.type;
      }
    }

    return bestMatch;
  }

  /**
   * Read board state from canvas colors
   */
  readBoardStateFromCanvas() {
    if (!this.canvas) {
      console.error('Canvas not found');
      return null;
    }

    try {
      const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      const cellWidth = this.canvas.width / this.boardWidth;
      const cellHeight = this.canvas.height / this.boardHeight;

      const board = [];

      for (let y = 0; y < this.boardHeight; y++) {
        const row = [];
        for (let x = 0; x < this.boardWidth; x++) {
          const centerX = Math.floor(cellWidth * (x + 0.5));
          const centerY = Math.floor(cellHeight * (y + 0.5));

          const pixel = ctx.getImageData(centerX, centerY, 1, 1).data;
          const runeType = this.rgbToRuneType(pixel[0], pixel[1], pixel[2]);
          row.push(runeType);
        }
        board.push(row);
      }

      return board;
    } catch (e) {
      console.error('Could not read board from canvas:', e);
      return null;
    }
  }

  /**
   * Try to read board state from the page
   */
  readBoardState() {
    // Method 1: Try to find a global board variable
    const possibleVars = ['board', 'boardData', 'gameBoard', 'stones', 'runes', 'gems'];

    for (const varName of possibleVars) {
      if (window[varName] && Array.isArray(window[varName])) {
        console.log(`Found board data in window.${varName}:`, window[varName]);
        return window[varName];
      }
    }

    // Method 2: Read from canvas colors
    console.log('No global board variable found, reading from canvas...');
    const board = this.readBoardStateFromCanvas();

    if (board) {
      console.log('Board read from canvas:', board);
      return board;
    }

    console.error('Could not read board state!');
    return null;
  }

  injectControlPanel() {
    // Create a floating control panel
    const panel = document.createElement('div');
    panel.id = 'tos-auto-spinner-panel';
    panel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 15px;
      border-radius: 8px;
      z-index: 10000;
      font-family: Arial, sans-serif;
      min-width: 200px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      max-width: 300px;
    `;

    panel.innerHTML = `
      <h3 style="margin: 0 0 10px 0; font-size: 16px;">TOS Auto Spinner</h3>
      <button id="tos-inspect-btn" style="width: 100%; margin: 5px 0; padding: 8px; cursor: pointer;">
        Inspect Page
      </button>
      <button id="tos-read-board-btn" style="width: 100%; margin: 5px 0; padding: 8px; cursor: pointer; background: #2196F3; color: white; border: none; border-radius: 4px;">
        Read Board
      </button>
      <button id="tos-test-drag-btn" style="width: 100%; margin: 5px 0; padding: 8px; cursor: pointer; background: #FF9800; color: white; border: none; border-radius: 4px;">
        Test Simple Drag
      </button>
      <button id="tos-simple-combo-btn" style="width: 100%; margin: 5px 0; padding: 8px; cursor: pointer; background: #9C27B0; color: white; border: none; border-radius: 4px;">
        Auto Spin (1 Combo)
      </button>
      <button id="tos-max-combo-btn" style="width: 100%; margin: 5px 0; padding: 8px; cursor: pointer; background: #FF5722; color: white; border: none; border-radius: 4px;">
        Max Combo Spin
      </button>
      <button id="tos-unlimited-btn" style="width: 100%; margin: 5px 0; padding: 8px; cursor: pointer; background: #9C27B0; color: white; border: none; border-radius: 4px; font-weight: bold;">
        🚀 Unlimited Search
      </button>
      <button id="tos-start-btn" style="width: 100%; margin: 5px 0; padding: 8px; cursor: pointer; background: #4CAF50; color: white; border: none; border-radius: 4px;">
        Start Auto Spin
      </button>
      <button id="tos-stop-btn" style="width: 100%; margin: 5px 0; padding: 8px; cursor: pointer; background: #f44336; color: white; border: none; border-radius: 4px;">
        Stop
      </button>
      <div id="tos-status" style="margin-top: 10px; font-size: 12px; color: #aaa;">
        Status: Ready
      </div>
      <div id="tos-board-display" style="margin-top: 10px; font-size: 20px; line-height: 1.2;"></div>
    `;

    document.body.appendChild(panel);

    // Add event listeners
    document.getElementById('tos-inspect-btn').addEventListener('click', () => {
      this.inspectPage();
    });

    document.getElementById('tos-read-board-btn').addEventListener('click', () => {
      this.displayBoard();
    });

    document.getElementById('tos-test-drag-btn').addEventListener('click', () => {
      this.testSimpleDrag();
    });

    document.getElementById('tos-simple-combo-btn').addEventListener('click', () => {
      this.findAndExecuteSimpleCombo();
    });

    document.getElementById('tos-max-combo-btn').addEventListener('click', () => {
      this.executeMaxComboSpin();
    });

    document.getElementById('tos-unlimited-btn').addEventListener('click', () => {
      this.executeUnlimitedSearch();
    });

    document.getElementById('tos-start-btn').addEventListener('click', () => {
      this.start();
    });

    document.getElementById('tos-stop-btn').addEventListener('click', () => {
      this.stop();
    });
  }

  /**
   * Display the current board state visually
   */
  displayBoard() {
    const board = this.readBoardState();
    if (!board) {
      this.updateStatus('Error reading board');
      return;
    }

    const symbols = ['💧', '🔥', '🌿', '💡', '🌙', '❤️'];
    const displayEl = document.getElementById('tos-board-display');

    let html = '<div style="font-family: monospace;">';
    for (let y = 0; y < board.length; y++) {
      for (let x = 0; x < board[y].length; x++) {
        html += symbols[board[y][x]];
      }
      html += '<br>';
    }
    html += '</div>';

    displayEl.innerHTML = html;
    this.updateStatus('Board read successfully');
    console.log('Board state:', board);
  }

  updateStatus(message) {
    const statusEl = document.getElementById('tos-status');
    if (statusEl) {
      statusEl.textContent = `Status: ${message}`;
    }
    console.log('Status:', message);
  }

  // Simulate mouse events for dragging runes
  simulateDrag(startX, startY, path) {
    if (!this.canvas) {
      console.error('Canvas not found');
      return;
    }

    const rect = this.canvas.getBoundingClientRect();

    // Create and dispatch mousedown event
    const mouseDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + startX,
      clientY: rect.top + startY,
      button: 0
    });
    this.canvas.dispatchEvent(mouseDown);

    // Simulate dragging along the path
    let step = 0;
    const dragInterval = setInterval(() => {
      if (step >= path.length) {
        clearInterval(dragInterval);

        // Mouse up
        const mouseUp = new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + path[path.length - 1].x,
          clientY: rect.top + path[path.length - 1].y,
          button: 0
        });
        this.canvas.dispatchEvent(mouseUp);

        return;
      }

      const point = path[step];
      const mouseMove = new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + point.x,
        clientY: rect.top + point.y,
        button: 0
      });
      this.canvas.dispatchEvent(mouseMove);

      step++;
    }, 16); // ~60fps
  }

  /**
   * Find and execute a simple 3-rune combo (only adjacent swaps)
   */
  findAndExecuteSimpleCombo() {
    console.log('Finding simple combo (1 swap only)...');
    this.updateStatus('Finding simple combo...');

    try {
      // Read current board
      const board = this.readBoardState();
      if (!board) {
        this.updateStatus('Error reading board');
        return;
      }

      const symbols = ['💧Water', '🔥Fire', '🌿Wood', '💡Light', '🌙Dark', '❤️Heart'];

      // Try every position and every adjacent swap
      for (let y = 0; y < this.boardHeight; y++) {
        for (let x = 0; x < this.boardWidth; x++) {

          // Try swapping right
          if (x < this.boardWidth - 1) {
            if (this.willCreateCombo(board, x, y, x + 1, y)) {
              console.log(`Found combo! Swap (${x},${y}) with (${x + 1},${y})`);
              this.updateStatus(`Creating combo!`);
              this.executeSimplePath(x, y, x + 1, y);
              return;
            }
          }

          // Try swapping down
          if (y < this.boardHeight - 1) {
            if (this.willCreateCombo(board, x, y, x, y + 1)) {
              console.log(`Found combo! Swap (${x},${y}) with (${x},${y + 1})`);
              this.updateStatus(`Creating combo!`);
              this.executeSimplePath(x, y, x, y + 1);
              return;
            }
          }
        }
      }

      this.updateStatus('No simple combo found');
      console.log('No simple combo opportunity found');

    } catch (error) {
      console.error('Error finding combo:', error);
      this.updateStatus('Error: ' + error.message);
    }
  }

  /**
   * Check if swapping two positions will create a 3+ combo
   */
  willCreateCombo(board, x1, y1, x2, y2) {
    // Create a copy and simulate the swap
    const testBoard = board.map(row => [...row]);
    const temp = testBoard[y1][x1];
    testBoard[y1][x1] = testBoard[y2][x2];
    testBoard[y2][x2] = temp;

    // Check if either swapped position creates a combo
    return this.hasComboAt(testBoard, x1, y1) || this.hasComboAt(testBoard, x2, y2);
  }

  /**
   * Check if a specific position has a 3+ match (horizontal or vertical)
   */
  hasComboAt(board, x, y) {
    const runeType = board[y][x];

    // Check horizontal
    let hCount = 1;
    // Count left
    for (let dx = x - 1; dx >= 0 && board[y][dx] === runeType; dx--) {
      hCount++;
    }
    // Count right
    for (let dx = x + 1; dx < this.boardWidth && board[y][dx] === runeType; dx++) {
      hCount++;
    }
    if (hCount >= 3) return true;

    // Check vertical
    let vCount = 1;
    // Count up
    for (let dy = y - 1; dy >= 0 && board[dy][x] === runeType; dy--) {
      vCount++;
    }
    // Count down
    for (let dy = y + 1; dy < this.boardHeight && board[dy][x] === runeType; dy++) {
      vCount++;
    }
    if (vCount >= 3) return true;

    return false;
  }

  /**
   * Find a rune of specific type near a position
   */
  findNearbyRune(board, runeType, targetX, targetY, maxDistance, excludePositions = []) {
    // Check positions within maxDistance (Manhattan distance)
    for (let dist = 1; dist <= maxDistance; dist++) {
      for (let dy = -dist; dy <= dist; dy++) {
        for (let dx = -dist; dx <= dist; dx++) {
          if (Math.abs(dx) + Math.abs(dy) !== dist) continue; // Only check at exact distance

          const x = targetX + dx;
          const y = targetY + dy;

          if (x < 0 || x >= this.boardWidth || y < 0 || y >= this.boardHeight) continue;

          // Skip excluded positions
          const isExcluded = excludePositions.some(pos => pos.x === x && pos.y === y);
          if (isExcluded) continue;

          if (board[y][x] === runeType) {
            return {x, y};
          }
        }
      }
    }
    return null;
  }

  /**
   * Execute a simple straight-line path from start to end
   */
  executeSimplePath(startX, startY, endX, endY) {
    const cellWidth = this.canvas.width / this.boardWidth;
    const cellHeight = this.canvas.height / this.boardHeight;

    const path = [];
    const startPx = {x: cellWidth * (startX + 0.5), y: cellHeight * (startY + 0.5)};
    const endPx = {x: cellWidth * (endX + 0.5), y: cellHeight * (endY + 0.5)};

    // Create smooth path
    const steps = 50;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      path.push({
        x: startPx.x + (endPx.x - startPx.x) * t,
        y: startPx.y + (endPx.y - startPx.y) * t
      });
    }

    console.log(`Executing simple path from (${startX},${startY}) to (${endX},${endY})`);
    this.executePath(path);
  }

  /**
   * Execute max combo spin using target board optimization
   */
  executeMaxComboSpin() {
    console.log('Executing Max Combo Spin...');
    this.updateStatus('Generating optimal combo layout...');

    try {
      // Read current board state
      const boardState = this.readBoardState();
      if (!boardState) {
        this.updateStatus('Error reading board');
        return;
      }

      // Create board object
      const board = new Board();
      board.fromArray(boardState);

      console.log('Current board:');
      board.print();
      console.log('[TOS] BOARD=' + JSON.stringify(boardState));

      this.updateStatus('Solving (DoraSolver beam search)...');

      // DoraSolver: cascade-aware beam search ported from docs/autodora-algorithm-spec.md.
      // beamWidth 200 keeps in-browser solve time around 200ms (measured in Node A/B).
      const solver = new DoraSolver(board, {beamWidth: 200, maxPath: 30});
      const solution = solver.solve();

      console.log('[TOS] SOLUTION=' + JSON.stringify({
        start: [solution.startX, solution.startY],
        moveCount: solution.moves.length,
        score: solution.score,
        combos: solution.comboCount,
        firstCombos: solution.firstCombos,
        chains: solution.chains
      }));
      console.log('[TOS] PATH=' + JSON.stringify(solution.moves));

      // Convert grid coordinates to pixel coordinates
      const pixelPath = this.gridPathToPixelPath(solution.path);

      // Store solution for post-execution logging
      this.currentSolution = solution;

      // Execute the path
      this.updateStatus(`Executing... (${solution.comboCount} combos, ${solution.score} pts)`);
      setTimeout(() => {
        this.executePath(pixelPath, true); // Pass true to enable post-execution board logging
      }, 500);

    } catch (error) {
      console.error('Error in max combo spin:', error);
      this.updateStatus('Error: ' + error.message);
    }
  }

  /**
   * Execute unlimited search - exhaustive search with no time limit
   */
  async executeUnlimitedSearch() {
    console.log('Starting UNLIMITED SEARCH mode...');
    this.updateStatus('⏳ Unlimited search starting...');

    try {
      // Read current board state
      const boardState = this.readBoardState();
      if (!boardState) {
        this.updateStatus('Error reading board');
        return;
      }

      // Create board object
      const board = new Board();
      board.fromArray(boardState);

      // Generate target board with maximized combos
      console.log('Generating target board...');
      const maximizer = new ComboMaximizer(board);
      const targetBoard = maximizer.generateTargetBoard();

      console.log('Current board:');
      board.print();
      console.log('Target board:');
      targetBoard.print();

      // Calculate expected score of target board
      const targetMatcher = new MatchFinder(targetBoard);
      const targetScore = targetMatcher.calculateScore();
      console.log('Target board would score:', targetScore);

      this.updateStatus(`🚀 Searching... Target: ${targetScore.comboCount} combos, ${targetScore.score} pts`);

      // Progress callback
      const onProgress = (progress) => {
        if (progress.iteration) {
          this.updateStatus(`🔍 Iteration ${progress.iteration}: Best ${progress.bestScore} pts (${progress.bestCombos} combos) - Beam=${progress.currentBeam}, Moves=${progress.currentMoves}`);
        }
      };

      // Use unlimited solver
      console.log('Running unlimited search...');
      const unlimitedSolver = new UnlimitedSolver(board);
      const solution = await unlimitedSolver.solve(targetBoard, onProgress);

      console.log('=== UNLIMITED SEARCH RESULT ===');
      console.log('Solution found:', solution);
      console.log('Score:', solution.score);
      console.log('Combo count:', solution.comboCount);
      console.log('Start position:', `(${solution.startX}, ${solution.startY})`);
      console.log('Path length:', solution.path.length, 'moves');

      // Log the complete path
      console.log('=== CALCULATED PATH ===');
      console.log('Movement sequence:', solution.moves || []);
      console.log('Grid path:');
      solution.path.forEach((pos, idx) => {
        console.log(`  Step ${idx}: (${pos.x}, ${pos.y})`);
      });
      console.log('=====================');

      // Convert grid coordinates to pixel coordinates
      const pixelPath = this.gridPathToPixelPath(solution.path);

      // Store solution for post-execution logging
      this.currentSolution = solution;

      // Execute the path
      this.updateStatus(`✅ Found best! Executing... (${solution.comboCount} combos, ${solution.score} pts)`);
      setTimeout(() => {
        this.executePath(pixelPath, true); // Pass true to enable post-execution board logging
      }, 500);

    } catch (error) {
      console.error('Error in unlimited search:', error);
      this.updateStatus('Error: ' + error.message);
    }
  }

  /**
   * Solve the board using the algorithm and execute the solution
   */
  solveAndExecute() {
    console.log('Solving board...');
    this.updateStatus('Solving...');

    try {
      // Read current board state
      const boardState = this.readBoardState();
      console.log('Board state:', boardState);

      // Solve using algorithm
      const solver = new RuneSolver(boardState);
      const solution = solver.solve();

      console.log('Solution found:', solution);
      console.log('Score:', solution.score);
      console.log('Start position:', `(${solution.startX}, ${solution.startY})`);
      console.log('Path length:', solution.path.length, 'moves');

      // Log the complete path
      console.log('=== CALCULATED PATH ===');
      console.log('Grid path:');
      solution.path.forEach((pos, idx) => {
        console.log(`  Step ${idx}: (${pos.x}, ${pos.y})`);
      });
      console.log('=====================');

      // Convert grid coordinates to pixel coordinates
      const pixelPath = this.gridPathToPixelPath(solution.path);

      // Store solution for post-execution logging
      this.currentSolution = solution;

      // Execute the path
      this.updateStatus('Executing path...');
      setTimeout(() => {
        this.executePath(pixelPath, true); // Enable post-execution logging
      }, 500);

    } catch (error) {
      console.error('Error solving board:', error);
      this.updateStatus('Error: ' + error.message);
    }
  }

  /**
   * Convert grid-based path to pixel coordinates with smooth interpolation
   */
  gridPathToPixelPath(gridPath) {
    const cellWidth = this.canvas.width / this.boardWidth;
    const cellHeight = this.canvas.height / this.boardHeight;

    // Convert grid to pixel coordinates
    const pixelPath = gridPath.map(point => ({
      x: cellWidth * (point.x + 0.5),
      y: cellHeight * (point.y + 0.5)
    }));

    // Add smooth interpolation between points (5 steps between each grid move)
    const smoothPath = [];
    for (let i = 0; i < pixelPath.length - 1; i++) {
      const start = pixelPath[i];
      const end = pixelPath[i + 1];

      // Add intermediate points
      const intermediateSteps = 5;
      for (let j = 0; j < intermediateSteps; j++) {
        const t = j / intermediateSteps;
        smoothPath.push({
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t
        });
      }
    }

    // Add final point
    smoothPath.push(pixelPath[pixelPath.length - 1]);

    return smoothPath;
  }

  /**
   * Test a simple drag from cell (0,0) to cell (2,2)
   */
  testSimpleDrag() {
    console.log('Testing simple drag...');
    this.updateStatus('Testing drag...');

    const cellWidth = this.canvas.width / this.boardWidth;
    const cellHeight = this.canvas.height / this.boardHeight;

    // Create smooth path with many intermediate points
    const path = [];

    // Start at (0,0)
    const startX = cellWidth * 0.5;
    const startY = cellHeight * 0.5;

    // End at (2,2)
    const endX = cellWidth * 2.5;
    const endY = cellHeight * 2.5;

    // Create 50 intermediate points for smooth movement
    const steps = 50;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      path.push({
        x: startX + (endX - startX) * t,
        y: startY + (endY - startY) * t
      });
    }

    console.log('Test path with', path.length, 'points');
    this.executePath(path);
  }

  /**
   * Execute a path by simulating mouse drag
   * @param {Array} path - Array of {x, y} pixel coordinates
   * @param {boolean} logBoardAfter - Whether to log the board state after execution
   */
  executePath(path, logBoardAfter = false) {
    if (!this.canvas || path.length === 0) {
      console.error('Cannot execute path');
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const startPoint = path[0];

    console.log('=== EXECUTING PATH ===');
    console.log('Total path points:', path.length);
    console.log('Canvas rect:', rect);
    console.log('Start point (px):', startPoint);

    // Calculate grid positions from pixel path for logging
    const cellWidth = this.canvas.width / this.boardWidth;
    const cellHeight = this.canvas.height / this.boardHeight;

    const gridPath = path.map(p => ({
      x: Math.floor(p.x / cellWidth),
      y: Math.floor(p.y / cellHeight)
    }));

    // Track unique grid positions for movement logging
    let lastGridPos = gridPath[0];
    let moveCount = 0;
    console.log(`Move ${moveCount}: Start at (${lastGridPos.x}, ${lastGridPos.y})`);

    // Mouse down at start - include more properties
    const mouseDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + startPoint.x,
      clientY: rect.top + startPoint.y,
      screenX: window.screenX + rect.left + startPoint.x,
      screenY: window.screenY + rect.top + startPoint.y,
      button: 0,
      buttons: 1,
      which: 1
    });
    this.canvas.dispatchEvent(mouseDown);
    console.log('Dispatched mousedown');

    // Move along path
    let step = 0;
    const moveInterval = setInterval(() => {
      if (step >= path.length) {
        clearInterval(moveInterval);

        // Mouse up at end
        const lastPoint = path[path.length - 1];
        const mouseUp = new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: rect.left + lastPoint.x,
          clientY: rect.top + lastPoint.y,
          screenX: window.screenX + rect.left + lastPoint.x,
          screenY: window.screenY + rect.top + lastPoint.y,
          button: 0,
          buttons: 0,
          which: 1
        });
        this.canvas.dispatchEvent(mouseUp);
        console.log('Dispatched mouseup');
        console.log('=====================');

        this.updateStatus('Complete!');
        console.log('Path execution complete');

        // Log final board state if requested
        if (logBoardAfter) {
          setTimeout(() => {
            this.logFinalBoardState();
          }, 500); // Wait a bit for the board to update
        }

        // Auto-stop after completion
        this.isRunning = false;
        return;
      }

      const point = path[step];

      // Log when we move to a new grid position
      const currentGridPos = gridPath[step];
      if (currentGridPos.x !== lastGridPos.x || currentGridPos.y !== lastGridPos.y) {
        moveCount++;
        const direction = this.getDirection(lastGridPos, currentGridPos);
        console.log(`Move ${moveCount}: ${direction} to (${currentGridPos.x}, ${currentGridPos.y})`);
        lastGridPos = currentGridPos;
      }

      const mouseMove = new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + point.x,
        clientY: rect.top + point.y,
        screenX: window.screenX + rect.left + point.x,
        screenY: window.screenY + rect.top + point.y,
        button: 0,
        buttons: 1,
        which: 1
      });
      this.canvas.dispatchEvent(mouseMove);

      step++;
    }, 20); // Slower: 50fps instead of 60fps
  }

  /**
   * Get direction between two grid positions
   */
  getDirection(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    if (dx > 0) return 'RIGHT';
    if (dx < 0) return 'LEFT';
    if (dy > 0) return 'DOWN';
    if (dy < 0) return 'UP';
    return 'STAY';
  }

  /**
   * Log the final board state after execution
   */
  logFinalBoardState() {
    console.log('=== FINAL BOARD STATE ===');

    const board = this.readBoardState();
    if (!board) {
      console.error('Could not read final board state');
      return;
    }

    // Display board visually
    const symbols = ['💧', '🔥', '🌿', '💡', '🌙', '❤️'];
    const names = ['Water', 'Fire', 'Wood', 'Light', 'Dark', 'Heart'];

    console.log('Board visualization:');
    for (let y = 0; y < board.length; y++) {
      let row = '';
      for (let x = 0; x < board[y].length; x++) {
        row += symbols[board[y][x]] + ' ';
      }
      console.log(row);
    }

    // Combo groups on the read board (exact model: no double counting,
    // L/T shapes merged — do NOT use legacy MatchFinder here, it overcounts)
    const boardObj = new Board();
    boardObj.fromArray(board);
    const groups = BoardSimulator.findComboGroups(boardObj);
    console.log('Match groups on read board:');
    groups.forEach((g, idx) => {
      console.log(`  ${idx + 1}. ${names[g.type]} x${g.cells.length}`);
    });

    // Compare read-back against the planned final board. Mismatches inside
    // planned match groups are expected: the game dims matched runes during
    // the clear animation, and the color reader can misidentify a dimmed
    // rune (e.g. dimmed Dark reads as Fire — both have r=153, see
    // PROJECT-FACTS F4). Mismatches OUTSIDE match groups are real drag
    // deviations and must be investigated.
    if (this.currentSolution && this.currentSolution.board && this.currentSolution.board.get) {
      const planned = this.currentSolution.board;
      const matchedCells = new Set();
      for (const g of BoardSimulator.findComboGroups(planned)) {
        for (const [x, y] of g.cells) matchedCells.add(x + ',' + y);
      }
      let same = 0;
      const totalCells = board.length * board[0].length;
      const execErrors = [], animArtifacts = [];
      for (let y = 0; y < board.length; y++) {
        for (let x = 0; x < board[y].length; x++) {
          if (board[y][x] === planned.get(x, y)) { same++; continue; }
          const rec = [x, y, names[planned.get(x, y)] || '?', names[board[y][x]] || '?'];
          (matchedCells.has(x + ',' + y) ? animArtifacts : execErrors).push(rec);
        }
      }
      console.log('[TOS] RESULT=' + JSON.stringify({
        cellsMatching: same + '/' + totalCells,
        plannedCombos: this.currentSolution.comboCount,
        plannedChains: this.currentSolution.chains,
        execErrors,
        animArtifacts
      }));
      if (execErrors.length === 0) {
        console.log(`Drag executed exactly as planned. True result: ${this.currentSolution.comboCount} combos (${this.currentSolution.chains} chains).`);
      } else {
        console.log('WARNING: drag deviated from plan at cells [x,y,planned,read]:', JSON.stringify(execErrors));
      }
    }

    console.log('========================');
  }

  start() {
    if (this.isRunning) {
      console.log('Already running');
      return;
    }

    this.isRunning = true;
    this.updateStatus('Running...');

    console.log('Starting auto spinner...');

    // Solve and execute
    this.solveAndExecute();
  }

  stop() {
    this.isRunning = false;
    this.updateStatus('Stopped');
    console.log('Stopped auto spinner');
  }

  testDrag() {
    // Test drag from top-left to bottom-right in a simple path
    const cellWidth = this.canvas.width / this.boardWidth;
    const cellHeight = this.canvas.height / this.boardHeight;

    const startX = cellWidth / 2;
    const startY = cellHeight / 2;

    const path = [];
    for (let i = 0; i <= 10; i++) {
      path.push({
        x: startX + (cellWidth * 2 * i / 10),
        y: startY + (cellHeight * 2 * i / 10)
      });
    }

    console.log('Testing drag with path:', path);
    this.simulateDrag(startX, startY, path);
  }
}

// Initialize the auto spinner
const autoSpinner = new TOSAutoSpinner();
