# Rune Combo System Features

## Requirements

### 1. Shape-Based Rune Placement (ON HOLD)

**Goal:** Arrange runes to fit specific shapes at specific positions

**Example:**
- L-shape at positions: (0,0), (0,1), (0,2), (1,0), (2,0)
- Need to find rune type with count >= 5
- Move those runes to fit the exact positions specified

**Algorithm needed:**
```javascript
class ShapePlacementSolver {
  /**
   * @param {Board} board - Current board state
   * @param {Array<{x,y}>} positions - Exact positions for the shape
   * @param {number|null} runeType - Specific rune type or null for auto-select
   * @returns {Board} Target board with runes arranged in shape
   */
  arrangeShape(board, positions, runeType = null) {
    // 1. If runeType is null, find type with count >= positions.length
    // 2. If runeType specified, check if enough runes exist
    // 3. Place all runes of that type into the specified positions
    // 4. Fill remaining positions with other runes
    // 5. Return target board
  }
}
```

**Implementation notes:**
- Must validate rune count BEFORE attempting arrangement
- If count < required positions, return error/null
- Support both specific rune type and auto-selection (highest count type)

---

### 2. Constrained Combo Generator (IN PROGRESS)

**Goal:** Generate combos based on specific requirements, only if board has enough runes

**Workflow:**
1. Count existing runes on board by type
2. Check if requested combos are achievable
3. If YES → generate target board and solve
4. If NO → abort spin with error message

**Example requests:**
```javascript
// Request: 2 fire combos (3-match each) + 1 water combo (4-match)
{
  fire: { combos: 2, size: 3 },    // needs 6 fire runes minimum
  water: { combos: 1, size: 4 }    // needs 4 water runes minimum
}

// Request: 1 fire L-shape (5 runes) at specific positions
{
  fire: {
    shape: [[0,0], [0,1], [0,2], [1,0], [2,0]],
    runeType: 0  // 0=water, 1=fire, etc.
  }
}
```

**Validation logic:**
```javascript
function canAchieveCombo(runeCounts, constraints) {
  for (let [type, requirement] of Object.entries(constraints)) {
    const needed = requirement.combos * requirement.size;
    const available = runeCounts[type];

    if (available < needed) {
      return {
        success: false,
        reason: `Not enough ${type} runes. Need ${needed}, have ${available}`
      };
    }
  }
  return { success: true };
}
```

**Board generation:**
```javascript
class ConstrainedComboGenerator {
  /**
   * @param {Object} runeCounts - {0: 8, 1: 6, 2: 5, ...} count per type
   * @param {Object} constraints - Combo requirements
   * @returns {Board|null} Target board or null if impossible
   */
  generateBoard(runeCounts, constraints) {
    // 1. Validate: check if constraints are achievable
    // 2. Sort constraints by priority (most specific first)
    // 3. Place required combos on board
    // 4. Fill remaining cells with leftover runes
    // 5. Return target board
  }
}
```

---

## Implementation Status

1. ✅ **ConstrainedComboGenerator** - IMPLEMENTED
   - Validates rune availability before generation
   - Generates target boards with specific combo requirements
   - Provides detailed error messages when constraints cannot be met
   - Location: `algorithm.js:422-606`

2. ⏸️ **ShapePlacementSolver** - On hold (shape-based placement)

---

## Technical Notes

### Current Rune Counting
Location: Need to add to `algorithm.js`

```javascript
class Board {
  countRunes() {
    const counts = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const type = this.grid[y][x];
        counts[type]++;
      }
    }
    return counts;
  }
}
```

### Rune Types
- 0 = Water 💧
- 1 = Fire 🔥
- 2 = Wood 🌿
- 3 = Light 💡
- 4 = Dark 🌙
- 5 = Heart ❤️

### Board Size
- Width: 6
- Height: 5
- Total cells: 30

---

## Usage Examples

### Example 1: Basic Constrained Combo Generation

```javascript
// Create board from current game state
const board = new Board();
board.fromArray([
  [0, 1, 2, 3, 4, 5],
  [1, 1, 0, 2, 3, 4],
  [2, 0, 1, 1, 2, 3],
  [3, 2, 0, 1, 1, 4],
  [4, 3, 2, 0, 1, 5]
]);

// Define constraints: 2 fire combos (3 each), 1 water combo (4)
const constraints = {
  1: {combos: 2, size: 3},  // Fire: need 6 runes (2 × 3)
  0: {combos: 1, size: 4}   // Water: need 4 runes (1 × 4)
};

// Generate target board
const generator = new ConstrainedComboGenerator(board);
const result = generator.generateTargetBoard(constraints);

if (result.success) {
  console.log('✅ Target board generated!');
  result.targetBoard.print();

  // Now use BeamSearchSolver to find path to this target
  const solver = new BeamSearchSolver(board, 50, 50);
  const path = solver.findPathToTarget(result.targetBoard, 2, 2);
  console.log('Path found:', path);
} else {
  console.log('❌ Cannot generate target:');
  result.errors.forEach(err => console.log(err));
}
```

### Example 2: Validation Only (Pre-check)

```javascript
const board = new Board();
board.fromArray(currentGameState);

const generator = new ConstrainedComboGenerator(board);

// Define what you want
const constraints = {
  1: {combos: 3, size: 3},  // Want 3 fire combos
  2: {combos: 2, size: 4}   // Want 2 wood combos
};

// Validate BEFORE attempting to solve
const validation = generator.validateConstraints(constraints);

if (validation.success) {
  console.log('✅ Constraints achievable! Starting spin...');
  generator.printValidation(validation);

  // Proceed with generation and solving
  const result = generator.generateTargetBoard(constraints);
  // ... solve ...
} else {
  console.log('❌ Not enough runes on board. Aborting spin.');
  generator.printValidation(validation);
  // DO NOT start the spin
}
```

### Example 3: Dynamic Constraints Based on Board

```javascript
const board = new Board();
board.fromArray(currentGameState);

const counts = board.countRunes();

// Find the most abundant rune type
let maxType = 0;
let maxCount = 0;
for (let type = 0; type < 6; type++) {
  if (counts[type] > maxCount) {
    maxCount = counts[type];
    maxType = type;
  }
}

// Create as many combos as possible with the most abundant type
const numCombos = Math.floor(maxCount / 3);
const constraints = {
  [maxType]: {combos: numCombos, size: 3}
};

const generator = new ConstrainedComboGenerator(board);
const result = generator.generateTargetBoard(constraints);

console.log(`Generating ${numCombos} combos of type ${maxType}`);
```

---

## Future Enhancements

- **Mixed shapes:** Combine linear combos + shaped combos
- **Priority system:** Weight certain rune types higher
- **Minimum score:** Only generate boards achieving minimum score threshold
- **Cascading detection:** Account for combos created by falling runes (advanced)
- **Vertical combos:** Currently only horizontal combos are generated
