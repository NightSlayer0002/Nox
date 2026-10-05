// The contract between a brain and NOX's body. Neither brain can invent powers.
export const MODES = Object.freeze(['companion', 'director', 'uncanny']);
export const EMOTIONS = Object.freeze(['neutral', 'happy', 'curious', 'skeptical', 'sleepy', 'uncanny']);
export const ACTIONS = Object.freeze(['none', 'gravity', 'spotlight', 'orbit', 'echo', 'takeover']);

export const PACKET_SCHEMA = {
  type: 'object',
  properties: {
    speech: { type: 'string' },
    emotion: { type: 'string', enum: EMOTIONS },
    action: { type: 'string', enum: ACTIONS },
    memory: { type: 'string' },
  },
  required: ['speech', 'emotion', 'action', 'memory'],
  additionalProperties: false,
};

export function cleanText(value, limit) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : '';
}

export function normalizePacket(value) {
  if (!value || typeof value !== 'object' || typeof value.speech !== 'string' || !value.speech.trim()) {
    throw new TypeError('A character packet needs non-empty speech.');
  }
  return {
    speech: cleanText(value.speech, 420),
    emotion: EMOTIONS.includes(value.emotion) ? value.emotion : 'neutral',
    action: ACTIONS.includes(value.action) ? value.action : 'none',
    memory: cleanText(value.memory, 120),
  };
}

export function sanitizeContext(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  return {
    mode: MODES.includes(value.mode) ? value.mode : 'companion',
    name: cleanText(value.name, 40),
    facts: Array.isArray(value.facts) ? value.facts.map(fact => cleanText(fact, 120)).filter(Boolean).slice(-12) : [],
    history: Array.isArray(value.history) ? value.history
      .filter(turn => turn && ['user', 'assistant'].includes(turn.role) && typeof turn.content === 'string')
      .slice(-12).map(turn => ({ role: turn.role, content: cleanText(turn.content, 600) })) : [],
  };
}

export function prepareChatRequest(message, context, provider) {
  const body = { message, context: sanitizeContext(context) };
  if(typeof provider === 'string') body.provider = cleanText(provider,20);
  const encoder = new TextEncoder();
  // Keep the latest message. Drop oldest context if multibyte text fills the budget.
  while (encoder.encode(JSON.stringify(body)).byteLength > 16384) {
    if (body.context.history.length) body.context.history.shift();
    else if (body.context.facts.length) body.context.facts.shift();
    else break;
  }
  return body;
}
