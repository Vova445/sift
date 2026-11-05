import test from 'node:test';
import assert from 'node:assert/strict';
import { annualCost, compareOfferReports } from '../lib/offer-comparison.js';

const report=(overrides={})=>({score:70,decision:'wait',prices:[],findings:[],priceDetails:[],...overrides});

test('annual cost selects the lowest explicitly recurring option in one currency',()=>{
  const value=annualCost(report({priceDetails:[
    {amount:11.99,currency:'USD',cadence:'monthly',annualAmount:143.88},
    {amount:119.99,currency:'USD',cadence:'yearly',annualAmount:119.99},
    {amount:4.99,currency:'EUR',cadence:'monthly',annualAmount:59.88},
  ]}));
  assert.deepEqual(value,{amount:null,currency:null,cadence:null,sourceAmount:null,reason:'mixed-currency'});
  const oneCurrency=annualCost(report({priceDetails:[
    {amount:11.99,currency:'USD',cadence:'monthly',annualAmount:143.88},
    {amount:119.99,currency:'USD',cadence:'yearly',annualAmount:119.99},
  ]}));
  assert.deepEqual(oneCurrency,{amount:119.99,currency:'USD',cadence:'yearly',sourceAmount:119.99,firstYearAmount:119.99,introMonths:0,reason:null});
});

test('comparison declares a cheaper offer only for same-currency annualized prices',()=>{
  const result=compareOfferReports(
    report({score:72,priceDetails:[{amount:12.99,currency:'USD',cadence:'monthly',annualAmount:155.88}]}),
    report({score:80,priceDetails:[{amount:11.99,currency:'USD',cadence:'monthly',annualAmount:143.88}],findings:[{kind:'penalty'}]}),
  );
  assert.equal(result.priceWinner,'right');
  assert.equal(result.clarityWinner,'right');
  assert.match(result.verdict,/Пропозиція 2 на 12\.00 USD/);
  assert.equal(result.comparable,true);
});

test('different currencies and missing billing periods never produce a false price winner',()=>{
  const usd=report({priceDetails:[{amount:12,currency:'USD',cadence:'monthly',annualAmount:144}]});
  const eur=report({priceDetails:[{amount:10,currency:'EUR',cadence:'monthly',annualAmount:120}]});
  assert.equal(compareOfferReports(usd,eur).priceWinner,null);
  assert.match(compareOfferReports(usd,eur).verdict,/різні або змішані валюти/);
  assert.equal(compareOfferReports(usd,report()).priceWinner,null);
  assert.match(compareOfferReports(usd,report()).verdict,/Не вдалося підтвердити періодичну ціну/);
});

test('low-confidence price evidence is excluded from annual rankings',()=>{
  const uncertain=report({
    priceDetails:[{amount:10,currency:'USD',cadence:'monthly',annualAmount:120}],
    findings:[{kind:'price',confidence:'low',evidence:'Starting at $10 per month'}],
  });
  assert.equal(annualCost(uncertain).amount,null);
  assert.equal(annualCost(uncertain).reason,'low-confidence');
  assert.equal(compareOfferReports(uncertain,report({priceDetails:[{amount:100,currency:'USD',cadence:'yearly',annualAmount:100}]})).priceWinner,null);
});
