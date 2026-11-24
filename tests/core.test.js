const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.js');

test('defaults provide the expected settings and colors', () => {
  const d = core.defaults();
  assert.equal(d.settings.focus, 25);
  assert.equal(d.settings.short, 5);
  assert.equal(d.settings.long, 15);
  assert.equal(d.settings.longEvery, 4);
  assert.equal(d.settings.goal, 8);
  assert.equal(d.settings.focusColor, '#c94b43');
  assert.equal(d.settings.shortColor, '#5f9465');
  assert.equal(d.settings.longColor, '#9a86c4');
  assert.equal(d.settings.autoStartBreak, true);
  assert.deepEqual(d.timer, core.freshTimer());
  assert.deepEqual(d.sessions, []);
  assert.deepEqual(d.breaks, []);
});

test('mergeSettings fills missing values and drops the legacy theme key', () => {
  const base = core.defaults().settings;
  const merged = core.mergeSettings(base, { focus: 40, theme: 'red' });
  assert.equal(merged.focus, 40);
  assert.equal(merged.short, 5);
  assert.equal(merged.theme, undefined);
  assert.equal(merged.focusColor, '#c94b43');
});

test('mergeSettings migrates legacy themes to per-mode colors', () => {
  const base = core.defaults().settings;
  assert.equal(core.mergeSettings(base, { theme: 'green' }).focusColor, '#5f9465');
  assert.equal(core.mergeSettings(base, { theme: 'blue' }).focusColor, '#4f84b7');
  const red = core.mergeSettings(base, { theme: 'red' });
  assert.equal(red.focusColor, '#c94b43');
  assert.equal(red.shortColor, '#5f9465');
  assert.equal(red.longColor, '#9a86c4');
});

test('mergeSettings prefers explicit colors over a legacy theme', () => {
  const base = core.defaults().settings;
  const merged = core.mergeSettings(base, { theme: 'blue', focusColor: '#123456' });
  assert.equal(merged.focusColor, '#123456');
});

test('mergeSettings clamps longEvery to 2-12', () => {
  const base = core.defaults().settings;
  assert.equal(core.mergeSettings(base, { longEvery: 1 }).longEvery, 2);
  assert.equal(core.mergeSettings(base, { longEvery: 99 }).longEvery, 12);
  assert.equal(core.mergeSettings(base, { longEvery: 'nope' }).longEvery, 4);
  assert.equal(core.mergeSettings(base, { longEvery: '7' }).longEvery, 7);
});

test('mergeSettings preserves the auto-start break setting', () => {
  const base = core.defaults().settings;
  assert.equal(core.mergeSettings(base, {}).autoStartBreak, true);
  assert.equal(core.mergeSettings(base, { autoStartBreak: false }).autoStartBreak, false);
  assert.equal(core.mergeSettings(base, { autoStartBreak: 'yes' }).autoStartBreak, true);
});

test('normalizeHex accepts six-digit hex and rejects anything else', () => {
  assert.equal(core.normalizeHex('#ABCDEF', 'fallback'), '#abcdef');
  assert.equal(core.normalizeHex('  #123456  ', 'fallback'), '#123456');
  assert.equal(core.normalizeHex('#fff', 'fallback'), 'fallback');
  assert.equal(core.normalizeHex('red', 'fallback'), 'fallback');
  assert.equal(core.normalizeHex(null, 'fallback'), 'fallback');
});

test('deriveColors derives usable shades from an accent', () => {
  const c = core.deriveColors('#c94b43');
  assert.equal(c.accent, '#c94b43');
  assert.equal(c.rgb, '201, 75, 67');
  assert.match(c.dark, /^#[0-9a-f]{6}$/);
  assert.match(c.soft, /^#[0-9a-f]{6}$/);
  assert.notEqual(c.dark, c.accent);
  assert.deepEqual(core.deriveColors('#c94b43'), c);
  assert.notEqual(core.deriveColors('#4f84b7').dark, c.dark);
});

test('nextBreakType schedules long breaks by longEvery', () => {
  assert.equal(core.nextBreakType(1, 4), 'short');
  assert.equal(core.nextBreakType(3, 4), 'short');
  assert.equal(core.nextBreakType(4, 4), 'long');
  assert.equal(core.nextBreakType(8, 4), 'long');
  assert.equal(core.nextBreakType(2, 2), 'long');
  assert.equal(core.nextBreakType(3, 2), 'short');
  assert.equal(core.nextBreakType(12, 12), 'long');
  assert.equal(core.nextBreakType(4, 99), 'short');
});

test('normalizeImported rejects non-objects', () => {
  assert.throws(() => core.normalizeImported(null), /Invalid backup file/);
  assert.throws(() => core.normalizeImported('nope'), /Invalid backup file/);
  assert.throws(() => core.normalizeImported(42), /Invalid backup file/);
});

test('normalizeImported accepts bare data and wrapped backups', () => {
  const data = { settings: { focus: 30 }, sessions: [], breaks: [] };
  const bare = core.normalizeImported(data);
  const wrapped = core.normalizeImported({ version: 1, data });
  assert.equal(bare.settings.focus, 30);
  assert.deepEqual(wrapped.settings, bare.settings);
  assert.equal(wrapped.timer.running, false);
});

test('normalizeImported clamps settings and preserves colors', () => {
  const result = core.normalizeImported({
    settings: { focus: 999, short: 0, goal: 99, longEvery: 1, focusColor: '#abcdef', theme: 'green' }
  });
  assert.equal(result.settings.focus, 180);
  assert.equal(result.settings.short, 5);
  assert.equal(result.settings.goal, 24);
  assert.equal(result.settings.longEvery, 2);
  assert.equal(result.settings.focusColor, '#abcdef');
  assert.equal(result.settings.theme, undefined);
});

test('normalizeImported sanitizes sessions', () => {
  const endedAt = Date.UTC(2026, 0, 15, 10, 0, 0);
  const result = core.normalizeImported({
    sessions: [
      { startedAt: endedAt - 1500000, endedAt, label: '  Work  ', overtimeMinutes: -5 },
      { startedAt: endedAt - 1500000, endedAt, label: 'x'.repeat(200) },
      { startedAt: 'bad', endedAt }
    ]
  });
  assert.equal(result.sessions.length, 2);
  assert.equal(result.sessions[0].label, 'Work');
  assert.equal(result.sessions[0].overtimeMinutes, 0);
  assert.equal(result.sessions[0].type, 'focus');
  assert.equal(result.sessions[0].day, core.keyFromTs(endedAt));
  assert.equal(result.sessions[1].label.length, 120);
  assert.ok(result.sessions[0].id);
});

test('normalizeImported sanitizes breaks and resets the timer', () => {
  const now = Date.now();
  const result = core.normalizeImported({
    timer: { mode: 'short', running: true, elapsedMs: 999 },
    breaks: [
      { type: 'long', startedAt: now - 60000, endedAt: now },
      { type: 'other', startedAt: now - 60000, endedAt: now },
      { startedAt: now, endedAt: 'bad' }
    ]
  });
  assert.equal(result.breaks.length, 2);
  assert.equal(result.breaks[0].type, 'long');
  assert.equal(result.breaks[1].type, 'short');
  assert.equal(result.timer.mode, 'focus');
  assert.equal(result.timer.running, false);
  assert.equal(result.timer.elapsedMs, 0);
});

test('elapsedAt counts only running time and clamps negative deltas', () => {
  assert.equal(core.elapsedAt({ elapsedMs: 1000, running: false }, 5000), 1000);
  assert.equal(core.elapsedAt({ elapsedMs: 1000, running: true, accumulatedAt: 4000 }, 9000), 6000);
  assert.equal(core.elapsedAt({ elapsedMs: 1000, running: true, accumulatedAt: 9000 }, 4000), 1000);
  assert.equal(core.elapsedAt(null, 0), 0);
});

const readout = (overrides) => core.timerReadout({
  mode: 'focus',
  elapsedMs: 0,
  plannedMs: 25 * 60 * 1000,
  running: false,
  now: 1000000,
  timeFormat: core.formatTime,
  clockFormat: (ts) => `CLOCK:${ts}`,
  ...overrides
});

test('timerReadout renders the idle focus state', () => {
  const r = readout({});
  assert.equal(r.time, '25:00');
  assert.equal(r.eyebrow, 'Focus');
  assert.equal(r.subline, '25 min focus');
  assert.equal(r.overtime, false);
  assert.equal(r.fraction, 1);
});

test('timerReadout renders the running state with an end time', () => {
  const r = readout({ running: true });
  assert.equal(r.time, '25:00');
  assert.equal(r.subline, 'Ends at CLOCK:2500000');
  assert.equal(r.endsAtTs, 2500000);
});

test('timerReadout renders partial progress and paused state', () => {
  const r = readout({ elapsedMs: 60000 });
  assert.equal(r.time, '24:00');
  assert.equal(r.fraction, 0.96);
  assert.equal(r.subline, 'Paused');
});

test('timerReadout renders overtime only for focus', () => {
  const r = readout({ elapsedMs: 25 * 60 * 1000 + 65000, running: true });
  assert.equal(r.overtime, true);
  assert.equal(r.time, '+01:05');
  assert.equal(r.eyebrow, 'Overtime');
  assert.equal(r.subline, 'Finish when you are done');
  assert.equal(r.fraction, 1);

  const brk = readout({ mode: 'short', plannedMs: 5 * 60 * 1000, elapsedMs: 6 * 60 * 1000 });
  assert.equal(brk.overtime, false);
  assert.equal(brk.time, '00:00');
});

test('timerReadout labels break durations', () => {
  assert.equal(readout({ mode: 'short', plannedMs: 5 * 60 * 1000 }).subline, '5 min break');
  assert.equal(readout({ mode: 'long', plannedMs: 15 * 60 * 1000 }).subline, '15 min long break');
});

test('formatting helpers handle boundaries', () => {
  assert.equal(core.formatTime(0), '00:00');
  assert.equal(core.formatTime(65), '01:05');
  assert.equal(core.formatTime(-1), '00:00');
  assert.equal(core.formatDuration(0), '0m');
  assert.equal(core.formatDuration(90), '1h 30m');
  assert.equal(core.formatDuration(120), '2h');
});
