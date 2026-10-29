import { Pool } from '../src/db';
import { Engine } from '../src/engine';
// Read/claim recovery only. No credentials loaded, no remote payment operations.
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
const schema=process.env.DATABASE_SCHEMA??'public';
if(!/^[a-z][a-z0-9_]*$/.test(schema))throw new Error('Invalid schema');
const db=new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema},public`});
try{
  const noRemote={perform:async()=>{throw new Error('Remote operations disabled');},read:async()=>{throw new Error('Remote operations disabled');}};
  const result=await new Engine(db,noRemote,'system').recover();
  console.log(JSON.stringify({recoveredUnknown:result.rowCount}));
}finally{await db.end();}
