import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { DomainError } from './policy';
const Body=z.object({owner:z.uuid(),exp:z.number().int(),nonce:z.uuid()}).strict();
export function sessions(secret:string){
  if(Buffer.byteLength(secret)<32)throw new Error('SESSION_SECRET requires at least 32 bytes');
  const mac=(v:string)=>createHmac('sha256',secret).update(v).digest('base64url');
  return {
    issue(owner:string,nonce:string,now=Date.now()){
      const payload=Buffer.from(JSON.stringify(Body.parse({owner,nonce,exp:now+3_600_000}))).toString('base64url');return payload+'.'+mac(payload);
    },
    verify(token:string,now=Date.now()){
      if(typeof token!=='string'||token.length>1024)throw new DomainError('UNAUTHENTICATED');
      const parts=token.split('.');if(parts.length!==2)throw new DomainError('UNAUTHENTICATED');
      const expected=Buffer.from(mac(parts[0]!));const actual=Buffer.from(parts[1]!);
      if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new DomainError('UNAUTHENTICATED');
      try{const body=Body.parse(JSON.parse(Buffer.from(parts[0]!,'base64url').toString('utf8')));if(body.exp<=now)throw new Error();return body.owner;}catch{throw new DomainError('UNAUTHENTICATED');}
    },
    nonce(token:string){return Body.parse(JSON.parse(Buffer.from(token.split('.')[0]!,'base64url').toString('utf8'))).nonce;}
  };
}
