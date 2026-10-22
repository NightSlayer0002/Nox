import { cleanText, MODES, sanitizeContext } from '../../shared/character.js';

const KEY = 'nox.memory.v1';
const empty = () => ({ version: 1, name: '', facts: [], history: [], mode: 'companion' });

function parse(raw) {
  if (raw === null || raw === undefined) return empty();
  const saved = JSON.parse(raw);
  if (!saved || saved.version !== 1 || Array.isArray(saved) ||
      typeof saved.name !== 'string' || !Array.isArray(saved.facts) || saved.facts.some(fact => typeof fact !== 'string') ||
      !MODES.includes(saved.mode) || !Array.isArray(saved.history) ||
      saved.history.some(turn => !turn || !['user', 'assistant'].includes(turn.role) || typeof turn.content !== 'string')) {
    throw Error('unreadable-storage');
  }
  const { name, facts, mode } = sanitizeContext(saved);
  return { version: 1, name, facts, mode, history: saved.history.slice(-24).map(turn => ({ role: turn.role, content: cleanText(turn.content, 600) })) };
}

// Storage is injected so this module also works in tests and restricted browsers.
export function createMemory(storage) {
  let state = empty(), lastRaw, rawBackup = null, readError = null, writeError = null;
  const listeners = new Set();
  const persistent = () => !readError && !writeError && typeof storage?.setItem === 'function' && storage?.temporary !== true;
  const crossTabSafe = () => storage?.temporary === true || !globalThis.window || typeof globalThis.navigator?.locks?.request === 'function';
  const changeKey = () => JSON.stringify([state, readError, writeError]);
  function notify(before) {
    if (before !== changeKey()) for (const listener of listeners) {
      try { listener(structuredClone(state)); } catch {}
    }
  }
  function load() {
    let raw;
    try { raw = storage.getItem(KEY); }
    catch { readError = 'storage-unavailable'; return false; }
    rawBackup = typeof raw === 'string' ? raw : null;
    try {
      // Keep unsaved visit changes while the durable bytes are unchanged. A
      // deletion or edit in another tab always replaces that local fallback.
      if (raw !== lastRaw || readError) state = parse(raw);
      lastRaw = raw;
      readError = null;
      return true;
    } catch { readError = 'unreadable-storage'; return false; }
  }
  function refresh() {
    const before = changeKey(), readable = load();
    notify(before);
    return readable;
  }
  function mutate(action) {
    const commit = () => {
      const before = changeKey(), readable = load();
      action();
      let committed = false;
      // Never "repair" unreadable or future data with a cached snapshot.
      if (readable) try {
        const raw = JSON.stringify(state);
        storage.setItem(KEY, raw);
        lastRaw = raw;
        rawBackup = raw;
        writeError = null;
        committed = true;
      } catch { writeError = 'storage-full-or-blocked'; }
      notify(before);
      return committed;
    };
    const locks = globalThis.navigator?.locks;
    if (storage?.temporary !== true && typeof locks?.request === 'function') {
      // The read and write must share the same origin-wide lock. Refreshing
      // before an unlocked write alone still permits interleaved tab writes.
      try {
        return Promise.resolve(locks.request('nox.memory.write', commit)).catch(() => {
          const before = changeKey();
          writeError = 'storage-unavailable';
          notify(before);
          return false;
        });
      } catch {
        const before = changeKey();
        writeError = 'storage-unavailable';
        notify(before);
        return false;
      }
    }
    // Synchronous injected/visit storage needs no realm-local async queue.
    return commit();
  }
  const onStorage = event => {
    if ((event.key === KEY || event.key === null) && (!event.storageArea || event.storageArea === storage)) refresh();
  };
  refresh();
  globalThis.window?.addEventListener('storage', onStorage);

  return {
    get persistent() { return persistent(); },
    get crossTabSafe() { return crossTabSafe(); },
    get status() { return { persistent: persistent(), crossTabSafe: crossTabSafe(), error: readError || writeError, hasStoredData: rawBackup !== null }; },
    snapshot() { refresh(); return structuredClone(state); },
    refresh,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { globalThis.window?.removeEventListener('storage', onStorage); listeners.clear(); },
    setName(name) { return mutate(() => { state.name = cleanText(name, 40); }); },
    setMode(mode) { return mutate(() => { state.mode = sanitizeContext({ mode }).mode; }); },
    remember(fact) {
      const text = cleanText(fact, 120);
      return mutate(() => { if (text && !state.facts.includes(text)) state.facts = [...state.facts, text].slice(-12); });
    },
    addTurn(role, content) {
      if (!['user', 'assistant'].includes(role)) return false;
      return mutate(() => { state.history = [...state.history, { role, content: cleanText(content, 600) }].slice(-24); });
    },
    clear() { return mutate(() => { state = empty(); }); },
    clearHistory() { return mutate(() => { state.history = []; }); },
  };
}
