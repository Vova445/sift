import test from 'node:test';
import assert from 'node:assert/strict';
import {isPublicVerdictToken,publicVerdictCard,publicVerdictLabel} from '../lib/public-verdict-policy.js';

test('public share tokens require a long URL-safe capability token',()=>{
  assert.equal(isPublicVerdictToken('A'.repeat(43)),true);
  assert.equal(isPublicVerdictToken('short'),false);
  assert.equal(isPublicVerdictToken(`${'A'.repeat(42)}=`),false);
  assert.equal(isPublicVerdictToken('A'.repeat(44)),false);
});

test('public card is an allowlist containing only score and decision',()=>{
  const card=publicVerdictCard({score:84,decision:'wait',title:'Private course',url:'https://example.test/checkout?email=a@b.test',email:'a@b.test',findings:[{evidence:'private evidence'}]});
  assert.deepEqual(card,{score:84,decision:'wait'});
  assert.deepEqual(Object.keys(card).sort(),['decision','score']);
  assert.equal(publicVerdictCard({score:101,decision:'buy'}),null);
  assert.equal(publicVerdictCard({score:70,decision:'sell'}),null);
  assert.equal(publicVerdictCard({score:'70',decision:'wait'}),null);
});

test('decision labels are localized and reject unknown categories safely',()=>{
  assert.equal(publicVerdictLabel('buy'),'МОЖНА ОЦІНЮВАТИ ПОКУПКУ');
  assert.equal(publicVerdictLabel('close','en'),'REVIEW BEFORE PAYING');
  assert.equal(publicVerdictLabel('unknown'),'ПЕРЕВІРТЕ УМОВИ');
});
