import {env} from 'cloudflare:workers';
import {ensureEmailVerificationDb} from './email-verification';
import {signupAcceptanceStatement} from './legal-acceptance';
import {signupLegalConsent,type SignupLegalConsent} from './legal-consent-policy.js';
import {storePasswordCredentials,type ClientPasswordCredentials} from './password-protocol';

const enc=new TextEncoder();
const hex=(b:ArrayBuffer|Uint8Array)=>Array.from(b instanceof Uint8Array?b:new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
const random=(n=32)=>{const b=new Uint8Array(n);crypto.getRandomValues(b);return btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')};
async function digest(value:string){return hex(await crypto.subtle.digest('SHA-256',enc.encode(value)))}

export type AuthUser={id:string;email:string;emailVerified:boolean;emailVerifiedAt:string|null};
export async function createUser(email:string,passwordCredentials:ClientPasswordCredentials,consent:SignupLegalConsent){
  await ensureEmailVerificationDb();
  if(typeof email!=='string')throw new Error('Вкажіть email і пароль');
  if(!signupLegalConsent(consent))throw new Error('Потрібно прийняти Умови користування та підтвердити ознайомлення з Політикою приватності.');
  const normalized=email.trim().toLowerCase();
  if(normalized.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))throw new Error('Введіть коректний email');
  const exists=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(normalized).first();
  if(exists)throw new Error('Акаунт із таким email уже існує');
  const credentials=await storePasswordCredentials(passwordCredentials);
  const id=crypto.randomUUID();
  const createdAt=new Date().toISOString();
  try{await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id,email,password_hash,salt,created_at,password_iterations) VALUES (?,?,?,?,?,?)').bind(id,normalized,credentials.passwordHash,credentials.salt,createdAt,credentials.passwordIterations),
    signupAcceptanceStatement(id,consent,createdAt)
  ])}
  catch{throw new Error('Не вдалося створити акаунт. Перевірте, чи цей email ще не зареєстрований.')}
  return{id,email:normalized,emailVerified:false,emailVerifiedAt:null} satisfies AuthUser;
}

export async function newSession(userId:string){const token=random(),hash=await digest(token),expires=new Date(Date.now()+30*864e5).toISOString();await env.DB.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').bind(hash,userId,expires,new Date().toISOString()).run();return{token,expires}}
export function sessionCookie(token:string,maxAge=2592000){return `sift_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`}
function cookie(req:Request,name:string){return req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)}
export async function currentUser(req:Request):Promise<AuthUser|null>{const token=cookie(req,'sift_session');if(!token)return null;const hash=await digest(token),row=await env.DB.prepare('SELECT users.id,users.email,email_verification_status.verified_at AS email_verified_at FROM sessions JOIN users ON users.id=sessions.user_id LEFT JOIN email_verification_status ON email_verification_status.user_id=users.id WHERE sessions.token_hash=? AND sessions.expires_at>?').bind(hash,new Date().toISOString()).first<{id:string;email:string;email_verified_at:string|null}>();return row?{id:row.id,email:row.email,emailVerified:!!row.email_verified_at,emailVerifiedAt:row.email_verified_at}:null}
export async function endSession(req:Request){const token=cookie(req,'sift_session');if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run()}
