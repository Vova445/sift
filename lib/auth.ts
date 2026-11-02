import {env} from 'cloudflare:workers';
import {ensureEmailVerificationDb} from './email-verification';
import {signupAcceptanceStatement} from './legal-acceptance';
import {signupLegalConsent,type SignupLegalConsent} from './legal-consent-policy.js';

const enc=new TextEncoder();
const hex=(b:ArrayBuffer)=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const PASSWORD_ITERATIONS=310000;
const random=(n=32)=>{const b=new Uint8Array(n);crypto.getRandomValues(b);return btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')};
async function digest(value:string){return hex(await crypto.subtle.digest('SHA-256',enc.encode(value)))}
async function passwordHash(password:string,salt:string,iterations=PASSWORD_ITERATIONS){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations,hash:'SHA-256'},key,256))}

export type AuthUser={id:string;email:string;emailVerified:boolean;emailVerifiedAt:string|null};
export async function newPasswordCredentials(password:string){if(typeof password!=='string'||password.length<8||password.length>1024)throw new Error('Пароль має містити від 8 до 1024 символів');const salt=random(18);return{salt,passwordHash:await passwordHash(password,salt),passwordIterations:PASSWORD_ITERATIONS}}

export async function createUser(email:string,password:string,consent:SignupLegalConsent){
  await ensureEmailVerificationDb();
  if(typeof email!=='string'||typeof password!=='string')throw new Error('Вкажіть email і пароль');
  if(!signupLegalConsent(consent))throw new Error('Потрібно прийняти Умови користування та підтвердити ознайомлення з Політикою приватності.');
  const normalized=email.trim().toLowerCase();
  if(normalized.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))throw new Error('Введіть коректний email');
  const exists=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(normalized).first();
  if(exists)throw new Error('Акаунт із таким email уже існує');
  const credentials=await newPasswordCredentials(password);
  const id=crypto.randomUUID();
  const createdAt=new Date().toISOString();
  try{await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id,email,password_hash,salt,created_at,password_iterations) VALUES (?,?,?,?,?,?)').bind(id,normalized,credentials.passwordHash,credentials.salt,createdAt,credentials.passwordIterations),
    signupAcceptanceStatement(id,consent,createdAt)
  ])}
  catch{throw new Error('Не вдалося створити акаунт. Перевірте, чи цей email ще не зареєстрований.')}
  return{id,email:normalized,emailVerified:false,emailVerifiedAt:null} satisfies AuthUser;
}

export async function verifyUser(email:string,password:string){
  await ensureEmailVerificationDb();
  if(typeof email!=='string'||typeof password!=='string'||!email.trim()||!password)throw new Error('Введіть email і пароль');
  const user=await env.DB.prepare('SELECT users.id,users.email,users.password_hash,users.salt,users.password_iterations,email_verification_status.verified_at AS email_verified_at FROM users LEFT JOIN email_verification_status ON email_verification_status.user_id=users.id WHERE users.email=?').bind(email.trim().toLowerCase()).first<{id:string;email:string;password_hash:string;salt:string;password_iterations:number;email_verified_at:string|null}>();
  if(!user||await passwordHash(password,user.salt,user.password_iterations)!==user.password_hash)throw new Error('Неправильний email або пароль');
  if(user.password_iterations<PASSWORD_ITERATIONS){const salt=random(18),hash=await passwordHash(password,salt);await env.DB.prepare('UPDATE users SET password_hash=?,salt=?,password_iterations=? WHERE id=?').bind(hash,salt,PASSWORD_ITERATIONS,user.id).run()}
  return{id:user.id,email:user.email,emailVerified:!!user.email_verified_at,emailVerifiedAt:user.email_verified_at} satisfies AuthUser;
}

export async function newSession(userId:string){await ensureEmailVerificationDb();const token=random(),hash=await digest(token),expires=new Date(Date.now()+30*864e5).toISOString();await env.DB.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').bind(hash,userId,expires,new Date().toISOString()).run();return{token,expires}}
export function sessionCookie(token:string,maxAge=2592000){return `sift_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`}
function cookie(req:Request,name:string){return req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)}
export async function currentUser(req:Request):Promise<AuthUser|null>{await ensureEmailVerificationDb();const token=cookie(req,'sift_session');if(!token)return null;const hash=await digest(token),row=await env.DB.prepare('SELECT users.id,users.email,email_verification_status.verified_at AS email_verified_at FROM sessions JOIN users ON users.id=sessions.user_id LEFT JOIN email_verification_status ON email_verification_status.user_id=users.id WHERE sessions.token_hash=? AND sessions.expires_at>?').bind(hash,new Date().toISOString()).first<{id:string;email:string;email_verified_at:string|null}>();return row?{id:row.id,email:row.email,emailVerified:!!row.email_verified_at,emailVerifiedAt:row.email_verified_at}:null}
export async function endSession(req:Request){const token=cookie(req,'sift_session');if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run()}
