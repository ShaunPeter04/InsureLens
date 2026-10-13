import { todayDate } from "./insuranceValidation.js";
const textFields = {
  firstname: ["First name", 100],
  lastname: ["Last name", 100],
  address: ["Address", 500],
  city: ["City", 100],
  state: ["State", 100],
  occupation: ["Occupation", 100],
};
const profileFields = [...Object.keys(textFields), "mobile", "dateOfBirth", "gender", "pincode", "annualIncome"];

// Validate before Mongoose casting; accept partial API updates for compatibility.
function validateProfile(data, { partial = false } = {}) {
  const updates = {};
  const fail = (error) => ({ error, updates: {} });
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return fail("Profile data must be an object");
  }
  for (const field of profileFields) {
    if (!Object.prototype.hasOwnProperty.call(data, field) && partial) continue;
    const value = data[field];
    if (field === "annualIncome") {
      if ((typeof value !== "string" && typeof value !== "number") ||
          (typeof value === "string" && !value.trim())) {
        return fail("Annual income is required and must be a valid number");
      }
      if (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
        return fail("Annual income must be a finite number, zero or greater");
      }
      const income = Number(value);
      if (!Number.isFinite(income) || income < 0) return fail("Annual income must be a finite number, zero or greater");
      updates[field] = income;
      continue;
    }
    if (typeof value !== "string" || !value.trim()) {
      return fail(`${textFields[field]?.[0] || { mobile: "Mobile number", dateOfBirth: "Date of birth", gender: "Gender", pincode: "Pincode" }[field]} is required`);
    }
    const normalized = value.trim();
    if (textFields[field] && normalized.length > textFields[field][1]) {
      return fail(`${textFields[field][0]} must contain at most ${textFields[field][1]} characters`);
    }
    if (field === "mobile" && !/^[6-9]\d{9}$/.test(normalized)) return fail("Enter a valid 10-digit Indian mobile number");
    if (field === "pincode" && !/^\d{6}$/.test(normalized)) return fail("Pincode must contain exactly 6 digits");
    if (field === "gender" && !["male", "female", "other"].includes(normalized)) return fail("Please select a valid gender");
    if (field === "dateOfBirth") {
      const date = new Date(`${normalized}T00:00:00Z`);
      const todayString = todayDate();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || !Number.isFinite(date.getTime()) ||
          date.toISOString().slice(0, 10) !== normalized || normalized < "0001-01-01" || normalized > todayString) {
        return fail("Enter a valid date of birth that is not in the future");
      }
    }
    updates[field] = normalized;
  }
  if (!Object.keys(updates).length) return fail("Provide at least one profile field to update");
  return { error: null, updates };
}

export { validateProfile };
