const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const v = require('../utils/recommendationValidation');
const { validatePolicyTerms, profileAge, validateStoredAnalysis } = require('../utils/analysisValidation');
const User = require('../models/User');
const Policy = require('../models/Policy');
const axios = require('axios');
const id = '111111111111111111111111';
const memberId = '222222222222222222222222';
const requirements = { requiredCoverage: '500000', coverageType: 'Individual', budget: '', preExistingDiseases: [' Diabetes ', 'diabetes'] };
const family = { name: ' Asha ', relationship: 'Mother', gender: 'Female', dateOfBirth: '1980-02-29', occupation: '', isDependent: true, preExistingDiseases: [] };
const frontend = name => import(pathToFileURL(path.resolve(__dirname, `../../client/src/utils/${name}.js`)));
const handler = (router, method, route) => router.stack.find(layer => layer.route?.path === route && layer.route.methods[method]).route.stack.at(-1).handle;
async function request(fn, body, params = {}) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await fn({ body, params, user: id }, res);
  return res;
}

test('recommendation validators agree on amount, percentage, dropdown, disease and family input boundaries', async () => {
  for (const validators of [v, await frontend('recommendationValidation')]) {
    const validate = validators.validateRecommendation;
    const result = validate(requirements);
    assert.equal(result.error, null);
    assert.equal(result.data.budget, null);
    assert.deepEqual(result.data.preExistingDiseases, ['diabetes']);
    assert.equal(validate({ ...requirements, coPaymentPreference: 100, budget: '100' }).error, null);
    for (const [field, values] of Object.entries({
      requiredCoverage: [null, true, [], {}, '', ' ', 0, -1, NaN, Infinity], budget: [true, {}, [], 0, -1, 'NaN', Infinity],
      coPaymentPreference: [null, true, {}, '', -1, 101, Infinity], coverageType: ['Bad', null],
      roomRentPreference: ['Bad', null], alcoholConsumption: ['Bad', null], isSmokerOrTobaccoUser: ['false', 0], hasHighRiskOccupation: ['true', 1], includeSelf: ['true'],
      age: [-1, 121, 0.5, '30'], gender: ['Bad'], annualIncome: [-1, null, true, 'NaN'],
      preExistingDiseases: [null, {}, [' '], [null], [{}], ['x'.repeat(201)], Array(101).fill('X')], selectedFamilyMembers: [null, {}, ['bad'], [123]]
    })) for (const value of values) assert.ok(validate({ ...requirements, [field]: value }).error, field);
    assert.ok(validate({ ...requirements, coverageType: 'Family Floater', includeSelf: true, selectedFamilyMembers: [] }).error);
    assert.equal(validate({ ...requirements, coverageType: 'Family Floater', includeSelf: true, selectedFamilyMembers: [memberId, memberId] }).error, null);
    for (const value of [null, [], 'bad']) assert.ok(validate(value).error);
  }
});

test('family input preserves supported title-case genders while validating calendar dates and field types', async () => {
  for (const validators of [v, await frontend('recommendationValidation')]) {
    const validate = validators.validateFamilyMember;
    assert.equal(validate(family).data.gender, 'female');
    assert.equal(validate(family).data.name, 'Asha');
    for (const [field, value] of Object.entries({ name: ' ', relationship: 'Bad', dateOfBirth: '2023-02-29', gender: 'Bad', occupation: {}, isDependent: 'false', preExistingDiseases: [null] })) assert.ok(validate({ ...family, [field]: value }).error, field);
    assert.equal(validate({ name: ' B ' }, { partial: true }).data.name, 'B');
    assert.ok(validate({ dateOfBirth: '2100-01-01' }, { partial: true }).error);
  }
});

test('auth validation agrees with profile rules and rejects malformed payloads before calling string methods', async () => {
  const backend = require('../utils/authValidation');
  const client = await frontend('authValidation');
  const valid = { firstname: ' Asha ', lastname: ' Rao ', email: 'asha@example.com', mobile: '9876543210', password: 'testPassword1', dateOfBirth: '2000-02-29', gender: 'female', address: '12 Road', city: 'Pune', state: 'Maharashtra', pincode: '411001', occupation: 'Engineer', annualIncome: 0, agreeToTerms: true };
  assert.equal(backend.validateRegistration(valid), null);
  assert.equal(client.validateRegistration(valid, valid.password), null);
  for (const [field, value] of Object.entries({ firstname: 'x'.repeat(101), address: {}, annualIncome: true, password: {}, email: [], dateOfBirth: '2024-02-30', gender: 'Bad' })) {
    assert.ok(backend.validateRegistration({ ...valid, [field]: value }), field);
    assert.ok(client.validateRegistration({ ...valid, [field]: value }, valid.password), field);
  }
  for (const body of [undefined, null, [], {}, { email: {}, password: 'x' }, { email: 'a@b.com', password: [] }, { email: 'a@b.com', password: ' ' }]) {
    assert.ok(backend.validateLogin(body));
    assert.ok(backend.validateRegistration(body));
  }
  const auth = require('../routes/auth');
  assert.equal((await request(handler(auth, 'post', '/register'), null)).statusCode, 400);
  assert.equal((await request(handler(auth, 'post', '/login'), { email: {}, password: [] })).statusCode, 400);
});

test('stored analysis and scoring inputs reject missing terms and invalid dates without changing eligibility outcomes', () => {
  const product = require('../data/policies.json')[0];
  assert.equal(validatePolicyTerms(product, { recommendation: true }), null);
  for (const policy of require('../data/policies.json')) assert.equal(validatePolicyTerms(policy, { recommendation: true }), null);
  assert.equal(validatePolicyTerms({ ...product, roomRentLimit: { hasCap: true, roomTypeAllowed: 'Single Private AC', maxPerDay: 0, percentageOfSumInsured: 0 } }), null);
  for (const bad of [{ ...product, coverageAmounts: [NaN] }, { ...product, eligibility: { minAge: 80, maxAge: 20 } }, { ...product, waitingPeriods: null }, { ...product, hospitalizationCoverage: null }, { ...product, roomRentLimit: { hasCap: "true" } }, { ...product, coPaymentPercentage: 101 }, { ...product, subLimits: [null] }]) assert.ok(validatePolicyTerms(bad, { recommendation: true }));
  assert.equal(profileAge('2023-02-29'), null);
  assert.equal(profileAge('2100-01-01'), null);
  assert.equal(profileAge('1800-01-01'), null);
  assert.ok(Number.isInteger(profileAge(new Date('2000-02-29'))));
  const saved = { _id: id, selectedCoverage: 500000, policyStartDate: new Date('2023-01-01'), policyEndDate: new Date('2025-01-01') };
  const claim = { userPolicy: id, patientType: 'Self', hospitalizationType: 'Inpatient', hospitalName: 'Hospital', diagnosis: 'Fever', totalBillAmount: 100, admissionDate: new Date('2024-01-01'), dischargeDate: new Date('2024-01-02') };
  assert.equal(validateStoredAnalysis(claim, saved, product), null);
  assert.ok(validateStoredAnalysis({ ...claim, totalBillAmount: null }, saved, product));
  assert.ok(validateStoredAnalysis({ ...claim, admissionDate: null }, saved, product));
  assert.ok(validateStoredAnalysis(claim, { ...saved, policyEndDate: saved.policyStartDate }, product));
  // Hospitalization before inception remains an analysis outcome, not a validation rejection.
  assert.equal(validateStoredAnalysis(claim, { ...saved, policyStartDate: new Date('2024-06-01') }, product), null);
});

test('recommendation route handles invalid users/members/catalogs, empty results and unavailable or malformed ML', async () => {
  const fn = handler(require('../routes/recommendations'), 'post', '/');
  const original = { user: User.findById, policy: Policy.find, post: axios.post, url: process.env.ML_SERVICE_URL };
  const product = { ...require('../data/policies.json')[0], _id: memberId };
  let user = { dateOfBirth: new Date('1990-01-01'), gender: 'female', city: 'Pune', annualIncome: 0, familyMembers: [] };
  let policies = [product], mlError = null, mlData = { recommendations: [] }, calls = 0;
  User.findById = () => ({ lean: async () => user });
  Policy.find = () => ({ lean: async () => policies });
  axios.post = async (_url, body) => { calls++; assert.equal(body.userRequirements.requiredCoverage, 500000); assert.ok(Number.isInteger(body.userRequirements.age)); if (mlError) throw mlError; return { data: mlData }; };
  process.env.ML_SERVICE_URL = 'http://example.invalid';
  try {
    assert.equal((await request(fn, { ...requirements, requiredCoverage: true })).statusCode, 400);
    assert.equal(calls, 0);
    user.annualIncome = null;
    assert.equal((await request(fn, requirements)).statusCode, 400);
    user.annualIncome = 0;
    assert.equal((await request(fn, { ...requirements, coverageType: 'Family Floater', includeSelf: true, selectedFamilyMembers: [memberId] })).statusCode, 400);
    policies = [];
    assert.deepEqual((await request(fn, requirements)).body, { recommendations: [] });
    policies = [{ ...product, coverageAmounts: [] }];
    assert.equal((await request(fn, requirements)).statusCode, 503);
    policies = [product];
    assert.equal((await request(fn, requirements)).statusCode, 200);
    for (const [error, status] of [[{ code: 'ECONNABORTED' }, 504], [{ code: 'ECONNREFUSED' }, 503], [{ response: { status: 500 } }, 502]]) {
      mlError = error;
      assert.equal((await request(fn, requirements)).statusCode, status);
    }
    mlError = null;
    mlData = { recommendations: [{ policyId: memberId, policyName: product.policyName, insuranceCompany: product.insuranceCompany, matchedCoverage: product.coverageAmounts[0], score: 90,
      scoreBreakdown: { coverage: 30, coPayment: 15, roomRent: 15, preExistingDisease: { applicable: false, score: 0 }, waitingPeriods: { score: 10, initialWaiting: 5, specificIllnessWaiting: 5 }, hospitalization: { score: 15, inpatient: 5, daycare: 3, preHospitalization: 3, postHospitalization: 4 } } }] };
    assert.equal((await request(fn, requirements)).statusCode, 200);
    mlData.recommendations[0].policyId = id;
    assert.equal((await request(fn, requirements)).statusCode, 502);
    mlData = { recommendations: [{}] };
    assert.equal((await request(fn, requirements)).statusCode, 502);
    user = null;
    assert.equal((await request(fn, requirements)).statusCode, 404);
  } finally { User.findById = original.user; Policy.find = original.policy; axios.post = original.post; if (original.url === undefined) delete process.env.ML_SERVICE_URL; else process.env.ML_SERVICE_URL = original.url; }
});

test('valid rejection results and unavailable ML retain a renderable response; malformed results are rejected', async () => {
  const { validRejectionAnalysis, validClaimAnalysis } = await frontend('analysisResponseValidation');
  const { analyzeRejection } = require('../services/rejectionAnalyzer');
  const product = require('../data/policies.json')[0];
  const analysis = analyzeRejection({ rejectionReason: 'Documentation missing', insurerRemarks: '', rejectedAmount: 100 }, product, { policyStartDate: new Date('2023-01-01') }, null);
  assert.equal(validRejectionAnalysis({ analysis, mlPrediction: { available: false } }), true);
  assert.equal(validRejectionAnalysis({ analysis: {} }), false);
  assert.equal(validClaimAnalysis({ analysis: {} }), false);
  assert.equal(v.validRecommendationResults([{}]), false);
  assert.equal(v.validRecommendationResults([]), true);
});

test('registration normalizes persisted fields and returns the existing public user contract without credentials', async () => {
  const bcrypt = require('bcrypt');
  const jwt = require('jsonwebtoken');
  const original = { find: User.findOne, save: User.prototype.save, salt: bcrypt.genSalt, hash: bcrypt.hash, sign: jwt.sign };
  const body = { firstname: ' Asha ', lastname: ' Rao ', email: ' ASHA@example.com ', mobile: ' 9876543210 ', password: 'testPassword1', dateOfBirth: '2000-02-29', gender: 'female', address: ' 12 Road ', city: ' Pune ', state: ' Maharashtra ', pincode: ' 411001 ', occupation: ' Engineer ', annualIncome: '0', agreeToTerms: true };
  const queries = [];
  User.findOne = async query => { queries.push(query); return null; };
  User.prototype.save = async function () {
    assert.equal(this.firstname, 'Asha');
    assert.equal(this.email, 'asha@example.com');
    assert.equal(this.mobile, '9876543210');
    assert.equal(this.city, 'Pune');
    assert.equal(this.annualIncome, 0);
    return this;
  };
  bcrypt.genSalt = async () => 'test-salt';
  bcrypt.hash = async () => 'synthetic-test-hash';
  jwt.sign = () => 'synthetic-test-token';
  try {
    const res = await request(handler(require('../routes/auth'), 'post', '/register'), body);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(queries, [{ email: 'asha@example.com' }, { mobile: '9876543210' }]);
    assert.equal(res.body.user.passwordHash, undefined);
    assert.equal(res.body.user.password, undefined);
    assert.ok(res.body.user.id);
    assert.equal(res.body.user.annualIncome, 0);
  } finally { User.findOne = original.find; User.prototype.save = original.save; bcrypt.genSalt = original.salt; bcrypt.hash = original.hash; jwt.sign = original.sign; }
});

test('family endpoints reject invalid IDs and malformed details before accessing user documents', async () => {
  const router = require('../routes/familyMembers');
  assert.equal((await request(handler(router, 'delete', '/:memberId'), {}, { memberId: 'bad' })).statusCode, 400);
  assert.equal((await request(handler(router, 'put', '/:memberId'), { name: ' ' }, { memberId })).statusCode, 400);
  assert.equal((await request(handler(router, 'post', '/'), { ...family, dateOfBirth: '2024-02-30' })).statusCode, 400);
});
