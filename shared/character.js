// The contract between a brain and NOX's body. Neither brain can invent powers.
export const MODES = Object.freeze(['companion', 'director', 'uncanny']);
export const EMOTIONS = Object.freeze(['neutral', 'happy', 'curious', 'skeptical', 'sleepy', 'uncanny','annoyed','surprised','shy']);
export const ACTIONS = Object.freeze(['none', 'gravity', 'spotlight', 'orbit', 'echo', 'takeover']);
export const ANSWER_DEPTHS = Object.freeze({
  quick: Object.freeze({characters:420,tokens:900,reasoning:'low'}),
  balanced: Object.freeze({characters:2400,tokens:1800,reasoning:'medium'}),
  deep: Object.freeze({characters:6000,tokens:4000,reasoning:'high'}),
});
export const answerDepth = value => Object.hasOwn(ANSWER_DEPTHS,value) ? value : 'quick';

// Shared by the cloud and explicit demo paths. Memory mutation needs a direct
// request in the current user message; quoted examples and recollections do not.
export function explicitMemoryRequest(message) {
  if(typeof message!=='string')return false;
  const text=message.trim().replace(/[\u2018\u2019]/g,"'");
  if(/\b(?:do\s+not|don't|never)\b(?:\s+\w+){0,6}\s+(?:remember|save|store|retain)\b|\bremember\s+(?:when|what|whether|how|if)\b|\bremember\s+me(?:\s*[?!.]|$)|\bremember\s+(?:our|the)\s+(?:last|previous)\s+(?:conversation|chat)\b/i.test(text))return false;
  return /^(?:nox[,!:]?\s+)?(?:(?:please|can you|could you|would you|i want you to|i'd like you to)\s+)?(?:please\s+)?(?:remember(?:\s+that|\s*:)?|save (?:this|that) (?:to|in) (?:your )?(?:memory|notebook)\s*:?)\s+\S/i.test(text);
}

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

export function normalizePacket(value, depth = 'quick') {
  if (!value || typeof value !== 'object' || typeof value.speech !== 'string' || !value.speech.trim()) {
    throw new TypeError('A character packet needs non-empty speech.');
  }
  return {
    speech: value.speech.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ').trim().slice(0,ANSWER_DEPTHS[answerDepth(depth)].characters),
    emotion: EMOTIONS.includes(value.emotion) ? value.emotion : 'neutral',
    action: ACTIONS.includes(value.action) ? value.action : 'none',
    memory: cleanText(value.memory, 120),
  };
}

export function sanitizeContext(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  let remaining=6000;
  const knowledge=(Array.isArray(value.knowledge)?value.knowledge:[]).slice(0,4).flatMap(note=>{
    if(!note||typeof note!=='object'||remaining<3)return [];
    const id=cleanText(note.id,60),title=cleanText(note.title,100),text=cleanText(note.text,Math.max(0,Math.min(2000,remaining-id.length-title.length)));
    if(!id||!text)return [];
    remaining-=id.length+title.length+text.length;
    return [{id,title,text}];
  });
  return {
    mode: MODES.includes(value.mode) ? value.mode : 'companion',
    ...(Object.hasOwn(value,'depth') ? {depth:answerDepth(value.depth)} : {}),
    name: cleanText(value.name, 40),
    facts: Array.isArray(value.facts) ? value.facts.map(fact => cleanText(fact, 120)).filter(Boolean).slice(-12) : [],
    ...(cleanText(value.summary,1200) ? {summary:cleanText(value.summary,1200)} : {}),
    ...(cleanText(value.bridge,1600) ? {bridge:cleanText(value.bridge,1600)} : {}),
    ...(knowledge.length ? {knowledge} : {}),
    history: Array.isArray(value.history) ? value.history
      .filter(turn => turn && ['user', 'assistant'].includes(turn.role) && typeof turn.content === 'string')
      .slice(-12).map(turn => ({ role: turn.role, content: cleanText(turn.content, 600) })) : [],
  };
}

export function prepareChatRequest(message, context, provider, stream=false) {
  const body = { message, context: sanitizeContext(context) };
  if(typeof provider === 'string') body.provider = cleanText(provider,20);
  if(stream)body.stream=true;
  const encoder = new TextEncoder();
  // Keep the latest message. Drop oldest context if multibyte text fills the budget.
  while (encoder.encode(JSON.stringify(body)).byteLength > 16384) {
    if (body.context.history.length) body.context.history.shift();
    else if (body.context.knowledge?.length) body.context.knowledge.pop();
    else if (body.context.bridge) delete body.context.bridge;
    else if (body.context.facts.length) body.context.facts.shift();
    else if (body.context.summary) delete body.context.summary;
    else break;
  }
  return body;
}
