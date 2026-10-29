import { readFileSync } from 'node:fs';
const config=JSON.parse(readFileSync('work/dev-config.json','utf8'));
process.env.DATABASE_URL=`postgresql://mandate:${config.password}@127.0.0.1:55440/mandate`;
await import('./migrate');
