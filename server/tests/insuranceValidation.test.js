const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');
const backend = require('../utils/insuranceValidation');
const userId = '111111111111111111111111';
const policyId = '222222222222222222222222';
const savedId = '333333333333333333333333';
const caseId = '444444444444444444444444';
const policy = { policyId, selectedCoverage: '500000', policyNumber: ' P-123 ', policyStartDate: '2024-02-29', policyEndDate: '2025-02-28' };
const claim = { userPolicy: savedId, patientType: 'Self', hospitalName: ' City Hospital ', hospitalizationType: 'Inpatient', admissionDate: '2024-03-01', dischargeDate: '2024-03-02', diagnosis: ' Fever ', totalBillAmount: '1000.50' };
const rejection = { userPolicy: savedId, rejectionReason: ' Documentation incomplete ', rejectedAmount: '100', rejectionDate: '2024-03-05' };

function handler(router, method, route) {
  return router.stack.find(layer => layer.route?.path === route && layer.route.methods[method]).route.stack.at(-1).handle;
}
async function invoke(fn, body, params = {}, extra = {}) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await fn({ body, params, user: userId, ...extra }, res);
  return res;
}

test('browser and API validators agree on policy normalization and calendar/amount/type errors', async () => {
  const frontend = await import(pathToFileURL(path.resolve(__dirname, '../../client/src/utils/insuranceValidation.js')));
  for (const validators of [backend, frontend]) {
    const validate = validators.validateSavedPolicy;
    assert.equal(validate(policy).data.policyNumber, 'P-123');
    assert.equal(validate({ ...policy, policyNumber: '' }).error, null);
    assert.equal(validate({ ...policy, policyId: undefined }, { uploaded: true }).error, null);
    assert.ok(validate(policy, { coverageAmounts: [100000] }).error);
    for (const [field, values] of Object.entries({
      policyId: ['', {}, 123, 'not-an-id'], policyNumber: [null, {}, [], 123, 'x'.repeat(101)],
      selectedCoverage: ['', ' ', null, true, [], {}, 0, -1, 0.5, Infinity, NaN, '0x10', '1e999'],
      policyStartDate: ['', null, {}, '2023-02-29', '2024-02-30', '0000-01-01', '2024-13-01'],
      policyEndDate: ['', null, '2024-02-29', '2024-02-28', '2025-02-30']
    })) for (const value of values) assert.ok(validate({ ...policy, [field]: value }).error, field);
    for (const value of [null, [], 'invalid']) assert.ok(validate(value).error);
    assert.ok(validators.calendarDate('2024-02-29'));
    assert.equal(validators.calendarDate('2023-02-29'), null);
  }
});

test('claim validators reject impossible dates, selections, times, coercion and invalid optional expenses', async () => {
  const frontend = await import(pathToFileURL(path.resolve(__dirname, '../../client/src/utils/insuranceValidation.js')));
  for (const { validateClaimCase: validate } of [backend, frontend]) {
    const normalized = validate(claim).data;
    assert.equal(normalized.hospitalName, 'City Hospital');
    assert.equal(normalized.totalBillAmount, 1000.5);
    assert.equal(normalized.roomRentPerDay, 0);
    assert.equal(normalized.isEmergency, false);
    assert.equal(validate({ ...claim, roomRentPerDay: 2000 }).error, null); // Daily rate is not the total room charge.
    assert.equal(validate({ ...claim, totalBillAmount: 0 }).error, null);
    assert.equal(validate({ ...claim, dischargeDate: claim.admissionDate }).error, null);
    for (const [field, values] of Object.entries({
      userPolicy: ['', {}, 'bad'], patientType: ['Other', null], familyMember: [{}, 'bad'],
      hospitalizationType: ['Other', {}], hospitalName: ['', ' ', {}, 'x'.repeat(201)], diagnosis: ['', {}, 'x'.repeat(1001)],
      treatment: [null, {}, 'x'.repeat(2001)], roomType: [[], 'x'.repeat(101)],
      admissionDate: ['2024-02-30', '2100-01-01', null], dischargeDate: ['2024-02-29', '2100-01-01', '2024-04-31'],
      admissionTime: ['24:00', '12:60', {}, null], dischargeTime: ['bad', false],
      totalBillAmount: ['', ' ', null, true, {}, [], -1, Infinity, NaN],
      roomRentPerDay: [null, true, {}, [], -1, Infinity, '1e999'], isEmergency: ['false', 0], isPlannedHospitalization: ['true', {}],
      claimStatus: ['Invalid'], nonPayableExpenses: [null, {}, [null], [{ expenseName: 'Mask', amount: '' }], [{ expenseName: '', amount: 5 }], [{ expenseName: 'Mask', amount: -1 }], [{ expenseName: 'Mask', amount: 1001 }], [{ expenseName: 'Mask', amount: 5, reason: {} }]]
    })) for (const value of values) assert.ok(validate({ ...claim, [field]: value }).error, `${field}: ${JSON.stringify(value)}`);
    assert.ok(validate({ ...claim, patientType: 'Family Member' }).error);
    assert.equal(validate({ ...claim, patientType: 'Family Member', familyMember: caseId }).error, null);
    assert.ok(validate({ ...claim, dischargeDate: claim.admissionDate, admissionTime: '12:00', dischargeTime: '11:59' }).error);
    assert.equal(validate({ ...claim, nonPayableExpenses: [{ expenseName: ' Mask ', amount: '0', reason: ' Optional ' }] }).error, null);
    assert.ok(validate({ ...claim, nonPayableExpenses: [{ expenseName: 'A', amount: 600 }, { expenseName: 'B', amount: 500 }] }).error);
    assert.ok(validate({ ...claim, nonPayableExpenses: Array(101).fill({ expenseName: 'A', amount: 0 }) }).error);
  }
});

test('rejection validators preserve optional fields and reject invalid linked IDs, dates, text and amounts', async () => {
  const frontend = await import(pathToFileURL(path.resolve(__dirname, '../../client/src/utils/insuranceValidation.js')));
  for (const { validateRejectionCase: validate } of [backend, frontend]) {
    assert.equal(validate(rejection).error, null);
    assert.equal(validate({ userPolicy: savedId, rejectionReason: 'Reason' }).data.rejectedAmount, 0);
    for (const [field, values] of Object.entries({ userPolicy: ['bad', {}], claimCase: ['bad', {}], rejectionReason: ['', {}, 'x'.repeat(5001)], insurerRemarks: [{}, null], rejectedAmount: [-1, null, {}, true, Infinity], rejectionDate: ['2024-02-30', '2100-01-01', null, {}] })) {
      for (const value of values) assert.ok(validate({ ...rejection, [field]: value }).error, field);
    }
  }
});

test('catalog policy route checks active product, coverage and user-scoped duplicates before creating', async () => {
  const Policy = require('../models/Policy');
  const UserPolicy = require('../models/UserPolicy');
  const fn = handler(require('../routes/userPolicies'), 'post', '/');
  const originals = { findOne: UserPolicy.findOne, create: UserPolicy.create };
  const originalFind = Policy.findOne;
  let active = true, duplicate = false, race = false, writes = 0;
  Policy.findOne = async query => {
    assert.deepEqual(query, { _id: policyId, isActiveCatalogPlan: true });
    return active ? { _id: policyId, coverageAmounts: [500000] } : null;
  };
  UserPolicy.findOne = async query => { assert.equal(query.user, userId); return duplicate ? {} : null; };
  UserPolicy.create = async data => {
    writes++;
    if (race) throw { code: 11000 };
    assert.equal(data.user, userId);
    assert.equal(data.policyNumber, 'P-123');
    assert.equal(data.selectedCoverage, 500000);
    assert.ok(data.policyStartDate instanceof Date);
    return { ...data, populate: async () => {} };
  };
  try {
    assert.equal((await invoke(fn, { ...policy, selectedCoverage: true })).statusCode, 400);
    assert.equal(writes, 0);
    active = false;
    assert.equal((await invoke(fn, policy)).statusCode, 404);
    active = true;
    assert.equal((await invoke(fn, { ...policy, selectedCoverage: 100000 })).statusCode, 400);
    duplicate = true;
    assert.equal((await invoke(fn, policy)).statusCode, 400);
    assert.equal((await invoke(fn, { ...policy, policyNumber: '' })).statusCode, 400);
    assert.equal(writes, 0);
    duplicate = false;
    assert.equal((await invoke(fn, policy)).statusCode, 201);
    race = true;
    assert.match((await invoke(fn, policy)).body.message, /already saved/);
  } finally { Policy.findOne = originalFind; Object.assign(UserPolicy, originals); }
});

test('claim route rejects direct malformed requests and policies/family members owned by someone else', async () => {
  const UserPolicy = require('../models/UserPolicy');
  const ClaimCase = require('../models/ClaimCase');
  const User = require('../models/User');
  const fn = handler(require('../routes/claimCases'), 'post', '/');
  const originals = { find: UserPolicy.findOne, create: ClaimCase.create, user: User.findById };
  let owned = false, writes = 0;
  UserPolicy.findOne = async query => { assert.deepEqual(query, { _id: savedId, user: userId }); return owned ? { _id: savedId } : null; };
  User.findById = async () => ({ familyMembers: { id: () => null } });
  ClaimCase.create = async data => { writes++; assert.equal(data.user, userId); assert.equal(data.userPolicy, savedId); return { ...data, populate: async () => {} }; };
  try {
    for (const bad of [{ ...claim, hospitalName: {} }, { ...claim, totalBillAmount: null }, { ...claim, userPolicy: { $ne: null } }]) assert.equal((await invoke(fn, bad)).statusCode, 400);
    assert.equal((await invoke(fn, claim)).statusCode, 404);
    assert.equal(writes, 0);
    owned = true;
    assert.equal((await invoke(fn, { ...claim, patientType: 'Family Member', familyMember: caseId })).statusCode, 400);
    const response = await invoke(fn, claim);
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.claimCase.diagnosis, 'Fever');
    assert.equal(writes, 1);
  } finally { UserPolicy.findOne = originals.find; ClaimCase.create = originals.create; User.findById = originals.user; }
});

test('analysis rejects malformed or foreign case IDs and restricts populated policies to the current user', async () => {
  const ClaimCase = require('../models/ClaimCase');
  const original = ClaimCase.findOne;
  const fn = handler(require('../routes/claimCases'), 'get', '/:caseId/analyze');
  let result = null;
  ClaimCase.findOne = query => {
    assert.deepEqual(query, { _id: caseId, user: userId });
    return { populate: options => { assert.deepEqual(options.match, { user: userId }); return { lean: async () => result }; } };
  };
  try {
    assert.equal((await invoke(fn, {}, { caseId: 'invalid' })).statusCode, 400);
    assert.equal((await invoke(fn, {}, { caseId })).statusCode, 404);
    result = { userPolicy: null };
    assert.equal((await invoke(fn, {}, { caseId })).statusCode, 400);
  } finally { ClaimCase.findOne = original; }
});

test('rejection route only links hospitalizations owned by the current user and selected policy', async () => {
  const UserPolicy = require('../models/UserPolicy');
  const ClaimCase = require('../models/ClaimCase');
  const RejectionCase = require('../models/RejectionCase');
  const fn = handler(require('../routes/rejectionCases'), 'post', '/');
  const original = { policy: UserPolicy.findOne, claim: ClaimCase.findOne, create: RejectionCase.create };
  let linked = false;
  UserPolicy.findOne = async query => { assert.equal(query.user, userId); return { _id: savedId }; };
  ClaimCase.findOne = async query => { assert.deepEqual(query, { _id: caseId, user: userId, userPolicy: savedId }); return linked ? { _id: caseId } : null; };
  RejectionCase.create = async data => { assert.equal(data.user, userId); return data; };
  try {
    assert.equal((await invoke(fn, { ...rejection, claimCase: {} })).statusCode, 400);
    assert.equal((await invoke(fn, { ...rejection, claimCase: caseId })).statusCode, 400);
    assert.equal((await invoke(fn, { ...rejection, rejectionReason: 'Initial waiting period' })).statusCode, 400);
    linked = true;
    assert.equal((await invoke(fn, { ...rejection, claimCase: caseId })).statusCode, 201);
  } finally { UserPolicy.findOne = original.policy; ClaimCase.findOne = original.claim; RejectionCase.create = original.create; }
});

test('uploads reject invalid metadata before extraction, report duplicates and remove only unsaved request files', async () => {
  const UserPolicy = require('../models/UserPolicy');
  const axios = require('axios');
  const fn = handler(require('../routes/userPolicies'), 'post', '/upload');
  const original = { find: UserPolicy.findOne, create: UserPolicy.create, post: axios.post, url: process.env.ML_SERVICE_URL };
  let duplicate = false, extractionCalls = 0;
  UserPolicy.findOne = async query => { assert.equal(query.user, userId); return duplicate ? {} : null; };
  UserPolicy.create = async data => data;
  axios.post = async () => { extractionCalls++; return { data: { extractedText: 'Test', extractedPolicyData: {} } }; };
  process.env.ML_SERVICE_URL = 'http://example.invalid';
  const filePath = path.join('/tmp', `insurelens-test-${process.pid}.pdf`);
  const file = { path: filePath, filename: 'test.pdf', originalname: 'test.pdf', mimetype: 'application/pdf', size: 10 };
  try {
    await fs.writeFile(filePath, '%PDF-test');
    assert.equal((await invoke(fn, { ...policy, selectedCoverage: 'Infinity' }, {}, { file })).statusCode, 400);
    await assert.rejects(fs.access(filePath));
    assert.equal(extractionCalls, 0);
    duplicate = true;
    await fs.writeFile(filePath, '%PDF-test');
    assert.equal((await invoke(fn, policy, {}, { file })).statusCode, 400);
    assert.equal(extractionCalls, 0);
    duplicate = false;
    await fs.writeFile(filePath, '%PDF-test');
    const response = await invoke(fn, policy, {}, { file });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.userPolicy.sourceType, 'Uploaded');
    assert.equal(response.body.userPolicy.policyNumber, 'P-123');
    assert.equal(response.body.userPolicy.extractedPolicyData.waitingPeriods.initialDays, null);
    assert.equal(response.body.userPolicy.extractedPolicyData.waitingPeriods.specificIllnessesMonths, null);
    assert.equal(response.body.userPolicy.extractedPolicyData.waitingPeriods.preExistingDiseasesMonths, null);
    await fs.access(filePath); // Saved uploads must remain available.
  } finally {
    UserPolicy.findOne = original.find; UserPolicy.create = original.create; axios.post = original.post;
    if (original.url === undefined) delete process.env.ML_SERVICE_URL; else process.env.ML_SERVICE_URL = original.url;
    await fs.unlink(filePath).catch(() => {});
  }
});

test('valid saved hospitalization still runs claimability analysis with the existing response contract', async () => {
  const ClaimCase = require('../models/ClaimCase');
  const User = require('../models/User');
  const original = { find: ClaimCase.findOne, user: User.findById };
  const catalogPolicy = require('../data/policies.json')[0];
  const normalizedClaim = backend.validateClaimCase({ ...claim, admissionTime: '10:00', dischargeTime: '12:00', roomRentPerDay: '500' }).data;
  const populated = { ...normalizedClaim, _id: caseId, userPolicy: {
    _id: savedId, user: userId, sourceType: 'Catalog', policy: catalogPolicy,
    selectedCoverage: catalogPolicy.coverageAmounts[0], policyStartDate: '2023-01-01', policyEndDate: '2025-01-01'
  } };
  ClaimCase.findOne = () => ({ populate: () => ({ lean: async () => populated }) });
  User.findById = async () => ({ insuranceRequirements: { preExistingDiseases: [] } });
  try {
    const res = await invoke(handler(require('../routes/claimCases'), 'get', '/:caseId/analyze'), {}, { caseId });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.claimCaseId, caseId);
    assert.ok(Number.isFinite(res.body.claimabilityScore));
    assert.equal(res.body.analysis.hospitalizationCoverage.hospitalizationHours, 26);
    const { validClaimAnalysis } = await import(pathToFileURL(path.resolve(__dirname, "../../client/src/utils/analysisResponseValidation.js")));
    assert.equal(validClaimAnalysis(res.body), true);
  } finally { ClaimCase.findOne = original.find; User.findById = original.user; }
});

test('policy and hospitalization lists always filter by the authenticated user', async () => {
  for (const [Model, router, key] of [
    [require('../models/UserPolicy'), require('../routes/userPolicies'), 'userPolicies'],
    [require('../models/ClaimCase'), require('../routes/claimCases'), 'claimCases'],
    [require('../models/RejectionCase'), require('../routes/rejectionCases'), 'rejectionCases']
  ]) {
    const original = Model.find;
    const chain = { select() { return this; }, populate(options) {
      if (typeof options === 'object') assert.deepEqual(options.match, { user: userId });
      return this;
    }, sort: async () => [] };
    Model.find = query => { assert.deepEqual(query, { user: userId }); return chain; };
    try { assert.deepEqual((await invoke(handler(router, 'get', '/'), {})).body, { [key]: [] }); }
    finally { Model.find = original; }
  }
});

test('PDF middleware errors return clear JSON errors and oversized/empty files fail validation', async () => {
  const policyUpload = require('../middleware/policyUpload');
  const router = require('../routes/userPolicies');
  const middleware = router.stack.find(layer => layer.route?.path === '/upload').route.stack[1].handle;
  const original = policyUpload.single;
  try {
    for (const code of ['LIMIT_FILE_SIZE', 'LIMIT_UNEXPECTED_FILE']) {
      policyUpload.single = () => (_req, _res, callback) => callback({ code });
      const res = { status(status) { this.statusCode = status; return this; }, json(body) { this.body = body; } };
      middleware({}, res, () => assert.fail('Invalid upload must not proceed'));
      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /PDF/);
    }
  } finally { policyUpload.single = original; }
  for (const size of [0, 10 * 1024 * 1024 + 1]) {
    const res = await invoke(handler(router, 'post', '/upload'), policy, {}, { file: { size, mimetype: 'application/pdf' } });
    assert.equal(res.statusCode, 400);
  }
});
