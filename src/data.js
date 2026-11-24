import {
  state, store, ui, syncElapsed, localDateKey, toast,
  normalizeImported, applyColors
} from './context.js?v=20';

export async function exportData() {
  syncElapsed();
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      settings: { ...state.settings },
      timer: { ...state.timer },
      sessions: [...state.sessions],
      breaks: [...state.breaks]
    }
  };
  const json = JSON.stringify(payload, null, 2);
  const name = `pomotodo-backup-${localDateKey()}.json`;
  try {
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'JSON backup', accept: { 'application/json': ['.json'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      toast('Backup exported');
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    // Fall back to browser download if the file picker fails.
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Backup exported');
}

export async function importData(file) {
  const text = await file.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('That file is not valid JSON'); }
  const next = normalizeImported(parsed);
  store.replaceAll(next);
  ui.pendingSessionId = null;
  applyColors(state.settings);
  toast(`Imported ${state.sessions.length} session${state.sessions.length === 1 ? '' : 's'}`);
}
