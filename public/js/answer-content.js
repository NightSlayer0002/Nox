import {decodeProseBreaks} from './prose-text.js';

// A small display subset, built entirely from text nodes. No HTML, images,
// embeds, arbitrary styles, syntax highlighter or document editor is needed.
const inline=/`[^`\n]+`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|(?:[A-Za-z]:\\|\\\\)[^\s<>"']+|https?:\/\/[^\s<>]+|(?<!\S)\/(?:[^/\s]+\/)+[^\s<>"']*|!?\[[^\]\n]+\]\([^\s)]+\)|\*\*(\S(?:[^*\n]*\S)?)\*\*|__(\S(?:[^_\n]*\S)?)__|(?<![\p{L}\p{N}_*])([*_])(\S(?:[^*_\n]*\S)?)\3(?![\p{L}\p{N}_*])/gu;
function inlineContent(node,text,doc){
  let offset=0;
  for(const match of text.matchAll(inline)){
    node.append(text.slice(offset,match.index));const token=match[0];let tag,value,href;
    if(token.startsWith('`')){tag='code';value=token.slice(1,-1);}
    else if(token.startsWith('[')){
      const split=token.indexOf('](');href=token.slice(split+2,-1);
      try{const url=new URL(href);if(/^https?:\/\//i.test(href)&&['http:','https:'].includes(url.protocol)){tag='a';value=token.slice(1,split);}}catch{}
    }else if(token.startsWith('**')||token.startsWith('__')){tag='strong';value=token.slice(2,-2);}
    else if(token.startsWith('*')||token.startsWith('_')){tag='em';value=token.slice(1,-1);}
    if(tag){const child=doc.createElement(tag);child.textContent=value;if(tag==='a'){child.setAttribute('href',href);child.setAttribute('target','_blank');child.setAttribute('rel','noopener noreferrer');}node.append(child);}
    else node.append(token);
    offset=match.index+token.length;
  }
  node.append(text.slice(offset));
}
const heading=line=>line.match(/^ {0,3}(#{1,6})\s+(.+)$/);
const item=line=>line.match(/^ {0,3}(?:(\d{1,4})[.)]|([-*•]))[ \t]+(.+)$/);
const fence=line=>/^ {0,3}```/.test(line);
const indented=line=>/^(?: {4}|\t)/.test(line);
export function renderAnswer(content,value){
  const doc=content.ownerDocument,lines=decodeProseBreaks(value).replace(/\r\n?/g,'\n').split('\n');
  content.textContent='';
  function append(node){if(content.children.length)content.append('\n');content.append(node);}
  function code(text){const pre=doc.createElement('pre'),source=doc.createElement('code');source.textContent=text;pre.append(source);append(pre);}
  for(let i=0;i<lines.length;){
    if(!lines[i].trim()){i++;continue;}
    if(fence(lines[i])){const text=[];i++;while(i<lines.length&&!fence(lines[i]))text.push(lines[i++]);if(i<lines.length)i++;code(text.join('\n'));continue;}
    if(indented(lines[i])){const text=[];while(i<lines.length&&indented(lines[i]))text.push(lines[i++]);code(text.join('\n'));continue;}
    const title=heading(lines[i]);
    if(title){const node=doc.createElement(`h${Math.min(6,title[1].length+2)}`);inlineContent(node,title[2],doc);append(node);i++;continue;}
    const first=item(lines[i]);
    if(first){
      const ordered=Boolean(first[1]),list=doc.createElement(ordered?'ol':'ul');
      if(ordered&&Number(first[1])!==1)list.setAttribute('start',first[1]);
      while(i<lines.length){const match=item(lines[i]);if(!match||Boolean(match[1])!==ordered)break;const li=doc.createElement('li');inlineContent(li,match[3],doc);if(list.children.length)list.append('\n');list.append(li);i++;}
      append(list);continue;
    }
    const text=[lines[i++]];
    while(i<lines.length&&lines[i].trim()&&!heading(lines[i])&&!item(lines[i])&&!fence(lines[i])&&!indented(lines[i]))text.push(lines[i++]);
    const paragraph=doc.createElement('p');inlineContent(paragraph,text.join('\n'),doc);append(paragraph);
  }
}
