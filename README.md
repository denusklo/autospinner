# TOS Auto Spinner

A Chrome extension to automate rune spinning in the Tower of Saviors simulator.

## Setup Instructions

### 1. Create Extension Icons

The extension requires icon files. You can create simple placeholder icons:

**Option A: Download icons**
- Download any PNG icons (16x16, 48x48, 128x128) and rename them to:
  - `icon16.png`
  - `icon48.png`
  - `icon128.png`

**Option B: Create simple colored squares**
- Use any image editor to create solid colored squares
- Save them as PNG files with the names above

**Option C: Use online icon generator**
- Visit https://www.favicon-generator.org/
- Upload any image and download the PNG files
- Rename them accordingly

### 2. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `C:\Projects\autospinner` folder
5. The extension should now appear in your extensions list

### 3. Use the Extension

1. Navigate to https://louisalflame.github.io/TOSwebsite/canvas.html
2. Click the extension icon in Chrome's toolbar
3. Use the buttons to control the auto spinner:
   - **Inspect Page**: Logs page structure to console (open DevTools with F12)
   - **Start Auto Spin**: Begins automated rune movement
   - **Stop**: Stops the automation

## Current Features

- ✅ Basic Chrome extension structure
- ✅ Content script injection on TOS simulator page
- ✅ Floating control panel on the page
- ✅ Page inspection for understanding DOM structure
- ✅ Mouse event simulation for rune dragging
- ⏳ Rune detection and board state reading (in progress)
- ⏳ Pathfinding algorithm (to be implemented)

## Next Steps

1. Inspect the page to understand how runes are stored and rendered
2. Implement board state detection
3. Create algorithm for optimal rune paths
4. Integrate algorithm with automated dragging

## Development

Check the browser console (F12) for debug logs when using the extension.
