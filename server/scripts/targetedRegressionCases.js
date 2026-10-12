// Explicit live regression fixtures. All writes are owned by verified audit users.
const assert = require('node:assert/strict');
const addDays = (day, amount) => { const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+amount);return d.toISOString().slice(0,10); };
const end = entry => entry?.waitingEndDate?.slice(0,10) || null;

async function run(context) {
  const {accounts,catalog,check,expect,status,mongoose,ml,run,results}=context;
  const a=accounts[0];
  a.regression={};
  const test=(name,fn)=>check('regression',name,fn);
  const requirements={requiredCoverage:500000,coverageType:'Individual',budget:20000,preExistingDiseases:[],isSmokerOrTobaccoUser:false,alcoholConsumption:'Never',hasHighRiskOccupation:false,coPaymentPreference:0,roomRentPreference:'No Restriction'};
  const unknownPremiums=items=>items.every(item=>item.premiumAssessment?.status==='Insufficient Information'&&item.premiumAssessment.annualPremium===null&&/cannot be verified/.test(item.premiumAssessment.message));
  await test('Individual recommendations and missing annual premiums',async()=>{
    const data=await status('POST','/api/recommendations',requirements,a.token,200);
    expect(data.recommendations.length>0,'No individual recommendations');
    expect(unknownPremiums(data.recommendations),'Unknown premiums were reported as affordable or not explained');
    a.regression.individual=data.recommendations;
  });
  await test('Budget with unknown premium remains unverified and retains candidates',async()=>{
    const low=await status('POST','/api/recommendations',{...requirements,budget:1},a.token,200);
    expect(low.recommendations.length>0&&unknownPremiums(low.recommendations),'Unknown-price policies were excluded or claimed affordable');
    expect(low.recommendations.every(item=>item.premiumAssessment.budget===1),'Submitted budget not retained');
  });
  const year=new Date().getUTCFullYear();
  const members=[];
  for(const [relationship,age] of [['Spouse',30],['Son',8],['Mother',70]]){
    await test(`Synthetic family member setup: ${relationship}`,async()=>{
      const data=await status('POST','/api/family-members',{name:'Synthetic '+relationship,relationship,dateOfBirth:`${year-age}-01-01`,gender:'other',occupation:'Synthetic Tester',isDependent:true,preExistingDiseases:[]},a.token,201);
      members.push(data.familyMember);
    });
  }
  expect(members.length===3,'Required synthetic family setup failed');
  const familyRequest={...requirements,coverageType:'Family Floater',includeSelf:true,selectedFamilyMembers:members.slice(0,2).map(m=>m._id)};
  a.regression.familyRequest=familyRequest;
  await test('Multiple family members and unsupported relationship/child rules',async()=>{
    const data=await status('POST','/api/recommendations',familyRequest,a.token,200);
    expect(data.recommendations.length>0,'Families with children were excluded without documented child rules');
    for(const item of data.recommendations){
      expect(item.familyEligibility?.status==='Insufficient Information','Unverified full family eligibility was reported as confirmed');
      expect(item.familyEligibility.members.length===3,'Not every selected person was assessed');
      expect(item.familyEligibility.members.some(m=>m.relationship==='Son'&&m.ageStatus==='Insufficient Information'),'Missing child rules did not produce uncertainty');
      expect(item.familyEligibility.members.every(m=>m.relationshipStatus==='Insufficient Information'),'Missing relationship rules were invented');
    }
    expect(unknownPremiums(data.recommendations),'Family premiums were fabricated');
  });
  await test('Family member outside actual documented adult age range',async()=>{
    const data=await status('POST','/api/recommendations',{...familyRequest,selectedFamilyMembers:[members[2]._id]},a.token,200);
    expect(data.recommendations.length>0,'No policies for supported wider-age plans');
    for(const item of data.recommendations){
      const product=catalog.find(p=>p._id===item.policyId);
      expect(product.eligibility.maxAge>=70,'Policy violating its recorded adult age maximum was retained');
      expect(item.familyEligibility.members.length===2,'Older family member was not assessed');
    }
  });
  const product=catalog.find(p=>p.isActiveCatalogPlan&&p.coverageAmounts.includes(500000)&&p.waitingPeriods?.initialDays===30);
  expect(product,'No existing catalog plan supports this synthetic 30-day boundary fixture');
  const directML=async(policies,members)=>{
    const response=await fetch(ml+'/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({policies,userRequirements:{...requirements,age:70,gender:'other',city:'Pune',annualIncome:0,coverageType:'Family Floater',insuredMembers:members}}),signal:AbortSignal.timeout(15000)});
    expect(response.status===200,`Direct FastAPI returned HTTP ${response.status}`);return response.json();
  };
  await test('Actual policy age cap excludes one violating member in real FastAPI scoring',async()=>{
    const capped=catalog.find(p=>p.isActiveCatalogPlan&&p.eligibility?.maxAge===65&&p.policyType.includes('Family Floater'));
    expect(capped,'No existing documented age-65 plan');
    const good=await directML([capped],[{memberType:'Self',relationship:'Self',age:36},{memberType:'FamilyMember',relationship:'Mother',age:60}]);
    const bad=await directML([capped],[{memberType:'Self',relationship:'Self',age:36},{memberType:'FamilyMember',relationship:'Mother',age:70}]);
    expect(good.recommendations.length===1&&bad.recommendations.length===0,'Documented adult age cap was not applied to every member');
  });
  await test('Missing age eligibility definitions: real FastAPI transient-input case',async()=>{
    // Omit fields only from the transmitted synthetic copy, never the catalog.
    const copy={...product,eligibility:{}};
    const data=await directML([copy],[{memberType:'Self',relationship:'Self',age:36},{memberType:'FamilyMember',relationship:'Spouse',age:30}]);
    expect(data.recommendations.length===1,'Missing rules excluded an otherwise valid family candidate');
    expect(data.recommendations[0].familyEligibility.members.every(m=>m.ageStatus==='Insufficient Information'),'Absent age rules were invented');
  });
  for(const [name,body] of [['negative coverage',{requiredCoverage:-1}],['false smoker string',{isSmokerOrTobaccoUser:'false'}],['malformed disease array',{preExistingDiseases:[{}]}],['invalid co-payment',{coPaymentPreference:101}],['invalid member ID',{coverageType:'Family Floater',includeSelf:true,selectedFamilyMembers:['bad']}]])
    await test('Invalid recommendation rejected: '+name,async()=>{await status('POST','/api/recommendations',{...requirements,...body},a.token,400);});
  await test('Empty recommendation results are a successful empty array',async()=>{
    const data=await status('POST','/api/recommendations',{...requirements,requiredCoverage:1e12},a.token,200);expect(data.recommendations.length===0,'Empty-results contract failed');
  });
  const date='2024-01-01';
  const normal=(await status('POST','/api/user-policies',{policyId:product._id,selectedCoverage:500000,policyNumber:run+'-regression-calendar',policyStartDate:date,policyEndDate:'2027-01-01'},a.token,201)).userPolicy;
  a.regression.calendarPolicy=normal;
  a.regression.initialBoundary=addDays(date,product.waitingPeriods.initialDays);
  const hospitalName='Synthetic Regression Hospital '+run;
  const createCase=async(saved,admission,diagnosis='Synthetic fever')=>(await status('POST','/api/claim-cases',{userPolicy:saved._id,patientType:'Self',hospitalName,hospitalizationType:'Inpatient',admissionDate:admission,admissionTime:'10:00',dischargeDate:addDays(admission,2),dischargeTime:'12:00',diagnosis,treatment:'Synthetic observation',totalBillAmount:10000,roomRentPerDay:1000,roomType:'Single Private AC',nonPayableExpenses:[]},a.token,201)).claimCase;
  const pair=async(name,caseRecord,expected)=>{
    const rejection=(await status('POST','/api/rejection-cases',{userPolicy:caseRecord.userPolicy._id||caseRecord.userPolicy,claimCase:caseRecord._id,rejectionReason:'Initial waiting period and specific illness / pre-existing disease waiting period require review.',insurerRemarks:'Synthetic audit only',rejectedAmount:1000,rejectionDate:'2025-06-01'},a.token,201)).rejectionCase;
    const claimResult=await status('GET',`/api/claim-cases/${caseRecord._id}/analyze`,undefined,a.token,200);
    const rejectionResult=await status('GET',`/api/rejection-cases/${rejection._id}/analyze`,undefined,a.token,200);
    const c=claimResult.analysis?.detailedWaitingPeriodAnalysis,r=rejectionResult.analysis?.detailedWaitingPeriodAnalysis;
    expect(c&&r,'Latest shared waiting-period response is missing; Express may be stale');
    assert.deepEqual(c,r);
    expect(c.initial.status===expected,`Expected ${expected}; received ${c.initial.status}`);
    expect(rejectionResult.analysis.waitingPeriodVerification.status===expected,'Rejection initial verification disagrees');
    expect(claimResult.requiresManualReview&&rejectionResult.analysis.requiresManualReview,'Manual-review safeguard missing');
    expect(c.preExistingDisease.applicabilityVerified===false&&c.preExistingDisease.passed===null,'PED applicability was inferred automatically');
    expect(c.specificIllness.applicabilityVerified===false&&c.specificIllness.passed===null,'Specific-illness applicability was inferred automatically');
    expect(rejectionResult.mlPrediction?.available,'Live ML prediction unavailable');
    results.waitingEvidence??=[];
    results.waitingEvidence.push({name,status:c.initial.status,initialBoundary:end(c.initial),specificBoundary:end(c.specificIllness),pedBoundary:end(c.preExistingDisease),specificTimeline:c.specificIllness.timelineStatus,pedTimeline:c.preExistingDisease.timelineStatus,manualReview:true,crossModuleEqual:true});
    return {caseRecord,rejection,c,r};
  };
  for(const [name,admission,expected] of [
    ['Admission before commencement','2023-12-31','Date Inconsistency'],
    ['Admission during initial period','2024-01-15','Waiting Period Not Completed'],
    ['Admission after initial period','2024-02-02','Waiting Period Completed'],
    ['Exact initial boundary',a.regression.initialBoundary,'Manual Review Required']]){
    await test('Cross-module waiting: '+name,async()=>{
      const record=await createCase(normal,admission);
      const data=await pair(name,record,expected);
      if(name==='Exact initial boundary')a.regression.boundaryCase=data.caseRecord;
    });
  }
  for(const [name,mutation] of [
    ['Missing admission date',{$unset:{admissionDate:''}}],
    ['Invalid legacy admission date',{$set:{admissionDate:'not-a-date'}}],
    ['Impossible legacy calendar date',{$set:{admissionDate:'2024-02-30'}}]]){
    await test('Cross-module waiting: '+name,async()=>{
      const record=await createCase(normal,'2024-01-15');
      const owned={_id:new mongoose.Types.ObjectId(record._id),user:new mongoose.Types.ObjectId(a.user.id),hospitalName};
      expect(await mongoose.connection.collection('claimcases').countDocuments(owned)===1,'Synthetic fixture identity not verified');
      expect((await mongoose.connection.collection('claimcases').updateOne(owned,mutation)).matchedCount===1,'Synthetic fixture update did not match verified identifier');
      await pair(name,record,'Insufficient Information');
    });
  }
  const uploadedTerms=JSON.parse(JSON.stringify(product));
  // These are audit-owned saved-policy fixtures, not changes to Policy records.
  const createUploaded=async(label,start,missing=false)=>{
    const data={...uploadedTerms,waitingPeriods:missing?{initialDays:null,specificIllnessesMonths:null,preExistingDiseasesMonths:null}:uploadedTerms.waitingPeriods};
    const row={user:new mongoose.Types.ObjectId(a.user.id),sourceType:'Uploaded',policy:null,selectedCoverage:500000,policyNumber:run+'-'+label,policyStartDate:new Date(start+'T00:00:00Z'),policyEndDate:new Date('2027-01-01T00:00:00Z'),status:'Active',extractedPolicyData:data,
      uploadedDocument:{extractedText:missing?'Synthetic document without any waiting-period definitions':`Initial waiting period: ${data.waitingPeriods.initialDays} days. Specific waiting period: ${data.waitingPeriods.specificIllnessesMonths} months. Pre-Existing disease - ${data.waitingPeriods.preExistingDiseasesMonths} months.`,extractionMethod:'PDF Text'}};
    const inserted=await mongoose.connection.collection('userpolicies').insertOne(row);return{...row,_id:String(inserted.insertedId)};
  };
  await test('Cross-module waiting: Missing waiting-period definitions',async()=>{
    const saved=await createUploaded('unknown-definitions','2024-01-01',true);
    const record=await createCase(saved,'2024-02-02');
    await pair('Missing waiting-period definitions',record,'Insufficient Information');
  });
  for(const [label,field] of [['Specific-illness waiting period','specificIllnessesMonths'],['PED waiting period','preExistingDiseasesMonths']]){
    await test('Cross-module waiting: '+label,async()=>{
      const saved=await createUploaded(field,'2020-02-29');
      const amount=product.waitingPeriods[field];
      const expected=field==='specificIllnessesMonths'?'2022-02-28':'2023-02-28';
      expect(amount===(field==='specificIllnessesMonths'?24:36),'Existing catalog fixture differs; test boundary requires review');
      const record=await createCase(saved,expected,label==='Specific-illness waiting period'?'Cataract':'Diabetes');
      const data=await pair(label,record,'Waiting Period Completed');
      const assessment=field==='specificIllnessesMonths'?data.c.specificIllness:data.c.preExistingDisease;
      expect(end(assessment)===expected&&assessment.timelineStatus==='Manual Review Required'&&assessment.status==='Manual Review Required','Calendar-month boundary or applicability safeguard failed');
    });
  }
  await test('API rejects impossible dates rather than saving them',async()=>{
    await status('POST','/api/claim-cases',{userPolicy:normal._id,patientType:'Self',hospitalName,hospitalizationType:'Inpatient',admissionDate:'2024-02-30',dischargeDate:'2024-03-02',diagnosis:'Synthetic fever',totalBillAmount:1000},a.token,400);
  });
}

async function browser(context) {
  const {accounts,check,expect,evaluate,cdp,waitFor,go,setFields,submit,requests}=context;
  const a=accounts[0],fixture=a.regression;
  const test=(name,fn)=>check('browser','Targeted: '+name,fn);
  const text=()=>evaluate(`document.querySelector('#root').textContent`);
  await test('Recommendation cards disclose unknown premium with supplied budget',async()=>{
    await go('/recommendations');await setFields({requiredCoverage:'500000',budget:'20000'});
    const before=requests.filter(r=>r.method==='POST'&&r.path==='/api/recommendations').length;
    await evaluate(`(()=>{const f=document.querySelector('.recommendation-form');f.requestSubmit();f.requestSubmit();})()`);
    await waitFor(`document.querySelectorAll('.recommendation-card').length>0||!!document.querySelector('.recommendation-error')`);
    expect(await evaluate(`document.querySelectorAll('.recommendation-card').length>0`),'Recommendation cards not displayed');
    const t=await text();expect(t.includes('Affordability cannot be verified')&&!t.includes('Within Budget'),'Unknown annual premium was shown as affordable or warning missing');
    expect(requests.filter(r=>r.method==='POST'&&r.path==='/api/recommendations').length===before+1,'Repeated submission created multiple requests');
    expect(await evaluate(`!document.querySelector('button[type="submit"]').disabled`),'Recommendation loading state did not finish');
  });
  await test('Family recommendation cards show all members and uncertainty',async()=>{
    await go('/recommendations');await setFields({requiredCoverage:'500000',coverageType:'Family Floater',budget:'20000'});
    await waitFor(`document.querySelectorAll('.family-member-card').length>0||document.querySelectorAll('input[type="checkbox"]').length>3`);
    // Selection labels are read from the actual form, not synthetic DOM markup.
    await evaluate(`(()=>{const labels=[...document.querySelectorAll('.family-member-option')];for(const word of ['Include yourself','Synthetic Spouse','Synthetic Son']){const label=labels.find(l=>l.textContent.includes(word)&&l.querySelector('input[type="checkbox"]'));if(!label)throw new Error('Missing family selection');const box=label.querySelector('input[type="checkbox"]');if(!box.checked)box.click();}})()`);
    await submit('.recommendation-form');await waitFor(`document.querySelectorAll('.recommendation-card').length>0||!!document.querySelector('.recommendation-error')`);
    const t=await text();expect(t.includes('Family eligibility:')&&t.includes('Insufficient Information')&&t.includes('Child-specific age rules are not stored'),'Family uncertainty messages missing');
  });
  await test('Recommendation validation error and empty-result loading states',async()=>{
    await go('/recommendations');await setFields({requiredCoverage:'500000',budget:'-1'});await submit('.recommendation-form');
    await waitFor(`!!document.querySelector('.recommendation-error')`);
    expect((await text()).includes('positive, finite'),'Invalid budget error missing');
    await setFields({requiredCoverage:'1000000000000',budget:'20000'});await submit('.recommendation-form');
    await waitFor(`document.querySelector('#root').textContent.includes('No policies match these requirements.')`);
    expect(await evaluate(`!document.querySelector('button[type="submit"]').disabled`),'Empty result left loading active');
  });
  await cdp('Emulation.setTimezoneOverride',{timezoneId:'America/Los_Angeles'});
  await test('Claimability exact-boundary, PED and specific-illness displays in alternate timezone',async()=>{
    await go('/claimability');await waitFor(`!!document.querySelector('.claimability-form')`);
    await setFields({userPolicy:fixture.calendarPolicy._id});
    await setFields({hospitalName:'Synthetic Browser Regression Hospital',admissionDate:fixture.initialBoundary,admissionTime:'10:00',dischargeDate:addDays(fixture.initialBoundary,2),dischargeTime:'12:00',diagnosis:'Synthetic fever',totalBillAmount:'10000',roomRentPerDay:'1000',roomType:'Single Private AC'});
    await submit('.claimability-form');await waitFor(`!!document.querySelector('.financial-summary')||!!document.querySelector('.claimability-error')`);
    const initial=await evaluate(`[...document.querySelectorAll('.claimability-check-card')].find(c=>c.textContent.includes('Initial Waiting Period'))?.textContent`);
    expect(initial?.includes('Manual Review Required')&&initial.includes('31/1/2024'),'Claimability boundary status/date missing or shifted');
    expect((await text()).includes('Pre-existing Disease Waiting Period')&&(await text()).includes('Specific Illness Waiting Period'),'Waiting review blocks missing');
    expect((await text()).includes('not a guarantee of claim approval'),'Claim approval disclaimer missing');
  });
  await test('Rejection boundary and timeline displays match Claimability',async()=>{
    await go('/rejection-analysis');await waitFor(`!!document.querySelector('select[name="userPolicy"]')`);
    await setFields({userPolicy:fixture.calendarPolicy._id});
    await waitFor(`[...document.querySelector('select[name="claimCase"]').options].some(o=>o.value===${JSON.stringify(fixture.boundaryCase._id)})`);
    await setFields({claimCase:fixture.boundaryCase._id,rejectionReason:'Initial waiting period not completed',rejectedAmount:'1000',rejectionDate:'2024-02-02'});
    await submit('.rejection-form');await waitFor(`!!document.querySelector('.rejection-waiting-card')||!!document.querySelector('.rejection-error')`);
    const initial=await evaluate(`[...document.querySelectorAll('.rejection-waiting-card')].find(c=>c.textContent.includes('Initial Waiting Period'))?.textContent`);
    expect(initial?.includes('Manual Review Required')&&initial.includes('31/1/2024'),'Rejection boundary disagrees or shifted by timezone');
    expect((await text()).includes('Further Evidence Required'),'Boundary was used to suggest verified recovery');
  });
}
module.exports={run,browser};
