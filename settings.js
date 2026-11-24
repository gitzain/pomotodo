import {
  el, ui, state, clamp, normalizeHex, DEFAULT_COLORS
} from './context.js?v=19';
import { renderTimer } from './timer.js?v=19';
import { renderLog } from './log.js?v=19';
import { renderStats } from './stats.js?v=19';

export function switchView(view) {
  ui.currentView = view;
  el.views.forEach((v) => {
    const active = v.id === `view-${view}`;
    v.hidden = !active;
    v.classList.toggle('is-active', active);
  });
  el.navTabs.forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  if (view === 'log') renderLog();
  if (view === 'stats') renderStats();
  if (view === 'timer') renderTimer();
}

let settingsReturnFocus = null;

export function settingsValues() {
  return {
    goal: clamp(parseInt(el.dailyGoal.value, 10) || 8, 1, 24),
    focus: clamp(parseInt(el.focusMin.value, 10) || 25, 1, 180),
    short: clamp(parseInt(el.shortMin.value, 10) || 5, 1, 60),
    long: clamp(parseInt(el.longMin.value, 10) || 15, 1, 60),
    longEvery: clamp(parseInt(el.longEvery.value, 10) || 4, 2, 12),
    sound: !!el.soundToggle.checked,
    notify: !!el.notifyToggle.checked,
    autoStartBreak: !!el.autoStartBreak.checked,
    focusColor: normalizeHex(el.focusColor.value, state.settings.focusColor || DEFAULT_COLORS.focusColor),
    shortColor: normalizeHex(el.shortColor.value, state.settings.shortColor || DEFAULT_COLORS.shortColor),
    longColor: normalizeHex(el.longColor.value, state.settings.longColor || DEFAULT_COLORS.longColor)
  };
}

export function isSettingsDirty() {
  const v = settingsValues();
  const s = state.settings;
  return v.goal !== s.goal || v.focus !== s.focus || v.short !== s.short || v.long !== s.long
    || v.longEvery !== s.longEvery || v.sound !== s.sound || v.notify !== s.notify
    || v.autoStartBreak !== s.autoStartBreak
    || v.focusColor !== s.focusColor || v.shortColor !== s.shortColor || v.longColor !== s.longColor;
}

export function openSettings() {
  settingsReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : el.settingsBtn;
  el.dailyGoal.value = state.settings.goal;
  el.focusMin.value = state.settings.focus;
  el.shortMin.value = state.settings.short;
  el.longMin.value = state.settings.long;
  el.longEvery.value = state.settings.longEvery;
  el.soundToggle.checked = state.settings.sound;
  el.notifyToggle.checked = state.settings.notify;
  el.autoStartBreak.checked = state.settings.autoStartBreak;
  el.focusColor.value = state.settings.focusColor;
  el.shortColor.value = state.settings.shortColor;
  el.longColor.value = state.settings.longColor;
  el.settingsModal.hidden = false;
  el.dailyGoal.focus();
}

export function closeSettings(force = false) {
  if (el.settingsModal.hidden) return;
  if (!force && isSettingsDirty()) {
    if (!confirm('Discard unsaved changes?')) return;
  }
  el.settingsModal.hidden = true;
  const target = settingsReturnFocus && document.contains(settingsReturnFocus) ? settingsReturnFocus : el.settingsBtn;
  settingsReturnFocus = null;
  target.focus();
}
