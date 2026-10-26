export function historyFailure(history,fallback='This conversation changed in another tab. Reopen it and try again.'){
  if(history.lastError==='delete-not-saved')return 'The conversation was not removed. NOX could not save the deletion to browser storage. Export a copy and try again when storage is available.';
  if(history.lastError==='conversation-limit')return 'This archive has reached 40 conversations. Export a copy, then delete a conversation to make room. Nothing was removed automatically.';
  if(history.lastError==='turn-limit')return 'This conversation has reached its 200-message limit. Start a new conversation to continue. Your transcript and draft are unchanged.';
  return fallback;
}

export function historyNotice(history,{guest=false}={}){
  const privacy=guest?'This visit only · clears on refresh.':history.persistent?'Saved in this browser.':'This chat lasts for this visit only.';
  if(history.recovery?.reason==='changed')return {privacy,protected:true,message:'A readable archive arrived from another tab. Its bytes and your temporary chats are both untouched. Download the archive or confirm saving both together.'};
  if(history.recovery)return {privacy,protected:true,message:history.recovery.reason==='unsupported'?'This saved archive uses a newer or unsupported format. Its original data is untouched. These chats are temporary until you recover or replace the archive.':'This saved archive could not be read. Its original data is untouched. Download it for recovery; these chats stay temporary.'};
  if(!guest&&!history.persistent)return {privacy,protected:false,message:'Chats are not being saved to this browser. Export a copy before refreshing or leaving this visit.'};
  const {conversations=40,turns=200,conversationCount=0,turnCount=0}=history.capacity||{};
  const limits=[];
  if(turnCount>=turns-20)limits.push(`${turnCount} of ${turns} messages in this conversation. Start a new conversation before the limit.`);
  if(conversationCount>=conversations-2)limits.push(`${conversationCount} of ${conversations} conversations. Export a copy and remove a conversation if you need room.`);
  return {privacy,protected:false,message:limits.length?`${limits.join(' ')} NOX never removes older material automatically.`:''};
}
