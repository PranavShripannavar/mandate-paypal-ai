import { createHash } from 'node:crypto';
import { z } from 'zod';

export const PolicySchema = z.object({
  currency: z.literal('USD'), maxPurchaseCents: z.number().int().positive().max(1_000_000),
  budgetCents: z.number().int().positive().max(10_000_000),
  merchantIds: z.array(z.string().min(1)).min(1), categories: z.array(z.string().min(1)).min(1),
  subscriptions: z.boolean(), reviewAboveCents: z.number().int().nonnegative().nullable(),
  periodStart: z.iso.datetime(), periodEnd: z.iso.datetime(), expiresAt: z.iso.datetime(),
}).strict().refine(p => Date.parse(p.periodStart) < Date.parse(p.periodEnd), 'Invalid period');
export type Policy = z.infer<typeof PolicySchema>;
export const BasketSchema = z.array(z.object({productId:z.string().min(1).max(80),quantity:z.number().int().min(1).max(100)}).strict()).min(1).max(20);
export type BasketInput = z.infer<typeof BasketSchema>;
export type Product = { id:string; merchant_id:string; category:string; recurring:boolean; price_cents:number; currency:string; description:string; active:boolean };
export type Basket = { items:{productId:string;quantity:number;unitCents:number;category:string;recurring:boolean}[]; merchantId:string; currency:'USD'; itemCents:number; taxCents:number; shippingCents:number; totalCents:number; hash:string };
export class DomainError extends Error { constructor(public code:string){super(code);} }
export function canonicalBasket(input:unknown, products:Product[]):Basket {
  const rows=BasketSchema.parse(input);
  if(new Set(rows.map(x=>x.productId)).size!==rows.length) throw new DomainError('DUPLICATE_PRODUCT');
  const sorted=[...rows].sort((a,b)=>a.productId.localeCompare(b.productId));
  const merchants=new Set<string>();
  const items=sorted.map(row=>{
    const p=products.find(p=>p.id===row.productId);
    if(!p || !p.active || !p.category || typeof p.recurring!=='boolean' || !Number.isSafeInteger(p.price_cents)||p.price_cents<1) throw new DomainError('UNTRUSTED_PRODUCT');
    if(p.currency!=='USD') throw new DomainError('CURRENCY_MISMATCH');
    merchants.add(p.merchant_id);
    return {productId:p.id,quantity:row.quantity,unitCents:p.price_cents,category:p.category,recurring:p.recurring};
  });
  if(merchants.size!==1) throw new DomainError('MIXED_MERCHANTS');
  const itemCents=items.reduce((n,x)=>n+x.unitCents*x.quantity,0);
  // Controlled demo catalog: no tax or shipping charged. Explicit zeros in payment breakdown.
  const body={items,merchantId:[...merchants][0]!,currency:'USD' as const,itemCents,taxCents:0,shippingCents:0,totalCents:itemCents};
  if(!Number.isSafeInteger(itemCents)||itemCents>10_000_000) throw new DomainError('INVALID_TOTAL');
  return {...body,hash:createHash('sha256').update(JSON.stringify(body)).digest('hex')};
}
export function decide(policy:Policy,basket:Basket,context:{now:Date;spent:number;reserved:number;revoked:boolean}) {
  const reasons:string[]=[];const now=+context.now;
  if(context.revoked) reasons.push('REVOKED');
  if(now>=Date.parse(policy.expiresAt)) reasons.push('POLICY_EXPIRED');
  if(now<Date.parse(policy.periodStart)||now>=Date.parse(policy.periodEnd)) reasons.push('OUTSIDE_PERIOD');
  if(basket.currency!==policy.currency) reasons.push('CURRENCY_MISMATCH');
  if(!policy.merchantIds.includes(basket.merchantId)) reasons.push('MERCHANT_FORBIDDEN');
  if(basket.items.some(x=>!policy.categories.includes(x.category))) reasons.push('CATEGORY_FORBIDDEN');
  if(!policy.subscriptions&&basket.items.some(x=>x.recurring)) reasons.push('SUBSCRIPTION_FORBIDDEN');
  if(basket.totalCents>policy.maxPurchaseCents) reasons.push('PURCHASE_LIMIT');
  if(context.spent+context.reserved+basket.totalCents>policy.budgetCents) reasons.push('BUDGET_LIMIT');
  return {kind:reasons.length?'BLOCK':policy.reviewAboveCents!==null&&basket.totalCents>policy.reviewAboveCents?'REVIEW':'ALLOW',reasons};
}
