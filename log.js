import {
  el, state, store, dayLabel, formatClock, formatDuration,
  escapeHtml, toast
} from './context.js?v=19';

export function renderLog() {
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
      store.save();
      toast('Session deleted');
    });
  });
}

export function startLogEdit(session, labelEl) {
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
    store.save();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}
