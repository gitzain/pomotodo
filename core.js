/* Pure logic shared by the app and the Node test suite. No DOM or storage access. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PomoCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_COLORS = { focusColor: '#c94b43', shortColor: '#6aa9c4', longColor: '#9a86c4' };
  const LEGACY_THEMES = {
    red: { ...DEFAULT_COLORS },
    green: { ...DEFAULT_COLORS, focusColor: '#5f9465' },
    blue: { ...DEFAULT_COLORS, focusColor: '#4f84b7' }
  };
  const MODE_LABELS = { focus: 'Focus', short: 'Short break', long: 'Long break' };

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const localDateKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const keyFromTs = (ts) => localDateKey(new Date(ts));
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  function formatTime(seconds) {
    const s = Math.max(0, seconds);
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  }
  function formatDuration(minutes) {
    const m = Math.max(0, Math.round(minutes));
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h}h ${rest}m` : `${h}h`;
  }
  function formatClock(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const normalizeHex = (value, fallback) => {
    const v = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback;
  };
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }
  function deriveColors(hex) {
    const { r, g, b } = hexToRgb(hex);
    const { h, s, l } = rgbToHsl(r, g, b);
    return {
      accent: hex,
      dark: hslToHex(h, Math.max(0, s - 4), clamp(l - 11, 18, 48)),
      soft: hslToHex(h, Math.min(s, 70), 94),
      rgb: `${r}, ${g}, ${b}`
    };
  }

  function freshTimer(mode = 'focus') {
    return { mode, running: false, elapsedMs: 0, accumulatedAt: null, startedAt: null, milestoneNotified: false };
  }

  function defaults() {
    return {
      settings: { focus: 25, short: 5, long: 15, longEvery: 4, goal: 8, sound: true, notify: false, ...DEFAULT_COLORS },
      timer: freshTimer(),
      sessions: [],
      breaks: []
    };
  }

  function mergeSettings(baseSettings, rawSettings) {
    const raw = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
    const legacy = LEGACY_THEMES[raw.theme];
    const merged = { ...baseSettings, ...(legacy || {}), ...raw };
    merged.longEvery = clamp(parseInt(merged.longEvery, 10) || baseSettings.longEvery, 2, 12);
    merged.focusColor = normalizeHex(merged.focusColor, baseSettings.focusColor);
    merged.shortColor = normalizeHex(merged.shortColor, baseSettings.shortColor);
    merged.longColor = normalizeHex(merged.longColor, baseSettings.longColor);
    delete merged.theme;
    return merged;
  }

  function normalizeImported(raw) {
    const src = raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object' ? raw.data : raw;
    if (!src || typeof src !== 'object') throw new Error('Invalid backup file');
    const base = defaults();
    const mergedSettings = mergeSettings(base.settings, src.settings);
    mergedSettings.goal = clamp(parseInt(mergedSettings.goal, 10) || base.settings.goal, 1, 24);
    mergedSettings.focus = clamp(parseInt(mergedSettings.focus, 10) || base.settings.focus, 1, 180);
    mergedSettings.short = clamp(parseInt(mergedSettings.short, 10) || base.settings.short, 1, 60);
    mergedSettings.long = clamp(parseInt(mergedSettings.long, 10) || base.settings.long, 1, 60);
    mergedSettings.sound = !!mergedSettings.sound;
    mergedSettings.notify = !!mergedSettings.notify;

    const cleanSession = (s) => {
      if (!s || typeof s !== 'object') return null;
      const endedAt = Number(s.endedAt);
      const startedAt = Number(s.startedAt);
      if (!Number.isFinite(endedAt) || !Number.isFinite(startedAt)) return null;
      const plannedMinutes = Math.max(1, Number(s.plannedMinutes) || mergedSettings.focus);
      const actualMinutes = Math.max(1, Number(s.actualMinutes) || plannedMinutes);
      return {
        id: typeof s.id === 'string' && s.id ? s.id : uid(),
        label: typeof s.label === 'string' && s.label.trim() ? s.label.trim().slice(0, 120) : 'Untitled session',
        startedAt, endedAt,
        plannedMinutes, actualMinutes,
        overtimeMinutes: Math.max(0, Number(s.overtimeMinutes) || 0),
        type: 'focus',
        day: typeof s.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.day) ? s.day : keyFromTs(endedAt)
      };
    };
    const cleanBreak = (b) => {
      if (!b || typeof b !== 'object') return null;
      const endedAt = Number(b.endedAt);
      const startedAt = Number(b.startedAt);
      if (!Number.isFinite(endedAt) || !Number.isFinite(startedAt)) return null;
      const type = b.type === 'long' ? 'long' : 'short';
      return {
        id: typeof b.id === 'string' && b.id ? b.id : uid(),
        type, startedAt, endedAt,
        actualMinutes: Math.max(1, Number(b.actualMinutes) || 1)
      };
    };

    const sessions = Array.isArray(src.sessions) ? src.sessions.map(cleanSession).filter(Boolean) : [];
    const breaks = Array.isArray(src.breaks) ? src.breaks.map(cleanBreak).filter(Boolean) : [];
    return { ...base, settings: mergedSettings, sessions, breaks, timer: freshTimer() };
  }

  function nextBreakType(pomodoroNumber, longEvery = 4) {
    const n = clamp(parseInt(longEvery, 10) || 4, 2, 12);
    return pomodoroNumber % n === 0 ? 'long' : 'short';
  }

  function elapsedAt(timer, now = Date.now()) {
    const t = timer || {};
    const base = Math.max(0, Number(t.elapsedMs) || 0);
    return base + (t.running && t.accumulatedAt ? Math.max(0, now - Number(t.accumulatedAt)) : 0);
  }

  function timerReadout({ mode, elapsedMs, plannedMs, running, now = Date.now(), timeFormat, clockFormat }) {
    const elapsed = Math.max(0, Number(elapsedMs) || 0);
    const planned = Math.max(1, Number(plannedMs) || 1);
    const overtime = mode === 'focus' && elapsed >= planned;
    const remaining = Math.max(0, Math.ceil((planned - elapsed) / 1000));
    const endsAtTs = now + remaining * 1000;
    const time = timeFormat || formatTime;
    const clock = clockFormat || formatClock;
    return {
      overtime,
      remaining,
      endsAtTs,
      fraction: overtime ? 1 : clamp(1 - elapsed / planned, 0, 1),
      time: overtime ? `+${time(Math.floor((elapsed - planned) / 1000))}` : time(remaining),
      eyebrow: overtime ? 'Overtime' : (MODE_LABELS[mode] || MODE_LABELS.focus),
      subline: overtime
        ? 'Finish when you are done'
        : running
          ? `Ends at ${clock(endsAtTs)}`
          : elapsed > 0
            ? 'Paused'
            : `${Math.round(planned / 60000)} min ${mode === 'focus' ? 'focus' : mode === 'short' ? 'break' : 'long break'}`
    };
  }

  return {
    DEFAULT_COLORS, LEGACY_THEMES, MODE_LABELS,
    clamp, localDateKey, keyFromTs, uid,
    formatTime, formatClock, formatDuration,
    normalizeHex, deriveColors,
    freshTimer, defaults, mergeSettings, normalizeImported,
    nextBreakType, elapsedAt, timerReadout
  };
});
