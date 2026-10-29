import { Pool } from '../../src/db';
import { sessions } from '../../src/session';
import { DomainError } from '../../src/policy';
import type { DemoSession } from '../../src/app-service';
const globalDB=globalThis as typeof globalThis&{mandatePool?:InstanceType<typeof Pool>};
export function db(){if(!process.env.DATABASE_URL)throw new DomainError('DATABASE_UNAVAILABLE');return globalDB.mandatePool??=new Pool({connectionString:process.env.DATABASE_URL,max:8,connectionTimeoutMillis:5000,idleTimeoutMillis:10000});}
export function signing(){return sessions(process.env.SESSION_SECRET??'');}
export async function authenticated(req:Request){
  const token=req.headers.get('cookie')?.split('; ').find(x=>x.startsWith('mandate='))?.slice(8)??'';
  const owner=signing().verify(token);const nonce=signing().nonce(token);
  const session=(await db().query('SELECT * FROM demo_sessions WHERE id=$1 AND owner_id=$2 AND expires_at>clock_timestamp()',[nonce,owner])).rows[0] as DemoSession|undefined;
  if(!session)throw new DomainError('UNAUTHENTICATED');return session;
}
export function origin(req:Request){const allowed=process.env.APP_URL??new URL(req.url).origin;if(req.headers.get('origin')!==new URL(allowed).origin)throw new DomainError('ORIGIN_REJECTED');}
export async function body(req:Request){if(Number(req.headers.get('content-length')??0)>12000)throw new DomainError('BODY_TOO_LARGE');const text=await req.text();if(text.length>12000)throw new DomainError('BODY_TOO_LARGE');return JSON.parse(text);}
export function failure(error:unknown){
  const code=error instanceof DomainError?error.code:error instanceof Error&&error.name==='ZodError'?'INVALID_INPUT':'SERVICE_ERROR';
  return Response.json({error:code},{status:code==='UNAUTHENTICATED'?401:code==='NOT_FOUND'?404:code==='USAGE_LIMIT'?429:code==='SERVICE_ERROR'?503:400,headers:{'Cache-Control':'no-store'}});
}
