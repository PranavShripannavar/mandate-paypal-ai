import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import http from 'node:http';

process.loadEnvFile('.env');
const base = 'https://api-m.sandbox.paypal.com';
const required = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_MERCHANT_ID'];
for (const key of required) if (!process.env[key]?.trim()) throw new Error(`Missing ${key}`);
const command = process.argv[2];
if (command === 'serve') {
  http.createServer((req,res) => {
    res.writeHead(200, {'Content-Type':'text/plain','Cache-Control':'no-store'});
    res.end('Mandate sandbox buyer return received. This page does not prove payment success. Return to Codex for authoritative verification.');
  }).listen(Number(process.env.CALLBACK_PORT??8766),'127.0.0.1',()=>console.log('Buyer return listener started; use CALLBACK_PORT (default 8766)'));
} else {
  mkdirSync('work', {recursive:true});
  mkdirSync('evidence', {recursive:true});
  const lock = openSync('work/checkpoint1.lock','wx');
  try { await run(); } catch (e) { console.error(e.message); process.exitCode=1; }
  finally { closeSync(lock); unlinkSync('work/checkpoint1.lock'); }
}
async function run() {
  if (command === 'config') { console.log(JSON.stringify({sandbox:true, credentials:required.map(name=>({name,present:true}))})); return; }
  const path='work/checkpoint1-us-state.json';
  const appFingerprint=createHash('sha256').update(process.env.PAYPAL_CLIENT_ID).digest('hex');
  const state=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{intentId:randomUUID(),merchantId:process.env.PAYPAL_MERCHANT_ID,appFingerprint,operations:{}};
  if(state.merchantId!==process.env.PAYPAL_MERCHANT_ID||state.appFingerprint!==appFingerprint) throw new Error('Probe credentials changed; preserve and reconcile this app-bound state before proceeding');
  const save=()=>writeFileSync(path,JSON.stringify(state,null,2));
  save();
  const clean = value => {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value!=='object') return value;
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k, /email|address|payer|payment_source|name|phone|access_token|nonce/i.test(k)?'[REDACTED]':clean(v)]));
  };
  const append = event => {
    const file='evidence/checkpoint1-us.json';
    const events=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):[];
    events.push({at:new Date().toISOString(),...event});
    writeFileSync(file,JSON.stringify(events,null,2));
  };
  const tokenRes=await fetch(base+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(process.env.PAYPAL_CLIENT_ID+':'+process.env.PAYPAL_CLIENT_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(20000)});
  const token=await tokenRes.json();
  append({operation:'oauth',http:tokenRes.status,debugId:tokenRes.headers.get('paypal-debug-id'),result:tokenRes.ok?'token obtained; token excluded':clean(token)});
  if(!tokenRes.ok || !token.access_token) throw new Error(`OAuth failed HTTP ${tokenRes.status}; see redacted evidence`);
  async function api(operation,method,route,body) {
    let key;
    if(method==='POST') {
      if(state.operations[operation]) throw new Error(`${operation} already attempted; reconcile with inspect, do not blindly repeat`);
      key=randomUUID();
      state.operations[operation]={key,route,payloadHash:createHash('sha256').update(JSON.stringify(body??{})).digest('hex'),started:new Date().toISOString(),outcome:'UNKNOWN'}; save();
    }
    let response;
    try { response=await fetch(base+route,{method,headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json',Prefer:'return=representation',...(key?{'PayPal-Request-Id':key}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)}); }
    catch { append({operation,method,route,requestId:key,outcome:'UNKNOWN_NETWORK_OUTCOME'}); throw new Error('Remote outcome unknown; no automatic retry. Reconcile before further mutations.'); }
    const raw=await response.text(); let data; try {data=raw?JSON.parse(raw):{};} catch {data={unparsed:true};}
    append({operation,method,route,requestId:key,request:clean(body),http:response.status,debugId:response.headers.get('paypal-debug-id'),response:clean(data)});
    if(method==='POST') {state.operations[operation].outcome=response.ok?'CONFIRMED_RESPONSE':'ERROR_RESPONSE'; save();}
    if(!response.ok) throw new Error(`${operation} failed HTTP ${response.status}: ${data.name??'unknown'}; see evidence`);
    return data;
  }
  function verifyOrder(order) {
    const units=order.purchase_units;
    if(order.intent!=='AUTHORIZE'||units?.length!==1||units[0].amount?.value!=='1.00'||units[0].amount?.currency_code!=='USD'||units[0].payee?.merchant_id!==process.env.PAYPAL_MERCHANT_ID) throw new Error('Authoritative order amount/currency/payee/intent mismatch');
  }
  if(command==='create') {
    if(state.orderId) throw new Error('Order already exists; use inspect');
    const amount={currency_code:'USD',value:'1.00',breakdown:{item_total:{currency_code:'USD',value:'1.00'},tax_total:{currency_code:'USD',value:'0.00'},shipping:{currency_code:'USD',value:'0.00'}}};
    const callbackBase=`http://127.0.0.1:${Number(process.env.CALLBACK_PORT??8766)}`;
    const order=await api('create','POST','/v2/checkout/orders',{intent:'AUTHORIZE',purchase_units:[{reference_id:state.intentId,custom_id:state.intentId,payee:{merchant_id:process.env.PAYPAL_MERCHANT_ID},amount,items:[{name:'Mandate sandbox stationery sample',quantity:'1',unit_amount:{currency_code:'USD',value:'1.00'},category:'PHYSICAL_GOODS'}]}],payment_source:{paypal:{experience_context:{return_url:callbackBase+'/return',cancel_url:callbackBase+'/cancel',shipping_preference:'NO_SHIPPING',user_action:'PAY_NOW'}}}});
    state.orderId=order.id;state.approvalUrl=order.links?.find(x=>['payer-action','approve'].includes(x.rel))?.href;save();
    console.log(JSON.stringify({orderId:state.orderId,status:order.status,approvalUrl:state.approvalUrl}));
  } else if(['inspect','authorize','capture'].includes(command)) {
    if(!state.orderId) throw new Error('No known order; inspect evidence before attempting another create');
    const order=await api('read-order','GET','/v2/checkout/orders/'+state.orderId);verifyOrder(order);
    const auths=order.purchase_units[0].payments?.authorizations??[];
    if(auths.length===1) {state.authorizationId=auths[0].id;save();}
    if(command==='authorize') {
      if(order.status!=='APPROVED') throw new Error(`Buyer approval not confirmed: ${order.status}`);
      const authorized=await api('authorize','POST',`/v2/checkout/orders/${state.orderId}/authorize`,{});verifyOrder(authorized);
      state.authorizationId=authorized.purchase_units[0].payments?.authorizations?.[0]?.id;save();
      if(!state.authorizationId) throw new Error('Authorization ID missing; reconcile');
    }
    if(state.authorizationId) {
      const auth=await api('read-authorization','GET','/v2/payments/authorizations/'+state.authorizationId);
      if(auth.amount?.value!=='1.00'||auth.amount?.currency_code!=='USD'||auth.supplementary_data?.related_ids?.order_id!==state.orderId) throw new Error('Authorization identity/amount mismatch');
      if(command==='capture') {
        if(auth.status!=='CREATED') throw new Error(`Authorization not capturable: ${auth.status}`);
        const capture=await api('capture','POST',`/v2/payments/authorizations/${state.authorizationId}/capture`,{amount:{currency_code:'USD',value:'1.00'},final_capture:true});
        state.captureId=capture.id;save();
      }
    } else if(command==='capture') throw new Error('No confirmed authorization');
    const latest=await api('read-final-order','GET','/v2/checkout/orders/'+state.orderId);verifyOrder(latest);
    const captures=latest.purchase_units[0].payments?.captures??[];
    if(captures.length===1){state.captureId=captures[0].id;save();}
    let confirmed=false;
    if(state.captureId) {
      const capture=await api('read-capture','GET','/v2/payments/captures/'+state.captureId);
      confirmed=capture.status==='COMPLETED'&&capture.amount?.value==='1.00'&&capture.amount?.currency_code==='USD'&&capture.supplementary_data?.related_ids?.order_id===state.orderId&&captures.some(x=>x.id===capture.id&&x.status==='COMPLETED');
    }
    console.log(JSON.stringify({orderId:state.orderId,orderStatus:latest.status,authorizationId:state.authorizationId,captureId:state.captureId,confirmedCapture:confirmed}));
  } else throw new Error('Use config, serve, create, inspect, authorize, capture');
}
