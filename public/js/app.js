import { normalizePacket, prepareChatRequest } from '../../shared/character.js';
import { demoReply } from './brain.js';
import { createMemory } from './memory.js';
import { Stage } from './stage.js';
import { createVoice, createMicrophone } from './voice.js';
import { createCamera } from './camera.js';
import { createRecorder } from './recorder.js';
import { createTurnGate } from './turns.js';

const $ = id => document.getElementById(id);
let disk;
try { disk = localStorage; }
catch { disk = { getItem() { throw new Error('Storage unavailable'); }, setItem() { throw new Error('Storage unavailable'); } }; }
const memory = createMemory(disk);
let mode = memory.snapshot().mode;
let brain = 'demo'; let busy = false;
let ownerToken = '', selectedProvider = '', connectionVersion = 0, connection = {};
const apiHeaders = (token = ownerToken) => ({'content-type':'application/json',...(token ? {authorization:`Bearer ${token}`} : {})});
const turns = createTurnGate();
let lastPacket = { speech: 'Oh. You found me.', emotion: 'curious', action: 'none', memory: '' };
let toastTimer;

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
try {
  const savedMotion = disk.getItem('nox.motion.v1');
  if (savedMotion === 'on' || savedMotion === 'off') stage.setMotion(savedMotion === 'on');
} catch { /* A preference still works for this visit if storage is unavailable. */ }
showMotion(!stage.reduceMotion);
$('motion-button').addEventListener('click', () => {
  stage.setMotion(stage.reduceMotion); showMotion(!stage.reduceMotion);
  try { disk.setItem('nox.motion.v1', stage.reduceMotion ? 'off' : 'on'); } catch { /* Visit-only preference. */ }
});
const voice = createVoice({
  onStart: () => { stage.character.speakingUntil = Infinity; },
  onEnd: () => { stage.character.speakingUntil = stage.time; }, onError: toast,
  requestAudio: async (text,mode,signal) => {
    const response = await fetch('/api/speech',{method:'POST',headers:apiHeaders(),body:JSON.stringify({text,mode}),signal});
    if(!response.ok) {const error=await response.json();throw new Error(error.error||'Natural voice is unavailable.');}
    if(!response.headers.get('content-type')?.startsWith('audio/')) throw new Error('Natural voice did not return audio.');
    const blob=await response.blob(); if(!blob.size || blob.size>2*1024*1024) throw new Error('Natural voice returned invalid audio.');
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
  while ($('conversation').children.length > 32) $('conversation').firstChild.remove();
  $('conversation').scrollTop = $('conversation').scrollHeight;
}

function updateMemory() {
  const state = memory.snapshot();
  $('memory-summary').textContent = state.name ? `He knows you as ${state.name}. ${state.facts.length ? 'A few things worth keeping.' : 'Tell him something worth keeping.'}` : 'A fresh start. Tell him your name.';
  $('memory-facts').replaceChildren();
  state.facts.slice(-4).forEach(fact => { const tag = document.createElement('span'); tag.className = 'fact'; tag.textContent = fact; $('memory-facts').append(tag); });
  if (!memory.persistent) $('memory-summary').textContent += ' Storage is unavailable; this notebook lasts for this visit.';
}

function perform(value, save = true) {
  const packet = normalizePacket(value); lastPacket = packet;
  if (packet.memory) memory.remember(packet.memory);
  if (save) memory.addTurn('assistant', packet.speech);
  addMessage('nox', packet.speech); stage.speak(packet); voice.speak(packet.speech, mode);
  $('mood-label').textContent = packet.emotion.toUpperCase();
  $('packet-view').textContent = JSON.stringify(packet, null, 2); updateMemory();
}

function setBusy(value) {
  busy = value; $('send-button').disabled = value; $('chat-form').setAttribute('aria-busy', value);
  stage.character.activity = value ? 'thinking' : 'idle';
}

async function send(raw) {
  const text = raw.trim(); if (!text || busy) return;
  const version = turns.begin();
  const name = text.match(/(?:my name is|call me|i am called)\s+([\p{L}\p{N}_ -]{1,40})/iu);
  if (name) memory.setName(name[1].trim());
  const context = { ...memory.snapshot(), mode };
  memory.addTurn('user', text); addMessage('user', text); $('message').value = ''; updateMemory();
  setBusy(true); voice.stop(); microphone.stop(); stage.character.emotion = 'curious';
  try {
    let packet;
    if (brain === 'live') {
      const requestController = new AbortController();
      turns.attach(version, requestController);
      const response = await fetch('/api/chat', { method: 'POST', headers: apiHeaders(), body: JSON.stringify(prepareChatRequest(text, context, selectedProvider)), signal: requestController.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The AI connection did not respond.');
      packet = result;
      if (turns.isCurrent(version)) $('brain-status').lastChild.textContent = ' AI CONNECTED';
    } else {
      await new Promise(resolve => setTimeout(resolve, 350));
      packet = demoReply(text, context);
    }
    if (turns.isCurrent(version)) perform(packet);
  } catch (error) {
    if (error.name !== 'AbortError' && turns.isCurrent(version)) { if (brain === 'live') $('brain-status').lastChild.textContent = ' AI ERROR'; addMessage('system', error.message); toast(error.message); }
  } finally { if (turns.isCurrent(version)) { setBusy(false); $('message').focus(); } }
}

const greetings = {
  companion: 'Oh. You found me. I’m NOX. Move your cursor. I have opinions about its confidence.',
  director: 'The lighting is good. The mysterious little character needs more screen time. I’ll handle that.',
  uncanny: 'Leave a little room in the frame. We might need it later.',
};
function setMode(next, greet = true) {
  turns.cancel(); setBusy(false); voice.stop(); microphone.stop();
  mode = next; memory.setMode(mode); stage.setMode(mode); document.body.dataset.persona = mode;
  $('mood-label').textContent = stage.character.emotion.toUpperCase();
  document.querySelectorAll('[data-mode]').forEach(button => { const active = button.dataset.mode === mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
  if (greet) perform({ speech: greetings[mode], emotion: mode === 'uncanny' ? 'uncanny' : mode === 'director' ? 'skeptical' : 'curious', action: 'none', memory: '' });
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
  turns.cancel(); setBusy(false); voice.stop(); microphone.stop();
  if (stage.stopScene(button.dataset.scene)) return;
  perform({ ...experiments[button.dataset.scene], action: button.dataset.scene, memory: '' });
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
  if (enabled) voice.speak(lastPacket.speech, mode);
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
function resetScene() { turns.cancel(); setBusy(false); microphone.stop(); voice.stop(); stage.reset(); }
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
  turns.cancel(); setBusy(false); voice.stop(); memory.clear();
  $('conversation').replaceChildren(); setMode('companion', false); updateMemory();
  perform({ speech: 'A fresh page. Same strange presence. Where do we begin?', emotion: 'curious', action: 'none', memory: '' }, false);
  toast('NOX’s saved name, facts, and conversation have been cleared.');
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

// Restore a small visible history. Memory never needs to hydrate the entire UI.
setMode(mode, false);
const saved = memory.snapshot();
if (saved.history.length) {
  saved.history.slice(-6).forEach(turn => addMessage(turn.role === 'user' ? 'user' : 'nox', turn.content));
  const lastReply = saved.history.findLast(turn => turn.role === 'assistant');
  if (lastReply) { lastPacket = { speech: lastReply.content, emotion: stage.character.emotion, action: 'none', memory: '' }; stage.caption = lastReply.content; }
}
else perform({ speech: greetings[mode], emotion: mode === 'uncanny' ? 'uncanny' : mode === 'director' ? 'skeptical' : 'curious', action: 'none', memory: '' }, false);
updateMemory();

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
  const choices=[{id:'',name:'Offline demo'},...(status.providers||[])];
  $('provider-select').replaceChildren(...choices.map(p=>{const option=document.createElement('option');option.value=p.id;option.textContent=p.name;return option;}));
  if(!status.providers?.some(p=>p.id===selectedProvider)) selectedProvider=status.provider||'';
  $('provider-select').value=selectedProvider;
  $('provider-note').textContent=status.providers?.length?'Switch between configured providers. Models can still reach their free-tier limits.':'Configure GROQ_API_KEY, GEMINI_API_KEY, or NVIDIA_API_KEY on the server. Keys never belong in this page.';
  voice.configureNatural(status.voice==='natural'); $('natural-option').disabled=status.voice!=='natural';
  $('owner-form').hidden=status.access!=='locked'; $('lock-owner').hidden=!ownerToken;
  showConnection();showVoice(); return true;
}
$('provider-select').addEventListener('change',event=>{
  turns.cancel();setBusy(false);voice.stop();microphone.stop();selectedProvider=event.target.value;showConnection();
});
$('voice-engine').addEventListener('change',event=>{voice.setEngine(event.target.value);showVoice();});
$('owner-form').addEventListener('submit',async event=>{
  event.preventDefault();const token=$('owner-token').value.trim();$('owner-token').value='';
  if(!token) return;
  const button=event.currentTarget.querySelector('button');button.disabled=true;
  try {if(await refreshConnection(token)) $('owner-status').textContent='Cloud access is unlocked for this visit.';}
  catch(error){$('owner-status').textContent=error.message;}
  finally {button.disabled=false;}
});
$('lock-owner').addEventListener('click',async()=>{
  turns.cancel();setBusy(false);voice.stop();microphone.stop();ownerToken='';selectedProvider='';
  connectionVersion++;connection={access:'locked',providers:[]};voice.configureNatural(false);showConnection();showVoice();
  $('provider-select').replaceChildren(new Option('Offline demo',''));$('natural-option').disabled=true;
  $('owner-form').hidden=false;$('lock-owner').hidden=true;$('owner-status').textContent='Cloud access is locked.';
  try {await refreshConnection();}catch{toast('Cloud access is locked. Server status is unavailable.');}
});
try {await refreshConnection();}
catch {toast('Server status is unavailable. NOX’s offline demo is still here.');}
