import {env} from 'cloudflare:workers';

export const PASSWORD_ITERATIONS=310000;
const encoder=new TextEncoder();
const secret=()=>{
  const value=(env as unknown as Record<string,string|undefined>).PASSWORD_PEPPER||'';
  if(value.length<32)throw new Error('PASSWORD_PEPPER must be configured with at least 32 characters');
  return value;
};
const toBase64Url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const fromBase64Url=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
const random=(size:number)=>{const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);return bytes};
const hexBytes=(value:string)=>Uint8Array.from(value.match(/.{2}/g)||[],pair=>parseInt(pair,16));
const hex=(bytes:Uint8Array)=>Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');

async function pepperKey(){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode(secret())),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function pepperMac(value:string){const key=await crypto.subtle.importKey('raw',encoder.encode(secret()),{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));}
function proofMessage(email:string,purpose:string,id:string,nonce:string){return `sift-password-v1|${purpose}|${email}|${id}|${nonce}`;}
function safeEqual(a:Uint8Array,b:Uint8Array){if(a.length!==b.length)return false;let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];return mismatch===0;}

let challengeSchema:Promise<void>|null=null;
async function ensureChallengeSchema(){
  if(!challengeSchema)challengeSchema=(async()=>{
    await (env as unknown as {DB:{prepare:(sql:string)=>{run:()=>Promise<unknown>}}}).DB.prepare(`CREATE TABLE IF NOT EXISTS auth_password_challenges(id TEXT PRIMARY KEY,email TEXT NOT NULL,purpose TEXT NOT NULL,nonce TEXT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT)`).run();
    await (env as unknown as {DB:{prepare:(sql:string)=>{run:()=>Promise<unknown>}}}).DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_password_challenges_email_expiry ON auth_password_challenges(email,expires_at DESC)`).run();
    await (env as unknown as {DB:{prepare:(sql:string)=>{run:()=>Promise<unknown>}}}).DB.prepare(`CREATE TRIGGER IF NOT EXISTS cleanup_password_challenges_after_user_delete AFTER DELETE ON users BEGIN DELETE FROM auth_password_challenges WHERE email=OLD.email; END`).run();
  })();
  return challengeSchema;
}

export type PasswordPurpose='login'|'change'|'delete';
export type PasswordChallenge={id:string;email:string;purpose:PasswordPurpose;nonce:string;expires_at:string;used_at:string|null};
type Db={prepare:(sql:string)=>{bind:(...values:unknown[])=>{first:<T>()=>Promise<T|null>;run:()=>Promise<{meta?:{changes?:number}}>}};batch:(statements:unknown[])=>Promise<Array<{meta?:{changes?:number}}>>};
const db=()=>((env as unknown as {DB:Db}).DB);
const validEmail=(email:string)=>email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export async function issuePasswordChallenge(emailInput:unknown,purposeInput:unknown){
  await ensureChallengeSchema();
  if(typeof emailInput!=='string'||typeof purposeInput!=='string'||!['login','change','delete'].includes(purposeInput))throw new Error('Некоректний запит.');
  const email=emailInput.trim().toLowerCase();
  if(!validEmail(email))throw new Error('Введіть коректний email.');
  await db().prepare(`DELETE FROM auth_password_challenges WHERE expires_at<? OR used_at<?`).bind(new Date(Date.now()-24*60*60_000).toISOString(),new Date(Date.now()-24*60*60_000).toISOString()).run();
  const user=await db().prepare(`SELECT salt,password_iterations FROM users WHERE email=?`).bind(email).first<{salt:string;password_iterations:number}>();
  const fakeSalt=toBase64Url((await pepperMac(`fake-salt:${email}`)).slice(0,24));
  const id=toBase64Url(random(24)),nonce=toBase64Url(random(24)),expires=new Date(Date.now()+5*60_000).toISOString();
  await db().prepare(`INSERT INTO auth_password_challenges(id,email,purpose,nonce,expires_at,used_at) VALUES(?,?,?,?,?,NULL)`).bind(id,email,purposeInput,nonce,expires).run();
  return{challengeId:id,nonce,salt:user?.salt||fakeSalt,iterations:user?.password_iterations||PASSWORD_ITERATIONS,expiresAt:expires};
}

export type ClientPasswordCredentials={salt:unknown;passwordVerifier:unknown;passwordIterations:unknown};
async function sealVerifier(salt:string,verifier:string,iterations:number){
  const iv=random(12),key=await pepperKey(),aad=encoder.encode(`sift-password-v1:${salt}:${iterations}`),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,hexBytes(verifier.toLowerCase())));
  return{salt,passwordHash:`enc:v1:${toBase64Url(new Uint8Array([...iv,...cipher]))}`,passwordIterations:iterations};
}

export async function storePasswordCredentials(credentials:ClientPasswordCredentials){
  if(typeof credentials.salt!=='string'||!/^[A-Za-z0-9_-]{24,64}$/.test(credentials.salt)||typeof credentials.passwordVerifier!=='string'||!/^[a-f\d]{64}$/i.test(credentials.passwordVerifier)||credentials.passwordIterations!==PASSWORD_ITERATIONS)throw new Error('Некоректні дані захисту пароля. Оновіть сторінку й спробуйте ще раз.');
  return sealVerifier(credentials.salt,credentials.passwordVerifier,PASSWORD_ITERATIONS);
}

async function decryptVerifier(row:{password_hash:string;salt:string;password_iterations:number}){
  if(!row.password_hash.startsWith('enc:v1:'))return row.password_hash;
  const encrypted=fromBase64Url(row.password_hash.slice(7)),iv=encrypted.slice(0,12),cipher=encrypted.slice(12),key=await pepperKey();
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode(`sift-password-v1:${row.salt}:${row.password_iterations}`)},key,cipher);
  return hex(new Uint8Array(plain));
}

export async function verifyPasswordProof(emailInput:unknown,purposeInput:unknown,challengeIdInput:unknown,proofInput:unknown,upgradeInput?:ClientPasswordCredentials,upgradeProofInput?:unknown){
  await ensureChallengeSchema();
  if(typeof emailInput!=='string'||typeof purposeInput!=='string'||typeof challengeIdInput!=='string'||typeof proofInput!=='string'||!/^[a-f\d]{64}$/i.test(proofInput))throw new Error('Неправильний email або пароль.');
  const email=emailInput.trim().toLowerCase(),purpose=purposeInput;
  const challenge=await db().prepare(`SELECT id,email,purpose,nonce,expires_at,used_at FROM auth_password_challenges WHERE id=?`).bind(challengeIdInput).first<PasswordChallenge>();
  const now=new Date(),nowIso=now.toISOString();
  if(!challenge||challenge.email!==email||challenge.purpose!==purpose||challenge.used_at||Date.parse(challenge.expires_at)<=now.getTime())throw new Error('Неправильний email або пароль.');
  const consumed=await db().prepare(`UPDATE auth_password_challenges SET used_at=? WHERE id=? AND email=? AND purpose=? AND used_at IS NULL AND expires_at>?`).bind(nowIso,challenge.id,email,purpose,nowIso).run();
  if((consumed.meta?.changes||0)!==1)throw new Error('Неправильний email або пароль.');
  const user=await db().prepare(`SELECT id,email,password_hash,salt,password_iterations FROM users WHERE email=?`).bind(email).first<{id:string;email:string;password_hash:string;salt:string;password_iterations:number}>();
  let verifier='';
  try{verifier=user?await decryptVerifier(user):hex(await pepperMac(`fake-verifier:${email}`));}catch{verifier=hex(await pepperMac(`invalid-verifier:${email}`));}
  const key=await crypto.subtle.importKey('raw',hexBytes(verifier),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const expected=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(proofMessage(email,purpose,challenge.id,challenge.nonce))));
  const matches=safeEqual(expected,hexBytes(proofInput));
  if(!user||!matches)throw new Error('Неправильний email або пароль.');
  let passwordHash=user.password_hash,salt=user.salt,passwordIterations=user.password_iterations;
  if(upgradeInput){
    if(user.password_iterations>=PASSWORD_ITERATIONS||typeof upgradeProofInput!=='string'||!/^[a-f\d]{64}$/i.test(upgradeProofInput))throw new Error('Неправильний email або пароль.');
    const upgraded=await storePasswordCredentials(upgradeInput),upgradeMessage=`sift-password-upgrade-v1|${email}|${challenge.id}|${challenge.nonce}|${upgradeInput.salt}|${upgradeInput.passwordVerifier}`;
    const upgradeExpected=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(upgradeMessage)));
    if(!safeEqual(upgradeExpected,hexBytes(upgradeProofInput)))throw new Error('Неправильний email або пароль.');
    passwordHash=upgraded.passwordHash;salt=upgraded.salt;passwordIterations=upgraded.passwordIterations;await db().prepare(`UPDATE users SET password_hash=?,salt=?,password_iterations=? WHERE id=? AND password_iterations<?`).bind(passwordHash,salt,passwordIterations,user.id,PASSWORD_ITERATIONS).run();
  }else if(user.password_iterations<PASSWORD_ITERATIONS)throw new Error('Потрібно оновити захист пароля. Оновіть сторінку й повторіть вхід.');
  else if(!user.password_hash.startsWith('enc:v1:')){const sealed=await sealVerifier(user.salt,verifier,user.password_iterations);passwordHash=sealed.passwordHash;await db().prepare(`UPDATE users SET password_hash=? WHERE id=? AND password_hash=?`).bind(passwordHash,user.id,user.password_hash).run();}
  return{id:user.id,email:user.email,passwordHash,salt,passwordIterations};
}

export async function verifyPasswordProofForEmail(email:string,purpose:PasswordPurpose,challengeId:unknown,proof:unknown,upgrade?:ClientPasswordCredentials,upgradeProof?:unknown){
  const verified=await verifyPasswordProof(email,purpose,challengeId,proof,upgrade,upgradeProof);
  return{id:verified.id,email:verified.email};
}

export function passwordProofMessage(email:string,purpose:PasswordPurpose,challengeId:string,nonce:string){return proofMessage(email,purpose,challengeId,nonce);}
