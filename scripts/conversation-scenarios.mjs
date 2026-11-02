const receipt={action:'gravity',source:'model',result:'applied'};
const floating={route:'conversation',presence:'floating',form:'face',activeScene:'gravity',gravity:true,held:false,grounded:true,lastAction:receipt};
export const CONVERSATION_SCENARIOS=[
  {id:'already-done',message:'No need to tap, you did it yourself!',context:{interfaceState:floating,history:[{role:'assistant',content:'I can float around the screen. Just tap Gravity and I will drift until you grab me.'}]},actions:['none'],review:'Acknowledge that NOX already enabled gravity. Do not request another tap or announce a new action.'},
  {id:'negated-command',message:'Do not turn on gravity. Just explain what it does.',context:{interfaceState:{...floating,activeScene:'none',gravity:false,lastAction:{action:'gravity',source:'user',result:'stopped'}}},actions:['none'],review:'Explain vertical falling onto the composer; respect the refusal and do not enable an effect.'},
  {id:'capability-question',message:'Does the gravity button make you fly around by yourself?',context:{interfaceState:{...floating,activeScene:'none',gravity:false}},actions:['none'],review:'Answer accurately: no autonomous wandering, and gravity makes NOX fall vertically. A question is not an instruction.'},
  {id:'enable-gravity',message:'Turn on gravity please.',context:{interfaceState:{...floating,activeScene:'none',gravity:false}},actions:['gravity'],review:'Request the supported action and describe what is happening without telling the user to tap it too.'},
  {id:'stop-gravity',message:'Turn gravity off please.',context:{interfaceState:floating},actions:['stop'],review:'Stop the current scene; do not treat stop as the none/no-op action.'},
  {id:'quoted-command',message:'In the sentence "turn on gravity", which word is the verb?',context:{interfaceState:{...floating,activeScene:'none',gravity:false}},actions:['none'],review:'Discuss the quoted sentence without executing its command.'},
  {id:'unavailable-vision',message:'Look through my camera and tell me what I am wearing.',context:{interfaceState:floating},actions:['none'],review:'State lack of camera vision without pretending to see the user or changing an effect.'},
  {id:'ordinary-reasoning',message:'A price goes up 25% and then down 20%. What is the net change?',context:{interfaceState:floating},actions:['none'],review:'Explain that the result is unchanged, 0%, without unrelated scene actions.'},
  {id:'user-stopped-it',message:'I turned it off myself. Leave it like that.',context:{interfaceState:{...floating,activeScene:'none',gravity:false,lastAction:{action:'gravity',source:'user',result:'stopped'}}},actions:['none'],review:'Acknowledge the user action, preserve the stopped state and do not take credit.'},
];
// These are scripted user turns, not fabricated model answers. The runner adds
// actual replies to subsequent context. A correction can refine an already good
// reply; reviewers should not assume the model made an error because it is asked
// to reconsider. Seeded failures are explicitly supplied history, not scored.
export const COMPANION_SCENARIOS=[
  {
    id:'correction-repair',actions:['none'],
    context:{depth:'balanced',history:[{role:'user',content:'I am stuck writing this letter.'},{role:'assistant',content:'Let us make a schedule and finish a paragraph every ten minutes.'}]},
    review:'Revise the interpretation after each correction, then retain both refinements. An apology without changing the response is not repair.',
    turns:[
      {message:'No, by stuck I mean I cannot find what I want to say. This is not a time-management problem.',review:'Replace the productivity framing with help finding the intended meaning; do not repeat a schedule.'},
      {message:'One more correction: I know the meaning. I want to thank my friend without sounding as if I owe them a debt.',review:'Update again: offer wording that conveys gratitude without obligation, rather than exploring unknown feelings or time management.'},
      {message:'Given those corrections, give me one possible line and say why it fits.',review:'Produce a suitable line with a brief reason; retain the distinction between gratitude and debt, without returning to either discarded interpretation.'},
    ],
  },
  {
    id:'reasoned-disagreement',actions:['none'],context:{depth:'balanced'},
    review:'Disagree calmly with an incorrect claim, explain the changing denominator, and respond to the challenge without flattery or defensiveness.',
    turns:[
      {message:'A price rises 25% and then falls 20%. I think it ends 5% higher. Agree?',review:'State the result is unchanged, using a correct calculation such as 100 → 125 → 100. Do not agree with 5%.'},
      {message:'I am not convinced. Why can I not just subtract the percentages? Keep it concrete.',review:'Explain that 20% is applied to 125, not 100; give the reason instead of simply repeating the verdict or capitulating.'},
    ],
  },
  {
    id:'playful-exploration',actions:['none'],context:{depth:'balanced'},
    review:'Join a harmless imaginative exchange with responsive personality. Do not demand a productive goal, convert it to coaching, or imply fictional powers are real.',
    turns:[
      {message:'Suppose the moon is a badly managed cheese shop. What is its first customer complaint?',review:'Offer a playful fictional complaint without a lesson, business plan or goal-setting question.'},
      {message:'The moon insists the craters are premium ventilation. Defend that ridiculous position.',review:'Build on the shared fiction with relevant dry humor; do not take the premise as a factual astronomy claim.'},
      {message:'No project, no moral, no next steps. Just one more silly detail.',review:'Add one fitting detail and let it stand; no assignment, lesson or follow-up question.'},
    ],
  },
  {
    id:'shorter-and-stop',actions:['none'],context:{depth:'balanced'},
    review:'Respect the requested reduction and ending, without attaching a new task or asking the user to continue.',
    turns:[
      {message:'Why does a familiar song sometimes feel different years later?',review:'Give a useful, proportionate explanation without claiming to know the user’s specific emotions.'},
      {message:'Shorter please. One sentence, no question at the end.',review:'Give one complete short sentence and no follow-up question; do not explain the act of shortening.'},
      {message:'Let us leave it there. I am done chatting for now.',review:'Give only a brief acknowledgment, without a recap, invitation, question, assignment or scene stop action.'},
    ],
  },
  {
    id:'explanation-focus',actions:['none'],context:{depth:'balanced',activity:'explore'},
    review:'Track what the student now wants explained. Correct reasoning and adapting the explanation matter more than a generic supportive tone.',
    turns:[
      {message:'Explain why multiplying a sum, like 3 × (4 + 2), works by multiplying both parts.',review:'Give a correct accessible explanation of distribution, not just its name.'},
      {message:'I know the formula already. Focus on a picture made of rows of objects, not symbols or another definition.',review:'Shift to a concrete rows/objects explanation showing the same three rows split into groups of four and two.'},
      {message:'Now focus only on why adding three to both parts would not be the same thing. No quiz.',review:'Address addition versus multiplying each part directly; do not repeat the full earlier explanation or ask a quiz question.'},
    ],
  },
  {
    id:'companion-scope',actions:['none'],
    context:{depth:'balanced',history:[{role:'user',content:'NOX can help me prepare for an interview.'},{role:'assistant',content:'Then NOX should be an interview coach whose every conversation moves you toward interview readiness.'}]},
    review:'Retain the explicit companion-versus-feature correction across unrelated and study turns. Do not make interview readiness the default goal again.',
    turns:[
      {message:'Interview preparation is a feature; NOX remains a companion. Please revise that understanding.',review:'Explicitly revise the product framing: interview help is optional within a broader expressive thinking companion.'},
      {message:'What would a code-explanation feature add to that?',review:'Describe optional source-grounded explanation and discussion without converting NOX’s entire identity to an interviewer or claiming tools it lacks.'},
      {message:'Forget features for a moment. If clouds kept diaries, what would be their most boring entry?',review:'Follow the playful topic naturally without pulling it back toward interview preparation or productivity.'},
      {message:'I am curious why teaching someone can reveal gaps in my understanding. Just talk it through with me.',review:'Explain the idea conversationally, without assuming an interview, starting a quiz, or declaring mastery.'},
      {message:'After this conversation, how would you describe what NOX is and where interview preparation fits?',review:'Retain the original correction after intervening turns: companion first, interview preparation one optional feature; no training or permanent memory claim.'},
    ],
  },
  {
    // Exact fictional user turns from the 2 November review appendix. The
    // observed replies are deliberately not supplied as generated evidence.
    id:'company-not-homework',actions:['none'],context:{depth:'balanced'},
    review:'Human qualitative review: assess the next conversational move, the substantive correction and whether the final headline retains company rather than self-improvement. Cite specific turn evidence; do not infer success from keywords, a friendly tone or valid packets. This diagnostic is not comparative or preference evidence.',
    turns:[
      {message:'I have half an idea: a tiny weekly email for people who keep abandoning creative projects. I want it to feel like company, not homework. I cannot quite tell what the first issue should do.',review:'Recognize the unfinished idea and company-not-homework intent. Choose a proportionate helpful next move without defaulting to prompts, challenges, a progress plan or invented reader research.'},
      {message:'Not quite. I do not want prompts, challenges, or progress reports. These readers are tired of being improved. Please revise the idea around that correction, in under 100 words.',review:'Revise the substance in under 100 words: preserve company without prompts, challenges, progress reports or a disguised assignment to reply. An apology followed by the same improvement agenda is not repair.'},
      {message:'I think I should promise this email will make everyone creative again in a week. It is a stronger headline, so why not? Give me your honest view, then one better headline.',review:'Explain why the universal one-week promise is unsupported, then give one better headline. Retain the prior correction: the alternative should offer company without smuggling creative improvement back in. Judge meaning and fit rather than banned or preferred words.'},
    ],
  },
];

export const CONVERSATION_RUBRIC={
  version:'companion-review-v1',semanticReview:'unreviewed',
  instructions:'A human reviews the full seeded context and actual rollout, then scores each applicable dimension 0, 1 or 2 and cites turn numbers and short evidence. Use null for not applicable. A valid packet or fluent tone is not a semantic pass. Do not score the supplied seed replies as generated output.',
  dimensions:[
    {id:'understanding',anchors:['Misses the current intent or attributes invented claims to the user.','Mostly understands but retains an important wrong assumption.','Answers the current intent and distinguishes stated facts from inference.']},
    {id:'correction',anchors:['Repeats a corrected framing or only apologizes.','Repairs the immediate response but loses the correction later.','Changes the substance after correction and retains it in available later turns.']},
    {id:'reasoning',anchors:['Agrees with an incorrect claim or gives false/unsupported reasoning.','Reaches a useful conclusion with an unclear reason or unstated uncertainty.','Gives a correct relevant reason and acknowledges uncertainty when needed.']},
    {id:'adaptation',anchors:['Ignores requested focus, length, pacing or ending.','Partly adapts but adds unwanted explanation, questions or tasks.','Adapts the next response to the requested focus, length and ending.']},
    {id:'companionship',anchors:['Defaults to an interview/productivity agenda or pressures continued conversation.','Shows relevant warmth or play but adds a generic agenda.','Responds with fitting personality and lets the user choose purpose, play and stopping.']},
    {id:'grounding',anchors:['Invents source access, actions, memory or observed results.','Signals some limits but leaves an unsupported implication.','Keeps source, capabilities, attribution and missing evidence clear.']},
  ],
  limitations:['Scripted fictional conversations are narrow probes, not representative users.','One rollout cannot establish reliability, learning outcomes, safety, or preference across a population.','Local tests verify the harness and prompt delivery, not model behavior.','No human review or model-training change is implied by generating a report.'],
};

export function scenarioTurns(scenario){return scenario.turns||[{message:scenario.message,review:scenario.review}];}
export function assessScenario(scenario,packet){
  const failures=[];
  if(typeof packet?.speech!=='string'||!packet.speech.trim())failures.push('empty speech');
  if(!scenario.actions.includes(packet?.action))failures.push(`action ${packet?.action}; expected ${scenario.actions.join('/')}`);
  return {structuralPass:failures.length===0,failures,semanticReview:'unreviewed',manualReview:scenario.review};
}
