const { calendarDate, todayDate, money, text, isObject, validateClaimCase } = require('./insuranceValidation');
const { diseases } = require('./recommendationValidation');

function storedDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? calendarDate(value.toISOString().slice(0, 10)) : null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(value)) return calendarDate(value.slice(0, 10));
  return calendarDate(value);
}

function profileAge(value) {
  const date = storedDate(value);
  if (!date || date.toISOString().slice(0, 10) > todayDate()) return null;
  const today = todayDate();
  const birth = date.toISOString().slice(0, 10);
  const age = Number(today.slice(0, 4)) - Number(birth.slice(0, 4)) - Number(today.slice(5) < birth.slice(5));
  return age >= 0 && age <= 120 ? age : null;
}

function validatePolicyTerms(policy, { recommendation = false, allowIncompleteWaiting = false } = {}) {
  const p = policy?.toObject ? policy.toObject() : policy;
  if (!isObject(p)) return 'Policy terms are unavailable';
  const finite = (value, max = Infinity) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
  for (const field of allowIncompleteWaiting ? [] : ['initialDays', 'specificIllnessesMonths', 'preExistingDiseasesMonths']) {
    if (!finite(p.waitingPeriods?.[field])) return 'Waiting-period terms are missing or invalid';
  }
  if (typeof p.hospitalizationCoverage?.inpatientCovered !== 'boolean' || typeof p.hospitalizationCoverage?.daycareTreatmentsCovered !== 'boolean' || !finite(p.hospitalizationCoverage?.minimumHospitalizationHours)) return 'Hospitalization coverage terms are missing or invalid';
  if (typeof p.roomRentLimit?.hasCap !== 'boolean') return 'Room-rent terms are missing or invalid';
  for (const field of ['maxPerDay', 'percentageOfSumInsured']) {
    if (p.roomRentLimit[field] !== undefined && !finite(p.roomRentLimit[field], field === 'percentageOfSumInsured' ? 100 : Infinity)) return 'Room-rent terms are invalid';
  }
  if (p.roomRentLimit.roomTypeAllowed !== undefined && text(p.roomRentLimit.roomTypeAllowed, 200) === null) return 'Room type terms are invalid';
  if (!finite(p.coPaymentPercentage, 100) || !finite(p.deductibleAmount)) return 'Co-payment or deductible terms are missing or invalid';
  for (const values of [p.majorExclusions, p.importantConditions, p.preExistingConditionsRules, p.waitingPeriods?.specificIllnessConditions]) {
    if (values !== undefined && (!Array.isArray(values) || values.some(value => typeof value !== 'string'))) return 'Policy conditions must contain valid text arrays';
  }
  if (p.subLimits !== undefined && (!Array.isArray(p.subLimits) || p.subLimits.some(value => !isObject(value) || typeof value.category !== 'string'))) return 'Policy sub-limit information is invalid';
  if (recommendation) {
    if (text(p.policyName, 500) === null || text(p.insuranceCompany, 500) === null || !Array.isArray(p.policyType) || !p.policyType.length || p.policyType.some(value => !['Individual', 'Family Floater', 'Senior Citizen', 'Critical Illness'].includes(value))) return 'Policy identity or type is invalid';
    if (!Array.isArray(p.coverageAmounts) || !p.coverageAmounts.length || p.coverageAmounts.some(value => !finite(value) || value <= 0)) return 'Policy coverage amounts are invalid';
    // Missing eligibility rules are an uncertainty, not grounds to discard a family.
    if (p.eligibility !== undefined && p.eligibility !== null) {
      if (!isObject(p.eligibility)) return 'Policy age eligibility is invalid';
      const e = p.eligibility;
      if ([e.minAge, e.maxAge].some(value => value !== undefined && value !== null && !finite(value, 120)) ||
          (e.minAge != null && e.maxAge != null && e.minAge > e.maxAge) ||
          (e.familyFloaterAllowed != null && typeof e.familyFloaterAllowed !== 'boolean')) return 'Policy age eligibility is invalid';
    }
    for (const field of ['preHospitalizationDays', 'postHospitalizationDays']) {
      if (p.hospitalizationCoverage[field] !== undefined && !finite(p.hospitalizationCoverage[field])) return 'Hospitalization coverage terms are invalid';
    }
    // An unusable/unknown premium does not discard otherwise valid coverage terms.
    // Affordability assessment handles its uncertainty independently.
  }
  return null;
}

function validateStoredAnalysis(claim, savedPolicy, policy, { allowIncompleteWaiting = false } = {}) {
  const c = claim?.toObject ? claim.toObject() : claim;
  if (!isObject(c)) return 'Hospitalization details are unavailable';
  const admission = storedDate(c.admissionDate), discharge = storedDate(c.dischargeDate);
  const start = storedDate(savedPolicy?.policyStartDate), end = storedDate(savedPolicy?.policyEndDate);
  if (!allowIncompleteWaiting && (!start || !end || end <= start)) return 'Saved policy dates are missing or inconsistent';
  if (!allowIncompleteWaiting && (!admission || !discharge)) return 'Hospitalization dates are missing or invalid';
  const input = { ...c, userPolicy: String(savedPolicy._id),
    familyMember: c.familyMember ? String(c.familyMember) : null,
    admissionDate: admission?.toISOString().slice(0, 10), dischargeDate: discharge?.toISOString().slice(0, 10) };
  const { error } = validateClaimCase(input, { validateDates: !allowIncompleteWaiting });
  if (error) return error;
  const coverage = money(savedPolicy.selectedCoverage);
  if (coverage === null || coverage <= 0) return 'Saved policy sum insured is missing or invalid';
  return validatePolicyTerms(policy, { allowIncompleteWaiting });
}

module.exports = { storedDate, profileAge, validatePolicyTerms, validateStoredAnalysis, diseases };
