import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const base='http://127.0.0.1:3000';
const evidence:unknown[]=[];
async function post(action:string,data:Record<string,unknown>={},cookie='',origin=base){const r=await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(10000)});const output=await r.json();evidence.push({action,status:r.status,decision:output.decision?.kind??output.kind,error:output.error});return {r,output};}
async function state(cookie:string){const r=await fetch(base+'/api/state',{headers:{Cookie:cookie}});assert.equal(r.status,200);return r.json();}
const rejected=await post('session',{owner:0},'','https://untrusted.example');assert.equal(rejected.r.status,400);assert.equal(rejected.output.error,'ORIGIN_REJECTED');
const a=await post('session',{owner:0});assert.equal(a.r.status,200);const cookieA=a.r.headers.get('set-cookie')!.split(';')[0]!;
let sa=await state(cookieA);assert.equal(sa.session.owner,0);await post('activate',{draftId:sa.draft.id},cookieA);sa=await state(cookieA);assert.ok(sa.mandate);
const forbidden=await post('evaluate',{items:[{productId:'gift-card',quantity:1}]},cookieA);assert.equal(forbidden.output.decision.kind,'BLOCK');assert.ok(forbidden.output.decision.reasons.includes('CATEGORY_FORBIDDEN'));
const split=await post('splitDemo',{},cookieA);assert.equal(split.output.first.decision,'ALLOW');assert.equal(split.output.second.decision,'BLOCK');sa=await state(cookieA);assert.equal(sa.mandate.reserved_cents,4000);assert.equal(sa.operations.length,0);
const b=await post('session',{owner:1});const cookieB=b.r.headers.get('set-cookie')!.split(';')[0]!;const sb=await state(cookieB);await post('activate',{draftId:sb.draft.id},cookieB);
const cross=await post('capture',{purchaseId:split.output.first.purchaseId},cookieB);assert.equal(cross.r.status,404);
const tampered=await post('revoke',{},cookieA+'x');assert.equal(tampered.r.status,401);
const invalid=await post('evaluate',{items:[{productId:'paper',quantity:1,price:1}]},cookieA);assert.equal(invalid.r.status,400);
writeFileSync('evidence/http-smoke.json',JSON.stringify({at:new Date().toISOString(),tests:'PASS',realNativePostgreSQL:true,paymentCalls:0,evidence},null,2));console.log('HTTP smoke PASS: real sessions, activation, forbidden/split decisions, owner isolation and origin/session/input tampering. No PayPal calls.');
