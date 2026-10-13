// Explicitly invoked live audit. Uses synthetic accounts; never prints credentials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const root = path.resolve(__dirname, '../..');
const config = { ...dotenv.parse(fs.readFileSync(path.join(root, 'server/.env'))), ...process.env };
const frontend = config.CLIENT_URL || 'http://localhost:5173';
const backend = `http://localhost:${config.PORT || 5000}`;
const ml = config.ML_SERVICE_URL?.replace(/\/+$/, '');
const pdfAudit = process.argv.includes('--pdf');
const resilienceAudit = process.argv.includes('--resilience');
const regression = resilienceAudit ? require('./serviceResilienceCases') : pdfAudit ? require('./pdfHardeningCases') : process.argv.includes('--regression') ? require('./targetedRegressionCases') : null;
const run = `${regression ? 'regression' : 'integration'}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
const reportPath = process.env.INTEGRATION_RESULT_PATH || (resilienceAudit ? '/tmp/insurelens-service-resilience-results.json' : pdfAudit ? '/tmp/insurelens-pdf-hardening-results.json' : regression ? '/tmp/insurelens-regression-results.json' : '/tmp/insurelens-integration-results.json');
const password = crypto.randomBytes(18).toString('base64url') + 'Aa1!';
const emails = [`${run}-a@example.invalid`, `${run}-b@example.invalid`, `${run}-c@example.invalid`];
const results = { run, startedAt: new Date().toISOString(), services: [], api: [], regression: [], browser: [], cleanup: [], filesChanged: [], database: {} };
const accounts = [];
let chrome;
let chromeDir;
let namespaceVerified = false;
let dbConnected = false;
const evidence = () => fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), { mode: 0o600 });
async function check(section, name, fn) {
  try { const detail = await fn(); results[section].push({ name, status: 'PASSED', ...(detail ? { detail } : {}) }); }
  catch (error) { results[section].push({ name, status: 'FAILED', detail: error.auditDetail || (error.name === 'AssertionError' ? 'Expected status or response assertion did not match' : 'Request or runtime operation failed') }); }
  evidence();
  const item = results[section].at(-1);
  console.log(`${item.status}: ${name}${item.detail ? ' — ' + item.detail : ''}`);
}
function expect(condition, detail) { if (!condition) { const error = new Error('Audit assertion'); error.auditDetail = detail; throw error; } }
async function api(method, route, body, token, origin = frontend) {
  const response = await fetch(`${origin}${route}`, { method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = null; }
  return { status: response.status, data, html: text.startsWith('<!doctype html>') || text.includes('id="root"') };
}
async function status(method, route, body, token, expected, origin) {
  const res = await api(method, route, body, token, origin);
  expect(res.status === expected, `Expected HTTP ${expected}; received ${res.status}`);
  return res.data;
}
async function unusedMobile() {
  for (let i = 0; i < 20; i++) {
    const value = '9' + crypto.randomInt(100000000, 999999999);
    if (!await mongoose.connection.collection('users').findOne({ mobile: value }, { projection: { _id: 1 } })) return value;
  }
  throw new Error('No isolated phone number found');
}
async function cleanup() {
  if (!namespaceVerified) { results.cleanup.push({ status: "NOT TESTED", name: "Synthetic cleanup", detail: "Synthetic namespace was not confirmed empty before writes; no cleanup attempted" }); return; }
  if (!dbConnected) { results.cleanup.push({ status: 'BLOCKED', name: 'Synthetic data cleanup', detail: 'MongoDB connection was unavailable' }); return; }
  if (pdfAudit || resilienceAudit) await regression.cleanup({mongoose, accounts, run, expect, results});
  // Accounts were absent before any write and can be deleted only by verified IDs/emails.
  const users = await mongoose.connection.collection('users').find({ email: { $in: emails } }, { projection: { _id: 1, email: 1 } }).toArray();
  for (const user of users) {
    expect(emails.includes(user.email) && user.email.startsWith(run + '-'), 'Synthetic user identity verification failed');
    const userId = user._id;
    for (const collection of ['rejectioncases', 'claimcases', 'userpolicies']) {
      const rows = await mongoose.connection.collection(collection).find({ user: userId }, { projection: { _id: 1, user: 1 } }).toArray();
      for (const row of rows) expect(String(row.user) === String(userId), 'Synthetic record owner verification failed');
      const ids = rows.map(row => row._id);
      if (ids.length) {
        const removed = await mongoose.connection.collection(collection).deleteMany({ _id: { $in: ids }, user: userId });
        expect(removed.deletedCount === ids.length, 'Synthetic related-record cleanup count mismatch');
      }
      results.cleanup.push({ name: collection, status: 'PASSED', detail: `Removed ${ids.length} verified synthetic records` });
    }
    const removed = await mongoose.connection.collection('users').deleteOne({ _id: userId, email: user.email });
    expect(removed.deletedCount === 1, 'Synthetic user cleanup count mismatch');
  }
  expect(await mongoose.connection.collection('users').countDocuments({ email: { $in: emails } }) === 0, 'Synthetic accounts remain');
  results.cleanup.push({ name: 'Synthetic accounts', status: 'PASSED', detail: `Removed ${users.length} verified synthetic accounts` });
}

// Minimal Chrome DevTools client: no additional dependencies or browser packages.
async function browserAudit() {
  chromeDir = fs.mkdtempSync('/tmp/insurelens-chrome-');
  chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
  const portFile = path.join(chromeDir, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await new Promise(resolve => setTimeout(resolve, 100));
  if (!fs.existsSync(portFile)) {
    for (const name of ['Registration','Login','Dashboard','Profile','Policies','Recommendations','My Policies','Claimability','Rejection Analysis']) results.browser.push({ name, status: 'BLOCKED', detail: 'Headless Chrome did not expose its debugging interface' });
    return;
  }
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  const handlers = new Map(); const expectedHttpFailures = new Set();
  let serial = 0; const pending = new Map(); const errors = []; const failedRequests = []; const httpFailures = []; const requests = [];
  ws.addEventListener('message', event => {
    const value = JSON.parse(event.data);
    if (value.id) { const waiting = pending.get(value.id); if (waiting) { pending.delete(value.id); value.error ? waiting.reject(new Error('DevTools command failed')) : waiting.resolve(value.result); } }
    else if (value.method === 'Network.requestWillBeSent') requests.push({ method:value.params.request.method, path:new URL(value.params.request.url).pathname });
    else if (value.method === 'Network.responseReceived' && value.params.response.status >= 400) {if(!expectedHttpFailures.has(value.params.requestId)) httpFailures.push(value.params.response.status);}
    else if (value.method === 'Runtime.exceptionThrown') errors.push(value.params.exceptionDetails.text);
    else if (value.method === 'Network.loadingFailed' && !value.params.canceled) failedRequests.push(value.params.errorText);
    if (handlers.has(value.method)) Promise.resolve(handlers.get(value.method)(value.params)).catch(()=>errors.push('Audit interception failed'));
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timed out')); }, 30000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  const evaluate = async expression => {
    const res = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error('Browser evaluation failed');
    return res.result?.value;
  };
  const waitFor = async (expression, timeoutMS = 20000) => {
    for (let i = 0; i < Math.ceil(timeoutMS/100); i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    const e = new Error('Browser condition timed out'); e.auditDetail = 'Browser did not reach its expected UI state within 20 seconds'; throw e;
  };
  const go = async route => { await cdp('Page.navigate', { url: frontend + route }); await waitFor(`document.readyState === 'complete' && document.querySelector('#root')?.textContent.length > 0`); };
  const setFields = async values => evaluate(`(() => {
    const values = ${JSON.stringify(values)};
    for (const [name,value] of Object.entries(values)) {
      const el = document.querySelector('[name="'+name+'"]') || document.getElementById(name);
      if (!el) throw new Error('Missing form field');
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles:true }));
    }
    return true;
  })()`);
  const clickText = async text => evaluate(`(() => { const button=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(text)}); if(!button) throw new Error('Missing button'); button.click(); return true; })()`);
  const submit = async selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);
  await check('browser', 'Registration invalid input', async () => {
    await go('/register'); await submit('form'); await waitFor(`!!document.querySelector('.auth-error') || /required|Please fill|Please select/i.test(document.querySelector('#root').textContent)`);
  });
  await check('browser', 'Registration valid input and automatic Dashboard navigation', async () => {
    await go('/register');
    const { agreeToTerms, ...browserBody } = accounts[0].body;
    await setFields({ ...browserBody, email:emails[2], mobile:await unusedMobile(), confirmPassword:password });
    await evaluate(`document.querySelector('input[name="agreeToTerms"]').click()`);
    await submit('form');
    await waitFor(`location.pathname === '/dashboard' && document.querySelector('.dashboard-welcome')?.textContent.includes('Integration')`);
    await clickText('Logout'); await waitFor(`location.pathname === '/login' && !!document.querySelector('.auth-form')`);
  });
  await check('browser', 'Unauthenticated protected navigation', async () => {
    await go('/profile'); await waitFor(`location.pathname === '/login' && !!document.querySelector('.auth-form')`);
  });
  await check('browser', 'Login and Dashboard', async () => {
    await go('/login'); await setFields({ email: emails[0], password }); await submit('form');
    await waitFor(`location.pathname === '/dashboard' && document.querySelector('.dashboard-welcome')?.textContent.includes('Integration')`);
    expect((await evaluate(`document.querySelector('#root').textContent`)).includes('Integration'), 'Dashboard did not show synthetic account');
  });
  await check('browser', 'Profile view and edit', async () => {
    await go('/profile'); await waitFor(`document.querySelector('#root').textContent.includes('My Profile')`); await clickText('Edit Profile');
    await setFields({ city: 'Synthetic City', annualIncome: '0' }); await submit('.profile-form');
    await waitFor(`!document.querySelector('.profile-form') && document.querySelector('#root').textContent.includes('Synthetic City')`);
  });
  await check('browser', 'Policies navigation and detail', async () => {
    await go('/policies'); await waitFor(`document.querySelectorAll('.policy-card').length > 0`);
    await clickText('View Details'); await waitFor(`location.pathname.startsWith('/policies/') && !!document.querySelector('.policy-details-page')`);
  });
  await check('browser', 'Recommendations results', async () => {
    await go('/recommendations'); await setFields({ requiredCoverage:'500000' }); await submit('.recommendation-form');
    await waitFor(`!!document.querySelector('.recommendation-card') || !!document.querySelector('.recommendation-error')`);
    expect(await evaluate(`document.querySelectorAll('.recommendation-card').length > 0`), 'Recommendation results were not displayed');
  });
  await check('browser', 'My Policies saved result', async () => {
    await go('/my-policies'); await waitFor(`document.querySelector('#root').textContent.includes(${JSON.stringify(run+'-policy')})`);
  });
  await check('browser', 'Claimability create and analyze', async () => {
    await go('/claimability'); await waitFor(`!!document.querySelector('.claimability-form')`);
    await setFields({ hospitalName:'Synthetic Audit Hospital', admissionDate:'2024-06-01', admissionTime:'10:00', dischargeDate:'2024-06-03', dischargeTime:'12:00', diagnosis:'Synthetic fever', totalBillAmount:'10000', roomRentPerDay:'1000' });
    const before = requests.filter(item => item.method==='POST' && item.path==='/api/claim-cases').length;
    await evaluate(`(() => { const form=document.querySelector('.claimability-form'); form.requestSubmit(); form.requestSubmit(); })()`); await waitFor(`!!document.querySelector('.financial-summary') || !!document.querySelector('.claimability-error')`);
    expect(await evaluate(`!!document.querySelector('.financial-summary')`), 'Claimability results were not displayed');
    expect(requests.filter(item => item.method==='POST' && item.path==='/api/claim-cases').length===before+1, 'Double submit created multiple hospitalization requests');
  });
  await check('browser', 'Rejection Analysis with ML result', async () => {
    await go('/rejection-analysis'); await waitFor(`!!document.querySelector('select[name="userPolicy"]')`);
    await waitFor(`[...document.querySelector('select[name="userPolicy"]').options].some(option=>option.value===${JSON.stringify(accounts[0].saved._id)})`);
    await setFields({ userPolicy: accounts[0].saved._id });
    await waitFor(`[...document.querySelector('select[name="claimCase"]').options].some(option=>option.value===${JSON.stringify(accounts[0].claim._id)})`);
    await setFields({ claimCase: accounts[0].claim._id, rejectionReason:'The insurer rejected this claim because the initial waiting period was not completed.', rejectedAmount:'1000', rejectionDate:'2024-06-04' });
    await submit('form'); await waitFor(`document.querySelector('#root').textContent.includes('Rejection case created and analyzed successfully.') || !!document.querySelector('.rejection-error')`);
    expect(await evaluate(`document.querySelector('#root').textContent.includes('Rejection case created and analyzed successfully.')`), 'Rejection results were not displayed');
    expect(await evaluate(`document.querySelector('#root').textContent.includes('Logistic Regression Prediction') && document.querySelector('#root').textContent.includes('Decision Tree Prediction')`), 'Live ML model predictions were not displayed');
  });
  await check('browser', 'Navigation links and completed loading states', async () => {
    const routes = [['Dashboard','/dashboard','.dashboard-welcome'],['Profile','/profile','.profile-card'],['Policies','/policies','.policy-card'],['Recommendations','/recommendations','.recommendation-form'],['My Policies','/my-policies','.my-policies-page'],['Claimability','/claimability','.claimability-form'],['Rejection Analysis','/rejection-analysis','.rejection-form']];
    for (const [label,route,selector] of routes) {
      await evaluate(`(() => { const link=[...document.querySelectorAll('nav a')].find(a=>a.textContent.trim()===${JSON.stringify(label)}); if(!link) throw new Error('Missing navigation link'); link.click(); })()`);
      await waitFor(`location.pathname===${JSON.stringify(route)} && !!document.querySelector(${JSON.stringify(selector)})`);
    }
  });
  if (regression) await regression.browser({ accounts, check, expect, evaluate, cdp, waitFor, go, setFields, submit, clickText, requests, mongoose, run, onCdp:(method,handler)=>handlers.set(method,handler), expectHttpFailure:id=>expectedHttpFailures.add(id) });
  results.browser.push({ name:'Unexpected HTTP errors', status:httpFailures.length?'FAILED':'PASSED', detail:`${httpFailures.length} browser HTTP responses with status 400 or greater` });
  results.browser.push({ name:'Uncaught JavaScript errors', status:errors.length?'FAILED':'PASSED', detail:`${errors.length} uncaught runtime exceptions` });
  results.browser.push({ name:'Failed network requests', status:failedRequests.length?'FAILED':'PASSED', detail:`${failedRequests.length} uncanceled transport failures` });
  ws.close();
}

async function main() {
  mongoose.set('autoIndex', false); mongoose.set('autoCreate', false);
  await check('services', 'MongoDB connection and ping', async () => {
    await mongoose.connect(config.MONGO_URI, { serverSelectionTimeoutMS: 5000, autoIndex:false, autoCreate:false });
    dbConnected = true; await mongoose.connection.db.command({ ping:1 });
    expect(await mongoose.connection.collection('users').countDocuments({ email:{ $in:emails } }) === 0, 'Synthetic namespace already exists');
    namespaceVerified = true;
    results.database.connected = true;
    const indexes = await mongoose.connection.collection('userpolicies').listIndexes().toArray();
    results.database.savedPolicyUniqueIndexPresent = indexes.some(index => index.unique && index.key.user === 1 && index.key.policyNumber === 1);
    return 'Connected; read-only ping succeeded; automatic index creation disabled';
  });
  if (!dbConnected) { results.api.push({ name:'Database-dependent workflows',status:'BLOCKED',detail:'MongoDB unavailable' }); return; }
  await check('services', 'Required configuration present', async () => {
    expect(['MONGO_URI','JWT_SECRET','ML_SERVICE_URL'].every(name => typeof config[name]==='string' && config[name].trim()), 'Required configuration is missing');
    expect(new URL(frontend).port==='5173' && String(config.PORT||5000)==='5000' && new URL(ml).port==='8000', 'Configured service ports differ from the expected project configuration');
    return 'Required values present; secrets not recorded; configured ports match the existing Vite proxy';
  });
  await check('services', 'Frontend-to-backend CORS preflight', async () => {
    const res=await fetch(backend+'/api/auth/profile',{method:'OPTIONS',headers:{Origin:frontend,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type'},signal:AbortSignal.timeout(5000)});
    expect(res.status===204 && res.headers.get('access-control-allow-origin')===frontend, 'CORS preflight rejected the configured frontend');
  });
  await check('services', 'Express availability', async () => { await status('GET','/api/policies',undefined,undefined,200,backend); });
  await check('services', 'Vite frontend and API proxy', async () => { const res=await api('GET','/',undefined,undefined); expect(res.status===200&&res.html,'Frontend HTML unavailable'); await status('GET','/api/policies',undefined,undefined,200); });
  await check('services', 'FastAPI health', async () => { const res=await fetch(ml+'/health',{signal:AbortSignal.timeout(5000)}); expect(res.status===200,'ML health check failed'); expect((await res.json()).status==='ok','ML unhealthy'); });
  const catalog = await status('GET','/api/policies',undefined,undefined,200);
  const { validatePolicyTerms } = require('../utils/analysisValidation');
  const product = catalog.policies.find(p=>p.isActiveCatalogPlan && p.coverageAmounts.includes(500000)&&!validatePolicyTerms(p));
  expect(product,'No suitable existing catalog policy for synthetic workflow');
  results.database.catalogPolicyCount=catalog.policies.length;
  const catalogHash=crypto.createHash('sha256').update(JSON.stringify(catalog.policies)).digest('hex');
  for (let i=0;i<2;i++) {
    const body={ firstname:'Integration', lastname:'Synthetic', email:emails[i], mobile:await unusedMobile(), password, dateOfBirth:'1990-01-01', gender:'other', address:'Synthetic Audit Address', city:'Pune', state:'Maharashtra', pincode:'411001', occupation:'Synthetic Tester', annualIncome:0, agreeToTerms:true };
    await check('api',`Registration synthetic account ${i+1}`,async()=>{ const registered=await status('POST','/api/auth/register',body,undefined,201); expect(registered.user.id && registered.token && !registered.user.passwordHash,'Registration response contract invalid'); accounts[i]={body,user:registered.user,token:registered.token}; });
    if (!accounts[i]) throw new Error('Required synthetic registration failed');
  }
  const a=accounts[0],b=accounts[1];
  await check('api','Duplicate normalized email rejected',async()=>{await status('POST','/api/auth/register',{...a.body,email:' '+a.body.email.toUpperCase()+' '},undefined,400);});
  await check('api','Invalid registration body rejected',async()=>{await status('POST','/api/auth/register',{...a.body,annualIncome:true},undefined,400);});
  await check('api','Login valid credentials',async()=>{const res=await status('POST','/api/auth/login',{email:a.body.email,password},undefined,200);expect(res.user.id===String(a.user.id),'Login user mismatch');a.token=res.token;});
  await check('api','Login wrong password rejected',async()=>{await status('POST','/api/auth/login',{email:a.body.email,password:crypto.randomBytes(12).toString('hex')},undefined,400);});
  await check('api','Login malformed fields rejected',async()=>{await status('POST','/api/auth/login',{email:{},password:[]},undefined,400);});
  await check('api','Protected route without token denied',async()=>{await status('GET','/api/protected',undefined,undefined,401);});
  await check('api','Protected route invalid token denied',async()=>{await status('GET','/api/protected',undefined,'invalid-synthetic-token',401);});
  await check('api','Protected route valid token',async()=>{const res=await status('GET','/api/protected',undefined,a.token,200);expect(res.userId===String(a.user.id),'Protected identity mismatch');});
  await check('api','Profile retrieval excludes credentials',async()=>{const res=await status('GET','/api/auth/profile',undefined,a.token,200);expect(!res.user.passwordHash&&res.user.email===a.body.email,'Profile credential leak or identity mismatch');});
  await check('api','Profile valid update preserves zero income',async()=>{const res=await status('PUT','/api/auth/profile',{city:'Synthetic City',annualIncome:0},a.token,200);expect(res.user.annualIncome===0&&res.user.city==='Synthetic City','Profile update mismatch');});
  for(const [name,body] of [['Whitespace',{firstname:' '}],['Impossible date',{dateOfBirth:'2024-02-30'}],['Negative amount',{annualIncome:-1}],['Invalid amount type',{annualIncome:[]}],['Invalid gender',{gender:'unsupported'}],['Duplicate mobile',{mobile:b.body.mobile}]]) await check('api',`Profile invalid update: ${name}`,async()=>{await status('PUT','/api/auth/profile',body,a.token,400);});
  await check('api','Profile ignores credential and owner changes',async()=>{await status('PUT','/api/auth/profile',{city:'Synthetic City',email:b.body.email,password:'ignored',user:b.user.id},a.token,200);const res=await status('GET','/api/auth/profile',undefined,a.token,200);expect(res.user.email===a.body.email,'Read-only email was changed');});
  await check('api','Catalog policy details',async()=>{await status('GET',`/api/policies/${product._id}`,undefined,undefined,200);});
  await check('api','Catalog invalid ObjectId rejected',async()=>{await status('GET','/api/policies/not-an-id',undefined,undefined,400);});
  const savedBody={policyId:product._id,selectedCoverage:500000,policyNumber:run+'-policy',policyStartDate:'2023-01-01',policyEndDate:'2027-01-01'};
  await check('api','Save valid catalog policy',async()=>{a.saved=(await status('POST','/api/user-policies',savedBody,a.token,201)).userPolicy;expect(a.saved._id,'Saved policy ID missing');});
  expect(a.saved,'Required saved policy creation failed');
  await check('api','Duplicate saved policy rejected',async()=>{await status('POST','/api/user-policies',savedBody,a.token,400);});
  for(const [name,body] of [['Invalid ID',{policyId:'bad'}],['Invalid coverage type',{selectedCoverage:true}],['Negative coverage',{selectedCoverage:-1}],['Impossible date',{policyStartDate:'2024-02-30'}],['Reversed dates',{policyEndDate:'2022-01-01'}]]) await check('api',`Save invalid policy: ${name}`,async()=>{await status('POST','/api/user-policies',{...savedBody,...body},a.token,400);});
  await check('api','Saved policies owned listing',async()=>{const res=await status('GET','/api/user-policies',undefined,a.token,200);expect(res.userPolicies.some(p=>p._id===a.saved._id),'Saved policy missing');});
  await check('api','Other account cannot list first user policies',async()=>{const res=await status('GET','/api/user-policies',undefined,b.token,200);expect(!res.userPolicies.some(p=>p._id===a.saved._id),'Foreign policy leaked');});
  const requirements={requiredCoverage:500000,coverageType:'Individual',budget:20000,preExistingDiseases:[],isSmokerOrTobaccoUser:false,alcoholConsumption:'Never',hasHighRiskOccupation:false,coPaymentPreference:0,roomRentPreference:'No Restriction'};
  await check('api','Recommendations through Express to actual FastAPI',async()=>{const res=await status('POST','/api/recommendations',requirements,a.token,200);expect(Array.isArray(res.recommendations)&&res.recommendations.length>0,'No recommendations for valid synthetic profile');return `Received ${res.recommendations.length} ranked recommendations`;});
  for(const [name,body] of [['Negative coverage',{requiredCoverage:-1}],['NaN text',{requiredCoverage:'NaN'}],['Invalid budget',{budget:-1}],['Invalid percentage',{coPaymentPreference:101}],['Malformed diseases',{preExistingDiseases:[{}]}],['Invalid lifestyle type',{isSmokerOrTobaccoUser:'false'}]]) await check('api',`Recommendations invalid input: ${name}`,async()=>{await status('POST','/api/recommendations',{...requirements,...body},a.token,400);});
  await check('api','Recommendations empty results handled',async()=>{const res=await status('POST','/api/recommendations',{...requirements,requiredCoverage:1e12},a.token,200);expect(Array.isArray(res.recommendations)&&res.recommendations.length===0,'Empty-result contract invalid');});
  await check('api','FastAPI malformed direct request rejected',async()=>{const res=await fetch(ml+'/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userRequirements:{requiredCoverage:-1},policies:[]}),signal:AbortSignal.timeout(10000)});expect(res.status===422,`Expected HTTP 422; received ${res.status}`);});
  const claimBody={userPolicy:a.saved._id,patientType:'Self',hospitalName:'Synthetic Audit Hospital',hospitalizationType:'Inpatient',admissionDate:'2024-06-01',admissionTime:'10:00',dischargeDate:'2024-06-03',dischargeTime:'12:00',diagnosis:'Synthetic fever',treatment:'Synthetic observation',totalBillAmount:10000,roomRentPerDay:1000,roomType:'Single Private AC',nonPayableExpenses:[{expenseName:'Synthetic supplies',amount:100,reason:'Synthetic audit expense'}],isEmergency:false,isPlannedHospitalization:false};
  await check('api','Create valid hospitalization case',async()=>{a.claim=(await status('POST','/api/claim-cases',claimBody,a.token,201)).claimCase;expect(a.claim._id,'Hospitalization ID missing');});
  expect(a.claim,'Required hospitalization creation failed');
  for(const [name,body] of [['Impossible date',{admissionDate:'2024-02-30'}],['Future date',{dischargeDate:'2100-01-01'}],['Negative bill',{totalBillAmount:-1}],['Missing bill',{totalBillAmount:null}],['Invalid room amount',{roomRentPerDay:'Infinity'}],['Invalid diagnosis',{diagnosis:{}}],['Expenses exceed bill',{nonPayableExpenses:[{expenseName:'Synthetic',amount:10001}]}],['Invalid policy ID',{userPolicy:'bad'}]]) await check('api',`Hospitalization invalid input: ${name}`,async()=>{await status('POST','/api/claim-cases',{...claimBody,...body},a.token,400);});
  await check('api','Other account cannot use foreign saved policy',async()=>{await status('POST','/api/claim-cases',claimBody,b.token,404);});
  await check('api','Claimability valid stored analysis',async()=>{const res=await status('GET',`/api/claim-cases/${a.claim._id}/analyze`,undefined,a.token,200);const {validClaimAnalysis}=await import(path.join(root,'client/src/utils/analysisResponseValidation.js'));expect(validClaimAnalysis(res),'Claimability response does not match UI contract');});
  await check('api','Repeated analysis does not duplicate hospitalization',async()=>{await status('GET',`/api/claim-cases/${a.claim._id}/analyze`,undefined,a.token,200);const res=await status('GET','/api/claim-cases',undefined,a.token,200);expect(res.claimCases.length===1,'Analysis created duplicate hospitalization');});
  await check('api','Other account cannot analyze foreign hospitalization',async()=>{await status('GET',`/api/claim-cases/${a.claim._id}/analyze`,undefined,b.token,404);});
  await check('api','Claimability invalid ObjectId rejected',async()=>{await status('GET','/api/claim-cases/bad/analyze',undefined,a.token,400);});
  const rejectionBody={userPolicy:a.saved._id,claimCase:a.claim._id,rejectionReason:'The insurer rejected this claim because the initial waiting period was not completed.',insurerRemarks:'Synthetic audit statement',rejectedAmount:1000,rejectionDate:'2024-06-04'};
  await check('api','Create linked rejection case',async()=>{a.rejection=(await status('POST','/api/rejection-cases',rejectionBody,a.token,201)).rejectionCase;expect(a.rejection._id,'Rejection ID missing');});
  expect(a.rejection,'Required rejection creation failed');
  await check('api','Rejection requires linked waiting-period hospitalization',async()=>{await status('POST','/api/rejection-cases',{...rejectionBody,claimCase:''},a.token,400);});
  await check('api','Rejection rejects negative amount',async()=>{await status('POST','/api/rejection-cases',{...rejectionBody,rejectedAmount:-1},a.token,400);});
  await check('api','Rejection rejects impossible date',async()=>{await status('POST','/api/rejection-cases',{...rejectionBody,rejectionDate:'2024-02-30'},a.token,400);});
  await check('api','Other account cannot create foreign linked rejection',async()=>{await status('POST','/api/rejection-cases',rejectionBody,b.token,404);});
  await check('api','Rejection analysis through actual ML models',async()=>{const res=await status('GET',`/api/rejection-cases/${a.rejection._id}/analyze`,undefined,a.token,200);expect(res.mlPrediction?.available===true,'Rule analysis returned but ML prediction was unavailable');const {validRejectionAnalysis}=await import(path.join(root,'client/src/utils/analysisResponseValidation.js'));expect(validRejectionAnalysis(res),'Rejection response does not match UI contract');return 'Rule analysis and loaded ML model prediction returned';});
  await check('api','Other account cannot retrieve foreign rejection',async()=>{await status('GET',`/api/rejection-cases/${a.rejection._id}`,undefined,b.token,404);});
  await check('api','Other account cannot analyze foreign rejection',async()=>{await status('GET',`/api/rejection-cases/${a.rejection._id}/analyze`,undefined,b.token,404);});
  await check('api','Rejection invalid ObjectId rejected',async()=>{await status('GET','/api/rejection-cases/bad/analyze',undefined,a.token,400);});
  if (regression) await regression.run({ accounts, catalog:catalog.policies, check, expect, status, api, mongoose, ml, run, results });
  await browserAudit();
  await check('api','Policy catalog unchanged after audit',async()=>{const after=await status('GET','/api/policies',undefined,undefined,200);expect(crypto.createHash('sha256').update(JSON.stringify(after.policies)).digest('hex')===catalogHash,'Catalog changed during audit');});
}
main().catch(error=>{results.api.push({name:'Dependent audit continuation',status:'BLOCKED',detail:error.auditDetail||'A required synthetic workflow failed; dependent tests could not run'});console.log('BLOCKED: Dependent audit continuation');}).finally(async()=>{
  if(chrome && chrome.exitCode===null) {
    chrome.kill('SIGTERM');
    await new Promise(resolve => { const timeout=setTimeout(resolve,3000);chrome.once('exit',()=>{clearTimeout(timeout);resolve();}); });
  }
  if(chromeDir && chromeDir.startsWith('/tmp/insurelens-chrome-')) {
    try { fs.rmSync(chromeDir,{recursive:true,force:true}); results.cleanup.push({name:'Isolated browser profile',status:'PASSED',detail:'Removed this run’s temporary browser profile after Chrome exited'}); }
    catch { results.cleanup.push({name:'Isolated browser profile',status:'FAILED',detail:'Temporary browser profile cleanup failed'}); }
  }
  try{await cleanup();}catch{results.cleanup.push({name:'Synthetic data cleanup',status:'FAILED',detail:'Cleanup verification failed; inspect isolated audit namespace before manual cleanup'});}
  await mongoose.disconnect();results.finishedAt=new Date().toISOString();evidence();
  console.log('Audit evidence saved (contains no passwords or tokens)');
  if(['services','api','regression','browser','cleanup'].some(section=>results[section].some(item=>['FAILED','BLOCKED'].includes(item.status)))) process.exitCode=1;
});
