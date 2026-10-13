const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { validateProfile } = require('../utils/profileValidation');
const valid = {
  firstname: ' Asha ', lastname: ' Rao ', mobile: '9876543210',
  dateOfBirth: '2000-02-29', gender: 'female', address: ' 12 Main Road ',
  city: 'Pune', state: 'Maharashtra', pincode: '411001', occupation: 'Engineer', annualIncome: '0'
};

test('frontend and backend agree on valid profiles, normalization and invalid inputs', async () => {
  const frontend = await import(pathToFileURL(path.resolve(__dirname, '../../client/src/utils/profileValidation.js')));
  const validators = [validateProfile, frontend.validateProfile];
  for (const validate of validators) {
    const result = validate(valid);
    assert.equal(result.error, null);
    assert.equal(result.updates.firstname, 'Asha');
    assert.equal(result.updates.address, '12 Main Road');
    assert.equal(result.updates.annualIncome, 0);
    for (const field of Object.keys(valid)) {
      for (const value of ['', '   ', null, {}, [], true]) {
        assert.ok(validate({ ...valid, [field]: value }).error, `${field} rejects ${JSON.stringify(value)}`);
      }
    }
    const invalid = {
      firstname: ['a'.repeat(101)], lastname: ['a'.repeat(101)],
      address: ['a'.repeat(501)], city: ['a'.repeat(101)], state: ['a'.repeat(101)], occupation: ['a'.repeat(101)],
      mobile: ['1234567890', '987654321', '98765432100', '+919876543210'],
      dateOfBirth: ['2023-02-29', '2024-02-30', '2000-13-01', '2100-01-01', '0000-01-01', 'not-a-date', '2000-01-01T00:00:00Z'],
      gender: ['unsupported', 'Male'], pincode: ['12345', '1234567', 'abcdef'],
      annualIncome: [-1, Infinity, NaN, 'Infinity', '1e999', 'abc', '0x10']
    };
    for (const [field, values] of Object.entries(invalid)) {
      for (const value of values) assert.ok(validate({ ...valid, [field]: value }).error, field);
    }
    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    assert.equal(validate({ ...valid, dateOfBirth: todayString, annualIncome: '123.45' }).error, null);
    assert.equal(validate({ city: ' Mumbai ' }, { partial: true }).updates.city, 'Mumbai');
    assert.ok(validate({}, { partial: true }).error);
    assert.ok(validate(null).error);
    assert.ok(validate([]).error);
    assert.equal(validate({ ...valid, email: 'ignored', password: 'ignored' }).updates.email, undefined);
  }
});

test('profile route rejects direct invalid updates and duplicates and preserves response contract', async () => {
  const User = require('../models/User');
  const router = require('../routes/auth');
  const handler = router.stack.find(layer => layer.route?.path === '/profile' && layer.route.methods.put).route.stack.at(-1).handle;
  const originals = { findOne: User.findOne, findByIdAndUpdate: User.findByIdAndUpdate };
  let writes = 0;
  let duplicate = false;
  let databaseError;
  let missing = false;
  User.findOne = async query => {
    assert.equal(query.mobile, '9876543210');
    assert.deepEqual(query._id, { $ne: 'current-user' });
    return duplicate ? { _id: 'other-user' } : null;
  };
  User.findByIdAndUpdate = (id, updates, options) => {
    writes++;
    assert.equal(id, 'current-user');
    assert.equal(options.runValidators, true);
    assert.equal(updates.email, undefined);
    assert.equal(updates.password, undefined);
    return { select: async projection => {
      assert.equal(projection, '-passwordHash');
      if (databaseError) throw databaseError;
      return missing ? null : { ...updates, _id: id };
    } };
  };
  const request = async body => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ body, user: 'current-user' }, res);
    return res;
  };
  try {
    let res = await request({ ...valid, mobile: { $ne: null } });
    assert.equal(res.statusCode, 400);
    assert.equal(writes, 0);
    for (const field of Object.keys(valid)) {
      assert.equal((await request({ ...valid, [field]: '' })).statusCode, 400, field);
    }
    assert.equal(writes, 0);
    res = await request({ ...valid, email: 'unchanged', password: 'unchanged' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.firstname, 'Asha');
    assert.equal(res.body.user.annualIncome, 0);
    duplicate = true;
    res = await request(valid);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /already in use/);
    assert.equal(writes, 1);
    duplicate = false;
    databaseError = { code: 11000 };
    res = await request(valid);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /already in use/);
    databaseError = { name: 'ValidationError' };
    assert.equal((await request(valid)).statusCode, 400);
    databaseError = undefined;
    missing = true;
    assert.equal((await request({ city: 'Pune' })).statusCode, 404);
  } finally {
    Object.assign(User, originals);
  }
});


test('existing profiles remain readable without applying update validation', async () => {
  const User = require('../models/User');
  const router = require('../routes/auth');
  const handler = router.stack.find(layer => layer.route?.path === '/profile' && layer.route.methods.get).route.stack.at(-1).handle;
  const original = User.findById;
  const existing = { ...valid, annualIncome: 0, dateOfBirth: '2000-02-29T00:00:00.000Z' };
  User.findById = () => ({ select: async projection => {
    assert.equal(projection, '-passwordHash');
    return existing;
  } });
  try {
    const res = { json(body) { this.body = body; } };
    await handler({ user: 'current-user' }, res);
    assert.deepEqual(res.body, { user: existing });
  } finally {
    User.findById = original;
  }
});
