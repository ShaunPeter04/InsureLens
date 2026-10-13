const { extractionReview } = require('../services/uploadedPolicyReview');
const numeric = (value, max = Number.MAX_SAFE_INTEGER) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
const boolean = value => typeof value === 'boolean' ? value : null;
const strings = value => Array.isArray(value) && value.length <= 100 && value.every(v => typeof v === 'string' && v.length <= 2000) ? value : null;

function extractedTerms(p) {
  return {
    insuranceCompany:typeof p?.insuranceCompany === 'string' ? p.insuranceCompany.slice(0,500) : '',
    policyName:typeof p?.policyName === 'string' ? p.policyName.slice(0,500) : '',
    waitingPeriods:{initialDays:numeric(p?.waitingPeriods?.initialDays), specificIllnessesMonths:numeric(p?.waitingPeriods?.specificIllnessesMonths), preExistingDiseasesMonths:numeric(p?.waitingPeriods?.preExistingDiseasesMonths), specificIllnessConditions:strings(p?.waitingPeriods?.specificIllnessConditions)},
    hospitalizationCoverage:{inpatientCovered:boolean(p?.hospitalizationCoverage?.inpatientCovered), minimumHospitalizationHours:numeric(p?.hospitalizationCoverage?.minimumHospitalizationHours), daycareTreatmentsCovered:boolean(p?.hospitalizationCoverage?.daycareTreatmentsCovered)},
    roomRentLimit:{hasCap:boolean(p?.roomRentLimit?.hasCap), percentageOfSumInsured:numeric(p?.roomRentLimit?.percentageOfSumInsured,100), maxPerDay:numeric(p?.roomRentLimit?.maxPerDay), roomTypeAllowed:typeof p?.roomRentLimit?.roomTypeAllowed === 'string' ? p.roomRentLimit.roomTypeAllowed.slice(0,200) : null},
    coPaymentPercentage:numeric(p?.coPaymentPercentage,100), deductibleAmount:numeric(p?.deductibleAmount),
    majorExclusions:strings(p?.majorExclusions),
    subLimits:Array.isArray(p?.subLimits) && p.subLimits.length <= 100 && p.subLimits.every(v => v && typeof v.category === 'string' && numeric(v.limitPercentage,100) !== null) ? p.subLimits : null,
    preExistingConditionsRules:null, importantConditions:null
  };
}

function publicPolicy(doc) {
  const p = doc.toObject ? doc.toObject() : {...doc};
  if (p.sourceType === 'Uploaded') {
    p.extractionReview = extractionReview(p);
    // Never expose schema defaults on historical uploads as confirmed policy terms.
    p.extractedPolicyData = extractedTerms(p.extractedPolicyData);
    const fields = p.extractionReview.fields;
    p.extractedPolicyData.coPaymentPercentage = fields[4].value;
    p.extractedPolicyData.deductibleAmount = fields[5].value;
    p.extractedPolicyData.roomRentLimit = {hasCap: fields[3].value === null ? null : true, percentageOfSumInsured:fields[3].value, maxPerDay:null, roomTypeAllowed:null};
    p.uploadedDocument = {...p.uploadedDocument};
    for (const field of ['extractedText','filePath','fileName']) delete p.uploadedDocument[field];
  }
  return p;
}
module.exports = {extractedTerms, publicPolicy};
