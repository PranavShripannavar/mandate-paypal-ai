import type { Engine } from './engine';
import { DomainError } from './policy';
import { z } from 'zod';
const Event=z.object({id:z.string().min(1).max(200),event_type:z.string().max(150),resource:z.unknown()}).passthrough();
export type SignatureVerifier=(headers:Record<string,string>,event:unknown)=>Promise<boolean>;
export class Webhooks {
  constructor(private engine:Engine,private verify:SignatureVerifier){}
  async receive(headers:Record<string,string>,input:unknown){
    const event=Event.parse(input);
    // Verification failure/temporary exception must not insert a trusted event or acknowledge it as applied.
    if(!await this.verify(headers,input))throw new DomainError('INVALID_SIGNATURE');
    const resource=z.object({id:z.string().optional(),supplementary_data:z.object({related_ids:z.object({order_id:z.string().optional()}).passthrough()}).passthrough().optional()}).passthrough().safeParse(event.resource);
    const hint=resource.success?resource.data.supplementary_data?.related_ids.order_id??(event.event_type==='CHECKOUT.ORDER.APPROVED'?resource.data.id:null):null;
    const inserted=await this.engine.db.query("INSERT INTO webhook_events(event_id,event_type,verified_at,status,order_hint) VALUES($1,$2,clock_timestamp(),'QUEUED',$3) ON CONFLICT DO NOTHING RETURNING event_id",[event.id,event.event_type,hint]);
    return {duplicate:inserted.rowCount===0};
  }
  async process(eventId:string,orderId:string){
    // orderId is only a lookup hint. Authoritative read verifies actual payment identity/amount; webhook claims never set payment success.
    const event=(await this.engine.db.query('SELECT * FROM webhook_events WHERE event_id=$1',[eventId])).rows[0];
    if(!event)throw new DomainError('UNVERIFIED_EVENT');
    if(event.status==='APPLIED')return;
    const p=(await this.engine.db.query('SELECT id,owner_id FROM purchases WHERE order_id=$1',[orderId])).rows[0];
    if(!p){await this.engine.db.query("UPDATE webhook_events SET status='UNKNOWN_REFERENCE' WHERE event_id=$1",[eventId]);return;}
    const current=await this.engine.reconcile(p.owner_id,p.id,true);
    // Processing is complete only for authoritative terminal outcomes. Pending events remain queued for worker retries.
    const reflectsEvent=current.reservation!=='HELD'||(event.event_type==='PAYMENT.AUTHORIZATION.CREATED'&&!!current.authorization_id)||(event.event_type==='CHECKOUT.ORDER.APPROVED'&&['BUYER_APPROVED','AUTHORIZED','CAPTURED'].includes(current.state));
    if(reflectsEvent)await this.engine.db.query("UPDATE webhook_events SET purchase_id=$2,status='APPLIED' WHERE event_id=$1",[eventId,p.id]);
  }
}
