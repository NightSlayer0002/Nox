// A turn token ties an asynchronous reply to the interaction that requested it.
export function createTurnGate() {
  let version = 0;
  let controller = null;
  function cancel() { version++; controller?.abort(); controller = null; }
  return {
    begin() { cancel(); return version; },
    cancel,
    isCurrent(token) { return token === version; },
    attach(token, value) { if (token === version) controller = value; else value.abort(); },
  };
}
