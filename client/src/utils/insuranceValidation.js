// Request validation runs before Mongoose can coerce invalid input types.
const isValidId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const failure = (error) => ({ error, data: null });

function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function todayDate() {
  // Both API and browser use the same calendar day for this Indian application.
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type) => parts.find(item => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function money(value, { optional = false, minimum = 0 } = {}) {
  if (optional && (value === undefined || value === "")) return 0;
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= minimum ? amount : null;
}

function text(value, limit, optional = false) {
  if (optional && value === undefined) return "";
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if ((!optional && !normalized) || normalized.length > limit) return null;
  return normalized;
}

function validateSavedPolicy(input, { uploaded = false, coverageAmounts } = {}) {
  if (!isObject(input)) return failure("Policy details must be an object");
  if (!uploaded && !isValidId(input.policyId)) return failure("Please select a valid insurance policy");
  const selectedCoverage = money(input.selectedCoverage, { minimum: 1 });
  if (selectedCoverage === null) return failure("Sum insured must be a finite number of at least 1");
  if (coverageAmounts && !coverageAmounts.includes(selectedCoverage)) return failure("Selected coverage is not available for this policy");
  const policyNumber = text(input.policyNumber, 100, true);
  if (policyNumber === null) return failure("Policy number must be text of at most 100 characters");
  if (!calendarDate(input.policyStartDate) || !calendarDate(input.policyEndDate)) return failure("Enter valid policy start and end dates (YYYY-MM-DD)");
  if (input.policyEndDate <= input.policyStartDate) return failure("Policy end date must be after the start date");
  return { error: null, data: {
    ...(uploaded ? {} : { policyId: input.policyId }), selectedCoverage, policyNumber,
    policyStartDate: input.policyStartDate, policyEndDate: input.policyEndDate
  } };
}

function validateClaimCase(input, { validateDates = true } = {}) {
  if (!isObject(input)) return failure("Hospitalization details must be an object");
  if (!isValidId(input.userPolicy)) return failure("Please select a valid saved policy");
  if (!["Self", "Family Member"].includes(input.patientType)) return failure("Please select a valid patient type");
  if (input.patientType === "Family Member" && !isValidId(input.familyMember)) return failure("Please select a valid family member");
  if (input.familyMember !== undefined && input.familyMember !== "" && input.familyMember !== null && !isValidId(input.familyMember)) return failure("Invalid family member ID");
  if (!["Inpatient", "Day Care"].includes(input.hospitalizationType)) return failure("Please select a valid hospitalization type");
  const data = { userPolicy: input.userPolicy, patientType: input.patientType,
    familyMember: input.patientType === "Family Member" ? input.familyMember : null,
    hospitalizationType: input.hospitalizationType };
  for (const [field, label, limit, optional] of [
    ["hospitalName", "Hospital name", 200, false], ["diagnosis", "Diagnosis", 1000, false],
    ["treatment", "Treatment", 2000, true], ["roomType", "Room type", 100, true]
  ]) {
    data[field] = text(input[field], limit, optional);
    if (data[field] === null) return failure(`${label} ${optional ? "must be text" : "is required"} and must contain at most ${limit} characters`);
  }
  if (validateDates) {
    if (!calendarDate(input.admissionDate) || !calendarDate(input.dischargeDate)) return failure("Enter valid admission and discharge dates (YYYY-MM-DD)");
    if (input.dischargeDate < input.admissionDate) return failure("Discharge date cannot be before admission date");
    if (input.admissionDate > todayDate() || input.dischargeDate > todayDate()) return failure("Completed hospitalization dates cannot be in the future");
    data.admissionDate = input.admissionDate;
    data.dischargeDate = input.dischargeDate;
  }
  for (const field of ["admissionTime", "dischargeTime"]) {
    const value = input[field] === undefined ? "" : input[field];
    if (typeof value !== "string" || (value !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) return failure("Admission and discharge times must be valid times (HH:mm)");
    data[field] = value;
  }
  if (data.admissionTime && data.dischargeTime && data.admissionDate === data.dischargeDate && data.dischargeTime < data.admissionTime) return failure("Discharge time cannot be before admission time on the same day");
  data.totalBillAmount = money(input.totalBillAmount);
  data.roomRentPerDay = money(input.roomRentPerDay, { optional: true });
  if (data.totalBillAmount === null) return failure("Hospital bill must be a finite, nonnegative number");
  if (data.roomRentPerDay === null) return failure("Room rent must be a finite, nonnegative number");
  for (const field of ["isPlannedHospitalization", "isEmergency"]) {
    if (input[field] !== undefined && typeof input[field] !== "boolean") return failure("Planned hospitalization and emergency selections must be true or false");
    data[field] = input[field] ?? false;
  }
  if (input.claimStatus !== undefined && !["Not Submitted", "Submitted", "Approved", "Partially Approved", "Rejected"].includes(input.claimStatus)) return failure("Invalid claim status");
  const expenses = input.nonPayableExpenses === undefined ? [] : input.nonPayableExpenses;
  if (!Array.isArray(expenses) || expenses.length > 100) return failure("Non-payable expenses must be an array of at most 100 items");
  data.nonPayableExpenses = [];
  let expenseTotal = 0;
  for (const expense of expenses) {
    if (!isObject(expense)) return failure("Each non-payable expense must be an object");
    const expenseName = text(expense.expenseName, 200);
    const reason = text(expense.reason, 1000, true);
    const amount = money(expense.amount);
    if (expenseName === null || reason === null || amount === null) return failure("Each non-payable expense needs a name, a finite nonnegative amount and a valid optional reason");
    expenseTotal += amount;
    data.nonPayableExpenses.push({ expenseName, reason, amount });
  }
  if (!Number.isFinite(expenseTotal) || expenseTotal - data.totalBillAmount > Math.max(1, expenseTotal, data.totalBillAmount) * Number.EPSILON * 4) return failure("Total non-payable expenses cannot exceed the hospital bill");
  return { error: null, data };
}

function validateRejectionCase(input) {
  if (!isObject(input)) return failure("Rejection details must be an object");
  if (!isValidId(input.userPolicy)) return failure("Please select a valid insurance policy");
  if (input.claimCase !== undefined && input.claimCase !== "" && input.claimCase !== null && !isValidId(input.claimCase)) return failure("Invalid hospitalization case ID");
  const rejectionReason = text(input.rejectionReason, 5000);
  const insurerRemarks = text(input.insurerRemarks, 5000, true);
  if (rejectionReason === null) return failure("Rejection reason is required and must contain at most 5000 characters");
  if (insurerRemarks === null) return failure("Insurer remarks must be text of at most 5000 characters");
  const rejectedAmount = money(input.rejectedAmount, { optional: true });
  if (rejectedAmount === null) return failure("Rejected amount must be a finite, nonnegative number");
  if (input.rejectionDate !== undefined && input.rejectionDate !== "" && (!calendarDate(input.rejectionDate) || input.rejectionDate > todayDate())) return failure("Enter a valid rejection date that is not in the future");
  return { error: null, data: { userPolicy: input.userPolicy, claimCase: input.claimCase || null,
    rejectionReason, insurerRemarks, rejectedAmount, rejectionDate: input.rejectionDate || null } };
}

export { isValidId, calendarDate, todayDate, money, text, isObject, validateSavedPolicy, validateClaimCase, validateRejectionCase };
