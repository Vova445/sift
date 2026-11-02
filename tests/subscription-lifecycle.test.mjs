import test from 'node:test';
import assert from 'node:assert/strict';
import {canTransition,entitlementActive,statusAtPeriodEnd,addCalendarMonth,wayForPayDate} from '../lib/subscription-lifecycle.js';

const states=['trialing','active','past_due','canceled','expired'];
const transitions={
  trialing:['active','past_due','canceled','expired'],
  active:['past_due','canceled','expired'],
  past_due:['active','canceled','expired'],
  canceled:['expired'],
  expired:[],
};

test('every lifecycle state transition is explicitly covered',()=>{
  for(const from of states)for(const to of states){
    assert.equal(canTransition(from,to),from===to||transitions[from].includes(to),`${from} → ${to}`);
  }
});

test('entitlements follow status and paid-through date',()=>{
  const future='2027-01-01T00:00:00.000Z',past='2025-01-01T00:00:00.000Z',now=Date.parse('2026-01-01T00:00:00.000Z');
  for(const state of ['trialing','active','canceled'])assert.equal(entitlementActive(state,future,now),true,`${state} retains access through the period`);
  for(const state of ['past_due','expired'])assert.equal(entitlementActive(state,future,now),false,`${state} has no premium access`);
  assert.equal(entitlementActive('active',past,now),false);
  assert.equal(statusAtPeriodEnd('canceled',past,now),'expired');
  assert.equal(statusAtPeriodEnd('active',future,now),'active');
});

test('monthly period rollover preserves month-end dates safely',()=>{
  assert.equal(addCalendarMonth(new Date('2026-01-31T12:00:00Z')).toISOString(),'2026-02-28T12:00:00.000Z');
  assert.equal(addCalendarMonth(new Date('2026-03-31T12:00:00Z')).toISOString(),'2026-04-30T12:00:00.000Z');
  assert.equal(wayForPayDate(new Date('2026-11-02T00:00:00Z')),'02.11.2026');
});
