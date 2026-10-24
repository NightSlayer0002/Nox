import {proseText} from './prose-text.js';

export function createChatMessage(speaker,text,documentTarget=globalThis.document){
  const role=speaker==='nox'||speaker==='user'?speaker:'system';
  const message=documentTarget.createElement('div');message.className=`message ${role}`;
  const label=documentTarget.createElement('p');
  label.className=role==='system'?'speaker':'speaker sr-only';
  label.textContent=role==='nox'?'NOX':role==='user'?'You':'Connection';
  message.append(label);
  if(role==='nox'){
    const avatar=documentTarget.createElement('img');avatar.className='message-avatar';
    avatar.setAttribute('src','/icon.svg');avatar.setAttribute('width','24');avatar.setAttribute('height','24');
    avatar.setAttribute('alt','');avatar.setAttribute('aria-hidden','true');
    message.append(avatar);
  }
  const content=documentTarget.createElement('p');content.className='message-content';setChatContent(content,text,role);
  message.append(content);
  return message;
}
export function setChatContent(content,text,speaker='nox'){
  content.textContent=speaker==='nox'?proseText(text):text;
}
