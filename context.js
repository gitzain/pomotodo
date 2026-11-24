/* Shared UI context for the ES modules. Core/store remain browser globals. */
const Core = window.PomoCore;
const store = window.PomoStore;
const state = store.state;

const RING_CIRCUMFERENCE = 2 * Math.PI * 116;
const MAX_GAP_MS = 4 * 60 * 60 * 1000;

const $ = (id) => document.getElementById(id);
const el = {
  card: $('timerCard'),
  time: $('timeDisplay'),
  modeName: $('modeName'),
  modeSubline: $('modeSubline'),
  ring: $('ringProgress'),
  controls: $('timerControls'),
  startBtn: $('startBtn'),
  startLabel: $('startLabel'),
  startIcon: $('startIcon'),
  resetBtn: $('resetBtn'),
  skipBtn: $('skipBtn'),
  doneCount: $('doneCount'),
  goalCount: $('goalCount'),
  extraCount: $('extraCount'),
  timeline: $('timeline'),

  captureCard: $('captureCard'),
  captureMeta: $('captureMeta'),
  captureForm: $('captureForm'),
  captureInput: $('captureInput'),
  skipLogBtn: $('skipLogBtn'),
  navTabs: Array.from(document.querySelectorAll('.nav-tab')),
  views: Array.from(document.querySelectorAll('.view')),
  logCount: $('logCount'),
  logList: $('logList'),
  statsContent: $('statsContent'),
  settingsModal: $('settingsModal'),
  settingsBtn: $('settingsBtn'),
  settingsForm: $('settingsForm'),
  closeSettingsBtn: $('closeSettingsBtn'),
  dailyGoal: $('dailyGoal'),
  focusMin: $('focusMin'),
  shortMin: $('shortMin'),
  longMin: $('longMin'),
  longEvery: $('longEvery'),
  soundToggle: $('soundToggle'),
  notifyToggle: $('notifyToggle'),
  autoStartBreak: $('autoStartBreak'),
  focusColor: $('focusColor'),
  shortColor: $('shortColor'),
  longColor: $('longColor'),
  themeColorMeta: document.querySelector('meta[name="theme-color"]'),
  exportBtn: $('exportBtn'),
  importBtn: $('importBtn'),
  importInput: $('importInput'),
  toast: $('toast'),
  savedIndicator: $('savedIndicator')
};

const ui = {
  currentView: 'timer',
  pendingSessionId: null,
  currentDay: Core.localDateKey(),
  lastSaveTick: Date.now(),
  toastTimeout: null,
  savedTimeout: null,
  audioCtx: null
};

const {
  DEFAULT_COLORS, clamp, localDateKey, keyFromTs, uid,
  formatTime, formatClock, formatDuration,
  normalizeHex, deriveColors,
  freshTimer, defaults, mergeSettings, normalizeImported, timerReadout
} = Core;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const goal = () => clamp(Number(state.settings.goal) || 8, 1, 24);
const durationFor = (mode) => Math.max(1, Number(state.settings[mode]) || defaults().settings[mode]) * 60;
const plannedMs = () => durationFor(state.timer.mode) * 1000;
const allFocus = () => state.sessions.filter((s) => s.type === 'focus');
const sessionsOn = (day) => state.sessions.filter((s) => s.type === 'focus' && s.day === day);
const todayFocus = () => sessionsOn(Core.localDateKey());

function dayLabel(day) {
  if (day === Core.localDateKey()) return 'Today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === Core.localDateKey(yesterday)) return 'Yesterday';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function toast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(ui.toastTimeout);
  ui.toastTimeout = setTimeout(() => { el.toast.hidden = true; }, 2800);
}

function modeColor() {
  const s = state.settings;
  if (state.timer.mode === 'short') return normalizeHex(s.shortColor, DEFAULT_COLORS.shortColor);
  if (state.timer.mode === 'long') return normalizeHex(s.longColor, DEFAULT_COLORS.longColor);
  return normalizeHex(s.focusColor, DEFAULT_COLORS.focusColor);
}

function syncMetaThemeColor() {
  if (!el.themeColorMeta) return;
  el.themeColorMeta.dataset.mode = state.timer.mode;
  el.themeColorMeta.content = modeColor();
}

function applyColors(settings = state.settings) {
  const root = document.documentElement;
  const set = (name, color) => {
    const c = deriveColors(normalizeHex(color, DEFAULT_COLORS[`${name}Color`]));
    root.style.setProperty(`--${name}-accent`, c.accent);
    root.style.setProperty(`--${name}-accent-dark`, c.dark);
    root.style.setProperty(`--${name}-accent-soft`, c.soft);
    root.style.setProperty(`--${name}-accent-rgb`, c.rgb);
  };
  set('focus', settings.focusColor);
  set('short', settings.shortColor);
  set('long', settings.longColor);
  syncMetaThemeColor();
}

const longEvery = () => clamp(parseInt(state.settings.longEvery, 10) || 4, 2, 12);
const nextBreakType = (pomodoroNumber) => Core.nextBreakType(pomodoroNumber, longEvery());
const elapsedNow = () => Core.elapsedAt(state.timer);

function syncElapsed() {
  const t = state.timer;
  if (t.running && t.accumulatedAt) {
    t.elapsedMs = elapsedNow();
    t.accumulatedAt = Date.now();
  }
}

export {
  Core, store, state, el, ui, RING_CIRCUMFERENCE, MAX_GAP_MS,
  DEFAULT_COLORS, clamp, localDateKey, keyFromTs, uid,
  formatTime, formatClock, formatDuration,
  normalizeHex, deriveColors, freshTimer, defaults, mergeSettings,
  normalizeImported, timerReadout, escapeHtml,
  goal, durationFor, plannedMs, allFocus, sessionsOn, todayFocus,
  dayLabel, toast, modeColor, syncMetaThemeColor, applyColors,
  longEvery, nextBreakType, elapsedNow, syncElapsed
};
