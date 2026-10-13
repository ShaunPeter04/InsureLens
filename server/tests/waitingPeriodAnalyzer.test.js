const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { analyzeWaitingPeriods, validDate, addMonths } = require('../services/waitingPeriodAnalyzer');
const { analyzeRejection } = require('../services/rejectionAnalyzer');
const product = require('../data/policies.json')[0];
const policy = { ...product, waitingPeriods:{initialDays:30,specificIllnessesMonths:1,preExistingDiseasesMonths:12,specificIllnessConditions:['Cataract']} };
const saved = { _id:'111111111111111111111111',sourceType:'Catalog',policyStartDate:'2024-01-01',policyEndDate:'2026-01-01',selectedCoverage:700000,policy };
const claim = { _id:'222222222222222222222222',userPolicy:saved,patientType:'Self',hospitalName:'Synthetic Hospital',hospitalizationType:'Inpatient',admissionDate:'2024-02-02',admissionTime:'10:00',dischargeDate:'2024-02-04',dischargeTime:'12:00',diagnosis:'Fever',treatment:'Observation',totalBillAmount:10000,roomRentPerDay:1000,roomType:'Single Private AC',nonPayableExpenses:[] };
const day = value => value?.toISOString().slice(0,10);

test('admission before commencement is inconsistent even with zero waiting days', () => {
  for (const initialDays of [0,30]) {
    const r=analyzeWaitingPeriods({...policy,waitingPeriods:{...policy.waitingPeriods,initialDays}},saved,{...claim,admissionDate:'2023-12-31'});
    for(const key of ['initial','specificIllness','preExistingDisease']) assert.equal(r[key].status,'Date Inconsistency');
    assert.equal(r.initial.passed,false);
    assert.notEqual(r.preExistingDisease.completed,true);
  }
});

test('initial period uses calendar dates, with exact boundaries left for wording review', () => {
  for(const [admission,status,passed] of [['2024-01-15','Waiting Period Not Completed',false],['2024-01-31','Manual Review Required',null],['2024-02-01','Waiting Period Completed',true]]) {
    const r=analyzeWaitingPeriods(policy,saved,{...claim,admissionDate:admission});
    assert.equal(r.initial.status,status);assert.equal(r.initial.passed,passed);
    assert.equal(day(r.initial.waitingEndDate),'2024-01-31');
    assert.equal(r.initial.boundaryRequiresReview,status==='Manual Review Required');
    assert.equal(r.requiresManualReview,true);
  }
});

test('missing and impossible dates never report a completed period', () => {
  for(const admissionDate of [undefined,null,'','2023-02-29','2024-02-30','2024-13-01','2024-01-00',new Date('invalid'),{},true]) {
    const r=analyzeWaitingPeriods(policy,saved,{...claim,admissionDate});
    assert.equal(r.initial.status,'Insufficient Information');assert.equal(r.initial.passed,null);
  }
  for(const policyStartDate of [undefined,null,'2024-02-30']) assert.equal(analyzeWaitingPeriods(policy,{...saved,policyStartDate},claim).initial.status,'Insufficient Information');
  assert.equal(validDate('2024-02-30T00:00:00.000Z'),null);
  assert.equal(validDate('0000-01-01'),null);
  assert.equal(analyzeWaitingPeriods(policy,saved,{...claim,dischargeDate:'2024-01-01'}).initial.status,'Date Inconsistency');
  assert.equal(analyzeWaitingPeriods(policy,saved,{...claim,dischargeDate:'2024-02-30'}).initial.status,'Date Inconsistency');
});

test('calendar month anniversaries clamp month ends and account for leap years', () => {
  for(const [start,months,end] of [['2024-01-31',1,'2024-02-29'],['2023-01-31',1,'2023-02-28'],['2024-01-31',2,'2024-03-31'],['2024-02-29',12,'2025-02-28'],['2024-02-29',48,'2028-02-29'],['0099-01-31',1,'0099-02-28']]) {
    assert.equal(day(addMonths(start,months)),end);
    const p={...policy,waitingPeriods:{...policy.waitingPeriods,specificIllnessesMonths:months,preExistingDiseasesMonths:months}};
    const r=analyzeWaitingPeriods(p,{...saved,policyStartDate:start,policyEndDate:undefined},{...claim,admissionDate:start,dischargeDate:start});
    assert.equal(day(r.specificIllness.waitingEndDate),end);
    assert.equal(day(r.preExistingDisease.waitingEndDate),end);
  }
  assert.equal(addMonths('2024-01-31',-1),null);
  assert.equal(addMonths('2024-01-31',0.5),null);
  assert.equal(addMonths('2024-01-31',Number.MAX_SAFE_INTEGER),null);
});

test('initial day addition crosses leap day without using elapsed-month approximations', () => {
  const p={...policy,waitingPeriods:{...policy.waitingPeriods,initialDays:1}};
  const r=analyzeWaitingPeriods(p,{...saved,policyStartDate:'2024-02-28'}, {...claim,admissionDate:'2024-03-01',dischargeDate:'2024-03-04'});
  assert.equal(day(r.initial.waitingEndDate),'2024-02-29');
  assert.equal(r.initial.status,'Waiting Period Completed');
});

test('missing, fractional and coerced waiting definitions remain insufficient', () => {
  for(const amount of [undefined,null,'30',false,-1,0.5,Infinity,NaN,{},[]]) {
    const p={...policy,waitingPeriods:{initialDays:amount,specificIllnessesMonths:amount,preExistingDiseasesMonths:amount}};
    const r=analyzeWaitingPeriods(p,saved,claim);
    for(const key of ['initial','specificIllness','preExistingDisease']) assert.equal(r[key].status,'Insufficient Information');
  }
  assert.equal(analyzeWaitingPeriods({...policy,waitingPeriods:null},saved,claim).initial.status,'Insufficient Information');
});

test('specific-illness field aliases are normalized as hints, never inferred applicability', () => {
  for(const key of ['specificIllnessConditions','specificIllnessesConditions']) {
    const p={...policy,waitingPeriods:{initialDays:30,specificIllnessesMonths:1,preExistingDiseasesMonths:12,[key]:[' Cataract ']}};
    const r=analyzeWaitingPeriods(p,saved,{...claim,diagnosis:'cataract'});
    assert.deepEqual(r.specificIllness.matchedConditions,['Cataract']);
    assert.equal(r.specificIllness.status,'Manual Review Required');
    assert.equal(r.specificIllness.timelineStatus,'Waiting Period Completed');
    assert.equal(r.specificIllness.applicabilityVerified,false);
    assert.equal(r.specificIllness.passed,null);
  }
  const partial=analyzeWaitingPeriods(policy,saved,{...claim,diagnosis:'Cataract surgery'});
  assert.deepEqual(partial.specificIllness.matchedConditions,[]);
});

test('PED completion is a timeline, not a diagnosis of a pre-existing disease', () => {
  const r=analyzeWaitingPeriods(policy,saved,{...claim,diagnosis:'Diabetes',admissionDate:'2025-02-01',dischargeDate:'2025-02-04'});
  assert.equal(r.preExistingDisease.timelineStatus,'Waiting Period Completed');
  assert.equal(r.preExistingDisease.status,'Manual Review Required');
  assert.equal(r.preExistingDisease.applicable,null);
  assert.equal(r.preExistingDisease.applicabilityVerified,false);
  assert.equal(r.preExistingDisease.passed,null);
  const boundary=analyzeWaitingPeriods(policy,saved,{...claim,admissionDate:'2025-01-01',dischargeDate:'2025-01-03'});
  assert.equal(boundary.preExistingDisease.timelineStatus,'Manual Review Required');
  assert.equal(boundary.preExistingDisease.completed,null);
});

test('policy-specific exceptions and reductions are preserved for review without unverified waivers', () => {
  const r=analyzeWaitingPeriods(product,saved,{...claim,admissionDate:'2024-01-05',isEmergency:true,diagnosis:'Accidental injury'});
  assert.equal(r.initial.status,'Waiting Period Not Completed');
  assert.ok(r.policyWordingToReview.includes(product.waitingPeriods.description));
  assert.equal(r.requiresManualReview,true);
});

test('schema defaults and historical upload defaults cannot establish waiting periods', async () => {
  const UserPolicy=require('../models/UserPolicy');
  const uploadedDocument=new UserPolicy({user:saved._id,sourceType:'Uploaded',selectedCoverage:700000,policyStartDate:'2024-01-01',policyEndDate:'2026-01-01',extractedPolicyData:{waitingPeriods:{initialDays:null,specificIllnessesMonths:null,preExistingDiseasesMonths:null}}});
  await uploadedDocument.validate();
  const Policy=require('../models/Policy');
  const document=new Policy({...product,waitingPeriods:undefined});
  assert.equal(analyzeWaitingPeriods(document,saved,claim).initial.status,'Insufficient Information');
  const zeros={...policy,waitingPeriods:{initialDays:0,specificIllnessesMonths:0,preExistingDiseasesMonths:0}};
  const upload={...saved,sourceType:'Uploaded',uploadedDocument:{extractedText:'Synthetic policy document with no waiting-period definitions'}};
  assert.equal(analyzeWaitingPeriods(zeros,upload,claim).initial.status,'Insufficient Information');
  upload.uploadedDocument.extractedText='Initial waiting period: 0 days. Specific waiting period: 0 months. Pre-Existing disease - 0 months.';
  assert.equal(analyzeWaitingPeriods(zeros,upload,claim).initial.status,'Waiting Period Completed');
  upload.uploadedDocument.extractedText+=' Initial waiting period: 30 days.';
  assert.equal(analyzeWaitingPeriods(zeros,upload,claim).initial.status,'Insufficient Information');
});

test('recovery conclusions do not become an approval guarantee on an exact boundary', () => {
  const r=analyzeRejection({rejectionReason:'Initial waiting period not completed',insurerRemarks:''},policy,saved,{...claim,admissionDate:'2024-01-31'});
  assert.equal(r.waitingPeriodVerification.status,'Manual Review Required');
  assert.equal(r.waitingPeriodVerification.verified,false);
  assert.equal(r.recoveryAssessment,'Further Evidence Required — Manual Review');
  assert.equal(r.requiresManualReview,true);
});

test('Claimability API and Rejection service agree on dates and statuses for identical inputs', async () => {
  const ClaimCase=require('../models/ClaimCase'),User=require('../models/User');
  const original={find:ClaimCase.findOne,user:User.findById};
  const route=require('../routes/claimCases').stack.find(layer=>layer.route?.path==='/:caseId/analyze').route.stack.at(-1).handle;
  let fixture;
  let leanReads=0;
  ClaimCase.findOne=()=>({populate:()=>({lean:async()=>{leanReads++;return fixture;}})});
  User.findById=async()=>({insuranceRequirements:{preExistingDiseases:['Diabetes']}});
  const {validClaimAnalysis}=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/analysisResponseValidation.js')));
  const cases=[
    {admissionDate:'2023-12-31'}, {admissionDate:'2024-01-15'}, {admissionDate:'2024-01-31'}, {admissionDate:'2024-02-02'},
    {admissionDate:null}, {admissionDate:'2024-02-30'}, {admissionDate:'2024-02-29',policyStartDate:'2024-01-31'},
    {admissionDate:'2024-03-01',policyStartDate:'2024-01-31'}, {admissionDate:'2025-01-01'},
    {admissionDate:'2024-02-02',waitingPeriods:null}, {admissionDate:'2024-01-15',diagnosis:'Diabetes'},
    {admissionDate:'2024-01-15',diagnosis:'Cataract'}
  ];
  try {
    for(const input of cases) {
      const p={...policy,waitingPeriods:Object.hasOwn(input,'waitingPeriods')?input.waitingPeriods:policy.waitingPeriods};
      const s={...saved,policyStartDate:input.policyStartDate||saved.policyStartDate,policy:p};
      fixture={...claim,admissionDate:input.admissionDate,diagnosis:input.diagnosis||claim.diagnosis,dischargeDate:'2025-06-01',userPolicy:s};
      const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;}};
      await route({user:'333333333333333333333333',params:{caseId:claim._id}},res);
      assert.equal(res.statusCode,200,JSON.stringify(input));
      assert.equal(validClaimAnalysis(res.body),true);
      const rejected=analyzeRejection({rejectionReason:'Initial waiting period',insurerRemarks:''},p,s,fixture);
      assert.deepEqual(res.body.analysis.detailedWaitingPeriodAnalysis,rejected.detailedWaitingPeriodAnalysis);
      assert.equal(res.body.analysis.initialWaitingPeriod.status,rejected.waitingPeriodVerification.status);
      assert.equal(day(res.body.analysis.initialWaitingPeriod.waitingEndDate),day(rejected.waitingPeriodVerification.waitingEndDate));
      if (input.admissionDate==='2024-02-30') assert.equal(res.body.analysis.initialWaitingPeriod.status,'Insufficient Information');
      assert.equal(res.body.requiresManualReview,true);
      assert.equal(res.body.analysis.pedWaitingPeriod.applicabilityVerified,false);
      assert.equal(res.body.blockingIssues.some(issue=>/waiting period/.test(issue)),false);
    }
    assert.equal(leanReads,cases.length,'Analysis must preserve raw legacy calendar values');
  } finally {ClaimCase.findOne=original.find;User.findById=original.user;}
});

test('read-only analysis options never allow invalid dates through write validation', () => {
  const {validateClaimCase}=require('../utils/insuranceValidation');
  assert.ok(validateClaimCase({...claim,userPolicy:saved._id,admissionDate:'2024-02-30',validateDates:false}).error);
});

test('frontend renders backend calendar boundaries without timezone-based date shifts', async () => {
  const {formatWaitingDate}=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/waitingPeriodDisplay.js')));
  assert.equal(formatWaitingDate('2024-02-29T00:00:00.000Z'),'29/2/2024');
  assert.equal(formatWaitingDate('2024-02-30'),'Not available');
  assert.equal(formatWaitingDate(null),'Not available');
});

test('frontend accepts shared waiting results and rejects malformed status/date metadata', async () => {
  const {validRejectionAnalysis}=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/analysisResponseValidation.js')));
  const analysis=analyzeRejection({rejectionReason:'Initial waiting period',insurerRemarks:''},policy,saved,claim);
  assert.equal(validRejectionAnalysis({analysis}),true);
  const clone=()=>JSON.parse(JSON.stringify(analysis));
  let bad=clone();bad.detailedWaitingPeriodAnalysis.initial.status='Guaranteed Approval';
  assert.equal(validRejectionAnalysis({analysis:bad}),false);
  bad=clone();bad.detailedWaitingPeriodAnalysis.initial.waitingEndDate='2024-02-30';
  assert.equal(validRejectionAnalysis({analysis:bad}),false);
});
