import { z } from 'zod';
import { RemoteError, type Gateway, type Kind, type Purchase, type Snapshot } from './engine';
const Money=z.object({currency_code:z.string(),value:z.string().regex(/^\d+\.\d{2}$/)}).passthrough();
const Payment=z.object({id:z.string().min(1),status:z.string(),amount:Money,supplementary_data:z.object({related_ids:z.object({order_id:z.string().optional(),authorization_id:z.string().optional()}).passthrough()}).passthrough().optional()}).passthrough();
const Order=z.object({id:z.string(),intent:z.literal('AUTHORIZE'),status:z.string(),purchase_units:z.array(z.object({amount:Money,payee:z.object({merchant_id:z.string()}).passthrough(),payments:z.object({authorizations:z.array(Payment).optional(),captures:z.array(Payment).optional()}).passthrough().optional()}).passthrough()).length(1)}).passthrough();
const cents=(m:z.infer<typeof Money>)=>{const [d,f]=m.value.split('.');const n=Number(d)*100+Number(f);if(!Number.isSafeInteger(n))throw new RemoteError('INVALID_REMOTE_AMOUNT');return n;};
const dollars=(n:number)=>`${Math.floor(n/100)}.${String(n%100).padStart(2,'0')}`;
const id=(v:string)=>{if(!/^[A-Za-z0-9]+$/.test(v))throw new RemoteError('INVALID_REMOTE_ID');return v;};
/** Server-only sandbox adapter. Never import into a client component. Does not retry mutations. */
export type PaymentEvidence={purchaseId?:string;method:string;path:string;requestId?:string;http:number;debugId:string|null;request:unknown;response:unknown};
export class PayPalGateway implements Gateway {
  private base='https://api-m.sandbox.paypal.com';
  constructor(private config:{clientId:string;secret:string;merchantId:string;callbackBase:string;record?:(event:PaymentEvidence)=>Promise<void>}){
    if(!config.clientId||!config.secret||!/^[A-Z0-9]{13}$/.test(config.merchantId))throw new Error('PayPal sandbox unavailable: missing configuration');
    const callback=new URL(config.callbackBase);if(callback.protocol!=='https:'&&!(callback.protocol==='http:'&&callback.hostname==='127.0.0.1'))throw new Error('Invalid callback URL');
  }
  private async token(){
    try{
      const r=await fetch(this.base+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(this.config.clientId+':'+this.config.secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(15000)});
      const b=z.object({access_token:z.string()}).safeParse(await r.json());if(!r.ok||!b.success)throw new RemoteError('OAUTH_UNAVAILABLE',true);return b.data.access_token;
    }catch(e){if(e instanceof RemoteError)throw e;throw new RemoteError('OAUTH_UNAVAILABLE',true);}
  }
  private async request(method:string,path:string,body?:unknown,key?:string,purchaseId?:string){
    const token=await this.token();
    try{
      const r=await fetch(this.base+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=representation',...(key?{'PayPal-Request-Id':key}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
      const raw=await r.text();
      const clean=(v:unknown):unknown=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,value])=>[k,/email|address|payer|payment_source|name|phone|access_token|nonce/i.test(k)?'[REDACTED]':clean(value)])):v;
      let data:unknown;try{data=raw?JSON.parse(raw):{};}catch{data={unparsed:true};}
      if(this.config.record)await this.config.record({purchaseId,method,path,requestId:key,http:r.status,debugId:r.headers.get('paypal-debug-id'),request:clean(body??null),response:clean(data)});
      // 5xx/timeouts are ambiguous. Even 4xx responses are conservatively reconciled; no retry here.
      if(!r.ok)throw new RemoteError(`PAYPAL_HTTP_${r.status}`,r.status>=400&&r.status<500);
      return raw?JSON.parse(raw):{};
    }catch(e){if(e instanceof RemoteError)throw e;throw new RemoteError('PAYPAL_UNKNOWN_OUTCOME');}
  }
  private verifyPayment(p:Purchase,payment:z.infer<typeof Payment>,orderId:string,authorizationId?:string){
    if(payment.amount.currency_code!=='USD'||cents(payment.amount)!==p.total_cents||payment.supplementary_data?.related_ids.order_id!==orderId||(authorizationId&&payment.supplementary_data?.related_ids.authorization_id!==authorizationId))throw new RemoteError('REMOTE_DATA_MISMATCH');
  }
  async read(p:Purchase):Promise<Snapshot>{
    if(!p.order_id)throw new RemoteError('ORDER_REFERENCE_UNAVAILABLE');
    const order=Order.parse(await this.request('GET','/v2/checkout/orders/'+id(p.order_id),undefined,undefined,p.id));
    const unit=order.purchase_units[0]!;
    if(p.merchant_id!=='demo-office'||unit.payee.merchant_id!==this.config.merchantId||unit.amount.currency_code!=='USD'||cents(unit.amount)!==p.total_cents)throw new RemoteError('REMOTE_DATA_MISMATCH');
    const s:Snapshot={orderId:order.id,merchantId:p.merchant_id,currency:'USD',totalCents:cents(unit.amount),buyerApproved:order.status==='APPROVED'};
    const auths=unit.payments?.authorizations??[];const captures=unit.payments?.captures??[];
    if(auths.length>1||captures.length>1)throw new RemoteError('MULTIPLE_PAYMENTS_NOT_SUPPORTED');
    const authId=p.authorization_id??auths[0]?.id;
    if(authId){
      const auth=Payment.parse(await this.request('GET','/v2/payments/authorizations/'+id(authId),undefined,undefined,p.id));this.verifyPayment(p,auth,order.id);
      s.authorizationId=auth.id;s.buyerApproved=true;
      s.authorizationStatus=z.enum(['CREATED','VOIDED','EXPIRED','CAPTURED']).parse(auth.status);
    }
    const captureId=p.capture_id??captures[0]?.id;
    if(captureId){
      const capture=Payment.parse(await this.request('GET','/v2/payments/captures/'+id(captureId),undefined,undefined,p.id));this.verifyPayment(p,capture,order.id,s.authorizationId);
      if(!captures.some(c=>c.id===capture.id))throw new RemoteError('CAPTURE_NOT_IN_EXPECTED_ORDER');
      s.captureId=capture.id;s.captureStatus=z.enum(['COMPLETED','PENDING','DECLINED']).parse(capture.status);
    }
    return s;
  }
  async perform(kind:Kind,p:Purchase,key:string):Promise<Snapshot>{
    if(p.merchant_id!=='demo-office')throw new RemoteError('MERCHANT_HAS_NO_PAYMENT_ROUTE',true);
    let orderId=p.order_id;
    if(kind==='CREATE'){
      const money=(n:number)=>({currency_code:'USD',value:dollars(n)});
      const response=z.object({id:z.string()}).parse(await this.request('POST','/v2/checkout/orders',{
        intent:'AUTHORIZE',purchase_units:[{reference_id:p.id,custom_id:p.id,payee:{merchant_id:this.config.merchantId},amount:{...money(p.total_cents),breakdown:{item_total:money(p.basket.itemCents),tax_total:money(p.basket.taxCents),shipping:money(p.basket.shippingCents)}},items:p.basket.items.map(item=>({name:item.productId,quantity:String(item.quantity),unit_amount:money(item.unitCents),category:'PHYSICAL_GOODS'}))}],
        payment_source:{paypal:{experience_context:{return_url:this.config.callbackBase+'/return',cancel_url:this.config.callbackBase+'/cancel',shipping_preference:'NO_SHIPPING',user_action:'PAY_NOW'}}}
      },key,p.id));orderId=id(response.id);
    }else{
      const before=await this.read(p); // Independent authoritative verification after local claim, before mutation.
      if(kind==='AUTHORIZE'&&!before.buyerApproved)throw new RemoteError('BUYER_NOT_APPROVED',true);
      if(kind==='AUTHORIZE')await this.request('POST',`/v2/checkout/orders/${id(p.order_id!)}/authorize`,{},key,p.id);
      if(kind==='CAPTURE'){
        if(before.authorizationStatus!=='CREATED'||before.captureId)throw new RemoteError('NOT_CAPTURABLE',true);
        await this.request('POST',`/v2/payments/authorizations/${id(p.authorization_id!)}/capture`,{amount:{currency_code:'USD',value:dollars(p.total_cents)},final_capture:true},key,p.id);
      }
      if(kind==='VOID'){
        if(before.captureId)throw new RemoteError('NOT_VOIDABLE',true);
        await this.request('POST',`/v2/payments/authorizations/${id(p.authorization_id!)}/void`,{},key,p.id);
      }
    }
    try{return await this.read({...p,order_id:orderId});}catch{throw new RemoteError('AUTHORITATIVE_READBACK_FAILED',false,orderId??undefined);}
  }
  async verifyWebhook(headers:Record<string,string>,event:unknown,webhookId:string){
    const required=['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'];
    if(!webhookId||required.some(k=>!headers[k]))return false;
    const result=z.object({verification_status:z.string()}).parse(await this.request('POST','/v1/notifications/verify-webhook-signature',{auth_algo:headers['paypal-auth-algo'],cert_url:headers['paypal-cert-url'],transmission_id:headers['paypal-transmission-id'],transmission_sig:headers['paypal-transmission-sig'],transmission_time:headers['paypal-transmission-time'],webhook_id:webhookId,webhook_event:event}));
    return result.verification_status==='SUCCESS';
  }
}
