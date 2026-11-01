// A small audible unit, not an automatic whole-repository voice tour. Four
// <=160-character explanations fit four public speech requests without chunks.
export function parseNarration(text,{startLine,endLine}){
  if(!Number.isInteger(startLine)||!Number.isInteger(endLine)||endLine<startLine||endLine-startLine>=4)throw Error('Choose up to four code lines for a spoken walkthrough.');
  const lines=String(text).trim().split('\n').filter(line=>line.trim());
  if(lines.length!==endLine-startLine+1)throw Error('NOX did not provide an explanation for every selected line. The written answer is kept; no voice request was made.');
  return lines.map((value,index)=>{
    const match=value.match(/^\[L(\d+)\]\s+(.+)$/),line=startLine+index;
    if(!match||Number(match[1])!==line||match[2].length>160)throw Error('This answer could not be aligned safely to the selected lines. The written answer is kept; no voice request was made.');
    return {line,text:`Line ${line}: ${match[2]}`};
  });
}

export function createLineNarration({voice,onLine=()=>{},onState=()=>{}}){
  let version=0,active=false;
  function stop(){version++;active=false;voice.stop();onLine(null);onState('stopped');}
  function start(segments){
    stop();const owner=version;active=true;
    const current=()=>active&&owner===version;
    function next(index){
      if(!current())return;
      if(index===segments.length){active=false;onLine(null);onState('ended');return;}
      const segment=segments[index];onState('preparing',segment.line);
      let settled=false;
      const fail=result=>{if(!current()||settled)return;settled=true;active=false;onLine(null);onState('error',segment.line,result?.message);};
      const options={
        onPlaybackStart:()=>{if(current()&&!settled){onLine(segment.line);onState('speaking',segment.line);}},
        onPlaybackEnd:()=>{if(current()&&!settled){settled=true;onLine(null);queueMicrotask(()=>next(index+1));}},
        onPlaybackUnavailable:fail,onPlaybackError:fail,
        onPlaybackCancel:()=>{if(current()&&!settled){settled=true;active=false;onLine(null);onState('stopped');}},
      };
      try{Promise.resolve(voice.speak(segment.text,options)).catch(error=>fail(error));}catch(error){fail(error);}
    }
    next(0);
  }
  return {start,stop,get active(){return active;}};
}
