const {test} = require('node:test');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');
const {extractedTerms, publicPolicy} = require('../utils/pdfValidation');
const {uploadedClaimAnalysis, extractionReview} = require('../services/uploadedPolicyReview');
const {analyzeRejection} = require('../services/rejectionAnalyzer');
const UserPolicy = require('../models/UserPolicy');
const fixture = () => ({_id:'111111111111111111111111',user:'333333333333333333333333',sourceType:'Uploaded',policyStartDate:'2024-01-01',policyEndDate:'2027-01-01',selectedCoverage:500000,
  uploadedDocument:{extractedText:'Initial waiting period: 0 days. Co-payment: 0%. Deductible: INR 0',filePath:'/private/hidden.pdf',fileName:'hidden.pdf'},extractedPolicyData:extractedTerms({waitingPeriods:{initialDays:0},coPaymentPercentage:0,deductibleAmount:0})});
const claim = {_id:'222222222222222222222222',admissionDate:'2024-02-01',dischargeDate:'2024-02-03',totalBillAmount:10000,nonPayableExpenses:[]};

test('uploaded unknowns persist as null without changing schema, including explicit zero', async()=>{
  const terms=extractedTerms({coPaymentPercentage:0,deductibleAmount:0});
  assert.equal(terms.coPaymentPercentage,0);assert.equal(terms.deductibleAmount,0);
  for(const field of ['majorExclusions','subLimits','preExistingConditionsRules']) assert.equal(terms[field],null);
  assert.equal(terms.roomRentLimit.hasCap,null);
  const doc=new UserPolicy({...fixture(),extractedPolicyData:terms});await doc.validate();
  assert.equal(doc.extractedPolicyData.hospitalizationCoverage.inpatientCovered,null);
  assert.equal(doc.extractedPolicyData.roomRentLimit.roomTypeAllowed,null);
  assert.equal(doc.extractedPolicyData.waitingPeriods.initialDays,null);
  assert.equal(doc.extractedPolicyData.majorExclusions,null);
});

test('public policy suppresses raw text and paths; legacy zero defaults are unverified',()=>{
  const f=fixture();const output=publicPolicy(f);
  assert.equal(output.extractedPolicyData.coPaymentPercentage,0);
  assert.equal(output.extractionReview.fields[4].status,'Extracted — unverified');
  for(const field of ['extractedText','filePath','fileName']) assert.equal(output.uploadedDocument[field],undefined);
  f.uploadedDocument.extractedText='No supported insurance definitions';
  assert.equal(publicPolicy(f).extractedPolicyData.coPaymentPercentage,null);
  assert.equal(extractionReview(f).fields[0].value,null);
  assert.equal(f.uploadedDocument.filePath,'/private/hidden.pdf','Sanitization must not mutate stored records');
});

test('uploaded analyses never score missing exclusions/financial terms as verified',async()=>{
  const f=fixture();
  const a=uploadedClaimAnalysis(claim,f,f.extractedPolicyData);
  const r=analyzeRejection({rejectionReason:'Co-payment and room rent exclusions',insurerRemarks:''},f.extractedPolicyData,f,claim);
  assert.equal(a.claimabilityScore,null);
  assert.equal(a.analysis.financialImpact.estimatedAmountAfterBasicDeductions,null);
  assert.equal(a.analysis.hospitalizationCoverage.passed,null);
  assert.equal(a.analysis.roomRent.passed,null);
  assert.match(a.analysis.requiresReview.exclusionCheck.message,/unverified/);
  assert.deepEqual(a.analysis.detailedWaitingPeriodAnalysis,r.detailedWaitingPeriodAnalysis);
  assert.equal(a.analysis.initialWaitingPeriod.waitingDays,0);
  assert.equal(r.extractionReview.status,'Unverified');assert.equal(r.requiresManualReview,true);
  const {validClaimAnalysis,validRejectionAnalysis}=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/analysisResponseValidation.js')));
  assert.equal(validClaimAnalysis(a),true);assert.equal(validRejectionAnalysis({analysis:r}),true);
  assert.equal(validClaimAnalysis({...a,extractionReview:undefined}),false);
});

test('upload error paths reject signatures, sanitize ML errors and remove only temporary uploads',async()=>{
  const axios=require('axios');
  const route=require('../routes/userPolicies').stack.find(l=>l.route?.path==='/upload').route.stack.at(-1).handle;
  const originals={find:UserPolicy.findOne,post:axios.post,url:process.env.ML_SERVICE_URL};
  UserPolicy.findOne=async()=>null;process.env.ML_SERVICE_URL='http://example.invalid';
  const tmp=await fs.mkdtemp('/tmp/insurelens-pdf-unit-');const filePath=path.join(tmp,'synthetic.pdf');
  const body={selectedCoverage:1000,policyStartDate:'2024-01-01',policyEndDate:'2027-01-01'};
  async function invoke(bytes,error,expected){
    await fs.writeFile(filePath,bytes);axios.post=async()=>{throw error;};
    const res={status(c){this.code=c;return this;},json(b){this.body=b;return this;}};
    await route({user:fixture().user,body,file:{path:filePath,mimetype:'application/pdf',size:bytes.length}},res);
    assert.equal(res.code,expected);await assert.rejects(fs.access(filePath));
    assert.ok(!JSON.stringify(res.body).includes('SENSITIVE'));
  }
  try{
    await invoke(Buffer.from('not a PDF'),{},400);
    await invoke(Buffer.from('%PDF-1.7'),{response:{status:422,data:{detail:'SENSITIVE parser failure'}}},422);
    await invoke(Buffer.from('%PDF-1.7'),{code:'ECONNABORTED'},504);
    await invoke(Buffer.from('%PDF-1.7'),{code:'ECONNREFUSED'},503);
  }finally{UserPolicy.findOne=originals.find;axios.post=originals.post;if(originals.url===undefined)delete process.env.ML_SERVICE_URL;else process.env.ML_SERVICE_URL=originals.url;await fs.rm(tmp,{recursive:true});}
});

test('unauthenticated policy upload is rejected before disk middleware',()=>{
  const auth=require('../routes/userPolicies').stack.find(l=>l.route?.path==='/upload').route.stack[0].handle;
  const res={status(c){this.code=c;return this;},json(b){this.body=b;}};
  auth({headers:{},header:()=>undefined},res,()=>assert.fail('Unauthenticated upload must not continue'));
  assert.equal(res.code,401);
});


test('malformed legacy source and mixed terms do not crash review rendering',()=>{
  const f=fixture();f.uploadedDocument.extractedText={bad:true};
  f.extractedPolicyData.majorExclusions='bad';f.extractedPolicyData.subLimits=[null,{},'bad'];
  assert.doesNotThrow(()=>extractionReview(f));
  assert.equal(extractionReview(f).fields[0].value,null);
});
