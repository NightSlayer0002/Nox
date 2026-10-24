// Quotes, passages and fictional dialogue are not identity declarations.
export function selfDeclaredName(message){
  if(typeof message!=='string')return '';
  const match=message.trim().match(/^(?:nox[,!:]?\s+)?(?:please\s+)?(my name is|call me|i am called)\s+([\p{L}\p{N}][\p{L}\p{N}'’_-]*(?:\s+[\p{L}\p{N}][\p{L}\p{N}'’_-]*){0,3})[.!]?$/iu);
  const name=match?.[2]||'';
  // Callback and timing requests are not declarations of identity. Explicit
  // "my name is" remains available even for an unusual name such as Later.
  if(match?.[1].toLowerCase()==='call me'&&/^(?:later|back|tomorrow|tonight|today|soon|now|again|sometime|anytime|when|whenever|after|before|once|in|at|on|next)\b/iu.test(name))return '';
  return name.length<=40&&!/\b(?:not|never|don't|do not)\b/iu.test(name)?name:'';
}
