export const PASSWORD_ITERATIONS=310000;
const encoder=new TextEncoder();
const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const hex=(bytes:Uint8Array)=>Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');

export async function createPasswordCredentials(password:string){
  if(password.length<8||password.length>1024)throw new Error('Пароль має містити від 8 до 1024 символів.');
  const saltBytes=crypto.getRandomValues(new Uint8Array(24)),salt=base64url(saltBytes),material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:PASSWORD_ITERATIONS},material,256);
  return{salt,passwordVerifier:hex(new Uint8Array(bits)),passwordIterations:PASSWORD_ITERATIONS};
}

export async function createPasswordProof(emailInput:string,password:string,purpose:'login'|'change'|'delete'){
  const email=emailInput.trim().toLowerCase(),response=await fetch('/api/auth/password/challenge',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify({email,purpose})});
  const challenge=await response.json() as {challengeId?:string;nonce?:string;salt?:string;iterations?:number;error?:string};
  if(!response.ok||!challenge.challengeId||!challenge.nonce||!challenge.salt||!challenge.iterations)throw new Error(challenge.error||'Не вдалося підготувати захищений вхід. Спробуйте ще раз.');
  const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(challenge.salt),iterations:challenge.iterations},material,256),verifier=new Uint8Array(bits);
  const hmacKey=await crypto.subtle.importKey('raw',verifier,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const message=`sift-password-v1|${purpose}|${email}|${challenge.challengeId}|${challenge.nonce}`;
  const proof=hex(new Uint8Array(await crypto.subtle.sign('HMAC',hmacKey,encoder.encode(message))));
  let upgrade:Awaited<ReturnType<typeof createPasswordCredentials>>|undefined,upgradeProof:string|undefined;
  if(challenge.iterations<PASSWORD_ITERATIONS){
    upgrade=await createPasswordCredentials(password);
    const upgradeMessage=`sift-password-upgrade-v1|${email}|${challenge.challengeId}|${challenge.nonce}|${upgrade.salt}|${upgrade.passwordVerifier}`;
    upgradeProof=hex(new Uint8Array(await crypto.subtle.sign('HMAC',hmacKey,encoder.encode(upgradeMessage))));
  }
  return{email,challengeId:challenge.challengeId,proof,upgrade,upgradeProof};
}
