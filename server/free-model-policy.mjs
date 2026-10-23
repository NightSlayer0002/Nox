export const FREE_CHAT_MODEL='openai/gpt-oss-120b';
export const FREE_CHAT_FALLBACK='openai/gpt-oss-20b';
// One model attempt normally. A quota/access fallback is bounded, and never
// changes the answer after any text has already left the primary request.
export async function requestFreeChat(input,{request,onModel=()=>{},...options}){
  options.signal?.throwIfAborted();let emitted=false;
  const onText=options.onText?value=>{if(value?.trim())emitted=true;options.onText(value);}:undefined;
  onModel(options.model,null);
  try{return await request(input,{...options,onText});}
  catch(error){
    if(options.signal?.aborted||emitted||options.model!==FREE_CHAT_MODEL||!['quota','model_access'].includes(error.code))throw error;
    options.signal?.throwIfAborted();onModel(FREE_CHAT_FALLBACK,error.code);
    return request(input,{...options,model:FREE_CHAT_FALLBACK,onText});
  }
}
