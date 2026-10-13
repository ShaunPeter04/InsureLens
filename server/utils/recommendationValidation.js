const { isValidId, calendarDate, todayDate, money, text, isObject } = require("./insuranceValidation");

function diseases(value = []) {
  if (!Array.isArray(value) || value.length > 100 || value.some(item => text(item, 200) === null)) return null;
  return [...new Map(value.map(item => [item.trim().toLowerCase(), item.trim()])).values()];
}

function validateRecommendation(input) {
  const fail = error => ({ error, data: null });
  if (!isObject(input)) return fail("Recommendation details must be an object");
  const requiredCoverage = money(input.requiredCoverage);
  if (requiredCoverage === null || requiredCoverage <= 0) return fail("Required coverage must be a positive, finite number");
  if (!["Individual", "Family Floater"].includes(input.coverageType)) return fail("Please select a valid coverage type");
  const budget = input.budget === undefined || input.budget === null || input.budget === "" ? null : money(input.budget);
  if (budget !== null && budget <= 0 || budget === null && ![undefined, null, ""].includes(input.budget)) return fail("Annual premium budget must be a positive, finite number when supplied");
  const coPaymentPreference = input.coPaymentPreference === undefined ? 0 : money(input.coPaymentPreference);
  if (coPaymentPreference === null || coPaymentPreference > 100) return fail("Co-payment preference must be between 0 and 100");
  const roomRentPreference = input.roomRentPreference === undefined ? "No Restriction" : input.roomRentPreference;
  if (!["No Restriction", "Flexible"].includes(roomRentPreference)) return fail("Please select a valid room-rent preference");
  const alcoholConsumption = input.alcoholConsumption === undefined ? "Never" : input.alcoholConsumption;
  if (!["Never", "Occasional", "Regular"].includes(alcoholConsumption)) return fail("Please select a valid alcohol consumption option");
  for (const field of ["includeSelf", "isSmokerOrTobaccoUser", "hasHighRiskOccupation"]) {
    if (input[field] !== undefined && typeof input[field] !== "boolean") return fail("Self inclusion, smoking and occupation selections must be true or false");
  }
  const preExistingDiseases = diseases(input.preExistingDiseases);
  if (!preExistingDiseases) return fail("Pre-existing diseases must be an array of at most 100 nonempty names (200 characters each)");
  const selectedFamilyMembers = input.selectedFamilyMembers === undefined ? [] : input.selectedFamilyMembers;
  if (!Array.isArray(selectedFamilyMembers) || selectedFamilyMembers.length > 100 || selectedFamilyMembers.some(id => !isValidId(id))) return fail("Select valid family member IDs");
  const uniqueMembers = [...new Set(selectedFamilyMembers)];
  const includeSelf = input.coverageType === "Individual" || input.includeSelf === true;
  if (input.coverageType === "Family Floater" && uniqueMembers.length + Number(includeSelf) < 2) return fail("Please select at least 2 people for a Family Floater policy");
  // Profile-derived values cannot override the authenticated user's stored profile.
  if (input.age !== undefined && (!Number.isInteger(input.age) || input.age < 0 || input.age > 120)) return fail("Age must be an integer between 0 and 120");
  if (input.gender !== undefined && !["male", "female", "other"].includes(input.gender)) return fail("Please select a valid gender");
  if (input.annualIncome !== undefined && money(input.annualIncome) === null) return fail("Annual income must be a finite, nonnegative number");
  return { error: null, data: { requiredCoverage, coverageType: input.coverageType, budget,
    coPaymentPreference, roomRentPreference, alcoholConsumption, includeSelf,
    isSmokerOrTobaccoUser: input.isSmokerOrTobaccoUser ?? false,
    hasHighRiskOccupation: input.hasHighRiskOccupation ?? false, preExistingDiseases,
    selectedFamilyMembers: uniqueMembers } };
}

function validateFamilyMember(input, { partial = false } = {}) {
  const fail = error => ({ error, data: null });
  if (!isObject(input)) return fail("Family member details must be an object");
  const data = {};
  for (const [field, limit, optional] of [["name", 100, false], ["occupation", 100, true]]) {
    if (partial && input[field] === undefined) continue;
    data[field] = text(input[field], limit, optional);
    if (data[field] === null) return fail(`${field === "name" ? "Name is required" : "Occupation must be text"} and must contain at most ${limit} characters`);
  }
  if (!partial || input.relationship !== undefined) {
    if (!["Father", "Mother", "Spouse", "Son", "Daughter", "Brother", "Sister", "Grandfather", "Grandmother", "Other"].includes(input.relationship)) return fail("Please select a valid relationship");
    data.relationship = input.relationship;
  }
  if (!partial || input.gender !== undefined) {
    if (typeof input.gender !== "string" || !["male", "female", "other"].includes(input.gender.toLowerCase())) return fail("Please select a valid gender");
    data.gender = input.gender.toLowerCase();
  }
  if (!partial || input.dateOfBirth !== undefined) {
    if (!calendarDate(input.dateOfBirth) || input.dateOfBirth > todayDate()) return fail("Enter a valid date of birth that is not in the future");
    data.dateOfBirth = input.dateOfBirth;
  }
  if (!partial || input.isDependent !== undefined) {
    if (typeof input.isDependent !== "boolean") return fail("Dependent selection must be true or false");
    data.isDependent = input.isDependent;
  }
  if (!partial || input.preExistingDiseases !== undefined) {
    data.preExistingDiseases = diseases(input.preExistingDiseases);
    if (!data.preExistingDiseases) return fail("Pre-existing diseases must be a valid array of disease names");
  }
  if (!Object.keys(data).length) return fail("Provide at least one family member field");
  return { error: null, data };
}

function validRecommendationAssessments(item) {
  const positive = value => typeof value === "number" && Number.isFinite(value) && value > 0;
  const status = value => ["Eligible", "Ineligible", "Insufficient Information"].includes(value);
  if (item.premiumAssessment !== undefined) {
    const p = item.premiumAssessment;
    if (!isObject(p) || !["Within Budget", "Above Budget", "No Budget Provided", "Insufficient Information"].includes(p.status) || typeof p.message !== "string" ||
        !(p.budget === null || positive(p.budget)) || !(p.annualPremium === null || positive(p.annualPremium)) || !(p.basePremium === null || positive(p.basePremium))) return false;
    if (["Within Budget", "Above Budget"].includes(p.status) && (p.annualPremium === null || p.budget === null)) return false;
    if (p.status === "Insufficient Information" && p.annualPremium !== null) return false;
  }
  if (item.familyEligibility !== undefined) {
    const f = item.familyEligibility;
    if (!isObject(f) || !status(f.status) || typeof f.message !== "string" || !Array.isArray(f.members) || f.members.length > 101) return false;
    if (f.members.some(member => !isObject(member) || !["Self", "FamilyMember"].includes(member.memberType) ||
        !(member.relationship === null || typeof member.relationship === "string") ||
        !(member.age === null || Number.isInteger(member.age) && member.age >= 0 && member.age <= 120) ||
        !status(member.ageStatus) || !status(member.relationshipStatus) || typeof member.message !== "string")) return false;
  }
  return true;
}

function validRecommendationResults(value) {
  const number = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
  return Array.isArray(value) && value.every(item => {
    if (!isObject(item) || !isValidId(item.policyId) || text(item.policyName, 500) === null || text(item.insuranceCompany, 500) === null || !number(item.matchedCoverage) || item.matchedCoverage <= 0 || !number(item.score) || item.score > 100) return false;
    if (!validRecommendationAssessments(item)) return false;
    const b = item.scoreBreakdown;
    return isObject(b) && [b.coverage, b.coPayment, b.roomRent].every(number) &&
      isObject(b.preExistingDisease) && typeof b.preExistingDisease.applicable === "boolean" && number(b.preExistingDisease.score) &&
      isObject(b.waitingPeriods) && [b.waitingPeriods.score, b.waitingPeriods.initialWaiting, b.waitingPeriods.specificIllnessWaiting].every(number) &&
      isObject(b.hospitalization) && [b.hospitalization.score, b.hospitalization.inpatient, b.hospitalization.daycare, b.hospitalization.preHospitalization, b.hospitalization.postHospitalization].every(number);
  });
}

module.exports = { diseases, validateRecommendation, validateFamilyMember, validRecommendationResults };
