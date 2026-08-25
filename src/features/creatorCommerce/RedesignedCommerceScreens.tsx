import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ComponentProps, type ComponentType, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardCopy,
  ExternalLink,
  FileUp,
  Link2,
  MapPin,
  MessageCircle,
  PackageSearch,
  RefreshCcw,
  ShieldCheck,
  Store,
  UserRoundCheck,
} from 'lucide-react-native';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { useCommerceAccess } from './CommerceAccessContext';
import {
  getMyCommerceVerificationProfile,
  getMyCreatorApplication,
  getMyProfessionalRequest,
  getMySellerApplication,
  saveCommerceOnboardingDraft,
  submitCreatorApplication,
  submitProfessionalVerification,
  submitSellerApplication,
  uploadCommerceEvidence,
  type ApplicationKind,
  type CommerceApprovalStatus,
  type CreatorApplication,
  type ProfessionalVerificationRequest,
  type SellerApplication,
  type SellerType,
} from './accessRepository';
import {
  createPromotion,
  formatMinor,
  listCreatorCommissions,
  listCreatorMarketplaceProducts,
  listMyPromotions,
  type CreatorCommission,
  type CreatorPromotion,
  type LifecycleProduct,
} from './lifecycleRepository';
import {
  creatorCategories,
  creatorOnboardingBaseSteps,
  creatorRequiresProfessionalVerification,
  creatorSpecializationsFor,
  credentialRuleFor,
  selectCreatorSpecialization,
  sellerOnboardingSteps,
  type AudienceTier,
} from './onboardingRules';

type LoadState = 'loading' | 'ready' | 'error';
type TabKey = 'overview' | 'products' | 'links' | 'commissions' | 'analytics' | 'verification' | 'messages';

const green = '#08713d';
const greenBright = '#0fba68';
const ink = '#101815';
const muted = '#65736c';
const line = '#dce8e1';
const mint = '#eef9f3';
const canvas = '#f7faf8';

const statusText = (status?: CommerceApprovalStatus) => {
  if (!status || status === 'not_applied') return 'Not started';
  if (status === 'more_information_required') return 'Needs information';
  return status.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
};

const payloadString = (payload: Record<string, unknown>, key: string) =>
  typeof payload[key] === 'string' ? String(payload[key]) : '';
const payloadNumber = (payload: Record<string, unknown>, key: string) =>
  typeof payload[key] === 'number' ? Number(payload[key]) : 0;
const payloadStrings = (payload: Record<string, unknown>, key: string) =>
  Array.isArray(payload[key]) ? (payload[key] as unknown[]).filter((item): item is string => typeof item === 'string') : [];

const errorMessage = (cause: unknown) => {
  const raw = cause instanceof Error ? cause.message : 'Please try again.';
  if (raw.includes('row-level security')) return 'This action is not allowed for the current account.';
  return raw.replace(/^Error:\s*/i, '');
};

export function CommerceHomeScreen() {
  const { user } = useAuth();
  const { access, error, refresh } = useCommerceAccess();
  const [sellerApplication, setSellerApplication] = useState<SellerApplication | null>(null);
  const [creatorApplication, setCreatorApplication] = useState<CreatorApplication | null>(null);

  const loadDrafts = useCallback(async () => {
    if (!supabase || !user || user.app_metadata?.provider === 'demo') return;
    const [seller, creator] = await Promise.all([
      getMySellerApplication(supabase, user.id),
      getMyCreatorApplication(supabase, user.id),
    ]);
    setSellerApplication(seller);
    setCreatorApplication(creator);
  }, [user]);

  useEffect(() => { void loadDrafts(); }, [loadDrafts]);

  const sellerApproved = access?.sellerStatus === 'approved';
  const creatorApproved = access?.creatorStatus === 'approved';
  const dualRole = sellerApproved && creatorApproved;
  const sellerStep = Math.min(5, Math.max(0, payloadNumber(sellerApplication?.applicationPayload ?? {}, 'completedStep')));
  const creatorStep = Math.min(5, Math.max(0, payloadNumber(creatorApplication?.applicationPayload ?? {}, 'completedStep')));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.page}>
      <View style={styles.homeHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>SOCIAL 24x7</Text>
          <Text style={styles.homeTitle}>Earn & Sell</Text>
          <Text style={styles.homeSubtitle}>Choose how you want to grow. You keep one Social24 account and can use both workspaces.</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh Commerce" style={styles.iconButton} onPress={() => { void refresh(); void loadDrafts(); }}>
          <RefreshCcw size={19} color={green} />
        </Pressable>
      </View>

      {error ? <Banner tone="error" title="Commerce could not refresh" message={error} /> : null}

      {dualRole ? (
        <View style={styles.switcherCard}>
          <Text style={styles.cardTitle}>Your workspaces</Text>
          <Text style={styles.cardCopy}>Switch roles without signing out or creating another profile.</Text>
          <View style={styles.rowWrap}>
            <SmallAction label="Seller Studio" onPress={() => router.push('/seller')} />
            <SmallAction label="Creator Centre" onPress={() => router.push('/commerce/creator')} />
          </View>
        </View>
      ) : null}

      <RoleCard
        icon={Store}
        title={sellerApproved ? 'Open Seller Studio' : sellerApplication ? 'Continue selling setup' : 'Start Selling'}
        description={sellerApproved ? 'Manage your store, Products, orders and fulfilment.' : 'Build your store and sell Products with a guided review.'}
        badge={sellerApproved ? 'Approved' : sellerApplication ? `${statusText(sellerApplication.status)} · ${sellerStep} of 5 steps` : undefined}
        onPress={() => router.push(sellerApproved ? '/seller' : '/commerce/seller-onboarding')}
      />
      <RoleCard
        icon={UserRoundCheck}
        title={creatorApproved ? 'Open Creator Centre' : creatorApplication ? 'Continue Creator setup' : 'Become a Creator'}
        description={creatorApproved ? 'Promote Products, manage links and track real commissions.' : 'Promote Products and earn commissions through tracked links.'}
        badge={creatorApproved ? 'Approved' : creatorApplication ? `${statusText(creatorApplication.status)} · ${creatorStep} steps saved` : undefined}
        onPress={() => router.push(creatorApproved ? '/commerce/creator' : '/commerce/creator-onboarding')}
      />

      <View style={styles.infoCard}>
        <ShieldCheck size={21} color={green} />
        <View style={{ flex: 1 }}>
          <Text style={styles.infoTitle}>One identity, separate capabilities</Text>
          <Text style={styles.infoCopy}>Seller and Creator reviews remain Admin-controlled. Professional credentials only appear when your Creator category needs them.</Text>
        </View>
      </View>

      {access?.adminAccess ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/commerce/admin')} style={styles.adminLink}>
          <ShieldCheck size={18} color={green} />
          <Text style={styles.adminLinkText}>Open Commerce Admin</Text>
          <ChevronRight size={18} color={green} />
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

export function SellerOnboardingScreen() {
  const { user } = useAuth();
  const { refresh } = useCommerceAccess();
  const [state, setState] = useState<LoadState>('loading');
  const [application, setApplication] = useState<SellerApplication | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sellerType, setSellerType] = useState<SellerType>('gst');
  const [legalName, setLegalName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [storefrontName, setStorefrontName] = useState('');
  const [registeredState, setRegisteredState] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [localSellerId, setLocalSellerId] = useState('');
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [addressLine, setAddressLine] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [returnAddress, setReturnAddress] = useState('');
  const [documentPath, setDocumentPath] = useState<string | null>(null);
  const [exteriorPath, setExteriorPath] = useState<string | null>(null);
  const [interiorPath, setInteriorPath] = useState<string | null>(null);
  const [verificationVideoPath, setVerificationVideoPath] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [bankHolder, setBankHolder] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [ifsc, setIfsc] = useState('');

  const hydrate = useCallback((next: SellerApplication | null) => {
    setApplication(next);
    if (!next) return;
    const payload = next.applicationPayload;
    setSellerType(next.sellerType);
    setLegalName(payloadString(payload, 'legalName') || (next.legalName === 'Seller applicant' ? '' : next.legalName));
    setBusinessName(payloadString(payload, 'businessName') || next.businessName);
    setStorefrontName(payloadString(payload, 'storefrontName') || (next.storefrontName === 'Draft store' ? '' : next.storefrontName));
    setRegisteredState(payloadString(payload, 'registeredState') || next.registeredState);
    setCity(payloadString(payload, 'city') || next.city);
    setPostalCode(payloadString(payload, 'postalCode'));
    setPhone(payloadString(payload, 'phone') || next.phone);
    setEmail(payloadString(payload, 'email') || next.email);
    setGstin(payloadString(payload, 'gstin') || next.gstin || '');
    setPanNumber(payloadString(payload, 'panNumber') || next.panNumber || '');
    setLocalSellerId(payloadString(payload, 'localSellerId'));
    setDeclarationAccepted(payload.declarationAccepted === true);
    setAddressLine(payloadString(payload, 'addressLine') || next.addressLine);
    setPickupAddress(payloadString(payload, 'pickupAddress') || next.pickupAddress);
    setReturnAddress(payloadString(payload, 'returnAddress') || next.returnAddress);
    setDocumentPath(next.documentPath || payloadString(payload, 'documentPath') || null);
    setExteriorPath(next.exteriorEvidencePath || payloadString(payload, 'exteriorEvidencePath') || null);
    setInteriorPath(next.interiorEvidencePath || payloadString(payload, 'interiorEvidencePath') || null);
    setVerificationVideoPath(next.businessVerificationVideoPath || payloadString(payload, 'businessVerificationVideoPath') || null);
    const latitude = next.locationLatitude ?? (typeof payload.locationLatitude === 'number' ? payload.locationLatitude : null);
    const longitude = next.locationLongitude ?? (typeof payload.locationLongitude === 'number' ? payload.locationLongitude : null);
    if (latitude != null && longitude != null) setLocation({ latitude, longitude });
    setBankHolder(payloadString(payload, 'bankAccountHolder'));
    setBankAccount(payloadString(payload, 'bankAccountNumber'));
    setIfsc(payloadString(payload, 'bankIfsc'));
    setStep(Math.min(4, payloadNumber(payload, 'currentStep')));
  }, []);

  const load = useCallback(async () => {
    setState('loading');
    try {
      if (!supabase || !user || user.app_metadata?.provider === 'demo') throw new Error('Use a real Social24 account for Seller onboarding.');
      hydrate(await getMySellerApplication(supabase, user.id));
      setState('ready');
    } catch (cause) {
      setNotice(errorMessage(cause));
      setState('error');
    }
  }, [hydrate, user]);

  useEffect(() => { void load(); }, [load]);

  const payload = (currentStep: number, completedStep = currentStep) => ({
    onboardingVersion: 2,
    currentStep,
    completedStep,
    sellerType,
    legalName,
    businessName,
    storefrontName,
    registeredState,
    city,
    postalCode,
    phone,
    email,
    gstin,
    panNumber,
    localSellerId,
    declarationAccepted,
    addressLine,
    pickupAddress,
    returnAddress,
    documentPath,
    exteriorEvidencePath: exteriorPath,
    interiorEvidencePath: interiorPath,
    businessVerificationVideoPath: verificationVideoPath,
    locationLatitude: location?.latitude ?? null,
    locationLongitude: location?.longitude ?? null,
    bankAccountHolder: bankHolder,
    bankAccountNumber: bankAccount,
    bankIfsc: ifsc,
    taxVerificationStatus: 'manual_review',
    bankVerificationStatus: 'manual_review',
  });

  const persist = async (targetStep: number, exit = false) => {
    if (!supabase || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await saveCommerceOnboardingDraft(supabase, 'seller', payload(targetStep, Math.max(targetStep, step)));
      setStep(targetStep);
      setNotice('Progress saved');
      if (exit) router.replace('/commerce');
    } catch (cause) {
      setNotice(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const validate = (current: number) => {
    if (current === 1) {
      const required = [legalName, businessName, storefrontName, registeredState, city, phone, email, sellerType === 'gst' ? gstin : panNumber, sellerType === 'non_gst' ? localSellerId : 'ok'];
      if (required.some((value) => !value.trim()) || (sellerType === 'non_gst' && !declarationAccepted)) return 'Complete the business and compliance information.';
    }
    if (current === 2 && ([addressLine, pickupAddress, returnAddress, postalCode].some((value) => !value.trim()) || !documentPath || !exteriorPath || !interiorPath || !verificationVideoPath || !location)) return 'Add addresses, PIN code, location, three evidence items, and the short verification video.';
    if (current === 3 && [bankHolder, bankAccount, ifsc].some((value) => !value.trim())) return 'Add the payout bank information for manual verification.';
    return null;
  };

  const next = async () => {
    const message = validate(step);
    if (message) { setNotice(message); Alert.alert('Finish this step', message); return; }
    await persist(Math.min(4, step + 1));
  };

  const pickEvidence = async (documentKind: string, setter: (value: string) => void) => {
    if (!supabase || !user) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Permission required', 'Allow media access to attach Seller verification evidence.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.82 });
    if (result.canceled) return;
    setBusy(true);
    try { setter(await uploadCommerceEvidence(supabase, user.id, 'seller', documentKind, result.assets[0])); }
    catch (cause) { Alert.alert('Upload failed', errorMessage(cause)); }
    finally { setBusy(false); }
  };

  const captureLocation = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Location permission was denied. Allow location access for this site and try again.');
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      setNotice('Location captured');
    } catch (cause) {
      const message = errorMessage(cause);
      setNotice(message);
      Alert.alert('Location not captured', message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!supabase || !user || busy) return;
    for (const index of [1, 2, 3]) {
      const message = validate(index);
      if (message) { setStep(index); Alert.alert('Application incomplete', message); return; }
    }
    setBusy(true);
    try {
      await submitSellerApplication(supabase, user.id, {
        sellerType, legalName, storefrontName, businessName, registeredState, city, phone, email,
        addressLine, pickupAddress, returnAddress, gstin, panNumber, documentPath,
        exteriorEvidencePath: exteriorPath, interiorEvidencePath: interiorPath,
        businessVerificationVideoPath: verificationVideoPath,
        locationLatitude: location?.latitude, locationLongitude: location?.longitude,
        applicationPayload: payload(4, 5),
      });
      await refresh();
      hydrate(await getMySellerApplication(supabase, user.id));
      Alert.alert('Submitted for review', 'Your Seller application is now with Commerce Admin. Bank and tax checks remain manual until providers are connected.');
    } catch (cause) { Alert.alert('Submission failed', errorMessage(cause)); }
    finally { setBusy(false); }
  };

  if (state === 'loading') return <Loading label="Loading Seller setup…" />;
  if (state === 'error') return <StateError message={notice ?? 'Unable to load Seller setup.'} onRetry={load} />;
  const locked = application && ['submitted', 'under_review', 'approved', 'suspended'].includes(application.status);
  if (locked) return <ReviewState kind="Seller" application={application} onRefresh={async () => { await load(); await refresh(); }} onOpen={() => router.replace(application.status === 'approved' ? '/seller' : '/commerce')} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Start Selling" subtitle="A guided setup you can save and resume." />
      <Stepper labels={sellerOnboardingSteps} step={step} />
      {notice ? <Banner tone={notice === 'Progress saved' ? 'success' : 'error'} title={notice} /> : null}

      {step === 0 ? <SellerTypeStep value={sellerType} onChange={setSellerType} /> : null}
      {step === 1 ? (
        <Section title="Your business" copy="We use this information for manual compliance review. No automatic provider result is being claimed.">
          <Field label="Legal identity / business name" value={legalName} onChangeText={setLegalName} />
          <Field label="Store name" value={storefrontName} onChangeText={setStorefrontName} />
          <Field label="Trade / business name" value={businessName} onChangeText={setBusinessName} />
          <Field label="Registered or home state" value={registeredState} onChangeText={(value) => setRegisteredState(value.toUpperCase())} autoCapitalize="characters" />
          <Field label="City" value={city} onChangeText={setCity} />
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          {sellerType === 'gst' ? <Field label="GSTIN" value={gstin} onChangeText={(value) => setGstin(value.toUpperCase())} autoCapitalize="characters" /> : (
            <>
              <Field label="PAN" value={panNumber} onChangeText={(value) => setPanNumber(value.toUpperCase())} autoCapitalize="characters" />
              <Field label="Enrolment ID / UIN / local Seller ID" value={localSellerId} onChangeText={setLocalSellerId} />
              <CheckRow checked={declarationAccepted} label="I understand that Non-GST selling is limited by the configured home-state rules." onPress={() => setDeclarationAccepted((value) => !value)} />
            </>
          )}
          <VerificationHint label={sellerType === 'gst' ? 'GST verification' : 'PAN / enrolment verification'} />
        </Section>
      ) : null}
      {step === 2 ? (
        <Section title="Store & pickup" copy="Location and private evidence help Admin verify the real place from which you operate.">
          <Field label="Store address" value={addressLine} onChangeText={setAddressLine} multiline />
          <Field label="Pickup address" value={pickupAddress} onChangeText={setPickupAddress} multiline />
          <Field label="Return address" value={returnAddress} onChangeText={setReturnAddress} multiline />
          <Field label="PIN / postal code" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" />
          <UploadRow title="Government or business document" value={documentPath} disabled={busy} onPress={() => void pickEvidence('business-document', setDocumentPath)} />
          <UploadRow title="Exterior evidence" value={exteriorPath} disabled={busy} onPress={() => void pickEvidence('exterior-evidence', setExteriorPath)} />
          <UploadRow title="Interior / inventory evidence" value={interiorPath} disabled={busy} onPress={() => void pickEvidence('interior-evidence', setInteriorPath)} />
          <UploadRow title="Short verification video" value={verificationVideoPath} disabled={busy} onPress={() => void pickEvidence('verification-video', setVerificationVideoPath)} />
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void captureLocation()} style={[styles.outlineButton, busy && styles.disabled]}>
            <MapPin size={18} color={green} /><Text style={styles.outlineButtonText}>{busy ? 'Capturing location…' : location ? 'Location captured' : 'Capture current location'}</Text>
          </Pressable>
        </Section>
      ) : null}
      {step === 3 ? (
        <Section title="Bank & payout" copy="The details are stored with the private application. Verification remains manual until a real bank provider is connected.">
          <Field label="Account holder name" value={bankHolder} onChangeText={setBankHolder} />
          <Field label="Account number" value={bankAccount} onChangeText={setBankAccount} keyboardType="number-pad" secureTextEntry />
          <Field label="IFSC" value={ifsc} onChangeText={(value) => setIfsc(value.toUpperCase())} autoCapitalize="characters" />
          <VerificationHint label="Bank verification" />
        </Section>
      ) : null}
      {step === 4 ? (
        <Section title="Review & submit" copy="Confirm each section before sending one organized application to Admin.">
          <SummaryRow label="Seller type" value={sellerType === 'gst' ? 'GST Registered Seller' : 'Non-GST / Enrolment Seller'} />
          <SummaryRow label="Business" value={`${businessName || 'Incomplete'} · ${registeredState || 'State missing'}`} />
          <SummaryRow label="Store" value={storefrontName || 'Incomplete'} />
          <SummaryRow label="Pickup & return" value={pickupAddress && returnAddress ? 'Provided' : 'Incomplete'} />
          <SummaryRow label="Evidence, video & location" value={documentPath && exteriorPath && interiorPath && verificationVideoPath && location ? 'Complete' : 'Incomplete'} />
          <SummaryRow label="Bank" value={bankHolder && bankAccount && ifsc ? 'Pending manual verification' : 'Incomplete'} />
          <PrimaryButton label="Submit for Review" busy={busy} onPress={() => void submit()} />
        </Section>
      ) : null}

      <View style={styles.footerActions}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => step === 0 ? router.back() : setStep((value) => Math.max(0, value - 1))} style={styles.backButton}><Text style={styles.backButtonText}>Back</Text></Pressable>
        {step < 4 ? <PrimaryButton compact label="Continue" busy={busy} onPress={() => void next()} /> : null}
      </View>
      {!locked ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void persist(step, true)} style={styles.saveExit}><Text style={styles.saveExitText}>Save & Exit</Text></Pressable> : null}
    </ScrollView>
  );
}

export function CreatorOnboardingScreen() {
  const { user } = useAuth();
  const { refresh } = useCommerceAccess();
  const [state, setState] = useState<LoadState>('loading');
  const [application, setApplication] = useState<CreatorApplication | null>(null);
  const [professional, setProfessional] = useState<ProfessionalVerificationRequest | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [macroCategory, setMacroCategory] = useState('Content & Digital Media');
  const [specializations, setSpecializations] = useState<string[]>(['Vlogger']);
  const [about, setAbout] = useState('');
  const [audienceTier, setAudienceTier] = useState<AudienceTier>('Nano');
  const [instagram, setInstagram] = useState('');
  const [youtube, setYoutube] = useState('');
  const [facebook, setFacebook] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [website, setWebsite] = useState('');
  const [identityName, setIdentityName] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [payoutUpi, setPayoutUpi] = useState('');
  const [bankHolder, setBankHolder] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [identityDocumentPath, setIdentityDocumentPath] = useState<string | null>(null);
  const [professionalTitle, setProfessionalTitle] = useState('');
  const [degree, setDegree] = useState('');
  const [institution, setInstitution] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [credentialPath, setCredentialPath] = useState<string | null>(null);
  const [professionalVideoPath, setProfessionalVideoPath] = useState<string | null>(null);

  const professionalRequired = creatorRequiresProfessionalVerification(specializations);
  const professionalRule = credentialRuleFor(specializations);
  const steps = useMemo(() => [...creatorOnboardingBaseSteps, ...(professionalRequired ? ['Professional credentials'] : []), 'Review'], [professionalRequired]);
  const reviewStep = steps.length - 1;

  const socialHandles = useMemo(() => ({ instagram, youtube, facebook, tiktok, website }), [facebook, instagram, tiktok, website, youtube]);

  const hydrate = useCallback((creator: CreatorApplication | null, professionalRequest: ProfessionalVerificationRequest | null, seller?: SellerApplication | null) => {
    setApplication(creator);
    setProfessional(professionalRequest);
    const payload = creator?.applicationPayload ?? {};
    if (creator) {
      setMacroCategory(payloadString(payload, 'macroCategory') || creator.category || 'Content & Digital Media');
      setSpecializations(payloadStrings(payload, 'specializations').length ? payloadStrings(payload, 'specializations') : ['Vlogger']);
      setAbout(payloadString(payload, 'about') || creator.about);
      setAudienceTier((payloadString(payload, 'audienceTier') || 'Nano') as AudienceTier);
      const handles = (payload.socialHandles && typeof payload.socialHandles === 'object' ? payload.socialHandles : creator.socialHandles) as Record<string, string>;
      setInstagram(handles.instagram ?? ''); setYoutube(handles.youtube ?? ''); setFacebook(handles.facebook ?? ''); setTiktok(handles.tiktok ?? ''); setWebsite(handles.website ?? '');
      setIdentityName(payloadString(payload, 'identityName') || creator.identityName);
      setPanNumber(payloadString(payload, 'panNumber'));
      setPayoutUpi(payloadString(payload, 'payoutUpi'));
      setBankHolder(payloadString(payload, 'bankAccountHolder'));
      setBankAccount(payloadString(payload, 'bankAccountNumber'));
      setIfsc(payloadString(payload, 'bankIfsc'));
      setIdentityDocumentPath(creator.identityDocumentPath);
      setStep(Math.min(5, payloadNumber(payload, 'currentStep')));
    } else if (seller) {
      setIdentityName(seller.legalName);
      setPanNumber(seller.panNumber ?? '');
      setBankHolder(payloadString(seller.applicationPayload, 'bankAccountHolder'));
      setBankAccount(payloadString(seller.applicationPayload, 'bankAccountNumber'));
      setIfsc(payloadString(seller.applicationPayload, 'bankIfsc'));
    }
    if (professionalRequest) {
      setProfessionalTitle(professionalRequest.professionalTitle);
      setDegree(professionalRequest.degree);
      setInstitution(professionalRequest.institution);
      setRegistrationNumber(professionalRequest.registrationNumber);
      setCredentialPath(professionalRequest.credentialDocumentPath);
      setProfessionalVideoPath(professionalRequest.verificationVideoPath);
    }
  }, []);

  const load = useCallback(async () => {
    setState('loading');
    try {
      if (!supabase || !user || user.app_metadata?.provider === 'demo') throw new Error('Use a real Social24 account for Creator onboarding.');
      const [creator, professionalRequest, seller] = await Promise.all([
        getMyCreatorApplication(supabase, user.id), getMyProfessionalRequest(supabase, user.id), getMySellerApplication(supabase, user.id),
      ]);
      hydrate(creator, professionalRequest, seller);
      setState('ready');
    } catch (cause) { setNotice(errorMessage(cause)); setState('error'); }
  }, [hydrate, user]);

  useEffect(() => { void load(); }, [load]);

  const creatorPayload = (currentStep: number, completedStep = currentStep) => ({
    onboardingVersion: 2, currentStep, completedStep, macroCategory, specializations, about,
    audienceTier, audienceMetricsStatus: 'self_declared', socialHandles, identityName, panNumber,
    payoutUpi, bankAccountHolder: bankHolder, bankAccountNumber: bankAccount, bankIfsc: ifsc,
    identityDocumentPath, professionalRequired, identityVerificationStatus: 'manual_review',
    bankVerificationStatus: 'manual_review', blueTickStatus: 'inactive',
  });

  const persist = async (targetStep: number, exit = false) => {
    if (!supabase || busy) return;
    setBusy(true); setNotice(null);
    try {
      await saveCommerceOnboardingDraft(supabase, 'creator', creatorPayload(targetStep, Math.max(step, targetStep)));
      setStep(targetStep); setNotice('Progress saved');
      if (exit) router.replace('/commerce');
    } catch (cause) { setNotice(errorMessage(cause)); }
    finally { setBusy(false); }
  };

  const validate = (current: number) => {
    if (current === 0 && (!macroCategory || specializations.length < 1 || specializations.length > 3)) return 'Choose a category and one to three specializations.';
    if (current === 1 && !Object.values(socialHandles).some((value) => value.trim())) return 'Add at least one social profile or website.';
    if (current === 2 && ([identityName, panNumber].some((value) => !value.trim()) || !identityDocumentPath || (!payoutUpi.trim() && [bankHolder, bankAccount, ifsc].some((value) => !value.trim())))) return 'Complete identity and add either UPI or bank payout details.';
    if (professionalRequired && current === 3 && ([professionalTitle, degree, institution, registrationNumber].some((value) => !value.trim()) || !credentialPath || !professionalVideoPath)) return 'Complete the professional credential information and verification video required for this specialization.';
    return null;
  };

  const next = async () => {
    const message = validate(step);
    if (message) { Alert.alert('Finish this step', message); return; }
    await persist(Math.min(reviewStep, step + 1));
  };

  const pickEvidence = async (kind: ApplicationKind, documentKind: string, setter: (value: string) => void, mediaTypes: ImagePicker.MediaType[] = ['images']) => {
    if (!supabase || !user) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Permission required', 'Allow media access to attach verification evidence.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes, quality: 0.82 });
    if (result.canceled) return;
    setBusy(true);
    try { setter(await uploadCommerceEvidence(supabase, user.id, kind, documentKind, result.assets[0])); }
    catch (cause) { Alert.alert('Upload failed', errorMessage(cause)); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!supabase || !user || busy) return;
    const validationSteps = professionalRequired ? [0, 1, 2, 3] : [0, 1, 2];
    for (const index of validationSteps) {
      const message = validate(index);
      if (message) { setStep(index); Alert.alert('Application incomplete', message); return; }
    }
    setBusy(true);
    try {
      const creator = await submitCreatorApplication(supabase, user.id, {
        creatorType: professionalRequired ? 'professional' : 'general',
        category: macroCategory, about, socialHandles, identityName, identityDocumentPath,
        applicationPayload: creatorPayload(reviewStep, steps.length),
      });
      if (professionalRequired && professionalRule) {
        await submitProfessionalVerification(supabase, user.id, {
          creatorApplicationId: creator.id,
          professionalCategory: professionalRule.specialization,
          professionalTitle,
          degree,
          institution,
          registrationNumber,
          credentialDocumentPath: credentialPath,
          verificationVideoPath: professionalVideoPath,
          socialHandles,
          applicationPayload: { onboardingVersion: 2, macroCategory, specializations, credentialRule: professionalRule.specialization },
        });
      }
      await refresh();
      hydrate(await getMyCreatorApplication(supabase, user.id), await getMyProfessionalRequest(supabase, user.id));
      Alert.alert('Submitted for review', professionalRequired ? 'Creator approval and Professional Credential approval will be reviewed separately.' : 'Your general Creator application does not require a degree or professional license.');
    } catch (cause) { Alert.alert('Submission failed', errorMessage(cause)); }
    finally { setBusy(false); }
  };

  if (state === 'loading') return <Loading label="Loading Creator setup…" />;
  if (state === 'error') return <StateError message={notice ?? 'Unable to load Creator setup.'} onRetry={load} />;
  const locked = application && ['submitted', 'under_review', 'approved', 'suspended'].includes(application.status);
  if (locked) return <ReviewState kind="Creator" application={application} professional={professional} onRefresh={async () => { await load(); await refresh(); }} onOpen={() => router.replace(application.status === 'approved' ? '/commerce/creator' : '/commerce')} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Become a Creator" subtitle="Only answer questions relevant to the Creator work you choose." />
      <Stepper labels={steps} step={step} />
      {notice ? <Banner tone={notice === 'Progress saved' ? 'success' : 'error'} title={notice} /> : null}

      {step === 0 ? (
        <Section title="What do you create?" copy="Choose one main category and up to three specializations. This controls whether professional credentials are relevant.">
          <ChipGroup values={creatorCategories.map((item) => item.name)} selected={[macroCategory]} onPress={(value) => { setMacroCategory(value); setSpecializations([]); }} />
          <Text style={styles.fieldLabel}>Specializations ({specializations.length}/3)</Text>
          <ChipGroup values={[...creatorSpecializationsFor(macroCategory)]} selected={specializations} onPress={(value) => setSpecializations((current) => selectCreatorSpecialization(current, value))} />
          <Field label="About you" value={about} onChangeText={setAbout} multiline placeholder="Tell sellers and your audience what you create." />
          {professionalRequired ? <Banner tone="info" title="Professional credentials required" message={`${professionalRule?.title ?? 'Professional verification'} will appear later in this setup.`} /> : <Banner tone="success" title="No degree required" message="This Creator path uses normal identity and Admin review only." />}
        </Section>
      ) : null}
      {step === 1 ? (
        <Section title="Social presence" copy="These links and audience tier are self-declared until provider integrations are available.">
          <Text style={styles.fieldLabel}>Audience tier</Text>
          <ChipGroup values={['Nano', 'Micro', 'Macro', 'Mega']} selected={[audienceTier]} onPress={(value) => setAudienceTier(value as AudienceTier)} />
          <Field label="Instagram" value={instagram} onChangeText={setInstagram} autoCapitalize="none" />
          <Field label="YouTube" value={youtube} onChangeText={setYoutube} autoCapitalize="none" />
          <Field label="Facebook" value={facebook} onChangeText={setFacebook} autoCapitalize="none" />
          <Field label="TikTok" value={tiktok} onChangeText={setTiktok} autoCapitalize="none" />
          <Field label="Website / other channel" value={website} onChangeText={setWebsite} autoCapitalize="none" />
          <Text style={styles.helper}>Audience information is marked self-declared, not verified.</Text>
        </Section>
      ) : null}
      {step === 2 ? (
        <Section title="Identity & payout" copy="Existing Seller identity details are reused when available. Missing information remains under manual review.">
          <Field label="Legal identity name" value={identityName} onChangeText={setIdentityName} />
          <Field label="PAN" value={panNumber} onChangeText={(value) => setPanNumber(value.toUpperCase())} autoCapitalize="characters" />
          <UploadRow title="Government identity evidence" value={identityDocumentPath} disabled={busy} onPress={() => void pickEvidence('creator', 'identity-document', setIdentityDocumentPath)} />
          <Field label="Payout UPI (optional when bank is supplied)" value={payoutUpi} onChangeText={setPayoutUpi} autoCapitalize="none" />
          <Field label="Bank account holder" value={bankHolder} onChangeText={setBankHolder} />
          <Field label="Bank account number" value={bankAccount} onChangeText={setBankAccount} keyboardType="number-pad" secureTextEntry />
          <Field label="IFSC" value={ifsc} onChangeText={(value) => setIfsc(value.toUpperCase())} autoCapitalize="characters" />
          <VerificationHint label="Identity and payout verification" />
        </Section>
      ) : null}
      {professionalRequired && step === 3 ? (
        <Section title={professionalRule?.title ?? 'Professional Verification'} copy="This verifies a regulated credential. It is separate from Creator approval and from the paid Blue Tick.">
          <Field label="Professional title" value={professionalTitle} onChangeText={setProfessionalTitle} />
          <Field label="Degree / qualification" value={degree} onChangeText={setDegree} />
          <Field label={professionalRule?.institutionLabel ?? 'Institution'} value={institution} onChangeText={setInstitution} />
          <Field label={professionalRule?.registrationLabel ?? 'Registration number'} value={registrationNumber} onChangeText={setRegistrationNumber} />
          <UploadRow title={professionalRule?.credentialLabel ?? 'Credential document'} value={credentialPath} disabled={busy} onPress={() => void pickEvidence('professional', 'credential-document', setCredentialPath)} />
          <UploadRow title="Short professional verification video" value={professionalVideoPath} disabled={busy} onPress={() => void pickEvidence('professional', 'verification-video', setProfessionalVideoPath, ['videos'])} />
          <Text style={styles.helper}>Uploading a credential does not grant a Blue Tick. Admin approval is required for Professional Credential status.</Text>
        </Section>
      ) : null}
      {step === reviewStep ? (
        <Section title="Review & submit" copy="Admin reviews Creator access. Any professional credential is reviewed as a distinct capability.">
          <SummaryRow label="Category" value={`${macroCategory} · ${specializations.join(', ')}`} />
          <SummaryRow label="Social presence" value={`${audienceTier} · self-declared`} />
          <SummaryRow label="Identity" value={identityDocumentPath ? 'Provided · manual review' : 'Incomplete'} />
          <SummaryRow label="Payout" value={payoutUpi || (bankHolder && ifsc) ? 'Provided · manual review' : 'Incomplete'} />
          <SummaryRow label="Professional credential" value={professionalRequired ? credentialPath && professionalVideoPath ? 'Evidence and video provided · separate Admin review' : 'Incomplete' : 'Not applicable'} />
          <SummaryRow label="Blue Tick" value="Inactive · no payment provider configured" />
          <PrimaryButton label="Submit for Review" busy={busy} onPress={() => void submit()} />
        </Section>
      ) : null}

      <View style={styles.footerActions}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => step === 0 ? router.back() : setStep((value) => Math.max(0, value - 1))} style={styles.backButton}><Text style={styles.backButtonText}>Back</Text></Pressable>
        {step < reviewStep ? <PrimaryButton compact label="Continue" busy={busy} onPress={() => void next()} /> : null}
      </View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void persist(step, true)} style={styles.saveExit}><Text style={styles.saveExitText}>Save & Exit</Text></Pressable>
    </ScrollView>
  );
}

export function CreatorCentreScreen() {
  const { access } = useCommerceAccess();
  const [state, setState] = useState<LoadState>('loading');
  const [tab, setTab] = useState<TabKey>('overview');
  const [products, setProducts] = useState<LifecycleProduct[]>([]);
  const [promotions, setPromotions] = useState<CreatorPromotion[]>([]);
  const [commissions, setCommissions] = useState<CreatorCommission[]>([]);
  const [verification, setVerification] = useState<Awaited<ReturnType<typeof getMyCommerceVerificationProfile>> | null>(null);
  const [clickCount, setClickCount] = useState(0);
  const [copiedPromotionId, setCopiedPromotionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setState('loading'); setError(null);
    try {
      const [nextProducts, nextPromotions, nextCommissions, nextVerification] = await Promise.all([
        listCreatorMarketplaceProducts(supabase), listMyPromotions(supabase), listCreatorCommissions(supabase), getMyCommerceVerificationProfile(supabase),
      ]);
      setProducts(nextProducts); setPromotions(nextPromotions); setCommissions(nextCommissions); setVerification(nextVerification);
      const promotionIds = nextPromotions.map((item) => item.id);
      if (promotionIds.length) {
        const result = await supabase.from('creator_promotion_clicks').select('id', { count: 'exact', head: true }).in('promotion_id', promotionIds);
        if (!result.error) setClickCount(result.count ?? 0);
      } else setClickCount(0);
      setState('ready');
    } catch (cause) { setError(errorMessage(cause)); setState('error'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const promote = async (productId: string) => {
    if (!supabase) return;
    setBusy(true);
    try {
      const promotion = await createPromotion(supabase, productId);
      await load();
      const refreshed = (await listMyPromotions(supabase)).find((item) => item.id === promotion.id);
      const path = refreshed?.storefrontSlug && refreshed.productSlug
        ? `/store/${refreshed.storefrontSlug}/product/${refreshed.productSlug}?ref=${promotion.trackingCode}`
        : `/commerce/buyer?ref=${promotion.trackingCode}`;
      await Clipboard.setStringAsync(`${Platform.OS === 'web' ? globalThis.location?.origin ?? '' : ''}${path}`);
      setCopiedPromotionId(promotion.id);
      Alert.alert('Affiliate Link copied ✓', 'Share this Product link. Eligible purchases keep the Creator attribution automatically.');
    } catch (cause) { Alert.alert('Promotion failed', errorMessage(cause)); }
    finally { setBusy(false); }
  };

  const pending = commissions.filter((item) => ['pending', 'return_hold', 'eligible', 'clearing'].includes(item.status)).reduce((sum, item) => sum + item.commissionMinor, 0);
  const confirmed = commissions.filter((item) => ['confirmed', 'paid'].includes(item.status)).reduce((sum, item) => sum + item.commissionMinor, 0);
  const reversed = commissions.filter((item) => item.status === 'reversed').reduce((sum, item) => sum + item.commissionMinor, 0);

  if (access && access.creatorStatus !== 'approved') return <StateError message="Creator approval is required before opening Creator Centre." onRetry={() => router.replace('/commerce/creator-onboarding')} action="Open onboarding" />;
  if (state === 'loading') return <Loading label="Loading Creator Centre…" />;
  if (state === 'error') return <StateError message={error ?? 'Unable to load Creator Centre.'} onRetry={load} />;

  const tabs: Array<[TabKey, string]> = [['overview', 'Home'], ['products', 'Discover Products'], ['links', 'Affiliate Links'], ['commissions', 'Earnings'], ['verification', 'Profile']];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.page}>
      <ScreenHeader title="Creator Centre" subtitle="Promote Products, manage tracked links and understand your real commission state." />
      <View style={styles.workspaceSwitch}><Text style={styles.workspaceSwitchText}>Creator Centre</Text>{access?.sellerStatus === 'approved' ? <SmallAction label="Switch to Seller Studio" onPress={() => router.push('/seller')} /> : null}</View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {tabs.map(([key, label]) => <Pressable key={key} accessibilityRole="button" onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabActive]}><Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text></Pressable>)}
      </ScrollView>

      {tab === 'overview' ? (
        <>
          <View style={styles.metricGrid}>
            <Metric label="Pending / clearing" value={formatMinor(pending)} icon={CircleDollarSign} />
            <Metric label="Confirmed" value={formatMinor(confirmed)} icon={BadgeCheck} />
            <Metric label="Tracked clicks" value={String(clickCount)} icon={BarChart3} />
            <Metric label="Active links" value={String(promotions.filter((item) => item.status === 'active').length)} icon={Link2} />
          </View>
          <Section title="Recent commission activity" copy="Statuses come from the existing attribution and return-window engine.">
            {commissions.slice(0, 5).map((item) => <SummaryRow key={item.id} label={item.productTitle} value={`${formatMinor(item.commissionMinor)} · ${item.status.replaceAll('_', ' ')}`} />)}
            {!commissions.length ? <Text style={styles.empty}>No attributed orders yet.</Text> : null}
            <Pressable accessibilityRole="button" onPress={() => router.push('/chats')} style={styles.primaryWide}><MessageCircle size={19} color="#fff" /><Text style={styles.primaryWideText}>Open Messages</Text></Pressable>
          </Section>
        </>
      ) : null}
      {tab === 'products' ? (
        <Section title="Products to promote" copy="Only live, valid and Creator-enabled Products appear here.">
          {products.map((product) => {
            const existing = promotions.find((item) => item.productId === product.id);
            const price = product.salePriceMinor ?? product.priceMinor;
            return <View key={product.id} style={styles.productCard}><PackageSearch size={24} color={green} /><View style={{ flex: 1 }}><Text style={styles.productTitle}>{product.title}</Text><Text style={styles.productMeta}>{product.storefrontName} · {formatMinor(price)} · {product.creatorCommissionBps / 100}% commission</Text><Text style={styles.productEarning}>Estimated commission per eligible sale: {formatMinor(Math.round(price * product.creatorCommissionBps / 10000))}</Text></View><SmallAction label={existing ? 'Reuse link' : 'Promote'} disabled={busy} onPress={() => void promote(product.id)} /></View>;
          })}
          {!products.length ? <Text style={styles.empty}>No promotable Products are live right now.</Text> : null}
        </Section>
      ) : null}
      {tab === 'links' ? (
        <Section title="My Affiliate Links" copy="Each Affiliate Link preserves the existing last-click attribution logic.">
          {promotions.map((promotion) => {
            const link = promotion.storefrontSlug && promotion.productSlug
              ? `/store/${promotion.storefrontSlug}/product/${promotion.productSlug}?ref=${promotion.trackingCode}`
              : `/commerce/buyer?ref=${promotion.trackingCode}`;
            const copy = async () => {
              const absolute = `${Platform.OS === 'web' ? globalThis.location?.origin ?? '' : ''}${link}`;
              await Clipboard.setStringAsync(absolute);
              setCopiedPromotionId(promotion.id);
            };
            return <View key={promotion.id} style={styles.linkCard}><View style={{ flex: 1 }}><Text style={styles.productTitle}>{promotion.productTitle}</Text><Text style={styles.productMeta}>{promotion.storefrontName} · {promotion.commissionBpsSnapshot / 100}% commission</Text><Text selectable style={styles.linkText}>{link}</Text></View><SmallAction label={copiedPromotionId === promotion.id ? 'Affiliate Link copied ✓' : 'Copy Affiliate Link'} onPress={() => void copy()} /></View>;
          })}
          {!promotions.length ? <Text style={styles.empty}>Promote a Product to create your first Affiliate Link.</Text> : null}
        </Section>
      ) : null}
      {tab === 'commissions' ? (
        <Section title="Orders & Commissions" copy="Pending, return hold, clearing, confirmed and reversed remain distinct. Paid is shown only when the backend says it is paid.">
          {commissions.map((item) => <View key={item.id} style={styles.commissionCard}><View style={{ flex: 1 }}><Text style={styles.productTitle}>{item.productTitle}</Text><Text style={styles.productMeta}>Order #{item.orderId.slice(0, 8)} · {item.status.replaceAll('_', ' ')}</Text></View><Text style={styles.commissionValue}>{formatMinor(item.commissionMinor)}</Text></View>)}
          {!commissions.length ? <Text style={styles.empty}>No commissions yet.</Text> : null}
        </Section>
      ) : null}
      {tab === 'analytics' ? <Section title="Analytics" copy="Only authoritative activity already stored by Commerce is shown."><SummaryRow label="Promotion clicks" value={String(clickCount)} /><SummaryRow label="Attributed orders" value={String(commissions.length)} /><SummaryRow label="Active promotions" value={String(promotions.filter((item) => item.status === 'active').length)} /><SummaryRow label="Reversed commission" value={formatMinor(reversed)} /></Section> : null}
      {tab === 'verification' ? <Section title="Profile & Verification" copy="Identity, professional credentials and Blue Tick are separate states."><SummaryRow label="Identity" value={verification?.identityStatus.replaceAll('_', ' ') ?? 'not started'} /><SummaryRow label="Professional credential" value={verification?.professionalStatus.replaceAll('_', ' ') ?? 'not applicable'} /><SummaryRow label="Payout bank" value={verification?.bankStatus.replaceAll('_', ' ') ?? 'manual review'} /><SummaryRow label="Blue Tick eligibility" value={verification?.blueTickEligibilityStatus.replaceAll('_', ' ') ?? 'not started'} /><SummaryRow label="Blue Tick payment" value={verification?.blueTickPaymentStatus.replaceAll('_', ' ') ?? 'not started'} /><SummaryRow label="Blue Tick" value="Inactive — no payment provider configured" /></Section> : null}
      {tab === 'messages' ? <Section title="Messages" copy="Creator conversations stay in the existing private Chat experience."><Pressable accessibilityRole="button" onPress={() => router.push('/chats')} style={styles.primaryWide}><MessageCircle size={19} color="#fff" /><Text style={styles.primaryWideText}>Open Messages</Text></Pressable></Section> : null}
    </ScrollView>
  );
}

function ScreenHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <View style={styles.screenHeader}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft size={22} color={green} /></Pressable><View style={{ flex: 1 }}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View></View>;
}

type CommerceIcon = ComponentType<{ size?: number; color?: string }>;

function RoleCard({ icon: Icon, title, description, badge, onPress }: { icon: CommerceIcon; title: string; description: string; badge?: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.roleCard, pressed && styles.pressed]}><View style={styles.roleIcon}><Icon size={26} color={green} /></View><View style={{ flex: 1 }}><Text style={styles.roleTitle}>{title}</Text><Text style={styles.roleCopy}>{description}</Text>{badge ? <Text style={styles.roleBadge}>{badge}</Text> : null}</View><ChevronRight size={22} color={green} /></Pressable>;
}

function SellerTypeStep({ value, onChange }: { value: SellerType; onChange: (value: SellerType) => void }) {
  return <Section title="Choose Seller type" copy="This controls the compliance information we ask for. Thresholds remain configurable rather than hardcoded."><ChoiceCard selected={value === 'gst'} title="GST Registered Seller" copy="For registered businesses selling across supported regions under applicable tax rules." onPress={() => onChange('gst')} /><ChoiceCard selected={value === 'non_gst'} title="Non-GST / Enrolment Seller" copy="For eligible small Sellers operating under configured home-state rules." onPress={() => onChange('non_gst')} /></Section>;
}

function ChoiceCard({ selected, title, copy, onPress }: { selected: boolean; title: string; copy: string; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.choiceCard, selected && styles.choiceCardActive]}><View style={[styles.radio, selected && styles.radioActive]}>{selected ? <Check size={15} color="#fff" /> : null}</View><View style={{ flex: 1 }}><Text style={styles.choiceTitle}>{title}</Text><Text style={styles.choiceCopy}>{copy}</Text></View></Pressable>;
}

function Stepper({ labels, step }: { labels: readonly string[]; step: number }) {
  return <View style={styles.stepper}><View style={styles.stepperTrack}><View style={[styles.stepperFill, { width: `${Math.max(8, ((step + 1) / labels.length) * 100)}%` }]} /></View><Text style={styles.stepperText}>Step {step + 1} of {labels.length} · {labels[step]}</Text></View>;
}

function Section({ title, copy, children }: { title: string; copy?: string; children: ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{copy ? <Text style={styles.sectionCopy}>{copy}</Text> : null}<View style={styles.sectionBody}>{children}</View></View>;
}

function Field(props: ComponentProps<typeof TextInput> & { label: string }) {
  const { label, multiline, style, ...inputProps } = props;
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...inputProps} multiline={multiline} placeholderTextColor="#98a59e" style={[styles.input, multiline && styles.inputMultiline, style]} /></View>;
}

function UploadRow({ title, value, disabled, onPress }: { title: string; value: string | null; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.upload, disabled && styles.disabled]}><View style={styles.uploadIcon}><FileUp size={20} color={green} /></View><View style={{ flex: 1 }}><Text style={styles.uploadTitle}>{title}</Text><Text numberOfLines={1} style={styles.uploadCopy}>{value ? 'Evidence attached privately' : 'Tap to attach'}</Text></View><Text style={styles.uploadAction}>{value ? 'Replace' : 'Add'}</Text></Pressable>;
}

function CheckRow({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={styles.checkRow}><View style={[styles.checkbox, checked && styles.checkboxActive]}>{checked ? <Check size={14} color="#fff" /> : null}</View><Text style={styles.checkLabel}>{label}</Text></Pressable>;
}

function VerificationHint({ label }: { label: string }) {
  return <View style={styles.verificationHint}><ShieldCheck size={18} color={green} /><View style={{ flex: 1 }}><Text style={styles.verificationTitle}>{label}</Text><Text style={styles.verificationCopy}>Pending Manual Verification · no external provider result is being simulated.</Text></View></View>;
}

function ChipGroup({ values, selected, onPress }: { values: readonly string[]; selected: readonly string[]; onPress: (value: string) => void }) {
  return <View style={styles.chips}>{values.map((value) => { const active = selected.includes(value); return <Pressable accessibilityRole="button" key={value} onPress={() => onPress(value)} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{value}</Text></Pressable>; })}</View>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}

function ReviewState({ kind, application, professional, onOpen, onRefresh }: { kind: 'Seller' | 'Creator'; application: SellerApplication | CreatorApplication; professional?: ProfessionalVerificationRequest | null; onOpen: () => void; onRefresh: () => Promise<void> }) {
  return <ScrollView style={styles.screen} contentContainerStyle={styles.centerPage}><BadgeCheck size={48} color={application.status === 'approved' ? greenBright : green} /><Text style={styles.reviewTitle}>{kind} application {statusText(application.status).toLowerCase()}</Text><Text style={styles.reviewCopy}>{application.status === 'approved' ? `${kind} access is active.` : 'Your saved application is locked while Admin controls the current review state.'}</Text>{professional ? <SummaryRow label="Professional credential" value={statusText(professional.status)} /> : null}{application.requestedInformation ? <Banner tone="info" title="Information requested" message={application.requestedInformation} /> : null}<PrimaryButton label={application.status === 'approved' ? `Open ${kind === 'Seller' ? 'Seller Studio' : 'Creator Centre'}` : 'Back to Earn & Sell'} onPress={onOpen} /><SmallAction label="Refresh approval status" onPress={() => void onRefresh()} /></ScrollView>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: CommerceIcon }) {
  return <View style={styles.metric}><Icon size={20} color={green} /><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function PrimaryButton({ label, onPress, busy, compact }: { label: string; onPress: () => void; busy?: boolean; compact?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={[styles.primary, compact && styles.primaryCompact, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{label}</Text>}</Pressable>;
}

function SmallAction({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.smallAction, disabled && styles.disabled]}><Text style={styles.smallActionText}>{label}</Text></Pressable>;
}

function Banner({ tone, title, message }: { tone: 'success' | 'error' | 'info'; title: string; message?: string }) {
  return <View style={[styles.banner, tone === 'success' && styles.bannerSuccess, tone === 'error' && styles.bannerError]}><Text style={styles.bannerTitle}>{title}</Text>{message ? <Text style={styles.bannerCopy}>{message}</Text> : null}</View>;
}

function Loading({ label }: { label: string }) { return <View style={styles.center}><ActivityIndicator color={green} /><Text style={styles.centerText}>{label}</Text></View>; }
function StateError({ message, onRetry, action = 'Retry' }: { message: string; onRetry: () => void | Promise<void>; action?: string }) { return <View style={styles.center}><Text style={styles.reviewTitle}>Something needs attention</Text><Text style={styles.centerText}>{message}</Text><PrimaryButton label={action} onPress={() => void onRetry()} /></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: canvas },
  page: { width: '100%', maxWidth: 1040, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 54, gap: 16 },
  centerPage: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: 28, minHeight: '100%', justifyContent: 'center', alignItems: 'center', gap: 16 },
  homeHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 4 },
  eyebrow: { color: green, fontSize: 12, fontWeight: '900', letterSpacing: 1.8 },
  homeTitle: { marginTop: 4, color: ink, fontSize: 36, fontWeight: '900', letterSpacing: -1.2 },
  homeSubtitle: { marginTop: 8, color: muted, fontSize: 15, lineHeight: 22, maxWidth: 620 },
  title: { color: ink, fontSize: 28, fontWeight: '900', letterSpacing: -0.7 },
  subtitle: { marginTop: 5, color: muted, fontSize: 14, lineHeight: 20 },
  screenHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconButton: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: line },
  roleCard: { minHeight: 148, borderRadius: 24, padding: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: line, flexDirection: 'row', alignItems: 'center', gap: 15, shadowColor: '#174d33', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.995 }] },
  roleIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: mint, alignItems: 'center', justifyContent: 'center' },
  roleTitle: { color: ink, fontSize: 20, fontWeight: '900' },
  roleCopy: { marginTop: 6, color: muted, fontSize: 14, lineHeight: 20 },
  roleBadge: { marginTop: 10, color: green, fontSize: 12, fontWeight: '900' },
  infoCard: { borderRadius: 19, padding: 16, backgroundColor: mint, borderWidth: 1, borderColor: '#ccebd9', flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  infoTitle: { color: ink, fontSize: 14, fontWeight: '900' },
  infoCopy: { marginTop: 4, color: '#456158', fontSize: 13, lineHeight: 19 },
  switcherCard: { borderRadius: 20, padding: 18, backgroundColor: '#0e3c29', gap: 9 },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  cardCopy: { color: '#cce9da', fontSize: 13, lineHeight: 19 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  adminLink: { minHeight: 52, borderRadius: 16, paddingHorizontal: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: line, flexDirection: 'row', alignItems: 'center', gap: 10 },
  adminLinkText: { flex: 1, color: green, fontSize: 14, fontWeight: '900' },
  stepper: { gap: 8 },
  stepperTrack: { height: 7, borderRadius: 999, overflow: 'hidden', backgroundColor: '#e2ebe6' },
  stepperFill: { height: '100%', borderRadius: 999, backgroundColor: greenBright },
  stepperText: { color: green, fontSize: 12, fontWeight: '900' },
  section: { borderRadius: 24, backgroundColor: '#fff', borderWidth: 1, borderColor: line, padding: 19 },
  sectionTitle: { color: ink, fontSize: 22, fontWeight: '900', letterSpacing: -0.45 },
  sectionCopy: { marginTop: 7, color: muted, fontSize: 13, lineHeight: 19 },
  sectionBody: { marginTop: 17, gap: 14 },
  choiceCard: { borderRadius: 18, borderWidth: 1, borderColor: line, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  choiceCardActive: { borderColor: green, backgroundColor: mint },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#a7b5ae', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: green, backgroundColor: green },
  choiceTitle: { color: ink, fontSize: 16, fontWeight: '900' },
  choiceCopy: { marginTop: 5, color: muted, fontSize: 13, lineHeight: 19 },
  field: { gap: 7 },
  fieldLabel: { color: '#46564f', fontSize: 13, fontWeight: '800' },
  input: { minHeight: 50, borderWidth: 1, borderColor: line, borderRadius: 15, backgroundColor: '#fbfdfc', color: ink, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },
  inputMultiline: { minHeight: 104, textAlignVertical: 'top' },
  upload: { minHeight: 68, borderRadius: 17, borderWidth: 1, borderColor: line, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#fbfdfc' },
  uploadIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: mint, alignItems: 'center', justifyContent: 'center' },
  uploadTitle: { color: ink, fontSize: 14, fontWeight: '900' },
  uploadCopy: { marginTop: 3, color: muted, fontSize: 12 },
  uploadAction: { color: green, fontSize: 12, fontWeight: '900' },
  outlineButton: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: '#bde1cc', backgroundColor: mint, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  outlineButtonText: { color: green, fontSize: 14, fontWeight: '900' },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: '#a8b6af', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: green, borderColor: green },
  checkLabel: { flex: 1, color: muted, fontSize: 13, lineHeight: 20 },
  verificationHint: { borderRadius: 15, padding: 13, backgroundColor: '#fff8e8', borderWidth: 1, borderColor: '#f0dca6', flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  verificationTitle: { color: '#5f4a14', fontSize: 13, fontWeight: '900' },
  verificationCopy: { marginTop: 3, color: '#766735', fontSize: 12, lineHeight: 18 },
  helper: { color: muted, fontSize: 12, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chip: { minHeight: 40, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: mint, borderColor: green },
  chipText: { color: muted, fontSize: 12, fontWeight: '800' },
  chipTextActive: { color: green },
  summaryRow: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#e8efeb', flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  summaryLabel: { width: 135, color: muted, fontSize: 12, fontWeight: '800' },
  summaryValue: { flex: 1, color: ink, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  primary: { minHeight: 52, borderRadius: 16, backgroundColor: green, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  primaryCompact: { minWidth: 132, flex: 1 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  footerActions: { flexDirection: 'row', gap: 12 },
  backButton: { minHeight: 52, minWidth: 112, borderRadius: 16, borderWidth: 1, borderColor: line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  backButtonText: { color: ink, fontSize: 14, fontWeight: '900' },
  saveExit: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  saveExitText: { color: green, fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  banner: { borderRadius: 15, padding: 13, backgroundColor: '#edf4ff', borderWidth: 1, borderColor: '#cadcf7' },
  bannerSuccess: { backgroundColor: mint, borderColor: '#c7ead5' },
  bannerError: { backgroundColor: '#fff0ee', borderColor: '#f2c7c1' },
  bannerTitle: { color: ink, fontSize: 13, fontWeight: '900' },
  bannerCopy: { marginTop: 4, color: muted, fontSize: 12, lineHeight: 18 },
  reviewTitle: { color: ink, fontSize: 26, fontWeight: '900', textAlign: 'center' },
  reviewCopy: { color: muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  center: { flex: 1, minHeight: 500, backgroundColor: canvas, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  centerText: { color: muted, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 480 },
  workspaceSwitch: { borderRadius: 16, backgroundColor: mint, borderWidth: 1, borderColor: '#c9e9d6', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  workspaceSwitchText: { flex: 1, color: ink, fontSize: 14, fontWeight: '900' },
  tabs: { gap: 8, paddingVertical: 2 },
  tab: { minHeight: 42, borderRadius: 999, paddingHorizontal: 15, borderWidth: 1, borderColor: line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: green, borderColor: green },
  tabText: { color: muted, fontSize: 12, fontWeight: '800' },
  tabTextActive: { color: '#fff' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { flexGrow: 1, flexBasis: 210, minHeight: 126, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: line, padding: 16, gap: 7 },
  metricValue: { color: ink, fontSize: 23, fontWeight: '900' },
  metricLabel: { color: muted, fontSize: 12, fontWeight: '800' },
  productCard: { borderRadius: 17, borderWidth: 1, borderColor: line, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  productTitle: { color: ink, fontSize: 14, fontWeight: '900' },
  productMeta: { marginTop: 4, color: muted, fontSize: 12, lineHeight: 18 },
  productEarning: { marginTop: 5, color: green, fontSize: 12, fontWeight: '800' },
  linkCard: { borderRadius: 17, borderWidth: 1, borderColor: line, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  linkText: { marginTop: 7, color: green, fontSize: 12, fontWeight: '800' },
  commissionCard: { borderRadius: 15, borderWidth: 1, borderColor: line, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  commissionValue: { color: green, fontSize: 16, fontWeight: '900' },
  empty: { color: muted, fontSize: 13, textAlign: 'center', paddingVertical: 18 },
  smallAction: { minHeight: 40, borderRadius: 12, backgroundColor: mint, borderWidth: 1, borderColor: '#c8e9d5', paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  smallActionText: { color: green, fontSize: 12, fontWeight: '900' },
  primaryWide: { minHeight: 52, borderRadius: 16, backgroundColor: green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryWideText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});
