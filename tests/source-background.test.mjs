import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackgroundChannel} from '../public/js/source-background.js';
test('a stage subscribing after scene readiness still receives the current public canvas',()=>{const channel=createBackgroundChannel(),canvas={width:640},seen=[];channel.publish(canvas);channel.subscribe(value=>seen.push(value));assert.deepEqual(seen,[canvas]);});
test('later source replacement and disposal notify active consumers only',()=>{const channel=createBackgroundChannel(),seen=[];const stop=channel.subscribe(value=>seen.push(value));const canvas={width:640};channel.publish(canvas);channel.publish(null);stop();channel.publish({width:320});assert.deepEqual(seen,[canvas,null]);});
