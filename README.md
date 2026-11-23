# PomoTodo

A local-first Pomodoro timer with session logging and productivity stats, inspired by [pomotodo.com](https://pomotodo.com/).

## Run it

No build step or dependencies. Open `index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 3000
# then visit http://localhost:3000
```

All data lives in your browser's `localStorage` and stays on your machine.

## The three parts

**Timer** — the default view. 25 min focus, 5 min short break, 15 min long break after every 4 pomodoros by default (configurable in Settings). When focus time is up, the timer switches to an overtime counter; it does not force you to stop. Press **Finish & log** when you're actually done. Controls are contextual: an idle timer shows only Start, active timers add Reset and Skip, and overtime replaces Skip with Finish & log. `Space` starts/pauses when you aren't typing.

**Sessions** — when you finish a focus session, a one-line prompt asks what you worked on. Each record stores the label plus the real start time, end time, planned minutes, and actual minutes (including overtime). The Sessions tab lists them grouped by day; labels can be edited and sessions deleted.

**Stats** — derived entirely from logged sessions: today's pomodoros vs goal, focus time, day streak, a 12-week consistency heatmap, a 7-day bar chart, best focus window, on-time rate, break adherence, and personal bests.

Today's progress appears as a slim strip above the timer: filled dots are completed pomodoros, the ringed dot is the current one, and a slightly wider gap marks the long break. A `+N` badge appears when you exceed your goal. The timer ring shows time remaining, with the mode above and the end time below while running. Use the settings icon (top right) to change the daily goal, timer durations, long-break interval, whether breaks start automatically after a session is logged, colors for pomodoros and breaks, sound, notifications, and to export/import a backup of your data.

## Testing

Unit tests run with Node's built-in test runner, with no npm dependencies, and are checked on every push and pull request via GitHub Actions. See [TESTING.md](TESTING.md).

```bash
npm test
```

## Files

- `index.html` — structure and the three views
- `styles.css` — theme tokens and responsive layout
- `core.js` — pure logic shared by the app and tests
- `app.js` — UI, session records, stats, and persistence
