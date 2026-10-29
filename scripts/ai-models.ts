import { GoogleGenAI } from '@google/genai';
process.loadEnvFile('.env');
try{
 const client=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY,httpOptions:{timeout:15000}});
 const models=await client.models.list({config:{pageSize:100}});
 const names=[];
 for await(const model of models){if(model.name?.includes('flash'))names.push(model.name);if(names.length>=15)break;}
 console.log(JSON.stringify({flashModels:names}));
}catch(e){const error=e as {status?:number;message?:string};console.log(JSON.stringify({status:error.status,message:error.message?.replaceAll(process.env.GEMINI_API_KEY??'not-a-secret','[REDACTED]').slice(0,1200)}));process.exitCode=1;}
