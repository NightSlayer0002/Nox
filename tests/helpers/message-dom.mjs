// Minimal DOM for presentation boundaries: append creates text nodes and HTML
// assignment fails, so security tests cannot pass by silently accepting markup.
class TextNode{constructor(value){this.textContent=String(value);}}
export class MessageElement{
  constructor(tagName,ownerDocument){this.tagName=tagName.toUpperCase();this.ownerDocument=ownerDocument;this.children=[];this.attributes=new Map();this.className='';this.value='';}
  append(...children){for(const child of children){const node=typeof child==='string'?new TextNode(child):child;node.parentNode=this;this.children.push(node);}}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  getAttribute(name){return this.attributes.get(name)??null;}
  set textContent(value){this.value=String(value);this.children=[];}
  get textContent(){return this.value+this.children.map(child=>child.textContent).join('');}
  get lastChild(){return this.children.at(-1)??null;}
  get classList(){return {contains:name=>this.className.split(/\s+/).includes(name)};}
  set innerHTML(value){throw Error(`Unsafe HTML assignment: ${value}`);}
}
export function messageDocument(){const doc={createElement:tag=>new MessageElement(tag,doc)};return doc;}
export function descendants(node,tag){return node.children.flatMap(child=>child.children?[...(child.tagName===tag.toUpperCase()?[child]:[]),...descendants(child,tag)]:[]);}
