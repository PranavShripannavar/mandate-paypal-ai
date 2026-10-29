import EmbeddedPostgres from 'embedded-postgres';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
mkdirSync('work',{recursive:true});
const password=randomBytes(32).toString('hex');
const pg=new EmbeddedPostgres({databaseDir:resolve('work','pg-'+Date.now()),port:55439,user:'mandate',password,persistent:true,authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
try{
  await pg.initialise();await pg.start();await pg.createDatabase('mandate_test');
  const child=spawn(process.execPath,['--import','tsx','scripts/integration.ts'],{stdio:'inherit',env:{...process.env,DATABASE_URL:`postgresql://mandate:${password}@127.0.0.1:55439/mandate_test`},windowsHide:true});
  process.exitCode=await new Promise<number>(resolve=>{child.on('exit',code=>resolve(code??1));child.on('error',()=>resolve(1));});
}finally{await pg.stop();}
