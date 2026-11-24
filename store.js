/* Owns application state and persistence. The UI talks to this instead of localStorage. */
(function (root) {
  'use strict';

  const Core = root.PomoCore;
  const STORAGE_KEY = 'pomotodo-v2';
  const LEGACY_KEY = 'pomotodo-lite-v1';
  const listeners = new Set();

  function migrateLegacy() {
    try {
      const old = JSON.parse(localStorage.getItem(LEGACY_KEY));
      if (!old || !Array.isArray(old.records)) return Core.defaults();
      const base = Core.defaults();
      return {
        ...base,
        settings: Core.mergeSettings(base.settings, old.settings),
        sessions: old.records.map((r) => {
          const ended = Number(r.completedAt) || Date.now();
          const minutes = Math.max(1, Number(r.minutes) || 25);
          return {
            id: Core.uid(), label: r.task || 'Untitled session',
            startedAt: ended - minutes * 60000, endedAt: ended,
            plannedMinutes: minutes, actualMinutes: minutes, overtimeMinutes: 0,
            type: 'focus', day: Core.keyFromTs(ended)
          };
        })
      };
    } catch (err) { return Core.defaults(); }
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!raw || typeof raw !== 'object') return migrateLegacy();
      const base = Core.defaults();
      const timer = raw.timer && typeof raw.timer === 'object' ? raw.timer : {};
      const validMode = ['focus', 'short', 'long'].includes(timer.mode) ? timer.mode : 'focus';
      return {
        settings: Core.mergeSettings(base.settings, raw.settings),
        timer: {
          mode: validMode,
          running: !!timer.running,
          elapsedMs: Math.max(0, Number(timer.elapsedMs) || 0),
          accumulatedAt: Number(timer.accumulatedAt) || null,
          startedAt: Number(timer.startedAt) || null,
          milestoneNotified: !!timer.milestoneNotified
        },
        sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
        breaks: Array.isArray(raw.breaks) ? raw.breaks : []
      };
    } catch (err) { return Core.defaults(); }
  }

  const state = load();

  function notify() { listeners.forEach((fn) => fn(state)); }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      root.dispatchEvent(new CustomEvent('pomotodo:saved'));
      notify();
      return true;
    } catch (err) { return false; }
  }
  function update(mutator) {
    const result = mutator(state);
    save();
    return result;
  }
  function updateQuiet(mutator) { return mutator(state); }
  function replaceAll(next) {
    Object.assign(state, next);
    save();
  }
  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  root.PomoStore = { state, save, update, updateQuiet, replaceAll, subscribe };
})(window);
