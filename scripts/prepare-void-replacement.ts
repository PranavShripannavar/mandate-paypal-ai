import {readFileSync} from 'node:fs';
import {Pool,transaction} from '../src/db';
import {engine} from '../src/app-service';
process.loadEnvFile('.env');
const config=JSON.parse(readFileSync('work/dev-config.json','utf8'));
const db=new Pool({connectionString:`postgresql://mandate:${config.password}@127.0.0.1:55440/mandate`});
try{
 const old=(await db.query('SELECT * FROM purchases WHERE order_id=$1',['2RL11757V75590309'])).rows[0];
 if(!old)throw new Error('Original test missing');
 const service=engine(db);const retired=await service.reconcile(old.owner_id,old.id,true);
 if(retired.authorization_id||retired.capture_id||retired.disable_reason!=='EXPIRED'||retired.reservation!=='RELEASED')throw new Error('Original test not safely retired');
 const key='owner-authorized-void-replacement-2026-10-31';
 const unexpected=await db.query('SELECT id FROM purchases WHERE order_id IS NOT NULL AND order_id NOT IN ($1,$2) AND logical_key<>$3',['2RL11757V75590309','77U17875SJ4927124',key]);
 if(unexpected.rowCount)throw new Error('Additional existing order requires review; no new checkout');
 const result=await service.reserve(old.owner_id,old.mandate_id,key,old.basket.items.map((x:{productId:string;quantity:number})=>({productId:x.productId,quantity:x.quantity})),true);
 const purchase=result.purchase;if(!purchase||purchase.total_cents!==500)throw new Error('Expected USD5 approval not available');
 await transaction(db,async c=>{
   await c.query('SELECT id FROM mandates WHERE id=$1 FOR UPDATE',[purchase.mandate_id]);
   const p=(await c.query('SELECT * FROM purchases WHERE id=$1 FOR UPDATE',[purchase.id])).rows[0];
   if(p.state==='APPROVED'){
     await c.query('UPDATE purchases SET hold_before_capture=true WHERE id=$1',[p.id]);
     if(!(await c.query("SELECT 1 FROM audit WHERE purchase_id=$1 AND event='OWNER_APPROVED_VOID_REPLACEMENT'",[p.id])).rowCount)
       await c.query("INSERT INTO audit(owner_id,mandate_id,purchase_id,actor,event,details) VALUES($1,$2,$3,$5,'OWNER_APPROVED_VOID_REPLACEMENT',$4)",[p.owner_id,p.mandate_id,p.id,JSON.stringify({replacesOrder:retired.order_id,totalCents:500,holdBeforeCapture:true}),p.owner_id]);
   }else if(!p.hold_before_capture)throw new Error('Existing replacement lacks durable hold');
 });
 const p=await service.execute(old.owner_id,purchase.id,'CREATE');
 console.log(JSON.stringify({purchaseId:p.id,orderId:p.order_id,state:p.state,holdBeforeCapture:p.hold_before_capture,approvalExpires:p.approval_expires,approvalUrl:p.order_id?'https://www.sandbox.paypal.com/checkoutnow?token='+p.order_id:null}));
}finally{await db.end();}
