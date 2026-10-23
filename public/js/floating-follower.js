const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const fitCenter = (value, min, max, half) => max-min < half*2 ? min/2+max/2 : clamp(value, min+half, max-half);

// Avatar x/y is its CSS-pixel top-left; the result is the control's center.
export function floatingBotTarget(avatar={}, bounds={}, buttonSize=44) {
  const x=finite(avatar.x, 0), y=finite(avatar.y, 0), size=Math.max(0, finite(avatar.size, 0));
  const half=Math.max(1, finite(buttonSize, 44))/2;
  let left=finite(bounds.left, 0), top=finite(bounds.top, 0);
  let right=finite(bounds.right, left+size+half*2), bottom=finite(bounds.bottom, top+size+half*2);
  if (left > right) [left, right]=[right, left];
  if (top > bottom) [top, bottom]=[bottom, top];
  const preferredX=x+size+half;
  let centerX=preferredX, centerY=y+12;
  if (preferredX+half > right || preferredX-half < left) {
    if (x-half*2 >= left && x <= right) centerX=x-half;
    else {
      // A narrow workspace may only leave room vertically.
      if (y-half*2 >= top && y <= bottom) centerY=y-half;
      else if (y+size >= top && y+size+half*2 <= bottom) centerY=y+size+half;
    }
  }
  return {x:fitCenter(centerX, left, right, half), y:fitCenter(centerY, top, bottom, half)};
}

const TRAIL_SECONDS=0.45;

export function createFloatingFollower({x=0, y=0}={}) {
  const state={x:finite(x, 0), y:finite(y, 0), trail:[], opacity:0, settled:true};
  let targetX=state.x, targetY=state.y, clock=0, history=[];

  function reset({x=state.x, y=state.y}={}) {
    state.x=targetX=finite(x, state.x);
    state.y=targetY=finite(y, state.y);
    state.trail=[];
    state.opacity=0;
    state.settled=true;
    clock=0;
    history=[];
    return state;
  }

  function update({x=targetX, y=targetY, time, dt=0, reduceMotion=false}={}) {
    targetX=finite(x, targetX);
    targetY=finite(y, targetY);
    // Motion never catches up a suspended tab in one jump; trail expiry uses real time.
    const elapsed=clamp(finite(dt, 0), 0, 1/30);
    clock=Math.max(clock, finite(time, clock+elapsed));
    history=history.filter(point => clock-point.time < TRAIL_SECONDS);
    if (reduceMotion) {
      state.x=targetX;
      state.y=targetY;
      state.settled=true;
      history=[];
    } else {
      const oldX=state.x, oldY=state.y;
      const distance=Math.hypot(targetX-oldX, targetY-oldY);
      state.settled=distance <= 0.15;
      if (state.settled) {
        state.x=targetX;
        state.y=targetY;
      } else if (elapsed > 0) {
        const ease=1-Math.exp(-16*elapsed);
        state.x+=(targetX-state.x)*ease;
        state.y+=(targetY-state.y)*ease;
        if (Math.hypot(targetX-state.x, targetY-state.y) <= 0.15) {
          state.x=targetX;
          state.y=targetY;
          state.settled=true;
        }
      }
      if (state.x !== oldX || state.y !== oldY) {
        if (!history.length) history.push({x:oldX, y:oldY, time:clock-elapsed});
        history.push({x:state.x, y:state.y, time:clock});
        if (history.length > 24) history.splice(0, history.length-24);
      }
    }
    state.trail=history.map(point => ({x:point.x, y:point.y, age:clamp((clock-point.time)/TRAIL_SECONDS, 0, 1)}));
    state.opacity=history.length ? 1-state.trail.at(-1).age : 0;
    return state;
  }

  return {state, update, reset};
}
