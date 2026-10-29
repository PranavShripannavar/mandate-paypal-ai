import { z } from 'zod';
import { db,failure } from '../../_runtime';
import { engine,gateway } from '../../../../src/app-service';
import { Webhooks } from '../../../../src/webhooks';
export const runtime='nodejs';export const maxDuration=120;
export async function POST(req:Request){
  try{
    const text=await req.text();if(text.length>256000)return new Response('Too large',{status:413});
    const event=JSON.parse(text);const provider=gateway(db());
    const hooks=new Webhooks(engine(db()),(headers,body)=>provider.verifyWebhook(headers,body,process.env.PAYPAL_WEBHOOK_ID??''));
    const receipt=await hooks.receive(Object.fromEntries(req.headers.entries()),event);
    const parsed=z.object({id:z.string(),resource:z.object({id:z.string().optional(),supplementary_data:z.object({related_ids:z.object({order_id:z.string().optional()}).passthrough()}).passthrough().optional()}).passthrough()}).parse(event);
    const orderId=parsed.resource.supplementary_data?.related_ids.order_id??(event.event_type==='CHECKOUT.ORDER.APPROVED'?parsed.resource.id:undefined);
    if(orderId)await hooks.process(parsed.id,orderId);
    return Response.json({accepted:true,duplicate:receipt.duplicate});
  }catch(e){return failure(e);}
}
