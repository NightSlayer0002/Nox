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
import {createRevisionControls,attachRevisionControls} from './revision-controls.js';
import { createNavigation } from './navigation.js';
import { readChatStream } from './stream.js';
import {readSpeechClips} from './speech-stream.js';
import { connectionState } from './connection.js';
import {createProviderControls} from './provider-controls.js';
import {attachWorkspaceViewport} from './workspace-viewport.js';
import { EXPRESSIONS } from './face-art.js';
import { knowledge,readDepth,saveDepth } from './workbench.js';
import { spokenPreview,playReplyPreview } from './reply.js';
import {createReplyPresentation} from './reply-presentation.js';
import {observeInterface} from './interface-observation.js';
import {historyFailure} from './history-notice.js';
import {attachVoiceCall} from './voice-call-controls.js';
import {attachFloatingPresence} from './floating-presence.js';
import {attachMessageCompanion} from './message-companion.js';
import {selfDeclaredName} from './name-intent.js';
import {sourceBackground} from './source-background.js';
import { afterimageBridge, applyAfterimageCue } from './afterimage-bridge.js';
import {visit,initialVisitStatus,initialVisitStatusPromise,requestVisitStatus} from './visit-scope.js';
import {attachComposerOptions,attachDetailsMenu,createComposerSizer,createReplyDiagnostics} from './conversation-controls.js';
import {createChatMessage,setChatContent} from './chat-message.js';
import {attachReplyFollow} from './reply-follow.js';
import {attachMessageSources} from './message-sources.js';
import {attachComposerSubmission} from './composer-submission.js';
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
if(history.persistent)await memory.clearHistory();
let mode = history.active().mode;
let navigation,summaryController,summaryTimer,pendingDraft,pendingPresentation,floatingPresence,messageCompanion;
let viewReady=false;
let editTarget=null,currentActivity='conversation',publicUsage=initialVisitStatus?.usage;
let brain = 'loading'; let busy = false;
let ownerToken = '', selectedProvider = '', connectionVersion = 0, connection = {}, connectionFailed=false;
const providerControls=createProviderControls([$('provider-select'),$('composer-provider')],value=>{cancelConversation();selectedProvider=value;showConnection();});
const apiHeaders = (token = ownerToken) => ({'content-type':'application/json',...(token ? {authorization:`Bearer ${token}`} : visit.owner?{'x-nox-owner':'1'}:{'x-nox-guest':'1','x-nox-visit-id':visit.id})});
const turns = createTurnGate();
let voiceCall;
const composer=createComposerSizer($('message'));
const replyFollow=attachReplyFollow({conversation:$('conversation'),button:$('latest-reply')});
const composerOptions=attachComposerOptions($('composer-options'));
const revisionControls=createRevisionControls({getEdit:()=>editTarget,setEdit:target=>{editTarget=target;},getDraft:()=>$('message').value,getThread:()=>history.active(),
  setDraft:value=>{composer.setValue(value);contextPreview();$('send-button').disabled=busy||brain==='loading'||!value.trim();},onNotice:toast,onFocus:()=>$('message').focus()});
const releaseRevisionControls=attachRevisionControls({controls:revisionControls,form:$('chat-form'),input:$('message')});
window.addEventListener('pagehide',event=>{if(!event.persisted)releaseRevisionControls();},{once:true});
attachDetailsMenu($('presence-menu'));
function closePresenceMenu(){
  $('presence-menu').open=false;
  $('presence-menu').querySelector('summary').focus({preventScroll:true});
}
$('presence-close').addEventListener('click',closePresenceMenu);
$('presence-menu').addEventListener('click',event=>{if(event.target.closest('button[data-form],button[data-scene]'))closePresenceMenu();});
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
  $('speech-pace-note').textContent=`Default pace across conversations. ${visit.owner&&approvedPreferences.persistent?'Saved on this device.':'This visit only; clears on refresh.'} Activity preferences still apply.`;
  $('inside-dialog').showModal();
  if(owner)$('owner-token').focus();
}
function setUsage(value){if(value){publicUsage=value;companionChanged();}}
function applyApprovedPreferences(){
  voice.setPace?.(approvedPreferences.context(currentActivity).speechPace??1);
  const select=$('speech-pace'),pace=approvedPreferences.context().speechPace??1;
  if(select){if(![...select.options].some(option=>Number(option.value)===pace))select.add(new Option(`${pace}× · Your pace`,String(pace)));select.value=String(pace);}
}
let preferredEngine='natural';

function toast(text) {
  $('toast').textContent = text; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500);
}

const sceneLabels = { none: 'Click to react. Drag to play.', gravity: 'Gravity is on. Pick NOX up and let go.', spotlight: 'Move the light with your cursor.', orbit: 'A small universe.', echo: 'An authored scene. Another presence.', takeover: 'Creative control: NOX.' };
const stage = new Stage($('stage'),undefined,{captionTarget:$('stage-caption')});
connectStageControls(stage,{
  sceneButtons:[...document.querySelectorAll('[data-scene]')],
  formButtons:[...document.querySelectorAll('button[data-form]')],
  expressionControls:[$('presence-expression')],
  sceneLabel:$('scene-label'),labels:sceneLabels,
  onAction:()=>{if(document.body.dataset.view!=='afterimage'&&!floatingPresence?.active)stage.canvas.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});},
  onFormChange:form=>{
    document.body.dataset.form=form;
    $('stage').setAttribute('aria-label',form!=='core'?'Animated NOX face. Move the cursor to look around. Click to make him smile, double-click or press Space to wink. Drag or use arrow keys to move him. Shake quickly while holding him for spiral eyes.':'Interactive NOX neural brain. Move the cursor to turn it. Click or press Space to release a wave. Hold and pull for stronger bursts. Drag or use arrow keys to move the brain.');
  },
});
sourceBackground.subscribe(canvas=>stage.setBackgroundSource(canvas));
for(const expression of Object.keys(EXPRESSIONS)){
  for(const select of [$('expression-preview'),$('presence-expression')]){
    const option=document.createElement('option');option.value=expression;option.textContent=expression==='pout'?'Cute outrage':expression[0].toUpperCase()+expression.slice(1);select.append(option);
  }
}
$('preview-expression').addEventListener('click',()=>{
  if(stage.form==='core'){toast('Choose Presence or Liquid Metal to try his expressions.');return;}
  stage.character.preview($('expression-preview').value,stage.time);
  stage.canvas.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
});
// The owner chose always-on NOX animation. There is no website motion switch.
stage.setMotion(true);
const voice = createVoice({
  onTiming:timing=>replyDiagnostics.playback(replyDiagnostics.capture(),timing),
  onStart: () => { stage.narrating=true;stage.character.speakingUntil = Infinity; },
  onEnd: () => { stage.narrating=false;stage.character.speakingUntil = stage.time;if(!busy)activity.transition('idle');voiceCall?.session.onVoiceEnd(); },
  onError:message=>{activity.transition('error');toast(message);voiceCall?.session.fail(message);},
  onState:state=>{
    voiceCall?.session.onVoiceState(state);
    document.body.dataset.voiceState=state;
    if(state==='preparing')activity.transition('preparing');
    else if(state==='speaking')activity.transition('speaking');
    else if(state==='ready'&&!stage.narrating)activity.transition('voice-ready');
    else if(state==='idle'&&!busy&&!stage.narrating)activity.transition('idle');
    stage.character.activity=busy||state==='preparing'?'thinking':dictating||callListening?'listening':'idle';
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
  stage.captionTargetEnabled=document.body.dataset.callOpen==='true'||chatting&&!document.body.classList.contains('film');
  stage.captionMode=document.body.dataset.callOpen==='true'?'speaking':chatting&&compactPresence.matches&&document.body.dataset.presenceExpanded!=='true'&&!document.body.classList.contains('film')?'hidden':chatting?'speaking':'linger';
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
let dictating=false,callListening=false;
const microphone = createMicrophone({
  onText: text => {composer.setValue(text);contextPreview();send(text,{source:'composer'});},
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
const callMicrophone=createMicrophone({
  onText:text=>{void voiceCall?.session.onTranscript(text);},
  onState:active=>{callListening=active;voiceCall?.session.onListening(active);stage.character.activity=busy?'thinking':active?'listening':'idle';},
  onError:message=>{toast(message);voiceCall?.session.fail(message);}
});
voiceCall=attachVoiceCall({options:{
  supported:()=>callMicrophone.supported&&voice.supported,
  startListening:()=>{if(brain==='loading')throw Error('The AI connection is not ready. Your typed draft is kept; try again when NOX is connected.');if(!['live','demo'].includes(brain))throw Error('The AI connection is not ready. Close this view and check Settings.');microphone.stop();voice.setEnabled(true);showVoice();callMicrophone.start();},
  stopListening:()=>callMicrophone.stop(),stopReply:()=>cancelConversation(),
  async submit(text){
    if(busy)throw Error('NOX is finishing another reply. Try again in a moment.');
    if(brain==='loading')throw Error('The AI connection is not ready. Your typed message is still here.');
    const packet=await send(text);
    if(!packet)throw Error(historyFailure(history,'NOX could not start or finish this reply. Check the conversation limit or connection, then try again.'));
    return {reply:packet.speech,voicePending:voice.enabled&&voice.supported};
  }
},getDraft:()=>{
  const draft={text:$('message').value,edit:editTarget,thread:history.active().id};editTarget=null;revisionControls.sync();return draft;
},restoreDraft:draft=>{
  if(draft&&(draft.text||draft.edit)&&(!$('message').value||$('message').value===draft.text)&&draft.thread===history.active().id){composer.setValue(draft.text);editTarget=draft.edit;}revisionControls.sync();
}});

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
  speak: (script,emotion,cues,lifecycle) => voice.speak(script,mode,emotion,cues,lifecycle),
  prepare: (script,emotion,cues) => voice.enabled&&voice.engine==='natural'?voice.prepare(script,mode,emotion,cues).then(audio=>Boolean(audio)):undefined,
  isSpeaking:()=>stage.narrating,
  stop() {
    voice.stop();stage.character.speakingUntil=stage.time;stage.captionUntil=0;
    stage.reset(false);
  },
  record:toggleRecording,
  startRecording,
  validateRecording:()=>recorder.preflight(captureProfile),
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
  if(turn?.sources)attachMessageSources(message,turn.sources);
  replyFollow.update(()=>$('conversation').append(message));
  return message;
}
function attachMessageActions(message,turn){
  if(!message||message.querySelector('.message-actions')||!turn)return;
  const sourceThread=history.active().id,actions=document.createElement('div');actions.className='message-actions';
  message.tabIndex=-1;message.addEventListener('pointerup',event=>{if(event.pointerType==='touch'&&!event.target.closest('button,a,textarea'))message.focus({preventScroll:true});});
  const copy=messageAction('copy',`Copy ${turn.role==='user'?'your message':'NOX’s reply'}`);copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(turn.content);toast('Copied.');}catch{toast('Copy is unavailable. Select the text and copy it with your keyboard.');}});actions.append(copy);
  const revise=messageAction(turn.role==='user'?'pencil':'rotate-ccw',turn.role==='user'?'Edit your message':'Retry NOX’s reply');
  revise.addEventListener('click',async()=>{
    if(busy){toast('Stop the current reply before revising this conversation.');return;}
    if(!viewReady){toast('This conversation is updating. Reopen it before revising.');return;}
    const target=history.revisionTarget(turn.seq,{threadId:sourceThread,role:turn.role,content:turn.content});
    if(!target){toast(historyFailure(history));return;}
    cancelConversation();
    if(turn.role==='user')revisionControls.edit(target,turn.content);
    else await revisionControls.requestRetry(target,retryRevision);
  });actions.append(revise);
  const companion=messageAction('brain','Explore this message with NOX');companion.addEventListener('click',()=>messageCompanion?.openFor(message));actions.append(companion);message.append(actions);
}
function messageAction(icon,label){
  const button=document.createElement('button');button.type='button';button.title=label;button.setAttribute('aria-label',label);
  const image=document.createElement('img');image.src=`/vendor/lucide/${icon}.svg`;image.alt='';image.width=16;image.height=16;image.setAttribute('aria-hidden','true');
  button.append(image);return button;
}
async function retryRevision(target){
  if(busy||!viewReady){toast('This conversation is updating. Try Retry again when it is ready.');return false;}
  if(editTarget!==null){toast('Finish or cancel your current edit before retrying a reply.');return false;}
  cancelConversation();const retrying=turns.begin(),result=await history.retryFrom(target);
  if(!result){if(turns.isCurrent(retrying)||history.active().id===target.threadId&&history.lastError==='revision-conflict')toast(historyFailure(history,'That reply changed. Reopen the conversation and try again.'));return false;}
  if(!turns.isCurrent(retrying))return false;
  const restored=await restoreConversation({retrying:true});if(!turns.isCurrent(restored))return false;
  await send(result.draft,{recorded:true,keepDraft:true});return true;
}

async function exploreWithNox({kind,text}){
  if(busy){toast('Let NOX finish, or stop this reply before exploring another message.');return;}
  if(kind==='read'){
    afterimageBridge.stop('conversation');voice.stop();voice.setEnabled(true);showVoice();
    if(text.length>420)toast('Reading the opening, using the same concise voice preview as Replay.');
    try{await playReplyPreview({speech:text,emotion:'curious',action:'none',memory:''},{stage,voice,mode});}catch(error){toast(error.message||'Voice is unavailable. The message is still here.');}
    return;
  }
  // An exploratory prompt is a new turn, never a replacement for an edited
  // earlier message or the user's unsent draft.
  if(editTarget!==null||$('message').value.trim()){
    toast(editTarget!==null?'Finish your current edit before exploring another message.':'Your draft is still here. Send or clear it before exploring another message.');
    $('message').focus();return;
  }
  const excerpt=text.length>4800?text.slice(0,4800)+'…':text;
  const instruction=kind==='quiz'?'Ask me one useful question at a time to check my understanding of this passage. Wait for my answer before giving feedback.':'Explain this passage clearly. Keep its original context, and point out anything uncertain or incorrect.';
  await send(`${instruction}\n\nPassage:\n${excerpt}`);
}

function updateMemory() {
  const state = memory.snapshot();
  $('memory-summary').textContent = state.name ? `He knows you as ${state.name}. ${state.facts.length ? 'A few things worth keeping.' : 'Tell him something worth keeping.'}` : 'A fresh start. Tell him your name.';
  $('memory-facts').replaceChildren();
  state.facts.slice(-4).forEach(fact => { const tag = document.createElement('span'); tag.className = 'fact'; tag.textContent = fact; $('memory-facts').append(tag); });
  if(!visit.owner)$('memory-summary').textContent='Recent messages provide context for this visit.';
  else if(memory.status.error==='unreadable-storage')$('memory-summary').textContent += ' The saved notebook cannot be read. Its original data has been left untouched.';
  else if(memory.status.error==='coordination-unavailable')$('memory-summary').textContent += ' This notebook is read-only because the browser lacks Web Locks. Saved facts are unchanged. Use a browser with Web Locks or a temporary guest visit.';
  else if (!memory.persistent) $('memory-summary').textContent += ' Storage is unavailable; this notebook lasts for this visit.';
}

async function perform(value, save = true, draft, version, depth='quick',rememberAllowed=false,sources=[]) {
  if(version!==undefined&&!turns.isCurrent(version))return;
  const packet = normalizePacket(value,depth); lastPacket = packet;
  const spoken=spokenPreview(packet.speech);
  voice.prepare(spoken,mode,packet.emotion);
  if (packet.memory&&rememberAllowed) await memory.remember(packet.memory);
  if(version!==undefined&&!turns.isCurrent(version))return;
  if (save && !await history.append('assistant', packet.speech,{sources})) {voice.stop();return;}
  if(version!==undefined&&!turns.isCurrent(version))return;
  const replyTurn=save?history.active().turns.at(-1):null;
  const presentation=createReplyPresentation({voiceEnabled:voice.enabled&&voice.supported,isCurrent:()=>version===undefined||turns.isCurrent(version),
    onWaiting:waiting=>{$('show-reply-text').hidden=!waiting;if(waiting)replyDiagnostics.setStatus('Preparing NOX’s voice…');else if($('reply-timing').textContent==='Preparing NOX’s voice…')replyDiagnostics.setStatus('');},
    onReveal:()=>{
      replyFollow.update(()=>{
        if(draft){draft.classList.remove('draft');setChatContent(draft.querySelector('.message-content'),packet.speech);attachMessageActions(draft,replyTurn);if(pendingDraft===draft)pendingDraft=null;}else{const message=addMessage('nox', packet.speech,replyTurn);attachMessageActions(message,replyTurn);}
        if(draft&&sources.length)attachMessageSources(draft,sources);
      });
      stage.speak({...packet,speech:spoken});
      if(packet.action==='takeover'&&!floatingPresence?.active)stage.canvas.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
    }});
  pendingPresentation=presentation;
  Promise.resolve(voice.speak(spoken,mode,packet.emotion,undefined,{onPlaybackStart:()=>presentation.reveal('playback'),onPlaybackUnavailable:()=>presentation.reveal('unavailable')})).catch(()=>presentation.reveal('unavailable'));
  const revealed=await presentation.ready;if(pendingPresentation===presentation)pendingPresentation=null;
  if(!revealed)return;
  $('mood-label').textContent = packet.emotion;
  $('packet-view').textContent = JSON.stringify(value.metrics?{...packet,metrics:value.metrics}:packet, null, 2); updateMemory();navigation?.render();companionChanged();
  return packet;
}

function setBusy(value) {
  if(value)revisionControls.cancelRetry();
  busy = value; $('send-button').disabled = value||brain==='loading'||!$('message').value.trim();$('send-button').hidden=value; $('chat-form').setAttribute('aria-busy', value);
  $('cancel-reply').hidden=!value;$('reply-depth').disabled=value;
  stage.character.activity = value||voice.state==='preparing' ? 'thinking' : dictating||callListening?'listening':'idle';
  companionChanged();
}

async function send(raw,{recorded=false,keepDraft=false,source='programmatic'}={}) {
  composerOptions.close();
  const text = raw.trim(); if (!text || busy) return;
  const submittedDraft=$('message').value;
  if(brain==='loading'){replyDiagnostics.setStatus('The AI connection is not ready. Your message is still here.');return;}
  if(visit.owner&&history.crossTabSafe===false){toast(historyFailure(history));return;}
  if(source==='composer'&&editTarget!==null){const editing=turns.begin(),revised=await history.replaceFrom(editTarget,text);if(!turns.isCurrent(editing))return;if(!revised){toast(historyFailure(history,'That message could not be edited. Your draft is still here.'));return;}if(revisionControls.finish(submittedDraft))keepDraft=true;const restored=await restoreConversation({retrying:true});if(!turns.isCurrent(restored))return;recorded=true;}
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
  if(source==='composer')$('message').focus({preventScroll:true});
  activityTurn=activity.beginTurn();
  const timingVersion=replyDiagnostics.begin(brain==='live'?'NOX is thinking…':'Scripted demo · no AI request');
  summaryController?.abort();clearTimeout(summaryTimer);
  const name=selfDeclaredName(text);
  if (name) await memory.setName(name);
  if(!turns.isCurrent(version))return;
  const depth=$('reply-depth').value==='deep'&&!visit.owner?'balanced':$('reply-depth').value;
  const recent=history.context();if(recorded&&recent.history.at(-1)?.role==='user')recent.history=recent.history.slice(0,-1);
  const preferences=approvedPreferences.context(currentActivity);
  const context = {...(visit.owner?memory.snapshot():{}),...recent,mode,depth,activity:currentActivity,preferences,knowledge:knowledge.context(text),interfaceState:observeInterface({stage,floating:floatingPresence,view:document.body.dataset.view,presence:document.body.dataset.presence})};
  companionBridge.propose(text,currentActivity);
  applyApprovedPreferences();
  const request=prepareChatRequest(text,context,selectedProvider,true);
  setBusy(true);
  if(!recorded&&!await history.append('user',text)){const message=historyFailure(history);cancelConversation();await restoreConversation();toast(message);return;}
  if(!turns.isCurrent(version))return;
  if(!recorded){const userTurn=history.active().turns.at(-1),message=addMessage('user', text,userTurn);attachMessageActions(message,userTurn);}if(source==='composer'&&!keepDraft&&$('message').value===submittedDraft)composer.setValue(''); contextPreview();updateMemory();navigation?.render();companionChanged();
  setBusy(true); voice.stop(); microphone.stop(); stage.character.emotion = 'curious';
  try {
    let packet;
    if (brain === 'live') {
      const requestController = new AbortController();
      turns.attach(version, requestController);
      const draft=addMessage('nox','');draft.classList.add('draft');pendingDraft=draft;
      const response = await fetch('/api/chat', { method: 'POST', headers: apiHeaders(), body: JSON.stringify(request), signal: requestController.signal });
      if(!response.ok){const error=await response.json();setUsage(error.usage);if(response.status===401){await refreshConnection();}throw new Error(error.error||'The AI connection did not respond.');}
      const result = await readChatStream(response,speech=>{if(turns.isCurrent(version)&&!voice.enabled)replyFollow.update(()=>{draft.querySelector('.message-content').textContent=speech;});});
      setUsage(result.usage);
      packet = result;
      if (turns.isCurrent(version)) {$('brain-status').lastChild.textContent = visit.owner?' AI connected':' Guest visit';const timing=result.metrics;replyDiagnostics.complete(timingVersion,timing,depth);if(timing)$('inspector-brain').textContent=`${timing.model||'Configured model'} · ${timing.depth||depth} · ${timing.provider}`;}
    } else {
      await new Promise(resolve => setTimeout(resolve, 350));
      packet = demoReply(text, context);
      if(turns.isCurrent(version))replyDiagnostics.complete(timingVersion);
    }
    if (turns.isCurrent(version)) {activity.transition('reply-ready',activityTurn);if(takeover)packet={...packet,action:'takeover'};const draft=pendingDraft;const completed=await perform(packet,true,draft,version,depth,explicitMemoryRequest(text),brain==='live'?request.context.knowledge:[]);if(turns.isCurrent(version)){pendingDraft=null;scheduleSummary();return completed;}}
  } catch (error) {
    if (turns.isCurrent(version)){setUsage(error.usage);pendingDraft?.remove();pendingDraft=null;if(error.name!=='AbortError'){activity.finishTurn(activityTurn,'error');if(source==='composer'&&!$('message').value){composer.setValue(text);contextPreview();}stage.character.react?.('worried',stage.time,2);if (brain === 'live') $('brain-status').lastChild.textContent = ' AI error'; addMessage('system', error.message); toast(error.message);replyDiagnostics.setStatus('Reply interrupted. Your message is still in this visit.');}}
  } finally { if (turns.isCurrent(version)) { setBusy(false); } }
}

const greetings = {
  companion: 'Oh. You found me. I’m NOX. Move your cursor. I have opinions about its confidence.',
  director: 'The lighting is good. The mysterious little character needs more screen time. I’ll handle that.',
  uncanny: 'Leave a little room in the frame. We might need it later.',
};
async function setMode(next, greet = true) {
  cancelConversation();
  const version=turns.begin();if(!await history.setMode(next)||!turns.isCurrent(version))return;
  mode = next; await memory.setMode(mode);if(!turns.isCurrent(version))return;stage.setMode(mode); document.body.dataset.persona = mode;
  $('mood-label').textContent = stage.character.emotion;
  document.querySelectorAll('[data-mode]').forEach(button => { const active = button.dataset.mode === mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
  if (greet) await perform({ speech: greetings[mode], emotion: mode === 'uncanny' ? 'uncanny' : 'curious', action: 'none', memory: '' },false,undefined,version);
  return version;
}

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => send(button.dataset.prompt)));
attachComposerSubmission({input:$('message'),form:$('chat-form'),onSend:text=>send(text,{source:'composer'})});
$('cancel-reply').addEventListener('click',()=>{cancelConversation();replyDiagnostics.setStatus('Reply stopped. Your sent message is saved.');});
$('show-reply-text').addEventListener('click',()=>pendingPresentation?.reveal('requested'));
function contextPreview(){const notes=knowledge.context($('message').value);$('knowledge-context').hidden=!notes.length;$('knowledge-context').textContent=notes.length?'Relevant context for this thought: '+notes.map(n=>`[${n.id}] ${n.title}`).join(' · '):'';}
function depthNote(){const depth=$('reply-depth').value;$('depth-note').textContent=depth==='deep'?'Developer mode: deeper replies use more time and model allowance. Voice reads a concise opening.':depth==='quick'?'Quick keeps the response brief. Complete written answers stay in the conversation.':'Balanced gives an everyday explanation room to finish. Voice reads a concise opening.';}
$('reply-depth').value=readDepth();depthNote();
for(const option of $('reply-depth').options)option.disabled=!visit.owner&&option.value==='deep';
$('reply-depth').addEventListener('change',()=>{saveDepth($('reply-depth').value);depthNote();});
$('message').addEventListener('input',()=>{
  contextPreview();$('send-button').disabled=busy||brain==='loading'||!$('message').value.trim();
  const input=$('chat-form').getBoundingClientRect(),frame=stage.canvas.getBoundingClientRect();
  if(frame.width&&frame.height)stage.character.attendTo?.({x:(input.left+input.width*.6-frame.left)/frame.width,y:(input.top+20-frame.top)/frame.height},stage.time);
});window.addEventListener('nox:knowledge',contextPreview);window.addEventListener('storage',contextPreview);
document.querySelector('.skip-link')?.addEventListener('click',event=>{event.preventDefault();$('workspace-main').focus();});
for(const voiceControl of [$('voice-button'),$('composer-voice')])voiceControl.addEventListener('click', () => {
  const enabled = changeVoiceConfiguration(()=>voice.setEnabled(!voice.enabled));
  showVoice();
  try{disk.setItem('nox.voice.v2',enabled?'on':'off');}catch{}
  if (enabled && !busy && afterimageBridge.snapshot().status!=='playing') playReplyPreview(lastPacket,{stage,voice,mode});
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
  } catch (error) { if(error.name!=='AbortError')toast(error.message); }
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
$('clear-memory').addEventListener('click', async () => {
  cancelConversation();const saved=await memory.clear();
  updateMemory();toast(saved?'The saved name and notebook facts are cleared. Conversations remain in Chats.':'The saved notebook could not be changed. Its original data is protected; check browser storage before trying again.');
});
$('inside-button').addEventListener('click', () => { $('packet-view').textContent = JSON.stringify(lastPacket, null, 2); openSettings(); });
$('settings-button').addEventListener('click', () => openSettings());
$('speech-pace')?.addEventListener('change',async event=>{
  const select=event.currentTarget;if(select.disabled)return;
  const proposal=approvedPreferences.propose(`Speak at ${Number(select.value)}x`,'general');
  select.disabled=true;$('speech-pace-note').textContent='Applying your default pace…';
  try{
    if(!proposal||!await approvedPreferences.approve(proposal))throw new Error('Preference not applied');
    companionBridge.preferenceChanged();
    $('speech-pace-note').textContent=visit.owner&&approvedPreferences.persistent?'Default pace saved on this device. Activity preferences still apply.':'Default pace applies across conversations for this visit; clears on refresh. Activity preferences still apply.';
  }catch{
    applyApprovedPreferences();$('speech-pace-note').textContent='Could not apply this pace. Your previous preference is unchanged.';
  }finally{select.disabled=false;}
});
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
});
window.addEventListener('pagehide', event => { if(event.persisted)voiceCall?.session.end();else voiceCall?.dispose();afterimageBridge.stop('pagehide');ownerToken=''; camera.stop(); voice.stop(); microphone.stop();callMicrophone.stop(); });
window.addEventListener('hashchange',()=>{revisionControls.cancelRetry();if(location.hash==='#afterimage'){cancelConversation();stage.caption='';stage.captionUntil=0;}else afterimageBridge.stop('navigation');requestAnimationFrame(composer.resize);});
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

function cancelConversation(){afterimageBridge.stop('conversation');turns.cancel();pendingPresentation?.cancel();pendingPresentation=null;activity.finishTurn(activityTurn);replyDiagnostics.invalidate();replyDiagnostics.setStatus('');setBusy(false);voice.stop();microphone.stop();summaryController?.abort();clearTimeout(summaryTimer);pendingDraft?.remove();pendingDraft=null;}
async function restoreConversation({retrying=false}={}){viewReady=false;messageCompanion?.clear();cancelConversation();const selected=history.active(),restored=await setMode(selected.mode,false);if(!turns.isCurrent(restored)||history.active().id!==selected.id)return;const thread=history.active();$('conversation').replaceChildren();$('chat-title').textContent=thread.title;
  thread.turns.forEach(turn=>{const message=addMessage(turn.role==='user'?'user':'nox',turn.content,turn);attachMessageActions(message,turn);});
  replyFollow.latest();
  const last=thread.turns.findLast(t=>t.role==='assistant');lastPacket={speech:last?.content||(thread.turns.length?'Your last message is still here. Ready when the AI connection is available.':greetings[mode]),emotion:stage.character.emotion,action:'none',memory:''};
  if(last){stage.caption=last.content;stage.captionUntil=0;}
  else if(thread.turns.length){if(!retrying)addMessage('system','Your last message is still here. Send it again to retry.');stage.caption='';stage.captionUntil=0;}
  else{stage.caption='';stage.captionUntil=0;}
  replyDiagnostics.clear();composer.resize();$('summary-note').textContent=thread.summary?'Older model context is summarized. The transcript remains available in Chats.':'';navigation?.render();updateMemory();companionChanged();
  viewReady=true;return restored;
}
function scheduleSummary(){clearTimeout(summaryTimer);if(!visit.owner||brain!=='live'||!history.summaryWork()||selectedProvider==='openai')return;summaryTimer=setTimeout(async()=>{
  const work=history.summaryWork();if(!work||busy)return;const controller=new AbortController();summaryController=controller;
  try{const response=await fetch('/api/summary',{method:'POST',headers:apiHeaders(),body:JSON.stringify({previous:work.previous,turns:work.turns,provider:selectedProvider}),signal:controller.signal});if(!response.ok)throw Error('summary');const result=await response.json();if(!controller.signal.aborted&&await history.applySummary(work,result.summary,{signal:controller.signal})&&history.active().id===work.id)$('summary-note').textContent='Older model context is summarized. The transcript remains available in Chats.';}
  catch(error){if(error.name!=='AbortError'&&history.active().id===work.id)$('summary-note').textContent='Summary will retry after a later turn. The transcript remains available in Chats.';}
  finally{if(summaryController===controller)summaryController=null;}
},3000);}
async function newConversation(){
  if(!revisionControls.canLeave())return false;
  cancelConversation();
  const starting=turns.begin(),thread=await history.create();if(!turns.isCurrent(starting))return false;if(!thread){toast(historyFailure(history));return false;}
  editTarget=null;currentActivity='conversation';const restored=await restoreConversation();return turns.isCurrent(restored);
}
navigation=createNavigation({history,onOpen:async id=>{if(!revisionControls.canLeave())return;cancelConversation();const opening=turns.begin();editTarget=null;currentActivity='conversation';const selected=await history.select(id);if(!turns.isCurrent(opening))return;await restoreConversation();if(!selected)toast('That conversation was removed in another tab.');},onNew:newConversation,onStart:async(text,persona)=>{if(!revisionControls.canLeave())return;const started=await setMode(persona,false);if(turns.isCurrent(started))await send(text);}});
messageCompanion=attachMessageCompanion({conversation:$('conversation'),onAction:exploreWithNox});
floatingPresence=attachFloatingPresence({stage,onInspect:value=>messageCompanion.inspect(value),onRelease:value=>messageCompanion.release(value),onClear:()=>messageCompanion.clear()});
window.addEventListener('pagehide',event=>{if(!event.persisted){floatingPresence.dispose();messageCompanion.dispose();}},{once:true});
history.subscribe(({currentChanged})=>{if(currentChanged)void restoreConversation();else navigation.render();});
const releaseMemory=memory.subscribe(()=>{updateMemory();});
window.addEventListener('pagehide',event=>{if(!event.persisted){releaseMemory();memory.dispose();history.dispose();}},{once:true});
await restoreConversation();
companionBridge.connect({
  snapshot:()=>({usage:publicUsage,owner:visit.owner}),
  async fresh(){if(!await newConversation())return;navigation.setView('conversation');},
  async start(text,kind='conversation'){if(brain==='loading'){toast('The AI connection is not ready. Your current work is kept; try again when NOX is connected.');return;}if(!await newConversation())return;currentActivity=['conversation','explore','mystery'].includes(kind)?kind:'conversation';navigation.setView('conversation');await send(text);},
  preferenceChanged:applyApprovedPreferences,
});
EverydayBridge.connect({
  async ask(message,{activity:source}={}){if(brain==='loading'){toast('The AI connection is not ready. Your current work is kept; try again when NOX is connected.');return;}if(!await newConversation())return;currentActivity=(typeof source==='string'?source:source?.kind)==='explore'?'explore':'conversation';if(source?.state)rememberActivity('explore',{state:source.state,id:source.id});navigation.setView('conversation');await send(message);},
  speak(text,{activity:source}={}){const scope=['explore','guessing'].includes(source)?source:currentActivity;voice.setPace?.(approvedPreferences.context(scope).speechPace??1);voice.setEnabled(true);showVoice();const speech=spokenPreview(text);stage.speak({speech,emotion:'curious',action:'none',memory:''});return voice.speak(speech,mode,'curious');},
  stop(){voice.stop();stage.captionUntil=0;},
  proposePreference(value){const words=value.key==='learningStyle'?(value.value==='hints'?'One clue at a time':'Explain first'):value.key==='gameQuestionLimit'?`Use ${value.value} questions in the guessing game`:value.key==='gameHints'?`Turn hints ${value.value?'on':'off'} in the guessing game`:value.origin;return companionBridge.propose(words,value.scope);},
});
applyApprovedPreferences();

function changeVoiceConfiguration(change){
  pendingPresentation?.reveal('requested');
  if(voiceCall?.session.snapshot().status==='preparing')voiceCall.session.fail('Voice changed. Reconnect the microphone to continue.');
  return change();
}
function showVoice() {
  $('voice-button').setAttribute('aria-pressed',voice.enabled);
  $('voice-button').querySelector('span').textContent=voice.enabled?'Voice on':'Voice off';
  $('composer-voice').setAttribute('aria-pressed',voice.enabled);$('composer-voice').setAttribute('aria-label',voice.enabled?'Spoken replies on':'Spoken replies off');$('composer-voice').title=voice.enabled?'Spoken replies are on. Turn voice off.':'Spoken replies are off. Turn voice on.';
  $('composer-voice').querySelector('.composer-voice-label').textContent=voice.enabled?'Voice on':'Voice off';
  $('voice-engine').value=voice.engine;
  $('natural-speaker-row').hidden=voice.engine!=='natural';
  $('browser-speaker-row').hidden=voice.engine!=='browser';
  $('voice-note').textContent=voice.engine==='natural'?'This is an AI-generated voice. Each reply uses your configured speech provider’s quota.':'Browser voice is free. Quality depends on the voices available on your device.';
  afterimageBridge.refreshState();
}
function showConnection() {
  const state=connectionState(connection,selectedProvider),provider=state.provider;brain=state.kind;
  const labels={locked:'AI locked',loading:connectionFailed?'AI unavailable':'Connecting…',unconfigured:'AI unavailable',demo:'Scripted demo'};
  $('brain-status').lastChild.textContent=brain==='live'?` ${visit.owner?provider.name:'Guest visit'}`:` ${labels[brain]}`;
  const note=brain==='live'?`Model-generated replies · ${provider.name}. Your name, notebook, and conversation context travel with each turn. Camera stays local.`:brain==='locked'?'Your AI brain is locked. Unlock it once in Settings; access lasts up to 12 hours in this browser. Scenes and touch still work.':brain==='demo'?'You selected the scripted demo. Switch to a configured AI provider for fresh conversation.':brain==='loading'?connectionFailed?'Could not reach the AI server. Retry the connection; your draft and local activities are still here.':'Checking the AI connection… You can write your message or explore a local activity.':'No AI provider is configured. Add a server key to enable conversation; scenes and touch still work.';
  const scopeNote=!visit.owner&&brain==='live'?'NOX Free · complete everyday answers. Chats and preferences clear when you refresh. Natural voice has a separate allowance.':note;
  $('brain-status').title=scopeNote;$('brain-note').textContent=scopeNote;
  $('connection-message').textContent=scopeNote;$('connection-help').hidden=brain==='live';$('unlock-ai').hidden=brain==='demo';
  $('unlock-ai').textContent=brain==='locked'?'Unlock AI ':connectionFailed?'Retry AI connection':'Connection settings ';
  $('unlock-ai').disabled=brain==='loading'&&!connectionFailed;
  $('send-button').disabled=busy||brain==='loading'||!$('message').value.trim();
  if(brain!=='loading'&&$('reply-timing').textContent==='The AI connection is not ready. Your message is still here.')replyDiagnostics.setStatus('');
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
  ownerToken=''; connection=status;connectionFailed=false;setUsage(status.usage);
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
$('voice-engine').addEventListener('change',event=>{preferredEngine=event.target.value;changeVoiceConfiguration(()=>voice.setEngine(preferredEngine));try{disk.setItem('nox.voice.engine.v2',preferredEngine);}catch{}showVoice();});
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
$('unlock-ai').addEventListener('click',async()=>{
  if(!connectionFailed){openSettings({owner:brain==='locked'});return;}
  connectionFailed=false;showConnection();
  try{await refreshConnection();}catch{connectionFailed=true;showConnection();toast('The AI connection is still unavailable. Your draft and local activities are kept.');}
});
function browserVoices(){const voices=globalThis.speechSynthesis?.getVoices().filter(v=>v.lang?.startsWith('en'))||[];const selected=$('browser-speaker').value;$('browser-speaker').replaceChildren(new Option('Automatic',''),...voices.map(v=>new Option(v.name,v.name)));$('browser-speaker').value=selected||savedBrowserVoice;}
let savedBrowserVoice='';
try{preferredEngine=disk.getItem('nox.voice.engine.v2')||'natural';const savedSpeaker=disk.getItem('nox.voice.speaker.v2');$('speaker-select').value=['troy','austin','daniel'].includes(savedSpeaker)?savedSpeaker:'troy';savedBrowserVoice=disk.getItem('nox.voice.browser.v2')||'';}catch{}
voice.setSpeaker($('speaker-select').value);voice.setBrowserVoice(savedBrowserVoice);browserVoices();globalThis.speechSynthesis?.addEventListener('voiceschanged',browserVoices);
$('speaker-select').addEventListener('change',e=>{changeVoiceConfiguration(()=>voice.setSpeaker(e.target.value));try{disk.setItem('nox.voice.speaker.v2',e.target.value);}catch{}});
$('browser-speaker').addEventListener('change',e=>{savedBrowserVoice=e.target.value;changeVoiceConfiguration(()=>voice.setBrowserVoice(savedBrowserVoice));try{disk.setItem('nox.voice.browser.v2',savedBrowserVoice);}catch{}});
$('replay-voice').addEventListener('click',()=>{if(document.body.dataset.view!=='conversation')return;afterimageBridge.stop('voice-preview');if(!voice.enabled)toast('Turn Voice on to hear this reply.');else playReplyPreview(lastPacket,{stage,voice,mode});});
$('test-voice').addEventListener('click',()=>{afterimageBridge.stop('voice-preview');voice.setEnabled(true);showVoice();const speech='Oh, you found me. I was just thinking about something strange. Want to hear it?',emotion=mode==='uncanny'?'uncanny':'happy';stage.speak({speech,emotion,action:'none'});voice.speak(speech,mode,emotion);});
try{voice.setEnabled(disk.getItem('nox.voice.v2')==='on');}catch{voice.setEnabled(false);}showVoice();
showConnection();
try {await refreshConnection('',await initialVisitStatusPromise);if(location.pathname.replace(/\/$/,'')==='/owner'){openSettings({owner:!visit.owner});}}
catch {connection={};connectionFailed=true;showConnection();toast('The AI server could not be reached. No scripted reply was substituted.');}
if(visit.owner){
  const checkOwner=async()=>{try{const status=await requestVisitStatus({headers:apiHeaders()});if(!status.owner)location.replace(`/guest${location.hash}`);}catch(error){if(error.status===401)location.replace(`/guest${location.hash}`);}};
  const ownerCheck=setInterval(checkOwner,60000);window.addEventListener('pagehide',()=>clearInterval(ownerCheck),{once:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkOwner();});
}
