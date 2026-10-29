import {readFileSync} from 'node:fs';
import {Pool,transaction} from '../src/db';
const config=JSON.parse(readFileSync('work/dev-config.json','utf8'));
const db=new Pool({connectionString:`postgresql://mandate:${config.password}@127.0.0.1:55440/mandate`});
try{
 await transaction(db,async c=>{
  const hint=(await c.query('SELECT id,mandate_id,owner_id FROM purchases WHERE order_id=$1',[process.argv[2]])).rows[0];if(!hint)throw new Error('Existing order not found');
  await c.query('SELECT id FROM mandates WHERE id=$1 FOR UPDATE',[hint.mandate_id]);
  const p=(await c.query('SELECT * FROM purchases WHERE id=$1 FOR UPDATE',[hint.id])).rows[0];
  if(p.authorization_id||p.capture_id||p.state!=='ORDER_CREATED')throw new Error('Hold setup requires an existing unexecuted order');
  await c.query('UPDATE purchases SET hold_before_capture=true WHERE id=$1',[p.id]);
  await c.query("INSERT INTO audit(owner_id,mandate_id,purchase_id,actor,event,details) VALUES($1,$2,$3,'system','OWNER_REQUESTED_CAPTURE_HOLD',$4)",[p.owner_id,p.mandate_id,p.id,JSON.stringify({orderId:p.order_id,reason:'Owner approved authorization/revoke/void verification only'})]);
  console.log(JSON.stringify({orderId:p.order_id,purchaseId:p.id,holdBeforeCapture:true}));
 });
}finally{await db.end();}
