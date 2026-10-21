import test from 'node:test';
import assert from 'node:assert/strict';
import {LinearFilter,SRGBColorSpace} from 'three';
import {createSurfaceTexture} from '../client/source-texture.js';

test('a growing or shrinking source replaces immutable texture storage and releases each superseded texture',()=>{
  const surface=createSurfaceTexture({anisotropy:16}),canvas={width:256,height:256};
  const first=surface.update(canvas),released=[];
  first.addEventListener('dispose',()=>released.push(first));
  const version=first.version;
  assert.equal(surface.update(canvas),first);assert.ok(first.version>version);
  canvas.width=canvas.height=512;
  const grown=surface.update(canvas);grown.addEventListener('dispose',()=>released.push(grown));
  assert.notEqual(grown,first);assert.notEqual(grown.source,first.source);assert.deepEqual(released,[first]);
  canvas.width=canvas.height=384;
  const shrunk=surface.update(canvas);shrunk.addEventListener('dispose',()=>released.push(shrunk));
  assert.notEqual(shrunk,grown);assert.deepEqual(released,[first,grown]);
  assert.equal(shrunk.image,canvas);assert.equal(shrunk.colorSpace,SRGBColorSpace);
  assert.equal(shrunk.generateMipmaps,false);assert.equal(shrunk.minFilter,LinearFilter);assert.equal(shrunk.magFilter,LinearFilter);assert.equal(shrunk.anisotropy,4);
  surface.dispose();surface.dispose();
  assert.deepEqual(released,[first,grown,shrunk]);assert.equal(surface.update(canvas),null);
});

test('context restoration with a different canvas replaces the texture at equal dimensions',()=>{
  const surface=createSurfaceTexture(),original=surface.update({width:384,height:384});let released=0;
  original.addEventListener('dispose',()=>released++);
  const restored=surface.update({width:384,height:384});
  assert.notEqual(restored,original);assert.notEqual(restored.source,original.source);assert.equal(released,1);
  surface.dispose();
});
