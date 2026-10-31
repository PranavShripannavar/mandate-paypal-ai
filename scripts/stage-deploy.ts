import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
try{process.loadEnvFile('.env');}catch{/* optional source scan credentials */}
const link=JSON.parse(readFileSync('.vercel/project.json','utf8'));
if(link.projectName!=='mandate-paypal-ai'||link.orgId!=='team_yxgP23j3ylo7nu1Xjh8Dhjl3')throw new Error('Unexpected deployment target');
const roots=['app/','src/','scripts/','tests/','migrations/'];
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(p=>roots.some(root=>p.startsWith(root)));
files.push('package.json','package-lock.json','tsconfig.json','next-env.d.ts','postcss.config.mjs','vercel.json','LICENSE');
const secrets=[process.env.PAYPAL_CLIENT_ID,process.env.PAYPAL_CLIENT_SECRET,process.env.GEMINI_API_KEY].filter((v):v is string=>!!v&&v.length>10);
for(const file of files){if(!existsSync(file))throw new Error('Missing source '+file);const content=readFileSync(file);if(secrets.some(secret=>content.includes(Buffer.from(secret))))throw new Error('Secret found in source '+file);}
const output=resolve('work','deploy-'+Date.now());mkdirSync(output,{recursive:true});
for(const file of files){const target=resolve(output,file);mkdirSync(dirname(target),{recursive:true});copyFileSync(file,target);}
mkdirSync(resolve(output,'.vercel'));copyFileSync('.vercel/project.json',resolve(output,'.vercel/project.json'));
console.log(JSON.stringify({directory:output,files:files.length,project:link.projectName,secretsIncluded:false,note:'Deploy from this folder with explicit --scope pranav-b7db. No env, evidence or database files copied.'}));
