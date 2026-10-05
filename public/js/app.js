import { normalizePacket, prepareChatRequest } from '../../shared/character.js';
import { demoReply } from './brain.js';
import { createMemory } from './memory.js';
import { Stage } from './stage.js';
import { createVoice, createMicrophone } from './voice.js';
import { createCamera } from './camera.js';
import { createRecorder } from './recorder.js';
import { createTurnGate } from './turns.js';
import { createHistory } from './history.js';
import { createNavigation } from './navigation.js';
import { readChatStream } from './stream.js';
import { readMotionPreference } from './preferences.js';

const $ = id => document.getElementById(id);
let disk;
try { disk = localStorage; }
catch { disk = { getItem() { throw new Error('Storage unavailable'); }, setItem() { throw new Error('Storage unavailable'); } }; }
const memory = createMemory(disk);
const history = await createHistory(disk,memory.snapshot().history);
if(history.persistent)memory.clearHistory();
let mode = history.active().mode;
let navigation,summaryController,summaryTimer,pendingDraft;
let brain = 'demo'; let busy = false;
let ownerToken = '', selectedProvider = '', connectionVersion = 0, connection = {};
const apiHeaders = (token = ownerToken) => ({'content-type':'application/json',...(token ? {authorization:`Bearer ${token}`} : {})});
const turns = createTurnGate();
let lastPacket = { speech: 'Oh. You found me.', emotion: 'curious', action: 'none', memory: '' };
let toastTimer;
let preferredEngine='browser';

function toast(text) {
  $('toast').textContent = text; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500);
}

const sceneLabels = { none: 'MOVE YOUR CURSOR. POKE HIM. DRAG HIM.', gravity: 'GRAVITY: ENABLED. DIGNITY: NEGOTIABLE.', spotlight: 'MOVE THE LIGHT. LET HIM FIND IT.', orbit: 'ONE VERY SMALL UNIVERSE.', echo: 'AN AUTHORED SCENE. ANOTHER PRESENCE.', takeover: 'CREATIVE CONTROL: NOX.' };
const stage = new Stage($('stage'), action => {
  $('scene-label').textContent = action === 'none' && document.body.dataset.form === 'core' ? 'DRAG THE CORE. CLICK TO SEND A PULSE.' : sceneLabels[action];
  document.querySelectorAll('[data-scene]').forEach(button => {
    const active = button.dataset.scene === action;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
});
function showMotion(enabled) {
  $('motion-button').setAttribute('aria-pressed', enabled);
  $('motion-button').querySelector('span').textContent = enabled ? 'Motion on' : 'Motion off';
  $('motion-note').textContent = enabled ? 'Gaze, blinks, and a little life.' : 'Still expressions. Dragging stays on.';
}
stage.onMotionChange = showMotion;
stage.setMotion(readMotionPreference(disk));
showMotion(!stage.reduceMotion);
$('motion-button').addEventListener('click', () => {
  stage.setMotion(stage.reduceMotion); showMotion(!stage.reduceMotion);
  try { disk.setItem('nox.motion.v2', stage.reduceMotion ? 'off' : 'on'); } catch { /* Visit-only preference. */ }
});
const voice = createVoice({
  onStart: () => { stage.character.speakingUntil = Infinity; },
  onEnd: () => { stage.character.speakingUntil = stage.time; }, onError: toast,
  requestAudio: async (text,mode,signal,emotion,speaker) => {
    const start=performance.now();
    const response = await fetch('/api/speech',{method:'POST',headers:apiHeaders(),body:JSON.stringify({text,mode,emotion,voice:speaker}),signal});
    if(!response.ok) {const error=await response.json();throw new Error(error.error||'Natural voice is unavailable.');}
    if(!response.headers.get('content-type')?.startsWith('audio/')) throw new Error('Natural voice did not return audio.');
    const blob=await response.blob(); if(!blob.size || blob.size>2*1024*1024) throw new Error('Natural voice returned invalid audio.');
    if(!signal.aborted){$('reply-timing').textContent+=` · voice ${Math.round(performance.now()-start)} ms`;$('reply-timing').dataset.audioCache=response.headers.get('x-nox-audio-cache')||'unknown';}
    return blob;
  },
});
const camera = createCamera();
const recorder = createRecorder($('stage'), (active, clip) => {
  stage.lockRecording(active);
  $('record-button').classList.toggle('recording', active);
  $('record-button').querySelector('span').textContent = active ? 'Stop & save' : 'Record clip';
  $('film-record').textContent = active ? '● Stop & save' : '● Record clip';
  document.body.classList.toggle('recording', active);
  if (clip) {
    $('clip-video').src = clip.url;
    $('save-clip').href = clip.url; $('save-clip').download = clip.filename;
    $('clip-meta').textContent = `${(clip.blob.size / 1024).toFixed(0)} KB · WebM · stage capture · silent`;
    $('clip-dialog').showModal();
  }
});
const microphone = createMicrophone({
  onText: text => { $('message').value = text; send(text); },
  onState: active => {
    $('mic-button').classList.toggle('listening', active); $('mic-button').querySelector('span').textContent = active ? 'Listening…' : 'Talk';
    stage.character.activity = busy ? 'thinking' : active ? 'listening' : 'idle';
  },
  onError: toast,
});

function addMessage(speaker, text) {
  const message = document.createElement('div'); message.className = `message ${speaker}`;
  const label = document.createElement('p'); label.className = 'speaker'; label.textContent = speaker === 'nox' ? 'NOX /' : speaker === 'user' ? 'YOU /' : 'CONNECTION /';
  const content = document.createElement('p'); content.textContent = text;
  message.append(label, content); $('conversation').append(message);
  $('conversation').scrollTop = $('conversation').scrollHeight;
  return message;
}

function updateMemory() {
  const state = memory.snapshot();
  $('memory-summary').textContent = state.name ? `He knows you as ${state.name}. ${state.facts.length ? 'A few things worth keeping.' : 'Tell him something worth keeping.'}` : 'A fresh start. Tell him your name.';
  $('memory-facts').replaceChildren();
  state.facts.slice(-4).forEach(fact => { const tag = document.createElement('span'); tag.className = 'fact'; tag.textContent = fact; $('memory-facts').append(tag); });
  if (!memory.persistent) $('memory-summary').textContent += ' Storage is unavailable; this notebook lasts for this visit.';
}

async function perform(value, save = true, draft, version) {
  const packet = normalizePacket(value); lastPacket = packet;
  if (packet.memory) memory.remember(packet.memory);
  if (save && !await history.append('assistant', packet.speech)) return;
  if(version!==undefined&&!turns.isCurrent(version))return;
  if(draft){draft.classList.remove('draft');draft.lastChild.textContent=packet.speech;}else addMessage('nox', packet.speech);
  stage.speak(packet);voice.speak(packet.speech, mode, packet.emotion);
  $('mood-label').textContent = packet.emotion.toUpperCase();
  $('packet-view').textContent = JSON.stringify(packet, null, 2); updateMemory();navigation?.render();
}

function setBusy(value) {
  busy = value; $('send-button').disabled = value; $('chat-form').setAttribute('aria-busy', value);
  stage.character.activity = value ? 'thinking' : 'idle';
}

async function send(raw) {
  const text = raw.trim(); if (!text || busy) return;
  const version = turns.begin();
  summaryController?.abort();clearTimeout(summaryTimer);
  const name = text.match(/(?:my name is|call me|i am called)\s+([\p{L}\p{N}_ -]{1,40})/iu);
  if (name) memory.setName(name[1].trim());
  const context = { ...memory.snapshot(), ...history.context(), mode };
  setBusy(true);
  if(!await history.append('user',text)){cancelConversation();await restoreConversation();toast('This conversation changed in another tab. Start a new thought.');return;}
  if(!turns.isCurrent(version))return;
  addMessage('user', text); $('message').value = ''; updateMemory();navigation?.render();
  $('reply-timing').textContent=brain==='live'?'NOX is thinking…':'Offline demo';
  setBusy(true); voice.stop(); microphone.stop(); stage.character.emotion = 'curious';
  try {
    let packet;
    if (brain === 'live') {
      const requestController = new AbortController();
      turns.attach(version, requestController);
      const draft=addMessage('nox','');draft.classList.add('draft');pendingDraft=draft;
      const response = await fetch('/api/chat', { method: 'POST', headers: apiHeaders(), body: JSON.stringify(prepareChatRequest(text, context, selectedProvider,true)), signal: requestController.signal });
      if(!response.ok){const error=await response.json();throw new Error(error.error||'The AI connection did not respond.');}
      const result = await readChatStream(response,speech=>{if(turns.isCurrent(version)){draft.lastChild.textContent=speech;$('conversation').scrollTop=$('conversation').scrollHeight;}});
      packet = result;
      if (turns.isCurrent(version)) {$('brain-status').lastChild.textContent = ' AI CONNECTED';const timing=result.metrics;$('reply-timing').textContent=timing?`${timing.firstTextMs===null?'Reply':`First words ${timing.firstTextMs} ms · reply`} ${timing.totalMs} ms · ${timing.provider}`:'Reply received';}
    } else {
      await new Promise(resolve => setTimeout(resolve, 350));
      packet = demoReply(text, context);
    }
    if (turns.isCurrent(version)) {await perform(packet,true,pendingDraft,version);if(turns.isCurrent(version)){pendingDraft=null;scheduleSummary();}}
  } catch (error) {
    if (turns.isCurrent(version)){pendingDraft?.remove();pendingDraft=null;if(error.name!=='AbortError'){if (brain === 'live') $('brain-status').lastChild.textContent = ' AI ERROR'; addMessage('system', error.message); toast(error.message);$('reply-timing').textContent='Reply interrupted. Your sent message is saved.';}}
  } finally { if (turns.isCurrent(version)) { setBusy(false); $('message').focus(); } }
}

const greetings = {
  companion: 'Oh. You found me. I’m NOX. Move your cursor. I have opinions about its confidence.',
  director: 'The lighting is good. The mysterious little character needs more screen time. I’ll handle that.',
  uncanny: 'Leave a little room in the frame. We might need it later.',
};
async function setMode(next, greet = true) {
  cancelConversation();
  const version=turns.begin();if(!await history.setMode(next)||!turns.isCurrent(version))return;
  mode = next; memory.setMode(mode); stage.setMode(mode); document.body.dataset.persona = mode;
  $('mood-label').textContent = stage.character.emotion.toUpperCase();
  document.querySelectorAll('[data-mode]').forEach(button => { const active = button.dataset.mode === mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
  if (greet) await perform({ speech: greetings[mode], emotion: mode === 'uncanny' ? 'uncanny' : mode === 'director' ? 'skeptical' : 'curious', action: 'none', memory: '' },false,undefined,version);
}

const experiments = {
  gravity: { speech: 'You gave me gravity. An ambitious way to lower my expectations.', emotion: 'skeptical' },
  spotlight: { speech: 'Let me try something. You move the light. I’ll make an entrance.', emotion: 'curious' },
  orbit: { speech: 'One small universe. I’m keeping the centre seat.', emotion: 'happy' },
  echo: { speech: 'There is only supposed to be one signal. Let’s leave the other one alone.', emotion: 'uncanny' },
  takeover: { speech: 'You still have permissions. I find that very generous of me.', emotion: 'skeptical' },
};
document.querySelectorAll('[data-scene]').forEach(button => button.addEventListener('click', () => {
  // Scene buttons are authored performances in either brain mode.
  cancelConversation();
  if (stage.stopScene(button.dataset.scene)) return;
  const version=turns.begin();void perform({ ...experiments[button.dataset.scene], action: button.dataset.scene, memory: '' },false,undefined,version);
}));
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('button[data-form]').forEach(button => button.addEventListener('click', () => {
  stage.dragging = false; document.body.dataset.form = button.dataset.form; stage.setForm(button.dataset.form);
  document.querySelectorAll('button[data-form]').forEach(control => control.setAttribute('aria-pressed', control.dataset.form === stage.form));
  $('stage').setAttribute('aria-label', stage.form === 'face' ? 'Animated NOX face. Move the cursor to look around. Click to make him smile, double-click or press Space to wink. Drag or use arrow keys to move him.' : 'Animated NOX signal core. Move the cursor for parallax, click or press Space for a pulse. Drag or use arrow keys to move the core.');
}));
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => send(button.dataset.prompt)));
$('chat-form').addEventListener('submit', event => { event.preventDefault(); send($('message').value); });
$('message').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(event.currentTarget.value); } });
$('voice-button').addEventListener('click', () => {
  const enabled = voice.setEnabled(!voice.enabled);
  showVoice();
  try{disk.setItem('nox.voice.v2',enabled?'on':'off');}catch{}
  if (enabled) voice.speak(lastPacket.speech, mode,lastPacket.emotion);
  else if (!voice.supported) toast('Speech synthesis is unavailable in this browser. You can read NOX’s captions.');
});
$('mic-button').addEventListener('click', () => { if (busy) { toast('Let NOX finish this thought first.'); return; } voice.stop(); microphone.start(); });
$('camera-button').addEventListener('click', async () => {
  const button = $('camera-button'); button.disabled = true;
  try {
    if (camera.active) { camera.stop(); stage.camera = null; }
    else { stage.camera = await camera.start(); toast('Camera preview is local. NOX’s model receives your text, not these frames.'); }
    button.setAttribute('aria-pressed', camera.active);
    button.querySelector('span').textContent = camera.active ? 'Camera on' : 'Camera';
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
});
function resetScene() { cancelConversation();stage.reset(); }
$('reset-button').addEventListener('click', resetScene);
$('intensity').addEventListener('input', event => {
  const value = Number(event.currentTarget.value);
  stage.character.intensity = value / 100; $('intensity-value').value = String(value);
});
function toggleFilm() {
  if (recorder.active) { toast('Save your recording before changing the frame size.'); return; }
  const active = document.body.classList.toggle('film');
  $('exit-film').hidden = !active; $('film-button').setAttribute('aria-pressed', active);
  stage.resize();
}
$('film-button').addEventListener('click', toggleFilm); $('exit-film').addEventListener('click', toggleFilm);
function toggleRecording() {
  try {
    if (recorder.active) recorder.stop();
    else { recorder.start(); toast('Recording the stage and captions. This export is silent. Stops automatically after 60 seconds.'); }
  } catch (error) { toast(error.message); }
}
$('record-button').addEventListener('click', toggleRecording);
$('film-record').addEventListener('click', toggleRecording);
$('clear-memory').addEventListener('click', () => {
  cancelConversation();memory.clear();
  updateMemory();toast('The saved name and notebook facts are cleared. Conversations remain in your Library.');
});
$('inside-button').addEventListener('click', () => { $('packet-view').textContent = JSON.stringify(lastPacket, null, 2); $('inside-dialog').showModal(); });
$('settings-button').addEventListener('click', () => $('inside-dialog').showModal());
$('close-inside').addEventListener('click', () => $('inside-dialog').close());
$('close-clip').addEventListener('click', () => { $('clip-video').pause(); $('clip-dialog').close(); });
$('inside-dialog').addEventListener('click', event => { if (event.target === $('inside-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
document.addEventListener('keydown', event => {
  if ($('inside-dialog').open || $('clip-dialog').open) return;
  if (event.key === 'Escape') { resetScene(); if (document.body.classList.contains('film') && !recorder.active) toggleFilm(); return; }
  if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
  if (event.key.toLowerCase() === 'f') toggleFilm();
  if (event.key.toLowerCase() === 'r') toggleRecording();
});
window.addEventListener('pagehide', () => { ownerToken=''; camera.stop(); voice.stop(); microphone.stop(); });
setInterval(() => { const seconds = Math.floor(stage.time); $('stage-time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }, 1000);
setInterval(() => {
  const signal = stage.character.signal;
  if (document.body.dataset.signal !== signal.status) {
    document.body.dataset.signal = signal.status; $('signal-state').textContent = signal.status.toUpperCase();
  }
  $('signal-level').style.width = `${Math.round(signal.energy * 100)}%`;
  $('stage').dataset.renderer = stage.form === 'face' ? 'canvas-face' : stage.character.renderer?.available ? 'webgl' : 'canvas-core';
  $('stage').dataset.form = stage.form;
  $('stage').dataset.gazeX = (stage.character.gazeX ?? stage.character.focus?.x ?? 0).toFixed(2);
  $('stage').dataset.gazeY = (stage.character.gazeY ?? stage.character.focus?.y ?? 0).toFixed(2);
}, 120);

function cancelConversation(){turns.cancel();setBusy(false);voice.stop();microphone.stop();summaryController?.abort();clearTimeout(summaryTimer);pendingDraft?.remove();pendingDraft=null;}
async function restoreConversation(){cancelConversation();const thread=history.active();await setMode(thread.mode,false);if(history.active().id!==thread.id)return;$('conversation').replaceChildren();$('chat-title').textContent=thread.title==='New conversation'?"Let's wander a little.":thread.title;
  thread.turns.forEach(turn=>addMessage(turn.role==='user'?'user':'nox',turn.content));
  const last=thread.turns.findLast(t=>t.role==='assistant');lastPacket={speech:last?.content||greetings[mode],emotion:stage.character.emotion,action:'none',memory:''};if(last){stage.caption=last.content;stage.captionUntil=stage.time+8;}else{addMessage('nox',greetings[mode]);stage.caption='A fresh thought. I’m listening.';stage.captionUntil=stage.time+8;}
  $('reply-timing').textContent='';$('summary-note').textContent=thread.summary?'Older context is summarized. Your full transcript is kept in the Library.':'';navigation?.render();updateMemory();
}
function scheduleSummary(){clearTimeout(summaryTimer);if(brain!=='live'||!history.summaryWork()||selectedProvider==='openai')return;summaryTimer=setTimeout(async()=>{
  const work=history.summaryWork();if(!work||busy)return;const controller=new AbortController();summaryController=controller;
  try{const response=await fetch('/api/summary',{method:'POST',headers:apiHeaders(),body:JSON.stringify({previous:work.previous,turns:work.turns,provider:selectedProvider}),signal:controller.signal});if(!response.ok)throw Error('summary');const result=await response.json();if(!controller.signal.aborted&&await history.applySummary(work.id,work.through,result.summary)&&history.active().id===work.id)$('summary-note').textContent='Older context is summarized. Your full transcript is kept in the Library.';}
  catch(error){if(error.name!=='AbortError'&&history.active().id===work.id)$('summary-note').textContent='Summary will retry after a later turn. The full transcript is still saved.';}
  finally{if(summaryController===controller)summaryController=null;}
},3000);}
navigation=createNavigation({history,onOpen:async id=>{cancelConversation();const selected=await history.select(id);await restoreConversation();if(!selected)toast('That conversation was removed in another tab.');},onNew:async()=>{cancelConversation();await history.create();await restoreConversation();},onStart:async(text,persona)=>{await setMode(persona,false);await send(text);}});
history.subscribe(({currentChanged})=>{if(currentChanged)void restoreConversation();else navigation.render();});
await restoreConversation();

function showVoice() {
  $('voice-button').setAttribute('aria-pressed',voice.enabled);
  $('voice-button').querySelector('span').textContent=voice.enabled?'Voice on':'Voice off';
  $('voice-engine').value=voice.engine;
  $('voice-note').textContent=voice.engine==='natural'?'This is an AI-generated voice. Each reply uses your configured speech provider’s quota.':'Browser voice is free. Quality depends on the voices available on your device.';
}
function showConnection() {
  const provider=connection.providers?.find(p=>p.id===selectedProvider);
  brain=provider && connection.brain==='live'?'live':'demo';
  $('brain-status').lastChild.textContent=brain==='live'?` ${provider.name.toUpperCase()}`:connection.access==='locked'?' OWNER LOCKED':' OFFLINE DEMO';
  $('brain-status').title=brain==='live'?`Configured model: ${provider.model}. Send a message to exercise the connection.`:'This is a scripted offline demo until a server key is configured and cloud access is unlocked.';
  $('brain-note').textContent=brain==='live'?`Model-generated replies · ${provider.name}. Your name, notebook, and recent conversation are sent with each turn. Camera stays local.`:connection.access==='locked'?'Cloud AI is owner-protected. Unlock it in Settings; the offline demo and scenes remain available.':'Offline demo. Add a server API key to give NOX fresh, model-generated conversation.';
  $('inspector-brain').textContent=brain==='live'?`${provider.model} · providers.mjs`:'Offline demo · brain.js';
}
async function refreshConnection(token = ownerToken) {
  const version=++connectionVersion;
  const response=await fetch('/api/status',{headers:apiHeaders(token)});
  if(!response.ok) throw new Error('Server status is unavailable.');
  const status=await response.json();
  if(version!==connectionVersion) return false;
  if(token && status.access==='locked') throw new Error('The owner token was not accepted.');
  ownerToken=token; connection=status;
  const configured=status.providers||[];
  const choices=[{id:'',name:'Offline demo'},...['groq','nvidia','gemini'].map(id=>configured.find(p=>p.id===id)||{id,name:({groq:'GroqCloud',nvidia:'NVIDIA NIM',gemini:'Google Gemini'}[id])+` · ${status.access==='locked'?'unlock first':'add key'}`,disabled:true}),...configured.filter(p=>!['groq','nvidia','gemini'].includes(p.id))];
  $('provider-select').replaceChildren(...choices.map(p=>{const option=document.createElement('option');option.value=p.id;option.textContent=p.name;option.disabled=!!p.disabled;return option;}));
  if(!status.providers?.some(p=>p.id===selectedProvider)) selectedProvider=status.provider||'';
  $('provider-select').value=selectedProvider;
  $('provider-note').textContent=status.providers?.length?'Switch between configured providers. Models can still reach their free-tier limits.':'Configure GROQ_API_KEY, GEMINI_API_KEY, or NVIDIA_API_KEY on the server. Keys never belong in this page.';
  voice.configureNatural(status.voice==='natural'); $('natural-option').disabled=status.voice!=='natural';
  voice.setEngine(preferredEngine);
  try{voice.setEnabled(disk.getItem('nox.voice.v2')!=='off');}catch{voice.setEnabled(true);}
  $('owner-form').hidden=status.access!=='locked'; $('lock-owner').hidden=!ownerToken;
  showConnection();showVoice(); return true;
}
$('provider-select').addEventListener('change',event=>{
  cancelConversation();selectedProvider=event.target.value;showConnection();
});
$('voice-engine').addEventListener('change',event=>{preferredEngine=event.target.value;voice.setEngine(preferredEngine);try{disk.setItem('nox.voice.engine.v1',preferredEngine);}catch{}showVoice();});
$('owner-form').addEventListener('submit',async event=>{
  event.preventDefault();const token=$('owner-token').value.trim();$('owner-token').value='';
  if(!token) return;
  const button=event.currentTarget.querySelector('button');button.disabled=true;
  try {if(await refreshConnection(token)) $('owner-status').textContent='Cloud access is unlocked for this visit.';}
  catch(error){$('owner-status').textContent=error.message;}
  finally {button.disabled=false;}
});
$('lock-owner').addEventListener('click',async()=>{
  cancelConversation();ownerToken='';selectedProvider='';
  connectionVersion++;connection={access:'locked',providers:[]};voice.configureNatural(false);showConnection();showVoice();
  $('provider-select').replaceChildren(new Option('Offline demo',''));$('natural-option').disabled=true;
  $('owner-form').hidden=false;$('lock-owner').hidden=true;$('owner-status').textContent='Cloud access is locked.';
  try {await refreshConnection();}catch{toast('Cloud access is locked. Server status is unavailable.');}
});
function browserVoices(){const voices=globalThis.speechSynthesis?.getVoices().filter(v=>v.lang?.startsWith('en'))||[];const selected=$('browser-speaker').value;$('browser-speaker').replaceChildren(new Option('Automatic',''),...voices.map(v=>new Option(v.name,v.name)));$('browser-speaker').value=selected||savedBrowserVoice;}
let savedBrowserVoice='';
try{preferredEngine=disk.getItem('nox.voice.engine.v1')||'browser';$('speaker-select').value=disk.getItem('nox.voice.speaker.v1')||'austin';savedBrowserVoice=disk.getItem('nox.voice.browser.v1')||'';}catch{}
voice.setSpeaker($('speaker-select').value);voice.setBrowserVoice(savedBrowserVoice);browserVoices();globalThis.speechSynthesis?.addEventListener('voiceschanged',browserVoices);
$('speaker-select').addEventListener('change',e=>{voice.setSpeaker(e.target.value);try{disk.setItem('nox.voice.speaker.v1',e.target.value);}catch{}});
$('browser-speaker').addEventListener('change',e=>{savedBrowserVoice=e.target.value;voice.setBrowserVoice(savedBrowserVoice);try{disk.setItem('nox.voice.browser.v1',savedBrowserVoice);}catch{}});
$('replay-voice').addEventListener('click',()=>{if(!voice.enabled)toast('Turn Voice on to hear this reply.');else voice.speak(lastPacket.speech,mode,lastPacket.emotion);});
$('test-voice').addEventListener('click',()=>{voice.setEnabled(true);showVoice();voice.speak('Oh, you found me. I was just thinking about something strange. Want to hear it?',mode,mode==='uncanny'?'uncanny':'happy');});
try{voice.setEnabled(disk.getItem('nox.voice.v2')!=='off');}catch{voice.setEnabled(true);}showVoice();
try {await refreshConnection();}
catch {toast('Server status is unavailable. NOX’s offline demo is still here.');}
