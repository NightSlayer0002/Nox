// A small local notebook: source text stays in this browser. Only selected
// excerpts leave it when the chat caller explicitly includes context(query).
export const KNOWLEDGE_KEY='nox.knowledge.v1';
export const KNOWLEDGE_LIMITS=Object.freeze({documents:24,documentCharacters:24000,totalCharacters:180000,titleCharacters:160,excerpts:4,contextCharacters:6000});
const blank=()=>({version:1,enabled:true,documents:[]});
const stopwords=new Set('a an and are as at be been being but by can could did do does for from had has have how i if in into is it its me my of on or our please should so some than that the their them then there these they this those to us was we were what when where which who why will with would you your tell about explain give using use'.split(' '));
const words=text=>(text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(word=>word.length>1&&!stopwords.has(word));
const counts=tokens=>{const result=new Map();for(const token of tokens)result.set(token,(result.get(token)||0)+1);return result;};
const copy=document=>({id:document.id,title:document.title,text:document.text,createdAt:document.createdAt});

function parse(raw){
  if(typeof raw!=='string'||raw.length>1200000)return blank();
  try{
    const value=JSON.parse(raw);
    if(!value||value.version!==1||!Array.isArray(value.documents))return blank();
    const documents=[],seen=new Set();let total=0;
    for(const entry of value.documents.slice(0,KNOWLEDGE_LIMITS.documents)){
      if(!entry||typeof entry!=='object'||Array.isArray(entry)||typeof entry.id!=='string'||!entry.id||entry.id.length>100||seen.has(entry.id)||typeof entry.title!=='string'||typeof entry.text!=='string')continue;
      const title=entry.title.trim(),text=entry.text.trim();
      if(!title||title.length>KNOWLEDGE_LIMITS.titleCharacters||!text||text.length>KNOWLEDGE_LIMITS.documentCharacters||total+text.length>KNOWLEDGE_LIMITS.totalCharacters)continue;
      seen.add(entry.id);total+=text.length;
      documents.push({id:entry.id,title,text,createdAt:Number.isFinite(entry.createdAt)&&entry.createdAt>=0?entry.createdAt:0});
    }
    return {version:1,enabled:value.enabled!==false,documents};
  }catch{return blank();}
}

// Prefer paragraph, sentence and word boundaries. Overlap retains a thought
// that crosses a boundary without ever taking just the document's beginning.
export function chunkKnowledgeText(text){
  const chunks=[];let start=0;
  while(start<text.length){
    let end=Math.min(text.length,start+1000);
    if(end<text.length){
      const minimum=start+550,paragraph=text.lastIndexOf('\n\n',end),sentence=text.lastIndexOf('. ',end),space=text.lastIndexOf(' ',end);
      if(paragraph>=minimum)end=paragraph+2;
      else if(sentence>=minimum)end=sentence+2;
      else if(space>=minimum)end=space+1;
    }
    const excerpt=text.slice(start,end).trim();if(excerpt)chunks.push({text:excerpt,start,end});
    if(end===text.length)break;
    let next=Math.max(start+1,end-120),boundary=text.indexOf(' ',next);
    if(boundary>=next&&boundary<end)next=boundary+1;
    start=next;
  }
  return chunks;
}

function indexDocuments(documents){
  const chunks=[],frequency=new Map();let totalLength=0;
  for(const [order,document] of documents.entries()){
    const titleTokens=new Set(words(document.title));
    for(const [position,chunk] of chunkKnowledgeText(document.text).entries()){
      const tokens=words(chunk.text),terms=counts(tokens);totalLength+=tokens.length;
      const all=new Set([...terms.keys(),...titleTokens]);for(const token of all)frequency.set(token,(frequency.get(token)||0)+1);
      chunks.push({...chunk,title:document.title,documentId:document.id,order,position,terms,titleTokens,length:tokens.length});
    }
  }
  return {chunks,frequency,averageLength:Math.max(1,totalLength/Math.max(1,chunks.length))};
}

function retrieve(index,query){
  if(typeof query!=='string')return [];
  const tokens=[...new Set(words(query.slice(0,2000)))];if(!tokens.length)return [];
  const {chunks,frequency,averageLength}=index,candidates=[];
  for(const chunk of chunks){
    let score=0,bodyMatches=0,titleMatches=0;
    for(const token of tokens){
      const count=chunk.terms.get(token)||0,inTitle=chunk.titleTokens.has(token);
      if(!count&&!inTitle)continue;
      const idf=Math.log(1+(chunks.length-(frequency.get(token)||0)+.5)/((frequency.get(token)||0)+.5));
      if(count){bodyMatches++;score+=idf*count*2.2/(count+1.2*(.25+.75*chunk.length/averageLength));}
      if(inTitle){titleMatches++;score+=idf*2.25;}
    }
    // A matching title can introduce a source, but cannot make every unrelated
    // paragraph from that source look like a relevant answer.
    if(!bodyMatches&&(!titleMatches||chunk.position!==0))continue;
    if(!score)continue;
    const coverage=new Set(tokens.filter(token=>chunk.terms.has(token)||chunk.titleTokens.has(token))).size/tokens.length;
    candidates.push({chunk,score:score*(.5+coverage)});
  }
  candidates.sort((a,b)=>b.score-a.score||a.chunk.order-b.chunk.order||a.chunk.position-b.chunk.position);
  const selected=[],usedText=new Set();let remaining=KNOWLEDGE_LIMITS.contextCharacters;
  for(const {chunk} of candidates){
    if(selected.length===KNOWLEDGE_LIMITS.excerpts||!remaining)break;
    if(usedText.has(chunk.text))continue;
    // Avoid almost identical overlapping excerpts when a short paragraph
    // happens to straddle a chunk boundary.
    if(selected.some(item=>item.documentId===chunk.documentId&&Math.max(0,Math.min(item.end,chunk.end)-Math.max(item.start,chunk.start))>Math.min(item.end-item.start,chunk.end-chunk.start)*.45))continue;
    selected.push({...chunk,text:chunk.text.slice(0,remaining)});usedText.add(chunk.text);remaining-=selected.at(-1).text.length;
  }
  return selected.map((chunk,i)=>({id:`K${i+1}`,title:chunk.title,text:chunk.text}));
}

export function createKnowledge(storage){
  if(storage===undefined){try{storage=globalThis.localStorage;}catch{storage=null;}}
  let state=blank(),persistent=Boolean(storage),memoryOnly=!storage,lastRaw,index=null,indexSource=null;
  function fresh(){
    if(memoryOnly)return state;
    try{const raw=storage.getItem(KNOWLEDGE_KEY);if(raw!==lastRaw){state=parse(raw);lastRaw=raw;}}
    catch{memoryOnly=true;persistent=false;}
    return state;
  }
  function save(next){
    if(memoryOnly){state=next;return;}
    const encoded=JSON.stringify(next);
    try{storage.setItem(KNOWLEDGE_KEY,encoded);lastRaw=encoded;state=next;persistent=true;}
    catch{persistent=false;throw new Error('Could not save your notebook. Browser storage may be full or blocked. Export your notes and free some space before trying again.');}
  }
  fresh();
  return {
    get enabled(){return fresh().enabled;},
    get persistent(){return persistent&&storage?.temporary!==true;},
    list(){return fresh().documents.map(copy);},
    add(input){
      fresh();
      if(!input||typeof input.title!=='string'||!input.title.trim())throw new Error('Give this note a title or choose a text file.');
      if(input.title.trim().length>KNOWLEDGE_LIMITS.titleCharacters)throw new Error('Keep the note title within 160 characters.');
      if(typeof input.text!=='string'||!input.text.trim())throw new Error('This note is empty. Add some text first.');
      const title=input.title.trim(),text=input.text.trim();
      if(text.length>KNOWLEDGE_LIMITS.documentCharacters)throw new Error('Each note can contain up to 24,000 characters. Split this file into smaller notes.');
      if(state.documents.length>=KNOWLEDGE_LIMITS.documents)throw new Error('Your notebook holds up to 24 notes. Remove a note before adding another.');
      if(state.documents.reduce((sum,item)=>sum+item.text.length,0)+text.length>KNOWLEDGE_LIMITS.totalCharacters)throw new Error('Your notebook has a 180,000 character limit. Remove a note or shorten this one.');
      const id=globalThis.crypto?.randomUUID?.()||`note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
      const document={id,title,text,createdAt:Date.now()};save({...state,documents:[...state.documents,document]});return copy(document);
    },
    remove(id){fresh();if(!state.documents.some(item=>item.id===id))return false;save({...state,documents:state.documents.filter(item=>item.id!==id)});return true;},
    setEnabled(value){if(typeof value!=='boolean')throw new Error('Notebook context must be on or off.');fresh();save({...state,enabled:value});},
    export(){fresh();return JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2);},
    context(query){
      fresh();if(!state.enabled||!state.documents.length)return [];
      if(indexSource!==state.documents){index=indexDocuments(state.documents);indexSource=state.documents;}
      return retrieve(index,query);
    },
  };
}
