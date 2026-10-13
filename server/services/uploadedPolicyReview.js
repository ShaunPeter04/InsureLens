const { analyzeWaitingPeriods, validDate } = require('./waitingPeriodAnalyzer');

function extractionReview(saved) {
  const p = saved.extractedPolicyData?.toObject?.() || saved.extractedPolicyData || {};
  const evidence = typeof saved.uploadedDocument?.extractedText === 'string' ? saved.uploadedDocument.extractedText : '';
  const supported = (value, pattern) => {
    const matches = [...evidence.matchAll(pattern)].map(m => Number(m[1]));
    return typeof value === 'number' && Number.isFinite(value) && matches.length && matches.every(n => n === value) ? value : null;
  };
  const fields = [
    ['Initial waiting period (days)', supported(p.waitingPeriods?.initialDays, /Initial\s+waiting\s+period\s*:\s*(\d+)\s*days/gi)],
    ['Specific-illness waiting period (months)', supported(p.waitingPeriods?.specificIllnessesMonths, /(?:Specific\s+waiting\s+period\s*:\s*|List\s+of\s+Diseases\s+excluded\s+for\s+)(\d+)\s*months/gi)],
    ['PED waiting period (months)', supported(p.waitingPeriods?.preExistingDiseasesMonths, /Pre-\s*Existing\s+disease\s*-\s*(\d+)\s*months/gi)],
    ['Room-rent percentage', supported(p.roomRentLimit?.percentageOfSumInsured, /Room\s+Rent,\s*Boarding\s*&\s*Nursing\s+Charges\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*of\s+Sum\s+Insured/gi)],
    ['Co-payment percentage', supported(p.coPaymentPercentage, /Co[- ]payment\s*:\s*(\d+(?:\.\d+)?)\s*%/gi)],
    ['Deductible amount', supported(p.deductibleAmount, /Deductible\s*:\s*(?:INR|Rs\.?|₹)?\s*(\d+(?:\.\d+)?)(?![\d,.])/gi)]
  ].map(([field, value]) => ({ field, value, status: value === null ? 'Unknown' : 'Extracted — unverified' }));
  fields.push({field:'Minimum inpatient hours', value:supported(p.hospitalizationCoverage?.minimumHospitalizationHours, /stays\s+for\s+at\s+least\s+(\d+)\s+hours/gi), status:'Extracted when supported — applicability unverified'});
  fields.push({field:'Detected exclusion mentions (not a complete list)',value:Array.isArray(p.majorExclusions) && p.majorExclusions.length ? p.majorExclusions.filter(v=>typeof v==='string').join('; ') : null,status:'Unverified; absence does not mean none apply'});
  fields.push({field:'Detected sub-limits (not a complete list)',value:Array.isArray(p.subLimits) && p.subLimits.length ? p.subLimits.filter(v=>v && typeof v.category==='string' && Number.isFinite(v.limitPercentage)).map(v=>`${v.category}: ${v.limitPercentage}%`).join('; ') : null,status:'Unverified; absence does not mean none apply'});
  fields.push(...['Hospitalization coverage', 'Room category / fixed daily limit', 'Complete exclusions', 'Complete sub-limits'].map(field => ({field, value:null, status:'Manual review required'})));
  return {status:'Unverified', requiresManualReview:true, fields,
    message:'Review extracted terms against the original policy and endorsements. Extraction does not verify coverage. Missing exclusions or sub-limits do not mean none apply.',
    manuallyEntered:['Policy number', 'Sum insured', 'Policy start date', 'Policy end date']};
}

function uploadedClaimAnalysis(claim, saved, policy) {
  const waiting = analyzeWaitingPeriods(policy, saved, claim);
  const start = validDate(saved.policyStartDate), end = validDate(saved.policyEndDate), admission = validDate(claim.admissionDate);
  const active = start && end && admission && end > start ? admission >= start && admission <= end : null;
  const expenses = (claim.nonPayableExpenses || []).map(e => ({expenseName:e.expenseName, amount:e.amount, reason:e.reason || 'User reported; unverified'}));
  const total = expenses.reduce((sum,e) => sum + e.amount,0);
  const unknown = message => ({passed:null, status:'Insufficient Information', requiresManualReview:true, message});
  return {claimCaseId:claim._id, policyName:policy.policyName || 'Uploaded Policy',
    claimabilityScore:null, assessment:'Insufficient Information — Manual Review Required',
    hasBlockingIssues:false, blockingIssues:[], requiresManualReview:true, extractionReview:extractionReview(saved),
    analysis:{
      policyActive:{passed:active,message:active === null ? 'Policy dates are missing or inconsistent.' : active ? 'Manually entered policy dates include admission; coverage is unverified.' : 'Admission is outside the manually entered policy period.'},
      detailedWaitingPeriodAnalysis:waiting, initialWaitingPeriod:waiting.initial, pedWaitingPeriod:waiting.preExistingDisease,
      hospitalizationCoverage:unknown('Uploaded hospitalization coverage and applicability require review of the original policy.'),
      roomRent:unknown('Room-rent terms are unverified. An absent limit is not an unrestricted room entitlement.'),
      coverage:{passed:claim.totalBillAmount <= saved.selectedCoverage,totalBillAmount:claim.totalBillAmount,sumInsured:saved.selectedCoverage,message:'Bill compared with manually entered sum insured only; this does not verify payable coverage.'},
      financialImpact:{nonPayableExpenses:expenses,totalNonPayableExpenses:total,coPaymentPercentage:null,deductibleAmount:null,estimatedCoPayment:null,estimatedDeductible:null,estimatedAmountAfterBasicDeductions:null,message:'A payable amount cannot be estimated until co-payment, deductible, room-rent, exclusions and sub-limits are verified against the policy. Extracted zero values remain unverified.'},
      requiresReview:{pedWaitingPeriod:waiting.preExistingDisease,specificIllnessWaitingPeriod:waiting.specificIllness,waitingPolicyWording:waiting.policyWordingToReview,
        exclusionCheck:{matched:false,message:'The complete exclusions are unverified; missing matches do not establish absence of exclusions.'},
        preExistingConditionRules:[], majorExclusions:[], importantConditions:['Review the original policy and endorsements before assessing coverage.'],
        subLimits:{matched:false,matchedSubLimits:[],allSubLimits:[],message:'Sub-limits are unverified; missing matches do not establish absence of restrictions.'},message:'Uploaded terms require manual review.'}
    }};
}
module.exports = { extractionReview, uploadedClaimAnalysis };
