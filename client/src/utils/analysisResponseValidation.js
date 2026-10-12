const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = value => typeof value === 'number' && Number.isFinite(value);
const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string');

function validWaitingPeriods(value) {
  if (value === undefined) return true;
  if (!object(value)) return false;
  const statuses = ['Waiting Period Completed', 'Waiting Period Not Completed', 'Insufficient Information', 'Date Inconsistency', 'Manual Review Required'];
  const calendarDate = value => {
    if (value === null || value === undefined) return true;
    if (value instanceof Date) return Number.isFinite(value.getTime());
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(value)) return false;
    const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10);
  };
  for (const key of ['initial', 'specificIllness', 'preExistingDisease']) {
    const result = value[key];
    if (!object(result) || !statuses.includes(result.status) || typeof result.message !== 'string') return false;
    if (result.timelineStatus !== undefined && !statuses.includes(result.timelineStatus)) return false;
    for (const flag of ['passed', 'completed']) if (result[flag] !== undefined && ![true, false, null].includes(result[flag])) return false;
    for (const field of ['waitingEndDate', 'policyCommencementDate', 'admissionDate']) if (!calendarDate(result[field])) return false;
  }
  return value.policyWordingToReview === undefined || strings(value.policyWordingToReview);
}

export function validClaimAnalysis(value) {
  if (!object(value) || !number(value.claimabilityScore) || !object(value.analysis)) return false;
  const a = value.analysis;
  if (!validWaitingPeriods(a.detailedWaitingPeriodAnalysis)) return false;
  for (const field of ['policyActive', 'initialWaitingPeriod', 'hospitalizationCoverage', 'roomRent', 'coverage']) {
    if (!object(a[field]) || ![true, false, null].includes(a[field].passed) || typeof a[field].message !== 'string') return false;
  }
  if (!number(a.coverage.totalBillAmount) || !object(a.financialImpact)) return false;
  for (const field of ['totalNonPayableExpenses', 'estimatedCoPayment', 'estimatedDeductible', 'estimatedAmountAfterBasicDeductions']) {
    if (!number(a.financialImpact[field])) return false;
  }
  if (!Array.isArray(a.financialImpact.nonPayableExpenses) || a.financialImpact.nonPayableExpenses.some(item => !object(item) || !number(item.amount) || typeof item.expenseName !== 'string' || typeof item.reason !== 'string')) return false;
  if (!object(a.requiresReview)) return false;
  for (const field of ['preExistingConditionRules', 'majorExclusions', 'importantConditions']) {
    if (!strings(a.requiresReview[field])) return false;
  }
  const subLimits = a.requiresReview.subLimits;
  if (!object(subLimits) || !Array.isArray(subLimits.matchedSubLimits) || !Array.isArray(subLimits.allSubLimits) || [...subLimits.matchedSubLimits, ...subLimits.allSubLimits].some(item => !object(item))) return false;
  return value.blockingIssues === undefined || strings(value.blockingIssues);
}

export function validRejectionAnalysis(value) {
  if (!object(value?.analysis)) return false;
  const a = value.analysis;
  if (!validWaitingPeriods(a.detailedWaitingPeriodAnalysis)) return false;
  return strings(a.categories) && strings(a.recoveryActions) && strings(a.explanations) && Array.isArray(a.policyClausesToReview) && a.policyClausesToReview.every(item => object(item));
}
