const fs=require('node:fs');
const dotenv=require('dotenv');
const env=dotenv.parse(fs.readFileSync(require('node:path').join(__dirname,'../.env')));
(async()=>{
 for(const [name,url] of [['Express',`http://localhost:${env.PORT||5000}/api/policies`],['Vite',env.CLIENT_URL||'http://localhost:5173'],['FastAPI',env.ML_SERVICE_URL.replace(/\/+$/,'')+'/health']]){
  try{const response=await fetch(url,{signal:AbortSignal.timeout(5000)});console.log(name+': HTTP '+response.status);}catch{console.log(name+': unavailable');process.exitCode=1;}
 }
 try{const schema=await(await fetch(env.ML_SERVICE_URL.replace(/\/+$/,'')+'/openapi.json')).json();console.log('Loaded ML schema includes all insured members: '+Boolean(schema.components.schemas.UserRequirements.properties.insuredMembers));}catch{console.log('ML schema check unavailable');}
 for(const pid of fs.readdirSync('/proc').filter(p=>/^\d+$/.test(p))){
  try{const args=fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0');const cwd=fs.readlinkSync(`/proc/${pid}/cwd`);if(!cwd.startsWith(require('node:path').resolve(__dirname,'../..')))continue;
   const binary=require('node:path').basename(args[0]||'');
   if((binary==='node'&&args.some(a=>a==='server.js'||a.endsWith('/nodemon.js')))||args.some(a=>a==='uvicorn'||a.endsWith('/uvicorn'))){console.log(JSON.stringify({pid:Number(pid),binary,cwd,reload:args.includes('--reload')}));}
  }catch{}
 }
})();
