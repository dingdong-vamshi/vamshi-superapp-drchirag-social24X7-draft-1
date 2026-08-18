export const creatorCategories = [
  {
    name: 'Fashion & Beauty',
    specializations: ['Fashion', 'Beauty', 'Skincare', 'Hair', 'Model', 'Stylist'],
  },
  {
    name: 'Media & Entertainment',
    specializations: ['Actor', 'Musician', 'Dancer', 'Comedian', 'Film', 'Gaming'],
  },
  {
    name: 'Content & Digital Media',
    specializations: ['Vlogger', 'YouTuber', 'Podcaster', 'Photographer', 'Writer', 'Content Creator'],
  },
  {
    name: 'Business & Finance',
    specializations: ['Entrepreneur', 'Business Educator', 'Finance Educator', 'Chartered Accountant', 'Lawyer', 'Marketing'],
  },
  {
    name: 'Health & Wellness',
    specializations: ['Doctor', 'Dentist', 'Nutritionist', 'Psychologist', 'Fitness', 'Yoga'],
  },
  {
    name: 'Design, Art & Tech',
    specializations: ['Designer', 'Artist', 'Developer', 'Tech Reviewer', 'Architect', 'Illustrator'],
  },
  {
    name: 'Lifestyle & Family',
    specializations: ['Lifestyle', 'Travel', 'Parenting', 'Home', 'Education', 'Relationships'],
  },
  {
    name: 'Culinary & Esoteric',
    specializations: ['Chef', 'Food Creator', 'Baker', 'Astrologer', 'Spirituality', 'Tarot'],
  },
] as const;

export type CreatorMacroCategory = (typeof creatorCategories)[number]['name'];
export type AudienceTier = 'Nano' | 'Micro' | 'Macro' | 'Mega';

export type ProfessionalCredentialRule = {
  specialization: string;
  title: string;
  registrationLabel: string;
  institutionLabel: string;
  credentialLabel: string;
};

export const professionalCredentialRules: readonly ProfessionalCredentialRule[] = [
  {
    specialization: 'Doctor',
    title: 'Medical professional verification',
    registrationLabel: 'Medical registration number',
    institutionLabel: 'Medical college / institution',
    credentialLabel: 'Registration or qualification document',
  },
  {
    specialization: 'Dentist',
    title: 'Dental professional verification',
    registrationLabel: 'Dental council registration number',
    institutionLabel: 'Dental college / institution',
    credentialLabel: 'Registration or qualification document',
  },
  {
    specialization: 'Chartered Accountant',
    title: 'Chartered Accountant verification',
    registrationLabel: 'ICAI membership number',
    institutionLabel: 'ICAI / institution',
    credentialLabel: 'Membership or practice credential',
  },
  {
    specialization: 'Lawyer',
    title: 'Legal professional verification',
    registrationLabel: 'Bar Council enrolment number',
    institutionLabel: 'Bar Council / law institution',
    credentialLabel: 'Bar Council enrolment or practice credential',
  },
  {
    specialization: 'Nutritionist',
    title: 'Nutrition professional verification',
    registrationLabel: 'Registration or license number',
    institutionLabel: 'Qualification institution',
    credentialLabel: 'Qualification or license document',
  },
  {
    specialization: 'Psychologist',
    title: 'Psychology professional verification',
    registrationLabel: 'Registration or license number',
    institutionLabel: 'Qualification institution',
    credentialLabel: 'Qualification or license document',
  },
] as const;

export const creatorSpecializationsFor = (category: string) =>
  creatorCategories.find((item) => item.name === category)?.specializations ?? [];

export const credentialRuleFor = (specializations: readonly string[]) =>
  professionalCredentialRules.find((rule) => specializations.includes(rule.specialization)) ?? null;

export const creatorRequiresProfessionalVerification = (specializations: readonly string[]) =>
  credentialRuleFor(specializations) !== null;

export const selectCreatorSpecialization = (current: readonly string[], next: string) => {
  if (current.includes(next)) return current.filter((item) => item !== next);
  if (current.length >= 3) return [...current];
  return [...current, next];
};

export const sellerOnboardingSteps = ['Seller type', 'Business', 'Store & pickup', 'Bank', 'Review'] as const;
export const creatorOnboardingBaseSteps = ['Category', 'Social presence', 'Identity & payout'] as const;
