import { authenticated,db,failure } from '../_runtime';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){
  try{
    const connection={paypal:!!process.env.PAYPAL_CLIENT_ID&&!!process.env.PAYPAL_CLIENT_SECRET,ai:!!process.env.GEMINI_API_KEY,webhooks:!!process.env.PAYPAL_WEBHOOK_ID,database:!!process.env.DATABASE_URL};
    let session;try{session=await authenticated(req);}catch{return Response.json({session:null,connection});}
    const pool=db();
    const [products,drafts,activity]=await Promise.all([
      pool.query('SELECT id,merchant_id,category,recurring,price_cents,description FROM products WHERE active ORDER BY price_cents,id'),
      pool.query('SELECT * FROM drafts WHERE session_id=$1 ORDER BY created_at DESC LIMIT 1',[session.id]),
      pool.query('SELECT action,source,input,output,created_at FROM agent_activity WHERE session_id=$1 ORDER BY id DESC LIMIT 20',[session.id])
    ]);
    let mandate=null,purchases:unknown[]=[],audit:unknown[]=[],ledger:unknown[]=[];
    if(session.mandate_id){
      const [m,p,a,l]=await Promise.all([
        pool.query('SELECT m.*,p.body AS policy FROM mandates m JOIN policies p ON p.mandate_id=m.id AND p.version=m.current_version WHERE m.id=$1 AND m.owner_id=$2',[session.mandate_id,session.owner_id]),
        pool.query('SELECT * FROM purchases WHERE mandate_id=$1 AND owner_id=$2 ORDER BY created_at DESC',[session.mandate_id,session.owner_id]),
        pool.query('SELECT event,actor,details,at,purchase_id FROM audit WHERE mandate_id=$1 AND owner_id=$2 ORDER BY id DESC LIMIT 80',[session.mandate_id,session.owner_id]),
        pool.query('SELECT kind,cents,at,purchase_id FROM ledger WHERE mandate_id=$1 ORDER BY id DESC LIMIT 80',[session.mandate_id])
      ]);mandate=m.rows[0];purchases=p.rows;audit=a.rows;ledger=l.rows;
    }
    const [webhooks,operations]=await Promise.all([pool.query('SELECT event_id,event_type,status,verified_at FROM webhook_events WHERE purchase_id IN (SELECT id FROM purchases WHERE mandate_id=$1 AND owner_id=$2) ORDER BY received_at DESC LIMIT 10',[session.mandate_id,session.owner_id]),pool.query('SELECT purchase_id,kind,request_id,outcome,started_at,error_code FROM operations WHERE purchase_id IN (SELECT id FROM purchases WHERE mandate_id=$1 AND owner_id=$2) ORDER BY started_at',[session.mandate_id,session.owner_id])]);
    return Response.json({session:{id:session.id,label:session.label,owner:session.owner_id=== '11111111-1111-4111-8111-111111111111'?0:1},connection,products:products.rows,draft:drafts.rows[0]??null,mandate,purchases,audit,ledger,activity:activity.rows,verifiedWebhooks:webhooks.rows,operations:operations.rows},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return failure(e);}
}
