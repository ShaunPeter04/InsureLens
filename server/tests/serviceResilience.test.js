const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const databaseAvailability = require('../middleware/databaseAvailability');
const idempotency = require('../middleware/idempotency');
const {predictRejectionML} = require('../services/rejectionMLService');

const prediction = {primaryModel:'Synthetic test model',primaryPrediction:'Waiting Period',decisionTreePrediction:'Waiting Period',modelAgreement:true,classScores:{'Waiting Period':0.8},highestClassScore:0.8,requiresManualReview:true,reviewReasons:['Human review'],evaluationNote:'Uncalibrated synthetic classifier; not claim eligibility.'};
function response() {const res=new EventEmitter();res.statusCode=200;res.status=c=>{res.statusCode=c;return res;};res.set=()=>res;res.json=b=>{res.body=b;return res;};return res;}
function request(key='11111111-1111-4111-8111-111111111111',user='user-a',body={bill:100}) {return {get:()=>key,user,baseUrl:'/api/claim-cases',path:'/',body};}

test('database disconnect/connecting fails fast and recovery resumes requests',()=>{
  const connection={readyState:0};const gate=databaseAvailability(connection);
  for(const state of [0,2,3]) {connection.readyState=state;const res=response();gate({},res,()=>assert.fail('Unavailable DB must not call routes'));assert.equal(res.statusCode,503);}
  connection.readyState=1;let called=false;gate({},response(),()=>{called=true;});assert.equal(called,true);
});

test('rejection ML validates actual response shape and preserves unavailable/timeout states',async()=>{
  const original={fetch:global.fetch,url:process.env.ML_SERVICE_URL};process.env.ML_SERVICE_URL='http://example.invalid';
  try {
    for(const p of [{},{...prediction,highestClassScore:NaN},{...prediction,classScores:{Waiting:-1}},{...prediction,primaryPrediction:{}},{...prediction,reviewReasons:[{}]}]) {
      global.fetch=async()=>({ok:true,json:async()=>p});assert.equal((await predictRejectionML('Synthetic reason')).available,false);
    }
    global.fetch=async()=>({ok:true,json:async()=>({...prediction,available:false})});
    const valid=await predictRejectionML('Synthetic reason');assert.equal(valid.available,true);assert.equal(valid.highestClassScore,0.8);
    global.fetch=async()=>{throw Object.assign(new Error('Sensitive URL must not escape'),{name:'TimeoutError'});};
    const timeout=await predictRejectionML('Synthetic reason');assert.equal(timeout.available,false);assert.equal(timeout.reason,'timeout');assert.ok(!JSON.stringify(timeout).includes('Sensitive'));
    global.fetch=async()=>({ok:false,status:503});assert.equal((await predictRejectionML('Synthetic reason')).available,false);
  } finally {global.fetch=original.fetch;if(original.url===undefined)delete process.env.ML_SERVICE_URL;else process.env.ML_SERVICE_URL=original.url;}
});

test('lost successful response and concurrent retries share one creation receipt',async()=>{
  const middleware=idempotency();const first=response();let creates=0;
  await middleware(request(),first,()=>{creates++;});
  const second=response();const duplicate=middleware(request(),second,()=>{creates++;});
  first.status(201).json({claimCase:{_id:'saved-id'}});await duplicate;
  assert.equal(creates,1);assert.deepEqual(second.body,first.body);
  const replay=response();await middleware(request(),replay,()=>assert.fail('Lost response retry must reuse saved ID'));
  assert.equal(replay.body.claimCase._id,'saved-id');
});

test('retry receipts isolate owners/payloads; failed requests remain retryable',async()=>{
  const middleware=idempotency();const first=response();await middleware(request(),first,()=>first.status(503).json({message:'Unavailable'}));
  const next=response();let creates=0;await middleware(request(),next,()=>{creates++;next.status(201).json({claimCase:{_id:'id'}});});assert.equal(creates,1);
  const changed=response();await middleware(request(undefined,'user-a',{bill:200}),changed,()=>assert.fail('Reused key with changed payload must fail'));assert.equal(changed.statusCode,409);
  const other=response();await middleware(request(undefined,'user-b'),other,()=>{creates++;other.status(201).json({claimCase:{_id:'other'}});});assert.equal(creates,2);
});

test('frontend handles malformed lists/creation responses and transport failures without blank state',async()=>{
  const module=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/serviceResilience.js')));
  for(const body of [undefined,'<html/>',{}, {userPolicies:{}},{userPolicies:[null]}]) assert.equal(module.validServiceResponse('/api/user-policies','get',body),false);
  assert.equal(module.validServiceResponse('/api/user-policies','get',{userPolicies:[]}),true);
  assert.equal(module.validServiceResponse('/api/claim-cases','post',{}),false);
  assert.equal(module.validServiceResponse('/api/policies/id','get',{policy:{_id:'111111111111111111111111'}}),false);
  assert.match(module.serviceErrorMessage({code:'ECONNABORTED'}),/timed out/);
  assert.match(module.serviceErrorMessage({code:'ERR_NETWORK'}),/input has been kept/);
  const ref={current:null};const first=module.submissionHeaders(ref,{bill:100});assert.deepEqual(module.submissionHeaders(ref,{bill:100}),first);assert.notDeepEqual(module.submissionHeaders(ref,{bill:200}),first);
});


test('uncertain database write is not automatically attempted a second time',async()=>{
  const middleware=idempotency();const req=request();req.writeAttempted=true;
  const first=response();let writes=0;
  await middleware(req,first,()=>{writes++;first.status(500).json({message:'Write acknowledgment failed'});});
  assert.equal(first.statusCode,503);assert.match(first.body.message,/save status could not be confirmed/);
  const replay=response();await middleware(request(),replay,()=>{writes++;});
  assert.equal(writes,1);assert.equal(replay.statusCode,503);
});

test('uncertain PDF persistence keeps its document and returns a safe save-status error',async()=>{
  const fs=require('node:fs/promises'),axios=require('axios'),UserPolicy=require('../models/UserPolicy');
  const original={find:UserPolicy.findOne,create:UserPolicy.create,post:axios.post,url:process.env.ML_SERVICE_URL};
  const folder=await fs.mkdtemp('/tmp/insurelens-resilience-pdf-');const file=path.join(folder,'synthetic.pdf');
  const handler=require('../routes/userPolicies').stack.find(l=>l.route?.path==='/upload').route.stack.at(-1).handle;
  try {
    await fs.writeFile(file,'%PDF-synthetic');
    UserPolicy.findOne=async()=>null;UserPolicy.create=async()=>{throw new Error('Database acknowledgment unavailable');};
    process.env.ML_SERVICE_URL='http://example.invalid';
    axios.post=async()=>({data:{extractionMethod:'PDF Text',pageCount:1,characterCount:200,extractedText:'',extractedPolicyData:{}}});
    const req={user:'111111111111111111111111',body:{selectedCoverage:10000,policyStartDate:'2024-01-01',policyEndDate:'2027-01-01'},file:{path:file,mimetype:'application/pdf',size:14}};
    const res=response();await handler(req,res);assert.equal(res.statusCode,503);assert.match(res.body.message,/save status could not be confirmed/);
    await fs.access(file); // Commit is uncertain: do not delete a possibly saved document.
  } finally {UserPolicy.findOne=original.find;UserPolicy.create=original.create;axios.post=original.post;if(original.url===undefined)delete process.env.ML_SERVICE_URL;else process.env.ML_SERVICE_URL=original.url;await fs.rm(folder,{recursive:true});}
});
