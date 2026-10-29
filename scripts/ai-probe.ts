import {GoogleGenAI,ThinkingLevel} from '@google/genai';
process.loadEnvFile('.env');
try{
 const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY,httpOptions:{timeout:20000}});
 const response=await ai.models.generateContent({model:'gemini-3.1-flash-lite',contents:'Return JSON with ready equal to true.',config:{maxOutputTokens:100,thinkingConfig:{thinkingLevel:ThinkingLevel.MINIMAL,includeThoughts:false},responseMimeType:'application/json',responseJsonSchema:{type:'object',properties:{ready:{type:'boolean'}},required:['ready']}}});
 console.log(JSON.stringify({model:'gemini-3.1-flash-lite',text:response.text,finishReason:response.candidates?.[0]?.finishReason}));
}catch(e){const error=e as {status?:number;message?:string};console.log(JSON.stringify({status:error.status,message:error.message?.replaceAll(process.env.GEMINI_API_KEY??'not-a-secret','[REDACTED]').slice(0,1000)}));process.exitCode=1;}
