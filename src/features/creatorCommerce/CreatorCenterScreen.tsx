import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  BadgeCheck,
  Banknote,
  BarChart3,
  CircleDollarSign,
  ClipboardCopy,
  ExternalLink,
  Handshake,
  Home,
  Link2,
  LogOut,
  Menu,
  MessageCircle,
  PackageSearch,
  RefreshCcw,
  Search,
  Send,
  Store,
  Trophy,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import SelectDropdown from '../../components/SelectDropdown';
import SafeLinkText from '../chat/SafeLinkText';
import { useCommerceAccess } from './CommerceAccessContext';
import {
  creatorPaymentCopy,
  filterCreatorRecordsByPeriod,
  summarizeCreatorEarnings,
  type CreatorPeriod,
} from './creator-center-model';
import {
  listCreatorCommerceConversations,
  listCreatorCommerceMessages,
  loadCreatorCenter,
  openApprovedSellerConversation,
  openCreatorSellerConversation,
  promoteCreatorProduct,
  searchApprovedSellers,
  sendCreatorCommerceMessage,
  type CreatorCenterData,
  type CreatorCommerceConversation,
  type CreatorCommerceMessage,
  type CreatorSellerDirectoryEntry,
} from './creator-center-repository';
import { formatMinor } from './lifecycleRepository';

type CreatorSection = 'home' | 'discover' | 'links' | 'earnings' | 'growth' | 'collab' | 'payments' | 'chats' | 'profile';
type CreatorIcon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const ink = '#102033';
const muted = '#64748b';
const line = '#dfe8e3';
const green = '#0aa766';
const greenDeep = '#087447';
const mint = '#edf8f2';
const canvas = '#f5f8f6';
const panel = '#ffffff';

const navigation: Array<{ key: CreatorSection; label: string; icon: CreatorIcon }> = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'discover', label: 'Discover Products', icon: PackageSearch },
  { key: 'links', label: 'Affiliate Links', icon: Link2 },
  { key: 'earnings', label: 'Earnings', icon: CircleDollarSign },
  { key: 'growth', label: 'Growth', icon: Trophy },
  { key: 'collab', label: 'Collab', icon: Handshake },
  { key: 'payments', label: 'Payments', icon: WalletCards },
  { key: 'chats', label: 'Chats', icon: MessageCircle },
  { key: 'profile', label: 'Profile', icon: UserRound },
];

const periods: Array<{ key: CreatorPeriod; label: string }> = [
  { key: 'last_7_days', label: 'Last 7 days' },
  { key: 'last_30_days', label: 'Last 30 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_year', label: 'This year' },
  { key: 'all_time', label: 'All time' },
];

const statusTone = (status: string) => {
  if (['paid', 'eligible', 'payable', 'delivered', 'approved'].includes(status)) return 'positive';
  if (['reversed', 'cancelled', 'rejected', 'return_approved'].includes(status)) return 'negative';
  return 'neutral';
};

const friendlyStatus = (status: string) => status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export function CreatorCentreScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const { width } = useWindowDimensions();
  const mobile = width < 820;
  const { access } = useCommerceAccess();
  const { user, signOut } = useAuth();
  const [section, setSection] = useState<CreatorSection>('home');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [data, setData] = useState<CreatorCenterData | null>(null);
  const [conversations, setConversations] = useState<CreatorCommerceConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<CreatorCommerceConversation | null>(null);
  const [messages, setMessages] = useState<CreatorCommerceMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [period, setPeriod] = useState<CreatorPeriod>('last_30_days');
  const [discoverTab, setDiscoverTab] = useState<'products' | 'orders'>('products');
  const [search, setSearch] = useState('');
  const [productSort, setProductSort] = useState<'recent' | 'price_low' | 'price_high' | 'commission'>('recent');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);
  const [autoPayDemo, setAutoPayDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sellerDirectory, setSellerDirectory] = useState<CreatorSellerDirectoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requestedSection = params.section;
    if (requestedSection && navigation.some((item) => item.key === requestedSection)) {
      setSection(requestedSection as CreatorSection);
    }
  }, [params.section]);

  const load = useCallback(async (background = false) => {
    if (!supabase) {
      setError('Supabase is not configured.');
      setLoading(false);
      return;
    }
    background ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [next, nextConversations] = await Promise.all([
        loadCreatorCenter(supabase),
        listCreatorCommerceConversations(supabase),
      ]);
      setData(next);
      setConversations(nextConversations);
      if (selectedConversation) {
        setSelectedConversation(nextConversations.find((item) => item.id === selectedConversation.id) ?? null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load Creator Center.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedConversation?.id]);

  useEffect(() => { void load(); }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!supabase) return;
    try {
      setMessages(await listCreatorCommerceMessages(supabase, conversationId));
    } catch (cause) {
      Alert.alert('Unable to load Creator Chat', cause instanceof Error ? cause.message : 'Please try again.');
    }
  }, []);

  useEffect(() => {
    if (!selectedConversation || !supabase) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedConversation.id);
    const channel = supabase
      .channel(`creator-commerce-${selectedConversation.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConversation.id}` }, () => {
        void loadMessages(selectedConversation.id);
      })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [loadMessages, selectedConversation?.id]);

  const selectSection = (next: CreatorSection) => {
    setSection(next);
    setMobileNavOpen(false);
  };

  const filteredCommissions = useMemo(() => filterCreatorRecordsByPeriod(data?.commissions ?? [], period), [data?.commissions, period]);
  const earnings = useMemo(() => summarizeCreatorEarnings(filteredCommissions), [filteredCommissions]);
  const allTimeEarnings = useMemo(() => summarizeCreatorEarnings(data?.commissions ?? []), [data?.commissions]);
  const payment = useMemo(() => creatorPaymentCopy(allTimeEarnings), [allTimeEarnings]);
  const activePromotions = data?.promotions.filter((item) => item.status === 'active') ?? [];

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const products = (data?.products ?? []).filter((product) =>
      !query || [product.title, product.storefrontName, product.category].some((value) => value.toLowerCase().includes(query)),
    );
    return products.sort((left, right) => {
      const leftPrice = left.salePriceMinor ?? left.priceMinor;
      const rightPrice = right.salePriceMinor ?? right.priceMinor;
      if (productSort === 'price_low') return leftPrice - rightPrice;
      if (productSort === 'price_high') return rightPrice - leftPrice;
      if (productSort === 'commission') return right.creatorCommissionBps - left.creatorCommissionBps;
      return right.updatedAt.localeCompare(left.updatedAt);
    });
  }, [data?.products, productSort, search]);

  const promote = async (productId: string) => {
    if (!supabase) return;
    setBusyId(productId);
    try {
      await promoteCreatorProduct(supabase, productId);
      await load(true);
    } catch (cause) {
      Alert.alert('Promotion failed', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const openChat = async (product: NonNullable<CreatorCenterData>['products'][number]) => {
    if (!supabase) return;
    setBusyId(`chat-${product.id}`);
    try {
      const conversationId = await openCreatorSellerConversation(supabase, {
        sellerId: product.sellerId,
        productId: product.id,
        productTitle: product.title,
      });
      const next = await listCreatorCommerceConversations(supabase);
      setConversations(next);
      const conversation = next.find((item) => item.id === conversationId) ?? null;
      setSelectedConversation(conversation);
      if (conversation) await loadMessages(conversation.id);
      selectSection('chats');
    } catch (cause) {
      Alert.alert('Unable to open Seller chat', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const sendMessage = async () => {
    if (!supabase || !selectedConversation || !messageDraft.trim()) return;
    setBusyId('send-message');
    try {
      await sendCreatorCommerceMessage(supabase, selectedConversation.id, messageDraft);
      setMessageDraft('');
      await Promise.all([loadMessages(selectedConversation.id), load(true)]);
    } catch (cause) {
      Alert.alert('Message not sent', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const findApprovedSellers = async (query: string) => {
    if (!supabase) return;
    setBusyId('seller-directory-search');
    try {
      setSellerDirectory(await searchApprovedSellers(supabase, query));
    } catch (cause) {
      Alert.alert('Unable to search Sellers', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const openSellerDirectoryConversation = async (sellerId: string) => {
    if (!supabase) return;
    setBusyId(`seller-directory-${sellerId}`);
    try {
      const conversationId = await openApprovedSellerConversation(supabase, sellerId);
      const next = await listCreatorCommerceConversations(supabase);
      setConversations(next);
      const conversation = next.find((item) => item.id === conversationId) ?? null;
      setSelectedConversation(conversation);
      setSellerDirectory([]);
      if (conversation) await loadMessages(conversation.id);
    } catch (cause) {
      Alert.alert('Unable to open Seller chat', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const linkFor = (promotion: NonNullable<CreatorCenterData>['promotions'][number]) => {
    const relative = `/store/${promotion.storefrontSlug}/product/${promotion.productSlug}?ref=${promotion.trackingCode}`;
    const origin = typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : '';
    return `${origin}${relative}`;
  };

  const copyLink = async (promotion: NonNullable<CreatorCenterData>['promotions'][number]) => {
    await Clipboard.setStringAsync(linkFor(promotion));
    setCopiedId(promotion.id);
  };

  if (access && access.creatorStatus !== 'approved') {
    return <CenteredState title="Creator approval required" copy="Complete Creator onboarding and wait for approval before opening Creator Center." action="Open onboarding" onPress={() => router.replace('/commerce/creator-onboarding')} />;
  }
  if (loading) return <CenteredState loading title="Loading Creator Center" copy="Reading your real Products, attributed Orders, and commission state…" />;
  if (error || !data) return <CenteredState title="Creator Center needs attention" copy={error ?? 'Unable to load your Creator workspace.'} action="Retry" onPress={() => void load()} />;

  const currentLabel = navigation.find((item) => item.key === section)?.label ?? 'Creator Center';
  return (
    <View style={styles.page}>
      {!mobile ? (
        <View style={styles.sidebar}>
          <BrandBlock profileName={data.profile.displayName} />
          <View style={styles.navList}>
            {navigation.map(({ key, label, icon: Icon }) => (
              <Pressable key={key} accessibilityRole="button" onPress={() => selectSection(key)} style={[styles.navItem, section === key && styles.navItemActive]}>
                <Icon size={19} color={section === key ? '#ffffff' : '#718079'} strokeWidth={2.2} />
                <Text style={[styles.navText, section === key && styles.navTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.sidebarFooter}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/social-profile')} style={styles.utilityButton}><UserRound size={17} color={ink} /><Text style={styles.utilityText}>Social Profile</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={async () => { await signOut(); router.replace('/login'); }} style={styles.utilityButton}><LogOut size={17} color="#b42318" /><Text style={[styles.utilityText, { color: '#b42318' }]}>Log out</Text></Pressable>
          </View>
        </View>
      ) : null}

      <ScrollView style={styles.workspace} contentContainerStyle={[styles.workspaceContent, mobile && styles.workspaceContentMobile]}>
        <View style={styles.topbar}>
          {mobile ? <Pressable accessibilityRole="button" accessibilityLabel="Open Creator Center navigation" onPress={() => setMobileNavOpen((value) => !value)} style={styles.iconButton}><Menu size={21} color={ink} /></Pressable> : null}
          <View style={{ flex: 1 }}><Text style={styles.pageTitle}>{currentLabel}</Text><Text style={styles.pageSubtitle}>Creator commerce workspace · Real Social24 data</Text></View>
          {access?.sellerStatus === 'approved' ? <Pressable onPress={() => router.push('/seller')} style={styles.secondaryButton}><Store size={16} color={greenDeep} /><Text style={styles.secondaryButtonText}>Seller Studio</Text></Pressable> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh Creator Center" disabled={refreshing} onPress={() => void load(true)} style={styles.iconButton}>{refreshing ? <ActivityIndicator color={green} /> : <RefreshCcw size={19} color={greenDeep} />}</Pressable>
        </View>

        {mobile && mobileNavOpen ? (
          <View style={styles.mobileNav}>
            {navigation.map(({ key, label, icon: Icon }) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} onPress={() => selectSection(key)} style={[styles.mobileNavItem, section === key && styles.mobileNavItemActive]}><Icon size={17} color={section === key ? '#ffffff' : greenDeep} /><Text style={[styles.mobileNavText, section === key && styles.mobileNavTextActive]}>{label}</Text></Pressable>)}
          </View>
        ) : null}

        {section === 'home' ? <HomeSection mobile={mobile} data={data} period={period} setPeriod={setPeriod} commissions={filteredCommissions} earnings={earnings} onNavigate={selectSection} /> : null}
        {section === 'discover' ? (
          <DiscoverSection
            data={data}
            tab={discoverTab}
            setTab={setDiscoverTab}
            search={search}
            setSearch={setSearch}
            sort={productSort}
            setSort={setProductSort}
            products={visibleProducts}
            period={period}
            setPeriod={setPeriod}
            commissions={filteredCommissions}
            busyId={busyId}
            onPromote={promote}
            onChat={openChat}
          />
        ) : null}
        {section === 'links' ? <LinksSection promotions={data.promotions} copiedId={copiedId} linkFor={linkFor} onCopy={copyLink} /> : null}
        {section === 'earnings' ? <EarningsSection period={period} setPeriod={setPeriod} earnings={earnings} commissions={filteredCommissions} /> : null}
        {section === 'growth' ? <GrowthSection mobile={mobile} data={data} userId={user?.id ?? ''} /> : null}
        {section === 'collab' ? <CollabSection promotions={activePromotions} onChat={() => selectSection('chats')} /> : null}
        {section === 'payments' ? <PaymentsSection payment={payment} earnings={allTimeEarnings} onCollect={() => setCollectOpen(true)} /> : null}
        {section === 'chats' ? <ChatsSection mobile={mobile} userId={user?.id ?? ''} conversations={conversations} selected={selectedConversation} setSelected={(conversation) => { setSelectedConversation(conversation); void loadMessages(conversation.id); }} messages={messages} draft={messageDraft} setDraft={setMessageDraft} busy={busyId === 'send-message'} directory={sellerDirectory} directoryBusy={busyId === 'seller-directory-search' || busyId?.startsWith('seller-directory-') === true} onSearchSellers={findApprovedSellers} onOpenSeller={openSellerDirectoryConversation} onSend={sendMessage} /> : null}
        {section === 'profile' ? <ProfileSection data={data} access={access} onBadge={() => setBadgeOpen(true)} onSocial={() => router.push('/social-profile')} /> : null}
      </ScrollView>

      <BadgeModal visible={badgeOpen} autoPay={autoPayDemo} setAutoPay={setAutoPayDemo} onClose={() => setBadgeOpen(false)} />
      <CollectPaymentModal visible={collectOpen} availableMinor={payment.availableMinor} onClose={() => setCollectOpen(false)} />
    </View>
  );
}

function BrandBlock({ profileName }: { profileName: string }) {
  return <View style={styles.brand}><View style={styles.brandMark}><BadgeCheck size={24} color="#ffffff" /></View><View><Text style={styles.brandTitle}>Creator Center</Text><Text style={styles.brandMeta}>{profileName}</Text></View></View>;
}

function PeriodBar({ value, onChange }: { value: CreatorPeriod; onChange: (value: CreatorPeriod) => void }) {
  return <View style={styles.periodBar}><SelectDropdown label="Period" value={value} onChange={onChange} options={periods.map((item) => [item.key, item.label] as const)} style={styles.periodSelect} /></View>;
}

function HomeSection({ mobile, data, period, setPeriod, commissions, earnings, onNavigate }: { mobile: boolean; data: CreatorCenterData; period: CreatorPeriod; setPeriod: (value: CreatorPeriod) => void; commissions: CreatorCenterData['commissions']; earnings: ReturnType<typeof summarizeCreatorEarnings>; onNavigate: (value: CreatorSection) => void }) {
  const productTotals = new Map<string, { title: string; orders: Set<string>; sales: number }>();
  commissions.forEach((record) => {
    const key = record.productId ?? record.productTitle;
    const current = productTotals.get(key) ?? { title: record.productTitle, orders: new Set<string>(), sales: 0 };
    current.orders.add(record.orderId);
    if (!['reversed', 'cancelled'].includes(record.status)) current.sales += record.eligibleItemMinor;
    productTotals.set(key, current);
  });
  const topProducts = [...productTotals.values()].sort((left, right) => right.sales - left.sales).slice(0, 4);
  return <View style={styles.sectionStack}>
    <View style={[styles.hero, mobile && styles.heroMobile]}><View style={{ flex: mobile ? undefined : 1 }}><Text style={styles.eyebrow}>CREATOR COMMERCE</Text><Text style={styles.heroTitle}>Your promotions, Orders and earnings—one truthful view.</Text><Text style={styles.heroCopy}>Every number below comes from your existing Social24 attribution and commission records.</Text></View><Pressable onPress={() => onNavigate('discover')} style={[styles.primaryButton, mobile && styles.primaryButtonMobile]}><PackageSearch size={17} color="#ffffff" /><Text style={styles.primaryButtonText}>Discover Products</Text></Pressable></View>
    <PeriodBar value={period} onChange={setPeriod} />
    <View style={styles.metricGrid}>
      <MetricCard icon={Link2} label="Promoted Products" value={String(new Set(data.promotions.map((item) => item.productId)).size)} note="Current and previous links" />
      <MetricCard icon={PackageSearch} label="Attributed Orders" value={String(earnings.attributedOrders)} note="Orders in selected period" />
      <MetricCard icon={BarChart3} label="Attributed Sales" value={formatMinor(earnings.attributedSalesMinor)} note="Qualifying Order item value" />
      <MetricCard icon={CircleDollarSign} label="Earned Commission" value={formatMinor(earnings.earnedMinor)} note={`${formatMinor(earnings.pendingMinor)} pending`} />
    </View>
    <View style={styles.twoColumn}>
      <Panel title="Recent attributed Orders" copy="Buyer information stays minimised.">
        {commissions.slice(0, 6).map((record) => <View key={record.id} style={styles.dataRow}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{record.productTitle}</Text><Text style={styles.rowMeta}>{record.storefrontName} · Order #{record.orderId.slice(0, 8).toUpperCase()}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={styles.rowValue}>{formatMinor(record.eligibleItemMinor)}</Text><StatusPill status={record.status} /></View></View>)}
        {!commissions.length ? <EmptyState title="No attributed Orders yet" copy="Orders placed through your Affiliate Links will appear here." /> : null}
      </Panel>
      <Panel title="Top promoted Products" copy="Ranked by qualifying attributed sales in this period.">
        {topProducts.map((product, index) => <View key={product.title} style={styles.dataRow}><View style={styles.rankCircle}><Text style={styles.rankCircleText}>{index + 1}</Text></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{product.title}</Text><Text style={styles.rowMeta}>{product.orders.size} attributed Order{product.orders.size === 1 ? '' : 's'}</Text></View><Text style={styles.rowValue}>{formatMinor(product.sales)}</Text></View>)}
        {!topProducts.length ? <EmptyState title="No promoted Product activity" copy="Promote an eligible Product to begin." /> : null}
      </Panel>
    </View>
  </View>;
}

function DiscoverSection({ data, tab, setTab, search, setSearch, sort, setSort, products, period, setPeriod, commissions, busyId, onPromote, onChat }: { data: CreatorCenterData; tab: 'products' | 'orders'; setTab: (value: 'products' | 'orders') => void; search: string; setSearch: (value: string) => void; sort: 'recent' | 'price_low' | 'price_high' | 'commission'; setSort: (value: 'recent' | 'price_low' | 'price_high' | 'commission') => void; products: CreatorCenterData['products']; period: CreatorPeriod; setPeriod: (value: CreatorPeriod) => void; commissions: CreatorCenterData['commissions']; busyId: string | null; onPromote: (id: string) => Promise<void>; onChat: (product: CreatorCenterData['products'][number]) => Promise<void> }) {
  return <View style={styles.sectionStack}>
    <Segmented value={tab} options={[['products', 'Products'], ['orders', 'Recent Orders']]} onChange={setTab} />
    {tab === 'products' ? <>
      <View style={styles.filterRow}><View style={styles.searchBox}><Search size={18} color={muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Search Product, Seller or category" placeholderTextColor="#91a099" style={styles.searchInput} /></View><SelectMenu value={sort} onChange={setSort} options={[['recent', 'Most recent'], ['price_low', 'Price low → high'], ['price_high', 'Price high → low'], ['commission', 'Highest commission']]} /></View>
      <View style={styles.productGrid}>{products.map((product) => {
        const existing = data.promotions.find((item) => item.productId === product.id && item.status === 'active');
        const price = product.salePriceMinor ?? product.priceMinor;
        return <View key={product.id} style={styles.productCard}>{product.coverUrl ? <Image source={{ uri: product.coverUrl }} style={styles.productImage} /> : <View style={styles.productPlaceholder}><PackageSearch size={34} color={greenDeep} /></View>}<View style={styles.productBody}><Text style={styles.productStore}>{product.storefrontName}</Text><Text style={styles.productTitle}>{product.title}</Text><Text style={styles.productMeta}>{product.category} · {product.inventory - product.inventoryReserved} available</Text><View style={styles.productMoneyRow}><Text style={styles.productPrice}>{formatMinor(price)}</Text><Text style={styles.commissionBadge}>{product.creatorCommissionBps / 100}% commission</Text></View><Text style={styles.productEarning}>Up to {formatMinor(Math.round(price * product.creatorCommissionBps / 10_000))} per eligible sale</Text><View style={styles.cardActions}><Pressable accessibilityRole="button" accessibilityLabel={`${existing ? 'Refresh Affiliate link' : 'Promote'} ${product.title}`} disabled={busyId === product.id} onPress={() => void onPromote(product.id)} style={styles.primarySmall}>{busyId === product.id ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primarySmallText}>{existing ? 'Refresh link' : 'Promote'}</Text>}</Pressable><Pressable accessibilityRole="button" accessibilityLabel={`View ${product.title}`} onPress={() => router.push(`/store/${product.storefrontSlug}/product/${product.slug}` as never)} style={styles.iconAction}><ExternalLink size={17} color={greenDeep} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Chat with ${product.storefrontName} about ${product.title}`} disabled={busyId === `chat-${product.id}`} onPress={() => void onChat(product)} style={styles.secondarySmall}><MessageCircle size={15} color={greenDeep} /><Text style={styles.secondarySmallText}>Seller</Text></Pressable></View></View></View>;
      })}</View>
      {!products.length ? <EmptyState title="No Products available for promotion" copy="Only published, approved, in-stock and Affiliate-enabled Seller Products appear here." /> : null}
    </> : <><PeriodBar value={period} onChange={setPeriod} /><Panel title="Recent attributed Orders" copy="The same period-filtered attribution records power Creator Home and Discover.">{commissions.slice(0, 30).map((record) => <View key={record.id} style={styles.dataRow}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{record.productTitle}</Text><Text style={styles.rowMeta}>{record.storefrontName} · {new Date(record.createdAt).toLocaleDateString('en-IN')} · Order #{record.orderId.slice(0, 8).toUpperCase()}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={styles.rowValue}>{formatMinor(record.eligibleItemMinor)}</Text><StatusPill status={record.status} /></View></View>)}{!commissions.length ? <EmptyState title="No recent attributed Orders" copy="Orders placed through your links will appear here." /> : null}</Panel></>}
  </View>;
}

function LinksSection({ promotions, copiedId, linkFor, onCopy }: { promotions: CreatorCenterData['promotions']; copiedId: string | null; linkFor: (promotion: CreatorCenterData['promotions'][number]) => string; onCopy: (promotion: CreatorCenterData['promotions'][number]) => Promise<void> }) {
  return <Panel title="Affiliate Links" copy="Existing Product promotion links are reused; attribution remains Product → Cart → Checkout → Order.">{promotions.map((promotion) => <View key={promotion.id} style={styles.linkCard}><View style={{ flex: 1, gap: 5 }}><View style={styles.linkTitleRow}><Text style={styles.rowTitle}>{promotion.productTitle}</Text><StatusPill status={promotion.status} /></View><Text style={styles.rowMeta}>{promotion.storefrontName} · {promotion.commissionBps / 100}% commission · {promotion.clicks} tracked clicks</Text><Text selectable numberOfLines={2} style={styles.linkValue}>{linkFor(promotion)}</Text><Text style={styles.rowMeta}>Created {new Date(promotion.createdAt).toLocaleDateString('en-IN')}</Text></View><View style={styles.linkActions}><Pressable accessibilityRole="button" accessibilityLabel={`Copy Affiliate link for ${promotion.productTitle}`} onPress={() => void onCopy(promotion)} style={styles.secondaryButton}><ClipboardCopy size={16} color={greenDeep} /><Text style={styles.secondaryButtonText}>{copiedId === promotion.id ? 'Copied' : 'Copy Link'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`View ${promotion.productTitle}`} onPress={() => router.push(`/store/${promotion.storefrontSlug}/product/${promotion.productSlug}` as never)} style={styles.secondaryButton}><ExternalLink size={16} color={greenDeep} /><Text style={styles.secondaryButtonText}>View Product</Text></Pressable></View></View>)}{!promotions.length ? <EmptyState title="You haven't created any Affiliate Links yet" copy="Discover an eligible Product and choose Promote." /> : null}</Panel>;
}

function EarningsSection({ period, setPeriod, earnings, commissions }: { period: CreatorPeriod; setPeriod: (value: CreatorPeriod) => void; earnings: ReturnType<typeof summarizeCreatorEarnings>; commissions: CreatorCenterData['commissions'] }) {
  return <View style={styles.sectionStack}><PeriodBar value={period} onChange={setPeriod} /><View style={styles.metricGrid}><MetricCard icon={BarChart3} label="Attributed Sales" value={formatMinor(earnings.attributedSalesMinor)} note={`${earnings.attributedOrders} Orders`} /><MetricCard icon={CircleDollarSign} label="Estimated" value={formatMinor(earnings.estimatedMinor)} note="New attribution" /><MetricCard icon={Banknote} label="Pending" value={formatMinor(earnings.pendingMinor)} note="Includes hold/review" /><MetricCard icon={WalletCards} label="Available" value={formatMinor(earnings.availableMinor)} note="Provider integration required" /><MetricCard icon={BadgeCheck} label="Paid" value={formatMinor(earnings.paidMinor)} note="Backend-confirmed only" /><MetricCard icon={RefreshCcw} label="Reversed" value={formatMinor(earnings.reversedMinor)} note="Returns/cancellations" /></View><Panel title="Earnings breakdown" copy="Commission rate and status use the saved Order snapshot.">{commissions.map((record) => <View key={record.id} style={styles.earningsRow}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{record.productTitle}</Text><Text style={styles.rowMeta}>{record.storefrontName} · Order #{record.orderId.slice(0, 8).toUpperCase()} · {record.commissionBps / 100}%</Text></View><Text style={styles.rowMeta}>{new Date(record.createdAt).toLocaleDateString('en-IN')}</Text><StatusPill status={record.status} /><Text style={styles.rowValue}>{formatMinor(record.commissionMinor)}</Text></View>)}{!commissions.length ? <EmptyState title="No attributed earnings yet" copy="Qualifying Orders will appear with their real commission state." /> : null}</Panel></View>;
}

function GrowthSection({ mobile, data, userId }: { mobile: boolean; data: CreatorCenterData; userId: string }) {
  const mine = data.growth.find((row) => row.creatorId === userId);
  return <View style={styles.sectionStack}>{!data.growthAvailable ? <Notice title="Private leaderboard preview" copy="Production has not received the staged privacy-safe aggregate yet. Your row below uses only your own delivered, non-reversed data; no other Creator's earnings are exposed." /> : null}<View style={[styles.hero, mobile && styles.heroMobile]}><View style={{ flex: mobile ? undefined : 1 }}><Text style={styles.eyebrow}>ATTRIBUTED SALES LEADERBOARD</Text><Text style={styles.heroTitle}>Growth driven by successful commerce.</Text><Text style={styles.heroCopy}>Ranking uses delivered, non-reversed attributed sales. Pressing Promote or generating clicks does not create leaderboard value.</Text></View>{mine ? <View style={[styles.myRank, mobile && styles.myRankMobile]}><Text style={styles.myRankLabel}>My rank</Text><Text style={styles.myRankValue}>#{mine.rank}</Text></View> : null}</View><Panel title="Creator leaderboard" copy="Public display shows sales generated—not private commission earnings.">{data.growth.map((row) => <View key={row.creatorId} style={[styles.dataRow, row.creatorId === userId && styles.highlightRow]}><View style={styles.rankCircle}><Text style={styles.rankCircleText}>{row.rank}</Text></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{row.displayName}</Text><Text style={styles.rowMeta}>@{row.username} · {row.successfulOrders} successful Orders</Text></View><Text style={styles.rowValue}>{formatMinor(row.attributedSalesMinor)}</Text></View>)}{!data.growth.length ? <EmptyState title="Leaderboard will appear as Creator activity grows" copy="Only delivered, non-reversed attributed Orders qualify." /> : null}</Panel></View>;
}

function CollabSection({ promotions, onChat }: { promotions: CreatorCenterData['promotions']; onChat: () => void }) {
  const relationships = [...new Map(promotions.map((promotion) => [promotion.storefrontId, promotion])).values()];
  return <View style={styles.sectionStack}><Notice title="Collab MVP" copy="Active relationships are inferred only from real Affiliate promotions. Campaign contracts, proposals and negotiated briefs are not fabricated." /><View style={styles.threeColumn}><Panel title="Active collaborations"><Text style={styles.largeNumber}>{relationships.length}</Text><Text style={styles.rowMeta}>Seller relationships with active Product promotions</Text>{relationships.map((item) => <View key={item.storefrontId} style={styles.dataRow}><Store size={18} color={greenDeep} /><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.storefrontName}</Text><Text style={styles.rowMeta}>Active Affiliate relationship</Text></View></View>)}{!relationships.length ? <EmptyState title="No active collaborations" copy="Promoted Seller Products will appear here." /> : null}</Panel><Panel title="Invitations"><EmptyState title="No invitations yet" copy="Structured Seller invitations are not available in this MVP." /></Panel><Panel title="Completed"><EmptyState title="No completed collaborations" copy="Completion records will appear when a campaign workflow exists." /></Panel></View><Pressable onPress={onChat} style={styles.primaryButton}><MessageCircle size={17} color="#ffffff" /><Text style={styles.primaryButtonText}>Open Creator Chats</Text></Pressable></View>;
}

function PaymentsSection({ payment, earnings, onCollect }: { payment: ReturnType<typeof creatorPaymentCopy>; earnings: ReturnType<typeof summarizeCreatorEarnings>; onCollect: () => void }) {
  return <View style={styles.sectionStack}><Notice title="Provider-neutral Payments" copy="Social24 does not currently have a connected payout provider. No bank transfer, UPI payment, settlement date or automatic debit is claimed." /><View style={styles.metricGrid}><MetricCard icon={WalletCards} label="Available" value={formatMinor(payment.availableMinor)} note="Eligible/payable commission" /><MetricCard icon={Banknote} label="Pending" value={formatMinor(payment.pendingMinor)} note="Order or return state unresolved" /><MetricCard icon={BadgeCheck} label="Paid" value={formatMinor(earnings.paidMinor)} note="Authoritative Paid rows only" /></View><Panel title="Collect Payment" copy="Eligible balance stays unchanged until a real provider confirms payout."><View style={styles.collectCard}><View><Text style={styles.collectLabel}>Available eligible balance</Text><Text style={styles.collectValue}>{formatMinor(payment.availableMinor)}</Text><Text style={styles.rowMeta}>No payout schedule is configured, so no invented payment date is shown.</Text></View><Pressable onPress={onCollect} style={styles.primaryButton}><WalletCards size={17} color="#ffffff" /><Text style={styles.primaryButtonText}>Collect Payment</Text></Pressable></View></Panel></View>;
}

function ChatsSection({ mobile, userId, conversations, selected, setSelected, messages, draft, setDraft, busy, directory, directoryBusy, onSearchSellers, onOpenSeller, onSend }: { mobile: boolean; userId: string; conversations: CreatorCommerceConversation[]; selected: CreatorCommerceConversation | null; setSelected: (conversation: CreatorCommerceConversation) => void; messages: CreatorCommerceMessage[]; draft: string; setDraft: (value: string) => void; busy: boolean; directory: CreatorSellerDirectoryEntry[]; directoryBusy: boolean; onSearchSellers: (query: string) => Promise<void>; onOpenSeller: (sellerId: string) => Promise<void>; onSend: () => Promise<void> }) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const visible = conversations.filter((conversation) => !normalized || [conversation.storefrontName, conversation.counterpartyUsername, conversation.lastMessage].some((value) => value.toLowerCase().includes(normalized)));
  return <View style={[styles.chatDesk, mobile && styles.chatDeskMobile]}><View style={[styles.chatList, mobile && styles.chatListMobile]}><Text style={styles.panelTitle}>Seller conversations</Text><Text style={styles.panelCopy}>Approved Sellers only · Creator commerce</Text><View style={styles.chatSearch}><Search size={16} color={muted} /><TextInput accessibilityLabel="Search Sellers" value={query} onChangeText={setQuery} placeholder="Search approved Sellers" placeholderTextColor="#91a099" style={styles.chatSearchInput} /></View><Pressable accessibilityRole="button" accessibilityLabel="Search approved Sellers" disabled={directoryBusy} onPress={() => void onSearchSellers(query)} style={[styles.secondaryButton, directoryBusy && styles.disabled]}>{directoryBusy ? <ActivityIndicator color={greenDeep} /> : <Search size={15} color={greenDeep} />}<Text style={styles.secondaryButtonText}>Find Sellers</Text></Pressable>{directory.map((seller) => <Pressable key={seller.userId} accessibilityRole="button" accessibilityLabel={`Start chat with ${seller.storefrontName}`} disabled={directoryBusy} onPress={() => void onOpenSeller(seller.userId)} style={styles.chatListItem}><View style={styles.avatar}><Text style={styles.avatarText}>{seller.storefrontName.slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{seller.storefrontName}</Text><Text style={styles.rowMeta}>@{seller.username} · Approved Seller</Text></View><Text style={styles.secondaryButtonText}>Start chat</Text></Pressable>)}{visible.map((conversation) => <Pressable key={conversation.id} accessibilityRole="button" accessibilityLabel={`Open Seller conversation with ${conversation.storefrontName}`} onPress={() => setSelected(conversation)} style={[styles.chatListItem, selected?.id === conversation.id && styles.chatListItemActive]}><View style={styles.avatar}><Text style={styles.avatarText}>{conversation.storefrontName.slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{conversation.storefrontName}</Text><Text numberOfLines={1} style={styles.rowMeta}>{conversation.lastMessage}</Text></View></Pressable>)}{!visible.length && !directory.length ? <EmptyState title="No matching Seller conversations" copy="Search the approved Seller directory or start from an eligible Product in Discover." /> : null}</View><View style={[styles.chatThread, mobile && styles.chatThreadMobile]}>{selected ? <><View style={styles.threadHeader}><View style={{ flex: 1 }}><Text style={styles.panelTitle}>{selected.storefrontName}</Text><Text style={styles.panelCopy}>Creator ↔ Seller · private Product promotion conversation</Text></View><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/creator-chat/[id]', params: { id: selected.id } })} style={styles.secondaryButton}><ExternalLink size={15} color={greenDeep} /><Text style={styles.secondaryButtonText}>Open full chat</Text></Pressable></View><ScrollView style={styles.messageList} contentContainerStyle={styles.messageContent}>{messages.map((message) => { const mine = message.senderId === userId; return <View key={message.id} style={[styles.messageBubble, mine && styles.messageBubbleMine]}>{message.productTitle ? <Text style={[styles.messageContext, mine && styles.messageTextMine]}>Product · {message.productTitle}</Text> : null}<SafeLinkText style={[styles.messageText, mine && styles.messageTextMine]} linkStyle={mine ? styles.messageTextMine : styles.messageLink}>{message.body}</SafeLinkText><Text style={[styles.messageTime, mine && styles.messageTextMine]}>{new Date(message.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text></View>; })}</ScrollView><View style={styles.composer}><TextInput accessibilityLabel="Message Seller about promotion" value={draft} onChangeText={setDraft} placeholder="Message Seller about promotion…" placeholderTextColor="#91a099" multiline style={styles.composerInput} /><Pressable accessibilityRole="button" accessibilityLabel="Send Creator message" disabled={busy || !draft.trim()} onPress={() => void onSend()} style={[styles.sendButton, (!draft.trim() || busy) && styles.disabled]}>{busy ? <ActivityIndicator color="#ffffff" /> : <Send size={18} color="#ffffff" />}</Pressable></View></> : <EmptyState title="Choose a Seller conversation" copy="Product-context messages remain private to the Creator and Storefront participants." />}</View></View>;
}

function ProfileSection({ data, access, onBadge, onSocial }: { data: CreatorCenterData; access: ReturnType<typeof useCommerceAccess>['access']; onBadge: () => void; onSocial: () => void }) {
  return <View style={styles.sectionStack}><View style={styles.profileCard}>{data.profile.avatarUrl ? <Image source={{ uri: data.profile.avatarUrl }} style={styles.profileAvatar} /> : <View style={styles.profileAvatarPlaceholder}><Text style={styles.profileInitial}>{data.profile.displayName.slice(0, 1).toUpperCase()}</Text></View>}<View style={{ flex: 1 }}><Text style={styles.profileName}>{data.profile.displayName}</Text><Text style={styles.profileHandle}>@{data.profile.username}</Text><Text style={styles.profileBio}>{data.profile.bio || 'No Creator bio added yet.'}</Text></View><Pressable onPress={onSocial} style={styles.secondaryButton}><ExternalLink size={16} color={greenDeep} /><Text style={styles.secondaryButtonText}>Social Profile</Text></Pressable></View><View style={styles.twoColumn}><Panel title="Creator details"><InfoRow label="Macro category" value={data.application?.macroCategory || data.application?.category || 'Not provided'} /><InfoRow label="Specialisations" value={data.application?.specializations.join(', ') || 'Not provided'} /><InfoRow label="Creator status" value={friendlyStatus(access?.creatorStatus ?? 'unknown')} /><InfoRow label="Professional verification" value={friendlyStatus(access?.professionalStatus ?? 'not_applied')} /><InfoRow label="Identity" value={friendlyStatus(data.verification.identityStatus)} /></Panel><Panel title="Creator Badge"><View style={styles.badgePreview}><BadgeCheck size={36} color="#1473e6" /><View style={{ flex: 1 }}><Text style={styles.rowTitle}>Premium Creator Badge</Text><Text style={styles.rowMeta}>Optional paid entitlement. It never replaces identity, professional or Admin verification.</Text></View></View><InfoRow label="Badge status" value={friendlyStatus(data.verification.blueTickStatus)} /><InfoRow label="Payment state" value="Provider not connected" /><Pressable onPress={onBadge} style={styles.primaryButton}><BadgeCheck size={17} color="#ffffff" /><Text style={styles.primaryButtonText}>Get Creator Badge</Text></Pressable></Panel></View></View>;
}

function MetricCard({ icon: Icon, label, value, note }: { icon: CreatorIcon; label: string; value: string; note: string }) { return <View style={styles.metricCard}><View style={styles.metricIcon}><Icon size={19} color={greenDeep} /></View><Text style={styles.metricLabel}>{label}</Text><Text selectable style={styles.metricValue}>{value}</Text><Text style={styles.metricNote}>{note}</Text></View>; }
function Panel({ title, copy, children }: { title: string; copy?: string; children: ReactNode }) { return <View style={styles.panel}><Text style={styles.panelTitle}>{title}</Text>{copy ? <Text style={styles.panelCopy}>{copy}</Text> : null}<View style={styles.panelBody}>{children}</View></View>; }
function InfoRow({ label, value }: { label: string; value: string }) { return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text selectable style={styles.infoValue}>{value}</Text></View>; }
function EmptyState({ title, copy }: { title: string; copy: string }) { return <View style={styles.empty}><View style={styles.emptyMark}><PackageSearch size={21} color={greenDeep} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyCopy}>{copy}</Text></View>; }
function Notice({ title, copy }: { title: string; copy: string }) { return <View style={styles.notice}><BadgeCheck size={20} color={greenDeep} /><View style={{ flex: 1 }}><Text style={styles.noticeTitle}>{title}</Text><Text style={styles.noticeCopy}>{copy}</Text></View></View>; }
function StatusPill({ status }: { status: string }) { const tone = statusTone(status); return <View style={[styles.statusPill, tone === 'positive' && styles.statusPositive, tone === 'negative' && styles.statusNegative]}><Text style={[styles.statusText, tone === 'positive' && styles.statusTextPositive, tone === 'negative' && styles.statusTextNegative]}>{friendlyStatus(status)}</Text></View>; }

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (value: T) => void }) { return <View style={styles.segmented}>{options.map(([key, label]) => <Pressable key={key} onPress={() => onChange(key)} style={[styles.segment, value === key && styles.segmentActive]}><Text style={[styles.segmentText, value === key && styles.segmentTextActive]}>{label}</Text></Pressable>)}</View>; }

function SelectMenu<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (value: T) => void }) { return <SelectDropdown value={value} options={options} onChange={onChange} />; }

function CenteredState({ loading, title, copy, action, onPress }: { loading?: boolean; title: string; copy: string; action?: string; onPress?: () => void }) { return <View style={styles.centered}>{loading ? <ActivityIndicator color={green} /> : <BadgeCheck size={34} color={greenDeep} />}<Text style={styles.centeredTitle}>{title}</Text><Text selectable style={styles.centeredCopy}>{copy}</Text>{action && onPress ? <Pressable onPress={onPress} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{action}</Text></Pressable> : null}</View>; }

function DemoQr() { const cells = Array.from({ length: 81 }, (_, index) => (index * 17 + Math.floor(index / 9) * 11) % 5 < 2); return <View style={styles.qr}>{cells.map((active, index) => <View key={index} style={[styles.qrCell, active && styles.qrCellActive]} />)}</View>; }

function BadgeModal({ visible, autoPay, setAutoPay, onClose }: { visible: boolean; autoPay: boolean; setAutoPay: (value: boolean) => void; onClose: () => void }) { return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.modalCard}><View style={styles.modalHeader}><View><Text style={styles.panelTitle}>Premium Creator Badge</Text><Text style={styles.panelCopy}>Demo / provider not connected</Text></View><Pressable onPress={onClose} style={styles.iconButton}><X size={19} color={ink} /></Pressable></View><View style={styles.badgePlan}><BadgeCheck size={34} color="#1473e6" /><View style={{ flex: 1 }}><Text style={styles.rowTitle}>Creator Badge plan</Text><Text style={styles.collectValue}>₹99 / month</Text><Text style={styles.rowMeta}>Prototype price only. No charge will be made.</Text></View></View><View style={styles.qrRow}><DemoQr /><View style={{ flex: 1 }}><Text style={styles.rowTitle}>Demo QR</Text><Text style={styles.rowMeta}>This QR does not initiate or confirm a real payment. UPI/card provider integration is required.</Text></View></View><View style={styles.toggleRow}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>Auto Pay</Text><Text style={styles.rowMeta}>Provider-ready preference only; no mandate or recurring debit exists.</Text></View><Switch value={autoPay} onValueChange={setAutoPay} trackColor={{ false: '#d8e1dc', true: '#a7e2c2' }} thumbColor={autoPay ? green : '#ffffff'} /></View><Notice title="Verification stays separate" copy="Buying a badge cannot approve identity, professional credentials, Seller access or Admin review." /><Pressable onPress={() => Alert.alert('Provider integration coming soon', 'No payment was attempted. A verified payment provider must be connected before badge setup can continue.')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Provider Setup</Text></Pressable></View></View></Modal>; }

function CollectPaymentModal({ visible, availableMinor, onClose }: { visible: boolean; availableMinor: number; onClose: () => void }) { return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.modalCard}><View style={styles.modalHeader}><View><Text style={styles.panelTitle}>Collect Payment</Text><Text style={styles.panelCopy}>Payout integration required</Text></View><Pressable onPress={onClose} style={styles.iconButton}><X size={19} color={ink} /></Pressable></View><Text style={styles.collectLabel}>Available eligible balance</Text><Text style={styles.collectValue}>{formatMinor(availableMinor)}</Text><Notice title="No money will move" copy="A payout provider, verified payout account and authoritative provider confirmation must exist before this balance can be collected." /><Pressable onPress={onClose} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Close</Text></Pressable></View></View></Modal>; }

const styles = StyleSheet.create({
  page: { flex: 1, flexDirection: 'row', backgroundColor: canvas },
  sidebar: { width: 250, backgroundColor: panel, borderRightWidth: 1, borderRightColor: line, padding: 18, gap: 22 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: line },
  brandMark: { width: 44, height: 44, borderRadius: 14, backgroundColor: green, alignItems: 'center', justifyContent: 'center' },
  brandTitle: { color: ink, fontSize: 18, fontWeight: '900' }, brandMeta: { color: muted, fontSize: 12, marginTop: 2, maxWidth: 150 },
  navList: { flex: 1, gap: 5 }, navItem: { minHeight: 46, borderRadius: 13, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 11 }, navItemActive: { backgroundColor: green }, navText: { color: '#53625c', fontSize: 14, fontWeight: '800' }, navTextActive: { color: '#ffffff' },
  sidebarFooter: { gap: 6, borderTopWidth: 1, borderTopColor: line, paddingTop: 12 }, utilityButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 }, utilityText: { color: ink, fontSize: 13, fontWeight: '800' },
  workspace: { flex: 1 }, workspaceContent: { padding: 30, gap: 22, maxWidth: 1480, width: '100%', alignSelf: 'center' }, workspaceContentMobile: { padding: 14, gap: 14 },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12 }, pageTitle: { color: ink, fontSize: 30, fontWeight: '900' }, pageSubtitle: { color: muted, fontSize: 13, marginTop: 3 },
  mobileNav: { backgroundColor: panel, borderWidth: 1, borderColor: line, borderRadius: 18, padding: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, mobileNavItem: { minHeight: 40, paddingHorizontal: 11, borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 6 }, mobileNavItemActive: { backgroundColor: green }, mobileNavText: { color: greenDeep, fontSize: 12, fontWeight: '800' }, mobileNavTextActive: { color: '#ffffff' },
  sectionStack: { gap: 18 }, hero: { backgroundColor: '#102e25', borderRadius: 24, padding: 24, flexDirection: 'row', alignItems: 'center', gap: 22 }, eyebrow: { color: '#8ce2b6', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 }, heroTitle: { color: '#ffffff', fontSize: 27, lineHeight: 34, fontWeight: '900', maxWidth: 720, marginTop: 6 }, heroCopy: { color: '#c6ded3', fontSize: 14, lineHeight: 21, marginTop: 7, maxWidth: 760 },
  heroMobile: { flexDirection: 'column', alignItems: 'stretch', padding: 20, gap: 17 },
  primaryButton: { minHeight: 46, borderRadius: 13, backgroundColor: green, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'flex-start' }, primaryButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
  primaryButtonMobile: { alignSelf: 'stretch' },
  secondaryButton: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: line, backgroundColor: '#ffffff', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, alignSelf: 'flex-start' }, secondaryButtonText: { color: greenDeep, fontSize: 12, fontWeight: '900' }, iconButton: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: line, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  periodBar: { alignItems: 'flex-start' }, periodSelect: { minWidth: 210 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, metricCard: { flexGrow: 1, flexBasis: 190, backgroundColor: panel, borderWidth: 1, borderColor: line, borderRadius: 18, padding: 17, gap: 6 }, metricIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: mint, alignItems: 'center', justifyContent: 'center' }, metricLabel: { color: muted, fontSize: 12, fontWeight: '800' }, metricValue: { color: ink, fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] }, metricNote: { color: '#7a8982', fontSize: 11 },
  twoColumn: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }, threeColumn: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 14 }, panel: { flexGrow: 1, flexBasis: 330, backgroundColor: panel, borderWidth: 1, borderColor: line, borderRadius: 20, padding: 19 }, panelTitle: { color: ink, fontSize: 18, fontWeight: '900' }, panelCopy: { color: muted, fontSize: 12, lineHeight: 18, marginTop: 4 }, panelBody: { gap: 10, marginTop: 14 },
  dataRow: { minHeight: 62, borderTopWidth: 1, borderTopColor: '#edf1ef', paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 11 }, highlightRow: { backgroundColor: '#f1fbf6', borderRadius: 12, paddingHorizontal: 10 }, rowTitle: { color: ink, fontSize: 13, fontWeight: '900' }, rowMeta: { color: muted, fontSize: 11, lineHeight: 16, marginTop: 2 }, rowValue: { color: ink, fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] }, rankCircle: { width: 31, height: 31, borderRadius: 16, backgroundColor: mint, alignItems: 'center', justifyContent: 'center' }, rankCircleText: { color: greenDeep, fontSize: 12, fontWeight: '900' },
  statusPill: { borderRadius: 999, backgroundColor: '#edf2f5', paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' }, statusPositive: { backgroundColor: '#e7f8ef' }, statusNegative: { backgroundColor: '#fff0f0' }, statusText: { color: '#536577', fontSize: 9, fontWeight: '900' }, statusTextPositive: { color: greenDeep }, statusTextNegative: { color: '#b42318' },
  segmented: { alignSelf: 'flex-start', flexDirection: 'row', borderRadius: 15, backgroundColor: '#e8eeeb', padding: 4 }, segment: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 12 }, segmentActive: { backgroundColor: panel }, segmentText: { color: muted, fontSize: 13, fontWeight: '800' }, segmentTextActive: { color: ink },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, searchBox: { flex: 1, minWidth: 240, minHeight: 45, borderRadius: 14, borderWidth: 1, borderColor: line, backgroundColor: panel, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 }, searchInput: { flex: 1, color: ink, fontSize: 13, outlineStyle: 'none' } as any, selectMenu: { minHeight: 45, borderRadius: 14, borderWidth: 1, borderColor: line, backgroundColor: panel, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13 }, selectText: { color: ink, fontSize: 12, fontWeight: '800' },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, productCard: { flexGrow: 1, flexBasis: 270, maxWidth: 410, backgroundColor: panel, borderWidth: 1, borderColor: line, borderRadius: 19, overflow: 'hidden' }, productImage: { width: '100%', height: 170, objectFit: 'cover' }, productPlaceholder: { width: '100%', height: 170, backgroundColor: mint, alignItems: 'center', justifyContent: 'center' }, productBody: { padding: 15, gap: 6 }, productStore: { color: greenDeep, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 }, productTitle: { color: ink, fontSize: 17, fontWeight: '900' }, productMeta: { color: muted, fontSize: 11 }, productMoneyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, productPrice: { color: ink, fontSize: 17, fontWeight: '900' }, commissionBadge: { color: greenDeep, fontSize: 10, fontWeight: '900', backgroundColor: mint, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }, productEarning: { color: '#53625c', fontSize: 11 }, cardActions: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' }, primarySmall: { minHeight: 38, minWidth: 82, backgroundColor: green, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, primarySmallText: { color: '#ffffff', fontSize: 11, fontWeight: '900' }, secondarySmall: { minHeight: 38, borderWidth: 1, borderColor: line, borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10 }, secondarySmallText: { color: greenDeep, fontSize: 11, fontWeight: '900' }, iconAction: { width: 38, height: 38, borderWidth: 1, borderColor: line, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  linkCard: { borderTopWidth: 1, borderTopColor: '#edf1ef', paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, linkTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, linkValue: { color: '#215b8f', fontSize: 11, lineHeight: 16 }, linkActions: { flexDirection: 'row', gap: 7 }, earningsRow: { minHeight: 64, borderTopWidth: 1, borderTopColor: '#edf1ef', paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  myRank: { minWidth: 110, padding: 16, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center' }, myRankLabel: { color: '#b8d6c8', fontSize: 11, fontWeight: '800' }, myRankValue: { color: '#ffffff', fontSize: 30, fontWeight: '900' }, largeNumber: { color: ink, fontSize: 34, fontWeight: '900' },
  myRankMobile: { width: '100%' },
  notice: { backgroundColor: mint, borderWidth: 1, borderColor: '#cde9da', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, noticeTitle: { color: greenDeep, fontSize: 13, fontWeight: '900' }, noticeCopy: { color: '#49665a', fontSize: 11, lineHeight: 17, marginTop: 2 }, collectCard: { flexDirection: 'row', alignItems: 'center', gap: 18, flexWrap: 'wrap', justifyContent: 'space-between' }, collectLabel: { color: muted, fontSize: 12, fontWeight: '800' }, collectValue: { color: ink, fontSize: 27, fontWeight: '900', marginTop: 4 },
  chatDesk: { minHeight: 620, backgroundColor: panel, borderWidth: 1, borderColor: line, borderRadius: 20, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }, chatList: { width: 310, maxWidth: '100%', padding: 16, borderRightWidth: 1, borderRightColor: line }, chatSearch: { minHeight: 40, marginTop: 10, marginBottom: 8, borderWidth: 1, borderColor: line, borderRadius: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }, chatSearchInput: { flex: 1, color: ink, fontSize: 12 }, chatListItem: { minHeight: 64, borderRadius: 13, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 7 }, chatListItemActive: { backgroundColor: mint }, avatar: { width: 38, height: 38, borderRadius: 13, backgroundColor: green, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#ffffff', fontWeight: '900' }, chatThread: { flex: 1, minWidth: 300, minHeight: 600, padding: 16 }, threadHeader: { paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: line, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, messageList: { flex: 1 }, messageContent: { paddingVertical: 16, gap: 9 }, messageBubble: { maxWidth: '78%', alignSelf: 'flex-start', backgroundColor: '#edf2f0', borderRadius: 15, padding: 11 }, messageBubbleMine: { alignSelf: 'flex-end', backgroundColor: green }, messageContext: { color: greenDeep, fontSize: 10, fontWeight: '900', marginBottom: 4 }, messageText: { color: ink, fontSize: 13, lineHeight: 19 }, messageLink: { color: greenDeep }, messageTextMine: { color: '#ffffff' }, messageTime: { color: muted, fontSize: 9, marginTop: 5 }, composer: { borderTopWidth: 1, borderTopColor: line, paddingTop: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 9 }, composerInput: { flex: 1, minHeight: 44, maxHeight: 100, borderWidth: 1, borderColor: line, borderRadius: 14, padding: 11, color: ink, fontSize: 13 }, sendButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: green, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.45 },
  chatDeskMobile: { flexDirection: 'column', flexWrap: 'nowrap' }, chatListMobile: { width: '100%', borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: line }, chatThreadMobile: { width: '100%', minWidth: 0, minHeight: 520 },
  profileCard: { backgroundColor: panel, borderWidth: 1, borderColor: line, borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 15, flexWrap: 'wrap' }, profileAvatar: { width: 78, height: 78, borderRadius: 24 }, profileAvatarPlaceholder: { width: 78, height: 78, borderRadius: 24, backgroundColor: green, alignItems: 'center', justifyContent: 'center' }, profileInitial: { color: '#ffffff', fontSize: 29, fontWeight: '900' }, profileName: { color: ink, fontSize: 24, fontWeight: '900' }, profileHandle: { color: greenDeep, fontSize: 13, fontWeight: '800', marginTop: 2 }, profileBio: { color: muted, fontSize: 12, marginTop: 6 }, badgePreview: { flexDirection: 'row', alignItems: 'center', gap: 12 }, infoRow: { minHeight: 42, borderTopWidth: 1, borderTopColor: '#edf1ef', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, infoLabel: { color: muted, fontSize: 12 }, infoValue: { color: ink, fontSize: 12, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 24 }, emptyMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: mint, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: ink, fontSize: 14, fontWeight: '900', textAlign: 'center', marginTop: 9 }, emptyCopy: { color: muted, fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 380, marginTop: 4 },
  centered: { flex: 1, minHeight: 500, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: canvas, gap: 12 }, centeredTitle: { color: ink, fontSize: 22, fontWeight: '900', textAlign: 'center' }, centeredCopy: { color: muted, fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 500 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(8,22,16,0.55)', alignItems: 'center', justifyContent: 'center', padding: 18 }, modalCard: { width: '100%', maxWidth: 560, maxHeight: '92%', backgroundColor: panel, borderRadius: 23, padding: 20, gap: 15 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, badgePlan: { backgroundColor: '#f3f7ff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, qrRow: { flexDirection: 'row', alignItems: 'center', gap: 15 }, qr: { width: 126, height: 126, padding: 7, backgroundColor: '#ffffff', borderWidth: 1, borderColor: line, flexDirection: 'row', flexWrap: 'wrap' }, qrCell: { width: 12, height: 12, backgroundColor: '#ffffff' }, qrCellActive: { backgroundColor: ink }, toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: line, paddingTop: 13 },
});
