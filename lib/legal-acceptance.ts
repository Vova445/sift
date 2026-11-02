import {env} from 'cloudflare:workers';
import {LEGAL_POLICY_VERSIONS,type SignupLegalConsent,type CheckoutLegalConsent} from './legal-consent-policy.js';

export function signupAcceptanceStatement(userId:string,consent:SignupLegalConsent,acceptedAt=new Date().toISOString()){
  return env.DB.prepare(`INSERT INTO legal_acceptances(id,user_id,context,terms_version,privacy_version,terms_accepted,privacy_acknowledged,accepted_at) VALUES(?,?,'signup',?,?,1,1,?)`)
    .bind(crypto.randomUUID(),userId,LEGAL_POLICY_VERSIONS.terms,LEGAL_POLICY_VERSIONS.privacy,acceptedAt);
}

export function checkoutAcceptanceStatement(input:{userId:string;plan:'one'|'pro';orderReference:string;consent:CheckoutLegalConsent;acceptedAt?:string}){
  const acceptedAt=input.acceptedAt||new Date().toISOString();
  return env.DB.prepare(`INSERT INTO legal_acceptances(id,user_id,context,plan,order_reference,terms_version,privacy_version,refund_version,terms_accepted,privacy_acknowledged,refund_accepted,immediate_performance,accepted_at) VALUES(?,?,'checkout',?,?,?,?,?,1,1,1,1,?)`)
    .bind(crypto.randomUUID(),input.userId,input.plan,input.orderReference,LEGAL_POLICY_VERSIONS.terms,LEGAL_POLICY_VERSIONS.privacy,LEGAL_POLICY_VERSIONS.refund,acceptedAt);
}
