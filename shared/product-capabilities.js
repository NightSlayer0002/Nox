import {ACTIONS} from './character.js';

// Build this from verified server access, never from request-body context.
// These are shipped controls and routes, not a product roadmap.
export function capabilitiesForModel({owner=false,naturalVoice=false}={}) {
  const isOwner=owner===true,base=isOwner?'/owner':'/guest';
  return {
    product:'NOX is an expressive everyday AI companion for conversation, curiosity and play. Creative scenes are optional.',
    visit:isOwner?'owner':'guest',
    routes:{conversation:`${base}#conversation`,discover:`${base}#discover`,explore:`${base}#learn`,guessing:`${base}#guessing`,preferences:`${base}#memory`,access:`${base}#access`,sceneStudio:`${base}#scenes`,afterimage:`${base}#afterimage`,library:`${base}#library`},
    controls:{scenes:ACTIONS.filter(action=>action!=='none').map(action=>action[0].toUpperCase()+action.slice(1)),recording:['Camera','Film mode','Record clip'],settings:['Settings','Speech pace','Stop','Preferences','Access'],preferences:isOwner?['Remember this','Not now','Forget preference','Export preferences','Import preferences']:['Apply for this visit','Not now','Forget preference'],explore:['Explore with NOX','Explain first','One clue at a time','Next clue','Move the Moon around Earth'],guessing:['Ask','Guess','Give me a hint','Play another round'],afterimage:['Play example','Play this cut','Capture 28 seconds','Edit this cut','Export script','Export story data']},
    conversation:{depths:isOwner?['quick','balanced','deep']:['quick','balanced'],defaultDepth:isOwner?'quick':'balanced',savedHistory:isOwner,notebookContext:true,storage:isOwner?'Private developer history and preferences stay in this browser.':'Guest chats, activities and approved preferences are temporary and clear on refresh. There is no public login, cloud sync or account saving yet.',notes:isOwner?'Notebook notes can be stored on this device and selected as context.':'Notebook is a temporary scratchpad; selected excerpts can accompany chat. An exploration passage stays only for this visit.'},
    plans:{current:isOwner?'developer':'free',plus:{status:'planned',purchasable:false},ownerAccess:'Private developer access; not a paid subscription.'},
    afterimage:{authoredExample:true,customGeneration:isOwner,output:'Fictional micro-story: three branches, two endings each; four spoken cues in a 28-second performance. Custom generation needs an owner session and configured text provider.'},
    activities:{explore:'One authored, interactive Moon phases explanation with a draggable angle slider, hint-first or explanation-first approach, and a recap. Other questions and passages open chat; arbitrary generated simulations are not supported.',guessing:'A local guessing game with a fixed visible collection of 16 objects, supported yes/no questions, guesses, optional hints and a bounded turn limit. No AI request is needed to play.',mystery:'The authored Afterimage branching story is the playable mystery. It is fiction, not real surveillance or a signal from an external intelligence.'},
    voice:{browser:true,natural:naturalVoice===true,recording:'Captioned local WebM includes enabled Orpheus audio; browser speech and microphone audio are not captured.'},
    cameraVision:false,
    externalTools:false,
  };
}

export function productInstructions(productCapabilities=capabilitiesForModel()) {
  return `Server-owned product capabilities:\n${JSON.stringify(productCapabilities)}
Use these facts for product guidance. Name only the supplied routes and controls; do not invent UI, claim a setting changed, or claim an export/generation happened from chat. There are no "Add Visual Beat" or "Render Scene" buttons. Scene studio offers the listed effects and local capture, not AI image/video generation or arbitrary scene rendering. Afterimage is optional branching fiction; guests can play, edit and export its authored example, while custom generation requires private developer access. Owner access is not a public paid plan; Plus is not on sale. Explore has one authored Moon model, not arbitrary generated simulations. The guessing game uses only its supported collection and controls. Guest chats, notes, activities and approved preferences clear on refresh. Never direct guests to Keep this, Continue or cloud account saving; those features are unavailable. Guest preference changes require approval and affect only the current visit. Private developer history and preferences are separate. If asked for an unavailable feature, say so briefly and offer an actual option. Do not steer ordinary conversation into story production. Camera is a local preview; you receive no camera images. Voice input is explicit dictation, never background listening. Stop deliberately ends speech; casual pokes and dragging do not. Browser support, provider availability and quota can limit a listed feature.`;
}
