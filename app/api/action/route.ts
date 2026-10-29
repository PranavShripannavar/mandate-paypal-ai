import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { authenticated,body,db,failure,origin,signing } from '../_runtime';
import { activate,consume,defaultPolicy,engine,startSession } from '../../../src/app-service';
import { aiCall } from '../../../src/ai';
import { canonicalBasket,decide,DomainError,PolicySchema,BasketSchema } from '../../../src/policy';
import { sweep } from '../../../src/worker';
export const runtime='nodejs';export const maxDuration=120;
export async function POST(req:Request){
  try{
    origin(req);const input=await body(req);const action=z.string().max(30).parse(input.action);const pool=db();
    if(action==='session'){
      const index=z.number().int().min(0).max(1).parse(input.owner);
      const session=await startSession(pool,index);const draftId=randomUUID();
      await pool.query("INSERT INTO drafts(id,session_id,body,ambiguity,source) VALUES($1,$2,$3,'[]','GUIDED_REPLAY')",[draftId,session.id,JSON.stringify(defaultPolicy())]);
      const token=signing().issue(session.owner_id,session.id);
      return Response.json({ok:true},{headers:{'Set-Cookie':`mandate=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${new URL(req.url).protocol==='https:'?'; Secure':''}`,'Cache-Control':'no-store'}});
    }
    const session=await authenticated(req);
    if(action==='draft'){
      const text=z.string().min(1).max(4000).parse(input.text);
      const output=await aiCall(pool,session,'draft',text,{merchants:[{id:'demo-office',name:'Demo Office Store'},{id:'unconfigured-merchant',name:'Unapproved Store'}],categories:['supplies','gift_cards']});
      if(!('policy'in output))throw new DomainError('INVALID_AI_DRAFT');
      await pool.query("INSERT INTO drafts(id,session_id,body,ambiguity,source) VALUES($1,$2,$3,$4,'LIVE_GEMINI')",[randomUUID(),session.id,JSON.stringify(output.policy),JSON.stringify(output.ambiguity)]);
      return Response.json(output);
    }
    if(action==='activate'){await activate(pool,session,z.uuid().parse(input.draftId));return Response.json({ok:true});}
    if(!session.mandate_id)throw new DomainError('ACTIVATE_POLICY_FIRST');
    const service=engine(pool);
    const policyRow=await pool.query('SELECT m.*,p.body AS policy FROM mandates m JOIN policies p ON p.mandate_id=m.id AND p.version=m.current_version WHERE m.id=$1 AND m.owner_id=$2',[session.mandate_id,session.owner_id]);
    const mandate=policyRow.rows[0];const policy=PolicySchema.parse(mandate.policy);
    if(action==='propose'){
      const text=z.string().min(1).max(4000).parse(input.text);const mode=z.enum(['live','guided']).parse(input.mode);
      const catalog=(await pool.query('SELECT * FROM products WHERE active')).rows;
      if(mode==='live')return Response.json(await aiCall(pool,session,'propose',text,{catalog,policy}));
      const items=text.toLowerCase().includes('gift')?[{productId:'gift-card',quantity:1}]:text.toLowerCase().includes('toner')?[{productId:'toner',quantity:1}]:[{productId:'pens',quantity:1},{productId:'notebooks',quantity:1}];
      const output={items,summary:'Guided replay: a fixed catalog proposal. No Gemini call was made.'};
      await pool.query("INSERT INTO agent_activity(session_id,action,source,input,output) VALUES($1,'propose','GUIDED_REPLAY',$2,$3)",[session.id,text,JSON.stringify(output)]);return Response.json(output);
    }
    if(action==='evaluate'||action==='approve'){
      const items=BasketSchema.parse(input.items);const products=(await pool.query('SELECT * FROM products')).rows;
      const basket=canonicalBasket(items,products);const decision=decide(policy,basket,{now:new Date(),spent:mandate.spent_cents,reserved:mandate.reserved_cents,revoked:!!mandate.revoked_at});
      if(action==='evaluate'){
        await pool.query("INSERT INTO agent_activity(session_id,action,source,output) VALUES($1,'evaluate','BACKEND',$2)",[session.id,JSON.stringify({decision,basket})]);return Response.json({decision,basket});
      }
      if(!process.env.PAYPAL_CLIENT_ID||!process.env.PAYPAL_CLIENT_SECRET)throw new DomainError('PAYPAL_UNAVAILABLE');
      const key=z.string().uuid().parse(input.key);const reviewed=z.boolean().parse(input.reviewed);
      const result=await service.reserve(session.owner_id,session.mandate_id,key,items,reviewed);
      if(!result.purchase)return Response.json(result);
      const existing=(await pool.query("SELECT 1 FROM operations WHERE purchase_id=$1 AND kind='CREATE'",[result.purchase.id])).rowCount;
      if(!existing){await consume(pool,'global','paymentOrders',20);await consume(pool,session.id,'paymentOrders',5);}
      const purchase=await service.execute(session.owner_id,result.purchase.id,'CREATE');
      return Response.json({purchase,approvalUrl:purchase.order_id?`https://www.sandbox.paypal.com/checkoutnow?token=${purchase.order_id}`:null});
    }
    if(action==='explain'){
      const items=BasketSchema.parse(input.items);const basket=canonicalBasket(items,(await pool.query('SELECT * FROM products')).rows);
      const decision=decide(policy,basket,{now:new Date(),spent:mandate.spent_cents,reserved:mandate.reserved_cents,revoked:!!mandate.revoked_at});
      return Response.json(await aiCall(pool,session,'explain','Explain this deterministic result concisely. It cannot be overridden.',{decision,basket,policy}));
    }
    if(action==='splitDemo'){
      const first=await service.reserve(session.owner_id,session.mandate_id,randomUUID(),[{productId:'toner',quantity:1}],true);
      const second=await service.reserve(session.owner_id,session.mandate_id,randomUUID(),[{productId:'toner',quantity:1}],true);
      const result={first:{decision:first.kind,purchaseId:first.purchase?.id},second:{decision:second.kind,reasons:second.reasons},note:'Application budget reservations only. No PayPal order, authorization or capture was called.'};
      await pool.query("INSERT INTO agent_activity(session_id,action,source,output) VALUES($1,'split-spending','BACKEND',$2)",[session.id,JSON.stringify(result)]);return Response.json(result);
    }
    if(action==='revoke'){
      const held=(await pool.query("SELECT id FROM purchases WHERE mandate_id=$1 AND owner_id=$2 AND state='AUTHORIZED' AND reservation='HELD'",[session.mandate_id,session.owner_id])).rows;
      await service.revoke(session.owner_id,session.mandate_id);
      for(const p of held){try{await service.execute(session.owner_id,p.id,'CAPTURE');}catch(e){await pool.query("INSERT INTO audit(owner_id,mandate_id,purchase_id,actor,event,details) VALUES($1,$2,$3,$1,'CAPTURE_BLOCKED_AFTER_REVOCATION',$4)",[session.owner_id,session.mandate_id,p.id,JSON.stringify({reason:e instanceof DomainError?e.code:'ERROR'})]);}}
      await sweep(service);return Response.json({ok:true});
    }
    const purchaseId=z.uuid().parse(input.purchaseId);let purchase=await service.get(session.owner_id,purchaseId);
    if(purchase.mandate_id!==session.mandate_id)throw new DomainError('NOT_FOUND');
    if(action==='continue'){
      const hold=z.boolean().parse(input.hold);
      await consume(pool,session.id,'statusChecks',30);
      purchase=await service.reconcile(session.owner_id,purchaseId,true);
      if(purchase.state==='BUYER_APPROVED')purchase=await service.execute(session.owner_id,purchaseId,'AUTHORIZE');
      if(purchase.state==='AUTHORIZED'&&!hold)purchase=await service.execute(session.owner_id,purchaseId,'CAPTURE');
      return Response.json({purchase});
    }
    if(action==='capture')return Response.json({purchase:await service.execute(session.owner_id,purchaseId,'CAPTURE')});
    if(action==='reconcile'){await sweep(service);return Response.json({purchase:await service.get(session.owner_id,purchaseId)});}
    if(action==='cancel'){await service.disable(session.owner_id,purchaseId,'CANCELLED');await sweep(service);return Response.json({ok:true});}
    throw new DomainError('UNKNOWN_ACTION');
  }catch(e){return failure(e);}
}
