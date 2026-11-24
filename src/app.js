/* Entry module: wires events, subscriptions, and boot. */
import {
  el, ui, state, store, MAX_GAP_MS, applyColors,
  plannedMs, elapsedNow, syncElapsed, toast
} from './context.js?v=20';
import {
  renderTimer, startTimer, pauseTimer, resetTimer, finishFocus,
  completeCapture, finishBreak, skipTimer, tick
} from './timer.js?v=20';
import { renderProgress } from './progress.js?v=20';
import { renderLog } from './log.js?v=20';
import { renderStats } from './stats.js?v=20';
import { switchView, openSettings, closeSettings, settingsValues } from './settings.js?v=20';
import { exportData, importData } from './data.js?v=20';

store.subscribe(() => {
  renderTimer();
  renderProgress();
  if (ui.currentView === 'log') renderLog();
  if (ui.currentView === 'stats') renderStats();
});

window.addEventListener('pomotodo:saved', () => {
  el.savedIndicator.textContent = '✓ Saved';
  el.savedIndicator.classList.add('show');
  clearTimeout(ui.savedTimeout);
  ui.savedTimeout = setTimeout(() => el.savedIndicator.classList.remove('show'), 1200);
});

el.startBtn.addEventListener('click', () => {
  if (ui.pendingSessionId) { el.captureInput.focus(); return; }
  const t = state.timer;
  if (t.mode === 'focus' && elapsedNow() >= plannedMs()) { finishFocus(); return; }
  if (t.running) pauseTimer(); else startTimer();
});
el.resetBtn.addEventListener('click', resetTimer);
el.skipBtn.addEventListener('click', skipTimer);

el.captureForm.addEventListener('submit', (e) => { e.preventDefault(); completeCapture(true); });
el.skipLogBtn.addEventListener('click', () => completeCapture(false));

el.navTabs.forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));

el.settingsBtn.addEventListener('click', openSettings);
el.closeSettingsBtn.addEventListener('click', () => closeSettings());
el.exportBtn.addEventListener('click', exportData);
el.importBtn.addEventListener('click', () => el.importInput.click());
el.importInput.addEventListener('change', async () => {
  const file = el.importInput.files && el.importInput.files[0];
  el.importInput.value = '';
  if (!file) return;
  if (!confirm('Importing a backup will replace your current sessions, breaks, and settings on this device. Continue?')) return;
  try {
    await importData(file);
  } catch (err) {
    toast(err && err.message ? err.message : 'Could not import backup');
  }
});
el.settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = settingsValues();
  Object.assign(state.settings, v);
  if (state.settings.notify && typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
  applyColors(state.settings);
  store.save();
  closeSettings(true);
  toast('Settings saved');
});

el.settingsModal.addEventListener('mousedown', (e) => {
  if (e.target === el.settingsModal) closeSettings();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !el.settingsModal.hidden) {
    const focusable = Array.from(el.settingsModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter((node) => !node.hidden && !node.disabled);
    if (!focusable.length) { e.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  if (e.key === 'Escape' && !el.settingsModal.hidden) {
    e.preventDefault();
    closeSettings();
    return;
  }
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
  if (e.code === 'Space' && ui.currentView === 'timer' && !typing && !e.target.closest('button')) {
    e.preventDefault();
    if (ui.pendingSessionId) el.captureInput.focus();
    else if (state.timer.running) pauseTimer();
    else startTimer();
  }
});

function boot() {
  applyColors(state.settings);
  const t = state.timer;
  if (t.running && t.accumulatedAt) {
    const gap = Date.now() - t.accumulatedAt;
    if (gap > MAX_GAP_MS) {
      t.elapsedMs = Math.max(t.elapsedMs, plannedMs());
      t.running = false;
      t.accumulatedAt = null;
      if (t.mode === 'focus') {
        state.timer = t;
        finishFocus();
      } else {
        finishBreak();
      }
    } else {
      syncElapsed();
    }
  }
  if (!t.milestoneNotified && t.mode === 'focus' && elapsedNow() >= plannedMs()) t.milestoneNotified = true;
  renderTimer();
  renderProgress();
  setInterval(tick, 250);
}

boot();
