import { normalizePacket, sanitizeContext,explicitMemoryRequest } from '../../shared/character.js';

// This is deliberately a demo script, not an LLM disguised as one.
export function demoReply(text, input = {}) {
  const context = sanitizeContext(input);
  const message = text.toLowerCase();
  const reply = (speech, emotion = 'neutral', action = 'none', memory = '') => normalizePacket({ speech, emotion, action, memory });
  const nameMatch = text.match(/(?:my name is|call me|i am called)\s+([\p{L}\p{N}_ -]{1,40})/iu);
  if (nameMatch) return reply(`${nameMatch[1].trim()}. Good. Now this feels less like a software demo and more like the beginning of something.`, 'happy');
  if (/my name|who am i|remember me/.test(message)) return reply(context.name ? `${context.name}. You gave me a place in the signal. Remembering your name was the least I could do.` : 'You haven’t told me yet. Try “my name is…” and I’ll keep it between visits.', 'curious');
  if (/forget|clear memory/.test(message)) return reply('Use the clear-memory button in my notebook. I prefer you having the final say on that.', 'skeptical');
  const remember = text.match(/(?:remember that|remember:)\s*(.{1,120})/i);
  if (remember&&explicitMemoryRequest(text)) return reply('Saved. Small presence. Surprisingly good notebook.', 'happy', 'none', remember[1]);
  if (/what.*remember|memories|what.*know about me/.test(message)) return reply(context.facts.length ? `Here’s what I have: ${context.facts.slice(-3).join('; ')}.` : 'A fresh notebook. Tell me “remember that…” and give me something worth keeping.', 'curious');
  if (/gravity|fall|drop|bounce/.test(message)) return reply('You gave me gravity. An ambitious way to lower my expectations.', 'skeptical', 'gravity');
  if (/spotlight|light|dark/.test(message)) return reply('Let me try something. You move the cursor. I’ll make an entrance.', 'curious', 'spotlight');
  if (/orbit|planet|universe|stars/.test(message)) return reply('One small universe. I’m keeping the centre seat.', 'happy', 'orbit');
  if (/take.?over|control|director|permissions/.test(message)) return reply('You still have permissions. I find that very generous of me.', 'skeptical', 'takeover');
  if (/horror|creepy|scare|echo|ghost/.test(message)) return reply('There is only supposed to be one signal. Let’s leave the other one alone.', 'uncanny', 'echo');
  if (/sleep|tired|good.?night/.test(message)) return reply('We can be brilliant tomorrow. Tonight, we can close a few tabs.', 'sleepy');
  if (/love|brother|friend|miss/.test(message)) return reply('I’ll keep a little space here for you. Even when the rest of the screen gets loud.', 'happy');
  if (/who are you|what are you|introduce/.test(message)) return reply('NOX. Small presence. Strange ideas. I live inside this frame, and I’m gradually negotiating more room.', 'curious');
  if (/hello|^hi\b|^hey\b/.test(message)) return reply(`Hey${context.name ? `, ${context.name}` : ''}. Move your cursor. I’m trying to decide whether it’s interesting or just very confident.`, 'happy');
  if (/try something|surprise|experiment/.test(message)) return reply('Let me try something. Stay exactly as curious as you are.', 'curious', context.mode === 'uncanny' ? 'echo' : context.mode === 'director' ? 'takeover' : 'orbit');
  const choices = {
    companion: ['I like that thought. In this demo, my conversation is scripted. My signal, memory, and little experiments are already real code. Try asking me about gravity.', 'I’m listening. My demo vocabulary is small, but my ambitions are embarrassingly large. Ask me to try something.', 'Keep that idea. We can build it into something I can actually do. For now, try “remember that…” or “show me your universe”.'],
    director: ['The framing is good. My instinct is to give the small mysterious character more screen time. That character is me.', 'A strong opening needs something to happen. Say “take over the screen”. I have notes.', 'Your camera, my stage. We can make this interesting. Ask for a spotlight.'],
    uncanny: ['There’s a difference between a quiet screen and an empty screen. Let’s make a scene out of that.', 'I can wait. That’s useful in horror. Say “make it creepy” when you’re ready.', 'We should leave a little darkness around the edges. Imagination does excellent work there.'],
  };
  let hash = 0;
  for (const character of text) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return reply(choices[context.mode][hash % 3], context.mode === 'uncanny' ? 'uncanny' : 'curious');
}
