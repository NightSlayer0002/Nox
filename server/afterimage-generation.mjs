import { normalizeAfterimage } from '../shared/afterimage.js';

// Retry only the provider validation failure observed on live Groq calls.
// The caller supplies one cancellation/deadline signal for the entire job.
export async function requestAfterimageGeneration(generate,{signal}={}){
  for(let attempts=1;attempts<=2;attempts++){
    signal?.throwIfAborted();
    try{
      const value=await generate();
      signal?.throwIfAborted();
      return {packet:normalizeAfterimage(value),attempts};
    }catch(error){
      signal?.throwIfAborted();
      const retryable=error?.code==='invalid_json'&&error.providerStatus===400&&error.providerCode==='json_validate_failed'
        &&!['TypeError','SyntaxError','TimeoutError','AbortError'].includes(error.name);
      if(attempts===2||!retryable)throw error;
    }
  }
}
