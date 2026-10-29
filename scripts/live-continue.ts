import {readFileSync} from 'node:fs';
import {Pool} from '../src/db';
import {engine} from '../src/app-service';
import {sweep} from '../src/worker';
process.loadEnvFile('.env');
const config=JSON.parse(readFileSync('work/dev-config.json','utf8'));
const db=new Pool({connectionString:`postgresql://mandate:${config.password}@127.0.0.1:55440/mandate`});
try{
 const order=process.argv[2];const mode=process.argv[3]??'inspect';
 const purchase=(await db.query('SELECT * FROM purchases WHERE order_id=$1',[order])).rows[0];if(!purchase)throw new Error('Existing local order not found');
 const service=engine(db);let p=await service.reconcile(purchase.owner_id,purchase.id,true);
 if(['capture','hold'].includes(mode)&&p.state==='BUYER_APPROVED')p=await service.execute(p.owner_id,p.id,'AUTHORIZE');
 if(mode==='capture'&&p.state==='AUTHORIZED')p=await service.execute(p.owner_id,p.id,'CAPTURE');
 if(mode==='revoke'){
   if(p.state!=='AUTHORIZED'||!p.authorization_id||p.capture_id)throw new Error('Revoke/void verification requires a confirmed uncaptured authorization');
   await service.revoke(p.owner_id,p.mandate_id);
   let reason='';try{await service.execute(p.owner_id,p.id,'CAPTURE');}catch(e){reason=e instanceof Error?e.message:'UNKNOWN';}
   await db.query("INSERT INTO audit(owner_id,mandate_id,purchase_id,actor,event,details) VALUES($1,$2,$3,'system','CAPTURE_BLOCKED_AFTER_REVOCATION',$4)",[p.owner_id,p.mandate_id,p.id,JSON.stringify({reason})]);
   if(reason!=='REVOKED')throw new Error('Expected REVOKED capture rejection was not confirmed; inspect evidence before further operations');
   await service.execute(p.owner_id,p.id,'VOID');
   await sweep(service);
 }
 p=await service.get(p.owner_id,p.id);
 console.log(JSON.stringify({purchaseId:p.id,state:p.state,reservation:p.reservation,orderId:p.order_id,authorizationId:p.authorization_id,captureId:p.capture_id,budget:await service.budget(p.owner_id,p.mandate_id)}));
}finally{await db.end();}
