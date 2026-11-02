const baseUrl=process.argv[2]||'http://127.0.0.1:8788';
if(!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(baseUrl))throw new Error('This verification script only targets localhost.');
const stamp=Date.now(),deviceId=`rate-test-${stamp}`,testIp=`198.51.100.${1+(stamp%253)}`;
const statuses=[];let workerRestartRetries=0,retryAfter=null;
for(let index=0;index<4;index++){
  let response,body,attempt=0;
  do{
    response=await fetch(`${baseUrl}/api/analyze`,{method:'POST',headers:{'content-type':'application/json','connection':'close','cf-connecting-ip':testIp},body:JSON.stringify({url:'not-a-valid-url',deviceId})});
    body=await response.text();
    if(response.status===503&&body.includes('Your worker restarted mid-request')&&attempt<5){attempt++;workerRestartRetries++;await new Promise(resolve=>setTimeout(resolve,100));continue}
    break;
  }while(true);
  statuses.push(response.status);
  if(index<3&&response.status!==400)throw new Error(`Expected an invalid-URL response before the Free limit on request ${index+1}; got ${response.status}: ${body}`);
  if(index===3){if(response.status!==429)throw new Error(`Expected the fourth Free analysis request to be limited; got ${response.status}: ${body}`);retryAfter=response.headers.get('retry-after');if(!retryAfter||!/^[1-9]\d*$/.test(retryAfter))throw new Error('The analyze 429 response did not include a positive Retry-After header.')}
  await new Promise(resolve=>setTimeout(resolve,100));
}
console.log(JSON.stringify({requests:4,statuses,retryAfter:Number(retryAfter),localWorkerRestartRetries:workerRestartRetries,passed:true},null,2));
