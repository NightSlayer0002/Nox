import { normalizePacket, prepareChatRequest,explicitMemoryRequest } from '../../shared/character.js';
import { demoReply } from './brain.js';
import { createMemory } from './memory.js';
import { Stage } from './stage.js';
import {connectStageControls} from './stage-controls.js';
import { createVoice, createMicrophone } from './voice.js';
import { createCamera } from './camera.js';
import { createRecorder } from './recorder.js';
import {DEFAULT_EXPORT_PROFILE,resolveExportProfile} from './export-profile.js';
import { createTurnGate } from './turns.js';
import { createHistory } from './history.js';
import { createNavigation } from './navigation.js';
import { readChatStream } from './stream.js';
import {readSpeechClips} from './speech-stream.js';
import { connectionState } from './connection.js';
import {createProviderControls} from './provider-controls.js';
import {attachWorkspaceViewport} from './workspace-viewport.js';
import { EXPRESSIONS } from './face-art.js';
import { knowledge,readDepth,saveDepth } from './workbench.js';
import { spokenPreview } from './reply.js';
import {sourceBackground} from './source-background.js';
import { afterimageBridge, applyAfterimageCue } from './afterimage-bridge.js';
import {visit,initialVisitStatus,requestVisitStatus} from './visit-scope.js';
import {attachComposerOptions,createComposerSizer,createReplyDiagnostics} from './conversation-controls.js';
import {createChatMessage} from './chat-message.js';
import {createActivitySignal} from './activity-signal.js';
import {approvedPreferences,companionBridge,companionChanged,rememberActivity} from './companion-context.js';
import {EverydayBridge} from './everyday-bridge.js';

const $ = id => document.getElementById(id);
const releaseViewport=attachWorkspaceViewport();
window.addEventListener('pagehide',event=>{if(!event.persisted)releaseViewport();},{once:true});
const disk=visit.storage;
document.body.dataset.visit=visit.owner?'owner':'guest';
$('message').maxLength=6000;
$('visit-note').textContent=visit.owner?'Developer workspace · private browser archive.':'Guest preview · conversations clear when you refresh.';
const memory = createMemory(disk);
const history = await createHistory(disk,memory.snapshot().history);
if(history.persistent)memory.clearHistory();
let mode = history.active().mode;
let navigation,summaryController,summaryTimer,pendingDraft;
let editTarget=null,currentActivity='conversation',publicUsage=initialVisitStatus?.usage;
let brain = 'loading'; let busy = false;
let ownerToken = '', selectedProvider = '', connectionVersion = 0, connection = {};
const providerControls=createProviderControls([$('provider-select'),$('composer-provider')],value=>{cancelConversation();selectedProvider=value;showConnection();});
const apiHeaders = (token = ownerToken) => ({'content-type':'application/json',...(token ? {authorization:`Bearer ${token}`} : visit.owner?{'x-nox-owner':'1'}:{'x-nox-guest':'1','x-nox-visit-id':visit.id})});
const turns = createTurnGate();
const composer=createComposerSizer($('message'));
const composerOptions=attachComposerOptions($('composer-options'));
const replyDiagnostics=createReplyDiagnostics({status:$('reply-timing'),metrics:$('developer-timing'),toggle:$('developer-mode')});
let activityTurn;
const activity=createActivitySignal({onChange:renderActivity});
function renderActivity(snapshot){
  document.body.dataset.activity=snapshot.state;
  $('activity-label').textContent=snapshot.label;
  $('presence-mobile-status').textContent=snapshot.state==='idle'?'Ready when you are.':snapshot.label;
  $('activity-events').replaceChildren(...snapshot.events.map(event=>{
    const item=document.createElement('li');item.textContent=event.label;
    return item;
  }));
}
renderActivity(activity.snapshot());
let lastPacket = { speech: 'Oh. You found me.', emotion: 'curious', action: 'none', memory: '' };
let toastTimer;
let captureProfile=DEFAULT_EXPORT_PROFILE;
try{captureProfile=resolveExportProfile(disk.getItem('nox.export.profile.v1')||DEFAULT_EXPORT_PROFILE);}catch{}
function openSettings({owner=false}={}) {
  if(owner)$('owner-access').open=true;
  $('inside-dialog').showModal();
  if(owner)$('owner-token').focus();
}
function setUsage(value){if(value){publicUsage=value;companionChanged();}}
function applyApprovedPreferences(){const preferences=approvedPreferences.context(currentActivity),pace=preferences.speechPace??1;voice.setPace?.(pace);const select=$('speech-pace');if(select){if(![...select.options].some(option=>Number(option.value)===pace))select.add(new Option(`${pace}× · Your pace`,String(pace)));select.value=String(pace);}}
let preferredEngine='natural';

function toast(text) {
  $('toast').textContent = text; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500);
}

const sceneLabels = { none: 'Click to react. Drag to play.', gravity: 'Gravity is on. Pick NOX up and let go.', spotlight: 'Move the light with your cursor.', orbit: 'A small universe.', echo: 'An authored scene. Another presence.', takeover: 'Creative control: NOX.' };
const stage = new Stage($('stage'));
connectStageControls(stage,{
  sceneButtons:[...document.querySelectorAll('[data-scene]')],
  formButtons:[...document.querySelectorAll('button[data-form]')],
  sceneLabel:$('scene-label'),labels:sceneLabels,
  onAction:()=>{if(document.body.dataset.view!=='afterimage')stage.canvas.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});},
  onFormChange:form=>{
    document.body.dataset.form=form;
    $('stage').setAttribute('aria-label',form!=='core'?'Animated NOX face. Move the cursor to look around. Click to make him smile, double-click or press Space to wink. Drag or use arrow keys to move him. Shake quickly while holding him for spiral eyes.':'Interactive NOX neural brain. Move the cursor to turn it. Click or press Space to release a wave. Hold and pull for stronger bursts. Drag or use arrow keys to move the brain.');
  },
});
sourceBackground.subscribe(canvas=>stage.setBackgroundSource(canvas));
for(const expression of Object.keys(EXPRESSIONS)){
  const option=document.createElement('option');option.value=expression;option.textContent=expression==='pout'?'Cute outrage':expression[0].toUpperCase()+expression.slice(1);$('expression-preview').append(option);
}
$('preview-expression').addEventListener('click',()=>{
  if(stage.form==='core'){toast('Choose Presence or Liquid Metal to try his expressions.');return;}
  stage.character.preview($('expression-preview').value,stage.time);
  stage.canvas.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
});
// The owner chose always-on NOX animation. There is no website motion switch.
stage.setMotion(true);
const voice = createVoice({
  onStart: () => { stage.narrating=true;stage.character.speakingUntil = Infinity; },
  onEnd: () => { stage.narrating=false;stage.character.speakingUntil = stage.time;if(!busy)activity.transition('idle'); },
  onError:message=>{activity.transition('error');toast(message);},
  onState:state=>{
    document.body.dataset.voiceState=state;
    if(state==='preparing')activity.transition('preparing');
    else if(state==='speaking')activity.transition('speaking');
    else if(state==='ready'&&!stage.narrating)activity.transition('voice-ready');
    else if(state==='idle'&&!busy&&!stage.narrating)activity.transition('idle');
    stage.character.activity=busy||state==='preparing'?'thinking':dictating?'listening':'idle';
    if(state==='preparing'&&document.body.dataset.view==='conversation')replyDiagnostics.setStatus('Preparing NOX’s voice…');
    else if($('reply-timing').textContent==='Preparing NOX’s voice…')replyDiagnostics.setStatus('');
  },
  requestClips: async function* (text,mode,signal,emotion,speaker,speechCues) {
    const start=performance.now(),timingVersion=replyDiagnostics.capture();
    const response = await fetch('/api/speech',{method:'POST',headers:apiHeaders(),body:JSON.stringify({text,mode,emotion,voice:speaker,...(speechCues?{speechCues}:{stream:true})}),signal});
    try{const usage=response.headers.get('x-nox-usage');if(usage)setUsage(JSON.parse(usage));}catch{}
    if(!response.ok) {const error=await response.json();setUsage(error.usage);throw new Error(error.error||'Natural voice is unavailable. Text and browser voice remain available.');}
    const clips=speechCues?(async function*(){
      if(!response.headers.get('content-type')?.startsWith('audio/'))throw new Error('Natural voice did not return audio.');
      const blob=await response.blob();if(!blob.size||blob.size>2*1024*1024)throw new Error('Natural voice returned invalid audio.');yield {blob};
    })():readSpeechClips(response,{signal});
    let first=true;
    for await(const clip of clips){
      if(first&&!signal.aborted&&afterimageBridge.snapshot().status!=='playing')replyDiagnostics.voice(timingVersion,performance.now()-start,response.headers.get('x-nox-audio-cache')||'clips');
      first=false;yield clip;
    }
  },
});
const compactPresence=matchMedia('(max-width:900px)');
$('presence-size').addEventListener('click',()=>{
  const expanded=document.body.dataset.presenceExpanded!=='true';
  document.body.dataset.presenceExpanded=String(expanded);
  $('presence-size').setAttribute('aria-expanded',String(expanded));
  $('presence-size').textContent=expanded?'Minimize NOX':'Enlarge NOX';
});
stage.onBeforeFrame=()=>{
  stage.character.mouthLevel=voice.mouthLevel;
  const chatting=document.body.dataset.view==='conversation';
  stage.captionMode=chatting&&compactPresence.matches&&document.body.dataset.presenceExpanded!=='true'&&!document.body.classList.contains('film')?'hidden':chatting?'speaking':'linger';
};
const camera = createCamera();
const recorder = createRecorder($('stage'), (active, clip) => {
  if(!active)stage.lockRecording(false);
  $('export-profile').disabled=active;
  stage.character.react?.(active?'excited':'content',stage.time,2);
  $('record-button').classList.toggle('recording', active);
  $('record-button').querySelector('span').textContent = active ? 'Stop & save' : 'Record clip';
  $('film-record').textContent = active ? 'Stop & save' : 'Record clip';
  document.body.classList.toggle('recording', active);
  if(active)afterimageBridge.refreshState();else afterimageBridge.recordingEnded();
  if (clip) {
    $('clip-video').src = clip.url;
    $('save-clip').href = clip.url; $('save-clip').download = clip.filename;
    $('clip-meta').textContent = `${clip.width} × ${clip.height} · ${clip.frameRate} fps · ${(clip.blob.size / 1024).toFixed(0)} KB · WebM · ${clip.audio?'NOX audio track':'video only'}`;
    $('clip-dialog').showModal();
  }
},{getAudioStream:()=>voice.prepareCapture(),onError:toast});
let dictating=false;
const microphone = createMicrophone({
  onText: text => { composer.setValue(text);contextPreview();send(text); },
  onState: active => {
    dictating=active;
    activity.transition(busy?'thinking':active?'listening':'idle');
    $('mic-button').classList.toggle('listening', active); $('mic-button').querySelector('span').textContent = active ? 'Listening…' : 'Talk';
    $('mic-button').setAttribute('aria-pressed',active);$('mic-button').setAttribute('aria-label',active?'Stop dictation':'Dictate a message');$('mic-button').title=active?'Stop dictation':'Dictate a message';
    stage.character.activity = busy ? 'thinking' : active ? 'listening' : 'idle';
  },
  onError: toast,
});
if(!microphone.supported){$('mic-button').disabled=true;$('mic-button').title='Dictation is unavailable in this browser. Type a message instead.';}

afterimageBridge.connect({
  async receive({seed,tone,variation,signal}) {
    if(!visit.owner)throw new Error('Owner mode is needed for new transmissions. Guest visits can rehearse and capture the authored example.');
    const state=connectionState(connection,selectedProvider);
    if(state.kind!=='live')throw new Error(state.kind==='locked'?'Unlock AI in Settings to receive a transmission.':state.kind==='demo'?'Choose a configured AI provider, or open the authored first contact.':'A configured AI connection is required to receive a transmission.');
    const body={seed,tone,...(variation===undefined?{}:{variation}),...(selectedProvider?{provider:selectedProvider}:{})};
    const response=await fetch('/api/afterimage',{method:'POST',headers:apiHeaders(),body:JSON.stringify(body),signal});
    if(!response.ok){const error=await response.json();if(response.status===401&&!signal.aborted)await refreshConnection();throw new Error(error.error||'The transmission could not be received.');}
    return response.json();
  },
  cue(value) {
    const cue=applyAfterimageCue(stage,value);$('mood-label').textContent=cue.emotion;
  },
  speak: (script,emotion,cues) => voice.speak(script,mode,emotion,cues),
  stop() {
    voice.stop();stage.character.speakingUntil=stage.time;stage.captionUntil=0;
    stage.reset(false);
  },
  record:toggleRecording,
  startRecording,
  stopRecording:() => recorder.stop(),
  setVoice(value){voice.setEnabled(value);showVoice();try{disk.setItem('nox.voice.v2',voice.enabled?'on':'off');}catch{}},
  setExportProfile,
  getState:() => ({voiceEnabled:voice.enabled,recording:recorder.active,recordSupported:recorder.supported,exportProfile:captureProfile.id,connection:connectionState(connection,selectedProvider)}),
});
$('export-profile').value=captureProfile.id;
$('export-profile').addEventListener('change',event=>setExportProfile(event.target.value));
function setExportProfile(value){
  if(recorder.active)throw new Error('Save the current recording before changing its format.');
  captureProfile=resolveExportProfile(value);$('export-profile').value=captureProfile.id;
  try{disk.setItem('nox.export.profile.v1',captureProfile.id);}catch{}
  afterimageBridge.refreshState();return captureProfile.id;
}
function startRecording(){
  if(recorder.active)return;
  stage.lockRecording(true,captureProfile);
  try{return recorder.start(captureProfile);}catch(error){stage.lockRecording(false);throw error;}
}

function addMessage(speaker, text,turn) {
  const message = createChatMessage(speaker, text, document);
  if(turn)message.dataset.seq=String(turn.seq);
  $('conversation').append(message);
  $('conversation').scrollTop = $('conversation').scrollHeight;
  return message;
}
function attachMessageActions(message,turn){
  if(!message||message.querySelector('.message-actions')||!turn)return;
  const actions=document.createElement('div');actions.className='message-actions';
  const copy=document.createElement('button');copy.type='button';copy.textContent='Copy';copy.setAttribute('aria-label',`Copy ${turn.role==='user'?'your message':'NOX’s reply'}`);copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(turn.content);toast('Copied.');}catch{toast('Copy is unavailable. Select the text and copy it with your keyboard.');}});actions.append(copy);
  const revise=document.createElement('button');revise.type='button';revise.textContent=turn.role==='user'?'Edit':'Try again';revise.addEventListener('click',async()=>{if(busy){toast('Stop the current reply before revising this conversation.');return;}cancelConversation();if(turn.role==='user'){editTarget=turn.seq;composer.setValue(turn.content);replyDiagnostics.setStatus('Editing this message. Sending replaces the replies after it.');$('message').focus();}else{const result=await history.retryFrom(turn.seq);if(!result){toast('That reply changed. Reopen the conversation and try again.');return;}await restoreConversation({retrying:true});await send(result.draft,{recorded:true});}});actions.append(revise);message.append(actions);
}

function updateMemory() {
  const state = memory.snapshot();
  $('memory-summary').textContent = state.name ? `He knows you as ${state.name}. ${state.facts.length ? 'A few things worth keeping.' : 'Tell him something worth keeping.'}` : 'A fresh start. Tell him your name.';
  $('memory-facts').replaceChildren();
  state.facts.slice(-4).forEach(fact => { const tag = document.createElement('span'); tag.className = 'fact'; tag.textContent = fact; $('memory-facts').append(tag); });
  if(!visit.owner)$('memory-summary').textContent='Recent messages provide context for this visit.';
  else if (!memory.persistent) $('memory-summary').textContent += ' Storage is unavailable; this notebook lasts for this visit.';
}

async function perform(value, save = true, draft, version, depth='quick',rememberAllowed=false) {
  if(version!==undefined&&!turns.isCurrent(version))return;
  const packet = normalizePacket(value,depth); lastPacket = packet;
  const spoken=spokenPreview(packet.speech);
  voice.prepare(spoken,mode,packet.emotion);
  if (packet.memory&&rememberAllowed) memory.remember(packet.memory);
  if (save && !await history.append('assistant', packet.speech)) {voice.stop();return;}
  if(version!==undefined&&!turns.isCurrent(version))return;
  const replyTurn=save?history.active().turns.at(-1):null;
  if(draft){draft.classList.remove('draft');draft.querySelector('.message-content').textContent=packet.speech;attachMessageActions(draft,replyTurn);}else{const message=addMessage('nox', packet.speech,replyTurn);attachMessageActions(message,replyTurn);}
  stage.speak({...packet,speech:spoken});voice.speak(spoken, mode, packet.emotion);
  if(packet.action==='takeover')stage.canvas.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
  $('mood-label').textContent = packet.emotion;
  $('packet-view').textContent = JSON.stringify(value.metrics?{...packet,metrics:value.metrics}:packet, null, 2); updateMemory();navigation?.render();companionChanged();
}

function setBusy(value) {
  busy = value; $('send-button').disabled = value||!$('message').value.trim();$('send-button').hidden=value; $('chat-form').setAttribute('aria-busy', value);
  $('cancel-reply').hidden=!value;$('reply-depth').disabled=value;
  stage.character.activity = value||voice.state==='preparing' ? 'thinking' : dictating?'listening':'idle';
  companionChanged();
}

async function send(raw,{recorded=false}={}) {
  composerOptions.close();
  const text = raw.trim(); if (!text || busy) return;
  if(editTarget!==null){const revised=await history.replaceFrom(editTarget,text);editTarget=null;if(!revised){toast('That message could not be edited. Your draft is still here.');return;}await restoreConversation({retrying:true});recorded=true;}
  // Failed or interrupted replies already keep their user turn. Sending the
  // same unanswered draft retries it without recording it a second time.
  const unanswered=history.active().turns.at(-1);
  if(!recorded&&unanswered?.role==='user'&&unanswered.content===text)recorded=true;
  afterimageBridge.stop('conversation');
  const takeover=/^(?:please\s+)?(?:take\s*over(?:\s+(?:the\s+)?(?:screen|stage))?|takeover)[.!]?$/i.test(text);
  if(!['live','demo'].includes(brain)){
    if(takeover)stage.run('takeover');
    toast(brain==='locked'?'Unlock AI in Settings to talk with NOX. Your thought is still here.':'NOX’s AI connection is not ready. Check Settings; your thought is still here.');
    openSettings({owner:brain==='locked'});return;
  }
  const version = turns.begin();
  activityTurn=activity.beginTurn();
  const timingVersion=replyDiagnostics.begin(brain==='live'?'NOX is thinking…':'Scripted demo · no AI request');
  summaryController?.abort();clearTimeout(summaryTimer);
  const name = text.match(/(?:my name is|call me|i am called)\s+([\p{L}\p{N}_ -]{1,40})/iu);
  if (name) memory.setName(name[1].trim());
  const depth=$('reply-depth').value==='deep'&&!visit.owner?'balanced':$('reply-depth').value;
  const recent=history.context();if(recorded&&recent.history.at(-1)?.role==='user')recent.history=recent.history.slice(0,-1);
  const preferences=approvedPreferences.context(currentActivity);
  const context = {...(visit.owner?memory.snapshot():{}),...recent,mode,depth,activity:currentActivity,preferences,knowledge:knowledge.context(text)};
  companionBridge.propose(text,currentActivity);
  applyApprovedPreferences();
  const request=prepareChatRequest(text,context,selectedProvider,true);
  setBusy(true);
  if(!recorded&&!await history.append('user',text)){cancelConversation();await restoreConversation();toast('This conversation changed in another tab. Start a new thought.');return;}
  if(!turns.isCurrent(version))return;
  if(!recorded){const userTurn=history.active().turns.at(-1),message=addMessage('user', text,userTurn);attachMessageActions(message,userTurn);}composer.setValue(''); contextPreview();updateMemory();navigation?.render();companionChanged();
  setBusy(true); voice.stop(); microphone.stop(); stage.character.emotion = 'curious';
  try {
    let packet;
    if (brain === 'live') {
      const requestController = new AbortController();
      turns.attach(version, requestController);
      const draft=addMessage('nox','');draft.classList.add('draft');pendingDraft=draft;
      const response = await fetch('/api/chat', { method: 'POST', headers: apiHeaders(), body: JSON.stringify(request), signal: requestController.signal });
      if(!response.ok){const error=await response.json();setUsage(error.usage);if(response.status===401){await refreshConnection();}throw new Error(error.error||'The AI connection did not respond.');}
      const result = await readChatStream(response,speech=>{if(turns.isCurrent(version)){draft.querySelector('.message-content').textContent=speech;$('conversation').scrollTop=$('conversation').scrollHeight;}});
      setUsage(result.usage);
      packet = result;
      if (turns.isCurrent(version)) {$('brain-status').lastChild.textContent = visit.owner?' AI connected':' Guest visit';const timing=result.metrics;replyDiagnostics.complete(timingVersion,timing,depth);if(timing)$('inspector-brain').textContent=`${timing.model||'Configured model'} · ${timing.depth||depth} · ${timing.provider}`;}
    } else {
      await new Promise(resolve => setTimeout(resolve, 350));
      packet = demoReply(text, context);
      if(turns.isCurrent(version))replyDiagnostics.complete(timingVersion);
    }
    if (turns.isCurrent(version)) {activity.transition('reply-ready',activityTurn);if(takeover)packet={...packet,action:'takeover'};const draft=pendingDraft;await perform(packet,true,draft,version,depth,explicitMemoryRequest(text));if(turns.isCurrent(version)){if(brain==='live'&&request.context.knowledge?.length&&draft){const sources=document.createElement('p');sources.className='knowledge-sources';sources.textContent='Context included: '+request.context.knowledge.map(n=>`[${n.id}] ${n.title}`).join(' · ');draft.append(sources);}pendingDraft=null;scheduleSummary();}}
  } catch (error) {
    if (turns.isCurrent(version)){setUsage(error.usage);pendingDraft?.remove();pendingDraft=null;if(error.name!=='AbortError'){activity.finishTurn(activityTurn,'error');if(!$('message').value){composer.setValue(text);contextPreview();}stage.character.react?.('worried',stage.time,2);if (brain === 'live') $('brain-status').lastChild.textContent = ' AI error'; addMessage('system', error.message); toast(error.message);replyDiagnostics.setStatus('Reply interrupted. Your message is still in this visit.');}}
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
  $('mood-label').textContent = stage.character.emotion;
  document.querySelectorAll('[data-mode]').forEach(button => { const active = button.dataset.mode === mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
  if (greet) await perform({ speech: greetings[mode], emotion: mode === 'uncanny' ? 'uncanny' : 'curious', action: 'none', memory: '' },false,undefined,version);
}

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => send(button.dataset.prompt)));
$('chat-form').addEventListener('submit', event => { event.preventDefault(); send($('message').value); });
$('message').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(event.currentTarget.value); } });
$('cancel-reply').addEventListener('click',()=>{cancelConversation();replyDiagnostics.setStatus('Reply stopped. Your sent message is saved.');});
function contextPreview(){const notes=knowledge.context($('message').value);$('knowledge-context').hidden=!notes.length;$('knowledge-context').textContent=notes.length?'Relevant context for this thought: '+notes.map(n=>`[${n.id}] ${n.title}`).join(' · '):'';}
function depthNote(){const depth=$('reply-depth').value;$('depth-note').textContent=depth==='deep'?'Developer mode: deeper replies use more time and model allowance. Voice reads a concise opening.':depth==='quick'?'Quick keeps the response brief. Complete written answers stay in the conversation.':'Balanced gives an everyday explanation room to finish. Voice reads a concise opening.';}
$('reply-depth').value=readDepth();depthNote();
for(const option of $('reply-depth').options)option.disabled=!visit.owner&&option.value==='deep';
$('reply-depth').addEventListener('change',()=>{saveDepth($('reply-depth').value);depthNote();});
$('message').addEventListener('input',()=>{
  contextPreview();$('send-button').disabled=busy||!$('message').value.trim();
  const input=$('chat-form').getBoundingClientRect(),frame=stage.canvas.getBoundingClientRect();
  if(frame.width&&frame.height)stage.character.attendTo?.({x:(input.left+input.width*.6-frame.left)/frame.width,y:(input.top+20-frame.top)/frame.height},stage.time);
});window.addEventListener('nox:knowledge',contextPreview);window.addEventListener('storage',contextPreview);
document.querySelector('.skip-link')?.addEventListener('click',event=>{event.preventDefault();$('workspace-main').focus();});
for(const voiceControl of [$('voice-button'),$('composer-voice')])voiceControl.addEventListener('click', () => {
  const enabled = voice.setEnabled(!voice.enabled);
  showVoice();
  try{disk.setItem('nox.voice.v2',enabled?'on':'off');}catch{}
  if (enabled && afterimageBridge.snapshot().status!=='playing') {stage.speak({...lastPacket,action:'none'});voice.speak(lastPacket.speech, mode,lastPacket.emotion);}
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
function resetScene() { stage.reset(); }
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
    else { startRecording(); toast(voice.engine==='natural'?'Recording NOX, captions and his voice. Stops after 60 seconds.':'Recording the stage. Choose Orpheus for captured voice; browser speech cannot be recorded.'); }
  } catch (error) { toast(error.message); }
}
$('record-button').addEventListener('click', toggleRecording);
$('film-record').addEventListener('click', toggleRecording);
$('clear-memory').addEventListener('click', () => {
  cancelConversation();memory.clear();
  updateMemory();toast('The saved name and notebook facts are cleared. Conversations remain in your Library.');
});
$('inside-button').addEventListener('click', () => { $('packet-view').textContent = JSON.stringify(lastPacket, null, 2); openSettings(); });
$('settings-button').addEventListener('click', () => openSettings());
$('speech-pace')?.addEventListener('change',event=>{const pace=Number(event.target.value);voice.setPace?.(pace);companionBridge.propose(`Speak at ${pace}x`,'general');});
$('stop-voice')?.addEventListener('click',()=>{afterimageBridge.stop('user');voice.stop();stage.captionUntil=0;toast('Speech stopped. Your conversation is still here.');});
$('stop-speaking')?.addEventListener('click',()=>{afterimageBridge.stop('user');voice.stop();stage.captionUntil=0;});
document.querySelectorAll('.consumer-settings a').forEach(link=>link.addEventListener('click',()=>$('inside-dialog').close()));
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==='o'){event.preventDefault();document.body.dataset.developer='true';openSettings({owner:true});}});
if(location.pathname.replace(/\/$/,'')==='/owner')document.body.dataset.developer='true';
const persona=document.querySelector('.mode-tabs');if(persona&&$('persona-settings'))$('persona-settings').append(persona);
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
window.addEventListener('hashchange',()=>{if(location.hash==='#afterimage')cancelConversation();else afterimageBridge.stop('navigation');requestAnimationFrame(composer.resize);});
setInterval(() => { const seconds = Math.floor(stage.time); $('stage-time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }, 1000);
setInterval(() => {
  const signal = stage.character.signal;
  if (document.body.dataset.signal !== signal.status) {
    document.body.dataset.signal = signal.status; $('signal-state').textContent = signal.status.toUpperCase();
  }
  $('signal-level').style.width = `${Math.round(signal.energy * 100)}%`;
  $('stage').dataset.renderer = stage.form==='liquid'&&stage.liquidRenderer?'liquid-logo':stage.form === 'face' ? stage.liquidReady?'blender-presence':'canvas-face' : stage.character.renderer?.available ? 'bodyparts3d-brain' : 'lucide-brain';
  $('stage').dataset.form = stage.form;
  const neuralCanvas=stage.form==='core'?stage.character.material?.canvas:null;
  $('stage').dataset.neuralNodes=neuralCanvas?.dataset.nodes||'0';
  $('stage').dataset.neuralEdges=neuralCanvas?.dataset.edges||'0';
  $('stage').dataset.waveCount=String(signal.waves?.length||0);
  $('stage').dataset.waveSerial=String(signal.waveSerial||0);
  $('stage').dataset.brainDrive=(signal.drive||0).toFixed(3);
  $('stage').dataset.brainPressure=(stage.character.focus?.pressure||0).toFixed(3);
  $('stage').dataset.brainPixels=String(neuralCanvas?.width||0);
  $('stage').dataset.gazeX = (stage.character.gazeX ?? stage.character.focus?.x ?? 0).toFixed(2);
  $('stage').dataset.gazeY = (stage.character.gazeY ?? stage.character.focus?.y ?? 0).toFixed(2);
  $('stage').dataset.expression=stage.character.features?.(stage.time).expression||stage.character.emotion;
  $('stage').dataset.eyes=stage.character.features?.(stage.time).eyeStyle||'signal';
  $('stage').dataset.falling=String(Boolean(stage.character.falling));
  $('stage').dataset.held=String(Boolean(stage.character.held));$('stage').dataset.mouth=voice.mouthLevel.toFixed(2);$('stage').dataset.mouthTiming=voice.mouthTiming;
}, 120);

function cancelConversation(){afterimageBridge.stop('conversation');turns.cancel();activity.finishTurn(activityTurn);replyDiagnostics.invalidate();replyDiagnostics.setStatus('');setBusy(false);voice.stop();microphone.stop();summaryController?.abort();clearTimeout(summaryTimer);pendingDraft?.remove();pendingDraft=null;}
async function restoreConversation({retrying=false}={}){cancelConversation();const thread=history.active();await setMode(thread.mode,false);if(history.active().id!==thread.id)return;$('conversation').replaceChildren();$('chat-title').textContent=thread.title;
  thread.turns.forEach(turn=>{const message=addMessage(turn.role==='user'?'user':'nox',turn.content,turn);attachMessageActions(message,turn);});
  const last=thread.turns.findLast(t=>t.role==='assistant');lastPacket={speech:last?.content||(thread.turns.length?'Your last message is still here. Ready when the AI connection is available.':greetings[mode]),emotion:stage.character.emotion,action:'none',memory:''};
  if(last){stage.caption=last.content;stage.captionUntil=0;}
  else if(thread.turns.length){if(!retrying)addMessage('system','Your last message is still here. Send it again to retry.');stage.caption='';stage.captionUntil=0;}
  else{stage.caption='';stage.captionUntil=0;}
  replyDiagnostics.clear();composer.resize();$('summary-note').textContent=thread.summary?'Older context is summarized. Your full transcript is kept in this conversation.':'';navigation?.render();updateMemory();companionChanged();
}
function scheduleSummary(){clearTimeout(summaryTimer);if(!visit.owner||brain!=='live'||!history.summaryWork()||selectedProvider==='openai')return;summaryTimer=setTimeout(async()=>{
  const work=history.summaryWork();if(!work||busy)return;const controller=new AbortController();summaryController=controller;
  try{const response=await fetch('/api/summary',{method:'POST',headers:apiHeaders(),body:JSON.stringify({previous:work.previous,turns:work.turns,provider:selectedProvider}),signal:controller.signal});if(!response.ok)throw Error('summary');const result=await response.json();if(!controller.signal.aborted&&await history.applySummary(work.id,work.through,result.summary)&&history.active().id===work.id)$('summary-note').textContent='Older context is summarized. Your full transcript is kept in the Library.';}
  catch(error){if(error.name!=='AbortError'&&history.active().id===work.id)$('summary-note').textContent='Summary will retry after a later turn. The full transcript is still saved.';}
  finally{if(summaryController===controller)summaryController=null;}
},3000);}
navigation=createNavigation({history,onOpen:async id=>{cancelConversation();editTarget=null;currentActivity='conversation';const selected=await history.select(id);await restoreConversation();if(!selected)toast('That conversation was removed in another tab.');},onNew:async()=>{cancelConversation();editTarget=null;currentActivity='conversation';await history.create();await restoreConversation();},onStart:async(text,persona)=>{await setMode(persona,false);await send(text);}});
history.subscribe(({currentChanged})=>{if(currentChanged)void restoreConversation();else navigation.render();});
await restoreConversation();
companionBridge.connect({
  snapshot:()=>({usage:publicUsage,owner:visit.owner}),
  async fresh(){editTarget=null;currentActivity='conversation';await history.create();await restoreConversation();navigation.setView('conversation');},
  async start(text,kind='conversation'){editTarget=null;currentActivity=['conversation','explore','mystery'].includes(kind)?kind:'conversation';await history.create();await restoreConversation();navigation.setView('conversation');await send(text);},
  preferenceChanged:applyApprovedPreferences,
});
EverydayBridge.connect({
  async ask(message,{activity:source}={}){cancelConversation();editTarget=null;currentActivity=(typeof source==='string'?source:source?.kind)==='explore'?'explore':'conversation';if(source?.state)rememberActivity('explore',{state:source.state,id:source.id});await history.create();await restoreConversation();navigation.setView('conversation');await send(message);},
  speak(text,{activity:source}={}){const scope=['explore','guessing'].includes(source)?source:currentActivity;voice.setPace?.(approvedPreferences.context(scope).speechPace??1);voice.setEnabled(true);showVoice();const speech=spokenPreview(text);stage.speak({speech,emotion:'curious',action:'none',memory:''});return voice.speak(speech,mode,'curious');},
  stop(){voice.stop();stage.captionUntil=0;},
  proposePreference(value){const words=value.key==='learningStyle'?(value.value==='hints'?'One clue at a time':'Explain first'):value.key==='gameQuestionLimit'?`Use ${value.value} questions in the guessing game`:value.key==='gameHints'?`Turn hints ${value.value?'on':'off'} in the guessing game`:value.origin;return companionBridge.propose(words,value.scope);},
});
applyApprovedPreferences();

function showVoice() {
  $('voice-button').setAttribute('aria-pressed',voice.enabled);
  $('voice-button').querySelector('span').textContent=voice.enabled?'Voice on':'Voice off';
  $('composer-voice').setAttribute('aria-pressed',voice.enabled);$('composer-voice').setAttribute('aria-label',voice.enabled?'Spoken replies on':'Spoken replies off');$('composer-voice').title=voice.enabled?'Spoken replies are on. Turn voice off.':'Spoken replies are off. Turn voice on.';
  $('composer-voice').querySelector('.composer-voice-label').textContent=voice.enabled?'Voice on':'Voice off';
  $('voice-engine').value=voice.engine;
  $('voice-note').textContent=voice.engine==='natural'?'This is an AI-generated voice. Each reply uses your configured speech provider’s quota.':'Browser voice is free. Quality depends on the voices available on your device.';
  afterimageBridge.refreshState();
}
function showConnection() {
  const state=connectionState(connection,selectedProvider),provider=state.provider;brain=state.kind;
  const labels={locked:'AI locked',loading:'Connecting…',unconfigured:'AI unavailable',demo:'Scripted demo'};
  $('brain-status').lastChild.textContent=brain==='live'?` ${visit.owner?provider.name:'Guest visit'}`:` ${labels[brain]}`;
  const note=brain==='live'?`Model-generated replies · ${provider.name}. Your name, notebook, and conversation context travel with each turn. Camera stays local.`:brain==='locked'?'Your AI brain is locked. Unlock it once in Settings; access lasts up to 12 hours in this browser. Scenes and touch still work.':brain==='demo'?'You selected the scripted demo. Switch to a configured AI provider for fresh conversation.':brain==='loading'?'Checking the AI connection…':'No AI provider is configured. Add a server key to enable conversation; scenes and touch still work.';
  const scopeNote=!visit.owner&&brain==='live'?'NOX Free · complete everyday answers. Chats and preferences clear when you refresh. Natural voice has a separate allowance.':note;
  $('brain-status').title=scopeNote;$('brain-note').textContent=scopeNote;
  $('connection-message').textContent=scopeNote;$('connection-help').hidden=brain==='live';$('unlock-ai').hidden=brain==='demo';
  $('unlock-ai').textContent=brain==='locked'?'Unlock AI ':'Connection settings ';
  $('inspector-brain').textContent=brain==='live'?`${provider.model} · providers.mjs`:labels[brain];
  afterimageBridge.refreshState();
}
async function refreshConnection(token = ownerToken,initial) {
  const version=++connectionVersion;
  let status;
  try{status=initial||await requestVisitStatus({headers:apiHeaders(token)});}catch(error){if(visit.owner&&error.status===401)location.replace(`/guest${location.hash}`);throw error;}
  if(version!==connectionVersion) return false;
  if(visit.owner&&!status.owner){cancelConversation();location.replace(`/guest${location.hash}`);return false;}
  if(token && status.access==='locked') throw new Error('The owner token was not accepted.');
  ownerToken=''; connection=status;setUsage(status.usage);
  const configured=status.providers||[];
  const choices=[{id:'',name:status.access==='locked'?'AI · unlock to connect':'Automatic AI'},{id:'demo',name:'Scripted demo · offline'},...['groq','nvidia','gemini'].map(id=>configured.find(p=>p.id===id)||{id,name:id==='nvidia'?'NVIDIA NIM · To be connected':({groq:'GroqCloud',gemini:'Google Gemini'}[id])+` · ${status.access==='locked'?'unlock first':'add key'}`,disabled:true}),...configured.filter(p=>!['groq','nvidia','gemini'].includes(p.id))];
  if(selectedProvider!=='demo'&&!status.providers?.some(p=>p.id===selectedProvider)) selectedProvider=status.provider||'';
  providerControls.update(choices,selectedProvider);
  $('provider-note').textContent=status.providers?.length?'Switch between configured providers. Models can still reach their free-tier limits.':'Configure GROQ_API_KEY, GEMINI_API_KEY, or NVIDIA_API_KEY on the server. Keys never belong in this page.';
  voice.configureNatural(status.voice==='natural'); $('natural-option').disabled=status.voice!=='natural';
  voice.setEngine(preferredEngine);
  try{voice.setEnabled(disk.getItem('nox.voice.v2')==='on');}catch{voice.setEnabled(false);}
  $('owner-form').hidden=visit.owner; $('lock-owner').hidden=!visit.owner;
  $('owner-status').textContent=visit.owner?'Owner/dev session · saved locally for this browser.':'Owner sign-in opens your saved archive.';
  showConnection();showVoice(); return true;
}
$('voice-engine').addEventListener('change',event=>{preferredEngine=event.target.value;voice.setEngine(preferredEngine);try{disk.setItem('nox.voice.engine.v2',preferredEngine);}catch{}showVoice();});
$('owner-form').addEventListener('submit',async event=>{
  event.preventDefault();const token=$('owner-token').value.trim();$('owner-token').value='';
  if(!token) return;
  const button=event.currentTarget.querySelector('button');button.disabled=true;
  try {
    const response=await fetch('/api/session',{method:'POST',headers:apiHeaders(token)});
    if(!response.ok){const error=await response.json();throw Error(error.error||'Could not unlock AI.');}
    const checked=await requestVisitStatus({forceGuest:false});
    if(!checked.owner)throw Error('This browser could not keep the owner session. Allow cookies for NOX, then sign in again.');
    cancelConversation();location.replace(`/app${location.hash||'#conversation'}`);
  }
  catch(error){$('owner-status').textContent=error.message;}
  finally {button.disabled=false;}
});
$('lock-owner').addEventListener('click',async()=>{
  cancelConversation();ownerToken='';selectedProvider='';
  try{const response=await fetch('/api/session',{method:'DELETE'});if(!response.ok)throw Error('lock');}catch{toast('Could not end the browser session. Try Lock again.');return;}
  location.replace(`/guest${location.hash||'#conversation'}`);
});
$('unlock-ai').addEventListener('click',()=>openSettings({owner:brain==='locked'}));
function browserVoices(){const voices=globalThis.speechSynthesis?.getVoices().filter(v=>v.lang?.startsWith('en'))||[];const selected=$('browser-speaker').value;$('browser-speaker').replaceChildren(new Option('Automatic',''),...voices.map(v=>new Option(v.name,v.name)));$('browser-speaker').value=selected||savedBrowserVoice;}
let savedBrowserVoice='';
try{preferredEngine=disk.getItem('nox.voice.engine.v2')||'natural';const savedSpeaker=disk.getItem('nox.voice.speaker.v2');$('speaker-select').value=['troy','austin','daniel'].includes(savedSpeaker)?savedSpeaker:'troy';savedBrowserVoice=disk.getItem('nox.voice.browser.v2')||'';}catch{}
voice.setSpeaker($('speaker-select').value);voice.setBrowserVoice(savedBrowserVoice);browserVoices();globalThis.speechSynthesis?.addEventListener('voiceschanged',browserVoices);
$('speaker-select').addEventListener('change',e=>{voice.setSpeaker(e.target.value);try{disk.setItem('nox.voice.speaker.v2',e.target.value);}catch{}});
$('browser-speaker').addEventListener('change',e=>{savedBrowserVoice=e.target.value;voice.setBrowserVoice(savedBrowserVoice);try{disk.setItem('nox.voice.browser.v2',savedBrowserVoice);}catch{}});
$('replay-voice').addEventListener('click',()=>{afterimageBridge.stop('voice-preview');if(!voice.enabled)toast('Turn Voice on to hear this reply.');else{const speech=spokenPreview(lastPacket.speech);stage.speak({...lastPacket,speech,action:'none'});voice.speak(speech,mode,lastPacket.emotion);}});
$('test-voice').addEventListener('click',()=>{afterimageBridge.stop('voice-preview');voice.setEnabled(true);showVoice();const speech='Oh, you found me. I was just thinking about something strange. Want to hear it?',emotion=mode==='uncanny'?'uncanny':'happy';stage.speak({speech,emotion,action:'none'});voice.speak(speech,mode,emotion);});
try{voice.setEnabled(disk.getItem('nox.voice.v2')==='on');}catch{voice.setEnabled(false);}showVoice();
try {await refreshConnection('',initialVisitStatus);if(location.pathname.replace(/\/$/,'')==='/owner'){openSettings({owner:!visit.owner});}}
catch {connection={};showConnection();$('connection-message').textContent='Could not reach the AI server. Reload to retry. Scenes and touch still work.';toast('The AI server could not be reached. No scripted reply was substituted.');}
if(visit.owner){
  const checkOwner=async()=>{try{const status=await requestVisitStatus({headers:apiHeaders()});if(!status.owner)location.replace(`/guest${location.hash}`);}catch(error){if(error.status===401)location.replace(`/guest${location.hash}`);}};
  const ownerCheck=setInterval(checkOwner,60000);window.addEventListener('pagehide',()=>clearInterval(ownerCheck),{once:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkOwner();});
}
