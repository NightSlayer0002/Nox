// Lightweight lexical hints, never a parser or executable source. Token text is
// rendered with text nodes. Work is bounded; dense inputs keep exact plain text.
const KEYWORDS=new Set('abstract as async await break case catch class const continue crate debugger def default del do else elif enum except export extends extern false finally fn for from function global if impl import in instanceof interface is lambda let match mod move mut new nil None nonlocal null of pass private protected pub public raise ref return self Self static struct super switch this throw trait true try type typeof undefined union unsafe use var void where while with yield'.split(' '));
const SUPPORTED=/\.(?:[cm]?[jt]sx?|py|rs|go|java|c|h|cc|cpp|hpp|cs|kt|swift|json)$/i;
const identifier=/[\p{L}_$][\p{L}\p{N}_$]*/uy;
const number=/(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)/y;

export function tokenizeSource(text,path=''){
  const lines=text.split('\n'),plain=()=>lines.map(line=>[{kind:'plain',text:line}]);
  if(text.length>65536||!SUPPORTED.test(path))return plain();
  const python=/\.py$/i.test(path),json=/\.json$/i.test(path),result=[];
  let state=null,budget=0;
  for(const line of lines){
    const tokens=[];let index=0;
    const push=(kind,value)=>{if(!value)return;const last=tokens.at(-1);if(last?.kind===kind)last.text+=value;else{tokens.push({kind,text:value});budget++;}};
    while(index<line.length){
      if(budget>=10000)return plain();
      if(state){
        const start=index;let end;
        if(state.kind==='comment')end=line.indexOf(state.end,index);
        else{
          end=-1;
          for(let cursor=index;cursor<line.length;cursor++){
            if(line[cursor]==='\\'){cursor++;continue;}
            if(line.startsWith(state.end,cursor)){end=cursor;break;}
          }
        }
        if(end<0){push(state.kind,line.slice(start));index=line.length;if(!state.multiline)state=null;continue;}
        index=end+state.end.length;push(state.kind,line.slice(start,index));state=null;continue;
      }
      if((python&&line[index]==='#')||(!python&&!json&&line.startsWith('//',index))){push('comment',line.slice(index));break;}
      if(!python&&!json&&line.startsWith('/*',index)){push('comment','/*');index+=2;state={kind:'comment',end:'*/',multiline:true};continue;}
      const quote=line[index];
      if(quote==='"'||(!json&&(quote==="'"||quote==='`'))){
        const end=python&&line.startsWith(quote.repeat(3),index)?quote.repeat(3):quote;
        push('string',end);index+=end.length;state={kind:'string',end,multiline:end.length===3||quote==='`'};continue;
      }
      identifier.lastIndex=index;const word=identifier.exec(line);
      if(word){
        index=identifier.lastIndex;let next=index;while(next<line.length&&/\s/.test(line[next]))next++;
        push(KEYWORDS.has(word[0])?'keyword':line[next]==='('?'call':'plain',word[0]);continue;
      }
      number.lastIndex=index;const value=number.exec(line);
      if(value){push('number',value[0]);index=number.lastIndex;continue;}
      push('plain',line[index++]);
    }
    if(state&&!state.multiline)state=null;
    result.push(tokens.length?tokens:[{kind:'plain',text:''}]);
  }
  return result;
}
