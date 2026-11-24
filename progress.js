import { el, state, goal, todayFocus, nextBreakType, longEvery } from './context.js?v=19';

export function renderProgress() {
  const target = goal();
  const completed = todayFocus().length;
  el.doneCount.textContent = completed;
  el.goalCount.textContent = target;
  if (completed > target) {
    el.extraCount.textContent = `+${completed - target}`;
    el.extraCount.hidden = false;
  } else if (completed === target && target > 0) {
    el.extraCount.textContent = 'Goal met';
    el.extraCount.hidden = false;
  } else {
    el.extraCount.textContent = '';
    el.extraCount.hidden = true;
  }

  el.timeline.innerHTML = '';
  for (let i = 1; i <= target; i++) {
    let dotState = 'upcoming';
    if (i <= completed) dotState = 'done';
    else if (i === completed + 1 && state.timer.mode === 'focus') dotState = 'current';
    const dot = document.createElement('span');
    dot.className = `progress-dot ${dotState}`;
    dot.title = `Pomodoro ${i}${dotState === 'done' ? ' — completed today' : ''}`;
    el.timeline.appendChild(dot);

    if (i < target) {
      const type = nextBreakType(i);
      const done = i <= completed;
      const br = document.createElement('span');
      br.className = `progress-break ${type}${done ? ' done' : ''}${i % longEvery() === 0 ? ' cycle-gap' : ''}`;
      br.title = `${type === 'long' ? 'Long' : 'Short'} break`;
      br.setAttribute('aria-hidden', 'true');
      el.timeline.appendChild(br);
    }
  }
}
