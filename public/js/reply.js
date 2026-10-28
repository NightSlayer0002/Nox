// Full answers stay in text/history. Voice reads a concise opening to bound
// speech latency and free-tier usage independently from reasoning depth.
import {textPrefix} from './text-layout.js';

export function spokenPreview(value,limit=420){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  limit=Math.max(0,Math.min(420,Number.isFinite(limit)?Math.floor(limit):420));
  if(!limit)return '';
  if(text.length<=limit)return text;
  let sentence='';
  if(typeof Intl.Segmenter==='function') {
    for(const part of new Intl.Segmenter(undefined,{granularity:'sentence'}).segment(text)) {
      const opening=text.slice(0,part.index+part.segment.length).trimEnd();
      if(opening.length>limit)break;
      sentence=opening;
    }
  } else {
    for(const match of text.matchAll(/[。！？]|[.!?](?=\s|$)/gu)) {
      const end=match.index+match[0].length;
      if(end>limit)break;
      if(textPrefix(text,end).length===end)sentence=text.slice(0,end);
    }
  }
  if(sentence.length>limit*.25)return sentence;
  const opening=textPrefix(text,limit-1);let end=0;
  if(typeof Intl.Segmenter==='function') {
    for(const part of new Intl.Segmenter(undefined,{granularity:'word'}).segment(text)) {
      const boundary=part.index+part.segment.length;
      if(boundary>opening.length)break;
      if(part.isWordLike)end=boundary;
    }
  } else {
    const boundary=opening.lastIndexOf(' ');
    if(textPrefix(opening,boundary).length===boundary)end=boundary;
  }
  return (end>limit*.25?opening.slice(0,end):opening).trimEnd()+'…';
}

// Voice-on and Replay are the same non-destructive playback operation.
export function playReplyPreview(packet,{stage,voice,mode}){
  const speech=spokenPreview(packet.speech);
  stage.speak({...packet,speech,action:'none'});
  return voice.speak(speech,mode,packet.emotion);
}
