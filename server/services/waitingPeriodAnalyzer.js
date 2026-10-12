const { calendarDate, todayDate } = require('../utils/insuranceValidation');

const normalize = value => typeof value === 'string'
  ? value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  : '';

// Calendar-only input: UTC Date objects, YYYY-MM-DD, or midnight UTC ISO JSON.
function validDate(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? calendarDate(value.toISOString().slice(0, 10)) : null;
  }
  if (typeof value !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(value)) return calendarDate(value.slice(0, 10));
  return calendarDate(value);
}

const duration = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

function addMonths(date, months) {
  date = validDate(date);
  if (!date || duration(months) === null) return null;
  const target = new Date(date);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  if (!Number.isFinite(target.getTime()) || target.getUTCFullYear() > 9999) return null;
  const last = new Date(target);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  target.setUTCDate(Math.min(date.getUTCDate(), last.getUTCDate()));
  return validDate(target);
}

function addDays(date, days) {
  if (!date || duration(days) === null) return null;
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return validDate(result);
}

function definition(waiting, field, savedPolicy, policyData) {
  const value = duration(waiting[field]);
  if (value === null) return null;
  if (savedPolicy?.sourceType !== 'Uploaded') {
    if (typeof policyData?.$isDefault === 'function' && (policyData.$isDefault(`waitingPeriods.${field}`) || policyData.$isDefault('waitingPeriods'))) return null;
    return value;
  }
  // Old uploads defaulted absent terms to zero. Do not turn an extraction default
  // into a verified zero-day/month period. Confirm the stored term in source text.
  const source = savedPolicy.uploadedDocument?.extractedText;
  if (typeof source !== 'string' || !source.trim()) return null;
  const expressions = {
    initialDays: [/Initial\s+waiting\s+period\s*:\s*(\d+)\s*days/gi],
    specificIllnessesMonths: [/Specific\s+waiting\s+period\s*:\s*(\d+)\s*months/gi, /List\s+of\s+Diseases\s+excluded\s+for\s+(\d+)\s+months\s*:/gi],
    preExistingDiseasesMonths: [/Pre-\s*Existing\s+disease\s*-\s*(\d+)\s*months/gi]
  };
  const values = expressions[field].flatMap(expression => [...source.matchAll(expression)].map(match => Number(match[1])));
  return values.length && values.every(number => number === value) ? value : null;
}

function timeline(start, admission, amount, unit, dateIssue) {
  const end = unit === 'days' ? addDays(start, amount) : addMonths(start, amount);
  const base = {
    status: 'Insufficient Information', completed: null, passed: null,
    waitingEndDate: end, policyCommencementDate: start, admissionDate: admission,
    ...(unit === 'days' ? { waitingDays: amount } : { waitingMonths: amount }),
    boundaryRequiresReview: false, requiresManualReview: true,
    message: 'Policy commencement, admission date or a recorded waiting-period definition is missing or invalid.'
  };
  if (dateIssue) return { ...base, status: 'Date Inconsistency', passed: false, message: dateIssue };
  if (!start || !admission || amount === null || !end) return base;
  if (amount > 0 && admission.getTime() === end.getTime()) {
    return { ...base, status: 'Manual Review Required', boundaryRequiresReview: true,
      message: 'Admission is exactly on the calculated waiting-period boundary. The stored wording does not establish whether this day is included; verify the exact policy clause.' };
  }
  const completed = amount === 0 || admission > end;
  return { ...base, status: completed ? 'Waiting Period Completed' : 'Waiting Period Not Completed', completed, passed: completed,
    message: completed
      ? 'The recorded waiting-period timeline has elapsed. Completion does not guarantee claim approval; confirm policy wording, exceptions and continuity benefits.'
      : 'The recorded waiting-period timeline has not elapsed. Verify policy-specific exceptions and continuity benefits before drawing a claim conclusion.' };
}

function analyzeWaitingPeriods(policyData, userPolicy, claimCase) {
  const waiting = policyData?.waitingPeriods || {};
  const start = validDate(userPolicy?.policyStartDate);
  const admission = validDate(claimCase?.admissionDate);
  const end = validDate(userPolicy?.policyEndDate);
  const discharge = validDate(claimCase?.dischargeDate);
  let dateIssue = null;
  if (start && admission && admission < start) dateIssue = 'The admission date is before the policy commencement date. Verify the dates before assessing waiting periods.';
  else if (userPolicy?.policyEndDate != null && (!end || start && end <= start)) dateIssue = 'The recorded policy period is invalid or inconsistent. Verify commencement and end dates.';
  else if (claimCase?.dischargeDate != null && (!discharge || admission && discharge < admission)) dateIssue = 'The recorded discharge date is invalid or before admission. Verify the hospitalization dates.';
  else if (admission && admission.toISOString().slice(0, 10) > todayDate() || discharge && discharge.toISOString().slice(0, 10) > todayDate()) dateIssue = 'A recorded hospitalization date is in the future. Verify the hospitalization dates.';

  const initial = timeline(start, admission, definition(waiting, 'initialDays', userPolicy, policyData), 'days', dateIssue);
  const specific = timeline(start, admission, definition(waiting, 'specificIllnessesMonths', userPolicy, policyData), 'months', dateIssue);
  const ped = timeline(start, admission, definition(waiting, 'preExistingDiseasesMonths', userPolicy, policyData), 'months', dateIssue);
  const lists = [waiting.specificIllnessConditions, waiting.specificIllnessesConditions].filter(Array.isArray).flat();
  const conditions = [...new Map(lists.filter(value => normalize(value)).map(value => [normalize(value), value.trim()])).values()];
  const diagnosis = normalize(claimCase?.diagnosis);
  const matches = diagnosis ? conditions.filter(condition => normalize(condition) === diagnosis) : [];
  const review = (result, message) => ({
    ...result, timelineStatus: result.status,
    status: ['Waiting Period Completed', 'Waiting Period Not Completed'].includes(result.status) ? 'Manual Review Required' : result.status,
    passed: null, applicabilityVerified: false, applicable: null,
    message: `${result.message} ${message}`
  });
  const specificIllness = { ...review(specific, 'Specific-illness applicability requires the exact policy clause and medical evidence. Diagnosis mentions are review hints, not established applicability.'), matchedConditions: matches };
  const preExistingDisease = review(ped, 'Pre-existing disease applicability is not established by a diagnosis or declared disease name. Review disclosures, medical history and policy-specific evidence.');
  const wording = [waiting.description, ...(Array.isArray(policyData?.preExistingConditionsRules) ? policyData.preExistingConditionsRules : []), ...(Array.isArray(policyData?.importantConditions) ? policyData.importantConditions : [])]
    .filter(value => typeof value === 'string' && value.trim());
  return {
    initial, specificIllness, preExistingDisease,
    policyAgeDays: start && admission ? Math.floor((admission - start) / 86400000) : null,
    policyWordingToReview: [...new Set(wording)],
    requiresManualReview: true
  };
}

module.exports = { analyzeWaitingPeriods, validDate, addMonths };
