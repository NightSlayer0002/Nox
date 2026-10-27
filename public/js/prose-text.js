// A deliberately small plain-text presentation layer, not an HTML/Markdown
// interpreter. Preserve code and paths byte-for-byte and keep the stored reply.
const protectedText=/```[\s\S]*?(?:```|$)|`[^`\n]*`|^(?: {4}|\t).*(?:\n(?: {4}|\t).*)*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|(?:[A-Za-z]:\\|\\\\)[^\s<>"']+|https?:\/\/[^\s<>]+|(?<!\S)\/(?:[^/\s]+\/)+[^\s<>"']*/gm;
function breaks(text){
  return text
    // Only obvious prose boundaries are decoded. Literal escapes in an
    // explanation, source code or a filename are not globally replaced.
    .replace(/\\n(?:\\n)+/g,'\n\n')
    .replace(/\\n(?=\s*(?:\d+[.)]\s|[-*]\s|#{1,6}\s))/g,'\n');
}
function paragraph(text){
  return breaks(text)
    .replace(/^\s{0,3}#{1,6}\s+(.+)$/gm,'$1')
    .replace(/^\s{0,3}[-*]\s+/gm,'• ')
    .replace(/\*\*(\S(?:[^*\n]*\S)?)\*\*/g,'$1')
    .replace(/__(\S(?:[^_\n]*\S)?)__/g,'$1')
    .replace(/(?<![\p{L}\p{N}_*])([*_])(\S(?:[^*_\n]*\S)?)\1(?![\p{L}\p{N}_*])/gu,'$2');
}
function mapProse(value,transform){
  const text=String(value??'');let rendered='',offset=0;
  for(const match of text.matchAll(protectedText)){
    rendered+=transform(text.slice(offset,match.index))+match[0];offset=match.index+match[0].length;
  }
  return rendered+transform(text.slice(offset));
}
export const proseText=value=>mapProse(value,paragraph);
export const decodeProseBreaks=value=>mapProse(value,breaks);
