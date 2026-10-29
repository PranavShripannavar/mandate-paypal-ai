import pg from 'pg';
export const { Pool } = pg;
export type DB = pg.Pool;
export type TX = pg.PoolClient;
export async function transaction<T>(pool:DB,fn:(c:TX)=>Promise<T>):Promise<T>{
  const c=await pool.connect();
  try {await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");const out=await fn(c);await c.query('COMMIT');return out;}
  catch(e){await c.query('ROLLBACK');throw e;} finally {c.release();}
}
