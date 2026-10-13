const { validateProfile } = require("./profileValidation");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateLogin(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "Email and password are required";
  const { email, password } = data;
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password.trim()) {
    return "Email and password are required";
  }

  if (!emailPattern.test(email.trim())) {
    return "Enter a valid email address";
  }

  return null;
}

function validateRegistration(data) {
  const confirmPassword = data?.password;
  if (!data || typeof data !== "object" || Array.isArray(data)) return "Registration details must be an object";
  if (typeof data.email !== "string" || typeof data.password !== "string" || !data.password.trim()) return "Email and password are required";
  const profileError = validateProfile(data).error;
  if (profileError) return profileError;
  const required = [
    "firstname", "lastname", "email", "mobile",
    "password", "dateOfBirth", "gender", "address",
    "city", "state", "pincode", "occupation", "annualIncome"
  ];

  for (const field of required) {
    if (String(data[field] ?? "").trim() === "") {
      return `Please fill in ${field.replace(/([A-Z])/g, " $1").toLowerCase()}`;
    }
  }

  if (!emailPattern.test(data.email.trim())) {
    return "Enter a valid email address";
  }

  if (data.password.length < 8 || data.password.length > 72) {
    return "Password must contain 8 to 72 characters";
  }

  if (data.password !== confirmPassword) {
    return "Passwords do not match";
  }

  if (data.agreeToTerms !== true) {
    return "You must agree to the terms and conditions";
  }

  return null;
}

module.exports = { validateRegistration, validateLogin };
