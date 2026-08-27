import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { commerceEvidenceMaxBytes, validateCommerceEvidence } from './accessRepository.ts';

const redesignedOnboardingSource = readFileSync(new URL('./RedesignedCommerceScreens.tsx', import.meta.url), 'utf8');

test('verification-video evidence accepts expected phone and browser formats', () => {
  for (const mime of ['video/mp4', 'video/webm', 'video/quicktime']) {
    assert.doesNotThrow(() => validateCommerceEvidence('verification-video', mime, 1024));
  }
});

test('verification-video evidence rejects images and documents', () => {
  assert.throws(() => validateCommerceEvidence('verification-video', 'image/jpeg', 1024), /must be an MP4/);
  assert.throws(() => validateCommerceEvidence('verification-video', 'application/pdf', 1024), /must be an MP4/);
});

test('evidence rejects empty and oversized files before upload', () => {
  assert.throws(() => validateCommerceEvidence('identity-document', 'image/jpeg', 0), /empty/);
  assert.throws(() => validateCommerceEvidence('verification-video', 'video/mp4', commerceEvidenceMaxBytes + 1), /15 MB/);
});

test('rejected professional applications can replace evidence and resubmit', () => {
  assert.match(redesignedOnboardingSource, /\['draft', 'more_information_required', 'rejected'\]\.includes\(professional\.status\)/);
});

test('rejected and more-information applications display the Admin message during resubmission', () => {
  assert.match(redesignedOnboardingSource, /application\.status === 'more_information_required' && application\.requestedInformation/);
  assert.match(redesignedOnboardingSource, /application\.status === 'rejected' && application\.reviewNote/);
  assert.match(redesignedOnboardingSource, /<ApplicationFeedback application=\{professional\} label="Professional verification" \/>/);
});
