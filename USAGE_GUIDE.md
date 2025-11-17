# TOS Auto Spinner - Usage Guide

## Complete Setup and Testing Instructions

### Phase 1: Installation

1. **Generate Icons**
   ```
   1. Open generate-icons.html in your browser
   2. Click "Generate Icons"
   3. Download all three icons (16, 48, 128)
   4. Place them in C:\Projects\autospinner
   ```

2. **Load Extension**
   ```
   1. Open Chrome
   2. Go to chrome://extensions/
   3. Enable "Developer mode" (top-right)
   4. Click "Load unpacked"
   5. Select C:\Projects\autospinner
   ```

3. **Verify Installation**
   - Extension should appear in your extensions list
   - You should see "TOS Auto Spinner" with a green icon

### Phase 2: Initial Testing

1. **Navigate to TOS Simulator**
   - Go to: https://louisalflame.github.io/TOSwebsite/canvas.html
   - Wait for the page to fully load

2. **Check Extension is Active**
   - You should see a black control panel in the top-right corner
   - If not visible, refresh the page (F5)

3. **Inspect the Page**
   - Open Chrome DevTools (press F12)
   - Go to the "Console" tab
   - Click "Inspect Page" button in the control panel
   - Review the console output to understand page structure

### Phase 3: Understanding the Page Structure

**What to look for in the console:**

1. **Canvas Information**
   - How many canvas elements exist?
   - What are their dimensions?
   - Which one is the game board?

2. **Global Variables**
   - Look for any variables containing board data
   - Common names: board, boardData, gameBoard, stones, runes, gems
   - Note the structure of the data

3. **Canvas Colors**
   - RGB values for each cell position
   - This helps identify rune types by color

### Phase 4: Adapting the Code

**Based on inspection results, you may need to update:**

#### If board data is in a global variable:

Edit `content.js` line ~162 to add the variable name:
```javascript
const possibleVars = ['board', 'boardData', 'YOUR_VARIABLE_NAME_HERE'];
```

#### If board dimensions are different:

Edit `content.js` line ~9-10:
```javascript
this.boardWidth = 6;  // Change if needed
this.boardHeight = 5; // Change if needed
```

#### If you need to detect runes by color:

Update the `readBoardState()` method to parse canvas colors.
The `analyzeCanvasColors()` method already logs the RGB values.

### Phase 5: Testing Auto Spin

1. **Test Algorithm Offline**
   - Open `test-algorithm.html` in your browser
   - Click "Random Board"
   - Click "Find Best Path"
   - Click "Simulate Path" to visualize
   - This verifies the algorithm works

2. **Test on TOS Website**
   - Go back to the TOS simulator
   - Click "Start Auto Spin" in the control panel
   - Watch the console for debug logs
   - Observe if the mouse moves correctly

### Phase 6: Troubleshooting

#### Extension doesn't load:
- Check all files are in the correct folder
- Make sure icons exist (or temporarily ignore errors)
- Check console for error messages

#### Control panel doesn't appear:
- Verify you're on the correct URL
- Refresh the page (F5)
- Check browser console for errors
- Make sure content script is loading

#### Mouse events don't work:
- The TOS site might use touch events instead of mouse events
- Update `executePath()` to dispatch touch events
- Or the canvas might not be the right element

#### Wrong board state:
- Update `readBoardState()` to match how TOS stores data
- Use `analyzeCanvasColors()` as fallback
- Implement color-to-rune-type mapping

### Phase 7: Advanced Customization

#### Improve the Algorithm

Edit `algorithm.js`:

1. **Better Path Finding**
   - Replace random search with A* or beam search
   - Add constraints (e.g., prefer certain rune types)
   - Optimize for specific combo patterns

2. **Scoring Function**
   - Adjust weights in `calculateScore()`
   - Prioritize certain rune colors
   - Add bonus for specific patterns (L-shape, cross, etc.)

3. **Performance**
   - Increase/decrease `maxMoves` in `findBestPath()`
   - Adjust number of attempts to try
   - Use web workers for heavy computation

#### Customize Execution Speed

Edit `content.js` line ~401:
```javascript
}, 16);  // Change this: 16 = ~60fps, 33 = ~30fps, 8 = ~120fps
```

#### Add Touch Event Support

If the site uses touch events:
```javascript
const touchStart = new TouchEvent('touchstart', {...});
const touchMove = new TouchEvent('touchmove', {...});
const touchEnd = new TouchEvent('touchend', {...});
```

### Debugging Tips

1. **Console Logs**
   - All important events are logged to console
   - Open DevTools (F12) to see them
   - Look for errors in red

2. **Step-by-Step Testing**
   - Test each component separately
   - Use `test-algorithm.html` for algorithm
   - Use "Inspect Page" for site analysis
   - Use testDrag() for mouse events

3. **Common Issues**
   - **CORS errors**: Can't read canvas from different origin
   - **Event blocking**: Site might prevent simulated events
   - **Timing**: Site might need delays between actions

### Next Steps

1. **Inspect the TOS page** to find how it stores board data
2. **Update readBoardState()** to parse the actual data
3. **Test mouse events** work correctly
4. **Fine-tune the algorithm** for better results
5. **Add features** like:
   - Auto-repeat (keep solving continuously)
   - Target specific combos
   - Difficulty presets
   - Statistics tracking

### File Overview

```
autospinner/
├── manifest.json           - Extension config
├── algorithm.js           - Pathfinding logic
├── content.js             - Main extension logic
├── popup.html             - UI for extension popup
├── popup.js               - Popup logic
├── generate-icons.html    - Icon generator tool
├── test-algorithm.html    - Algorithm testing tool
├── README.md              - Overview
├── SETUP_GUIDE.md         - Installation guide
└── USAGE_GUIDE.md         - This file
```

### Support

If you encounter issues:

1. Check the browser console for errors
2. Verify the TOS website structure hasn't changed
3. Review the inspection logs
4. Test the algorithm offline first
5. Update the code based on actual site structure

Good luck with your auto spinner!
