# TOS Auto Spinner - Quick Start

## Installation (5 minutes)

1. **Create Icons**
   - Open `generate-icons.html`
   - Download all 3 icons
   - Save in autospinner folder

2. **Install Extension**
   - Chrome → `chrome://extensions/`
   - Enable Developer mode
   - Load unpacked → select autospinner folder

3. **Test**
   - Go to https://louisalflame.github.io/TOSwebsite/canvas.html
   - See control panel in top-right? ✓

## Usage

### First Time Setup

1. Open DevTools (F12)
2. Click "Inspect Page"
3. Check console for board structure
4. Update code if needed (see USAGE_GUIDE.md)

### Running Auto Spin

1. Navigate to TOS simulator
2. Click "Start Auto Spin"
3. Watch it solve and execute!

## Testing Offline

- Open `test-algorithm.html` to test algorithm
- Click "Random Board" → "Find Best Path" → "Simulate"

## Key Files

| File | Purpose |
|------|---------|
| `content.js` | Main logic - edit here to adapt |
| `algorithm.js` | Pathfinding - edit to improve solving |
| `manifest.json` | Extension config |
| `test-algorithm.html` | Test algorithm offline |
| `USAGE_GUIDE.md` | Complete documentation |

## Common Customizations

### Change board size (if not 6x5):
**File:** `content.js:9-10`
```javascript
this.boardWidth = 6;   // Change this
this.boardHeight = 5;  // Change this
```

### Change execution speed:
**File:** `content.js:401`
```javascript
}, 16);  // Lower = faster, higher = slower
```

### Add board variable name:
**File:** `content.js:162`
```javascript
const possibleVars = ['board', 'boardData', 'YOUR_VARIABLE'];
```

### Improve algorithm:
**File:** `algorithm.js:286`
```javascript
const attempts = 100;  // Increase for better solutions
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No control panel | Refresh page (F5) |
| Mouse doesn't move | Check console for errors, TOS site might use touch events |
| Wrong board detected | Update `readBoardState()` in content.js |
| Extension won't load | Check icons exist, check console errors |

## Debug Checklist

- [ ] Extension loaded in chrome://extensions/
- [ ] On correct URL (louisalflame.github.io)
- [ ] Control panel visible
- [ ] DevTools open (F12)
- [ ] Console shows "TOS Auto Spinner loaded!"
- [ ] Inspected page structure

## Next Steps

1. ✓ Install extension
2. ✓ Load TOS simulator
3. → Inspect page structure
4. → Adapt code to match site
5. → Test auto spin
6. → Improve algorithm

## Quick Commands

```bash
# Reload extension after changes:
Chrome → Extensions → Click reload icon on TOS Auto Spinner

# View console logs:
F12 → Console tab

# Test offline:
Open test-algorithm.html in browser
```

## Project Structure

```
autospinner/
├── 📄 manifest.json          ← Extension setup
├── 🧠 algorithm.js           ← Solve logic
├── 🎮 content.js             ← Main control
├── 🖼️ popup.html/js          ← UI
├── 🎨 generate-icons.html    ← Icon maker
├── 🧪 test-algorithm.html    ← Test tool
└── 📚 Documentation files
```

## Performance Tips

- Lower attempts in algorithm for speed
- Higher attempts for better solutions
- Adjust execution speed for different devices
- Use web workers for heavy computation (advanced)

---

**For detailed instructions, see USAGE_GUIDE.md**
