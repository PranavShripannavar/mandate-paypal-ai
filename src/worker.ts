import { Engine } from './engine';
import { Webhooks } from './webhooks';
export async function sweep(source:Engine){
  const engine=new Engine(source.db,source.gateway,'system');
  await engine.recover();
  const rows=await engine.db.query(`SELECT p.id,p.owner_id,p.approval_expires,p.disabled_at FROM purchases p
    LEFT JOIN LATERAL (SELECT count(*) AS attempts,max(next_attempt_at) AS next_attempt FROM reconciliation_attempts WHERE purchase_id=p.id) r ON true
    WHERE p.reservation='HELD' AND r.attempts<8 AND (r.next_attempt IS NULL OR r.next_attempt<=clock_timestamp())
    ORDER BY r.next_attempt NULLS FIRST,p.created_at LIMIT 100`);
  const outcomes=[];
  for(const row of rows.rows){
    try {
      if(+row.approval_expires<=Date.now())await engine.disable(row.owner_id,row.id,'EXPIRED');
      await engine.cleanup(row.owner_id,row.id);
      let p=await engine.get(row.owner_id,row.id);
      if(p.reservation!=='HELD')continue;
      p=await engine.reconcile(row.owner_id,row.id);
      if(p.disabled_at&&p.authorization_id&&!p.capture_id&&p.reservation==='HELD')await engine.execute(p.owner_id,p.id,'VOID');
      outcomes.push({id:p.id,status:(await engine.get(p.owner_id,p.id)).state});
    } catch {outcomes.push({id:row.id,status:'UNRESOLVED'});}
  }
  const events=await engine.db.query("SELECT event_id,order_hint FROM webhook_events WHERE status<>'APPLIED' AND order_hint IS NOT NULL ORDER BY received_at LIMIT 100");
  const inbox=new Webhooks(engine,async()=>false);
  for(const event of events.rows){try{await inbox.process(event.event_id,event.order_hint);}catch{/* Persisted verified inbox remains available for the next sweep. */}}
  return outcomes;
}
