const directions = {
  companion: 'Speak as a thoughtful young companion. Warm, conversational, understated, with relaxed pauses and dry humor. Avoid an announcer or assistant cadence.',
  director: 'Speak with casual confidence and a wry smile. Conversational timing, lightly sarcastic, never a formal announcer.',
  uncanny: 'Speak quietly with subtle suspense and unhurried pauses. An intimate fictional performance, no shouting and no exaggerated villain voice.',
};
const MAX_AUDIO = 2*1024*1024;

export async function requestSpeech({text,mode='companion'}, {apiKey,voice='cedar',provider='openai',fetchImpl=fetch}={}) {
  if (typeof text !== 'string' || !text.trim() || text.length > 420) throw new Error('Speech needs 1–420 characters.');
  if(!['openai','groq'].includes(provider)) throw new Error('Unknown speech provider.');
  const groq = provider === 'groq';
  const response = await fetchImpl(groq?'https://api.groq.com/openai/v1/audio/speech':'https://api.openai.com/v1/audio/speech', {
    method:'POST', headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},
    signal:AbortSignal.timeout(20000),
    body:JSON.stringify(groq ? {model:'canopylabs/orpheus-v1-english',voice:['troy','austin','daniel','hannah'].includes(voice)?voice:'troy',input:text.trim(),response_format:'wav'} : {model:'gpt-4o-mini-tts',voice:['cedar','marin'].includes(voice)?voice:'cedar',input:text.trim(),instructions:directions[mode]||directions.companion,response_format:'mp3'}),
  });
  if (!response.ok) throw new Error(`Speech provider returned HTTP ${response.status}.`);
  if (!response.headers.get('content-type')?.startsWith('audio/')) throw new Error('Speech provider did not return audio.');
  if (Number(response.headers.get('content-length')) > MAX_AUDIO) throw new Error('Speech audio is too large.');
  const reader=response.body?.getReader(); if(!reader) throw new Error('Speech provider returned no audio.');
  const chunks=[]; let size=0;
  try {
    while(true) {
      const {done,value}=await reader.read(); if(done) break;
      size+=value.length; if(size>MAX_AUDIO) throw new Error('Speech audio is too large.');
      chunks.push(Buffer.from(value));
    }
  } catch(error) { await reader.cancel().catch(()=>{}); throw error; }
  if(!size) throw new Error('Speech provider returned empty audio.');
  return Buffer.concat(chunks);
}
