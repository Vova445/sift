import test from 'node:test';
import assert from 'node:assert/strict';
import {billingEventKey,wayForPayEventKey} from '../lib/billing-event-key.js';

test('same signed provider event has a stable idempotency key',()=>{
  const fields='merchant;order;279;UAH;auth;card;Approved;1100',signature='valid-signature';
  assert.equal(wayForPayEventKey(fields,signature),wayForPayEventKey(fields,signature));
  assert.match(wayForPayEventKey(fields,signature),/^[a-f\d]{64}$/);
});

test('a changed signed transaction produces a different event key',()=>{
  const fields='merchant;order;279;UAH;auth;card;Approved;1100';
  assert.notEqual(wayForPayEventKey(fields,'signature-one'),wayForPayEventKey(fields,'signature-two'));
  assert.notEqual(wayForPayEventKey(fields,'signature'),wayForPayEventKey(fields.replace('Approved','Declined'),'signature'));
});

test('invalid raw payloads can be logged by digest without storing their body',()=>{
  const raw='{"merchantSignature":"not-a-real-signature"}';
  assert.notEqual(billingEventKey(raw),billingEventKey(raw+' '));
});
