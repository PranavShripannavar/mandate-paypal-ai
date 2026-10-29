import {readFileSync,writeFileSync} from 'node:fs';
import {Pool} from '../src/db';
try{process.loadEnvFile('.env');}catch{/* optional scan variables */}
const config=JSON.parse(readFileSync('work/dev-config.json','utf8'));
const db=new Pool({connectionString:`postgresql://mandate:${config.password}@127.0.0.1:55440/mandate`});
try{
 const purchases=(await db.query('SELECT id,owner_id,mandate_id,version,total_cents,currency,merchant_id,state,reservation,order_id,authorization_id,capture_id,disabled_at,disable_reason,approval_expires,hold_before_capture FROM purchases WHERE order_id IS NOT NULL ORDER BY created_at')).rows;
 const ids=purchases.map(p=>p.id);
 const operations=(await db.query('SELECT purchase_id,kind,request_id,payload_hash,outcome,started_at,finished_at,error_code,remote_id FROM operations WHERE purchase_id=ANY($1::uuid[]) ORDER BY started_at',[ids])).rows;
 const ledger=(await db.query('SELECT * FROM ledger WHERE purchase_id=ANY($1::uuid[]) ORDER BY id',[ids])).rows;
 const evidence=(await db.query('SELECT * FROM payment_evidence ORDER BY id')).rows;
 const webhooks=(await db.query('SELECT * FROM webhook_events ORDER BY received_at')).rows;
 const audit=(await db.query('SELECT * FROM audit WHERE purchase_id=ANY($1::uuid[]) ORDER BY id',[ids])).rows;
 const text=JSON.stringify({at:new Date().toISOString(),purchases,operations,ledger,webhooks,audit,evidence},null,2);
 if([process.env.PAYPAL_CLIENT_ID,process.env.PAYPAL_CLIENT_SECRET,process.env.GEMINI_API_KEY,config.password,config.sessionSecret].filter(Boolean).some(secret=>text.includes(secret)))throw new Error('Secret check failed; export not written');
 writeFileSync('evidence/live-ledger.json',text);
 console.log(JSON.stringify({purchases:purchases.map(p=>({id:p.id,order:p.order_id,state:p.state,reservation:p.reservation,auth:p.authorization_id,capture:p.capture_id})),verifiedWebhookEvents:webhooks.length,evidenceRecords:evidence.length}));
}finally{await db.end();}
