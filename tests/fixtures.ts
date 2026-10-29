import { randomUUID } from 'node:crypto';
import type { Policy } from '../src/policy';
import type { Gateway, Kind, Purchase, Snapshot } from '../src/engine';
import { RemoteError } from '../src/engine';
export const policy=(overrides:Partial<Policy>={}):Policy=>({currency:'USD',maxPurchaseCents:4000,budgetCents:6000,merchantIds:['demo-office'],categories:['supplies'],subscriptions:false,reviewAboveCents:null,periodStart:'2026-01-01T00:00:00Z',periodEnd:'2099-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',...overrides});
export const basket=(productId='toner',quantity=1)=>[{productId,quantity}];
export function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};}
/** TEST DOUBLE ONLY. No real payments, no production mode or success UI. */
export class MockGateway implements Gateway {
  calls:Kind[]=[];records=new Map<string,Snapshot>();keys=new Map<string,Snapshot>();
  block?:{kind:Kind;entered:ReturnType<typeof deferred>;release:ReturnType<typeof deferred>};
  timeoutAfter?:Kind;timeoutBefore?:Kind;mismatch=false;
  async perform(kind:Kind,p:Purchase,key:string){
    if(this.keys.has(key))return structuredClone(this.keys.get(key)!);
    this.calls.push(kind);
    if(this.block?.kind===kind){this.block.entered.resolve();await this.block.release.promise;}
    if(this.timeoutBefore===kind)throw new RemoteError('TEST_TIMEOUT');
    let s=this.records.get(p.id);
    if(kind==='CREATE')s={orderId:'MOCK-ORDER-'+randomUUID(),merchantId:p.merchant_id,currency:p.currency,totalCents:p.total_cents,buyerApproved:false};
    if(!s)throw new RemoteError('TEST_NOT_FOUND',true);
    if(kind==='AUTHORIZE'){if(!s.buyerApproved)throw new RemoteError('TEST_NOT_APPROVED',true);s.authorizationId='MOCK-AUTH-'+randomUUID();s.authorizationStatus='CREATED';}
    if(kind==='CAPTURE'){s.captureId='MOCK-CAPTURE-'+randomUUID();s.captureStatus='COMPLETED';s.authorizationStatus='CAPTURED';}
    if(kind==='VOID')s.authorizationStatus='VOIDED';
    this.records.set(p.id,s);this.keys.set(key,structuredClone(s));
    if(this.timeoutAfter===kind)throw new RemoteError('TEST_RESPONSE_LOST');
    return {...s,totalCents:s.totalCents+(this.mismatch?1:0)};
  }
  async read(p:Purchase){const s=this.records.get(p.id);if(!s)throw new RemoteError('TEST_NOT_FOUND');return structuredClone(s);}
  approve(id:string){this.records.get(id)!.buyerApproved=true;}
  gate(kind:Kind){this.block={kind,entered:deferred(),release:deferred()};return this.block;}
}
