import assert from 'node:assert/strict';
import test from 'node:test';
import {
  credentialRuleFor,
  creatorRequiresProfessionalVerification,
  creatorSpecializationsFor,
  selectCreatorSpecialization,
} from './onboardingRules.ts';

test('general creators skip professional credentials', () => {
  assert.equal(creatorRequiresProfessionalVerification(['Vlogger']), false);
  assert.equal(creatorRequiresProfessionalVerification(['Gaming', 'Content Creator']), false);
});

test('regulated creator roles require professional credentials', () => {
  assert.equal(creatorRequiresProfessionalVerification(['Doctor']), true);
  assert.equal(creatorRequiresProfessionalVerification(['Chartered Accountant']), true);
  assert.equal(creatorRequiresProfessionalVerification(['Lawyer']), true);
  assert.equal(credentialRuleFor(['Lawyer'])?.registrationLabel, 'Bar Council enrolment number');
});

test('creator categories expose the configured specialization list', () => {
  assert.ok(creatorSpecializationsFor('Content & Digital Media').includes('Vlogger'));
  assert.ok(creatorSpecializationsFor('Health & Wellness').includes('Doctor'));
});

test('creator can select at most three specializations', () => {
  const selected = ['Vlogger', 'Writer', 'Photographer'];
  assert.deepEqual(selectCreatorSpecialization(selected, 'YouTuber'), selected);
  assert.deepEqual(selectCreatorSpecialization(selected, 'Writer'), ['Vlogger', 'Photographer']);
});
