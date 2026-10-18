// These are observable app stages, not an account of a model's internal work.
const labels=Object.freeze({
  idle:'Idle',listening:'Listening',thinking:'Thinking','reply-ready':'Reply ready',
  preparing:'Preparing voice','voice-ready':'Voice ready',speaking:'Speaking',error:'Needs attention',
});

export function createActivitySignal({now=()=>performance.now(),onChange}={}) {
  const start=now();
  const origin=Number.isFinite(start)?start:0;
  let state='idle',version=0,activeToken=null,lastTime=0;
  let events=[Object.freeze({state:'idle',label:labels.idle,time:0})];

  function snapshot() {
    return Object.freeze({state,label:labels[state],events:Object.freeze([...events])});
  }
  function validate(value) {
    if(typeof value!=='string'||!Object.hasOwn(labels,value))throw new RangeError('Choose a supported activity state.');
  }
  function record(value,force=false) {
    validate(value);
    if(state===value&&!force)return true;
    const timestamp=now();
    if(Number.isFinite(timestamp))lastTime=Math.max(lastTime,timestamp-origin,0);
    state=value;
    events=[...events,Object.freeze({state,label:labels[state],time:lastTime})].slice(-6);
    // A readout cannot be allowed to interrupt the chat or audio it observes.
    try{onChange?.(snapshot());}catch{}
    return true;
  }

  return {
    snapshot,
    beginTurn() {
      const token=++version;activeToken=token;record('thinking',true);return token;
    },
    transition(value,token) {
      if(token!==undefined&&(activeToken===null||token!==activeToken))return false;
      return record(value);
    },
    finishTurn(token,finalState='idle') {
      if(activeToken===null||token!==activeToken)return false;
      validate(finalState);activeToken=null;return record(finalState);
    },
  };
}
