// Quotes, passages and fictional dialogue are not identity declarations.
export function selfDeclaredName(message){
  if(typeof message!=='string')return '';
  const match=message.trim().match(/^(?:nox[,!:]?\s+)?(?:please\s+)?(?:my name is|call me|i am called)\s+([\p{L}\p{N}][\p{L}\p{N}'’_-]*(?:\s+[\p{L}\p{N}][\p{L}\p{N}'’_-]*){0,3})[.!]?$/iu);
  const name=match?.[1]||'';
  return name.length<=40&&!/\b(?:not|never|don't|do not)\b/iu.test(name)?name:'';
}
