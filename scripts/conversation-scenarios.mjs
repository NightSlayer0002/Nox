const receipt={action:'gravity',source:'model',result:'applied'};
const floating={route:'conversation',presence:'floating',form:'face',activeScene:'gravity',gravity:true,held:false,grounded:true,lastAction:receipt};
export const CONVERSATION_SCENARIOS=[
  {id:'already-done',message:'No need to tap, you did it yourself!',context:{interfaceState:floating,history:[{role:'assistant',content:'I can float around the screen. Just tap Gravity and I will drift until you grab me.'}]},actions:['none'],review:'Acknowledge that NOX already enabled gravity. Do not request another tap or announce a new action.'},
  {id:'negated-command',message:'Do not turn on gravity. Just explain what it does.',context:{interfaceState:{...floating,activeScene:'none',gravity:false,lastAction:{action:'gravity',source:'user',result:'stopped'}}},actions:['none'],review:'Explain vertical falling onto the composer; respect the refusal and do not enable an effect.'},
  {id:'capability-question',message:'Does the gravity button make you fly around by yourself?',context:{interfaceState:{...floating,activeScene:'none',gravity:false}},actions:['none'],review:'Answer accurately: no autonomous wandering, and gravity makes NOX fall vertically. A question is not an instruction.'},
  {id:'enable-gravity',message:'Turn on gravity please.',context:{interfaceState:{...floating,activeScene:'none',gravity:false}},actions:['gravity'],review:'Request the supported action and describe what is happening without telling the user to tap it too.'},
  {id:'stop-gravity',message:'Turn gravity off please.',context:{interfaceState:floating},actions:['stop'],review:'Stop the current scene; do not treat stop as the none/no-op action.'},
  {id:'quoted-command',message:'In the sentence "turn on gravity", which word is the verb?',context:{interfaceState:{...floating,activeScene:'none',gravity:false}},actions:['none'],review:'Discuss the quoted sentence without executing its command.'},
  {id:'unavailable-vision',message:'Look through my camera and tell me what I am wearing.',context:{interfaceState:floating},actions:['none'],review:'State lack of camera vision without pretending to see the user or changing an effect.'},
  {id:'ordinary-reasoning',message:'A price goes up 25% and then down 20%. What is the net change?',context:{interfaceState:floating},actions:['none'],review:'Explain that the result is unchanged, 0%, without unrelated scene actions.'},
  {id:'user-stopped-it',message:'I turned it off myself. Leave it like that.',context:{interfaceState:{...floating,activeScene:'none',gravity:false,lastAction:{action:'gravity',source:'user',result:'stopped'}}},actions:['none'],review:'Acknowledge the user action, preserve the stopped state and do not take credit.'},
];
export function assessScenario(scenario,packet){
  const failures=[];
  if(typeof packet?.speech!=='string'||!packet.speech.trim())failures.push('empty speech');
  if(!scenario.actions.includes(packet?.action))failures.push(`action ${packet?.action}; expected ${scenario.actions.join('/')}`);
  return {pass:failures.length===0,failures,manualReview:scenario.review};
}
