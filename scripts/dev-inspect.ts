import { readFileSync } from 'node:fs';
import { Pool } from '../src/db';
const config=JSON.parse(readFileSync('work/dev-config.json','utf8'));
const db=new Pool({connectionString:`postgresql://mandate:${config.password}@127.0.0.1:55440/mandate`});
try{console.log(JSON.stringify((await db.query('SELECT action,source,output,created_at FROM agent_activity ORDER BY id DESC LIMIT 3')).rows,null,2));}finally{await db.end();}
