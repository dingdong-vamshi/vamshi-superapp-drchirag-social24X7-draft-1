export type ProfessionalCredentialRule = {
  specialization: string;
  title: string;
  registrationLabel: string;
  institutionLabel: string;
  credentialLabel: string;
  requiredCredentialTypes: readonly string[];
  requiresVerificationVideo: true;
  verificationInstructions: string;
};

export type CreatorSpecializationPolicy = {
  specialization: string;
  requiresProfessionalVerification: boolean;
  professionalRule?: ProfessionalCredentialRule;
};

const general = (specialization: string): CreatorSpecializationPolicy => ({ specialization, requiresProfessionalVerification: false });

const professional = (
  specialization: string,
  labels: Omit<ProfessionalCredentialRule, 'specialization' | 'requiresVerificationVideo'>,
): CreatorSpecializationPolicy => ({
  specialization,
  requiresProfessionalVerification: true,
  professionalRule: { specialization, requiresVerificationVideo: true, ...labels },
});

const workplaceVideoInstructions =
  'Appear in a short spoken walkthrough and show the relevant professional workplace context for Admin review.';

/**
 * The single client-side Creator taxonomy and verification policy. The matching
 * database policy table is seeded by the onboarding verification migration and
 * is the authoritative server-side approval gate.
 */
export const creatorTaxonomy = [
  {
    name: 'Fashion & Beauty',
    specializations: [
      general('Fashion'), general('Beauty'), general('Makeup Artist'), general('Hair Dresser / Stylist'),
      general('Nail Artist'), general('Personal Care'), general('Model'), general('Tattoo Artist'),
    ],
  },
  {
    name: 'Media & Entertainment',
    specializations: [
      general('Actor/Actress'), general('Comedy'), general('Anchor'), general('VJ'), general('RJ'),
      general('Reality Show Star'), general('Dancer'), general('Musician'), general('Music Composer'),
      general('Singer'), general('Rapper'), general('DJ'), general('Music Band'), general('Voice Artist'),
      general('Storyteller'), general('Poetry'),
    ],
  },
  {
    name: 'Content & Digital Media',
    specializations: [
      general('Content Creator'), general('Digital Creator'), general('Video Creator'), general('Vlogger'),
      general('Food Vlogger'), general('Moto Vlogger'), general('Travel Vlogger'), general('YouTube'),
      general('Podcaster'), general('UGC Creator'), general('AI Influencer'), general('Social Media Star'),
      general('Public Figure'), general('Blogger'), general('Personal Blog'), general('Cinematographer/Videographer'),
      general('Photographer'), general('Photo Editor'),
    ],
  },
  {
    name: 'Business & Finance',
    specializations: [
      general('Entrepreneur'), general('Business Content Creator'), general('E-commerce'), general('Finance Creator'),
      general('Stock Market'), general('Trader'), general('Real Estate'),
      professional('Legal Consultation', {
        title: 'Legal professional verification', registrationLabel: 'Bar Council enrolment number',
        institutionLabel: 'Bar Council / law institution', credentialLabel: 'Bar Council enrolment or practice credential',
        requiredCredentialTypes: ['bar_council_enrolment', 'practice_credential'], verificationInstructions: workplaceVideoInstructions,
      }),
    ],
  },
  {
    name: 'Health & Wellness',
    specializations: [
      general('Fitness'),
      professional('Healthcare', {
        title: 'Healthcare professional verification', registrationLabel: 'Professional registration or licence number',
        institutionLabel: 'Qualification institution', credentialLabel: 'Registration, licence, or qualification document',
        requiredCredentialTypes: ['professional_registration', 'qualification'], verificationInstructions: workplaceVideoInstructions,
      }),
      professional('Medical', {
        title: 'Medical professional verification', registrationLabel: 'Medical registration number',
        institutionLabel: 'Medical college / institution', credentialLabel: 'Registration or qualification document',
        requiredCredentialTypes: ['medical_registration', 'medical_qualification'], verificationInstructions: workplaceVideoInstructions,
      }),
      professional('Doctor', {
        title: 'Doctor professional verification', registrationLabel: 'Medical registration number',
        institutionLabel: 'Medical college / institution', credentialLabel: 'Medical registration or qualification document',
        requiredCredentialTypes: ['medical_registration', 'medical_qualification'], verificationInstructions: workplaceVideoInstructions,
      }),
      professional('Nutritionist/Dietician', {
        title: 'Nutrition professional verification', registrationLabel: 'Registration or licence number',
        institutionLabel: 'Qualification institution', credentialLabel: 'Qualification or licence document',
        requiredCredentialTypes: ['nutrition_qualification', 'professional_registration'], verificationInstructions: workplaceVideoInstructions,
      }),
      general('Mental Wellness Coach'),
      professional('Counselor/Therapist', {
        title: 'Counseling professional verification', registrationLabel: 'Registration or licence number',
        institutionLabel: 'Qualification institution', credentialLabel: 'Qualification or licence document',
        requiredCredentialTypes: ['counseling_qualification', 'professional_registration'], verificationInstructions: workplaceVideoInstructions,
      }),
      general('Sports Person'),
    ],
  },
  {
    name: 'Design, Art & Tech',
    specializations: [
      general('Graphic Designer'), general('Illustrator'), general('Hand Artist'), general('Digital Artist'),
      general('NFT Artist'), general('Painter'), general('Artist'), general('Architect'), general('Interior Design'),
      general('Home Decor'), general('Tech Influencer'), general('Engineer'), general('Gamer'),
    ],
  },
  {
    name: 'Lifestyle & Family',
    specializations: [
      general('Dad Influencer'), general('Mom Influencer'), general('Parent Influencer'), general('Couple'),
      general('Lifestyle'), general('Pet Influencer'), general('Culture Content Creator'),
      general('Environmentalist / Social Activist'), general('Bibliophile'), general('Content Writer'), general('Writer'),
    ],
  },
  {
    name: 'Culinary & Esoteric',
    specializations: [
      general('Chef'), general('Astrologer'), general('Tarot Reader'), general('Vastu Expert'), general('Spirituality'),
      general('Automobile/Car Enthusiast'), general('Career Counsellor'), general('Education'), general('Motivational Speaker'),
    ],
  },
] as const;

export const creatorCategories = creatorTaxonomy.map((category) => ({
  name: category.name,
  specializations: category.specializations.map((policy) => policy.specialization),
}));

export type CreatorMacroCategory = (typeof creatorTaxonomy)[number]['name'];
export type AudienceTier = 'Nano' | 'Micro' | 'Macro' | 'Mega';

export const professionalCredentialRules = creatorTaxonomy.flatMap((category) =>
  category.specializations.flatMap((policy) => policy.professionalRule ? [policy.professionalRule] : []),
);

const legacyProfessionalRules: readonly ProfessionalCredentialRule[] = [
  { specialization: 'Dentist', title: 'Dental professional verification', registrationLabel: 'Dental council registration number', institutionLabel: 'Dental college / institution', credentialLabel: 'Registration or qualification document', requiredCredentialTypes: ['dental_registration', 'dental_qualification'], requiresVerificationVideo: true, verificationInstructions: workplaceVideoInstructions },
  { specialization: 'Chartered Accountant', title: 'Chartered Accountant verification', registrationLabel: 'ICAI membership number', institutionLabel: 'ICAI / institution', credentialLabel: 'Membership or practice credential', requiredCredentialTypes: ['icai_membership', 'practice_credential'], requiresVerificationVideo: true, verificationInstructions: workplaceVideoInstructions },
];

export const legacyCreatorSpecializationAliases: Readonly<Record<string, string>> = {
  Skincare: 'Beauty', Hair: 'Hair Dresser / Stylist', Stylist: 'Hair Dresser / Stylist', Actor: 'Actor/Actress',
  Comedian: 'Comedy', Film: 'Video Creator', Gaming: 'Gamer', YouTuber: 'YouTube',
  'Business Educator': 'Business Content Creator', 'Finance Educator': 'Finance Creator', Lawyer: 'Legal Consultation',
  Nutritionist: 'Nutritionist/Dietician', Psychologist: 'Counselor/Therapist', Yoga: 'Fitness', Designer: 'Graphic Designer',
  Developer: 'Engineer', 'Tech Reviewer': 'Tech Influencer', Travel: 'Travel Vlogger', Parenting: 'Parent Influencer',
  Home: 'Home Decor', Relationships: 'Lifestyle', 'Food Creator': 'Food Vlogger', Baker: 'Chef', Tarot: 'Tarot Reader',
};

export const creatorSpecializationsFor = (category: string) =>
  creatorCategories.find((item) => item.name === category)?.specializations ?? [];

export const creatorPolicyFor = (specialization: string) => {
  const normalized = legacyCreatorSpecializationAliases[specialization] ?? specialization;
  return creatorTaxonomy.flatMap((category) => category.specializations).find((policy) => policy.specialization === normalized) ?? null;
};

export const credentialRuleFor = (specializations: readonly string[]) => {
  for (const specialization of specializations) {
    const normalized = legacyCreatorSpecializationAliases[specialization] ?? specialization;
    const current = professionalCredentialRules.find((rule) => rule.specialization === normalized);
    if (current) return current;
    const legacy = legacyProfessionalRules.find((rule) => rule.specialization === specialization);
    if (legacy) return legacy;
  }
  return null;
};

export const creatorRequiresProfessionalVerification = (specializations: readonly string[]) => credentialRuleFor(specializations) !== null;

export const normalizeCreatorSpecializations = (category: string, specializations: readonly string[]) => {
  const allowed = new Set(creatorSpecializationsFor(category));
  const normalized = specializations.map((value) => legacyCreatorSpecializationAliases[value] ?? value);
  return [...new Set(normalized.filter((value) => allowed.has(value)))].slice(0, 3);
};

export const selectCreatorSpecialization = (current: readonly string[], next: string) => {
  if (current.includes(next)) return current.filter((item) => item !== next);
  if (current.length >= 3) return [...current];
  return [...current, next];
};

export const sellerOnboardingSteps = ['Seller type', 'Business', 'Store & pickup', 'Bank', 'Business Verification', 'Review'] as const;
export const creatorOnboardingBaseSteps = ['Category', 'Social presence', 'Identity & payout'] as const;
