import assert from 'node:assert/strict';
import test from 'node:test';
import {
  credentialRuleFor,
  creatorCategories,
  creatorRequiresProfessionalVerification,
  creatorSpecializationsFor,
  creatorTaxonomy,
  normalizeCreatorSpecializations,
  selectCreatorSpecialization,
} from './onboardingRules.ts';

const requiredTaxonomy: Readonly<Record<string, readonly string[]>> = {
  'Fashion & Beauty': ['Fashion', 'Beauty', 'Makeup Artist', 'Hair Dresser / Stylist', 'Nail Artist', 'Personal Care', 'Model', 'Tattoo Artist'],
  'Media & Entertainment': ['Actor/Actress', 'Comedy', 'Anchor', 'VJ', 'RJ', 'Reality Show Star', 'Dancer', 'Musician', 'Music Composer', 'Singer', 'Rapper', 'DJ', 'Music Band', 'Voice Artist', 'Storyteller', 'Poetry'],
  'Content & Digital Media': ['Content Creator', 'Digital Creator', 'Video Creator', 'Vlogger', 'Food Vlogger', 'Moto Vlogger', 'Travel Vlogger', 'YouTube', 'Podcaster', 'UGC Creator', 'AI Influencer', 'Social Media Star', 'Public Figure', 'Blogger', 'Personal Blog', 'Cinematographer/Videographer', 'Photographer', 'Photo Editor'],
  'Business & Finance': ['Entrepreneur', 'Business Content Creator', 'E-commerce', 'Finance Creator', 'Stock Market', 'Trader', 'Real Estate', 'Legal Consultation'],
  'Health & Wellness': ['Fitness', 'Healthcare', 'Medical', 'Doctor', 'Nutritionist/Dietician', 'Mental Wellness Coach', 'Counselor/Therapist', 'Sports Person'],
  'Design, Art & Tech': ['Graphic Designer', 'Illustrator', 'Hand Artist', 'Digital Artist', 'NFT Artist', 'Painter', 'Artist', 'Architect', 'Interior Design', 'Home Decor', 'Tech Influencer', 'Engineer', 'Gamer'],
  'Lifestyle & Family': ['Dad Influencer', 'Mom Influencer', 'Parent Influencer', 'Couple', 'Lifestyle', 'Pet Influencer', 'Culture Content Creator', 'Environmentalist / Social Activist', 'Bibliophile', 'Content Writer', 'Writer'],
  'Culinary & Esoteric': ['Chef', 'Astrologer', 'Tarot Reader', 'Vastu Expert', 'Spirituality', 'Automobile/Car Enthusiast', 'Career Counsellor', 'Education', 'Motivational Speaker'],
};

test('taxonomy contains all eight required Macro Verticals and exactly 91 specializations', () => {
  assert.deepEqual(creatorCategories.map((item) => item.name), Object.keys(requiredTaxonomy));
  const all = creatorCategories.flatMap((item) => item.specializations);
  assert.equal(all.length, 91);
  assert.equal(new Set(all).size, 91);
});

test('every required specialization exists exactly once under its intended Macro Vertical', () => {
  for (const [macro, expected] of Object.entries(requiredTaxonomy)) {
    assert.deepEqual(creatorSpecializationsFor(macro), expected, macro);
  }
});

test('general Creator examples skip professional verification', () => {
  assert.equal(creatorRequiresProfessionalVerification(['Lifestyle']), false);
  assert.equal(creatorRequiresProfessionalVerification(['Travel Vlogger']), false);
  assert.equal(creatorRequiresProfessionalVerification(['Photographer']), false);
  assert.equal(creatorRequiresProfessionalVerification(['Fitness']), false);
});

test('professional decisions are specialization-level, including within Health & Wellness', () => {
  assert.equal(creatorRequiresProfessionalVerification(['Doctor']), true);
  assert.equal(creatorRequiresProfessionalVerification(['Legal Consultation']), true);
  assert.equal(creatorRequiresProfessionalVerification(['Nutritionist/Dietician']), true);
  assert.equal(creatorRequiresProfessionalVerification(['Counselor/Therapist']), true);
  assert.equal(creatorRequiresProfessionalVerification(['Fitness']), false);
  assert.equal(credentialRuleFor(['Doctor'])?.requiresVerificationVideo, true);
});

test('legacy professional labels and category aliases remain compatible', () => {
  assert.equal(creatorRequiresProfessionalVerification(['Lawyer']), true);
  assert.equal(creatorRequiresProfessionalVerification(['Dentist']), true);
  assert.equal(creatorRequiresProfessionalVerification(['Chartered Accountant']), true);
  assert.deepEqual(normalizeCreatorSpecializations('Content & Digital Media', ['YouTuber', 'Vlogger']), ['YouTube', 'Vlogger']);
  assert.deepEqual(normalizeCreatorSpecializations('Health & Wellness', ['Nutritionist', 'Yoga']), ['Nutritionist/Dietician', 'Fitness']);
});

test('every professional policy has credentials, a video requirement, and instructions', () => {
  const policies = creatorTaxonomy.flatMap((category) => category.specializations);
  for (const policy of policies.filter((item) => item.requiresProfessionalVerification)) {
    assert.ok(policy.professionalRule);
    assert.ok(policy.professionalRule.requiredCredentialTypes.length > 0);
    assert.equal(policy.professionalRule.requiresVerificationVideo, true);
    assert.ok(policy.professionalRule.verificationInstructions.length > 20);
  }
});

test('creator can select at most three specializations', () => {
  const selected = ['Vlogger', 'Writer', 'Photographer'];
  assert.deepEqual(selectCreatorSpecialization(selected, 'YouTube'), selected);
  assert.deepEqual(selectCreatorSpecialization(selected, 'Writer'), ['Vlogger', 'Photographer']);
});
