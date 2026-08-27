import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowLeft, BadgeCheck, BriefcaseBusiness, CheckCircle2, ClipboardCheck, ExternalLink, Eye, FileUp, RefreshCcw, ShieldCheck, Store, UserRoundCheck, XCircle } from 'lucide-react-native';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { useCommerceAccess } from './CommerceAccessContext';
import { BuyerLifecycleScreen, CreatorLifecycleScreen, SellerLifecycleScreen } from './LifecycleScreens';
import { creatorRequiresProfessionalVerification } from './onboardingRules';
import {
  createCommerceEvidenceSignedUrl,
  getMyCreatorApplication,
  getMyProfessionalRequest,
  getMySellerApplication,
  listCommerceApplications,
  reviewCommerceApplication,
  submitCreatorApplication,
  submitProfessionalVerification,
  submitSellerApplication,
  uploadCommerceEvidence,
  type ApplicationKind,
  type CommerceApplicationSummary,
  type CommerceApprovalStatus,
  type CommerceDocument,
  type CreatorApplication,
  type ProfessionalVerificationRequest,
  type SellerApplication,
  type SellerType,
} from './accessRepository';

type Status = 'loading' | 'ready' | 'error';

const statusLabels: Record<CommerceApprovalStatus, string> = {
  not_applied: 'Not applied',
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  more_information_required: 'Needs information',
  suspended: 'Suspended',
};

const lockedSellerStatuses = new Set<CommerceApprovalStatus>(['submitted', 'under_review', 'approved', 'suspended']);
const lockedCreatorStatuses = new Set<CommerceApprovalStatus>(['submitted', 'under_review', 'approved', 'suspended']);
const activeReviewStatuses = new Set<CommerceApprovalStatus>(['submitted', 'under_review']);
const editableApplicationStatuses = new Set<CommerceApprovalStatus>(['not_applied', 'draft', 'more_information_required']);

type AdminReviewDecision = 'approved' | 'rejected' | 'more_information_required' | 'suspended' | 'under_review';
type AdminReviewAction = {
  decision: AdminReviewDecision;
  label: string;
  destructive?: boolean;
  requiresReason?: boolean;
};

const getAvailableAdminActions = ({ applicationType: _applicationType, status }: { applicationType: ApplicationKind; status: CommerceApprovalStatus }): AdminReviewAction[] => {
  switch (status) {
    case 'submitted':
      return [
        { decision: 'under_review', label: 'Under review' },
        { decision: 'approved', label: 'Approve' },
        { decision: 'more_information_required', label: 'Request info', requiresReason: true },
        { decision: 'rejected', label: 'Reject', destructive: true, requiresReason: true },
      ];
    case 'under_review':
      return [
        { decision: 'approved', label: 'Approve' },
        { decision: 'more_information_required', label: 'Request info', requiresReason: true },
        { decision: 'rejected', label: 'Reject', destructive: true, requiresReason: true },
      ];
    case 'more_information_required':
      return [];
    case 'approved':
      return [{ decision: 'suspended', label: 'Suspend', destructive: true, requiresReason: true }];
    case 'suspended':
      return [{ decision: 'approved', label: 'Reinstate' }];
    default:
      return [];
  }
};

export function CommerceHomeScreen() {
  const { access, error, refresh } = useCommerceAccess();
  const sellerOpen = access?.sellerStatus === 'approved';
  const creatorOpen = access?.creatorStatus === 'approved';
  const professionalOpen = access?.professionalStatus === 'approved';
  const showSellerApply = !access || editableApplicationStatuses.has(access.sellerStatus);
  const showCreatorApply = !access || editableApplicationStatuses.has(access.creatorStatus);
  const showProfessionalApply = Boolean(access?.creatorStatus === 'approved' && editableApplicationStatuses.has(access.professionalStatus));
  const showSellerReviewStatus = Boolean(access && activeReviewStatuses.has(access.sellerStatus));
  const showCreatorReviewStatus = Boolean(access && activeReviewStatuses.has(access.creatorStatus));
  const showProfessionalReviewStatus = Boolean(access && activeReviewStatuses.has(access.professionalStatus));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.kicker}>SOCIAL 24x7</Text>
          <Text style={styles.title}>Creator Commerce</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh commerce status" onPress={() => void refresh()} style={styles.iconButton}>
          <RefreshCcw size={18} color="#08713d" />
        </Pressable>
      </View>

      {error ? <ErrorCard message={error} onRetry={() => void refresh()} /> : null}

      <View style={styles.heroPanel}>
        <Text style={styles.heroTitle}>Sell, create, and verify with admin review.</Text>
        <Text style={styles.heroText}>Applications are stored in Supabase. Approval, KYC, and professional verification stay server-owned.</Text>
      </View>

      <View style={styles.grid}>
        <StatusTile title="Seller" value={access ? statusLabels[access.sellerStatus] : 'Not loaded'} icon={Store} />
        <StatusTile title="Creator" value={access ? statusLabels[access.creatorStatus] : 'Not loaded'} icon={UserRoundCheck} />
        <StatusTile title="Professional" value={access ? statusLabels[access.professionalStatus] : 'Not loaded'} icon={BadgeCheck} />
        <StatusTile title="Buyer KYC" value={access ? access.buyerKycStatus.replaceAll('_', ' ') : 'Not loaded'} icon={ShieldCheck} />
      </View>

      <View style={styles.sectionCard}>
        {showSellerApply ? (
          <CommerceAction
            title={access?.sellerStatus === 'more_information_required' ? 'Update Seller Application' : access?.sellerStatus === 'rejected' ? 'Reapply as Seller' : 'Become a Seller'}
            subtitle="GST and non-GST onboarding with private evidence uploads."
            icon={Store}
            onPress={() => router.push('/commerce/seller-onboarding')}
          />
        ) : null}
        {showSellerReviewStatus ? <CommerceAction title={`Seller ${statusLabels[access!.sellerStatus]}`} subtitle="Your seller application is waiting for admin review." icon={Store} disabled onPress={() => undefined} /> : null}
        {sellerOpen ? <CommerceAction title="Seller Approved" subtitle="Seller tools are available. Creator access stays independent." icon={Store} disabled onPress={() => undefined} /> : null}

        {showCreatorApply ? (
          <CommerceAction
            title={access?.creatorStatus === 'more_information_required' ? 'Update Creator Application' : access?.creatorStatus === 'rejected' ? 'Reapply as Creator' : 'Become a Creator'}
            subtitle="Apply for normal Creator approval. Professional verification is separate."
            icon={UserRoundCheck}
            onPress={() => router.push('/commerce/creator-onboarding')}
          />
        ) : null}
        {showCreatorReviewStatus ? <CommerceAction title={`Creator ${statusLabels[access!.creatorStatus]}`} subtitle="Your creator application is waiting for admin review." icon={UserRoundCheck} disabled onPress={() => undefined} /> : null}
        {creatorOpen ? <CommerceAction title="Creator Approved" subtitle="Creator tools are available. Professional verification stays independent." icon={UserRoundCheck} disabled onPress={() => undefined} /> : null}

        {showProfessionalApply ? (
          <CommerceAction
            title={access?.professionalStatus === 'more_information_required' ? 'Update Professional Verification' : access?.professionalStatus === 'rejected' ? 'Reapply for Professional Verification' : 'Apply for Professional Verification'}
            subtitle="Add verified professional credentials without changing Creator access."
            icon={BadgeCheck}
            onPress={() => router.push('/commerce/creator-onboarding?mode=professional')}
          />
        ) : null}
        {showProfessionalReviewStatus ? <CommerceAction title={`Professional Verification ${statusLabels[access!.professionalStatus]}`} subtitle="Creator tools remain available while professional verification is reviewed." icon={BadgeCheck} disabled onPress={() => undefined} /> : null}
        {professionalOpen ? <CommerceAction title="Verified Professional" subtitle="Professional capability is approved on this Creator account." icon={BadgeCheck} disabled onPress={() => undefined} /> : null}
      </View>

      <View style={styles.sectionCard}>
        <CommerceAction
          title="Buyer marketplace"
          subtitle="Open creator referrals, cart, checkout, orders, and returns."
          icon={Store}
          onPress={() => router.push('/commerce/buyer')}
        />
        <CommerceAction
          title="Seller tools"
          subtitle={sellerOpen ? 'Open approved seller workspace.' : 'Locked until admin approves seller application.'}
          icon={BriefcaseBusiness}
          disabled={!sellerOpen}
          onPress={() => router.push('/commerce/seller')}
        />
        <CommerceAction
          title="Creator tools"
          subtitle={creatorOpen ? 'Open approved creator workspace.' : 'Locked until admin approves creator application.'}
          icon={ClipboardCheck}
          disabled={!creatorOpen}
          onPress={() => router.push('/commerce/creator')}
        />
        <CommerceAction
          title="Admin review"
          subtitle={access?.adminAccess ? 'Review seller, creator, and professional applications.' : 'Commerce admin capability required.'}
          icon={ShieldCheck}
          disabled={!access?.adminAccess}
          onPress={() => router.push('/commerce/admin')}
        />
      </View>
    </ScrollView>
  );
}

export function SellerOnboardingScreen() {
  const { user } = useAuth();
  const { refresh } = useCommerceAccess();
  const [status, setStatus] = useState<Status>('loading');
  const [application, setApplication] = useState<SellerApplication | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sellerType, setSellerType] = useState<SellerType>('gst');
  const [legalName, setLegalName] = useState('');
  const [storefrontName, setStorefrontName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [registeredState, setRegisteredState] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [returnAddress, setReturnAddress] = useState('');
  const [documentPath, setDocumentPath] = useState<string | null>(null);
  const [exteriorPath, setExteriorPath] = useState<string | null>(null);
  const [interiorPath, setInteriorPath] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    setFormError(null);
    setSuccessMessage(null);
    try {
      if (!supabase || !user || user.app_metadata?.provider === 'demo') {
        throw new Error('Use a real Supabase account to submit seller verification.');
      }
      const next = await getMySellerApplication(supabase, user.id);
      setApplication(next);
      if (next) {
        setSellerType(next.sellerType);
        setLegalName(next.legalName);
        setStorefrontName(next.storefrontName);
        setBusinessName(next.businessName);
        setRegisteredState(next.registeredState);
        setCity(next.city);
        setPhone(next.phone);
        setEmail(next.email);
        setGstin(next.gstin ?? '');
        setPanNumber(next.panNumber ?? '');
        setAddressLine(next.addressLine);
        setPickupAddress(next.pickupAddress);
        setReturnAddress(next.returnAddress);
        setDocumentPath(next.documentPath);
        setExteriorPath(next.exteriorEvidencePath);
        setInteriorPath(next.interiorEvidencePath);
      }
      setStatus('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load seller application.');
      setStatus('error');
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const locked = application ? lockedSellerStatuses.has(application.status) : false;

  const pickEvidence = async (documentKind: string, setter: (path: string) => void) => {
    if (!supabase || !user || user.app_metadata?.provider === 'demo') return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow media access to upload verification evidence.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.82 });
    if (result.canceled) return;
    setSaving(true);
    try {
      const path = await uploadCommerceEvidence(supabase, user.id, 'seller', documentKind, result.assets[0]);
      setter(path);
    } catch (cause) {
      Alert.alert('Upload failed', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const captureLocation = () => {
    const geolocation = globalThis.navigator?.geolocation;
    if (!geolocation) {
      Alert.alert('Location unavailable', 'This device/browser did not expose location capture to the app.');
      return;
    }
    geolocation.getCurrentPosition(
      (position) => setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => Alert.alert('Location not captured', 'Please allow location access and try again.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const submit = async () => {
    if (!supabase || !user || user.app_metadata?.provider === 'demo' || saving) return;
    const required = [
      legalName,
      storefrontName,
      businessName,
      registeredState,
      city,
      phone,
      email,
      addressLine,
      pickupAddress,
      returnAddress,
      documentPath,
      exteriorPath,
      interiorPath,
    ];
    if (sellerType === 'gst') required.push(gstin);
    if (sellerType === 'non_gst') required.push(panNumber);
    if (required.some((value) => !String(value ?? '').trim())) {
      setFormError('Fill every required field and upload all evidence before submitting.');
      Alert.alert('Complete seller application', 'Fill every required field and upload all evidence before submitting.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await submitSellerApplication(supabase, user.id, {
        sellerType,
        legalName,
        storefrontName,
        businessName,
        registeredState,
        city,
        phone,
        email,
        addressLine,
        pickupAddress,
        returnAddress,
        gstin,
        panNumber,
        documentPath,
        exteriorEvidencePath: exteriorPath,
        interiorEvidencePath: interiorPath,
        locationLatitude: location?.latitude ?? null,
        locationLongitude: location?.longitude ?? null,
      });
      const persisted = await getMySellerApplication(supabase, user.id);
      setApplication(persisted);
      if (persisted) {
        setSellerType(persisted.sellerType);
        setLegalName(persisted.legalName);
        setStorefrontName(persisted.storefrontName);
        setBusinessName(persisted.businessName);
        setRegisteredState(persisted.registeredState);
        setCity(persisted.city);
        setPhone(persisted.phone);
        setEmail(persisted.email);
        setGstin(persisted.gstin ?? '');
        setPanNumber(persisted.panNumber ?? '');
        setAddressLine(persisted.addressLine);
        setPickupAddress(persisted.pickupAddress);
        setReturnAddress(persisted.returnAddress);
        setDocumentPath(persisted.documentPath);
        setExteriorPath(persisted.exteriorEvidencePath);
        setInteriorPath(persisted.interiorEvidencePath);
      }
      await refresh();
      setSuccessMessage('Seller application submitted. It is locked while admin review is pending.');
      Alert.alert('Submitted', 'Seller application is under admin review. Seller tools remain locked until approval.');
    } catch (cause) {
      const message = normalizeSupabaseMessage(cause);
      setFormError(message);
      Alert.alert('Submission failed', message);
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading') return <Centered loading label="Loading seller onboarding..." />;
  if (status === 'error') return <Centered label={error ?? 'Unable to load seller onboarding.'} actionLabel="Retry" onAction={() => void load()} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header title="Seller onboarding" subtitle="Submit once. Admin approval unlocks seller tools." />
      {successMessage ? <SuccessCard message={successMessage} /> : null}
      {formError ? <ErrorCard message={formError} onRetry={() => setFormError(null)} /> : null}
      {application ? <ApplicationNotice status={application.status} requestedInformation={application.requestedInformation} reviewNote={application.reviewNote} /> : null}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Seller type</Text>
        <Segmented
          options={[
            ['gst', 'GST Registered Seller'],
            ['non_gst', 'Non-GST Seller'],
          ]}
          value={sellerType}
          onChange={(value) => setSellerType(value as SellerType)}
          disabled={locked}
        />
        <Text style={styles.helpText}>{sellerType === 'gst' ? 'GST sellers can be reviewed for pan-India eligibility.' : 'Non-GST sellers stay limited to their registered home state for now.'}</Text>
      </View>
      <View style={styles.sectionCard}>
        <Field label="Legal identity name" value={legalName} onChangeText={setLegalName} editable={!locked} />
        <Field label="Store name" value={storefrontName} onChangeText={setStorefrontName} editable={!locked} />
        <Field label="Business name" value={businessName} onChangeText={setBusinessName} editable={!locked} />
        <Field label="Registered state" value={registeredState} onChangeText={(value) => setRegisteredState(value.toUpperCase())} editable={!locked} autoCapitalize="characters" />
        <Field label="City" value={city} onChangeText={setCity} editable={!locked} />
        <Field label="Phone" value={phone} onChangeText={setPhone} editable={!locked} keyboardType="phone-pad" />
        <Field label="Email" value={email} onChangeText={setEmail} editable={!locked} keyboardType="email-address" autoCapitalize="none" />
        {sellerType === 'gst' ? <Field label="GSTIN" value={gstin} onChangeText={(value) => setGstin(value.toUpperCase())} editable={!locked} autoCapitalize="characters" /> : <Field label="PAN / local seller ID" value={panNumber} onChangeText={(value) => setPanNumber(value.toUpperCase())} editable={!locked} autoCapitalize="characters" />}
      </View>
      <View style={styles.sectionCard}>
        <Field label="Store address" value={addressLine} onChangeText={setAddressLine} editable={!locked} multiline />
        <Field label="Pickup address" value={pickupAddress} onChangeText={setPickupAddress} editable={!locked} multiline />
        <Field label="Return address" value={returnAddress} onChangeText={setReturnAddress} editable={!locked} multiline />
        <UploadRow title="Government/business document" path={documentPath} disabled={locked || saving} onPress={() => void pickEvidence('business-document', setDocumentPath)} />
        <UploadRow title="Exterior shop/business evidence" path={exteriorPath} disabled={locked || saving} onPress={() => void pickEvidence('exterior-evidence', setExteriorPath)} />
        <UploadRow title="Interior/inventory evidence" path={interiorPath} disabled={locked || saving} onPress={() => void pickEvidence('interior-evidence', setInteriorPath)} />
        <Pressable accessibilityRole="button" disabled={locked} onPress={captureLocation} style={[styles.secondaryButton, locked && styles.disabledButton]}>
          <Text style={styles.secondaryButtonText}>{location ? 'Location captured' : 'Capture current location'}</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" disabled={locked || saving} onPress={() => void submit()} style={[styles.primaryButton, (locked || saving) && styles.disabledButton]}>
        {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>{locked ? 'Application locked for review' : 'Submit seller application'}</Text>}
      </Pressable>
    </ScrollView>
  );
}

export function CreatorOnboardingScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const { user } = useAuth();
  const { refresh } = useCommerceAccess();
  const [status, setStatus] = useState<Status>('loading');
  const [creatorApplication, setCreatorApplication] = useState<CreatorApplication | null>(null);
  const [professionalRequest, setProfessionalRequest] = useState<ProfessionalVerificationRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showProfessionalForm, setShowProfessionalForm] = useState(params.mode === 'professional');
  const [category, setCategory] = useState('');
  const [about, setAbout] = useState('');
  const [instagram, setInstagram] = useState('');
  const [youtube, setYoutube] = useState('');
  const [identityName, setIdentityName] = useState('');
  const [identityDocumentPath, setIdentityDocumentPath] = useState<string | null>(null);
  const [professionalCategory, setProfessionalCategory] = useState('Doctor');
  const [professionalTitle, setProfessionalTitle] = useState('');
  const [degree, setDegree] = useState('');
  const [institution, setInstitution] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [credentialPath, setCredentialPath] = useState<string | null>(null);
  const [supportingPath, setSupportingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socialHandles = useMemo(() => ({ instagram: instagram.trim(), youtube: youtube.trim() }), [instagram, youtube]);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    setFormError(null);
    setSuccessMessage(null);
    try {
      if (!supabase || !user || user.app_metadata?.provider === 'demo') {
        throw new Error('Use a real Supabase account to submit creator verification.');
      }
      const [creator, professional] = await Promise.all([getMyCreatorApplication(supabase, user.id), getMyProfessionalRequest(supabase, user.id)]);
      setCreatorApplication(creator);
      setProfessionalRequest(professional);
      if (creator) {
        setCategory(creator.category);
        setAbout(creator.about);
        setInstagram(creator.socialHandles.instagram ?? '');
        setYoutube(creator.socialHandles.youtube ?? '');
        setIdentityName(creator.identityName);
        setIdentityDocumentPath(creator.identityDocumentPath);
      }
      if (professional) {
        setShowProfessionalForm(true);
        setProfessionalCategory(professional.professionalCategory || 'Doctor');
        setProfessionalTitle(professional.professionalTitle);
        setDegree(professional.degree);
        setInstitution(professional.institution);
        setGraduationYear(professional.graduationYear ? String(professional.graduationYear) : '');
        setRegistrationNumber(professional.registrationNumber);
        setCredentialPath(professional.credentialDocumentPath);
        setSupportingPath(professional.supportingDocumentPath);
      }
      setStatus('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load creator onboarding.');
      setStatus('error');
    }
  }, [params.mode, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const locked = Boolean(creatorApplication && lockedCreatorStatuses.has(creatorApplication.status));
  const canEditCreator = !creatorApplication || !locked;
  const canEditProfessional = !professionalRequest || professionalRequest.status === 'more_information_required' || professionalRequest.status === 'draft';
  const creatorApproved = creatorApplication?.status === 'approved';
  const professionalSubmittedOrApproved = Boolean(professionalRequest && professionalRequest.status !== 'draft' && professionalRequest.status !== 'more_information_required');

  const pickEvidence = async (kind: ApplicationKind, documentKind: string, setter: (path: string) => void) => {
    if (!supabase || !user || user.app_metadata?.provider === 'demo') return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow media access to upload verification evidence.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.82 });
    if (result.canceled) return;
    setSaving(true);
    try {
      const path = await uploadCommerceEvidence(supabase, user.id, kind, documentKind, result.assets[0]);
      setter(path);
    } catch (cause) {
      Alert.alert('Upload failed', normalizeSupabaseMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const hydratePersisted = async () => {
    if (!supabase || !user) return;
    const [persistedCreator, persistedProfessional] = await Promise.all([getMyCreatorApplication(supabase, user.id), getMyProfessionalRequest(supabase, user.id)]);
    setCreatorApplication(persistedCreator);
    setProfessionalRequest(persistedProfessional);
    if (persistedCreator) {
      setCategory(persistedCreator.category);
      setAbout(persistedCreator.about);
      setInstagram(persistedCreator.socialHandles.instagram ?? '');
      setYoutube(persistedCreator.socialHandles.youtube ?? '');
      setIdentityName(persistedCreator.identityName);
      setIdentityDocumentPath(persistedCreator.identityDocumentPath);
    }
    if (persistedProfessional) {
      setShowProfessionalForm(true);
      setProfessionalCategory(persistedProfessional.professionalCategory || 'Doctor');
      setProfessionalTitle(persistedProfessional.professionalTitle);
      setDegree(persistedProfessional.degree);
      setInstitution(persistedProfessional.institution);
      setGraduationYear(persistedProfessional.graduationYear ? String(persistedProfessional.graduationYear) : '');
      setRegistrationNumber(persistedProfessional.registrationNumber);
      setCredentialPath(persistedProfessional.credentialDocumentPath);
      setSupportingPath(persistedProfessional.supportingDocumentPath);
    }
  };

  const validateProfessional = () => {
    const professionalRequired = [professionalCategory, professionalTitle, degree, institution, graduationYear, registrationNumber, credentialPath];
    if (professionalRequired.some((value) => !String(value ?? '').trim())) {
      setFormError('Professional title, degree, institution, year, registration number, and credentials are required.');
      Alert.alert('Complete professional verification', 'Professional title, degree, institution, year, registration number, and credentials are required.');
      return false;
    }
    return true;
  };

  const submitCreator = async () => {
    if (!supabase || !user || user.app_metadata?.provider === 'demo' || saving) return;
    if (!canEditCreator) {
      Alert.alert('Creator application locked', 'This Creator application is already controlled by admin review.');
      return;
    }
    const baseRequired = [category, about, identityName, identityDocumentPath];
    if (baseRequired.some((value) => !String(value ?? '').trim())) {
      setFormError('Fill the creator details and upload identity evidence.');
      Alert.alert('Complete creator application', 'Fill the creator details and upload identity evidence.');
      return;
    }
    if (showProfessionalForm && !professionalRequest && !validateProfessional()) return;
    setSaving(true);
    setFormError(null);
    try {
      const creator = await submitCreatorApplication(supabase, user.id, {
        creatorType: showProfessionalForm && !professionalRequest ? 'professional' : creatorApplication?.creatorType ?? 'general',
        category,
        macroCategory: category,
        specializations: [category],
        about,
        socialHandles,
        identityName,
        identityDocumentPath,
      });
      if (showProfessionalForm && !professionalRequest) {
        await submitProfessionalVerification(supabase, user.id, {
          creatorApplicationId: creator.id,
          professionalCategory,
          professionalTitle,
          degree,
          institution,
          graduationYear: Number.parseInt(graduationYear, 10),
          registrationNumber,
          credentialDocumentPath: credentialPath,
          supportingDocumentPath: supportingPath,
          socialHandles,
        });
      }
      await hydratePersisted();
      await refresh();
      setSuccessMessage(showProfessionalForm && !professionalRequest ? 'Creator application and professional verification submitted. Admin can approve each independently.' : 'Creator application submitted. It is locked while admin review is pending.');
      Alert.alert('Submitted', showProfessionalForm && !professionalRequest ? 'Creator and professional verification are under admin review as separate capabilities.' : 'Creator application is under admin review.');
    } catch (cause) {
      const message = normalizeSupabaseMessage(cause);
      setFormError(message);
      Alert.alert('Submission failed', message);
    } finally {
      setSaving(false);
    }
  };

  const submitProfessional = async () => {
    if (!supabase || !user || user.app_metadata?.provider === 'demo' || saving) return;
    const creatorId = creatorApplication?.id;
    if (!creatorId) {
      setFormError('Submit the Creator application first, then add Professional verification.');
      Alert.alert('Creator application required', 'Submit the Creator application first, then add Professional verification.');
      return;
    }
    if (!canEditProfessional || professionalSubmittedOrApproved) {
      Alert.alert('Professional verification locked', 'This Professional verification request is already controlled by admin review.');
      return;
    }
    if (!validateProfessional()) return;
    setSaving(true);
    setFormError(null);
    try {
      await submitProfessionalVerification(supabase, user.id, {
        creatorApplicationId: creatorId,
        professionalCategory,
        professionalTitle,
        degree,
        institution,
        graduationYear: Number.parseInt(graduationYear, 10),
        registrationNumber,
        credentialDocumentPath: credentialPath,
        supportingDocumentPath: supportingPath,
        socialHandles,
      });
      await hydratePersisted();
      await refresh();
      setSuccessMessage('Professional verification submitted. Creator access remains unchanged while admin reviews credentials.');
      Alert.alert('Submitted', 'Professional verification is under admin review. Creator tools remain available.');
    } catch (cause) {
      const message = normalizeSupabaseMessage(cause);
      setFormError(message);
      Alert.alert('Submission failed', message);
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading') return <Centered loading label="Loading creator onboarding..." />;
  if (status === 'error') return <Centered label={error ?? 'Unable to load creator onboarding.'} actionLabel="Retry" onAction={() => void load()} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header title="Creator onboarding" subtitle="Creator and professional approvals stay under admin control." />
      {successMessage ? <SuccessCard message={successMessage} /> : null}
      {formError ? <ErrorCard message={formError} onRetry={() => setFormError(null)} /> : null}
      {creatorApplication ? <ApplicationNotice status={creatorApplication.status} requestedInformation={creatorApplication.requestedInformation} reviewNote={creatorApplication.reviewNote} /> : null}
      {professionalRequest ? <ApplicationNotice title="Professional verification" status={professionalRequest.status} requestedInformation={professionalRequest.requestedInformation} reviewNote={professionalRequest.reviewNote} /> : null}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Creator application</Text>
        <Text style={styles.helpText}>General Creator approval is its own capability. Professional verification can be added separately later.</Text>
        <Field label="Category or niche" value={category} onChangeText={setCategory} editable={canEditCreator} />
        <Field label="About" value={about} onChangeText={setAbout} editable={canEditCreator} multiline />
        <Field label="Instagram handle" value={instagram} onChangeText={setInstagram} editable={canEditCreator} autoCapitalize="none" />
        <Field label="YouTube handle" value={youtube} onChangeText={setYoutube} editable={canEditCreator} autoCapitalize="none" />
        <Field label="Identity name" value={identityName} onChangeText={setIdentityName} editable={canEditCreator} />
        <UploadRow title="Government identity evidence" path={identityDocumentPath} disabled={!canEditCreator || saving} onPress={() => void pickEvidence('creator', 'identity-document', setIdentityDocumentPath)} />
        {canEditCreator ? (
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void submitCreator()} style={[styles.primaryButton, saving && styles.disabledButton]}>
            {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>{showProfessionalForm && !professionalRequest ? 'Submit Creator + Professional' : 'Submit creator application'}</Text>}
          </Pressable>
        ) : (
          <Text style={styles.helpText}>{creatorApproved ? 'Creator approval is active. This form stays locked, but Professional verification can still be submitted separately.' : 'Creator application is locked for admin review.'}</Text>
        )}
      </View>

      {!showProfessionalForm && !professionalRequest ? (
        <Pressable accessibilityRole="button" onPress={() => setShowProfessionalForm(true)} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{creatorApproved ? 'Apply for Professional Verification' : 'Also apply for Professional Verification'}</Text>
        </Pressable>
      ) : null}

      {showProfessionalForm || professionalRequest ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Professional verification</Text>
          <Text style={styles.helpText}>This only changes Professional status. Creator access remains separate, including while credentials are under review.</Text>
          <Segmented
            options={[
              ['Doctor', 'Doctor'],
              ['Lawyer', 'Lawyer'],
              ['Other', 'Other'],
            ]}
            value={professionalCategory}
            onChange={setProfessionalCategory}
            disabled={!canEditProfessional || professionalSubmittedOrApproved}
          />
          <Field label="Professional title" value={professionalTitle} onChangeText={setProfessionalTitle} editable={canEditProfessional && !professionalSubmittedOrApproved} />
          <Field label="Degree" value={degree} onChangeText={setDegree} editable={canEditProfessional && !professionalSubmittedOrApproved} />
          <Field label="Institution" value={institution} onChangeText={setInstitution} editable={canEditProfessional && !professionalSubmittedOrApproved} />
          <Field label="Year" value={graduationYear} onChangeText={setGraduationYear} editable={canEditProfessional && !professionalSubmittedOrApproved} keyboardType="number-pad" />
          <Field label="Registration/license number" value={registrationNumber} onChangeText={setRegistrationNumber} editable={canEditProfessional && !professionalSubmittedOrApproved} />
          <UploadRow title="Credential document" path={credentialPath} disabled={!canEditProfessional || professionalSubmittedOrApproved || saving} onPress={() => void pickEvidence('professional', 'credential-document', setCredentialPath)} />
          <UploadRow title="Supporting document" path={supportingPath} disabled={!canEditProfessional || professionalSubmittedOrApproved || saving} onPress={() => void pickEvidence('professional', 'supporting-document', setSupportingPath)} />
          <Text style={styles.helpText}>Uploading credentials does not grant a verified badge. Admin approval is required.</Text>
          {creatorApplication && canEditProfessional && !professionalSubmittedOrApproved ? (
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void submitProfessional()} style={[styles.primaryButton, saving && styles.disabledButton]}>
              {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Submit Professional Verification</Text>}
            </Pressable>
          ) : null}
          {!creatorApplication ? <Text style={styles.helpText}>Submit the Creator application above to send this Professional verification in the same review batch.</Text> : null}
          {professionalSubmittedOrApproved ? <Text style={styles.helpText}>Professional verification is locked in its current admin-controlled state.</Text> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

export function AdminReviewScreen() {
  const [status, setStatus] = useState<Status>('loading');
  const [items, setItems] = useState<CommerceApplicationSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyDecision, setBusyDecision] = useState<AdminReviewDecision | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      if (!supabase) throw new Error('Supabase is not configured.');
      setItems(await listCommerceApplications(supabase));
      setStatus('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load applications.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (item: CommerceApplicationSummary, decision: AdminReviewDecision) => {
    if (!supabase || busyId) return;
    const reason = reasonById[item.id]?.trim();
    const action = getAvailableAdminActions({ applicationType: item.kind, status: item.status }).find((candidate) => candidate.decision === decision);
    if (!action) {
      Alert.alert('Invalid action', 'That review action is not available for the current status.');
      return;
    }
    if (action.requiresReason && !reason) {
      Alert.alert('Reason required', 'Enter a reason before rejecting, suspending, or requesting more information.');
      return;
    }
    setBusyId(item.id);
    setBusyDecision(decision);
    try {
      await reviewCommerceApplication(supabase, { kind: item.kind, id: item.id, decision, reason });
      setItems((current) => current.map((candidate) => {
        if (candidate.kind !== item.kind || candidate.id !== item.id) return candidate;
        return {
          ...candidate,
          status: decision,
          reviewNote: reason || null,
          requestedInformation: decision === 'more_information_required' ? reason || null : null,
          updatedAt: new Date().toISOString(),
        };
      }));
      await load();
    } catch (cause) {
      Alert.alert('Review failed', normalizeSupabaseMessage(cause));
    } finally {
      setBusyId(null);
      setBusyDecision(null);
    }
  };

  if (status === 'loading') return <Centered loading label="Loading admin review..." />;
  if (status === 'error') return <Centered label={error ?? 'Unable to load admin review.'} actionLabel="Retry" onAction={() => void load()} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header title="Commerce admin" subtitle="Review seller, creator, and professional verification requests." />
      <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Refresh applications</Text>
      </Pressable>
      {items.length ? items.map((item) => (
        <AdminCard
          key={`${item.kind}-${item.id}`}
          item={item}
          busy={busyId === item.id}
          busyDecision={busyId === item.id ? busyDecision : null}
          reason={reasonById[item.id] ?? ''}
          onReasonChange={(value) => setReasonById((current) => ({ ...current, [item.id]: value }))}
          onReview={review}
        />
      )) : <Text style={styles.emptyText}>No commerce applications yet.</Text>}
    </ScrollView>
  );
}

export function ApprovedSellerScreen() {
  return <SellerLifecycleScreen />;
}

export function ApprovedCreatorScreen() {
  return <CreatorLifecycleScreen />;
}

export function BuyerCommerceScreen() {
  return <BuyerLifecycleScreen />;
}

function AdminCard({
  item,
  busy,
  busyDecision,
  reason,
  onReasonChange,
  onReview,
}: {
  item: CommerceApplicationSummary;
  busy: boolean;
  busyDecision: AdminReviewDecision | null;
  reason: string;
  onReasonChange: (value: string) => void;
  onReview: (item: CommerceApplicationSummary, decision: AdminReviewDecision) => void;
}) {
  const title = item.kind === 'seller' ? item.storefrontName : item.kind === 'creator' ? item.macroCategory : item.professionalTitle;
  const evidence = evidenceForApplication(item);
  const actions = getAvailableAdminActions({ applicationType: item.kind, status: item.status });
  const requiresReason = actions.some((action) => action.requiresReason);

  return (
    <View style={styles.adminCard}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title || 'Application'}</Text>
          <Text style={styles.cardMeta}>{applicationKindLabel(item.kind)} | {statusLabels[item.status]}</Text>
          <Text selectable style={styles.cardMeta}>User {item.ownerId}</Text>
        </View>
        <StatusPill status={item.status} />
      </View>
      <DetailRows item={item} />
      {evidence.length ? (
        <View style={styles.evidenceList}>
          {evidence.map((asset) => <EvidenceReviewItem key={asset.path} asset={asset} />)}
        </View>
      ) : <Text style={styles.emptyText}>No evidence attached to this application.</Text>}
      {requiresReason ? <Field label="Reason for reject/request info/suspend" value={reason} onChangeText={onReasonChange} multiline /> : null}
      {actions.length ? (
        <View style={styles.actionRow}>
          {actions.map((action) => (
            <ReviewButton
              key={action.decision}
              label={action.label}
              processing={busyDecision === action.decision}
              destructive={action.destructive}
              primary={action.decision === 'approved'}
              disabled={busy}
              onPress={() => onReview(item, action.decision)}
            />
          ))}
        </View>
      ) : <Text style={styles.emptyText}>No review actions are available for this status.</Text>}
    </View>
  );
}

function applicationKindLabel(kind: ApplicationKind) {
  if (kind === 'seller') return 'Seller Application';
  if (kind === 'creator') return 'Creator Application';
  return 'Professional Verification';
}

function DetailRows({ item }: { item: CommerceApplicationSummary }) {
  if (item.kind === 'seller') {
    return (
      <View style={styles.details}>
        <Info label="Seller type" value={item.sellerType === 'gst' ? 'GST Registered' : 'Non-GST'} />
        <Info label="Registered state" value={item.registeredState} />
        <Info label="GSTIN/PAN" value={item.sellerType === 'gst' ? item.gstin ?? 'Missing' : item.panNumber ?? 'Missing'} />
      </View>
    );
  }
  if (item.kind === 'creator') {
    return (
      <View style={styles.details}>
        <Info label="Creator type" value={item.creatorType} />
        <Info label="Macro Vertical" value={item.macroCategory || 'Legacy category'} />
        <Info label="Specializations" value={item.specializations.length ? item.specializations.join(', ') : item.category || 'Not provided'} />
        <Info label="Professional verification" value={creatorRequiresProfessionalVerification(item.specializations) ? 'Required by selected specialization' : 'Not required'} />
        <Info label="About" value={item.about} />
      </View>
    );
  }
  return (
    <View style={styles.details}>
      <Info label="Macro Vertical" value={item.creatorMacroCategory ?? 'Not provided'} />
      <Info label="Specialization" value={item.creatorSpecializations?.join(', ') || item.professionalCategory} />
      <Info label="Professional verification" value="Required by selected specialization" />
      <Info label="Degree" value={`${item.degree} | ${item.institution}`} />
      <Info label="License" value={item.registrationNumber} />
    </View>
  );
}

type EvidenceAsset = {
  label: string;
  path: string;
  document?: CommerceDocument;
};

function evidenceForApplication(item: CommerceApplicationSummary): EvidenceAsset[] {
  const byPath = new Map(item.documents.map((document) => [document.storagePath, document]));
  const fromPath = (label: string, path: string | null): EvidenceAsset | null =>
    path ? { label, path, document: byPath.get(path) } : null;

  const assets = item.kind === 'seller'
    ? [
        fromPath('Government/business document', item.documentPath),
        fromPath('Exterior shop/business evidence', item.exteriorEvidencePath),
        fromPath('Interior/inventory evidence', item.interiorEvidencePath),
        fromPath('Seller verification video', item.businessVerificationVideoPath),
      ]
    : item.kind === 'creator'
      ? [fromPath('Government identity evidence', item.identityDocumentPath)]
      : [
          fromPath('Government identity evidence', item.creatorIdentityDocumentPath ?? null),
          fromPath('Credential document', item.credentialDocumentPath),
          fromPath('Supporting document', item.supportingDocumentPath),
          fromPath('Professional verification video', item.verificationVideoPath),
        ];

  return assets.filter((asset): asset is EvidenceAsset => Boolean(asset));
}

function EvidenceReviewItem({ asset }: { asset: EvidenceAsset }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mimeType = asset.document?.mimeType ?? mimeTypeFromPath(asset.path);
  const isImage = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');

  const ensureSignedUrl = useCallback(async () => {
    if (signedUrl) return signedUrl;
    if (!supabase) throw new Error('Supabase is not configured.');
    setLoading(true);
    setError(null);
    try {
      const nextUrl = await createCommerceEvidenceSignedUrl(supabase, asset.path, 300);
      setSignedUrl(nextUrl);
      return nextUrl;
    } catch (cause) {
      const message = normalizeSupabaseMessage(cause);
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [asset.path, signedUrl]);

  useEffect(() => {
    if (isImage) {
      void ensureSignedUrl().catch(() => undefined);
    }
  }, [ensureSignedUrl, isImage]);

  const openPreview = async () => {
    try {
      const nextUrl = await ensureSignedUrl();
      if (isImage || (isVideo && Platform.OS === 'web')) {
        setPreviewOpen(true);
        return;
      }
      await Linking.openURL(nextUrl);
    } catch (cause) {
      Alert.alert('Evidence unavailable', normalizeSupabaseMessage(cause));
    }
  };

  const openExternal = async () => {
    try {
      await Linking.openURL(await ensureSignedUrl());
    } catch (cause) {
      Alert.alert('Evidence unavailable', normalizeSupabaseMessage(cause));
    }
  };

  return (
    <View style={styles.evidenceCard}>
      <View style={styles.evidenceHeader}>
        {isImage && signedUrl ? <Image source={{ uri: signedUrl }} resizeMode="cover" style={styles.evidenceThumb} /> : <View style={styles.evidenceIcon}><FileUp size={18} color="#08713d" /></View>}
        <View style={{ flex: 1 }}>
          <Text style={styles.evidenceTitle}>{asset.label}</Text>
          <Text numberOfLines={1} style={styles.evidenceMeta}>{asset.document?.fileName ?? fileNameFromPath(asset.path)}</Text>
          <Text style={styles.evidenceMeta}>{mimeType || 'Unknown file'}{asset.document?.fileSize ? ` · ${formatBytes(asset.document.fileSize)}` : ''}</Text>
          {asset.document?.createdAt ? <Text style={styles.evidenceMeta}>Submitted {formatDate(asset.document.createdAt)}</Text> : null}
        </View>
      </View>
      {error ? <Text selectable style={styles.errorText}>{error}</Text> : null}
      <View style={styles.evidenceActions}>
        <Pressable accessibilityRole="button" disabled={loading} onPress={() => void openPreview()} style={styles.smallButton}>
          {loading ? <ActivityIndicator color="#08713d" /> : <><Eye size={14} color="#08713d" /><Text style={styles.smallButtonText}>View</Text></>}
        </Pressable>
        <Pressable accessibilityRole="button" disabled={loading} onPress={() => void openExternal()} style={styles.smallButton}>
          <ExternalLink size={14} color="#08713d" />
          <Text style={styles.smallButtonText}>Open</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void Clipboard.setStringAsync(asset.path)} style={styles.smallButtonMuted}>
          <Text style={styles.smallButtonMutedText}>Copy path</Text>
        </Pressable>
      </View>
      <Text numberOfLines={1} style={styles.storagePath}>Storage: {asset.path}</Text>
      <EvidencePreviewModal
        visible={previewOpen}
        signedUrl={signedUrl}
        title={asset.label}
        mimeType={mimeType}
        onClose={() => setPreviewOpen(false)}
      />
    </View>
  );
}

function EvidencePreviewModal({ visible, signedUrl, title, mimeType, onClose }: { visible: boolean; signedUrl: string | null; title: string; mimeType: string; onClose: () => void }) {
  const isImage = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.previewPanel}>
          <View style={styles.rowBetween}>
            <Text style={styles.previewTitle}>{title}</Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>
          {signedUrl && isImage ? <Image source={{ uri: signedUrl }} resizeMode="contain" style={styles.previewImage} /> : null}
          {signedUrl && isVideo && Platform.OS === 'web'
            ? createElement('video', { src: signedUrl, controls: true, style: styles.previewVideo as unknown as Record<string, string | number> })
            : null}
          {signedUrl && !isImage && !(isVideo && Platform.OS === 'web') ? (
            <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(signedUrl)} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Open secure document</Text>
            </Pressable>
          ) : null}
          <Text style={styles.previewHelp}>This is a short-lived private Supabase Storage URL. It expires automatically.</Text>
        </View>
      </View>
    </Modal>
  );
}

function ApprovedWorkspace({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header title={title} subtitle={subtitle} />
      <View style={styles.heroPanel}>
        <CheckCircle2 size={26} color="#08713d" />
        <Text style={styles.heroTitle}>Approved access confirmed</Text>
        <Text style={styles.heroText}>This route opened only after Supabase returned an approved commerce capability.</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/commerce')} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Back to commerce</Text>
      </Pressable>
    </ScrollView>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to commerce" onPress={() => router.replace('/commerce')} style={styles.iconButton}>
        <ArrowLeft size={19} color="#08713d" />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function ApplicationNotice({ title = 'Application status', status, requestedInformation, reviewNote }: { title?: string; status: CommerceApprovalStatus; requestedInformation?: string | null; reviewNote?: string | null }) {
  return (
    <View style={styles.notice}>
      <StatusPill status={status} />
      <Text style={styles.noticeTitle}>{title}: {statusLabels[status]}</Text>
      {requestedInformation ? <Text selectable style={styles.noticeText}>Requested info: {requestedInformation}</Text> : null}
      {reviewNote ? <Text selectable style={styles.noticeText}>Review note: {reviewNote}</Text> : null}
    </View>
  );
}

function UploadRow({ title, path, disabled, onPress }: { title: string; path: string | null; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.uploadRow, disabled && styles.disabledButton]}>
      <FileUp size={18} color="#08713d" />
      <View style={{ flex: 1 }}>
        <Text style={styles.uploadTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.uploadMeta}>{path ? 'Private evidence attached' : 'Upload image or video'}</Text>
      </View>
      <Text style={styles.uploadAction}>{path ? 'Replace' : 'Upload'}</Text>
    </Pressable>
  );
}

function Field({ label, value, onChangeText, editable = true, multiline, keyboardType, autoCapitalize = 'sentences' }: { label: string; value: string; onChangeText: (value: string) => void; editable?: boolean; multiline?: boolean; keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad'; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters' }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholderTextColor="#94a39a"
        style={[styles.input, multiline && styles.multiline, !editable && styles.disabledInput]}
      />
    </View>
  );
}

function Segmented({ options, value, onChange, disabled }: { options: Array<[string, string]>; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <View style={styles.segmented}>
      {options.map(([option, label]) => (
        <Pressable key={option} accessibilityRole="button" disabled={disabled} onPress={() => onChange(option)} style={[styles.segment, value === option && styles.segmentActive, disabled && styles.disabledButton]}>
          <Text style={[styles.segmentText, value === option && styles.segmentTextActive]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function CommerceAction({ title, subtitle, icon: Icon, disabled, onPress }: { title: string; subtitle: string; icon: typeof Store; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.commerceAction, disabled && styles.disabledButton]}>
      <View style={styles.actionIcon}><Icon size={19} color="#08713d" /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function StatusTile({ title, value, icon: Icon }: { title: string; value: string; icon: typeof Store }) {
  return (
    <View style={styles.tile}>
      <Icon size={18} color="#08713d" />
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileValue}>{value}</Text>
    </View>
  );
}

function StatusPill({ status }: { status: CommerceApprovalStatus }) {
  const approved = status === 'approved';
  const rejected = status === 'rejected' || status === 'suspended';
  return (
    <View style={[styles.statusPill, approved && styles.statusApproved, rejected && styles.statusRejected]}>
      {rejected ? <XCircle size={13} color="#b42318" /> : <CheckCircle2 size={13} color={approved ? '#08713d' : '#667085'} />}
      <Text style={[styles.statusText, approved && styles.statusTextApproved, rejected && styles.statusTextRejected]}>{statusLabels[status]}</Text>
    </View>
  );
}

function ReviewButton({ label, destructive, primary, disabled, processing, onPress }: { label: string; destructive?: boolean; primary?: boolean; disabled?: boolean; processing?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.reviewButton, primary && styles.reviewButtonPrimary, destructive && styles.reviewButtonDestructive, disabled && styles.disabledButton]}>
      {processing ? <ActivityIndicator color={primary ? '#fff' : destructive ? '#b42318' : '#08713d'} /> : <Text style={[styles.reviewButtonText, primary && styles.reviewButtonTextPrimary, destructive && styles.reviewButtonTextDestructive]}>{label}</Text>}
    </Pressable>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <Text selectable style={styles.infoText}>{label}: {value || 'Not provided'}</Text>;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.errorCard}>
      <Text selectable style={styles.errorText}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

function SuccessCard({ message }: { message: string }) {
  return (
    <View style={styles.successCard}>
      <CheckCircle2 size={16} color="#08713d" />
      <Text selectable style={styles.successText}>{message}</Text>
    </View>
  );
}

function Centered({ loading, label, actionLabel, onAction }: { loading?: boolean; label: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.centered}>
      {loading ? <ActivityIndicator color="#08713d" /> : null}
      <Text selectable style={styles.centeredText}>{label}</Text>
      {actionLabel ? <Pressable accessibilityRole="button" onPress={onAction} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{actionLabel}</Text></Pressable> : null}
    </View>
  );
}

function fileNameFromPath(path: string) {
  return path.split('/').pop() || 'Evidence file';
}

function mimeTypeFromPath(path: string) {
  const extension = fileNameFromPath(path).split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'mp4') return 'video/mp4';
  if (extension === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KB`;
  return `${(kib / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function normalizeSupabaseMessage(cause: unknown) {
  const message = cause instanceof Error ? cause.message : 'Please try again.';
  if (message.toLowerCase().includes('row-level security')) return 'Permission denied by Supabase RLS. This usually means the application is already under review or the account lacks admin access.';
  if (message.toLowerCase().includes('duplicate')) return 'An application already exists for this account.';
  return message;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 16, paddingBottom: 42, gap: 14 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kicker: { color: '#08713d', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#111111', fontSize: 25, lineHeight: 31, fontWeight: '900' },
  subtitle: { color: '#7c8781', fontSize: 13, lineHeight: 19, marginTop: 2 },
  heroPanel: { gap: 10, borderRadius: 20, borderWidth: 1, borderColor: '#dcefe2', backgroundColor: '#eff9f2', padding: 18 },
  heroTitle: { color: '#111111', fontSize: 21, lineHeight: 27, fontWeight: '900' },
  heroText: { color: '#586760', fontSize: 14, lineHeight: 21 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', minHeight: 112, borderRadius: 18, borderWidth: 1, borderColor: '#e5ece8', backgroundColor: '#ffffff', padding: 14, gap: 7 },
  tileTitle: { color: '#667085', fontSize: 12, fontWeight: '800' },
  tileValue: { color: '#111111', fontSize: 15, fontWeight: '900', textTransform: 'capitalize' },
  sectionCard: { borderRadius: 20, borderWidth: 1, borderColor: '#edf0ee', backgroundColor: '#ffffff', padding: 14, gap: 12, boxShadow: '0 5px 16px rgba(20, 35, 27, 0.05)' },
  sectionTitle: { color: '#111111', fontSize: 15, fontWeight: '900' },
  commerceAction: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 70, borderRadius: 16, backgroundColor: '#f8fbf9', borderWidth: 1, borderColor: '#e4ede7', padding: 12 },
  actionIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: '#eff9f2', alignItems: 'center', justifyContent: 'center' },
  actionTitle: { color: '#111111', fontSize: 15, fontWeight: '900' },
  actionSubtitle: { color: '#667085', fontSize: 12, lineHeight: 17, marginTop: 2 },
  field: { gap: 6 },
  fieldLabel: { color: '#51605a', fontSize: 12, fontWeight: '800' },
  input: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: '#dfe8e2', backgroundColor: '#fbfdfc', paddingHorizontal: 12, color: '#111111', fontSize: 15 },
  multiline: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  disabledInput: { color: '#667085', backgroundColor: '#f2f5f3' },
  segmented: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  segment: { flexGrow: 1, minHeight: 42, borderRadius: 14, borderWidth: 1, borderColor: '#dfe8e2', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  segmentActive: { borderColor: '#08713d', backgroundColor: '#eff9f2' },
  segmentText: { color: '#667085', fontSize: 13, fontWeight: '800' },
  segmentTextActive: { color: '#08713d' },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderRadius: 16, borderWidth: 1, borderColor: '#dcefe2', backgroundColor: '#f8fbf9', padding: 12 },
  uploadTitle: { color: '#111111', fontWeight: '900', fontSize: 14 },
  uploadMeta: { color: '#667085', fontSize: 12, marginTop: 2 },
  uploadAction: { color: '#08713d', fontWeight: '900', fontSize: 12 },
  primaryButton: { minHeight: 54, borderRadius: 17, backgroundColor: '#08713d', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryButtonText: { color: '#ffffff', fontWeight: '900', fontSize: 15 },
  secondaryButton: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: '#dcefe2', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryButtonText: { color: '#08713d', fontWeight: '900', fontSize: 14 },
  disabledButton: { opacity: 0.55 },
  notice: { gap: 8, borderRadius: 18, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f8fafc', padding: 14 },
  noticeTitle: { color: '#111111', fontWeight: '900', fontSize: 14 },
  noticeText: { color: '#667085', fontSize: 13, lineHeight: 19 },
  helpText: { color: '#667085', fontSize: 13, lineHeight: 19 },
  iconButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#f4f4f4', alignItems: 'center', justifyContent: 'center' },
  statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, backgroundColor: '#eef2f0', paddingHorizontal: 9, paddingVertical: 5 },
  statusApproved: { backgroundColor: '#e7f8ee' },
  statusRejected: { backgroundColor: '#fff1f0' },
  statusText: { color: '#667085', fontSize: 11, fontWeight: '900' },
  statusTextApproved: { color: '#08713d' },
  statusTextRejected: { color: '#b42318' },
  adminCard: { gap: 12, borderRadius: 20, borderWidth: 1, borderColor: '#edf0ee', backgroundColor: '#ffffff', padding: 14, boxShadow: '0 5px 16px rgba(20, 35, 27, 0.05)' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  cardTitle: { color: '#111111', fontSize: 17, fontWeight: '900' },
  cardMeta: { color: '#667085', fontSize: 12, lineHeight: 18, marginTop: 2 },
  details: { gap: 4 },
  infoText: { color: '#3f4d47', fontSize: 13, lineHeight: 19 },
  evidenceList: { gap: 10 },
  evidenceCard: { gap: 10, borderRadius: 16, backgroundColor: '#f8fbf9', borderWidth: 1, borderColor: '#e4ede7', padding: 10 },
  evidenceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  evidenceThumb: { width: 72, height: 58, borderRadius: 12, backgroundColor: '#edf5f0' },
  evidenceIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#eff9f2', alignItems: 'center', justifyContent: 'center' },
  evidenceTitle: { color: '#111111', fontSize: 13, fontWeight: '900' },
  evidenceMeta: { color: '#667085', fontSize: 11, lineHeight: 16, marginTop: 1 },
  evidenceActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  smallButton: { minHeight: 36, borderRadius: 12, borderWidth: 1, borderColor: '#dcefe2', backgroundColor: '#ffffff', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  smallButtonText: { color: '#08713d', fontSize: 12, fontWeight: '900' },
  smallButtonMuted: { minHeight: 36, borderRadius: 12, borderWidth: 1, borderColor: '#e4ede7', backgroundColor: '#f9fbfa', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  smallButtonMutedText: { color: '#51605a', fontSize: 12, fontWeight: '800' },
  storagePath: { color: '#98a29d', fontSize: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(12, 18, 15, 0.72)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  previewPanel: { width: '100%', maxWidth: 900, maxHeight: '92%', gap: 12, borderRadius: 20, backgroundColor: '#ffffff', padding: 14 },
  previewTitle: { flex: 1, color: '#111111', fontSize: 16, fontWeight: '900' },
  closeButton: { borderRadius: 12, backgroundColor: '#f2f5f3', paddingHorizontal: 12, paddingVertical: 8 },
  closeButtonText: { color: '#08713d', fontSize: 12, fontWeight: '900' },
  previewImage: { width: '100%', height: 560, maxHeight: '78%', borderRadius: 16, backgroundColor: '#f2f5f3' },
  previewVideo: { width: '100%', maxHeight: 560, borderRadius: 16, backgroundColor: '#111111' },
  previewHelp: { color: '#667085', fontSize: 12, lineHeight: 18 },
  evidenceButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42, borderRadius: 12, backgroundColor: '#f8fbf9', borderWidth: 1, borderColor: '#e4ede7', paddingHorizontal: 10 },
  evidenceText: { flex: 1, color: '#51605a', fontSize: 12 },
  copyText: { color: '#08713d', fontSize: 12, fontWeight: '900' },
  actionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  reviewButton: { flexGrow: 1, minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: '#dcefe2', backgroundColor: '#eff9f2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  reviewButtonPrimary: { minHeight: 50, backgroundColor: '#08713d', borderColor: '#08713d', shadowColor: '#08713d', shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
  reviewButtonDestructive: { backgroundColor: '#fff1f0', borderColor: '#ffd6d2' },
  reviewButtonText: { color: '#08713d', fontSize: 12, fontWeight: '900' },
  reviewButtonTextPrimary: { color: '#ffffff', fontSize: 14 },
  reviewButtonTextDestructive: { color: '#b42318' },
  emptyText: { color: '#667085', fontSize: 14, lineHeight: 21, padding: 12 },
  errorCard: { gap: 10, borderRadius: 18, backgroundColor: '#fff1f0', borderWidth: 1, borderColor: '#ffd6d2', padding: 14 },
  errorText: { color: '#b42318', fontSize: 13, lineHeight: 19 },
  successCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 18, backgroundColor: '#e7f8ee', borderWidth: 1, borderColor: '#c7ead5', padding: 14 },
  successText: { flex: 1, color: '#08713d', fontSize: 13, fontWeight: '800', lineHeight: 19 },
  retryButton: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: '#ffffff' },
  retryText: { color: '#08713d', fontWeight: '900' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, backgroundColor: '#ffffff' },
  centeredText: { color: '#51605a', fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
