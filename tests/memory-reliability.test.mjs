import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemory } from '../public/js/memory.js';
import { createVisitScope } from '../public/js/visit-storage.js';

const KEY = 'nox.memory.v1';
const empty = { version: 1, name: '', facts: [], history: [], mode: 'companion' };
const saved = { version: 1, name: 'Abhi', facts: ['likes tea'], history: [{ role: 'user', content: 'Private conversation' }], mode: 'companion' };
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}

test('a stale memory instance cannot restore cleared personal data through another mutation', async () => {
  for (const [mutate, expected] of [
    [memory => memory.setMode('director'), { ...empty, mode: 'director' }],
    [memory => memory.setName('New name'), { ...empty, name: 'New name' }],
    [memory => memory.remember('new fact'), { ...empty, facts: ['new fact'] }],
    [memory => memory.addTurn('assistant', 'New turn'), { ...empty, history: [{ role: 'assistant', content: 'New turn' }] }],
    [memory => memory.clearHistory(), empty],
  ]) {
    const disk = storage();
    disk.setItem(KEY, JSON.stringify(saved));
    const owner = createMemory(disk), stale = createMemory({ ...disk });
    await owner.clear();
    await mutate(stale);
    assert.deepEqual(createMemory(disk).snapshot(), expected);
  }
});

test('unrelated stale mutations preserve a removed name and cleared legacy history', async () => {
  const disk = storage();
  disk.setItem(KEY, JSON.stringify(saved));
  const owner = createMemory(disk), stale = createMemory({ ...disk });
  await owner.setName('');
  await owner.clearHistory();
  await stale.remember('likes coffee');
  assert.deepEqual(createMemory(disk).snapshot(), { ...empty, facts: ['likes tea', 'likes coffee'] });
});

test('snapshot and refresh observe external edits and storage-key removal', () => {
  const disk = storage();
  disk.setItem(KEY, JSON.stringify(saved));
  const memory = createMemory(disk);
  disk.setItem(KEY, JSON.stringify({ ...empty, name: 'Other name' }));
  assert.equal(memory.snapshot().name, 'Other name');
  disk.removeItem(KEY);
  memory.refresh();
  assert.deepEqual(memory.snapshot(), empty);
});

test('storage events notify memory subscribers for deletions and can be released', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const target = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target });
  const disk = storage();
  disk.setItem(KEY, JSON.stringify(saved));
  const memory = createMemory(disk), changes = [];
  const dispatch = (key, storageArea = disk) => {
    const event = new Event('storage');
    Object.assign(event, { key, storageArea });
    target.dispatchEvent(event);
  };
  try {
    const unsubscribe = memory.subscribe(state => changes.push(state));
    disk.removeItem(KEY);
    dispatch('other-app');
    dispatch(KEY, storage());
    assert.equal(changes.length, 0);
    dispatch(null);
    assert.deepEqual(changes, [empty]);
    unsubscribe();
    disk.setItem(KEY, JSON.stringify(saved));
    dispatch(KEY);
    assert.equal(changes.length, 1);
    memory.subscribe(state => changes.push(state));
    memory.dispose();
    disk.removeItem(KEY);
    dispatch(KEY);
    assert.equal(changes.length, 1);
  } finally {
    memory.dispose?.();
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else delete globalThis.window;
  }
});

test('Web Locks serialize a deletion and another tab mutation against the latest bytes', async () => {
  const disk = storage();
  disk.setItem(KEY, JSON.stringify(saved));
  const owner = createMemory(disk), stale = createMemory({ ...disk });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), queue = [];
  const locks = { request(name, action) { return new Promise((resolve, reject) => queue.push({ name, action, resolve, reject })); } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } });
  try {
    const clear = owner.clear(), update = stale.setMode('director');
    assert.equal(queue.length, 2);
    assert.equal(new Set(queue.map(operation => operation.name)).size, 1);
    assert.deepEqual(JSON.parse(disk.getItem(KEY)), saved);
    while (queue.length) {
      const operation = queue.shift();
      try { operation.resolve(await operation.action()); } catch (error) { operation.reject(error); }
    }
    assert.equal(await clear, true);
    assert.equal(await update, true);
    assert.equal(stale.crossTabSafe, true);
    assert.deepEqual(createMemory(disk).snapshot(), { ...empty, mode: 'director' });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  }
});

test('corrupt, malformed and newer memory bytes survive ordinary mutations and clear', async () => {
  for (const raw of ['{broken', JSON.stringify({ version: 2, name: 'future data' }), JSON.stringify({ version: 1, name: {}, facts: [], history: [], mode: 'companion' })]) {
    const disk = storage();
    disk.setItem(KEY, JSON.stringify(saved));
    const existing = createMemory(disk);
    disk.setItem(KEY, raw);
    for (const memory of [existing, createMemory(disk)]) {
      for (const mutate of [() => memory.setName('Visit name'), () => memory.setMode('director'), () => memory.remember('Visit fact'), () => memory.addTurn('user', 'Visit turn'), () => memory.clearHistory(), () => memory.clear()]) {
        const committed = await mutate();
        assert.equal(disk.getItem(KEY), raw);
        assert.equal(committed, false);
      }
      assert.equal(memory.persistent, false);
      assert.equal(memory.status.error, 'unreadable-storage');
      assert.equal(memory.status.hasStoredData, true);
    }
    disk.setItem(KEY, JSON.stringify(empty));
    assert.equal(await existing.setName('Recovered name'), true);
    assert.equal(existing.persistent, true);
    assert.equal(existing.status.error, null);
    assert.equal(createMemory(disk).snapshot().name, 'Recovered name');
  }
});

test('inaccessible reads keep memory usable for the visit without replacing unseen data', async () => {
  const disk = storage(), raw = JSON.stringify(saved);
  disk.setItem(KEY, raw);
  const memory = createMemory({ ...disk, getItem() { throw Error('blocked'); } });
  assert.equal(await memory.setName('Visit name'), false);
  assert.equal(memory.snapshot().name, 'Visit name');
  await memory.remember('Visit fact');
  assert.deepEqual(memory.snapshot().facts, ['Visit fact']);
  assert.equal(memory.persistent, false);
  assert.equal(memory.status.error, 'storage-unavailable');
  await memory.clear();
  assert.deepEqual(memory.snapshot(), empty);
  assert.equal(disk.getItem(KEY), raw);
});

test('failed writes retain visit memory but external deletion still wins on refresh', async () => {
  const disk = storage();
  disk.setItem(KEY, JSON.stringify(saved));
  const memory = createMemory({ ...disk, setItem() { throw Error('full'); } });
  assert.equal(await memory.setName('Visit name'), false);
  assert.equal(memory.snapshot().name, 'Visit name');
  await memory.remember('Visit fact');
  assert.deepEqual(memory.snapshot().facts, ['likes tea', 'Visit fact']);
  assert.equal(memory.persistent, false);
  assert.equal(memory.status.error, 'storage-full-or-blocked');
  disk.removeItem(KEY);
  memory.refresh();
  assert.deepEqual(memory.snapshot(), empty);
});

test('guest memory stays visit-only and cannot read or overwrite owner memory', async () => {
  const disk = storage(), raw = JSON.stringify(saved);
  disk.setItem(KEY, raw);
  const guest = createVisitScope({ owner: false, storage: disk });
  const memory = createMemory(guest.storage);
  assert.deepEqual(memory.snapshot(), empty);
  await memory.setName('Guest name');
  await memory.remember('Guest fact');
  assert.equal(memory.persistent, false);
  assert.equal(createMemory(guest.storage).snapshot().name, 'Guest name');
  assert.deepEqual(createMemory(createVisitScope({ owner: false, storage: disk }).storage).snapshot(), empty);
  assert.equal(disk.getItem(KEY), raw);
});
