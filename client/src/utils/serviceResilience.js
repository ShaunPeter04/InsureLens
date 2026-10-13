const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
const text = value => typeof value === 'string';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const readable = value => value == null || text(value) || finite(value) || typeof value === 'boolean';
const terms = value => value == null || object(value) && Object.values(value).every(v=>readable(v) || Array.isArray(v) && v.every(text));
function policyIdentity(p) {
  return object(p) && id(p._id) && text(p.policyName) && text(p.insuranceCompany) && Array.isArray(p.policyType) && p.policyType.every(text) && Array.isArray(p.coverageAmounts) && p.coverageAmounts.every(finite);
}

export function validServiceResponse(url, method, data) {
  const route = url.split('?')[0];
  const lists = {'/api/policies':'policies','/api/user-policies':'userPolicies','/api/claim-cases':'claimCases','/api/family-members':'familyMembers','/api/rejection-cases':'rejectionCases'};
  if (method === 'get' && lists[route]) {
    const rows = data?.[lists[route]];
    return Array.isArray(rows) && rows.every(row => object(row) && id(row._id) &&
      (route !== '/api/policies' || policyIdentity(row) && terms(row.waitingPeriods) && terms(row.roomRentLimit) && readable(row.coPaymentPercentage)) &&
      (route !== '/api/family-members' || text(row.name)) &&
      (route !== '/api/user-policies' || finite(row.selectedCoverage) && readable(row.policyNumber) &&
        [row.policy,row.extractedPolicyData].every(p=>p == null || object(p) && readable(p.policyName) && readable(p.insuranceCompany)) &&
        (!row.uploadedDocument || object(row.uploadedDocument) && readable(row.uploadedDocument.originalName) && readable(row.uploadedDocument.extractionMethod)) &&
        (!row.extractionReview || object(row.extractionReview) && readable(row.extractionReview.message) && Array.isArray(row.extractionReview.fields) && row.extractionReview.fields.every(f=>object(f) && text(f.field) && text(f.status) && readable(f.value)))));
  }
  if (method === 'post' && ['/api/claim-cases','/api/rejection-cases','/api/user-policies','/api/user-policies/upload'].includes(route)) {
    const key = route === '/api/claim-cases' ? 'claimCase' : route === '/api/rejection-cases' ? 'rejectionCase' : 'userPolicy';
    return object(data?.[key]) && id(data[key]._id);
  }
  if (method === 'get' && /^\/api\/policies\//.test(route)) {
    const p = data?.policy;
    return policyIdentity(p) &&
      ['preExistingConditionsRules','majorExclusions','importantConditions'].every(field=>Array.isArray(p[field]) && p[field].every(text)) &&
      Array.isArray(p.subLimits) && p.subLimits.every(v=>object(v) && Object.values(v).every(readable)) &&
      ['eligibility','waitingPeriods','hospitalizationCoverage','roomRentLimit'].every(field=>object(p[field]) && terms(p[field])) && readable(p.coPaymentPercentage) && readable(p.deductibleAmount);
  }
  return true;
}

export function serviceErrorMessage(error) {
  if (['ECONNABORTED','ETIMEDOUT'].includes(error.code)) return 'The request timed out. Your input has been kept. Please try again.';
  const message = error.response?.data?.message;
  if (typeof message === 'string' && message.trim() && message.length <= 500) return message;
  if (error.code === 'INVALID_RESPONSE') return 'The service returned incomplete information. Your input has been kept. Please try again.';
  if (error.response?.status === 503) return 'The service is temporarily unavailable. Please try again shortly.';
  return 'Unable to reach the service. Check your connection and try again. Your input has been kept.';
}

export function submissionHeaders(ref, payload) {
  const signature = JSON.stringify(payload);
  if (ref.current?.signature !== signature) ref.current = {signature,key:crypto.randomUUID()};
  return {'Idempotency-Key':ref.current.key};
}
