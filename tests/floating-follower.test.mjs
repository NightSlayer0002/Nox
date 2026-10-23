import test from 'node:test';
import assert from 'node:assert/strict';

let floatingBotTarget, createFloatingFollower;
try { ({floatingBotTarget, createFloatingFollower} = await import('../public/js/floating-follower.js')); } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

const target = (...args) => {
  assert.equal(typeof floatingBotTarget, 'function', 'the floating bot placement helper is available');
  return floatingBotTarget(...args);
};
const follower = (initial) => {
  assert.equal(typeof createFloatingFollower, 'function', 'the floating follower factory is available');
  return createFloatingFollower(initial);
};
const room = {left:0, top:0, right:400, bottom:600};

test('bot center sits beside the upper-right corner without covering the character', () => {
  assert.deepEqual(target({x:100, y:100, size:60}, room), {x:182, y:112});
});

test('bot flips left near the right edge and keeps its full tap target in bounds', () => {
  assert.deepEqual(target({x:330, y:100, size:60}, room), {x:308, y:112});
  assert.deepEqual(target({x:10, y:-20, size:60}, {...room, left:10, top:20}), {x:92, y:42});
  assert.deepEqual(target({x:330, y:590, size:60}, room), {x:308, y:578});
  assert.deepEqual(target({x:330, y:100, size:60}, room, 48), {x:306, y:112});
});

test('narrow bounds use space above or below instead of covering the character', () => {
  const narrow = {...room, right:100};
  assert.deepEqual(target({x:10, y:200, size:80}, narrow), {x:78, y:178});
  assert.deepEqual(target({x:10, y:10, size:80}, narrow), {x:78, y:112});
});

test('tiny or malformed placement bounds still produce finite centers', () => {
  assert.deepEqual(target({x:4, y:8, size:20}, {left:4, top:8, right:24, bottom:28}), {x:14, y:18});
  for (const result of [
    target({x:NaN, y:Infinity, size:-10}, {left:NaN, top:Infinity, right:NaN, bottom:-Infinity}, NaN),
    target({x:30, y:40, size:60}, {left:400, top:600, right:0, bottom:0}),
    target({}, {}),
  ]) {
    assert.ok(Number.isFinite(result.x) && Number.isFinite(result.y));
  }
});

test('an idle follower never wanders or generates trails', () => {
  const motion = follower({x:36, y:48});
  for (let frame=0; frame<600; frame++) motion.update({x:36, y:48, time:frame/60, dt:1/60});
  assert.deepEqual(motion.state, {x:36, y:48, trail:[], opacity:0, settled:true});
});

test('a changed target eases along the actual bot path and settles exactly', () => {
  const motion = follower({x:20, y:30});
  motion.update({x:200, y:100, time:1/60, dt:1/60});
  assert.ok(motion.state.x > 20 && motion.state.x < 200);
  assert.ok(motion.state.y > 30 && motion.state.y < 100);
  assert.equal(motion.state.settled, false);
  assert.equal(motion.state.opacity, 1);
  assert.ok(motion.state.trail.length >= 2);
  assert.deepEqual(motion.state.trail[0], {x:20, y:30, age:1/27});
  assert.ok(motion.state.trail.every(point => point.x <= motion.state.x && point.y <= motion.state.y));
  for (let frame=2; frame<=120; frame++) motion.update({x:200, y:100, time:frame/60, dt:1/60});
  assert.equal(motion.state.x, 200);
  assert.equal(motion.state.y, 100);
  assert.equal(motion.state.settled, true);
  assert.deepEqual(motion.state.trail, []);
  assert.equal(motion.state.opacity, 0);
});

test('the same elapsed drag response is consistent at 30Hz and 60Hz', () => {
  const positions = [30, 60].map(hz => {
    const motion = follower();
    for (let frame=1; frame<=hz/5; frame++) motion.update({x:200, y:100, time:frame/hz, dt:1/hz});
    return motion.state;
  });
  assert.ok(Math.abs(positions[0].x - positions[1].x) < 0.01);
  assert.ok(Math.abs(positions[0].y - positions[1].y) < 0.01);
});

for (const hz of [30, 60]) {
  test(`trail fades and expires by elapsed time at ${hz}Hz`, () => {
    const motion = follower();
    motion.update({x:100, y:60, time:0, dt:1/hz});
    const {x, y} = motion.state;
    for (let frame=1; frame<=hz/5; frame++) motion.update({x, y, time:frame/hz, dt:1/hz});
    assert.equal(motion.state.settled, true);
    assert.ok(motion.state.trail.length > 0);
    assert.ok(motion.state.opacity > 0 && motion.state.opacity < 1);
    assert.ok(motion.state.trail.every(point => point.age >= 0 && point.age <= 1));
    for (let frame=hz/5+1; frame<=hz; frame++) motion.update({x, y, time:frame/hz, dt:1/hz});
    assert.deepEqual(motion.state.trail, []);
    assert.equal(motion.state.opacity, 0);
    assert.equal(motion.state.x, x);
    assert.equal(motion.state.y, y);
  });
}

test('continuous dragging keeps a bounded trail of recent actual positions', () => {
  const motion = follower();
  for (let frame=1; frame<=240; frame++) {
    motion.update({x:frame*3, y:frame, time:frame/120, dt:1/120});
    assert.ok(motion.state.trail.length <= 24);
    for (const point of motion.state.trail) {
      assert.ok(point.age >= 0 && point.age <= 1);
      assert.ok(point.x <= motion.state.x && point.y <= motion.state.y);
    }
  }
  motion.update({x:motion.state.x, y:motion.state.y, time:10, dt:0});
  assert.deepEqual(motion.state.trail, []);
});

test('long or invalid frame deltas cannot teleport or poison the follower', () => {
  const normal = follower();
  const paused = follower();
  normal.update({x:200, y:100, time:1/30, dt:1/30});
  paused.update({x:200, y:100, time:10, dt:10});
  assert.equal(paused.state.x, normal.state.x);
  assert.equal(paused.state.y, normal.state.y);
  assert.ok(paused.state.x < 200);
  const before = {x:paused.state.x, y:paused.state.y};
  for (const dt of [NaN, Infinity, -1]) paused.update({x:NaN, y:Infinity, time:NaN, dt});
  assert.equal(paused.state.x, before.x);
  assert.equal(paused.state.y, before.y);
  assert.ok(paused.state.trail.every(point => Number.isFinite(point.age)));
});

test('reduced motion snaps to placement and clears the entire trail', () => {
  const motion = follower({x:10, y:20});
  motion.update({x:100, y:120, time:0, dt:1/60});
  assert.ok(motion.state.trail.length);
  motion.update({x:180, y:220, time:1/60, dt:1/60, reduceMotion:true});
  assert.deepEqual(motion.state, {x:180, y:220, trail:[], opacity:0, settled:true});
});

test('reset clears suspension history and reentry follows only the new placement', () => {
  const motion = follower({x:10, y:20});
  const state = motion.state;
  motion.update({x:500, y:400, time:100, dt:1/60});
  motion.reset({x:70, y:80});
  assert.equal(motion.state, state);
  assert.deepEqual(motion.state, {x:70, y:80, trail:[], opacity:0, settled:true});
  motion.update({x:100, y:110, time:0, dt:1/60});
  assert.ok(motion.state.x > 70 && motion.state.x < 100);
  assert.ok(motion.state.trail.every(point => point.x >= 70 && point.x <= 100));
  assert.ok(motion.state.trail.every(point => point.age < 0.1));
});
