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
