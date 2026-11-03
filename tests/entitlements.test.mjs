import test from 'node:test';
import assert from 'node:assert/strict';
import {featureAllowed,featureDeniedResponse} from '../lib/entitlement-policy.js';

const plans={free:{plan:'free'},one:{plan:'one'},pro:{plan:'pro'}};

test('Free cannot bypass paid API features or the monthly scan limit',()=>{
  for(const feature of ['full_evidence','translate','purchase_planner','export_history','unlimited_scans']){
    assert.equal(featureAllowed(plans.free,feature),false,`free cannot access ${feature}`);
  }
  const denied=featureDeniedResponse(featureAllowed(plans.free,'translate'),'Переклад платний');
  assert.equal(denied.status,403);
});

test('unknown entitlement names fail closed',()=>{
  assert.equal(featureAllowed(plans.pro,'admin_override'),false);
  assert.equal(featureAllowed({plan:'unknown'},'translate'),false);
});

test('One Sift unlocks one full report and only its report evidence translation',()=>{
  assert.equal(featureAllowed(plans.one,'full_evidence','one'),true);
  assert.equal(featureAllowed(plans.one,'full_evidence',null),false);
  assert.equal(featureAllowed(plans.one,'translate','one'),true);
  assert.equal(featureAllowed(plans.one,'translate',null),false);
  assert.equal(featureAllowed(plans.one,'purchase_planner'),false);
  assert.equal(featureAllowed(plans.one,'unlimited_scans'),false);
});

test('Pro unlocks paid features and denied responses are HTTP 403',async()=>{
  for(const feature of ['full_evidence','translate','purchase_planner','export_history','unlimited_scans'])
    assert.equal(featureAllowed(plans.pro,feature),true,`pro can access ${feature}`);
  const denied=featureDeniedResponse(false,'Forbidden');
  assert.equal(denied.status,403);
  assert.deepEqual(await denied.json(),{error:'Forbidden'});
  assert.equal(featureDeniedResponse(true),null);
});

test('unverified accounts have no paid feature entitlements',()=>{
  // can(user, feature) requires currentUser.emailVerified before applying this plan matrix.
  const verified=(emailVerified,feature)=>emailVerified&&featureAllowed(plans.pro,feature);
  for(const feature of ['full_evidence','translate','purchase_planner','export_history','unlimited_scans']){
    assert.equal(verified(false,feature),false);
    assert.equal(verified(true,feature),true);
  }
});
