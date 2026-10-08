// Public visual texture only: retain readiness so delayed app initialization
// cannot miss the source canvas. No private page/camera/chat snapshot is stored.
export function createBackgroundChannel(){let current;const listeners=new Set();return {publish(canvas){current=canvas;for(const listener of listeners)listener(canvas);},subscribe(listener){listeners.add(listener);if(current!==undefined)listener(current);return()=>listeners.delete(listener);}};}
export const sourceBackground=createBackgroundChannel();
