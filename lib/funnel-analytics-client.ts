'use client';

export type ClientFunnelStage='visit'|'analyze'|'paywall';
const CONSENT_KEY='sift-funnel-consent';
const SESSION_KEY='sift-funnel-session';
let visitPromise:Promise<void>|null=null;

export function analyticsConsentGranted(){
  if(typeof window==='undefined'||privacySignalPresent())return false;
  try{return window.localStorage.getItem(CONSENT_KEY)==='granted'}catch{return false}
}

export function privacySignalPresent(){
  if(typeof window==='undefined')return false;
  return navigator.doNotTrack==='1'||(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl===true;
}

export function setAnalyticsConsent(value:'granted'|'denied'){
  visitPromise=null;
  try{window.localStorage.setItem(CONSENT_KEY,value);window.sessionStorage.removeItem(SESSION_KEY)}catch{}
}

export function funnelSessionId():string|null{
  if(!analyticsConsentGranted())return null;
  try{
    let id=window.sessionStorage.getItem(SESSION_KEY);
    if(!id){id=window.crypto.randomUUID();window.sessionStorage.setItem(SESSION_KEY,id)}
    return id;
  }catch{return null}
}

async function postStage(stage:ClientFunnelStage){
  const sessionId=funnelSessionId();
  if(!sessionId)return;
  try{await fetch('/api/analytics/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({stage,sessionId}),keepalive:true})}catch{}
}

export function trackFunnelVisit(){
  if(!funnelSessionId())return Promise.resolve();
  if(!visitPromise)visitPromise=postStage('visit');
  return visitPromise;
}

export async function trackFunnelStage(stage:ClientFunnelStage){
  await trackFunnelVisit();
  if(stage!=='visit')await postStage(stage);
}
