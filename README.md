# Flappy Bird (HTML5 Canvas)

A lightweight, retro-styled Flappy Bird clone built with **vanilla JavaScript + HTML5 Canvas**. Designed to be easy to run, easy to tweak, and portfolio-friendly.

## Play

- Open `index.html` directly in your browser, or run a local server (recommended below).
- Audio is **procedural** (Web Audio) and will only start after your first input due to browser autoplay rules.

## Features

- Pixel-ish rendering with a clean UI layer
- SFX + music system (no audio files) with persistent settings
- Themes/skins (day/night/sunset/storm) + optional weather FX (rain/snow)
- Pause/resume (auto-pauses when the tab is hidden)
- Medals + best score persistence (Local Storage)
- Difficulty scaling (gap/speed ramps after a few points)
- Desktop + mobile controls
- Game feel polish (particles + screen shake)

## Controls

- `Space` / Click / Tap: Flap / Start
- `P` or `Esc`: Pause / Resume
- `R` or `Enter`: Retry (from Game Over)
- `M`: Master mute toggle
- `S`: Open/close settings
- Audio/theme/weather are in the settings menu (`SET` button top-right).

## Run locally (recommended)

Some browsers block features when opening files directly (`file://`). Use a tiny local server instead:

**Python**

```bash
python -m http.server 8080
```

Then open:

- `http://localhost:8080`

**Node (optional)**

```bash
npx serve .
```

## Project structure

- `index.html` – UI shell + screens
- `src/style.css` – UI styling (pixel/arcade theme)
- `src/game.js` – Game loop, physics, pipes, scoring, audio, input
- `assets/favicon.svg` – App icon

## Tweaking gameplay

Most gameplay parameters are grouped near the top of `src/game.js`:

- `this.settings` controls spawn rate, pipe gap/width, and scroll speeds
- `this.pipeSettings` controls difficulty ramp behavior

## Notes

- Best score and audio settings are saved in Local Storage.
- Audio uses the Web Audio API; it unlocks on the first click/tap/keypress.

## License

MIT. See `LICENSE`.
