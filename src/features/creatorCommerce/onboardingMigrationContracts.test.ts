import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260827132859_creator_taxonomy_and_verification_gates.sql', import.meta.url),
  'utf8',
);
const reapplicationMigration = readFileSync(
  new URL('../../../supabase/migrations/20260827135204_harden_onboarding_reapplication.sql', import.meta.url),
  'utf8',
);
const stageCompletionMigration = readFileSync(
  new URL('../../../supabase/migrations/20260827143000_harden_onboarding_stage_completion.sql', import.meta.url),
  'utf8',
);

test('database taxonomy contains exactly the 91 client specializations', async () => {
  const { creatorCategories } = await import('./onboardingRules.ts');
  for (const category of creatorCategories) {
    for (const specialization of category.specializations) {
      assert.match(migration, new RegExp(`\\('${category.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}','${specialization.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
    }
  }
  assert.equal(creatorCategories.flatMap((category) => category.specializations).length, 91);
});

test('database guards submission, approval, private video formats, and server-owned access', () => {
  assert.match(migration, /seller_application_ready/);
  assert.match(migration, /creator_application_ready/);
  assert.match(migration, /professional_request_ready/);
  assert.match(migration, /new\.status not in \('submitted','approved'\)/);
  assert.match(migration, /file_size_limit = 15728640/);
  assert.match(migration, /video\/quicktime/);
  assert.match(migration, /set public = false/);
  assert.match(migration, /revoke insert, update, delete on public\.creator_commerce_access from authenticated/);
});

test('reapplication remains possible without allowing review audit tampering', () => {
  assert.match(reapplicationMigration, /status in \('draft','more_information_required','rejected'\)/);
  assert.match(reapplicationMigration, /status in \('draft','submitted'\)/);
  assert.match(reapplicationMigration, /new\.review_note := old\.review_note/);
  assert.match(reapplicationMigration, /new\.reviewed_by := old\.reviewed_by/);
  assert.match(reapplicationMigration, /new\.reviewed_at := old\.reviewed_at/);
});

test('server readiness mirrors every required Seller and Creator Stage 1 field', () => {
  assert.match(stageCompletionMigration, /application\.location_latitude is not null/);
  assert.match(stageCompletionMigration, /application\.location_longitude is not null/);
  assert.match(stageCompletionMigration, /application_payload->>'postalCode'/);
  assert.match(stageCompletionMigration, /application_payload->>'localSellerId'/);
  assert.match(stageCompletionMigration, /application_payload->>'declarationAccepted'/);
  assert.match(stageCompletionMigration, /application_payload->>'panNumber'/);
  assert.match(stageCompletionMigration, /jsonb_each_text\(coalesce\(application\.social_handles/);
  assert.match(stageCompletionMigration, /application_payload->>'payoutUpi'/);
  assert.match(stageCompletionMigration, /application_payload->>'bankAccountNumber'/);
});
