import { readFileSync } from 'node:fs';
import { Pool, transaction } from '../src/db';
import { seed } from '../src/seed';
try{process.loadEnvFile('.env');}catch{/* process environment may provide configuration */}
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
const schema=process.env.DATABASE_SCHEMA??'public';
if(!/^[a-z][a-z0-9_]*$/.test(schema))throw new Error('Invalid schema');
const db=new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema},public`});
try{
  await transaction(db,async c=>{
    await c.query("SELECT pg_advisory_xact_lock(hashtext('mandate-migrations'))");
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations(version int PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');
    if(!(await c.query('SELECT 1 FROM schema_migrations WHERE version=1')).rowCount){await c.query(readFileSync('migrations/001_core.sql','utf8'));await c.query('INSERT INTO schema_migrations(version) VALUES(1)');}
    if(!(await c.query('SELECT 1 FROM schema_migrations WHERE version=2')).rowCount){await c.query(readFileSync('migrations/002_app.sql','utf8'));await c.query('INSERT INTO schema_migrations(version) VALUES(2)');}
    if(!(await c.query('SELECT 1 FROM schema_migrations WHERE version=3')).rowCount){await c.query(readFileSync('migrations/003_evidence.sql','utf8'));await c.query('INSERT INTO schema_migrations(version) VALUES(3)');}
    if(!(await c.query('SELECT 1 FROM schema_migrations WHERE version=4')).rowCount){await c.query(readFileSync('migrations/004_hold.sql','utf8'));await c.query('INSERT INTO schema_migrations(version) VALUES(4)');}
  });
  await seed(db);console.log('Mandate migration 001 and demo catalog/owners ready.');
}finally{await db.end();}
