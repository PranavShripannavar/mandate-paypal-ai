import EmbeddedPostgres from 'embedded-postgres';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync,readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
try{process.loadEnvFile('.env');}catch{/* optional provider configuration */}
mkdirSync('work',{recursive:true});
const file='work/dev-config.json';
const config=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{password:randomBytes(32).toString('hex'),sessionSecret:randomBytes(48).toString('hex')};
if(!existsSync(file))writeFileSync(file,JSON.stringify(config),{mode:0o600});
const databaseDir=resolve('work','dev-postgres');
const pg=new EmbeddedPostgres({databaseDir,user:'mandate',password:config.password,port:55440,persistent:true,authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
const env={...process.env,DATABASE_URL:`postgresql://mandate:${config.password}@127.0.0.1:55440/mandate`,SESSION_SECRET:config.sessionSecret,APP_URL:process.env.APP_URL??'http://127.0.0.1:3000'};
const run=(args:string[])=>new Promise<number>(r=>{const c=spawn(process.execPath,args,{env,stdio:'inherit',windowsHide:true});c.on('exit',code=>r(code??1));c.on('error',()=>r(1));});
try{
  if(!existsSync(resolve(databaseDir,'PG_VERSION')))await pg.initialise();
  await pg.start();
  const client=pg.getPgClient('postgres');await client.connect();
  if(!(await client.query("SELECT 1 FROM pg_database WHERE datname='mandate'")).rowCount)await client.query('CREATE DATABASE mandate');
  await client.end();
  if(await run(['--import','tsx','scripts/migrate.ts'])!==0)throw new Error('Migration failed');
  process.exitCode=await run(['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1']);
}finally{await pg.stop();}
