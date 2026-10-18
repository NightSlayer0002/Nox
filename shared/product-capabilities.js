import {ACTIONS} from './character.js';

// Build this from verified server access, never from request-body context.
// These are shipped controls and routes, not a product roadmap.
export function capabilitiesForModel({owner=false,naturalVoice=false}={}) {
  const isOwner=owner===true,base=isOwner?'/owner':'/guest';
  return {
    product:'NOX is a conversational companion for questions, ideas and company. Creative scenes are optional.',
    visit:isOwner?'owner':'guest',
    routes:{conversation:`${base}#conversation`,sceneStudio:`${base}#scenes`,afterimage:`${base}#afterimage`,library:`${base}#library`},
    controls:{scenes:ACTIONS.filter(action=>action!=='none').map(action=>action[0].toUpperCase()+action.slice(1)),recording:['Camera','Film mode','Record clip'],settings:['Settings','Owner access','Sign in'],afterimage:['Play example','Play this cut','Capture 28 seconds','Edit this cut','Export script','Export story data']},
    conversation:{depths:isOwner?['quick','balanced','deep']:['quick'],savedHistory:isOwner,notebookContext:isOwner,storage:isOwner?'Plaintext in this browser; no cloud sync.':'Temporary for this visit; cleared on refresh.'},
    afterimage:{authoredExample:true,customGeneration:isOwner,output:'Fictional micro-story: three branches, two endings each; four spoken cues in a 28-second performance. Custom generation needs an owner session and configured text provider.'},
    voice:{browser:true,natural:naturalVoice===true,recording:'Captioned local WebM includes enabled Orpheus audio; browser speech and microphone audio are not captured.'},
    cameraVision:false,
    externalTools:false,
  };
}

export function productInstructions(productCapabilities=capabilitiesForModel()) {
  return `Server-owned product capabilities:\n${JSON.stringify(productCapabilities)}
Use these facts for product guidance. Name only the supplied routes and controls; do not invent UI, claim a setting changed, or claim an export/generation happened from chat. There are no "Add Visual Beat" or "Render Scene" buttons. Scene studio offers the listed effects and local capture, not AI image/video generation or arbitrary scene rendering. Afterimage is optional branching fiction; guests can play, edit and export its authored example, while custom generation requires owner access. If asked for an unavailable feature, say so briefly and offer an actual option. Do not steer ordinary conversation into story production. Camera is a local preview; you receive no camera images. Voice input is explicit dictation, never background listening. Browser support, provider availability and quota can limit a listed feature.`;
}
