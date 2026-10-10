import { normalizePacket, prepareChatRequest,explicitMemoryRequest } from '../../shared/character.js';
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
import { connectionState } from './connection.js';
import { EXPRESSIONS } from './face-art.js';
import { knowledge,readDepth,saveDepth } from './workbench.js';
import { spokenPreview } from './reply.js';
import {sourceBackground} from './source-background.js';
import { afterimageBridge, applyAfterimageCue } from './afterimage-bridge.js';

const $ = id => document.getElementById(id);
let disk;
try { disk = localStorage; }
catch { disk = { getItem() { throw new Error('Storage unavailable'); }, setItem() { throw new Error('Storage unavailable'); } }; }
const memory = createMemory(disk);
const history = await createHistory(disk,memory.snapshot().history);
if(history.persistent)memory.clearHistory();
let mode = history.active().mode;
let navigation,summaryController,summaryTimer,pendingDraft;
let brain = 'loading'; let busy = false;
let ownerToken = '', selectedProvider = '', connectionVersion = 0, connection = {};
const apiHeaders = (token = ownerToken) => ({'content-type':'application/json',...(token ? {authorization:`Bearer ${token}`} : {})});
const turns = createTurnGate();
let lastPacket = { speech: 'Oh. You found me.', emotion: 'curious', action: 'none', memory: '' };
let toastTimer;
let preferredEngine='natural';
let afterimageDriving=false;

function toast(text) {
  $('toast').textContent = text; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500);
}

const sceneLabels = { none: 'MOVE YOUR CURSOR. POKE HIM. DRAG HIM.', gravity: 'GRAVITY: ENABLED. DIGNITY: NEGOTIABLE.', spotlight: 'MOVE THE LIGHT. LET HIM FIND IT.', orbit: 'ONE VERY SMALL UNIVERSE.', echo: 'AN AUTHORED SCENE. ANOTHER PRESENCE.', takeover: 'CREATIVE CONTROL: NOX.' };
const stage = new Stage($('stage'), action => {
  if(!afterimageDriving)afterimageBridge.stop('scene-change');
  $('scene-label').textContent = action === 'none' && document.body.dataset.form === 'core' ? 'DRAG THE CORE. CLICK TO SEND A PULSE.' : sceneLabels[action];
  document.querySelectorAll('[data-scene]').forEach(button => {
    const active = button.dataset.scene === action;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
});
sourceBackground.subscribe(canvas=>stage.setBackgroundSource(canvas));
for(const expression of Object.keys(EXPRESSIONS)){
  const option=document.createElement('option');option.value=expression;option.textContent=expression==='pout'?'Cute outrage':expression[0].toUpperCase()+expression.slice(1);$('expression-preview').append(option);
}
$('preview-expression').addEventListener('click',()=>{
  if(stage.form==='core'){toast('Choose Presence or Liquid Metal to try his expressions.');return;}
  stage.character.preview($('expression-preview').value,stage.time);
  stage.canvas.scrollIntoView({behavior:stage.reduceMotion?'instant':'smooth',block:'center'});
});
// The owner chose always-on NOX animation. There is no website motion switch.
stage.setMotion(true);
const voice = createVoice({
  onStart: () => { stage.character.speakingUntil = Infinity; },
  onEnd: () => { stage.character.speakingUntil = stage.time; }, onError: toast,
  requestAudio: async (text,mode,signal,emotion,speaker,speechCues) => {
    const start=performance.now();
    const response = await fetch('/api/speech',{method:'POST',headers:apiHeaders(),body:JSON.stringify({text,mode,emotion,voice:speaker,...(speechCues?{speechCues}:{})}),signal});
    if(!response.ok) {const error=await response.json();throw new Error(error.error||'Natural voice is unavailable.');}
    if(!response.headers.get('content-type')?.startsWith('audio/')) throw new Error('Natural voice did not return audio.');
    const blob=await response.blob(); if(!blob.size || blob.size>2*1024*1024) throw new Error('Natural voice returned invalid audio.');
    if(!signal.aborted&&afterimageBridge.snapshot().status!=='playing'){$('reply-timing').textContent+=` · voice ${Math.round(performance.now()-start)} ms`;$('reply-timing').dataset.audioCache=response.headers.get('x-nox-audio-cache')||'unknown';}
    return blob;
  },
});
stage.onBeforeFrame=()=>{stage.character.mouthLevel=voice.mouthLevel;};
const camera = createCamera();
const recorder = createRecorder($('stage'), (active, clip) => {
  stage.lockRecording(active);
  stage.character.react?.(active?'excited':'content',stage.time,2);
  $('record-button').classList.toggle('recording', active);
  $('record-button').querySelector('span').textContent = active ? 'Stop & save' : 'Record clip';
  $('film-record').textContent = active ? '● Stop & save' : '● Record clip';
  document.body.classList.toggle('recording', active);
  if(active)afterimageBridge.refreshState();else afterimageBridge.recordingEnded();
  if (clip) {
    $('clip-video').src = clip.url;
    $('save-clip').href = clip.url; $('save-clip').download = clip.filename;
    $('clip-meta').textContent = `${(clip.blob.size / 1024).toFixed(0)} KB · WebM · ${clip.audio?'NOX audio track':'video only'}`;
    $('clip-dialog').showModal();
  }
},{getAudioStream:()=>voice.prepareCapture()});
const microphone = createMicrophone({
  onText: text => { $('message').value = text; send(text); },
  onState: active => {
    $('mic-button').classList.toggle('listening', active); $('mic-button').querySelector('span').textContent = active ? 'Listening…' : 'Talk';
    stage.character.activity = busy ? 'thinking' : active ? 'listening' : 'idle';
  },
  onError: toast,
});

afterimageBridge.connect({
  async receive({seed,tone,variation,signal}) {
    const state=connectionState(connection,selectedProvider);
    if(state.kind!=='live')throw new Error(state.kind==='locked'?'Unlock AI in Preferences to receive a transmission.':state.kind==='demo'?'Choose a configured AI provider, or open the authored first contact.':'A configured AI connection is required to receive a transmission.');
    const body={seed,tone,...(variation===undefined?{}:{variation}),...(selectedProvider?{provider:selectedProvider}:{})};
    const response=await fetch('/api/afterimage',{method:'POST',headers:apiHeaders(),body:JSON.stringify(body),signal});
    if(!response.ok){const error=await response.json();if(response.status===401&&!signal.aborted)await refreshConnection();throw new Error(error.error||'The transmission could not be received.');}
    return response.json();
  },
  cue(value) {
    afterimageDriving=true;
    try{const cue=applyAfterimageCue(stage,value);$('mood-label').textContent=cue.emotion.toUpperCase();}
    finally{afterimageDriving=false;}
  },
  speak: (script,emotion,cues) => voice.speak(script,mode,emotion,cues),
  stop() {
    voice.stop();stage.character.speakingUntil=stage.time;stage.captionUntil=0;
    afterimageDriving=true;try{stage.reset(false);}finally{afterimageDriving=false;}
  },
  record:toggleRecording,
  startRecording:() => recorder.start(),
  stopRecording:() => recorder.stop(),
  setVoice(value){voice.setEnabled(value);showVoice();try{disk.setItem('nox.voice.v2',voice.enabled?'on':'off');}catch{}},
  getState:() => ({voiceEnabled:voice.enabled,recording:recorder.active,recordSupported:recorder.supported,connection:connectionState(connection,selectedProvider)}),
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

async function perform(value, save = true, draft, version, depth='quick',rememberAllowed=false) {
  const packet = normalizePacket(value,depth); lastPacket = packet;
  if (packet.memory&&rememberAllowed) memory.remember(packet.memory);
  if (save && !await history.append('assistant', packet.speech)) return;
  if(version!==undefined&&!turns.isCurrent(version))return;
  if(draft){draft.classList.remove('draft');draft.lastChild.textContent=packet.speech;}else addMessage('nox', packet.speech);
  const spoken=spokenPreview(packet.speech);stage.speak({...packet,speech:spoken});voice.speak(spoken, mode, packet.emotion);
  if(packet.action==='takeover')stage.canvas.scrollIntoView({behavior:stage.reduceMotion?'instant':'smooth',block:'center'});
  $('mood-label').textContent = packet.emotion.toUpperCase();
  $('packet-view').textContent = JSON.stringify(value.metrics?{...packet,metrics:value.metrics}:packet, null, 2); updateMemory();navigation?.render();
}

function setBusy(value) {
  busy = value; $('send-button').disabled = value; $('chat-form').setAttribute('aria-busy', value);
  $('cancel-reply').hidden=!value;$('reply-depth').disabled=value;
  stage.character.activity = value ? 'thinking' : 'idle';
}

async function send(raw) {
  const text = raw.trim(); if (!text || busy) return;
  afterimageBridge.stop('conversation');
  const takeover=/^(?:please\s+)?(?:take\s*over(?:\s+(?:the\s+)?(?:screen|stage))?|takeover)[.!]?$/i.test(text);
  if(!['live','demo'].includes(brain)){
    if(takeover)stage.run('takeover');
    toast(brain==='locked'?'Unlock AI in Preferences to talk with NOX. Your thought is still here.':'NOX’s AI connection is not ready. Check Preferences; your thought is still here.');
    $('inside-dialog').showModal();if(brain==='locked')$('owner-token').focus();return;
  }
  const version = turns.begin();
  summaryController?.abort();clearTimeout(summaryTimer);
  const name = text.match(/(?:my name is|call me|i am called)\s+([\p{L}\p{N}_ -]{1,40})/iu);
  if (name) memory.setName(name[1].trim());
  const depth=$('reply-depth').value;
  const context = { ...memory.snapshot(), ...history.context(), mode,depth,knowledge:knowledge.context(text) };
  const request=prepareChatRequest(text,context,selectedProvider,true);
  setBusy(true);
  if(!await history.append('user',text)){cancelConversation();await restoreConversation();toast('This conversation changed in another tab. Start a new thought.');return;}
  if(!turns.isCurrent(version))return;
  addMessage('user', text); $('message').value = ''; contextPreview();updateMemory();navigation?.render();
  $('reply-timing').textContent=brain==='live'?'NOX is thinking…':'Scripted demo · no AI request';
  setBusy(true); voice.stop(); microphone.stop(); stage.character.emotion = 'curious';
  try {
    let packet;
    if (brain === 'live') {
      const requestController = new AbortController();
      turns.attach(version, requestController);
      const draft=addMessage('nox','');draft.classList.add('draft');pendingDraft=draft;
      const response = await fetch('/api/chat', { method: 'POST', headers: apiHeaders(), body: JSON.stringify(request), signal: requestController.signal });
      if(!response.ok){const error=await response.json();if(response.status===401){await refreshConnection();}throw new Error(error.error||'The AI connection did not respond.');}
      const result = await readChatStream(response,speech=>{if(turns.isCurrent(version)){draft.lastChild.textContent=speech;$('conversation').scrollTop=$('conversation').scrollHeight;}});
      packet = result;
      if (turns.isCurrent(version)) {$('brain-status').lastChild.textContent = ' AI CONNECTED';const timing=result.metrics;$('reply-timing').textContent=timing?`${timing.firstTextMs===null?'Reply':`First words ${timing.firstTextMs} ms · reply`} ${timing.totalMs} ms · ${timing.provider}`:'Reply received';if(timing){$('reply-timing').dataset.model=timing.model||'';$('reply-timing').dataset.depth=timing.depth||depth;$('inspector-brain').textContent=`${timing.model||'Configured model'} · ${timing.depth||depth} · ${timing.provider}`;}}
    } else {
      await new Promise(resolve => setTimeout(resolve, 350));
      packet = demoReply(text, context);
    }
    if (turns.isCurrent(version)) {if(takeover)packet={...packet,action:'takeover'};const draft=pendingDraft;await perform(packet,true,draft,version,depth,explicitMemoryRequest(text));if(turns.isCurrent(version)){if(brain==='live'&&request.context.knowledge?.length&&draft){const sources=document.createElement('p');sources.className='knowledge-sources';sources.textContent='Context included: '+request.context.knowledge.map(n=>`[${n.id}] ${n.title}`).join(' · ');draft.append(sources);}pendingDraft=null;scheduleSummary();}}
  } catch (error) {
    if (turns.isCurrent(version)){pendingDraft?.remove();pendingDraft=null;if(error.name!=='AbortError'){stage.character.react?.('worried',stage.time,2);if (brain === 'live') $('brain-status').lastChild.textContent = ' AI ERROR'; addMessage('system', error.message); toast(error.message);$('reply-timing').textContent='Reply interrupted. Your sent message is saved.';}}
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
  if (greet) await perform({ speech: greetings[mode], emotion: mode === 'uncanny' ? 'uncanny' : 'curious', action: 'none', memory: '' },false,undefined,version);
}

document.querySelectorAll('[data-scene]').forEach(button => button.addEventListener('click', () => {
  // Scene controls are immediate physical effects, independent of cloud access.
  cancelConversation();
  if (stage.stopScene(button.dataset.scene)) return;
  stage.run(button.dataset.scene);stage.captionUntil=0;
  stage.canvas.scrollIntoView({behavior:stage.reduceMotion?'instant':'smooth',block:'center'});
}));
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('button[data-form]').forEach(button => button.addEventListener('click', () => {
  afterimageBridge.stop('scene-change');
  document.body.dataset.form = button.dataset.form; stage.setForm(button.dataset.form);
  document.querySelectorAll('button[data-form]').forEach(control => control.setAttribute('aria-pressed', control.dataset.form === stage.form));
  $('stage').setAttribute('aria-label', stage.form !== 'core' ? 'Animated NOX face. Move the cursor to look around. Click to make him smile, double-click or press Space to wink. Drag or use arrow keys to move him. Shake quickly while holding him for spiral eyes.' : 'Animated NOX signal core. Move the cursor for parallax, click or press Space for a pulse. Drag or use arrow keys to move the core.');
}));
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => send(button.dataset.prompt)));
$('chat-form').addEventListener('submit', event => { event.preventDefault(); send($('message').value); });
$('message').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(event.currentTarget.value); } });
$('cancel-reply').addEventListener('click',()=>{cancelConversation();$('reply-timing').textContent='Reply stopped. Your sent message is saved.';});
function contextPreview(){const notes=knowledge.context($('message').value);$('knowledge-context').hidden=!notes.length;$('knowledge-context').textContent=notes.length?'Relevant context for this thought: '+notes.map(n=>`[${n.id}] ${n.title}`).join(' · '):'';}
function depthNote(){const depth=$('reply-depth').value;$('depth-note').textContent=depth==='deep'?'Deep uses more time and quota. Groq uses a larger model; other providers use their configured model. Voice reads a concise opening.':depth==='quick'?'Quick keeps the response brief and uses less quota.':'Balanced gives a fuller answer. Voice reads a concise opening.';}
$('reply-depth').value=readDepth();depthNote();
$('reply-depth').addEventListener('change',()=>{saveDepth($('reply-depth').value);depthNote();});
$('message').addEventListener('input',contextPreview);window.addEventListener('nox:knowledge',contextPreview);window.addEventListener('storage',contextPreview);
document.querySelector('.skip-link')?.addEventListener('click',event=>{event.preventDefault();$('workspace-main').focus();});
$('voice-button').addEventListener('click', () => {
  const enabled = voice.setEnabled(!voice.enabled);
  showVoice();
  try{disk.setItem('nox.voice.v2',enabled?'on':'off');}catch{}
  if (enabled && afterimageBridge.snapshot().status!=='playing') voice.speak(lastPacket.speech, mode,lastPacket.emotion);
  else if (!voice.supported) toast('Speech synthesis is unavailable in this browser. You can read NOX’s captions.');
});
$('mic-button').addEventListener('click', () => { if (busy) { toast('Let NOX finish this thought first.'); return; } afterimageBridge.stop('conversation');voice.stop(); microphone.start(); });
$('camera-button').addEventListener('click', async () => {
  const button = $('camera-button'); button.disabled = true;
  try {
    if (camera.active) { camera.stop(); stage.camera = null; }
    else { stage.camera = await camera.start(); toast('Camera preview is local. NOX’s model receives your text, not these frames.'); }
    button.setAttribute('aria-pressed', camera.active);
    stage.character.react?.(camera.active?'shy':'content',stage.time,2);
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
  stage.character.react?.(active?'mischievous':'content',stage.time,2);
}
$('film-button').addEventListener('click', toggleFilm); $('exit-film').addEventListener('click', toggleFilm);
function toggleRecording() {
  try {
    if (recorder.active) recorder.stop();
    else { recorder.start(); toast(voice.engine==='natural'?'Recording NOX, captions and his voice. Stops after 60 seconds.':'Recording the stage. Choose Orpheus for captured voice; browser speech cannot be recorded.'); }
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
  if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||document.querySelector('dialog[open]')||event.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;
  if ($('inside-dialog').open || $('clip-dialog').open) return;
  if (event.key === 'Escape') { resetScene(); if (document.body.classList.contains('film') && !recorder.active) toggleFilm(); return; }
  if (event.key.toLowerCase() === 'f') toggleFilm();
  if (event.key.toLowerCase() === 'r') toggleRecording();
});
window.addEventListener('pagehide', () => { afterimageBridge.stop('pagehide');ownerToken=''; camera.stop(); voice.stop(); microphone.stop(); });
window.addEventListener('hashchange',()=>{if(location.hash==='#afterimage')cancelConversation();else afterimageBridge.stop('navigation');});
setInterval(() => { const seconds = Math.floor(stage.time); $('stage-time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }, 1000);
setInterval(() => {
  const signal = stage.character.signal;
  if (document.body.dataset.signal !== signal.status) {
    document.body.dataset.signal = signal.status; $('signal-state').textContent = signal.status.toUpperCase();
  }
  $('signal-level').style.width = `${Math.round(signal.energy * 100)}%`;
  $('stage').dataset.renderer = stage.form==='liquid'&&stage.liquidRenderer?'liquid-logo':stage.form === 'face' ? 'canvas-face' : stage.character.renderer?.available ? 'liquid-logo' : 'canvas-core';
  $('stage').dataset.form = stage.form;
  $('stage').dataset.gazeX = (stage.character.gazeX ?? stage.character.focus?.x ?? 0).toFixed(2);
  $('stage').dataset.gazeY = (stage.character.gazeY ?? stage.character.focus?.y ?? 0).toFixed(2);
  $('stage').dataset.expression=stage.character.features?.(stage.time).expression||stage.character.emotion;
  $('stage').dataset.eyes=stage.character.features?.(stage.time).eyeStyle||'signal';
  $('stage').dataset.falling=String(Boolean(stage.character.falling));
  $('stage').dataset.held=String(Boolean(stage.character.held));$('stage').dataset.mouth=voice.mouthLevel.toFixed(2);$('stage').dataset.mouthTiming=voice.mouthTiming;
}, 120);

function cancelConversation(){afterimageBridge.stop('conversation');turns.cancel();setBusy(false);voice.stop();microphone.stop();summaryController?.abort();clearTimeout(summaryTimer);pendingDraft?.remove();pendingDraft=null;}
async function restoreConversation(){cancelConversation();const thread=history.active();await setMode(thread.mode,false);if(history.active().id!==thread.id)return;$('conversation').replaceChildren();$('chat-title').textContent=thread.title==='New conversation'?"Let's wander a little.":thread.title;
  thread.turns.forEach(turn=>addMessage(turn.role==='user'?'user':'nox',turn.content));
  const last=thread.turns.findLast(t=>t.role==='assistant');lastPacket={speech:last?.content||(thread.turns.length?'Your last message is saved. Ready when the AI connection is available.':greetings[mode]),emotion:stage.character.emotion,action:'none',memory:''};
  if(last){stage.caption=last.content;stage.captionUntil=stage.time+8;}
  else if(thread.turns.length){addMessage('system','Your sent messages are saved. The last AI reply did not finish.');stage.caption='Your last message is saved.';stage.captionUntil=stage.time+8;}
  else{addMessage('nox',greetings[mode]);stage.caption='A fresh thought. I’m listening.';stage.captionUntil=stage.time+8;}
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
  afterimageBridge.refreshState();
}
function showConnection() {
  const state=connectionState(connection,selectedProvider),provider=state.provider;brain=state.kind;
  const labels={locked:'UNLOCK AI',loading:'CHECKING CONNECTION',unconfigured:'AI NOT CONFIGURED',demo:'SCRIPTED DEMO'};
  $('brain-status').lastChild.textContent=brain==='live'?` ${provider.name.toUpperCase()}`:` ${labels[brain]}`;
  const note=brain==='live'?`Model-generated replies · ${provider.name}. Your name, notebook, and conversation context travel with each turn. Camera stays local.`:brain==='locked'?'Your AI brain is locked. Unlock it once in Preferences; access lasts up to 12 hours in this browser. Scenes and touch still work.':brain==='demo'?'You selected the scripted demo. Switch to a configured AI provider for fresh conversation.':brain==='loading'?'Checking the AI connection…':'No AI provider is configured. Add a server key to enable conversation; scenes and touch still work.';
  $('brain-status').title=note;$('brain-note').textContent=note;
  $('connection-message').textContent=note;$('connection-help').hidden=brain==='live';$('unlock-ai').hidden=brain==='demo';
  $('unlock-ai').textContent=brain==='locked'?'Unlock AI ↗':'Connection settings ↗';
  $('inspector-brain').textContent=brain==='live'?`${provider.model} · providers.mjs`:labels[brain];
  afterimageBridge.refreshState();
}
async function refreshConnection(token = ownerToken) {
  const version=++connectionVersion;
  const response=await fetch('/api/status',{headers:apiHeaders(token)});
  if(!response.ok) throw new Error('Server status is unavailable.');
  const status=await response.json();
  if(version!==connectionVersion) return false;
  if(token && status.access==='locked') throw new Error('The owner token was not accepted.');
  ownerToken=''; connection=status;
  const configured=status.providers||[];
  const choices=[{id:'',name:status.access==='locked'?'AI · unlock to connect':'Automatic AI'},{id:'demo',name:'Scripted demo · offline'},...['groq','nvidia','gemini'].map(id=>configured.find(p=>p.id===id)||{id,name:({groq:'GroqCloud',nvidia:'NVIDIA NIM',gemini:'Google Gemini'}[id])+` · ${status.access==='locked'?'unlock first':'add key'}`,disabled:true}),...configured.filter(p=>!['groq','nvidia','gemini'].includes(p.id))];
  $('provider-select').replaceChildren(...choices.map(p=>{const option=document.createElement('option');option.value=p.id;option.textContent=p.name;option.disabled=!!p.disabled;return option;}));
  if(selectedProvider!=='demo'&&!status.providers?.some(p=>p.id===selectedProvider)) selectedProvider=status.provider||'';
  $('provider-select').value=selectedProvider;
  $('provider-note').textContent=status.providers?.length?'Switch between configured providers. Models can still reach their free-tier limits.':'Configure GROQ_API_KEY, GEMINI_API_KEY, or NVIDIA_API_KEY on the server. Keys never belong in this page.';
  voice.configureNatural(status.voice==='natural'); $('natural-option').disabled=status.voice!=='natural';
  voice.setEngine(preferredEngine);
  try{voice.setEnabled(disk.getItem('nox.voice.v2')!=='off');}catch{voice.setEnabled(true);}
  $('owner-form').hidden=status.access!=='locked'; $('lock-owner').hidden=status.access==='locked'||!configured.length;
  showConnection();showVoice(); return true;
}
$('provider-select').addEventListener('change',event=>{
  cancelConversation();selectedProvider=event.target.value;showConnection();
});
$('voice-engine').addEventListener('change',event=>{preferredEngine=event.target.value;voice.setEngine(preferredEngine);try{disk.setItem('nox.voice.engine.v2',preferredEngine);}catch{}showVoice();});
$('owner-form').addEventListener('submit',async event=>{
  event.preventDefault();const token=$('owner-token').value.trim();$('owner-token').value='';
  if(!token) return;
  const button=event.currentTarget.querySelector('button');button.disabled=true;
  try {
    const response=await fetch('/api/session',{method:'POST',headers:apiHeaders(token)});
    if(!response.ok){const error=await response.json();throw Error(error.error||'Could not unlock AI.');}
    selectedProvider='';
    if(await refreshConnection()){
      if(connection.access!=='open')throw Error('This browser could not keep the AI session. Allow cookies for NOX, then unlock again.');
      if(brain!=='live')throw Error('Owner access is unlocked, but no AI provider is configured. Add its server key first.');
      $('owner-status').textContent='AI unlocked for up to 12 hours. Reloading keeps this browser connected.';
      $('inside-dialog').close();toast('NOX’s AI brain is connected.');
    }
  }
  catch(error){$('owner-status').textContent=error.message;}
  finally {button.disabled=false;}
});
$('lock-owner').addEventListener('click',async()=>{
  cancelConversation();ownerToken='';selectedProvider='';
  try{const response=await fetch('/api/session',{method:'DELETE'});if(!response.ok)throw Error('lock');}catch{toast('Could not end the browser session. Try Lock again.');return;}
  connectionVersion++;connection={access:'locked',providers:[]};voice.configureNatural(false);showConnection();showVoice();
  $('provider-select').replaceChildren(new Option('AI · unlock to connect',''));$('natural-option').disabled=true;
  $('owner-form').hidden=false;$('lock-owner').hidden=true;$('owner-status').textContent='Cloud access is locked.';
  try {await refreshConnection();}catch{toast('Cloud access is locked. Server status is unavailable.');}
});
$('unlock-ai').addEventListener('click',()=>{$('inside-dialog').showModal();if(brain==='locked')$('owner-token').focus();});
function browserVoices(){const voices=globalThis.speechSynthesis?.getVoices().filter(v=>v.lang?.startsWith('en'))||[];const selected=$('browser-speaker').value;$('browser-speaker').replaceChildren(new Option('Automatic',''),...voices.map(v=>new Option(v.name,v.name)));$('browser-speaker').value=selected||savedBrowserVoice;}
let savedBrowserVoice='';
try{preferredEngine=disk.getItem('nox.voice.engine.v2')||'natural';const savedSpeaker=disk.getItem('nox.voice.speaker.v2');$('speaker-select').value=['troy','austin','daniel'].includes(savedSpeaker)?savedSpeaker:'troy';savedBrowserVoice=disk.getItem('nox.voice.browser.v2')||'';}catch{}
voice.setSpeaker($('speaker-select').value);voice.setBrowserVoice(savedBrowserVoice);browserVoices();globalThis.speechSynthesis?.addEventListener('voiceschanged',browserVoices);
$('speaker-select').addEventListener('change',e=>{voice.setSpeaker(e.target.value);try{disk.setItem('nox.voice.speaker.v2',e.target.value);}catch{}});
$('browser-speaker').addEventListener('change',e=>{savedBrowserVoice=e.target.value;voice.setBrowserVoice(savedBrowserVoice);try{disk.setItem('nox.voice.browser.v2',savedBrowserVoice);}catch{}});
$('replay-voice').addEventListener('click',()=>{afterimageBridge.stop('voice-preview');if(!voice.enabled)toast('Turn Voice on to hear this reply.');else voice.speak(spokenPreview(lastPacket.speech),mode,lastPacket.emotion);});
$('test-voice').addEventListener('click',()=>{afterimageBridge.stop('voice-preview');voice.setEnabled(true);showVoice();voice.speak('Oh, you found me. I was just thinking about something strange. Want to hear it?',mode,mode==='uncanny'?'uncanny':'happy');});
try{voice.setEnabled(disk.getItem('nox.voice.v2')!=='off');}catch{voice.setEnabled(true);}showVoice();
try {await refreshConnection();}
catch {connection={};showConnection();$('connection-message').textContent='Could not reach the AI server. Reload to retry. Scenes and touch still work.';toast('The AI server could not be reached. No scripted reply was substituted.');}
