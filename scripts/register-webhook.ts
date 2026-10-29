import {readFileSync,writeFileSync,existsSync} from 'node:fs';
process.loadEnvFile('.env');
const url=new URL(process.argv[2]??'');if(url.protocol!=='https:'||url.pathname!=='/api/paypal/webhook')throw new Error('Public HTTPS webhook URL required');
const base='https://api-m.sandbox.paypal.com';
const tokenResponse=await fetch(base+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(process.env.PAYPAL_CLIENT_ID+':'+process.env.PAYPAL_CLIENT_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(15000)});
const token=await tokenResponse.json();if(!tokenResponse.ok||!token.access_token)throw new Error('Sandbox OAuth unavailable');
const headers={Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'};
const listResponse=await fetch(base+'/v1/notifications/webhooks',{headers,signal:AbortSignal.timeout(20000)});
if(!listResponse.ok)throw new Error(`List webhooks failed ${listResponse.status}`);
const list=await listResponse.json();let webhook=list.webhooks?.find((w:{url:string})=>w.url===url.href);let http=200;let debugId=listResponse.headers.get('paypal-debug-id');
if(!webhook){
 const request={url:url.href,event_types:['CHECKOUT.ORDER.APPROVED','PAYMENT.AUTHORIZATION.CREATED','PAYMENT.AUTHORIZATION.VOIDED','PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.PENDING','PAYMENT.CAPTURE.DENIED'].map(name=>({name}))};
 const response=await fetch(base+'/v1/notifications/webhooks',{method:'POST',headers,body:JSON.stringify(request),signal:AbortSignal.timeout(20000)});
 http=response.status;debugId=response.headers.get('paypal-debug-id');webhook=await response.json();
 if(!response.ok)throw new Error(`Webhook registration failed ${response.status}: ${webhook.name??'unknown'}`);
}
if(typeof webhook.id!=='string')throw new Error('Webhook ID missing');
const env=readFileSync('.env','utf8');const line='PAYPAL_WEBHOOK_ID='+webhook.id;
writeFileSync('.env',/^PAYPAL_WEBHOOK_ID=.*$/m.test(env)?env.replace(/^PAYPAL_WEBHOOK_ID=.*$/m,line):env.trimEnd()+'\n'+line+'\n');
const evidence={at:new Date().toISOString(),environment:'sandbox',id:webhook.id,url:webhook.url,event_types:webhook.event_types,http,debugId,verifiedTransactionSignatures:false};
if(existsSync('evidence/webhook-registration.json')){
 const previous=JSON.parse(readFileSync('evidence/webhook-registration.json','utf8'));
 if(previous.id!==webhook.id)writeFileSync(`evidence/webhook-registration-${previous.id}.json`,JSON.stringify(previous,null,2));
}
writeFileSync(`evidence/webhook-registration-${webhook.id}.json`,JSON.stringify(evidence,null,2));
writeFileSync('evidence/webhook-registration.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
