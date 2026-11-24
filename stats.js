import {
  el, state, allFocus, todayFocus, sessionsOn,
  localDateKey, goal, clamp, formatDuration
} from './context.js?v=19';

export function renderStats() {
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
