const baseUrl=process.argv[2]||'http://127.0.0.1:8788';
if(!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(baseUrl))throw new Error('This verification script only targets localhost.');
const email=`rate-test-${Date.now()}@example.invalid`;
const testIp=`198.51.100.${1+(Date.now()%253)}`;
let blocked=0,captchaRejected=0,firstRetryAfter=null,workerRestartRetries=0;
for(let index=0;index<100;index++){
  let response,body,attempt=0;
  do{
    response=await fetch(`${baseUrl}/api/auth/signup`,{method:'POST',headers:{'content-type':'application/json','connection':'close','cf-connecting-ip':testIp},body:JSON.stringify({email,password:'RateTest-Password-123!'})});
    body=await response.text();
    if(response.status===503&&body.includes('Your worker restarted mid-request')&&attempt<5){attempt++;workerRestartRetries++;await new Promise(resolve=>setTimeout(resolve,100));continue}
    break;
  }while(true);
  if(response.status===429){blocked+=1;const retryAfter=response.headers.get('retry-after');if(!retryAfter||!/^\d+$/.test(retryAfter))throw new Error('A 429 response did not include Retry-After.');firstRetryAfter??=Number(retryAfter)}
  else if(response.status===403&&body.includes('антибот'))captchaRejected++;
  else throw new Error(`Unexpected response ${response.status} on attempt ${index+1}: ${body}`);
  await new Promise(resolve=>setTimeout(resolve,100));
}
if(blocked<95||captchaRejected!==5)throw new Error(`Expected five CAPTCHA rejections and at least 95 rate-limit responses; got ${captchaRejected} and ${blocked}.`);
console.log(JSON.stringify({requests:100,captchaRejected,limited:blocked,retryAfter:firstRetryAfter,localWorkerRestartRetries:workerRestartRetries,passed:true},null,2));
