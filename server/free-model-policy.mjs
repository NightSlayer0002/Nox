export const FREE_CHAT_MODEL='openai/gpt-oss-120b';
export const FREE_CHAT_FALLBACK='openai/gpt-oss-20b';
import {createChatBudget,MINIMUM_FALLBACK_MS} from './chat-budget.mjs';
// One model attempt normally. A quota/access fallback is bounded, and never
// changes the answer after any text has already left the primary request.
export async function requestFreeChat(input,{request,onModel=()=>{},now=Date.now,budgetMs,setTimer,clearTimer,...options}){
  const budget=createChatBudget({signal:options.signal,deadlineAt:options.deadlineAt,now,budgetMs,setTimer,clearTimer});let emitted=false;
  const onText=options.onText?value=>{budget.signal.throwIfAborted();if(value?.trim())emitted=true;options.onText(value);}:undefined;
  const attempt={...options,now,signal:budget.signal,deadlineAt:budget.deadlineAt,onText};
  try{
    budget.signal.throwIfAborted();onModel(options.model,null);
    try{return await budget.run(()=>request(input,attempt));}
    catch(error){
      if(budget.signal.aborted||emitted||options.model!==FREE_CHAT_MODEL||!['quota','model_access'].includes(error.code)||budget.remainingMs()<MINIMUM_FALLBACK_MS)throw error;
      budget.signal.throwIfAborted();onModel(FREE_CHAT_FALLBACK,error.code);
      return await budget.run(()=>request(input,{...attempt,model:FREE_CHAT_FALLBACK}));
    }
  }finally{budget.dispose();}
}
