import { randomUUID } from 'node:crypto';
import { transaction, type DB } from './db';
import { Engine,RemoteError } from './engine';
import { PayPalGateway } from './paypal';
import { DomainError,PolicySchema, type Policy } from './policy';
import { OWNERS } from './seed';
export const defaultPolicy=():Policy=>{
  const now=new Date();const end=new Date(+now+7*86400000);
  return {currency:'USD',budgetCents:6000,maxPurchaseCents:4000,merchantIds:['demo-office'],categories:['supplies'],subscriptions:false,reviewAboveCents:3000,periodStart:now.toISOString(),periodEnd:end.toISOString(),expiresAt:end.toISOString()};
};
export async function consume(db:DB,scope:string,kind:string,limit:number){
  const r=await db.query(`INSERT INTO usage_counters(scope,kind,used) VALUES($1,$2,1)
    ON CONFLICT(scope,period,kind) DO UPDATE SET used=usage_counters.used+1 WHERE usage_counters.used<$3 RETURNING used`,[scope,kind,limit]);
  if(!r.rowCount)throw new DomainError('USAGE_LIMIT');
}
export type DemoSession={id:string;owner_id:string;mandate_id:string|null;label:string;expires_at:Date};
export function gateway(db?:DB){return new PayPalGateway({clientId:process.env.PAYPAL_CLIENT_ID??'',secret:process.env.PAYPAL_CLIENT_SECRET??'',merchantId:process.env.PAYPAL_MERCHANT_ID??'',callbackBase:(process.env.APP_URL??'http://127.0.0.1:3000')+'/paypal',record:db?async event=>{await db.query('INSERT INTO payment_evidence(purchase_id,method,path,request_id,http,debug_id,request,response) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[event.purchaseId??null,event.method,event.path,event.requestId??null,event.http,event.debugId,JSON.stringify(event.request),JSON.stringify(event.response)]);}:undefined});}
export function engine(db:DB){
  const unavailable={perform:async()=>{throw new RemoteError('PAYPAL_UNAVAILABLE',true);},read:async()=>{throw new RemoteError('PAYPAL_UNAVAILABLE',true);}};
  return new Engine(db,process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET?gateway(db):unavailable);
}
export async function startSession(db:DB,ownerIndex:number){
  const owner=OWNERS[ownerIndex===1?1:0];
  await consume(db,'global','sessions',60);await consume(db,owner,'sessions',30);
  const id=randomUUID();
  await db.query('INSERT INTO demo_sessions(id,owner_id,label) VALUES($1,$2,$3)',[id,owner,ownerIndex===1?'Atlas Workshop':'Northstar Studio']);
  return (await db.query('SELECT * FROM demo_sessions WHERE id=$1',[id])).rows[0] as DemoSession;
}
export async function activate(db:DB,session:DemoSession,draftId:string){
  // One transaction serializes duplicate activation; AI drafts never directly activate policies.
  return transaction(db,async c=>{
    const sessionRow=(await c.query('SELECT * FROM demo_sessions WHERE id=$1 AND owner_id=$2 FOR UPDATE',[session.id,session.owner_id])).rows[0];
    const draft=(await c.query('SELECT * FROM drafts WHERE id=$1 AND session_id=$2 FOR UPDATE',[draftId,session.id])).rows[0];
    if(!draft||draft.activated_at)throw new DomainError('INVALID_DRAFT');
    if(draft.ambiguity.length)throw new DomainError('RESOLVE_AMBIGUITY');
    const body=PolicySchema.parse(draft.body);
    if(sessionRow.mandate_id){
      const m=(await c.query('SELECT * FROM mandates WHERE id=$1 AND owner_id=$2 FOR UPDATE',[sessionRow.mandate_id,session.owner_id])).rows[0];
      if(m.revoked_at)throw new DomainError('FRESH_SESSION_REQUIRED');
      const version=m.current_version+1;
      const old=(await c.query('SELECT body FROM policies WHERE mandate_id=$1 AND version=$2',[m.id,m.current_version])).rows[0].body;
      if(body.periodStart!==old.periodStart||body.periodEnd!==old.periodEnd)throw new DomainError('PERIOD_CHANGE_REQUIRES_FRESH_SESSION');
      await c.query('INSERT INTO policies(mandate_id,version,body) VALUES($1,$2,$3)',[m.id,version,JSON.stringify(body)]);
      await c.query('UPDATE mandates SET current_version=$2 WHERE id=$1',[m.id,version]);
      await c.query("UPDATE purchases SET disabled_at=COALESCE(disabled_at,clock_timestamp()),disable_reason='POLICY_REPLACED' WHERE mandate_id=$1 AND reservation='HELD'",[m.id]);
    }else{
      const id=randomUUID();await c.query('INSERT INTO mandates(id,owner_id) VALUES($1,$2)',[id,session.owner_id]);
      await c.query('INSERT INTO policies(mandate_id,version,body) VALUES($1,1,$2)',[id,JSON.stringify(body)]);
      await c.query('UPDATE demo_sessions SET mandate_id=$2 WHERE id=$1',[session.id,id]);
    }
    await c.query('UPDATE drafts SET activated_at=clock_timestamp() WHERE id=$1',[draftId]);
    await c.query("INSERT INTO audit(owner_id,mandate_id,actor,event,details) SELECT owner_id,mandate_id,owner_id,'OWNER_ACTIVATED_POLICY',$2 FROM demo_sessions WHERE id=$1",[session.id,JSON.stringify({draftId,source:draft.source})]);
  });
}
