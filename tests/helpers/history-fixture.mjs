// Seed prior persisted summary state for revision tests. Normal summary tests
// obtain their opaque commit scope from the production summaryWork boundary.
export async function seedSummary(storage,history,through,summary){
  const state=JSON.parse(storage.getItem('nox.chats.v1')),thread=state.threads.find(value=>value.id===history.active().id);
  thread.summaryThrough=through;thread.summary=summary;storage.setItem('nox.chats.v1',JSON.stringify(state));await history.refresh();
}
