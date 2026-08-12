import type { SupabaseClient } from '@supabase/supabase-js';

export type CommerceApprovalStatus =
  | 'not_applied'
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'more_information_required'
  | 'suspended';

export type BuyerKycStatus =
  | 'not_submitted'
  | 'submitted'
  | 'under_review'
  | 'verified'
  | 'rejected'
  | 'more_information_required'
  | 'suspended';

export type CreatorCommerceAccess = {
  userId: string;
  sellerStatus: CommerceApprovalStatus;
  creatorStatus: CommerceApprovalStatus;
  professionalStatus: CommerceApprovalStatus;
  buyerKycStatus: BuyerKycStatus;
  adminAccess: boolean;
};

export type SellerType = 'gst' | 'non_gst';
export type CreatorType = 'general' | 'professional';
export type ApplicationKind = 'seller' | 'creator' | 'professional';

export type CommerceEvidenceAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
};

export type CommerceDocument = {
  id: string;
  ownerId: string;
  applicationKind: ApplicationKind;
  applicationId: string | null;
  documentKind: string;
  storagePath: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
};

export type SellerApplication = {
  id: string;
  ownerId: string;
  sellerType: SellerType;
  legalName: string;
  storefrontName: string;
  businessName: string;
  registeredState: string;
  city: string;
  phone: string;
  email: string;
  addressLine: string;
  pickupAddress: string;
  returnAddress: string;
  gstin: string | null;
  panNumber: string | null;
  documentPath: string | null;
  exteriorEvidencePath: string | null;
  interiorEvidencePath: string | null;
  status: CommerceApprovalStatus;
  requestedInformation: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  updatedAt: string;
};

export type CreatorApplication = {
  id: string;
  ownerId: string;
  creatorType: CreatorType;
  category: string;
  about: string;
  socialHandles: Record<string, string>;
  identityName: string;
  identityDocumentPath: string | null;
  status: CommerceApprovalStatus;
  requestedInformation: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  updatedAt: string;
};

export type ProfessionalVerificationRequest = {
  id: string;
  ownerId: string;
  creatorApplicationId: string | null;
  professionalCategory: string;
  professionalTitle: string;
  degree: string;
  institution: string;
  graduationYear: number | null;
  registrationNumber: string;
  credentialDocumentPath: string | null;
  supportingDocumentPath: string | null;
  socialHandles: Record<string, string>;
  status: CommerceApprovalStatus;
  requestedInformation: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  updatedAt: string;
};

export type CommerceApplicationSummary =
  | ({ kind: 'seller'; documents: CommerceDocument[] } & SellerApplication)
  | ({ kind: 'creator'; documents: CommerceDocument[] } & CreatorApplication)
  | ({ kind: 'professional'; documents: CommerceDocument[] } & ProfessionalVerificationRequest);

type AccessRow = {
  user_id: string;
  seller_status: CommerceApprovalStatus;
  creator_status: CommerceApprovalStatus;
  professional_status: CommerceApprovalStatus;
  buyer_kyc_status: BuyerKycStatus;
  admin_access: boolean;
};

type SellerApplicationRow = {
  id: string;
  owner_id: string;
  seller_type: SellerType;
  legal_name: string;
  storefront_name: string;
  business_name: string;
  registered_state: string;
  city: string;
  phone: string;
  email: string;
  address_line: string;
  pickup_address: string;
  return_address: string;
  gstin: string | null;
  pan_number: string | null;
  document_path: string | null;
  exterior_evidence_path: string | null;
  interior_evidence_path: string | null;
  status: CommerceApprovalStatus;
  requested_information: string | null;
  review_note: string | null;
  submitted_at: string | null;
  updated_at: string;
};

type CreatorApplicationRow = {
  id: string;
  owner_id: string;
  creator_type: CreatorType;
  category: string;
  about: string;
  social_handles: Record<string, string> | null;
  identity_name: string;
  identity_document_path: string | null;
  status: CommerceApprovalStatus;
  requested_information: string | null;
  review_note: string | null;
  submitted_at: string | null;
  updated_at: string;
};

type ProfessionalVerificationRow = {
  id: string;
  owner_id: string;
  creator_application_id: string | null;
  professional_category: string;
  professional_title: string;
  degree: string;
  institution: string;
  graduation_year: number | null;
  registration_number: string;
  credential_document_path: string | null;
  supporting_document_path: string | null;
  social_handles: Record<string, string> | null;
  status: CommerceApprovalStatus;
  requested_information: string | null;
  review_note: string | null;
  submitted_at: string | null;
  updated_at: string;
};

type CommerceDocumentRow = {
  id: string;
  owner_id: string;
  application_kind: ApplicationKind;
  application_id: string | null;
  document_kind: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
};

const evidenceBucket = 'creator-commerce-private';

const safeSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56) || 'store';

const extensionFor = (asset: CommerceEvidenceAsset) => {
  const raw = asset.fileName?.split('.').pop()?.toLowerCase();
  if (raw && /^[a-z0-9]{2,5}$/.test(raw)) return raw;
  if (asset.mimeType?.includes('png')) return 'png';
  if (asset.mimeType?.includes('webp')) return 'webp';
  if (asset.mimeType?.includes('mp4')) return 'mp4';
  if (asset.mimeType?.includes('pdf')) return 'pdf';
  return 'jpg';
};

const sellerFromRow = (row: SellerApplicationRow): SellerApplication => ({
  id: row.id,
  ownerId: row.owner_id,
  sellerType: row.seller_type,
  legalName: row.legal_name,
  storefrontName: row.storefront_name,
  businessName: row.business_name,
  registeredState: row.registered_state,
  city: row.city,
  phone: row.phone,
  email: row.email,
  addressLine: row.address_line,
  pickupAddress: row.pickup_address,
  returnAddress: row.return_address,
  gstin: row.gstin,
  panNumber: row.pan_number,
  documentPath: row.document_path,
  exteriorEvidencePath: row.exterior_evidence_path,
  interiorEvidencePath: row.interior_evidence_path,
  status: row.status,
  requestedInformation: row.requested_information,
  reviewNote: row.review_note,
  submittedAt: row.submitted_at,
  updatedAt: row.updated_at,
});

const creatorFromRow = (row: CreatorApplicationRow): CreatorApplication => ({
  id: row.id,
  ownerId: row.owner_id,
  creatorType: row.creator_type,
  category: row.category,
  about: row.about,
  socialHandles: row.social_handles ?? {},
  identityName: row.identity_name,
  identityDocumentPath: row.identity_document_path,
  status: row.status,
  requestedInformation: row.requested_information,
  reviewNote: row.review_note,
  submittedAt: row.submitted_at,
  updatedAt: row.updated_at,
});

const professionalFromRow = (row: ProfessionalVerificationRow): ProfessionalVerificationRequest => ({
  id: row.id,
  ownerId: row.owner_id,
  creatorApplicationId: row.creator_application_id,
  professionalCategory: row.professional_category,
  professionalTitle: row.professional_title,
  degree: row.degree,
  institution: row.institution,
  graduationYear: row.graduation_year,
  registrationNumber: row.registration_number,
  credentialDocumentPath: row.credential_document_path,
  supportingDocumentPath: row.supporting_document_path,
  socialHandles: row.social_handles ?? {},
  status: row.status,
  requestedInformation: row.requested_information,
  reviewNote: row.review_note,
  submittedAt: row.submitted_at,
  updatedAt: row.updated_at,
});

const documentFromRow = (row: CommerceDocumentRow): CommerceDocument => ({
  id: row.id,
  ownerId: row.owner_id,
  applicationKind: row.application_kind,
  applicationId: row.application_id,
  documentKind: row.document_kind,
  storagePath: row.storage_path,
  fileName: row.file_name,
  mimeType: row.mime_type,
  fileSize: row.file_size,
  createdAt: row.created_at,
});

export async function getCreatorCommerceAccess(
  client: SupabaseClient,
): Promise<CreatorCommerceAccess | null> {
  const { data, error } = await client.rpc('get_my_creator_commerce_access');
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as AccessRow | null;
  if (!row) return null;

  return {
    userId: row.user_id,
    sellerStatus: row.seller_status,
    creatorStatus: row.creator_status,
    professionalStatus: row.professional_status,
    buyerKycStatus: row.buyer_kyc_status,
    adminAccess: row.admin_access,
  };
}

export async function uploadCommerceEvidence(
  client: SupabaseClient,
  userId: string,
  applicationKind: ApplicationKind,
  documentKind: string,
  asset: CommerceEvidenceAsset,
) {
  const response = await fetch(asset.uri);
  const bytes = await response.arrayBuffer();
  const extension = extensionFor(asset);
  const path = `${userId}/${applicationKind}/${documentKind}/${Date.now()}.${extension}`;
  const contentType = asset.mimeType ?? (extension === 'mp4' ? 'video/mp4' : 'image/jpeg');

  const { error } = await client.storage.from(evidenceBucket).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw error;

  const { error: documentError } = await client.from('creator_commerce_documents').insert({
    owner_id: userId,
    application_kind: applicationKind,
    document_kind: documentKind,
    storage_path: path,
    file_name: asset.fileName ?? null,
    mime_type: asset.mimeType ?? contentType,
    file_size: asset.fileSize ?? null,
  });
  if (documentError) throw documentError;

  return path;
}

export async function getMySellerApplication(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from('seller_applications')
    .select('id,owner_id,seller_type,legal_name,storefront_name,business_name,registered_state,city,phone,email,address_line,pickup_address,return_address,gstin,pan_number,document_path,exterior_evidence_path,interior_evidence_path,status,requested_information,review_note,submitted_at,updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? sellerFromRow(data as SellerApplicationRow) : null;
}

export async function submitSellerApplication(
  client: SupabaseClient,
  userId: string,
  input: {
    sellerType: SellerType;
    legalName: string;
    storefrontName: string;
    businessName: string;
    registeredState: string;
    city: string;
    phone: string;
    email: string;
    addressLine: string;
    pickupAddress: string;
    returnAddress: string;
    gstin?: string;
    panNumber?: string;
    documentPath?: string | null;
    exteriorEvidencePath?: string | null;
    interiorEvidencePath?: string | null;
    locationLatitude?: number | null;
    locationLongitude?: number | null;
  },
) {
  const slug = safeSlug(input.storefrontName);
  const { data, error } = await client
    .from('seller_applications')
    .upsert(
      {
        owner_id: userId,
        legal_name: input.legalName.trim(),
        storefront_name: input.storefrontName.trim(),
        storefront_slug: slug,
        business_name: input.businessName.trim(),
        business_type: input.sellerType === 'gst' ? 'gst_registered' : 'local_individual',
        seller_tier: input.sellerType === 'gst' ? 'gst' : 'local',
        seller_type: input.sellerType,
        state_code: input.registeredState.trim().toUpperCase(),
        registered_state: input.registeredState.trim().toUpperCase(),
        city: input.city.trim(),
        phone: input.phone.trim(),
        email: input.email.trim().toLowerCase(),
        address_line: input.addressLine.trim(),
        pickup_address: input.pickupAddress.trim(),
        return_address: input.returnAddress.trim(),
        gstin: input.sellerType === 'gst' ? input.gstin?.trim().toUpperCase() || null : null,
        pan_number: input.panNumber?.trim().toUpperCase() || null,
        document_path: input.documentPath ?? null,
        exterior_evidence_path: input.exteriorEvidencePath ?? null,
        interior_evidence_path: input.interiorEvidencePath ?? null,
        location_latitude: input.locationLatitude ?? null,
        location_longitude: input.locationLongitude ?? null,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        verification_mode: 'manual',
      },
      { onConflict: 'owner_id' },
    )
    .select('id,owner_id,seller_type,legal_name,storefront_name,business_name,registered_state,city,phone,email,address_line,pickup_address,return_address,gstin,pan_number,document_path,exterior_evidence_path,interior_evidence_path,status,requested_information,review_note,submitted_at,updated_at')
    .single();
  if (error) throw error;
  return sellerFromRow(data as SellerApplicationRow);
}

export async function getMyCreatorApplication(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from('creator_applications')
    .select('id,owner_id,creator_type,category,about,social_handles,identity_name,identity_document_path,status,requested_information,review_note,submitted_at,updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? creatorFromRow(data as CreatorApplicationRow) : null;
}

export async function getMyProfessionalRequest(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from('professional_verification_requests')
    .select('id,owner_id,creator_application_id,professional_category,professional_title,degree,institution,graduation_year,registration_number,credential_document_path,supporting_document_path,social_handles,status,requested_information,review_note,submitted_at,updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? professionalFromRow(data as ProfessionalVerificationRow) : null;
}

export async function submitCreatorApplication(
  client: SupabaseClient,
  userId: string,
  input: {
    creatorType: CreatorType;
    category: string;
    about: string;
    socialHandles: Record<string, string>;
    identityName: string;
    identityDocumentPath?: string | null;
  },
) {
  const { data, error } = await client
    .from('creator_applications')
    .upsert(
      {
        owner_id: userId,
        creator_type: input.creatorType,
        category: input.category.trim(),
        about: input.about.trim(),
        social_handles: input.socialHandles,
        identity_name: input.identityName.trim(),
        identity_document_path: input.identityDocumentPath ?? null,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id' },
    )
    .select('id,owner_id,creator_type,category,about,social_handles,identity_name,identity_document_path,status,requested_information,review_note,submitted_at,updated_at')
    .single();
  if (error) throw error;
  return creatorFromRow(data as CreatorApplicationRow);
}

export async function submitProfessionalVerification(
  client: SupabaseClient,
  userId: string,
  input: {
    creatorApplicationId?: string | null;
    professionalCategory: string;
    professionalTitle: string;
    degree: string;
    institution: string;
    graduationYear?: number | null;
    registrationNumber: string;
    credentialDocumentPath?: string | null;
    supportingDocumentPath?: string | null;
    socialHandles: Record<string, string>;
  },
) {
  const { data, error } = await client
    .from('professional_verification_requests')
    .upsert(
      {
        owner_id: userId,
        creator_application_id: input.creatorApplicationId ?? null,
        professional_category: input.professionalCategory.trim(),
        professional_title: input.professionalTitle.trim(),
        degree: input.degree.trim(),
        institution: input.institution.trim(),
        graduation_year: input.graduationYear ?? null,
        registration_number: input.registrationNumber.trim(),
        credential_document_path: input.credentialDocumentPath ?? null,
        supporting_document_path: input.supportingDocumentPath ?? null,
        social_handles: input.socialHandles,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id' },
    )
    .select('id,owner_id,creator_application_id,professional_category,professional_title,degree,institution,graduation_year,registration_number,credential_document_path,supporting_document_path,social_handles,status,requested_information,review_note,submitted_at,updated_at')
    .single();
  if (error) throw error;
  return professionalFromRow(data as ProfessionalVerificationRow);
}

export async function listCommerceApplications(client: SupabaseClient): Promise<CommerceApplicationSummary[]> {
  const [sellerResult, creatorResult, professionalResult, documentsResult] = await Promise.all([
    client.from('seller_applications').select('id,owner_id,seller_type,legal_name,storefront_name,business_name,registered_state,city,phone,email,address_line,pickup_address,return_address,gstin,pan_number,document_path,exterior_evidence_path,interior_evidence_path,status,requested_information,review_note,submitted_at,updated_at').order('updated_at', { ascending: false }).limit(50),
    client.from('creator_applications').select('id,owner_id,creator_type,category,about,social_handles,identity_name,identity_document_path,status,requested_information,review_note,submitted_at,updated_at').order('updated_at', { ascending: false }).limit(50),
    client.from('professional_verification_requests').select('id,owner_id,creator_application_id,professional_category,professional_title,degree,institution,graduation_year,registration_number,credential_document_path,supporting_document_path,social_handles,status,requested_information,review_note,submitted_at,updated_at').order('updated_at', { ascending: false }).limit(50),
    client.from('creator_commerce_documents').select('id,owner_id,application_kind,application_id,document_kind,storage_path,file_name,mime_type,file_size,created_at').order('created_at', { ascending: false }).limit(250),
  ]);
  if (sellerResult.error) throw sellerResult.error;
  if (creatorResult.error) throw creatorResult.error;
  if (professionalResult.error) throw professionalResult.error;
  if (documentsResult.error) throw documentsResult.error;

  const documentsByPath = new Map(
    ((documentsResult.data as CommerceDocumentRow[] | null) ?? []).map((row) => {
      const document = documentFromRow(row);
      return [document.storagePath, document] as const;
    }),
  );

  const docsFor = (paths: Array<string | null>) =>
    paths
      .filter((path): path is string => Boolean(path))
      .map((path) => documentsByPath.get(path))
      .filter((document): document is CommerceDocument => Boolean(document));

  return [
    ...((sellerResult.data as SellerApplicationRow[] | null) ?? []).map((row) => ({
      kind: 'seller' as const,
      ...sellerFromRow(row),
      documents: docsFor([row.document_path, row.exterior_evidence_path, row.interior_evidence_path]),
    })),
    ...((creatorResult.data as CreatorApplicationRow[] | null) ?? []).map((row) => ({
      kind: 'creator' as const,
      ...creatorFromRow(row),
      documents: docsFor([row.identity_document_path]),
    })),
    ...((professionalResult.data as ProfessionalVerificationRow[] | null) ?? []).map((row) => ({
      kind: 'professional' as const,
      ...professionalFromRow(row),
      documents: docsFor([row.credential_document_path, row.supporting_document_path]),
    })),
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createCommerceEvidenceSignedUrl(
  client: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 300,
) {
  const { data, error } = await client.storage
    .from(evidenceBucket)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Supabase did not return a signed evidence URL.');
  return data.signedUrl;
}

export async function reviewCommerceApplication(
  client: SupabaseClient,
  input: { kind: ApplicationKind; id: string; decision: Exclude<CommerceApprovalStatus, 'not_applied' | 'draft' | 'submitted'>; reason?: string },
) {
  const { error } = await client.rpc('review_creator_commerce_application', {
    target_kind: input.kind,
    target_id: input.id,
    target_decision: input.decision,
    target_reason: input.reason ?? null,
  });
  if (error) throw error;
}
