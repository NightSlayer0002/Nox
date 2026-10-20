// Small adapter boundary: the activity UI never receives access keys or stage objects.
export function createEverydayBridge(){
  let adapter=null;
  const requireHandler=key=>{if(typeof adapter?.[key]!=='function')throw new Error(key==='save'?'Saving is not ready. Your activity is still open.':'NOX is connecting. Try again in a moment.');return adapter[key];};
  return Object.freeze({
    connect(handlers={}){adapter=handlers;return ()=>{if(adapter===handlers)adapter=null;};},
    ask(message,{activity}={}){if(typeof message!=='string'||!message.trim())throw new Error('Add an idea or passage first.');const request=message.trim();if(request.length>6000)throw new Error('This request is too long. Shorten the passage before opening a conversation.');return requireHandler('ask')(request,{activity});},
    speak(value,{activity}={}){if(typeof value!=='string'||!value.trim())return false;return requireHandler('speak')(value.trim().slice(0,1600),{activity:['explore','guessing'].includes(activity)?activity:undefined});},
    stop(){return adapter?.stop?.();},
    save(value){if(!value||!['explore','guessing'].includes(value.kind)||!value.state)throw new Error('This activity cannot be saved yet.');return requireHandler('save')({...value,title:String(value.title||'NOX activity').slice(0,100)});},
    proposePreference(value){return requireHandler('proposePreference')(value);},
  });
}
export const everydayBridge=createEverydayBridge();
export const EverydayBridge=everydayBridge;
