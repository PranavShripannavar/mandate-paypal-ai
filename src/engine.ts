import { randomUUID, createHash } from 'node:crypto';
import type { DB, TX } from './db';
import { transaction } from './db';
import { canonicalBasket, decide, DomainError, PolicySchema, type Basket, type Policy, type Product } from './policy';

export type Kind='CREATE'|'AUTHORIZE'|'CAPTURE'|'VOID';
export type Snapshot={orderId:string;merchantId:string;currency:string;totalCents:number;buyerApproved:boolean;authorizationId?:string;authorizationStatus?:'CREATED'|'VOIDED'|'EXPIRED'|'CAPTURED';captureId?:string;captureStatus?:'COMPLETED'|'PENDING'|'DECLINED'};
export type Purchase={id:string;owner_id:string;mandate_id:string;version:number;logical_key:string;basket:Basket;basket_hash:string;total_cents:number;currency:string;merchant_id:string;state:string;approval_id:string;approval_expires:Date;approval_consumed:boolean;disabled_at:Date|null;disable_reason:string|null;reservation:'HELD'|'SPENT'|'RELEASED';order_id:string|null;authorization_id:string|null;capture_id:string|null};
export interface Gateway {
  /** Implementations must return authoritative order/payment reads, not browser callback facts. */
  perform(kind:Kind,purchase:Purchase,requestId:string):Promise<Snapshot>;
  read(purchase:Purchase):Promise<Snapshot>;
}
export class RemoteError extends Error {constructor(public code:string,public definitive=false,public orderId?:string){super(code);}}
type Mandate={id:string;owner_id:string;current_version:number;revoked_at:Date|null;reserved_cents:number;spent_cents:number};
const fail=(code:string):never=>{throw new DomainError(code);};
export class Engine {
  constructor(readonly db:DB,readonly gateway:Gateway,private actor:'owner'|'system'='owner'){}
  private async audit(c:TX,owner:string,mandate:string,event:string,details:unknown,purchase?:string){
    await c.query('INSERT INTO audit(owner_id,mandate_id,purchase_id,actor,event,details) VALUES($1,$2,$3,$4,$5,$6)',[owner,mandate,purchase??null,this.actor==='system'?'system':owner,event,JSON.stringify(details)]);
  }
  private async mandate(c:TX,owner:string,id:string):Promise<Mandate>{
    const r=await c.query('SELECT * FROM mandates WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,owner]);return r.rows[0]??fail('NOT_FOUND');
  }
  private async locked(c:TX,owner:string,id:string){
    const found=await c.query('SELECT mandate_id FROM purchases WHERE id=$1 AND owner_id=$2',[id,owner]);
    if(!found.rowCount) fail('NOT_FOUND');
    const m=await this.mandate(c,owner,found.rows[0].mandate_id);
    const row=await c.query('SELECT * FROM purchases WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,owner]);
    return {m,p:row.rows[0] as Purchase};
  }
  private async now(c:TX):Promise<Date>{return (await c.query('SELECT clock_timestamp() AS now')).rows[0].now;}
  private async policy(c:TX,m:Mandate):Promise<Policy>{return PolicySchema.parse((await c.query('SELECT body FROM policies WHERE mandate_id=$1 AND version=$2',[m.id,m.current_version])).rows[0]?.body);}
  private async basket(c:TX,input:unknown){const products=(await c.query('SELECT * FROM products')).rows as Product[];return canonicalBasket(input,products);}
  async createMandate(owner:string,policy:unknown){
    const body=PolicySchema.parse(policy);const id=randomUUID();
    await transaction(this.db,async c=>{await c.query('INSERT INTO mandates(id,owner_id) VALUES($1,$2)',[id,owner]);await c.query('INSERT INTO policies(mandate_id,version,body) VALUES($1,1,$2)',[id,JSON.stringify(body)]);await this.audit(c,owner,id,'POLICY_ACTIVATED',{version:1});});return id;
  }
  async replacePolicy(owner:string,id:string,input:unknown){
    const body=PolicySchema.parse(input);
    return transaction(this.db,async c=>{
      const m=await this.mandate(c,owner,id);if(m.revoked_at)fail('REVOKED');
      const prior=await this.policy(c,m);
      if(body.periodStart!==prior.periodStart||body.periodEnd!==prior.periodEnd)fail('NEW_PERIOD_REQUIRES_NEW_MANDATE');
      const version=m.current_version+1;
      await c.query('INSERT INTO policies(mandate_id,version,body) VALUES($1,$2,$3)',[id,version,JSON.stringify(body)]);
      await c.query('UPDATE mandates SET current_version=$2 WHERE id=$1',[id,version]);
      await c.query("UPDATE purchases SET disabled_at=COALESCE(disabled_at,clock_timestamp()),disable_reason='POLICY_REPLACED' WHERE mandate_id=$1 AND reservation='HELD'",[id]);
      await this.audit(c,owner,id,'POLICY_REPLACED',{version});return version;
    });
  }
  async reserve(owner:string,mandateId:string,key:string,input:unknown,reviewed=false){
    if(typeof key!=='string'||key.length<1||key.length>100)fail('INVALID_LOGICAL_KEY');
    return transaction(this.db,async c=>{
      const m=await this.mandate(c,owner,mandateId);const basket=await this.basket(c,input);
      const existing=(await c.query('SELECT * FROM purchases WHERE owner_id=$1 AND logical_key=$2',[owner,key])).rows[0] as Purchase|undefined;
      if(existing){if(existing.mandate_id!==mandateId||existing.basket_hash!==basket.hash)fail('IDEMPOTENCY_CONFLICT');await this.audit(c,owner,m.id,'IDEMPOTENT_RESERVATION_REPLAY',{key},existing.id);return {kind:'EXISTING',purchase:existing,reasons:[]};}
      const policy=await this.policy(c,m);const now=await this.now(c);
      const result=decide(policy,basket,{now,spent:m.spent_cents,reserved:m.reserved_cents,revoked:!!m.revoked_at});
      await this.audit(c,owner,m.id,'POLICY_DECISION',{...result,basketHash:basket.hash,totalCents:basket.totalCents,version:m.current_version});
      if(result.kind==='BLOCK'||(result.kind==='REVIEW'&&!reviewed))return {...result,purchase:undefined};
      const expires=new Date(Math.min(+now+600_000,Date.parse(policy.expiresAt),Date.parse(policy.periodEnd)));
      const id=randomUUID();
      const row=await c.query(`INSERT INTO purchases(id,owner_id,mandate_id,version,logical_key,basket,basket_hash,total_cents,currency,merchant_id,state,approval_id,approval_expires,reservation)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'USD',$9,'APPROVED',$10,$11,'HELD') RETURNING *`,[id,owner,m.id,m.current_version,key,JSON.stringify(basket),basket.hash,basket.totalCents,basket.merchantId,randomUUID(),expires]);
      await c.query('UPDATE mandates SET reserved_cents=reserved_cents+$2 WHERE id=$1',[m.id,basket.totalCents]);
      await c.query("INSERT INTO ledger(purchase_id,mandate_id,kind,cents) VALUES($1,$2,'RESERVE',$3)",[id,m.id,basket.totalCents]);
      if(reviewed)await this.audit(c,owner,m.id,'EXTRA_REVIEW_APPROVED',{version:m.current_version,basketHash:basket.hash},id);
      await this.audit(c,owner,m.id,'APPLICATION_APPROVAL',{approvalId:row.rows[0].approval_id,expires,basketHash:basket.hash,totalCents:basket.totalCents},id);
      return {kind:'ALLOW',purchase:row.rows[0] as Purchase,reasons:[]};
    });
  }
  async get(owner:string,id:string){const r=await this.db.query('SELECT * FROM purchases WHERE id=$1 AND owner_id=$2',[id,owner]);return r.rows[0] as Purchase??fail('NOT_FOUND');}
  async budget(owner:string,id:string){return transaction(this.db,async c=>{const m=await this.mandate(c,owner,id);const p=await this.policy(c,m);return {spent:m.spent_cents,reserved:m.reserved_cents,available:Math.max(0,p.budgetCents-m.spent_cents-m.reserved_cents)};});}
  private async validate(c:TX,m:Mandate,p:Purchase){
    const now=await this.now(c);
    if(p.disabled_at)fail(p.disable_reason??'DISABLED');
    if(+now>=+p.approval_expires)fail('APPROVAL_EXPIRED');
    if(p.version!==m.current_version)fail('POLICY_REPLACED');
    if(p.reservation!=='HELD')fail('RESERVATION_NOT_HELD');
    const current=await this.basket(c,p.basket.items.map(x=>({productId:x.productId,quantity:x.quantity})));
    if(current.hash!==p.basket_hash)fail('BASKET_CHANGED');
    const policy=await this.policy(c,m);
    const decision=decide(policy,current,{now,spent:m.spent_cents,reserved:m.reserved_cents-p.total_cents,revoked:!!m.revoked_at});
    if(decision.kind==='BLOCK')fail(decision.reasons[0]!);
  }
  /** Persist a claim in a short DB transaction. NEVER hold this transaction across remote I/O. */
  private async claim(owner:string,id:string,kind:Kind){
    return transaction(this.db,async c=>{
      const {m,p}=await this.locked(c,owner,id);
      const prior=(await c.query('SELECT * FROM operations WHERE purchase_id=$1 AND kind=$2',[id,kind])).rows[0];
      if(prior){await this.audit(c,owner,m.id,'IDEMPOTENT_PAYMENT_REPLAY',{kind,requestId:prior.request_id},id);return {existing:true,p,requestId:prior.request_id as string};}
      if((await c.query("SELECT 1 FROM operations WHERE purchase_id=$1 AND outcome IN ('RUNNING','UNKNOWN')",[id])).rowCount)fail('OPERATION_UNRESOLVED');
      if(kind!=='VOID')await this.validate(c,m,p);
      else if(!p.authorization_id||p.capture_id||p.reservation!=='HELD')fail('NOT_VOIDABLE');
      const states:Record<Kind,string[]>={CREATE:['APPROVED'],AUTHORIZE:['BUYER_APPROVED'],CAPTURE:['AUTHORIZED'],VOID:['AUTHORIZED','RECONCILING']};
      if(!states[kind].includes(p.state))fail('INVALID_STATE');
      if(kind==='CREATE'&&p.approval_consumed)fail('APPROVAL_USED');
      const requestId=randomUUID();
      const payloadHash=createHash('sha256').update(JSON.stringify({kind,approval:p.approval_id,hash:p.basket_hash,total:p.total_cents,order:p.order_id,auth:p.authorization_id})).digest('hex');
      await c.query("INSERT INTO operations(id,purchase_id,kind,request_id,payload_hash,outcome,lease_until) VALUES($1,$2,$3,$4,$5,'RUNNING',clock_timestamp()+interval '45 seconds')",[randomUUID(),id,kind,requestId,payloadHash]);
      if(kind==='CREATE')await c.query('UPDATE purchases SET approval_consumed=true WHERE id=$1',[id]);
      await this.audit(c,owner,m.id,'PAYMENT_ATTEMPT',{kind,requestId,payloadHash},id);
      return {existing:false,p,requestId};
    });
  }
  async execute(owner:string,id:string,kind:Kind){
    const claim=await this.claim(owner,id,kind);
    if(claim.existing)return this.get(owner,id);
    let result:Snapshot;
    try{result=await this.gateway.perform(kind,claim.p,claim.requestId);}
    catch(e){
      await transaction(this.db,async c=>{
        const {m,p}=await this.locked(c,owner,id);
        const code=e instanceof RemoteError?e.code:'REMOTE_UNKNOWN';
        const definitive=e instanceof RemoteError&&e.definitive;
        if(e instanceof RemoteError&&e.orderId&&(!p.order_id||p.order_id===e.orderId))await c.query('UPDATE purchases SET order_id=$2 WHERE id=$1',[id,e.orderId]);
        await c.query("UPDATE operations SET outcome=$3,error_code=$4,finished_at=clock_timestamp() WHERE purchase_id=$1 AND request_id=$2",[id,claim.requestId,definitive?'REJECTED':'UNKNOWN',code]);
        await c.query("UPDATE purchases SET state='RECONCILING',last_error=$2 WHERE id=$1",[id,code]);
        await this.audit(c,owner,m.id,'PAYMENT_UNRESOLVED',{kind,code,definitive},id);
      });return this.get(owner,id);
    }
    await this.finish(owner,id,kind,claim.requestId,result);
    return this.get(owner,id);
  }
  private verify(p:Purchase,s:Snapshot){
    if(s.totalCents!==p.total_cents||s.currency!==p.currency||s.merchantId!==p.merchant_id||!s.orderId||(p.order_id&&s.orderId!==p.order_id)||(p.authorization_id&&s.authorizationId!==p.authorization_id)||(p.capture_id&&s.captureId!==p.capture_id))fail('REMOTE_DATA_MISMATCH');
    if(s.captureStatus&&!s.captureId)fail('REMOTE_DATA_MISMATCH');
  }
  private async release(c:TX,m:Mandate,p:Purchase,reason:string,state='RELEASED'){
    if(p.reservation!=='HELD')return;
    await c.query("UPDATE purchases SET reservation='RELEASED',state=$2,disabled_at=COALESCE(disabled_at,clock_timestamp()),disable_reason=COALESCE(disable_reason,$3) WHERE id=$1",[p.id,state,reason]);
    await c.query('UPDATE mandates SET reserved_cents=reserved_cents-$2 WHERE id=$1',[m.id,p.total_cents]);
    await c.query("INSERT INTO ledger(purchase_id,mandate_id,kind,cents) VALUES($1,$2,'RELEASE',$3)",[p.id,m.id,p.total_cents]);
    await this.audit(c,p.owner_id,m.id,'RESERVATION_RELEASED',{reason,totalCents:p.total_cents},p.id);
  }
  private async applySnapshot(c:TX,m:Mandate,p:Purchase,s:Snapshot){
    this.verify(p,s);
    if(p.reservation==='SPENT')return; // A stale event/read never regresses a confirmed capture.
    if(p.reservation==='RELEASED')fail('TERMINAL_RESERVATION');
    await c.query('UPDATE purchases SET order_id=$2,authorization_id=COALESCE($3,authorization_id),capture_id=COALESCE($4,capture_id) WHERE id=$1',[p.id,s.orderId,s.authorizationId??null,s.captureId??null]);
    if(s.captureStatus==='COMPLETED'){
      await c.query("UPDATE purchases SET reservation='SPENT',state='CAPTURED' WHERE id=$1",[p.id]);
      await c.query('UPDATE mandates SET reserved_cents=reserved_cents-$2,spent_cents=spent_cents+$2 WHERE id=$1',[m.id,p.total_cents]);
      await c.query("INSERT INTO ledger(purchase_id,mandate_id,kind,cents) VALUES($1,$2,'SPEND',$3)",[p.id,m.id,p.total_cents]);
      await this.audit(c,p.owner_id,m.id,'CAPTURE_CONFIRMED',{captureId:s.captureId,totalCents:p.total_cents,revocationRace:!!m.revoked_at||!!p.disabled_at},p.id);
    } else if(s.captureStatus==='PENDING')await c.query("UPDATE purchases SET state='RECONCILING' WHERE id=$1",[p.id]);
    else if(s.authorizationStatus==='VOIDED'||s.authorizationStatus==='EXPIRED')await this.release(c,m,p,'AUTHORITATIVE_'+s.authorizationStatus,'VOIDED');
    else await c.query('UPDATE purchases SET state=$2 WHERE id=$1',[p.id,s.authorizationId?'AUTHORIZED':s.buyerApproved?'BUYER_APPROVED':'ORDER_CREATED']);
  }
  private async finish(owner:string,id:string,kind:string,key:string,s:Snapshot){
    await transaction(this.db,async c=>{
      const {m,p}=await this.locked(c,owner,id);
      const op=(await c.query('SELECT * FROM operations WHERE purchase_id=$1 AND kind=$2 AND request_id=$3',[id,kind,key])).rows[0];
      if(!op||!['RUNNING','UNKNOWN'].includes(op.outcome))return;
      try { this.verify(p,s); } catch {
        await c.query("UPDATE operations SET outcome='UNKNOWN',error_code='REMOTE_DATA_MISMATCH' WHERE request_id=$1",[key]);
        await c.query("UPDATE purchases SET state='RECONCILING',last_error='REMOTE_DATA_MISMATCH' WHERE id=$1",[id]);
        await this.audit(c,owner,m.id,'REMOTE_DATA_MISMATCH',{kind},id);return;
      }
      await c.query("UPDATE operations SET outcome='SUCCEEDED',finished_at=clock_timestamp(),remote_id=$2 WHERE request_id=$1",[key,s.captureId??s.authorizationId??s.orderId]);
      await this.applySnapshot(c,m,p,s);
      await this.audit(c,owner,m.id,'PAYMENT_RESPONSE',{kind,orderId:s.orderId,authorizationId:s.authorizationId,captureId:s.captureId,captureStatus:s.captureStatus},id);
    });
  }
  async disable(owner:string,id:string,reason:'EXPIRED'|'CANCELLED'){
    return transaction(this.db,async c=>{
      const {m,p}=await this.locked(c,owner,id);
      if(reason==='EXPIRED'&&+(await this.now(c))<+p.approval_expires)fail('NOT_EXPIRED');
      await c.query('UPDATE purchases SET disabled_at=COALESCE(disabled_at,clock_timestamp()),disable_reason=COALESCE(disable_reason,$2) WHERE id=$1',[id,reason]);
      const started=(await c.query('SELECT 1 FROM operations WHERE purchase_id=$1',[id])).rowCount;
      if(!started)await this.release(c,m,p,reason);
      await this.audit(c,owner,m.id,'APPROVAL_DISABLED',{reason,requiresReconciliation:!!started},id);
    });
  }
  async revoke(owner:string,id:string){
    await transaction(this.db,async c=>{
      const m=await this.mandate(c,owner,id);
      await c.query('UPDATE mandates SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1',[id]);
      await c.query("UPDATE purchases SET disabled_at=COALESCE(disabled_at,clock_timestamp()),disable_reason='REVOKED' WHERE mandate_id=$1 AND reservation='HELD'",[id]);
      await this.audit(c,owner,m.id,'MANDATE_REVOKED',{});
    });
    // Local terminal releases need no remote request; authorized purchases remain held for real void/reconciliation.
    const rows=await this.db.query("SELECT id FROM purchases WHERE mandate_id=$1 AND owner_id=$2 AND reservation='HELD'",[id,owner]);
    for(const r of rows.rows)await this.cleanup(owner,r.id);
  }
  async cleanup(owner:string,id:string){
    return transaction(this.db,async c=>{
      const {m,p}=await this.locked(c,owner,id);
      if(!p.disabled_at)return;
      if(!(await c.query('SELECT 1 FROM operations WHERE purchase_id=$1',[id])).rowCount)await this.release(c,m,p,p.disable_reason??'DISABLED');
    });
  }
  /** Restart recovery never replays a possibly successful money operation. */
  async recover(){
    return this.db.query("UPDATE operations SET outcome='UNKNOWN',error_code='LEASE_EXPIRED' WHERE outcome='RUNNING' AND lease_until<clock_timestamp() RETURNING purchase_id");
  }
  async reconcile(owner:string,id:string,manual=false){
    const claim=await transaction(this.db,async c=>{
      const {m,p}=await this.locked(c,owner,id);
      if(p.reservation!=='HELD')return null;
      if((await c.query("SELECT 1 FROM operations WHERE purchase_id=$1 AND outcome='RUNNING' AND lease_until>clock_timestamp()",[id])).rowCount)return null;
      await c.query("UPDATE operations SET outcome='UNKNOWN' WHERE purchase_id=$1 AND outcome='RUNNING'",[id]);
      if(!p.order_id)return null; // Lost create response cannot safely release or recreate.
      const attempts=await c.query('SELECT * FROM reconciliation_attempts WHERE purchase_id=$1 ORDER BY id DESC LIMIT 1',[id]);
      const last=attempts.rows[0];
      if(!manual&&last?.next_attempt_at&&+last.next_attempt_at>+(await this.now(c)))return null;
      const count=Number((await c.query('SELECT count(*) AS n FROM reconciliation_attempts WHERE purchase_id=$1',[id])).rows[0].n);
      if(!manual&&count>=8)return null; // Visible unresolved; explicit owner checks may read again without replaying a mutation.
      const key=randomUUID();
      await c.query(`INSERT INTO operations(id,purchase_id,kind,request_id,payload_hash,outcome,lease_until) VALUES($1,$2,'RECONCILE',$3,'read-only','RUNNING',clock_timestamp()+interval '45 seconds')
        ON CONFLICT(purchase_id,kind) DO UPDATE SET request_id=$3,outcome='RUNNING',lease_until=clock_timestamp()+interval '45 seconds'`,[randomUUID(),id,key]);
      await this.audit(c,owner,m.id,'RECONCILIATION_STARTED',{attempt:count+1},id);
      return {p,key,count};
    });
    if(!claim)return this.get(owner,id);
    try{
      const snapshot=await this.gateway.read(claim.p);
      await transaction(this.db,async c=>{
        const {m,p}=await this.locked(c,owner,id);
        const op=(await c.query("SELECT * FROM operations WHERE purchase_id=$1 AND kind='RECONCILE' AND request_id=$2 AND outcome IN ('RUNNING','UNKNOWN')",[id,claim.key])).rows[0];
        if(!op)return;
        this.verify(p,snapshot);
        const uncertain=(await c.query("SELECT kind FROM operations WHERE purchase_id=$1 AND kind<>'RECONCILE' AND outcome IN ('RUNNING','UNKNOWN')",[id])).rows.map(r=>r.kind);
        // A positive remote outcome can resolve its matching uncertainty. An empty order cannot resolve a possibly late authorization/capture.
        if(snapshot.captureStatus==='COMPLETED'||['VOIDED','EXPIRED'].includes(snapshot.authorizationStatus??''))await c.query("UPDATE operations SET outcome='RESOLVED' WHERE purchase_id=$1 AND outcome='UNKNOWN' AND kind<>'RECONCILE'",[id]);
        else if(snapshot.authorizationId)await c.query("UPDATE operations SET outcome='RESOLVED' WHERE purchase_id=$1 AND outcome='UNKNOWN' AND kind='AUTHORIZE'",[id]);
        await c.query("UPDATE operations SET outcome='SUCCEEDED',finished_at=clock_timestamp() WHERE request_id=$1",[claim.key]);
        await this.applySnapshot(c,m,p,snapshot);
        if(p.disabled_at&&!snapshot.authorizationId&&!snapshot.captureId&&uncertain.length===0)await this.release(c,m,p,'NO_REMOTE_HOLD_CONFIRMED');
        await c.query("INSERT INTO reconciliation_attempts(purchase_id,outcome,next_attempt_at) VALUES($1,'READ_CONFIRMED',clock_timestamp()+$2*interval '1 second')",[id,Math.min(300,2**claim.count)]);
        await this.audit(c,owner,m.id,'RECONCILIATION_RESULT',{captureStatus:snapshot.captureStatus,authorizationStatus:snapshot.authorizationStatus,uncertain},id);
      });
    }catch(e){
      await transaction(this.db,async c=>{
        const {m}=await this.locked(c,owner,id);
        await c.query("UPDATE operations SET outcome='UNKNOWN',error_code='RECONCILIATION_FAILED' WHERE request_id=$1",[claim.key]);
        await c.query("INSERT INTO reconciliation_attempts(purchase_id,outcome,next_attempt_at,error_code) VALUES($1,'UNRESOLVED',clock_timestamp()+$2*interval '1 second','READ_FAILED')",[id,Math.min(300,2**claim.count)]);
        await this.audit(c,owner,m.id,'RECONCILIATION_FAILED',{},id);
      });
    }
    return this.get(owner,id);
  }
}
