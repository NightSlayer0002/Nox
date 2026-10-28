import React,{useEffect,useId,useRef,useState} from 'react';
import {EXPLORE_MAX_TEXT,GUESS_OBJECTS,GUESS_QUESTIONS,MOON_SOURCE,MOON_CLUES,MOON_EXPLANATION,createExploreState,restoreExploreState,exploreRecap,moonPhase,createGuessingState,restoreGuessingState,updateGuessingState,guessingResult,normalizeGameRules} from '../shared/everyday-activities.js';
import {everydayBridge} from '/js/everyday-bridge.js';

const freshSeed=()=>globalThis.crypto?.getRandomValues?globalThis.crypto.getRandomValues(new Uint32Array(1))[0]:Date.now();
const activityId=()=>`activity-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

function MoonDiagram({angle,onChange}){
  const id=useId().replace(/:/g,''),phase=moonPhase(angle),radians=phase.degrees*Math.PI/180;
  const mx=180-105*Math.cos(radians),my=142-105*Math.sin(radians),radius=40;
  // A projected sphere terminator, sampled in image coordinates. The visible lit
  // area is (1-cos(angle))/2; this is geometry, not a generated illustration.
  const edge=[],terminator=[],sign=phase.waxing?1:-1;
  for(let n=0;n<=64;n++){
    const y=-radius+2*radius*n/64,span=Math.sqrt(Math.max(0,radius*radius-y*y));
    edge.push([sign*span,y]);terminator.unshift([sign*Math.cos(radians)*span,y]);
  }
  const litPath=`M${[...edge,...terminator].map(point=>point.join(',')).join('L')}Z`;
  return <figure className="eact-moon">
    <svg viewBox="0 0 580 290" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>Moon phases: {phase.name}</title><desc id={`${id}-desc`}>Top-down model with sunlight arriving from the left. Earth is at the centre. The Moon orbits Earth. The separate Earth-view disc shows {Math.round(phase.fraction*100)} percent of its face lit. Distances and sizes are not to scale.</desc>
      <defs><clipPath id={`${id}-moon`}><circle cx={mx} cy={my} r="14"/></clipPath><clipPath id={`${id}-earth`}><circle cx="180" cy="142" r="25"/></clipPath></defs>
      <g className="eact-sun-rays" stroke="currentColor" strokeWidth="1"><path d="M8 80h60m-7-4 7 4-7 4M8 142h60m-7-4 7 4-7 4M8 204h60m-7-4 7 4-7 4"/></g>
      <text x="8" y="57" className="eact-svg-small">Sunlight</text><circle cx="180" cy="142" r="105" fill="none" className="eact-orbit"/>
      <circle cx="180" cy="142" r="25" className="eact-body-dark"/><path d="M155 117h25v50h-25z" clipPath={`url(#${id}-earth)`} className="eact-body-light"/><text x="180" y="184" textAnchor="middle">Earth</text>
      <circle cx={mx} cy={my} r="14" className="eact-body-dark"/><path d={`M${mx-14} ${my-14}h14v28h-14z`} clipPath={`url(#${id}-moon)`} className="eact-body-light"/>
      <text x="180" y="278" textAnchor="middle" className="eact-svg-small">Top-down view</text>
      <g transform="translate(458 137)"><circle r={radius} className="eact-body-dark"/><path d={litPath} className="eact-body-light"/><circle r={radius} fill="none" className="eact-disc-edge"/></g>
      <text x="458" y="210" textAnchor="middle">{phase.name}</text><text x="458" y="232" textAnchor="middle" className="eact-svg-small">{Math.round(phase.fraction*100)}% lit, seen from Earth</text>
    </svg>
    <label htmlFor={`${id}-angle`}>Move the Moon around Earth <output>{Math.round(phase.degrees)}°</output></label>
    <input id={`${id}-angle`} type="range" min="0" max="360" step="1" value={angle} onChange={event=>onChange(Number(event.target.value))} aria-valuetext={`${phase.name}, ${Math.round(phase.fraction*100)} percent lit`}/>
    <div className="eact-phase-stops">{[[0,'New'],[90,'First quarter'],[180,'Full'],[270,'Third quarter']].map(([value,label])=><button type="button" key={value} aria-pressed={Math.abs(angle-value)<2} onClick={()=>onChange(value)}>{label}</button>)}</div>
    <figcaption>Model, not a live sky forecast. Sizes, distance and orbit tilt are simplified. Earth-view orientation is from the northern hemisphere. <a href={MOON_SOURCE} target="_blank" rel="noreferrer">Moon phases · NASA</a></figcaption>
  </figure>;
}

export default function EverydayActivity({kind='explore',initialState,preferences={},onClose,onStateChange}){
  const guessing=kind==='guessing',id=useRef(initialState?.id||activityId()),topicId=useId(),questionId=useId(),guessId=useId();
  const [state,setState]=useState(()=>guessing?initialState?restoreGuessingState(initialState):createGuessingState({seed:freshSeed(),rules:preferences}):initialState?restoreExploreState(initialState,preferences):createExploreState(preferences));
  const [rules,setRules]=useState(()=>normalizeGameRules(initialState?.rules||preferences)),[question,setQuestion]=useState(''),[guess,setGuess]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[teachOpen,setTeachOpen]=useState(Boolean(initialState?.teachBack));
  const [turnLimitDraft,setTurnLimitDraft]=useState(()=>String(rules.questionLimit)),[rulesError,setRulesError]=useState('');
  const alive=useRef(true),latest=useRef(state),report=useRef(onStateChange),turnList=useRef(null);latest.current=state;report.current=onStateChange;
  useEffect(()=>{
    alive.current=true;
    return()=>{
      alive.current=false;everydayBridge.stop();
      // Navigation can unmount this route without going through Back to NOX.
      report.current?.({id:id.current,kind:latest.current.kind,state:structuredClone(latest.current)});
    };
  },[]);
  useEffect(()=>{onStateChange?.({id:id.current,kind:state.kind,state:structuredClone(state)});},[state,kind,onStateChange]);
  useEffect(()=>{const list=turnList.current;if(list)list.scrollTop=list.scrollHeight;},[state.events?.length]);
  const change=patch=>setState(current=>({...current,...patch}));
  async function run(task,success=''){
    setError('');try{await task();if(alive.current&&success)setNotice(success);}catch(reason){if(alive.current)setError(reason?.message||'That did not finish. Your activity is still here.');}
  }
  function commitRules(){
    const questionLimit=Number(turnLimitDraft);
    if(!turnLimitDraft.trim()||!Number.isInteger(questionLimit)||questionLimit<5||questionLimit>20){setRulesError('Enter a whole number from 5 to 20 for the turn limit.');return null;}
    const next={...rules,questionLimit};setRules(next);setTurnLimitDraft(String(questionLimit));setRulesError('');return next;
  }
  function exit(){everydayBridge.stop();onClose?.(latest.current);}
  function ask(event){
    event.preventDefault();if(!state.topic.trim()||busy)return;setBusy(true);
    run(()=>everydayBridge.ask(`Help me understand this idea or passage. ${preferences.learningStyle==='hints'?'Start with one useful clue, then wait for me.':'Explain it clearly, with a useful example.'}\n\n${state.topic}`,{activity:{kind:'explore',id:id.current,state:latest.current}})).finally(()=>{if(alive.current)setBusy(false);});
  }
  const result=guessing?guessingResult(state):null,recap=guessing?null:exploreRecap(state);
  const latestSpeech=guessing?(()=>{const event=state.events.at(-1);return state.status==='won'||state.status==='lost'?result:event?.type==='hint'?event.text:event?`${event.type==='guess'?`Is it ${event.text}?`:event.text} ${event.answer?'Yes.':'No.'}`:'I have picked one object from the visible collection. Ask a question or make a guess.';})():state.recap?`${recap.summary} ${recap.understood} ${recap.open}`:state.approach==='hints'?MOON_CLUES[Math.max(0,state.clues-1)]:MOON_EXPLANATION;
  return <section className={`everyday-activity ${guessing?'eact-game':'eact-explore'}`} aria-label={guessing?'Guessing game':'Explore an idea'}>
    <header className="eact-header"><div><h2>{guessing?'What am I thinking of?':'Let’s make sense of it.'}</h2><p>{guessing?'One object. A few good questions.':'Bring a question, or try a small explanation you can move.'}</p></div><button type="button" onClick={exit}>Back to NOX</button></header>
    {!guessing&&<form className="eact-topic" onSubmit={ask}><label htmlFor={topicId}>An idea or passage</label><textarea id={topicId} rows="2" maxLength={EXPLORE_MAX_TEXT} placeholder="Something you want to understand…" value={state.topic} onChange={event=>change({topic:event.target.value})}/><div><span>This opens a real conversation with NOX. The Moon example below works without AI.<small>{state.topic.length.toLocaleString()} / {EXPLORE_MAX_TEXT.toLocaleString()} characters</small></span><button type="submit" className="eact-primary" disabled={busy||!state.topic.trim()}>{busy?'Opening…':'Explore with NOX'}</button></div></form>}
    <div className="eact-toolbar"><div><button type="button" onClick={()=>run(()=>everydayBridge.speak(latestSpeech,{activity:kind}))}>Read aloud</button><button type="button" onClick={()=>everydayBridge.stop()}>Stop voice</button></div></div>
    {error&&<p className="eact-error" role="alert">{error}</p>}<p className="eact-notice" role="status">{notice}</p>
    {guessing?<>
      <div className="eact-game-status" aria-live="polite"><p>{result}</p><span>{state.turns} / {state.rules.questionLimit} turns</span></div>
      <details className="eact-collection"><summary>The 16 possible objects and rules</summary><p>{GUESS_OBJECTS.map(item=>item.name).join(' · ')}</p><p>Answers describe these ordinary objects. Ask from the supported question list or guess a name. Each new question or guess uses one turn. Repeats and unrecognised guesses use none. {state.rules.hints?'Up to three hints are free.':'Hints are off for this round.'} The object is fixed until you start a new round.</p></details>
      <ol ref={turnList} className="eact-turns" aria-label="Round so far" aria-live="polite" aria-relevant="additions">{state.events.length?state.events.map((event,index)=><li key={index} className={event.type==='hint'?'eact-hint':''}>{event.type==='hint'?<p><span>Hint {event.number}</span>{event.text}</p>:<><p className="eact-player">{event.type==='guess'?`Is it ${event.text}?`:event.text}</p><p className="eact-answer"><span className="brand-mark" aria-hidden="true"><i/><i/></span>{event.answer?'Yes.':'No.'}{event.type==='guess'&&!event.answer?' Good elimination.':''}</p></>}</li>):<li className="eact-opening">I’ve picked one object. Try a question that divides the collection.</li>}</ol>
      {state.status==='playing'?<div className="eact-game-inputs"><form onSubmit={event=>{event.preventDefault();if(!question)return;setState(current=>updateGuessingState(current,{type:'question',id:question}));setQuestion('');setNotice('');}}><label htmlFor={questionId}>Ask a question</label><div className="eact-input-row"><select id={questionId} value={question} onChange={event=>setQuestion(event.target.value)}><option value="">Choose a question…</option>{GUESS_QUESTIONS.filter(item=>!state.events.some(event=>event.type==='question'&&event.id===item.id)).map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select><button type="submit" disabled={!question}>Ask</button></div></form><form onSubmit={event=>{event.preventDefault();const next=updateGuessingState(state,{type:'guess',value:guess});if(next.events.length===state.events.length){setNotice('Choose one of the 16 objects, using its name. A repeated guess does not use a turn.');return;}setState(next);setGuess('');setNotice('');}}><label htmlFor={guessId}>Make a guess</label><div className="eact-input-row"><input id={guessId} value={guess} onChange={event=>setGuess(event.target.value)} placeholder="Is it a pencil?" maxLength="100" autoComplete="off"/><button type="submit" className="eact-primary" disabled={!guess.trim()}>Guess</button></div></form><button className="eact-hint-button" type="button" disabled={!state.rules.hints||state.hintsUsed>=3} onClick={()=>setState(current=>updateGuessingState(current,{type:'hint'}))}>{!state.rules.hints?'Hints off':state.hintsUsed===3?'All hints used':`Give me a hint · ${3-state.hintsUsed} left`}</button></div>:<div className="eact-round-result"><h3>{state.status==='won'?'Found it.':'A good round of elimination.'}</h3><p>{result}</p><button type="button" className="eact-primary" onClick={()=>{const next=commitRules();if(!next)return;id.current=activityId();setState(createGuessingState({seed:freshSeed(),rules:next}));setNotice('A new object. The rules below apply.');}}>Play another round</button></div>}
      <details className="eact-rules"><summary>Rules for the next round</summary><label>Turn limit <input type="number" min="5" max="20" step="1" inputMode="numeric" value={turnLimitDraft} onChange={event=>setTurnLimitDraft(event.target.value)} onBlur={commitRules} aria-invalid={rulesError?true:undefined} aria-describedby={rulesError?`${questionId}-turn-limit-error`:undefined}/></label>{rulesError&&<p id={`${questionId}-turn-limit-error`} className="eact-error" role="alert">{rulesError}</p>}<label className="eact-check"><input type="checkbox" checked={rules.hints} onChange={event=>setRules(current=>({...current,hints:event.target.checked}))}/>Allow up to three hints</label><p>Use a whole number from 5 to 20. Changing these does not alter the round already in progress.</p><button type="button" onClick={()=>{const next=commitRules();if(!next)return;return run(()=>everydayBridge.proposePreference({key:'gameQuestionLimit',value:next.questionLimit,scope:'guessing',origin:'Guessing game rules'}),'Review the preference before saving it.');}}>Offer turn limit as my preference</button><button type="button" onClick={()=>run(()=>everydayBridge.proposePreference({key:'gameHints',value:rules.hints,scope:'guessing',origin:'Guessing game rules'}),'Review the preference before saving it.')}>Offer hint policy as my preference</button>{state.status==='playing'&&<button type="button" onClick={()=>{const next=commitRules();if(!next)return;everydayBridge.stop();id.current=activityId();setState(createGuessingState({seed:freshSeed(),rules:next}));setGuess('');setQuestion('');setNotice('New round started. Previous unsaved round replaced.');}}>Start a new round</button>}</details>
      <p className="eact-other-play">Prefer a story? <a href="#afterimage">Open the interactive mystery</a>.</p>
    </>:<>
      <div className="eact-lesson-heading"><h3>Why does the Moon change shape?</h3><div className="eact-approach" role="group" aria-label="Learning approach"><button type="button" aria-pressed={state.approach==='explain'} onClick={()=>change({approach:'explain'})}>Explain first</button><button type="button" aria-pressed={state.approach==='hints'} onClick={()=>{change({approach:'hints',clues:Math.max(1,state.clues)});everydayBridge.stop();}}>One clue at a time</button></div></div>
      <p className="eact-explanation">{state.approach==='hints'?MOON_CLUES[Math.max(0,state.clues-1)]:MOON_EXPLANATION}</p>
      {state.approach==='hints'&&<div className="eact-clue-actions"><button type="button" disabled={state.clues>=3} onClick={()=>change({clues:Math.min(3,Math.max(1,state.clues)+1)})}>{state.clues>=3?'All three clues shown':'Next clue'}</button><button type="button" onClick={()=>run(()=>everydayBridge.proposePreference({key:'learningStyle',value:'hints',scope:'learning',origin:'Moon explanation'}),'Review the preference before saving it.')}>Offer this as my learning preference</button></div>}
      <MoonDiagram angle={state.angle} onChange={angle=>change({angle})}/>
      <fieldset className="eact-prediction"><legend>Where should the Moon be for a full Moon?</legend><div>{[['between','Between Earth and the Sun'],['opposite','Opposite the Sun, with Earth between'],['quarter','A quarter of the way around']].map(([value,label])=><label key={value}><input type="radio" name={`${topicId}-prediction`} value={value} checked={state.prediction===value} onChange={()=>change({prediction:value})}/><span>{label}</span></label>)}</div>{state.prediction&&<p role="status">{state.prediction==='opposite'?'Yes. We face the sunlit half. Eclipses are a separate case, omitted in this flat model.':state.prediction==='between'?'There the sunlit half faces away from us: a new Moon. Try the opposite side of Earth.':'There we see about half of the sunlit face. Try moving to the side opposite the Sun.'}</p>}</fieldset>
      <div className="eact-teach"><button type="button" aria-expanded={teachOpen} onClick={()=>setTeachOpen(!teachOpen)}>{teachOpen?'Close teach-back':'Let me explain it back'}</button>{teachOpen&&<><label>In your own words<textarea rows="3" maxLength="1600" value={state.teachBack} placeholder="The Moon changes shape because…" onChange={event=>change({teachBack:event.target.value})}/></label><p>Check your explanation yourself. NOX is not automatically grading this.</p>{[['light','I included reflected sunlight.'],['view','I included how our view changes.'],['question','I still have a question.']].map(([value,label])=><label key={value} className="eact-check"><input type="checkbox" checked={state.selfCheck.includes(value)} onChange={event=>change({selfCheck:event.target.checked?[...state.selfCheck,value]:state.selfCheck.filter(item=>item!==value)})}/>{label}</label>)}</>}</div>
      <button type="button" className="eact-primary" onClick={()=>change({recap:true})}>Make my recap</button>
      {state.recap&&<section className="eact-recap" aria-label="Your Moon recap"><h3>What we found.</h3><p>{recap.summary}</p><p>{recap.understood}</p><p>{recap.open}</p>{recap.teachBack&&<blockquote>{recap.teachBack}</blockquote>}<button type="button" onClick={()=>run(()=>everydayBridge.ask(`I explored Moon phases. Here is my recap: ${recap.summary}\nMy explanation: ${state.teachBack||'Not written yet.'}\n${recap.open}\nHelp me with my next question.`,{activity:{kind:'explore',id:id.current,state:latest.current}}))}>Continue in conversation</button></section>}
    </>}
  </section>;
}
