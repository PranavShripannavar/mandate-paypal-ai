import http from 'node:http';
// Stateless, bounded, no credentials, no query logging, no payment mutation. Payment status comes only from PayPal API.
export function callbackServer(){
  return http.createServer((req,res)=>{
    const url=new URL(req.url??'/', 'http://localhost');
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true,"service":"mandate-callback"}');return;}
    if(!['/return','/cancel'].includes(url.pathname)){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mandate · Sandbox return</title><style>body{font:18px system-ui;background:#101b28;color:#f5f8fc;margin:12vh auto;padding:24px;max-width:650px}small{color:#b8c7d9}h1{font-size:32px}</style><small>MANDATE · PAYPAL SANDBOX</small><h1>${url.pathname==='/return'?'You’re back from PayPal':'Checkout cancelled in the browser'}</h1><p>This return page does not confirm payment success or cancellation of a remote payment.</p><p>Return to Mandate. The backend will check PayPal’s authoritative order, authorization, and capture status.</p></html>`);
  });
}
if(process.argv[1]?.endsWith('callback.ts')||process.argv[1]?.endsWith('callback.js')){
  const port=Number(process.env.CALLBACK_PORT??8766);
  const server=callbackServer();server.requestTimeout=5000;server.headersTimeout=5000;
  server.on('error',()=>{console.error('Callback could not bind. Check CALLBACK_PORT; no existing process was stopped.');process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`Mandate callback listening at http://127.0.0.1:${port}`));
}
