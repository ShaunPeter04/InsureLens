const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const dotenv = require('dotenv');
const databaseAvailability = require('../middleware/databaseAvailability');
let shadow, upstream, failedConnection, environment, state, browserFault;
let shadowURL, deadURL;
const listen = server => new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
const close = async server => {if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
function setMode(mode, realML) {state.mode=mode;process.env.ML_SERVICE_URL=mode==='unavailable'?deadURL:mode==='healthy'?realML:state.upstreamURL;}

async function run({accounts,check,expect,status,api,mongoose,ml,run}) {
  environment={ml:process.env.ML_SERVICE_URL,jwt:process.env.JWT_SECRET};
  const config=dotenv.parse(fs.readFileSync(path.join(__dirname,'../.env')));
  process.env.JWT_SECRET=config.JWT_SECRET;
  state={mode:'healthy',realML:ml};
  const reserve=http.createServer();deadURL=await listen(reserve);await close(reserve);
  upstream=http.createServer(async(req,res)=>{
    if(state.mode==='timeout')return; // Only this audit's disposable service stalls.
    res.setHeader('Content-Type','application/json');
    res.end(state.mode==='invalid_json'?'not-json':JSON.stringify({unexpected:'upstream schema'}));
  });
  state.upstreamURL=await listen(upstream);
  const app=express();app.use(express.json());
  state.connection=mongoose.connection;
  app.use(databaseAvailability({get readyState(){return state.connection.readyState;}}));
  for(const name of ['recommendations','claimCases','rejectionCases'])app.use('/api/'+({claimCases:'claim-cases',rejectionCases:'rejection-cases'}[name]||name),require('../routes/'+name));
  app.use('/api/policies',require('../routes/policies'));
  shadow=http.createServer(app);shadowURL=await listen(shadow);
  const [a]=accounts;state.account=a;
  const test=(name,fn)=>check('regression',name,fn);
  const requirements={requiredCoverage:500000,coverageType:'Individual',annualPremiumBudget:20000,maxCoPaymentPercentage:20,roomRentPreference:'No Restriction',smoker:false,alcoholConsumer:false,highRiskOccupation:false,preExistingDiseases:[],includeSelf:true,selectedFamilyMembers:[]};
  await test('Isolated Express: FastAPI unavailable recommendations return 503',async()=>{
    setMode('unavailable',ml);await status('POST','/api/recommendations',requirements,a.token,503,shadowURL);
  });
  await test('Isolated Express: Claimability remains available without FastAPI',async()=>{
    const result=await status('GET',`/api/claim-cases/${a.claim._id}/analyze`,undefined,a.token,200,shadowURL);
    expect(Number.isFinite(result.claimabilityScore)&&result.requiresManualReview,'Rule analysis failed or guaranteed eligibility');
  });
  await test('Isolated Express: rejection rules survive unavailable ML',async()=>{
    const result=await status('GET',`/api/rejection-cases/${a.rejection._id}/analyze`,undefined,a.token,200,shadowURL);
    expect(result.mlPrediction.available===false&&result.analysis.requiresManualReview,'ML absence was marked successful or rule analysis lost');
  });
  for(const mode of ['malformed','invalid_json'])await test('Isolated Express: upstream '+mode+' is rejected without predictions',async()=>{
    setMode(mode,ml);await status('POST','/api/recommendations',requirements,a.token,502,shadowURL);
    const result=await status('GET',`/api/rejection-cases/${a.rejection._id}/analyze`,undefined,a.token,200,shadowURL);
    expect(result.mlPrediction.available===false,'Malformed ML response was marked available');
  });
  await test('Isolated Express: recommendation timeout returns 504',async()=>{
    setMode('timeout',ml);await status('POST','/api/recommendations',requirements,a.token,504,shadowURL);
  });
  await test('Isolated Express: rejection timeout preserves rules and identifies timeout',async()=>{
    const result=await status('GET',`/api/rejection-cases/${a.rejection._id}/analyze`,undefined,a.token,200,shadowURL);
    expect(result.mlPrediction.available===false&&result.mlPrediction.reason==='timeout','Timeout was not distinguished');
  });
  await test('Isolated MongoDB connection failure returns fast 503 and recovers',async()=>{
    const address=new URL(deadURL);
    failedConnection=mongoose.createConnection(`mongodb://127.0.0.1:${address.port}/synthetic_resilience_unavailable`,{serverSelectionTimeoutMS:200,bufferCommands:false,autoIndex:false,autoCreate:false});
    await failedConnection.asPromise().catch(()=>{});expect(failedConnection.readyState===0,'Failed MongoDB connection was not disconnected');
    state.connection=failedConnection;
    const start=Date.now();await status('GET','/api/policies',undefined,undefined,503,shadowURL);expect(Date.now()-start<1000,'Disconnected database request buffered');
    state.connection=mongoose.connection;await status('GET','/api/policies',undefined,undefined,200,shadowURL);
  });
  await test('Isolated Express recovery returns actual ML predictions',async()=>{
    setMode('healthy',ml);const recommendations=await status('POST','/api/recommendations',requirements,a.token,200,shadowURL);expect(recommendations.recommendations.length>0,'Recommendation recovery returned empty/unavailable');
    const rejection=await status('GET',`/api/rejection-cases/${a.rejection._id}/analyze`,undefined,a.token,200,shadowURL);expect(rejection.mlPrediction.available===true,'Real prediction recovery failed');
  });
  await test('Actual case creation replays a lost-response retry without duplicate records',async()=>{
    const key=crypto.randomUUID();const body={userPolicy:a.saved._id,patientType:'Self',hospitalName:'Synthetic Resilience API '+run,hospitalizationType:'Inpatient',admissionDate:'2024-06-01',admissionTime:'10:00',dischargeDate:'2024-06-03',dischargeTime:'12:00',diagnosis:'Synthetic Fever',roomType:'Single Private AC',totalBillAmount:10000,roomRentPerDay:1000,nonPayableExpenses:[]};
    const send=()=>fetch(shadowURL+'/api/claim-cases',{method:'POST',headers:{Authorization:'Bearer '+a.token,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
    const first=await send();expect(first.status===201,'Initial creation failed');await first.text(); // Treat returned identity as lost.
    const retry=await send();expect(retry.status===201,'Replay did not recover');
    expect(await mongoose.connection.collection('claimcases').countDocuments({user:new mongoose.Types.ObjectId(a.user.id),hospitalName:body.hospitalName})===1,'A retry created duplicate records');
  });
  // Keep shadow services alive only for this audit browser's controlled requests.
  state.realML=ml;
  if(environment.ml===undefined)delete process.env.ML_SERVICE_URL;else process.env.ML_SERVICE_URL=environment.ml;
}

async function browser({accounts,check,expect,go,waitFor,setFields,submit,evaluate,cdp,onCdp,expectHttpFailure,requests,mongoose,run}) {
  const a=accounts[0];
  onCdp('Fetch.requestPaused',async params=>{
    const route=new URL(params.request.url).pathname;
    const responseStage=params.responseStatusCode!==undefined;
    const match=browserFault && browserFault.match(route,params.request.method,responseStage);
    if(!match)return cdp('Fetch.continueRequest',{requestId:params.requestId});
    if(browserFault.mode==='timeout')return; // Axios aborts after its real configured timeout.
    if(params.networkId)expectHttpFailure(params.networkId);
    let code=browserFault.mode==='malformed'?200:503;
    let body=browserFault.mode==='malformed'?{userPolicies:{}}:{message:'Synthetic controlled service outage. Please retry.'};
    if(browserFault.mode==='partial') {
      setMode('unavailable',state.realML);
      const res=await fetch(shadowURL+route,{headers:{Authorization:'Bearer '+a.token}});code=res.status;body=await res.json();
    }
    await cdp('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:code,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
  });
  await cdp('Fetch.enable',{patterns:[{urlPattern:'*/api/*',requestStage:'Request'},{urlPattern:'*/api/claim-cases',requestStage:'Response'}]});
  const test=(name,fn)=>check('browser',name,fn);
  try {
    await test('Controlled browser recommendation outage preserves inputs and retry works',async()=>{
      await go('/recommendations');await waitFor(`!!document.querySelector('.recommendation-form')`);await setFields({requiredCoverage:'500000',budget:'20000'});
      browserFault={mode:'failure',match:(route,method)=>route==='/api/recommendations'&&method==='POST'};
      const before=requests.filter(r=>r.path==='/api/recommendations'&&r.method==='POST').length;
      await evaluate(`(()=>{const f=document.querySelector('.recommendation-form');f.requestSubmit();f.requestSubmit();})()`);
      await waitFor(`document.querySelector('#root').textContent.includes('Synthetic controlled service outage')`);
      expect(await evaluate(`document.querySelector('[name="requiredCoverage"]').value==='500000'&&!document.querySelector('.recommendation-form button[type="submit"]').disabled`),'Inputs lost or button remained loading');
      expect(requests.filter(r=>r.path==='/api/recommendations'&&r.method==='POST').length===before+1,'Double click sent two submissions');
      browserFault=null;await submit('.recommendation-form');await waitFor(`document.querySelectorAll('.recommendation-card').length>0`);
    });
    await test('Controlled browser real request timeout releases loading and preserves form',async()=>{
      browserFault={mode:'timeout',match:(route,method)=>route==='/api/recommendations'&&method==='POST'};
      await submit('.recommendation-form');await waitFor(`document.querySelector('#root').textContent.includes('request timed out')`,30000);
      expect(await evaluate(`document.querySelector('[name="requiredCoverage"]').value==='500000'&&!document.querySelector('.recommendation-form button[type="submit"]').disabled`),'Timeout lost input or kept loading');
      browserFault=null;await cdp('Fetch.disable');await cdp('Fetch.enable',{patterns:[{urlPattern:'*/api/*',requestStage:'Request'},{urlPattern:'*/api/claim-cases',requestStage:'Response'}]});
    });
    await test('Controlled browser malformed saved-policy response shows error without crash',async()=>{
      browserFault={mode:'malformed',match:(route,method)=>route==='/api/user-policies'&&method==='GET'};
      await go('/my-policies');await waitFor(`document.querySelector('#root').textContent.includes('incomplete information')`);
      browserFault=null;
    });
    await test('Controlled browser lost creation response and failed analysis recover one hospitalization',async()=>{
      await go('/claimability');await waitFor(`[...(document.querySelector('select[name="userPolicy"]')?.options||[])].some(o=>o.value===${JSON.stringify(a.saved._id)})`);
      const name='Synthetic Browser Resilience '+run;
      await setFields({userPolicy:a.saved._id,hospitalName:name,admissionDate:'2024-06-01',admissionTime:'10:00',dischargeDate:'2024-06-03',dischargeTime:'12:00',diagnosis:'Synthetic Fever',totalBillAmount:'10000',roomRentPerDay:'1000'});
      browserFault={mode:'failure',match:(route,method,response)=>route==='/api/claim-cases'&&method==='POST'&&response};
      await submit('.claimability-form');await waitFor(`!!document.querySelector('.claimability-error')`);
      expect(await mongoose.connection.collection('claimcases').countDocuments({user:new mongoose.Types.ObjectId(a.user.id),hospitalName:name})===1,'Lost-response creation did not commit exactly once');
      browserFault={mode:'failure',match:route=>/^\/api\/claim-cases\/[^/]+\/analyze$/.test(route)};
      await submit('.claimability-form');await waitFor(`!!document.querySelector('.claimability-error')`);
      browserFault=null;await submit('.claimability-form');await waitFor(`!!document.querySelector('.financial-summary')`);
      expect(await mongoose.connection.collection('claimcases').countDocuments({user:new mongoose.Types.ObjectId(a.user.id),hospitalName:name})===1,'Failure retry duplicated hospitalization');
      expect(await evaluate(`document.querySelector('[name="hospitalName"]').value===${JSON.stringify(name)}`),'Form was reset after failure');
    });
    await test('Controlled browser distinguishes unavailable ML from rules and retries existing rejection',async()=>{
      await go('/rejection-analysis');await waitFor(`[...(document.querySelector('select[name="userPolicy"]')?.options||[])].some(o=>o.value===${JSON.stringify(a.saved._id)})`);await setFields({userPolicy:a.saved._id});
      await waitFor(`[...(document.querySelector('select[name="claimCase"]')?.options||[])].some(o=>o.value===${JSON.stringify(a.claim._id)})`);
      const reason='Synthetic Resilience Waiting Period '+run;
      await setFields({claimCase:a.claim._id,rejectionReason:reason,rejectedAmount:'1000',rejectionDate:'2024-06-04'});
      browserFault={mode:'partial',match:route=>/^\/api\/rejection-cases\/[^/]+\/analyze$/.test(route)};
      await submit('.rejection-form');await waitFor(`document.querySelector('#root').textContent.includes('ML predictions are unavailable')`);
      expect(await evaluate(`document.querySelector('#root').textContent.includes('rule-based analysis remains available')`),'Rules/ML states not distinguished');
      browserFault=null;await submit('.rejection-form');await waitFor(`document.querySelector('#root').textContent.includes('Rejection case created and analyzed successfully.')`);
      expect(await mongoose.connection.collection('rejectioncases').countDocuments({user:new mongoose.Types.ObjectId(a.user.id),rejectionReason:reason})===1,'Prediction retry created duplicate rejection');
    });
  } finally {browserFault=null;await cdp('Fetch.disable');}
}

async function cleanup() {
  await close(shadow);await close(upstream);if(failedConnection)await failedConnection.close();
  if(environment)for(const [key,value] of [['ML_SERVICE_URL',environment.ml],['JWT_SECRET',environment.jwt]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
module.exports={run,browser,cleanup};
