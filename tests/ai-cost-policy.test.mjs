import test from 'node:test';
import assert from 'node:assert/strict';
import {canReserveDailyAi,estimateCostMicros,estimateTokens,translationHash} from '../lib/ai-cost-policy.js';

test('normalized report evidence has a stable model and language scoped cache hash',async()=>{
  const first=await translationHash('  Monthly   subscription renews automatically. ');
  const repeated=await translationHash('Monthly subscription renews automatically.');
  const changed=await translationHash('Monthly subscription renews manually.');
  const otherModel=await translationHash('Monthly subscription renews automatically.','another-model');
  assert.equal(first,repeated);
  assert.notEqual(first,changed);
  assert.notEqual(first,otherModel);
});

test('global daily request and token budgets reject calls before provider invocation',()=>{
  const state={requests:4,actualTokens:700,reservedTokens:100};
  assert.equal(canReserveDailyAi(state,200,5,1000),true);
  assert.equal(canReserveDailyAi(state,201,5,1000),false);
  assert.equal(canReserveDailyAi(state,1,4,1000),false);
  assert.equal(canReserveDailyAi(state,0,5,1000),false);
});

test('token and cost estimates are bounded, monotonic and use the current model rate',()=>{
  assert.equal(estimateTokens(''),1);
  assert.equal(estimateTokens('abcdef'),2);
  assert.equal(estimateCostMicros(1000,1000),684);
  assert.equal(estimateCostMicros(2000,0),684);
});
