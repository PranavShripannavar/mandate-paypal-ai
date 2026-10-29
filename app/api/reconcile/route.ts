import { db,failure } from '../_runtime';
import { engine } from '../../../src/app-service';
import { sweep } from '../../../src/worker';
export const runtime='nodejs';export const maxDuration=120;
export async function GET(req:Request){if(!process.env.CRON_SECRET||req.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return new Response('Unauthorized',{status:401});try{return Response.json({outcomes:await sweep(engine(db()))});}catch(e){return failure(e);}}
