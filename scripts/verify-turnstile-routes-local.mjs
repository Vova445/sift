const baseUrl=process.argv[2]||'http://127.0.0.1:8788';
if(!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(baseUrl))throw new Error('This verification script only targets localhost.');
const stamp=Date.now(),email=`turnstile-test-${stamp}@example.invalid`;
const cases=[
  {path:'/api/auth/signup',body:{email,password:'Turnstile-Test-123!'}},
  {path:'/api/auth/password/forgot',body:{email}},
  {path:'/api/auth/password/reset',body:{token:'invalid-test-token',password:'Turnstile-Test-123!'}},
];
let workerRestartRetries=0;
for(const [index,item] of cases.entries()){
  const testIp=`198.51.100.${1+((stamp+index)%253)}`;
  let response,body,attempt=0;
  do{
    response=await fetch(`${baseUrl}${item.path}`,{method:'POST',headers:{'content-type':'application/json','connection':'close','cf-connecting-ip':testIp},body:JSON.stringify(item.body)});
    body=await response.text();
    if(response.status===503&&body.includes('Your worker restarted mid-request')&&attempt<5){attempt++;workerRestartRetries++;await new Promise(resolve=>setTimeout(resolve,100));continue}
    break;
  }while(true);
  if(response.status!==403||!body.includes('антибот'))throw new Error(`${item.path} should reject a missing Turnstile token with 403; got ${response.status}: ${body}`);
}
console.log(JSON.stringify({routes:cases.map(item=>item.path),missingTokenRejected:true,workerRestartRetries,passed:true},null,2));
