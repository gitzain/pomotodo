import {
  el, ui, state, store, RING_CIRCUMFERENCE,
  clamp, uid, keyFromTs, localDateKey, formatClock, formatTime,
  freshTimer, timerReadout, toast,
  plannedMs, elapsedNow, syncElapsed, syncMetaThemeColor,
  nextBreakType, todayFocus, goal
} from './context.js?v=20';
import { renderProgress } from './progress.js?v=20';
import { renderLog } from './log.js?v=20';
import { renderStats } from './stats.js?v=20';

export function renderTimer() {
  const t = state.timer;
  const elapsed = elapsedNow();
  const planned = plannedMs();
  const readout = timerReadout({
    mode: t.mode,
    elapsedMs: elapsed,
    plannedMs: planned,
    running: t.running,
    timeFormat: formatTime,
    clockFormat: formatClock
  });
  const { overtime, fraction } = readout;

  el.time.textContent = readout.time;
  el.modeName.textContent = readout.eyebrow;
  el.modeSubline.textContent = readout.subline;
  el.card.dataset.mode = t.mode;
  document.body.dataset.mode = t.mode;
  if (el.themeColorMeta && el.themeColorMeta.dataset.mode !== t.mode) syncMetaThemeColor();
  el.card.classList.toggle('is-overtime', overtime);

  el.ring.style.strokeDasharray = String(RING_CIRCUMFERENCE);
  el.ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - fraction));

  el.controls.hidden = !!ui.pendingSessionId;
  el.captureCard.hidden = !ui.pendingSessionId;

  // Only surface secondary actions when they actually mean something.
  const hasProgress = t.running || elapsed > 0;
  el.resetBtn.hidden = !hasProgress;
  el.skipBtn.hidden = overtime || (t.mode === 'focus' && !hasProgress);

  if (ui.pendingSessionId) {
    el.startLabel.textContent = 'Logging session';
    el.startIcon.textContent = '✓';
  } else if (overtime) {
    el.startLabel.textContent = 'Finish & log';
    el.startIcon.textContent = '✓';
  } else if (t.running) {
    el.startLabel.textContent = 'Pause';
    el.startIcon.textContent = '❚❚';
  } else if (elapsed > 0) {
    el.startLabel.textContent = 'Resume';
    el.startIcon.textContent = '▶';
  } else {
    el.startLabel.textContent = t.mode === 'focus' ? 'Start focus' : 'Start break';
    el.startIcon.textContent = '▶';
  }
  document.body.classList.toggle('timer-running', t.running);
  document.title = t.running
    ? `${el.time.textContent} · ${overtime ? 'Overtime' : t.mode === 'focus' ? 'Focus' : 'Break'} — PomoTodo`
    : 'PomoTodo — Focus & Get Things Done';
}

export function startTimer() {
  if (ui.pendingSessionId) return;
  const t = state.timer;
  if (t.running) return;
  if (!t.startedAt) t.startedAt = Date.now();
  if (!t.milestoneNotified && elapsedNow() >= plannedMs()) t.milestoneNotified = true;
  t.running = true;
  t.accumulatedAt = Date.now();
  store.save();
}

export function pauseTimer() {
  const t = state.timer;
  if (!t.running) return;
  syncElapsed();
  t.running = false;
  t.accumulatedAt = null;
  store.save();
}

export function setMode(mode) {
  state.timer = freshTimer(mode);
  store.save();
}

export function resetTimer() {
  if (ui.pendingSessionId) return;
  setMode(state.timer.mode);
  toast('Timer reset');
}

export function finishFocus() {
  if (ui.pendingSessionId) return;
  const t = state.timer;
  syncElapsed();
  t.running = false;
  t.accumulatedAt = null;
  const elapsed = t.elapsedMs;
  const endedAt = Date.now();
  const startedAt = t.startedAt || endedAt - elapsed;
  const actualMinutes = Math.max(1, Math.round(elapsed / 60000));
  const plannedMinutes = clamp(Number(state.settings.focus) || 25, 1, 180);
  const overtimeMinutes = Math.max(0, actualMinutes - plannedMinutes);
  const session = {
    id: uid(), label: '', startedAt, endedAt,
    plannedMinutes, actualMinutes, overtimeMinutes,
    type: 'focus', day: keyFromTs(endedAt)
  };
  state.sessions.push(session);
  ui.pendingSessionId = session.id;
  el.captureMeta.textContent = `${plannedMinutes}m planned · ${actualMinutes}m actual${overtimeMinutes ? ` · +${overtimeMinutes}m overtime` : ''} · ended ${formatClock(endedAt)}`;
  el.captureInput.value = '';
  state.timer = freshTimer('focus');
  store.save();
  el.captureInput.focus();
}

export function completeCapture(useLabel) {
  const session = state.sessions.find((s) => s.id === ui.pendingSessionId);
  if (session) session.label = (useLabel && el.captureInput.value.trim()) || 'Untitled session';
  ui.pendingSessionId = null;
  const count = todayFocus().length;
  setMode(nextBreakType(count));
  if (state.settings.autoStartBreak) startTimer();
  toast(count >= goal() ? 'Goal reached — take a well-earned break' : `Session saved — ${count} of ${goal()} today`);
}

export function finishBreak() {
  const t = state.timer;
  syncElapsed();
  t.running = false;
  t.accumulatedAt = null;
  state.breaks.push({
    id: uid(), type: t.mode,
    startedAt: t.startedAt || Date.now(),
    endedAt: Date.now(),
    actualMinutes: Math.max(1, Math.round(t.elapsedMs / 60000))
  });
  setMode('focus');
  toast('Break finished — ready for another pomodoro?');
}

export function skipTimer() {
  if (ui.pendingSessionId) return;
  const t = state.timer;
  if (t.mode === 'focus') {
    if (elapsedNow() >= plannedMs()) { finishFocus(); return; }
    const type = nextBreakType(todayFocus().length + 1);
    setMode(type);
    toast(`Skipped — take a ${type} break`);
  } else {
    finishBreak();
  }
}

export function tick() {
  const day = localDateKey();
  if (day !== ui.currentDay) {
    ui.currentDay = day;
    renderProgress();
    if (ui.currentView === 'log') renderLog();
    if (ui.currentView === 'stats') renderStats();
  }

  const t = state.timer;
  if (t.running && !ui.pendingSessionId) {
    if (elapsedNow() >= plannedMs()) {
      if (t.mode === 'focus') {
        if (!t.milestoneNotified) {
          t.milestoneNotified = true;
          chime();
          notify('Pomodoro time is up', 'You are in overtime — finish when you are ready to log it.');
        }
      } else {
        chime();
        finishBreak();
      }
    }
    if (Date.now() - ui.lastSaveTick > 5000) {
      syncElapsed();
      store.save();
      ui.lastSaveTick = Date.now();
    }
  }
  renderTimer();
}

function chime() {
  if (!state.settings.sound) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ui.audioCtx = ui.audioCtx || new AC();
    if (ui.audioCtx.state === 'suspended') ui.audioCtx.resume();
    const now = ui.audioCtx.currentTime;
    [880, 1174.66].forEach((freq, i) => {
      const osc = ui.audioCtx.createOscillator();
      const gain = ui.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      osc.connect(gain);
      gain.connect(ui.audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.6);
    });
  } catch (err) { /* Audio is a nice-to-have. */ }
}

function notify(title, body) {
  if (!state.settings.notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try { new Notification(title, { body }); } catch (err) { /* Ignore notification errors. */ }
}
