# Class Toolbox

**課堂工具箱** — a free, no-login toolbox for teachers: draw names, seat draws, mini-games, random groups, a smart whiteboard, a lesson kit for circuits and music, and classroom timers.

Live site: <https://classtoolbox.yucheng208.net>

Everything runs in the browser. Class lists, points, seating charts and whiteboard pages are stored **only in the teacher's own browser** (`localStorage`) and are never uploaded.

## Features

### Roster
- Import an Excel template (one worksheet per class), paste a list, or just enter the class size to create No. 1–N.
- Import straight from a shared Google Sheets or Excel Online (OneDrive / SharePoint) link.
- Edit in place, track points, mark today's absentees, and export to Excel.
- Download a backup file and restore it on another computer.

### Draw names
- 15 animated styles: Surprise Tiles, Jackpot Pull, Wheel of Destiny, Pinball Party, Gacha Surprise, Claw Catch, Flip of Fate, Scratch & Reveal, Prize Ticket, Bullseye!, Bingo Line, Lucky Box, Fortune Sticks, Fastest Hand and Card Pack Opening.
- Draw up to 5 students at once, skip students already drawn, and add or deduct points afterwards.
- Keyboard shortcuts: <kbd>Space</kbd> start/stop, <kbd>↑</kbd> add a point, <kbd>↓</kbd> deduct one.

### Seats
- Build a seating chart by seat number, at random or by dragging. You can also import one from Excel, where the worksheet is laid out like the room.
- Seat draw with random patterns (big/small cross, big/small X, 3×3 grid, everyone stand up / sit down) or a coordinate mode with quadrants around a chosen origin.

### Mini-games
- 3D dice, coin toss, moon blocks (擲筊) and rock-paper-scissors, with a spotlight mode for projecting.

### Random groups
- Split by number of groups or group size, with a random leader per group.
- Assign jobs and contribution shares, and download the result as CSV.

### Whiteboard
- Pen, pencil, brush, watercolor, highlighter, laser pointer, eraser, lines, arrows, 11 shapes, text, images and pasted screenshots.
- Multiple pages, PNG export, full screen, and backgrounds: grid, lined, music staff, Chinese character practice grids, chalkboard, or your own image.
- **Handwritten math**: write a calculation with the pen and end it with `=`. After a short pause the answer is written back in handwriting.
  - Supported input: digits, `x`, `y`, `+ − × ÷ =`, parentheses, decimals, powers, fractions and `√`.
  - Equations such as `2x+3=7` are solved for x and graphed.
  - `y = …` draws a graph plus a value table.
  - `z = …` (in x and y) draws a 3D surface.
  - Recognition runs entirely in the browser (point-cloud matching, no server and no AI service).
- **Adjust numbers**: after a line is solved, a draggable floating window shows a slider for each number. Dragging rewrites the number on the board and updates the answer and graphs live, e.g. turning `√9 = 3` into `√10 ≈ 3.1623`.
- **Formulas**: LaTeX input rendered with MathJax, with automatic answers, graphs, tables and 3D plots.
- **Matrices**: build any m×n matrix and compute A+B, A−B, kA, A×B, Aᵀ, A⁻¹, Aⁿ and det.
- Side tools: a scientific calculator (results also shown as fractions), a function plotter with up to 3 curves, and a random question generator.

### Lesson kit
- **Circuits**: resistors, capacitors, inductors, sources, switches, diodes, transistors, op-amps, motors, transformers, meters and logic gates. Wires snap to the grid at right angles, and crossings can hop.
- **Music**: notes, rests, clefs and marks that line up on a staff background.
- **Digital logic**: K-map simplification, truth tables, complements, BCD, Gray code and base conversion.
- All the whiteboard pens are available here too, for annotating while you explain.

### Time tools
- Countdown with presets, stopwatch with laps, and a clock with time-zone and 24-hour / 12-hour options.
- Digital or analog faces. Full screen shows only the time.

### Everywhere
- Languages: 繁體中文, 简体中文, English, 日本語, Tiếng Việt, Bahasa Melayu and हिन्दी.
- Light and dark themes, and a layout that works on phones and tablets.
- Scroll the mouse wheel over the tab bar to switch tabs.

## How it works

Class Toolbox is a static site served by a [Cloudflare Worker](https://developers.cloudflare.com/workers/) with static assets.

- There is **no database and no login**. All data lives in the browser's `localStorage`. Clearing site data, or closing a private window, erases it, so use the backup file to move between computers.
- The only server code is a small proxy, `/api/sheet` in [`src/worker.js`](src/worker.js). It fetches roster files from shared Google Sheets, OneDrive or SharePoint links, which browsers cannot download directly because of CORS.
  - It only accepts same-origin requests.
  - It only follows HTTPS URLs on those hosts, checking every redirect.
  - It limits files to 5 MB and stores nothing.
- A strict Content Security Policy and other security headers are set in [`public/_headers`](public/_headers). All scripts, fonts and libraries are self-hosted, with no third-party requests.
- Sound effects are synthesized in the browser (8-bit style). You can replace them with your own audio files; see [`public/sounds/README.txt`](public/sounds/README.txt).

### Project layout

```
public/            Static site (served as-is)
  index.html       Single-page app markup
  css/             style.css (base), theme.css (look and feel), ui.css (components)
  js/
    app.js         Tabs, classes, roster
    lottery.js     Draw-names panel; arcade.js holds most draw styles
    seats.js       Seat draw; seatchart.js holds the seating chart editor
    fun.js         Mini-games
    board.js       Whiteboard
    draw.js        Pen, shape and laser drawing shared by the whiteboard and lesson kit
    ink.js         Handwriting recognition and handwritten answers
    mathx.js       Safe expression parser and evaluator (no eval)
    matrix.js      Matrix calculator for formulas
    plots.js       Value tables and 3D surfaces
    circuitboard.js, circuit.js, logic.js, music.js   Lesson kit
    timer.js       Time tools
    i18n.js        Translations loader
  i18n/            One JSON file per language
  vendor/          Font Awesome, MathJax, SheetJS (self-hosted)
src/worker.js      Cloudflare Worker: static assets + /api/sheet proxy
wrangler.toml      Worker and route configuration
```

## Development

Requirements: a current LTS release of [Node.js](https://nodejs.org/).

```bash
npm install
```

```bash
npm run dev
```

This starts Wrangler's local server at <http://localhost:8787>. The site is plain HTML, CSS and ES modules, so there is no build step: edit files in `public/` and reload.

### Adding or changing text
All user-facing strings live in `public/i18n/<lang>.json`. Traditional Chinese (`zh-TW.json`) is the fallback, so add new keys there first, then to the other languages.

### Deploying

```bash
npm run deploy
```

This runs `wrangler deploy`. Update `routes` in `wrangler.toml` to use your own domain.

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/Yucheng0208/Class-Tool-Box). If Class Toolbox helps your class, a ⭐ is appreciated.

## License

[MIT](LICENSE) © 2026 Yu-Cheng Chang (張育丞)
