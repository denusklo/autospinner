# TOS Auto Spinner - Setup Guide

## Quick Start

### Step 1: Generate Icons

1. Open `generate-icons.html` in your browser (double-click the file)
2. Click "Generate Icons"
3. Download each icon (icon16.png, icon48.png, icon128.png)
4. Save them in the `C:\Projects\autospinner` folder

### Step 2: Install Extension in Chrome

1. Open Google Chrome
2. Go to `chrome://extensions/`
3. Enable **Developer mode** (toggle switch in top-right corner)
4. Click **Load unpacked**
5. Select the folder: `C:\Projects\autospinner`
6. The extension should now appear in your list

### Step 3: Test the Extension

1. Navigate to: https://louisalflame.github.io/TOSwebsite/canvas.html
2. You should see a floating control panel in the top-right corner
3. Open Chrome DevTools (press F12) to see console logs
4. Click **Inspect Page** to analyze the page structure

## What to Look For

When you click "Inspect Page", check the console for:

- **Canvas elements**: How many canvases are on the page?
- **Canvas dimensions**: What size is the game board?
- **Global variables**: Any variables related to "board", "rune", "gem", etc.?

This information will help us understand how to:
1. Read the current board state
2. Detect rune colors and positions
3. Simulate mouse movements correctly

## Next Steps

After inspecting the page, we'll implement:

1. **Board State Detection**: Read which runes are where
2. **Path Algorithm**: Calculate optimal movement path
3. **Automated Dragging**: Execute the movements

## Troubleshooting

**Extension doesn't appear:**
- Make sure you enabled Developer mode
- Check that all files are in the correct folder
- Try reloading the extension

**Control panel doesn't show:**
- Make sure you're on the correct URL
- Check the browser console for errors (F12)
- Try refreshing the page

**Inspect button does nothing:**
- Open DevTools first (F12)
- Look in the Console tab for output
- The logs will appear there, not in the popup

## File Structure

```
autospinner/
├── manifest.json          # Extension configuration
├── content.js            # Main logic (runs on TOS page)
├── popup.html            # Extension popup UI
├── popup.js              # Popup logic
├── generate-icons.html   # Icon generator tool
├── icon16.png           # Small icon (create this)
├── icon48.png           # Medium icon (create this)
├── icon128.png          # Large icon (create this)
└── README.md            # Documentation
```
