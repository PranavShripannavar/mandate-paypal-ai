import {readFileSync} from 'node:fs';
import {Pool} from '../src/db';
import {engine} from '../src/app-service';
import {sweep} from '../src/worker';
process.loadEnvFile('.env');
const config=JSON.parse(readFileSync('work/dev-config.json','utf8'));
const db=new Pool({connectionString:`postgresql://mandate:${config.password}@127.0.0.1:55440/mandate`,max:3,connectionTimeoutMillis:5000});
let stop=false;process.on('SIGINT',()=>{stop=true;});process.on('SIGTERM',()=>{stop=true;});
try{
 console.log('Mandate local reconciliation worker started (20-second sweeps; bounded per-purchase retries).');
 do{
   try{const outcomes=await sweep(engine(db));if(outcomes.length)console.log(JSON.stringify({at:new Date().toISOString(),outcomes}));}catch{console.error('Sweep unavailable; persisted records retained.');}
   if(process.argv.includes('--once'))break;
   await new Promise(r=>setTimeout(r,20000));
 }while(!stop);
}finally{await db.end();}
