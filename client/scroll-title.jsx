import React,{Fragment} from 'react';
// React owns the character wrappers expected by Codrops' effect. The complete
// heading is its accessible name; decorative letter nodes are hidden from AT.
export function ScrollTitle({text}){
  return <h2 className="content__title" data-effect6 aria-label={text.replaceAll('\n',' ')}>{text.split('\n').map((line,index)=><Fragment key={index}>{index>0&&<br/>}{line.split(' ').map((word,i)=><Fragment key={i}>{i>0&&' '}<span className="word" aria-hidden="true">{Array.from(word).map((char,j)=><span className="char" key={j}>{char}</span>)}</span></Fragment>)}</Fragment>)}</h2>;
}
