import { cleanText, sanitizeContext } from '../../shared/character.js';

// Storage is injected so this module also works in tests and restricted browsers.
export function createMemory(storage) {
  const key = 'nox.memory.v1';
  let state = { version: 1, name: '', facts: [], history: [], mode: 'companion' };
  let persistent = true;
  try {
    const saved = JSON.parse(storage.getItem(key) || 'null');
    if (saved?.version === 1) {
      const context = sanitizeContext(saved);
      state = { version: 1, ...context, history: Array.isArray(saved.history) ? saved.history.filter(turn => turn && ['user', 'assistant'].includes(turn.role) && typeof turn.content === 'string').slice(-24).map(turn => ({ role: turn.role, content: cleanText(turn.content, 600) })) : [] };
    }
  } catch { persistent = false; }

  function save() {
    try { storage.setItem(key, JSON.stringify(state)); persistent = true; }
    catch { persistent = false; }
  }
  return {
    get persistent() { return persistent; },
    snapshot: () => structuredClone(state),
    setName(name) { state.name = cleanText(name, 40); save(); },
    setMode(mode) { state.mode = sanitizeContext({ mode }).mode; save(); },
    remember(fact) {
      const text = cleanText(fact, 120);
      if (text && !state.facts.includes(text)) state.facts = [...state.facts, text].slice(-12);
      save();
    },
    addTurn(role, content) {
      if (!['user', 'assistant'].includes(role)) return;
      state.history = [...state.history, { role, content: cleanText(content, 600) }].slice(-24);
      save();
    },
    clear() { state = { version: 1, name: '', facts: [], history: [], mode: 'companion' }; save(); },
  };
}
