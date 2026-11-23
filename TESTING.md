# Testing

The app has no build step and no npm dependencies. Tests use Node's built-in
[test runner](https://nodejs.org/api/test.html) and run automatically in GitHub
Actions on every push and pull request.

## Run locally

Requires Node.js 20 or newer:

```sh
npm test
# or
node --test
```

## What is covered

`tests/core.test.js` exercises the pure logic in `core.js`:

- default settings and per-mode colors
- legacy theme migration and validation of imported settings
- `longEvery` clamping and long-break scheduling
- the auto-start-break preference and its default
- color derivation and hex validation
- backup import validation and sanitizing
- elapsed-time calculation
- timer readout states: idle, running, paused, and overtime

`core.js` is a UMD module: the browser gets `window.PomoCore`, while Node gets
the same functions via `require`. No bundler or transpiler is involved.

## Not covered yet

Browser-level behavior (DOM rendering, clicks, storage, settings modal) is still
checked manually. A browser-based smoke suite can be added later if needed.
