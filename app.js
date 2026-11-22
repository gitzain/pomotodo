(() => {
  'use strict';

  const STORAGE_KEY = 'pomotodo-v2';
  const LEGACY_KEY = 'pomotodo-lite-v1';
  const RING_CIRCUMFERENCE = 2 * Math.PI * 116;
  const MAX_GAP_MS = 4 * 60 * 60 * 1000;
  const MODE_LABELS = { focus: 'Time to focus', short: 'Short break', long: 'Long break' };

  const $ = (id) => document.getElementById(id);
  const el = {
    card: $('timerCard'),
    time: $('timeDisplay'),
    modeName: $('modeName'),
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
    phaseLabel: $('phaseLabel'),
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
    soundToggle: $('soundToggle'),
    notifyToggle: $('notifyToggle'),
    toast: $('toast'),
    savedIndicator: $('savedIndicator')
  };

  /* ---------------- State ---------------- */

  function localDateKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function keyFromTs(ts) { return localDateKey(new Date(ts)); }
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function freshTimer(mode = 'focus') {
    return { mode, running: false, elapsedMs: 0, accumulatedAt: null, startedAt: null, milestoneNotified: false };
  }

  function defaults() {
    return {
      settings: { focus: 25, short: 5, long: 15, goal: 8, sound: true, notify: false },
      timer: freshTimer(),
      sessions: [],
      breaks: []
    };
  }

  function migrateLegacy() {
    try {
      const old = JSON.parse(localStorage.getItem(LEGACY_KEY));
      if (!old || !Array.isArray(old.records)) return defaults();
      const base = defaults();
      return {
        ...base,
        settings: { ...base.settings, ...(old.settings || {}) },
        sessions: old.records.map((r) => {
          const ended = Number(r.completedAt) || Date.now();
          const minutes = Math.max(1, Number(r.minutes) || 25);
          return {
            id: uid(), label: r.task || 'Untitled session',
            startedAt: ended - minutes * 60000, endedAt: ended,
            plannedMinutes: minutes, actualMinutes: minutes, overtimeMinutes: 0,
            type: 'focus', day: keyFromTs(ended)
          };
        })
      };
    } catch (err) { return defaults(); }
  }

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!raw || typeof raw !== 'object') return migrateLegacy();
      const base = defaults();
      const timer = raw.timer && typeof raw.timer === 'object' ? raw.timer : {};
      const validMode = ['focus', 'short', 'long'].includes(timer.mode) ? timer.mode : 'focus';
      return {
        settings: { ...base.settings, ...(raw.settings || {}) },
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
    } catch (err) { return defaults(); }
  }

  const state = loadState();
  let currentView = 'timer';
  let pendingSessionId = null;
  let currentDay = localDateKey();
  let lastSaveTick = Date.now();
  let toastTimeout = null;
  let savedTimeout = null;
  let audioCtx = null;

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      el.savedIndicator.textContent = '✓ Saved';
      el.savedIndicator.classList.add('show');
      clearTimeout(savedTimeout);
      savedTimeout = setTimeout(() => el.savedIndicator.classList.remove('show'), 1200);
    } catch (err) { /* Storage can be unavailable; app still works in memory. */ }
  }

  /* ---------------- Helpers ---------------- */

  const goal = () => clamp(Number(state.settings.goal) || 8, 1, 24);
  const durationFor = (mode) => Math.max(1, Number(state.settings[mode]) || defaults().settings[mode]) * 60;
  const plannedMs = () => durationFor(state.timer.mode) * 1000;
  const allFocus = () => state.sessions.filter((s) => s.type === 'focus');
  const sessionsOn = (day) => state.sessions.filter((s) => s.type === 'focus' && s.day === day);
  const todayFocus = () => sessionsOn(localDateKey());

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
  function dayLabel(day) {
    if (day === localDateKey()) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (day === localDateKey(yesterday)) return 'Yesterday';
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  }
  function toast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { el.toast.hidden = true; }, 2800);
  }
  function nextBreakType(pomodoroNumber) { return pomodoroNumber % 4 === 0 ? 'long' : 'short'; }

  /* ---------------- Timer ---------------- */

  function elapsedNow() {
    const t = state.timer;
    return t.elapsedMs + (t.running && t.accumulatedAt ? Date.now() - t.accumulatedAt : 0);
  }
  function syncElapsed() {
    const t = state.timer;
    if (t.running && t.accumulatedAt) {
      t.elapsedMs = elapsedNow();
      t.accumulatedAt = Date.now();
    }
  }

  function renderTimer() {
    const t = state.timer;
    const elapsed = elapsedNow();
    const planned = plannedMs();
    const overtime = t.mode === 'focus' && elapsed >= planned;
    const remaining = Math.max(0, Math.ceil((planned - elapsed) / 1000));

    el.time.textContent = overtime
      ? `+${formatTime(Math.floor((elapsed - planned) / 1000))}`
      : formatTime(remaining);
    el.modeName.textContent = overtime ? 'Overtime — finish when you are done' : MODE_LABELS[t.mode];
    el.card.dataset.mode = t.mode;
    el.card.classList.toggle('is-overtime', overtime);

    const fraction = overtime ? 1 : clamp(1 - elapsed / planned, 0, 1);
    el.ring.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    el.ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - fraction));

    el.controls.hidden = !!pendingSessionId;
    el.captureCard.hidden = !pendingSessionId;

    // Only surface secondary actions when they actually mean something.
    const hasProgress = t.running || elapsed > 0;
    el.resetBtn.hidden = !hasProgress;
    el.skipBtn.hidden = overtime || (t.mode === 'focus' && !hasProgress);

    if (pendingSessionId) {
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

  function startTimer() {
    if (pendingSessionId) return;
    const t = state.timer;
    if (t.running) return;
    if (!t.startedAt) t.startedAt = Date.now();
    if (!t.milestoneNotified && elapsedNow() >= plannedMs()) t.milestoneNotified = true;
    t.running = true;
    t.accumulatedAt = Date.now();
    saveState();
    renderTimer();
  }

  function pauseTimer() {
    const t = state.timer;
    if (!t.running) return;
    syncElapsed();
    t.running = false;
    t.accumulatedAt = null;
    saveState();
    renderTimer();
  }

  function setMode(mode) {
    state.timer = freshTimer(mode);
    saveState();
    renderTimer();
    renderProgress();
  }

  function resetTimer() {
    if (pendingSessionId) return;
    setMode(state.timer.mode);
    toast('Timer reset');
  }

  function finishFocus() {
    if (pendingSessionId) return;
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
    pendingSessionId = session.id;
    el.captureMeta.textContent = `${plannedMinutes}m planned · ${actualMinutes}m actual${overtimeMinutes ? ` · +${overtimeMinutes}m overtime` : ''} · ended ${formatClock(endedAt)}`;
    el.captureInput.value = '';
    state.timer = freshTimer('focus');
    saveState();
    renderTimer();
    renderProgress();
    el.captureInput.focus();
  }

  function completeCapture(useLabel) {
    const session = state.sessions.find((s) => s.id === pendingSessionId);
    if (session) session.label = (useLabel && el.captureInput.value.trim()) || 'Untitled session';
    pendingSessionId = null;
    const count = todayFocus().length;
    setMode(nextBreakType(count));
    toast(count >= goal() ? 'Goal reached — take a well-earned break' : `Session saved — ${count} of ${goal()} today`);
  }

  function finishBreak() {
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

  function skipTimer() {
    if (pendingSessionId) return;
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

  function tick() {
    const day = localDateKey();
    if (day !== currentDay) {
      currentDay = day;
      renderProgress();
      if (currentView === 'log') renderLog();
      if (currentView === 'stats') renderStats();
    }

    const t = state.timer;
    if (t.running && !pendingSessionId) {
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
      if (Date.now() - lastSaveTick > 5000) {
        syncElapsed();
        saveState();
        lastSaveTick = Date.now();
      }
    }
    renderTimer();
  }

  function chime() {
    if (!state.settings.sound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      [880, 1174.66].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const start = now + i * 0.18;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + 0.6);
      });
    } catch (err) { /* Audio is a nice-to-have. */ }
  }

  function notify(title, body) {
    if (!state.settings.notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try { new Notification(title, { body }); } catch (err) { /* Ignore notification errors. */ }
  }

  /* ---------------- Daily progress strip ---------------- */

  function renderProgress() {
    const target = goal();
    const completed = todayFocus().length;
    el.doneCount.textContent = completed;
    el.goalCount.textContent = target;
    el.extraCount.textContent = completed > target ? `+${completed - target}` : '';
    el.extraCount.hidden = completed <= target;

    el.timeline.innerHTML = '';
    for (let i = 1; i <= target; i++) {
      let dotState = 'upcoming';
      if (i <= completed) dotState = 'done';
      else if (i === completed + 1 && state.timer.mode === 'focus') dotState = 'current';
      const dot = document.createElement('span');
      dot.className = `progress-dot ${dotState}${i > 1 && (i - 1) % 4 === 0 ? ' cycle-gap' : ''}`;
      dot.title = `Pomodoro ${i}${dotState === 'done' ? ' — completed today' : ''}`;
      el.timeline.appendChild(dot);
    }

    if (state.timer.mode === 'focus') {
      if (completed >= target) {
        el.phaseLabel.textContent = 'Goal reached — keep going';
      } else {
        el.phaseLabel.textContent = `${nextBreakType(completed + 1) === 'long' ? 'Long' : 'Short'} break next`;
      }
    } else {
      el.phaseLabel.textContent = state.timer.mode === 'long' ? 'On a long break' : 'On a short break';
    }
  }

  /* ---------------- Session log ---------------- */

  function renderLog() {
    const sessions = [...state.sessions].sort((a, b) => b.endedAt - a.endedAt);
    el.logCount.textContent = `${sessions.length} session${sessions.length === 1 ? '' : 's'}`;
    el.logList.innerHTML = '';

    if (!sessions.length) {
      el.logList.innerHTML = '<div class="empty-state"><span class="empty-icon">📒</span>Finish a pomodoro to see it logged here.</div>';
      return;
    }

    let activeDay = null;
    sessions.forEach((session) => {
      if (session.day !== activeDay) {
        activeDay = session.day;
        const daySessions = sessions.filter((s) => s.day === activeDay);
        const minutes = daySessions.reduce((sum, s) => sum + (Number(s.actualMinutes) || 0), 0);
        const header = document.createElement('div');
        header.className = 'log-day';
        header.textContent = `${dayLabel(activeDay)} · ${daySessions.length} session${daySessions.length === 1 ? '' : 's'} · ${formatDuration(minutes)}`;
        el.logList.appendChild(header);
      }

      const row = document.createElement('div');
      row.className = 'log-row';
      const overtime = Number(session.overtimeMinutes) || 0;
      row.innerHTML = `
        <span class="log-dot"></span>
        <div class="log-body">
          <div class="log-label">${escapeHtml(session.label || 'Untitled session')}</div>
          <div class="log-time">${formatClock(session.startedAt)} – ${formatClock(session.endedAt)}</div>
        </div>
        <div class="log-right">
          <span class="log-duration">${formatDuration(session.actualMinutes)}</span>
          ${overtime > 0 ? `<span class="overtime-pill">+${overtime}m over</span>` : ''}
          <div class="log-actions">
            <button class="edit-btn" title="Edit label" aria-label="Edit session label"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></svg></button>
            <button class="delete-btn" title="Delete session" aria-label="Delete session"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
          </div>
        </div>`;
      el.logList.appendChild(row);

      const labelEl = row.querySelector('.log-label');
      labelEl.addEventListener('dblclick', () => startLogEdit(session, labelEl));
      row.querySelector('.edit-btn').addEventListener('click', () => startLogEdit(session, labelEl));
      row.querySelector('.delete-btn').addEventListener('click', () => {
        state.sessions = state.sessions.filter((s) => s.id !== session.id);
        saveState();
        renderLog();
        renderProgress();
        if (currentView === 'stats') renderStats();
        toast('Session deleted');
      });
    });
  }

  function startLogEdit(session, labelEl) {
    if (labelEl.querySelector('input')) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'log-edit';
    input.maxLength = 120;
    input.value = session.label || '';
    labelEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      if (commit && input.value.trim()) session.label = input.value.trim();
      saveState();
      renderLog();
      if (currentView === 'stats') renderStats();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  /* ---------------- Stats ---------------- */

  function renderStats() {
    const focus = allFocus();
    const today = todayFocus();
    const todayMinutes = today.reduce((sum, s) => sum + (Number(s.actualMinutes) || 0), 0);
    const totalMinutes = focus.reduce((sum, s) => sum + (Number(s.actualMinutes) || 0), 0);

    let streakDay = new Date();
    streakDay.setHours(0, 0, 0, 0);
    if (!sessionsOn(localDateKey(streakDay)).length) streakDay.setDate(streakDay.getDate() - 1);
    let streak = 0;
    while (sessionsOn(localDateKey(streakDay)).length) {
      streak += 1;
      streakDay.setDate(streakDay.getDate() - 1);
    }

    const byDay = {};
    focus.forEach((s) => { byDay[s.day] = (byDay[s.day] || 0) + 1; });
    const bestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];

    const byHour = {};
    focus.forEach((s) => {
      const h = new Date(s.startedAt).getHours();
      byHour[h] = (byHour[h] || 0) + 1;
    });
    const bestHourEntry = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];
    const bestHour = bestHourEntry ? Number(bestHourEntry[0]) : null;
    const onTime = focus.filter((s) => (Number(s.overtimeMinutes) || 0) <= 1).length;
    const onTimePct = focus.length ? Math.round((onTime / focus.length) * 100) : 0;
    const breakPct = focus.length ? Math.min(100, Math.round((state.breaks.length / focus.length) * 100)) : 0;

    // 12-week consistency heatmap, weeks starting on Sunday.
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(end.getDate() - end.getDay() - 77);
    let heat = '';
    for (let i = 0; i < 84; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      if (d > end) { heat += '<span class="heat-cell future"></span>'; continue; }
      const count = sessionsOn(localDateKey(d)).length;
      const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : count <= 6 ? 3 : 4;
      heat += `<span class="heat-cell l${level}" title="${localDateKey(d)}: ${count} pomodoro${count === 1 ? '' : 's'}"></span>`;
    }

    // Last 7 days bar chart.
    let bars = '';
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const count = sessionsOn(localDateKey(d)).length;
      const height = Math.max(3, Math.round((count / Math.max(1, ...Object.values(byDay))) * 88));
      const label = i === 0 ? 'Today' : d.toLocaleDateString([], { weekday: 'short' }).slice(0, 1);
      bars += `<div class="bar-col"><div class="bar${i === 0 ? ' today' : ''}" style="height:${count ? height : 3}px" title="${count} pomodoros"></div><span class="bar-label">${label}</span></div>`;
    }

    const insights = [];
    if (!focus.length) {
      insights.push('<span class="insight-icon">🌱</span><span>Finish your first pomodoro to unlock insights about your focus habits.</span>');
    } else {
      if (bestHour !== null) {
        insights.push(`<span class="insight-icon">⏰</span><span>Your best focus window is <strong>${bestHour}:00–${(bestHour + 1) % 24}:00</strong> — schedule demanding work there.</span>`);
      }
      insights.push(`<span class="insight-icon">🎯</span><span><strong>${onTimePct}%</strong> of your pomodoros finished close to the target time (${onTime} of ${focus.length}).</span>`);
      insights.push(`<span class="insight-icon">☕</span><span>You've logged a break after <strong>${breakPct}%</strong> of your focus sessions.</span>`);
      if (bestDay) {
        const [y, m, d] = bestDay[0].split('-').map(Number);
        const label = new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' });
        insights.push(`<span class="insight-icon">🏆</span><span>Your best day was <strong>${label}</strong> with <strong>${bestDay[1]}</strong> pomodoro${bestDay[1] === 1 ? '' : 's'}.</span>`);
      }
      if (streak > 0) {
        insights.push(`<span class="insight-icon">🔥</span><span>You're on a <strong>${streak}-day</strong> streak. Keep it going!</span>`);
      }
    }

    el.statsContent.innerHTML = `
      <div class="card stats-card">
        <h2>Your focus, at a glance</h2>
        <p class="stats-subtitle">Today and all time, straight from your logged sessions.</p>
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-value">${today.length}/${goal()}</div><div class="stat-label">Today's pomodoros</div><div class="goal-bar"><span style="width:${clamp((today.length / goal()) * 100, 0, 100)}%"></span></div></div>
          <div class="stat-card"><div class="stat-value">${formatDuration(todayMinutes)}</div><div class="stat-label">Focus time today</div></div>
          <div class="stat-card"><div class="stat-value">${streak}</div><div class="stat-label">Day streak</div></div>
        </div>
      </div>
      <div class="card stats-card">
        <h2>Consistency</h2>
        <p class="stats-subtitle">Last 12 weeks — one square per day.</p>
        <div class="heatmap">${heat}</div>
        <div class="heatmap-legend">Less <span class="heat-cell l0"></span><span class="heat-cell l1"></span><span class="heat-cell l2"></span><span class="heat-cell l3"></span><span class="heat-cell l4"></span> More</div>
      </div>
      <div class="card stats-card">
        <h2>This week</h2>
        <p class="stats-subtitle">Pomodoros per day, including today.</p>
        <div class="bars">${bars}</div>
      </div>
      <div class="card stats-card">
        <h2>Insights</h2>
        <p class="stats-subtitle">Patterns worth noticing. ${formatDuration(totalMinutes)} focused in total.</p>
        ${insights.map((i) => `<div class="insight">${i}</div>`).join('')}
      </div>`;
  }

  /* ---------------- Navigation & settings ---------------- */

  function switchView(view) {
    currentView = view;
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

  function openSettings() {
    el.dailyGoal.value = state.settings.goal;
    el.focusMin.value = state.settings.focus;
    el.shortMin.value = state.settings.short;
    el.longMin.value = state.settings.long;
    el.soundToggle.checked = state.settings.sound;
    el.notifyToggle.checked = state.settings.notify;
    el.settingsModal.hidden = false;
    el.dailyGoal.focus();
  }

  el.startBtn.addEventListener('click', () => {
    if (pendingSessionId) { el.captureInput.focus(); return; }
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
  el.closeSettingsBtn.addEventListener('click', () => { el.settingsModal.hidden = true; });
  el.settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    state.settings.goal = clamp(parseInt(el.dailyGoal.value, 10) || 8, 1, 24);
    state.settings.focus = clamp(parseInt(el.focusMin.value, 10) || 25, 1, 180);
    state.settings.short = clamp(parseInt(el.shortMin.value, 10) || 5, 1, 60);
    state.settings.long = clamp(parseInt(el.longMin.value, 10) || 15, 1, 60);
    state.settings.sound = el.soundToggle.checked;
    state.settings.notify = el.notifyToggle.checked;
    if (state.settings.notify && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    el.settingsModal.hidden = true;
    saveState();
    renderTimer();
    renderProgress();
    if (currentView === 'stats') renderStats();
    toast('Settings saved');
  });

  el.settingsModal.addEventListener('mousedown', (e) => {
    if (e.target === el.settingsModal) el.settingsModal.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.settingsModal.hidden) el.settingsModal.hidden = true;
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    if (e.code === 'Space' && currentView === 'timer' && !typing && !e.target.closest('button')) {
      e.preventDefault();
      if (pendingSessionId) el.captureInput.focus();
      else if (state.timer.running) pauseTimer();
      else startTimer();
    }
  });

  /* ---------------- Boot ---------------- */

  function boot() {
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
})();
