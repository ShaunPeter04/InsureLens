const {execFileSync} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname,'../..');
const ownedFiles = [];
function fixture(kind) {
  const code = kind === 'encrypted' ? 'text_pdf(encrypted=True)' : kind === 'missing' ? 'text_pdf("Synthetic document without insurance rules.\\n" * 8)' : 'text_pdf()';
  return execFileSync(path.join(root,'ml-service/venv/bin/python'),['-c',`from pdf_test_fixture import text_pdf; import sys; sys.stdout.buffer.write(${code})`],{cwd:path.join(root,'ml-service'),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
}
async function run({accounts,check,expect,status,mongoose,run}) {
  const [a,b] = accounts;
  const test=(name,fn)=>check('regression',name,fn);
  const directory=path.join(root,'server/uploads/policies');
  const initialFiles=new Set(await fs.readdir(directory));
  const fields={selectedCoverage:'500000',policyStartDate:'2024-01-01',policyEndDate:'2027-01-01'};
  async function upload(bytes, token, number, mime='application/pdf') {
    const body=new FormData(); body.append('policyDocument',new Blob([bytes],{type:mime}),'synthetic.pdf');
    for(const [key,value] of Object.entries({...fields,policyNumber:run+'-'+number})) body.append(key,value);
    const res=await fetch('http://localhost:5173/api/user-policies/upload',{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body,signal:AbortSignal.timeout(35000)});
    return {status:res.status,data:await res.json()};
  }
  const saved=[];
  for(const kind of ['valid','missing']) await test(`Actual text-PDF upload: ${kind} terms`,async()=>{
    const res=await upload(fixture(kind),a.token,kind);expect(res.status===201,`Expected upload 201; received ${res.status}`);
    const row=await mongoose.connection.collection('userpolicies').findOne({_id:new mongoose.Types.ObjectId(res.data.userPolicy._id),user:new mongoose.Types.ObjectId(a.user.id),policyNumber:run+'-'+kind});
    expect(row&&row.sourceType==='Uploaded','Uploaded fixture ownership mismatch');
    const target=path.resolve(row.uploadedDocument.filePath);
    expect(path.dirname(target)===directory&&!initialFiles.has(path.basename(target)),'Synthetic document path verification failed');
    ownedFiles.push({id:row._id,user:row.user,number:row.policyNumber,path:target});
    expect((await fs.stat(target)).mode % 512 === 0o600,'New document is not private');
    expect(res.data.userPolicy.uploadedDocument.extractedText===undefined&&res.data.userPolicy.uploadedDocument.filePath===undefined,'Response exposed private source');
    expect(row.extractedPolicyData.majorExclusions===null,'Missing exclusions became an empty verified list');
    if(kind==='missing') expect(row.extractedPolicyData.subLimits===null,'Missing sub-limits became an empty verified list');
    expect(kind==='valid'?row.extractedPolicyData.coPaymentPercentage===0:row.extractedPolicyData.coPaymentPercentage===null,'Explicit zero vs unknown co-payment lost');
    saved.push(res.data.userPolicy);
  });
  for(const [name,bytes,mime,token,expected] of [
    ['Invalid MIME',Buffer.from('fake'),'text/plain',a.token,400],
    ['Invalid signature',Buffer.from('not a PDF'),'application/pdf',a.token,400],
    ['Malformed PDF',Buffer.from('%PDF-1.7\ninvalid'),'application/pdf',a.token,422],
    ['Encrypted PDF',fixture('encrypted'),'application/pdf',a.token,422],
    ['Oversized PDF',Buffer.alloc(10*1024*1024+1),'application/pdf',a.token,400],
    ['Unauthenticated upload',fixture('valid'),'application/pdf',null,401]
  ]) await test('Actual PDF validation: '+name,async()=>{
    const before=await fs.readdir(directory);const res=await upload(bytes,token,name.replaceAll(' ',''),mime);
    expect(res.status===expected,`Expected ${expected}; received ${res.status}`);
    expect(JSON.stringify(before.sort())===JSON.stringify((await fs.readdir(directory)).sort()),'Rejected upload left a temporary file');
  });
  for(const p of saved) await test('Uploaded downstream analysis: '+(p.policyNumber.endsWith('valid')?'explicit zero':'missing terms'),async()=>{
    const c=(await status('POST','/api/claim-cases',{userPolicy:p._id,patientType:'Self',hospitalName:'Synthetic PDF Audit Hospital',hospitalizationType:'Inpatient',admissionDate:'2024-02-01',admissionTime:'10:00',dischargeDate:'2024-02-03',dischargeTime:'12:00',diagnosis:'Synthetic Fever',roomType:'Single Private AC',totalBillAmount:10000,roomRentPerDay:1000,nonPayableExpenses:[]},a.token,201)).claimCase;
    const claim=await status('GET',`/api/claim-cases/${c._id}/analyze`,undefined,a.token,200);
    expect(claim.claimabilityScore===null&&claim.analysis.financialImpact.estimatedAmountAfterBasicDeductions===null,'Unverified uploaded terms created a claim score or payment');
    a.pdfClaim=c; a.pdfPolicy=p;
    const rejection=(await status('POST','/api/rejection-cases',{userPolicy:p._id,claimCase:c._id,rejectionReason:'Initial waiting period and room rent deductions require review.',rejectedAmount:1000,rejectionDate:'2024-02-04'},a.token,201)).rejectionCase;
    const rejected=await status('GET',`/api/rejection-cases/${rejection._id}/analyze`,undefined,a.token,200);
    expect(JSON.stringify(claim.analysis.detailedWaitingPeriodAnalysis)===JSON.stringify(rejected.analysis.detailedWaitingPeriodAnalysis),'Waiting-period modules disagree');
    expect(rejected.analysis.extractionReview.status==='Unverified'&&rejected.mlPrediction.available,'Uploaded review or real ML response missing');
    await status('GET',`/api/claim-cases/${c._id}/analyze`,undefined,b.token,404);
    await status('GET',`/api/rejection-cases/${rejection._id}/analyze`,undefined,b.token,404);
  });
  a.pdfFixtures=saved;
}
async function browser({accounts,check,expect,go,waitFor,evaluate,setFields,submit}) {
  await check('browser','PDF extraction review cards and acknowledgment',async()=>{
    await go('/my-policies');await waitFor(`document.querySelectorAll('.policy-extraction-review').length>=2`);
    expect(await evaluate(`document.querySelector('#root').textContent.includes('Extracted — unverified')&&document.querySelector('#root').textContent.includes('Unknown')`),'Extracted and unknown terms not displayed');
    await evaluate(`document.querySelector('.policy-extraction-review input[type="checkbox"]').click()`);
    expect(await evaluate(`document.querySelector('#root').textContent.includes('Review acknowledged')`),'User review acknowledgment missing');
  });
  await check('browser','Uploaded Claimability shows unknown amounts instead of zero',async()=>{
    await go('/claimability');
    await waitFor(`[...document.querySelector('select[name="userPolicy"]').options].some(o=>o.value===${JSON.stringify(accounts[0].pdfPolicy._id)})`);
    await setFields({userPolicy:accounts[0].pdfPolicy._id,hospitalName:'Synthetic Browser PDF Hospital',admissionDate:'2024-02-01',admissionTime:'10:00',dischargeDate:'2024-02-03',dischargeTime:'12:00',diagnosis:'Synthetic Fever',totalBillAmount:'10000',roomRentPerDay:'1000'});
    await submit('.claimability-form');await waitFor(`!!document.querySelector('.financial-summary')||!!document.querySelector('.claimability-error')`);
    expect(await evaluate(`document.querySelector('.score-box')?.textContent.includes('Not verified')&&document.querySelector('.financial-summary')?.textContent.includes('Unknown — review required')`),'Unknown financial terms or score rendered incorrectly');
  });
  await check('browser','Uploaded Rejection analysis displays unverified policy review',async()=>{
    await go('/rejection-analysis');
    await waitFor(`[...document.querySelector('select[name="userPolicy"]').options].some(o=>o.value===${JSON.stringify(accounts[0].pdfPolicy._id)})`);
    await setFields({userPolicy:accounts[0].pdfPolicy._id});
    await waitFor(`[...document.querySelector('select[name="claimCase"]').options].some(o=>o.value===${JSON.stringify(accounts[0].pdfClaim._id)})`);
    await setFields({claimCase:accounts[0].pdfClaim._id,rejectionReason:'Initial waiting period and co-payment review',rejectedAmount:'1000',rejectionDate:'2024-02-04'});
    await submit('.rejection-form');await waitFor(`!!document.querySelector('.rejection-result')||!!document.querySelector('.rejection-error')`);
    expect(await evaluate(`document.querySelector('.rejection-result .policy-extraction-review')?.textContent.includes('Unknown')`),'Uploaded rejection review did not render');
  });
}
async function cleanup({mongoose,run,expect,results}) {
  for(const file of ownedFiles) {
    const row=await mongoose.connection.collection('userpolicies').findOne({_id:file.id,user:file.user,policyNumber:file.number});
    expect(row&&file.number.startsWith(run+'-')&&path.resolve(row.uploadedDocument.filePath)===file.path,'Synthetic upload cleanup ownership mismatch');
    await fs.unlink(file.path);
    results.cleanup.push({name:'Verified synthetic PDF',status:'PASSED',detail:'Removed only this run’s owned synthetic document'});
  }
}
module.exports={run,browser,cleanup};
