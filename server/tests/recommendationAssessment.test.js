const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { validatePolicyTerms, profileAge } = require('../utils/analysisValidation');
const id = '111111111111111111111111';
const memberId = '222222222222222222222222';
const childId = '333333333333333333333333';
const item = { policyId:id, policyName:'Synthetic policy', insuranceCompany:'Synthetic insurer', matchedCoverage:500000, score:90,
  scoreBreakdown:{ coverage:30,coPayment:15,roomRent:15,preExistingDisease:{applicable:false,score:0},waitingPeriods:{score:10,initialWaiting:5,specificIllnessWaiting:5},hospitalization:{score:15,inpatient:5,daycare:3,preHospitalization:3,postHospitalization:4} } };
const premium = {status:'Insufficient Information',budget:20000,annualPremium:null,basePremium:null,message:'Affordability cannot be verified'};
const family = {status:'Insufficient Information',message:'Relationship rules unavailable',members:[{memberType:'Self',relationship:'Self',age:35,ageStatus:'Eligible',relationshipStatus:'Insufficient Information',message:'Within recorded age range'}]};

test('new assessment fields validate consistently while keeping old response contracts accepted', async () => {
  const client = await import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/recommendationValidation.js')));
  for (const { validRecommendationResults: validate } of [require('../utils/recommendationValidation'),client]) {
    assert.equal(validate([item]),true);
    assert.equal(validate([{...item,premiumAssessment:premium,familyEligibility:family}]),true);
    for (const p of [null,{}, {...premium,budget:-1}, {...premium,annualPremium:15000}, {...premium,status:'Within Budget'}, {...premium,basePremium:NaN}]) {
      assert.equal(validate([{...item,premiumAssessment:p}]),false);
    }
    for (const f of [null,{}, {...family,members:null}, {...family,members:[{}]}, {...family,members:[{...family.members[0],age:-1}]}]) {
      assert.equal(validate([{...item,familyEligibility:f}]),false);
    }
    assert.equal(validate([{...item,premiumAssessment:{...premium,status:'Within Budget',annualPremium:15000}}]),true);
    assert.equal(validate([{...item,premiumAssessment:{...premium,status:'Above Budget',annualPremium:25000}}]),true);
  }
});

test('missing eligibility rules remain candidates; corrupt rules are rejected', () => {
  const product=require('../data/policies.json')[0];
  for(const eligibility of [undefined,null,{}, {familyFloaterAllowed:true}, {minAge:18,maxAge:65}]) {
    assert.equal(validatePolicyTerms({...product,eligibility},{recommendation:true}),null);
  }
  for (const basePremium of [undefined,null,NaN,-1,'unavailable']) assert.equal(validatePolicyTerms({...product,basePremium},{recommendation:true}),null);
  assert.ok(validatePolicyTerms({...product,eligibility:{minAge:80,maxAge:20}},{recommendation:true}));
  assert.ok(validatePolicyTerms({...product,eligibility:{minAge:'18'}},{recommendation:true}));
});

test('Express sends every selected member from authenticated records and ignores supplied member details', async () => {
  const User=require('../models/User'),Policy=require('../models/Policy'),axios=require('axios');
  const originals={user:User.findById,policy:Policy.find,post:axios.post,url:process.env.ML_SERVICE_URL};
  const user={firstname:'Synthetic',dateOfBirth:new Date('1990-01-01'),gender:'other',city:'Pune',annualIncome:0,familyMembers:[
    {_id:memberId,name:'Synthetic adult',relationship:'Mother',dateOfBirth:new Date('1960-01-01'),gender:'Female',isDependent:true,preExistingDiseases:[]},
    {_id:childId,name:'Synthetic child',relationship:'Son',dateOfBirth:new Date('2018-01-01'),gender:'male',isDependent:true,preExistingDiseases:[]}
  ]};
  User.findById=()=>({lean:async()=>user});
  Policy.find=()=>({lean:async()=>[{...require('../data/policies.json')[0],_id:id}]});
  let captured;
  axios.post=async(_url,body)=>{captured=body.userRequirements;return{data:{recommendations:[{...item,premiumAssessment:premium,familyEligibility:family}]}};};
  process.env.ML_SERVICE_URL='http://example.invalid';
  const handler=require('../routes/recommendations').stack.find(layer=>layer.route?.path==='/'&&layer.route.methods.post).route.stack.at(-1).handle;
  const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
  try {
    await handler({user:id,body:{requiredCoverage:500000,coverageType:'Family Floater',includeSelf:true,selectedFamilyMembers:[memberId,childId],budget:20000,
      insuredMembers:[{memberType:'Self',age:1,relationship:'Fake'}]}},res);
    assert.equal(res.statusCode,200);
    assert.equal(captured.insuredMembers.length,3);
    assert.deepEqual(captured.insuredMembers.map(m=>m.age),[profileAge(user.dateOfBirth),profileAge(user.familyMembers[0].dateOfBirth),profileAge(user.familyMembers[1].dateOfBirth)]);
    assert.deepEqual(captured.insuredMembers.map(m=>m.relationship),['Self','Mother','Son']);
    assert.ok(captured.insuredMembers.every(m=>m.name===undefined&&m.memberId===undefined));
    assert.equal(captured.budget,20000);
    assert.deepEqual(res.body.recommendations[0].premiumAssessment,premium);
  } finally {User.findById=originals.user;Policy.find=originals.policy;axios.post=originals.post;if(originals.url===undefined)delete process.env.ML_SERVICE_URL;else process.env.ML_SERVICE_URL=originals.url;}
});
