let segmenter;

export function graphemes(text) {
  if (typeof Intl.Segmenter === 'function') {
    segmenter ??= new Intl.Segmenter(undefined,{granularity:'grapheme'});
    return [...segmenter.segment(text)].map(part=>part.segment);
  }
  // Older engines keep Unicode runs and their adjacent ASCII characters whole.
  // This can omit more text, but cannot cut a combining or joined character.
  const parts=[];let unicode=false;
  for(const point of text) {
    const ascii=point.codePointAt(0)<128;
    if((!ascii||unicode||(point==='\n'&&parts.at(-1)==='\r'))&&parts.length)parts[parts.length-1]+=point;
    else parts.push(point);
    unicode=!ascii;
  }
  return parts;
}

export function textPrefix(text,limit) {
  let prefix='';
  for(const part of graphemes(text)) {
    if(prefix.length+part.length>limit)break;
    prefix+=part;
  }
  return prefix;
}

export function captionLines(text,measure,maxWidth,maxLines=4) {
  const lines=[];let line='',clipped=false;
  words:for(const word of String(text).trim().split(/\s+/)) {
    if(!word)continue;
    const next=line?`${line} ${word}`:word;
    if(measure(next)<=maxWidth){line=next;continue;}
    if(line){lines.push(line);line='';}
    for(const part of graphemes(word)) {
      if(measure(line+part)>maxWidth) {
        if(line){lines.push(line);line='';}
        if(measure(part)>maxWidth){clipped=true;break words;}
      }
      line+=part;
    }
  }
  if(line)lines.push(line);
  const shown=lines.slice(0,maxLines);
  if(clipped||lines.length>maxLines) {
    if(!shown.length)shown.push('');
    const parts=graphemes(shown.at(-1).trimEnd());
    while(parts.length&&measure(parts.join('')+'…')>maxWidth)parts.pop();
    shown[shown.length-1]=measure('…')<=maxWidth?parts.join('')+'…':'';
  }
  return shown.filter(Boolean);
}
