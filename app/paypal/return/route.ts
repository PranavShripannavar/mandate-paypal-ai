export async function GET(req:Request){const target=new URL('/',process.env.APP_URL??req.url);target.searchParams.set('paypal','returned');return Response.redirect(target,303);}
