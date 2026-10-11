
const normalize = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const validDate = (value) => {
  if (!value) return null;

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const validNonNegativeNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) && number >= 0
    ? number
    : null;
};

const addMonths = (date, months) => {
  if (!date || !Number.isInteger(months)) return null;

  const result = new Date(date);
  const originalDay = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  const lastDay = new Date(
    Date.UTC(
      result.getUTCFullYear(),
      result.getUTCMonth() + 1,
      0
    )
  ).getUTCDate();

  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
};

function analyzeWaitingPeriods(policyData, userPolicy, claimCase) {
  const waitingPeriods = policyData?.waitingPeriods || {};

  const policyStart = validDate(userPolicy?.policyStartDate);
  const admissionDate = validDate(claimCase?.admissionDate);
  const diagnosis = normalize(claimCase?.diagnosis);

  const initialDays = validNonNegativeNumber(
    waitingPeriods.initialDays
  );

  const specificMonths = validNonNegativeNumber(
    waitingPeriods.specificIllnessesMonths
  );

  const pedMonths = validNonNegativeNumber(
    waitingPeriods.preExistingDiseasesMonths
  );

  const hasDates = Boolean(policyStart && admissionDate);
  const admissionBeforePolicyStart =
    hasDates && admissionDate < policyStart;

  const initialEndDate =
    hasDates && initialDays !== null
      ? new Date(
          policyStart.getTime() + initialDays * 86400000
        )
      : null;

  const initial = {
    status: "Insufficient Information",
    waitingDays: initialDays,
    waitingEndDate: initialEndDate,
    message: "Policy dates or initial waiting-period information is missing."
  };

  if (admissionBeforePolicyStart) {
    initial.status = "Date Inconsistency";
    initial.message =
      "The admission date is before the policy commencement date.";
  } else if (initialEndDate && admissionDate) {
    initial.status =
      admissionDate >= initialEndDate
        ? "Waiting Period Completed"
        : "Waiting Period Not Completed";

    initial.message =
      initial.status === "Waiting Period Completed"
        ? "The recorded admission date is after the initial waiting-period end date. Exceptions and other policy conditions still require review."
        : "The recorded admission date falls within the initial waiting period. Check policy exceptions and continuity benefits.";
  }

  const listedConditions = Array.isArray(
    waitingPeriods.specificIllnessesConditions
  )
    ? waitingPeriods.specificIllnessesConditions
    : [];

  // Only exact normalized matches are treated as matches.
  // Broad descriptions must be reviewed manually.
  const matchedConditions = diagnosis
    ? listedConditions.filter(
        (condition) => normalize(condition) === diagnosis
      )
    : [];

  const specificEndDate =
    policyStart && Number.isInteger(specificMonths)
      ? addMonths(policyStart, specificMonths)
      : null;

  const specificIllness = {
    status: "Manual Review Required",
    waitingMonths: specificMonths,
    waitingEndDate: specificEndDate,
    matchedConditions,
    message:
      "The diagnosis must be compared with the policy's specific-illness list and exact policy wording."
  };

  if (admissionBeforePolicyStart) {
    specificIllness.status = "Date Inconsistency";
    specificIllness.message =
      "The admission date is before the policy commencement date.";
  } else if (matchedConditions.length && specificEndDate && admissionDate) {
    specificIllness.status =
      admissionDate >= specificEndDate
        ? "Waiting Period Completed"
        : "Waiting Period Not Completed";

    specificIllness.message =
      "An exact diagnosis match was found in the stored list. Confirm the condition and policy clause before relying on this result.";
  } else if (specificEndDate && admissionDate) {
    specificIllness.message =
      admissionDate >= specificEndDate
        ? "The recorded specific-illness waiting-period timeline has elapsed, but diagnosis applicability has not been verified."
        : "The specific-illness waiting period may still be running. No exact diagnosis match was established; manual policy review is required.";
  }

  const pedEndDate =
    policyStart && Number.isInteger(pedMonths)
      ? addMonths(policyStart, pedMonths)
      : null;

  const preExistingDisease = {
    status: admissionBeforePolicyStart
      ? "Date Inconsistency"
      : "Manual Review Required",
    waitingMonths: pedMonths,
    waitingEndDate: pedEndDate,
    applicabilityVerified: false,
    message:
      "Pre-existing disease applicability cannot be determined from the claim diagnosis alone. Review medical history, disclosures, continuity benefits, and policy wording."
  };

  if (!admissionBeforePolicyStart && pedEndDate && admissionDate) {
    preExistingDisease.message =
      admissionDate >= pedEndDate
        ? "The recorded PED waiting-period timeline has elapsed. Whether the condition is pre-existing and whether other provisions apply still require verification."
        : "The recorded PED waiting-period timeline has not elapsed. This does not establish that the diagnosed condition is pre-existing.";
  }

  return {
    initial,
    specificIllness,
    preExistingDisease,
    requiresManualReview: true
  };
}

module.exports = { analyzeWaitingPeriods };
