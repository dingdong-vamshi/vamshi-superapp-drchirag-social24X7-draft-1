import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowLeft, CheckCircle2, RefreshCcw } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import {
  addLifecycleCartItem,
  adminProductDecisionsFor,
  canEditLifecycleProduct,
  canSubmitLifecycleProduct,
  createPromotion,
  confirmAdminCheckoutPaymentForTest,
  formatMinor,
  listAdminProductQueue,
  listAdminBuyerAccess,
  listAdminCheckouts,
  listAdminReturns,
  listBuyerOrderItems,
  listCreatorCommissions,
  listCreatorMarketplaceProducts,
  listLifecycleCart,
  listLifecycleOrderEvidence,
  listMyCheckouts,
  listMyPromotions,
  listSellerLifecycleOrders,
  listSellerLifecycleProducts,
  recordCreatorPromotionClick,
  reviewLifecycleProduct,
  replaceLifecycleProductMedia,
  resolveLifecycleProductMediaUrl,
  saveAddressAndCheckout,
  saveSellerLifecycleProduct,
  sellerFulfillmentDecisionsFor,
  setAdminBuyerKycForTest,
  slugifyCommerce,
  submitLifecycleProduct,
  submitLifecycleReturn,
  uploadLifecycleProductMedia,
  updateLifecycleFulfillment,
  uploadLifecycleOrderEvidence,
  type BuyerOrderItem,
  type AdminBuyerAccess,
  type AdminCheckout,
  type AdminReturnRequest,
  type AdminProductDecision,
  type CartLine,
  type CheckoutSummary,
  type CreatorCommission,
  type CreatorPromotion,
  type LifecycleProduct,
  type LifecycleOrderEvidence,
  type ProductMediaItem,
  type SellerLifecycleOrder,
} from './lifecycleRepository';

type LoadState = 'loading' | 'ready' | 'error';

const categories = ['Wellness', 'Home', 'Travel', 'Everyday'];

export function SellerLifecycleScreen() {
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [products, setProducts] = useState<LifecycleProduct[]>([]);
  const [orders, setOrders] = useState<SellerLifecycleOrder[]>([]);
  const [evidence, setEvidence] = useState<LifecycleOrderEvidence[]>([]);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [category, setCategory] = useState('Everyday');
  const [price, setPrice] = useState('999');
  const [salePrice, setSalePrice] = useState('');
  const [inventory, setInventory] = useState('10');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [promotionEnabled, setPromotionEnabled] = useState(true);
  const [commission, setCommission] = useState('10');
  const [returnWindow, setReturnWindow] = useState('7');

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      if (!supabase) throw new Error('Supabase is not configured.');
      const [nextProducts, nextOrders, nextEvidence] = await Promise.all([
        listSellerLifecycleProducts(supabase),
        listSellerLifecycleOrders(supabase),
        listLifecycleOrderEvidence(supabase),
      ]);
      setProducts(nextProducts);
      setOrders(nextOrders);
      setEvidence(nextEvidence);
      setState('ready');
    } catch (cause) {
      setError(messageFor(cause));
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingId(undefined);
    setTitle('');
    setSlug('');
    setCategory('Everyday');
    setPrice('999');
    setSalePrice('');
    setInventory('10');
    setSku('');
    setDescription('');
    setPromotionEnabled(true);
    setCommission('10');
    setReturnWindow('7');
  };

  const edit = (product: LifecycleProduct) => {
    setEditingId(product.id);
    setTitle(product.title);
    setSlug(product.slug);
    setCategory(product.category);
    setPrice(String(Math.round(product.priceMinor / 100)));
    setSalePrice(product.salePriceMinor ? String(Math.round(product.salePriceMinor / 100)) : '');
    setInventory(String(product.inventory));
    setSku(product.sku);
    setDescription(product.description);
    setPromotionEnabled(product.creatorPromotionEnabled);
    setCommission(String(product.creatorCommissionBps / 100));
    setReturnWindow(String(product.returnWindowDays));
  };

  const save = async () => {
    if (!supabase) return;
    if (!title.trim()) {
      Alert.alert('Product title required', 'Add a product title before saving.');
      return;
    }
    const commissionPercent = Number(commission || 0);
    if (promotionEnabled && (commissionPercent < 5 || commissionPercent > 70)) {
      Alert.alert('Commission out of range', 'Creator commission must be between 5% and 70%.');
      return;
    }
    setFeedback(null);
    setSaving(true);
    try {
      await saveSellerLifecycleProduct(supabase, {
        id: editingId,
        title,
        slug: slug || slugifyCommerce(title),
        category,
        priceMinor: Math.round(Number(price || 0) * 100),
        salePriceMinor: salePrice ? Math.round(Number(salePrice) * 100) : null,
        inventory: Math.round(Number(inventory || 0)),
        shortDescription: description || title,
        description: description || title,
        sku: sku || slugifyCommerce(title),
        creatorPromotionEnabled: promotionEnabled,
        creatorCommissionBps: promotionEnabled ? Math.round(commissionPercent * 100) : 0,
        returnWindowDays: Math.max(0, Math.min(30, Math.round(Number(returnWindow || 7)))),
      });
      resetForm();
      await load();
      setFeedback({ tone: 'success', message: 'Draft saved. The authoritative product list has been refreshed.' });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Could not save product draft', message);
    } finally {
      setSaving(false);
    }
  };

  const submit = async (productId: string) => {
    if (!supabase) return;
    setFeedback(null);
    setSaving(true);
    try {
      await submitLifecycleProduct(supabase, productId);
      await load();
      setFeedback({ tone: 'success', message: 'Published live. No separate Product approval is required for an approved Seller.' });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Could not submit product', message);
    } finally {
      setSaving(false);
    }
  };

  const replaceProductImages = async (product: LifecycleProduct) => {
    if (!supabase) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow media access to add Product images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.88,
    });
    if (result.canceled) return;
    setSaving(true);
    setFeedback(null);
    try {
      await uploadLifecycleProductMedia(supabase, product.id, result.assets);
      await load();
      setFeedback({ tone: 'success', message: 'Private Product media saved. The first image is the cover.' });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Product media failed', message);
    } finally {
      setSaving(false);
    }
  };

  const persistMedia = async (product: LifecycleProduct, next: ProductMediaItem[]) => {
    if (!supabase) return;
    if (!next.length) {
      Alert.alert('Cover required', 'A Product must keep at least one image before submission. Replace the media set instead.');
      return;
    }
    if (next.some((item) => item.storageBucket !== 'product-media')) {
      Alert.alert('Replace legacy media', 'Replace this legacy public media set once before reordering it.');
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await replaceLifecycleProductMedia(supabase, product.id, next);
      await load();
      setFeedback({ tone: 'success', message: 'Product cover and media order updated.' });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Media update failed', message);
    } finally {
      setSaving(false);
    }
  };

  const updateOrder = async (orderId: string, nextStatus: string) => {
    if (!supabase) return;
    setFeedback(null);
    setSaving(true);
    try {
      await updateLifecycleFulfillment(supabase, orderId, nextStatus);
      await load();
      setFeedback({ tone: 'success', message: `Order status updated to ${nextStatus.replaceAll('_', ' ')}.` });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Could not update fulfillment', message);
    } finally {
      setSaving(false);
    }
  };

  const uploadPackingEvidence = async (orderId: string) => {
    if (!supabase) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFeedback({ tone: 'error', message: 'Media permission is required to attach packing evidence.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.82 });
    if (result.canceled) return;
    setSaving(true);
    setFeedback(null);
    try {
      await uploadLifecycleOrderEvidence(supabase, { orderId, kind: 'packing', asset: result.assets[0] });
      await load();
      setFeedback({ tone: 'success', message: 'Private packing evidence uploaded and persisted.' });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Packing evidence failed', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header title="Seller product studio" subtitle="Create Products, set Creator commission, publish directly, then fulfil orders." />
      <StateBanner state={state} error={error} onRetry={load} />
      <MutationFeedback feedback={feedback} />

      <Panel title={editingId ? 'Edit product draft' : 'New product'}>
        <Text style={styles.meta}>Save the draft first, attach Product media in Advanced Seller Studio, then publish the same Product live.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/seller')} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Open advanced media studio</Text>
        </Pressable>
        <Field label="Title" value={title} onChangeText={(value) => { setTitle(value); if (!slug) setSlug(slugifyCommerce(value)); }} />
        <Field label="Slug" value={slug} onChangeText={setSlug} autoCapitalize="none" />
        <Segment value={category} options={categories} onChange={setCategory} />
        <View style={styles.twoCols}>
          <Field label="Price ₹" value={price} onChangeText={setPrice} keyboardType="number-pad" />
          <Field label="Sale price ₹" value={salePrice} onChangeText={setSalePrice} keyboardType="number-pad" />
        </View>
        <View style={styles.twoCols}>
          <Field label="Inventory" value={inventory} onChangeText={setInventory} keyboardType="number-pad" />
          <Field label="SKU" value={sku} onChangeText={setSku} autoCapitalize="none" />
        </View>
        <Field label="Description" value={description} onChangeText={setDescription} multiline />
        <View style={styles.switchRow}>
          <Text style={styles.switchText}>Creator promotion enabled</Text>
          <Pressable accessibilityRole="button" onPress={() => setPromotionEnabled((value) => !value)} style={[styles.pillButton, promotionEnabled && styles.pillButtonActive]}>
            <Text style={[styles.pillButtonText, promotionEnabled && styles.pillButtonTextActive]}>{promotionEnabled ? 'Enabled' : 'Disabled'}</Text>
          </Pressable>
        </View>
        <View style={styles.twoCols}>
          <Field label="Creator commission %" value={commission} onChangeText={setCommission} editable={promotionEnabled} keyboardType="number-pad" />
          <Field label="Return window days" value={returnWindow} onChangeText={setReturnWindow} keyboardType="number-pad" />
        </View>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.primaryButton, saving && styles.disabled]}>
          {saving ? <View style={styles.loadingButtonContent}><ActivityIndicator color="#fff" /><Text style={styles.primaryButtonText}>Saving…</Text></View> : <Text style={styles.primaryButtonText}>Save product draft</Text>}
        </Pressable>
        {editingId ? <Pressable accessibilityRole="button" onPress={resetForm} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancel edit</Text></Pressable> : null}
      </Panel>

      <Panel title="Products">
        {products.length ? products.map((product) => (
          <View key={product.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{product.title}</Text>
                <Text style={styles.meta}>{product.status} · {product.approvalStatus} · {formatMinor(product.salePriceMinor ?? product.priceMinor)}</Text>
                <Text style={styles.meta}>Inventory {product.inventory - product.inventoryReserved}/{product.inventory} · Commission {product.creatorCommissionBps / 100}%</Text>
                <Text style={styles.meta}>SKU {product.sku || '—'} · Return window {product.returnWindowDays} day(s)</Text>
                <Text style={styles.meta}>Media {product.mediaPaths.length}/10 · shared with Advanced Seller Studio</Text>
                {product.reviewNote ? <Text style={styles.warningText}>Review note: {product.reviewNote}</Text> : null}
              </View>
              <StatusPill label={product.approvalStatus} positive={product.approvalStatus === 'approved'} />
            </View>
            <View style={styles.actionRow}>
              <SmallButton label="Edit" disabled={saving || !canEditLifecycleProduct(product.approvalStatus)} onPress={() => edit(product)} />
              <SmallButton label={product.mediaItems.length ? 'Replace images' : 'Add images'} disabled={saving || !canEditLifecycleProduct(product.approvalStatus)} onPress={() => void replaceProductImages(product)} />
              <SmallButton label="Publish Product" disabled={saving || !canSubmitLifecycleProduct(product.approvalStatus)} onPress={() => void submit(product.id)} />
            </View>
            {product.mediaItems.length ? (
              <View style={styles.mediaRow}>
                {product.mediaItems.map((item, index) => (
                  <LifecycleProductMediaCard
                    key={item.path}
                    item={item}
                    index={index}
                    count={product.mediaItems.length}
                    disabled={saving || !canEditLifecycleProduct(product.approvalStatus)}
                    onCover={() => void persistMedia(product, [item, ...product.mediaItems.filter((candidate) => candidate.path !== item.path)])}
                    onEarlier={() => {
                      if (index < 1) return;
                      const next = [...product.mediaItems];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      void persistMedia(product, next);
                    }}
                    onLater={() => {
                      if (index >= product.mediaItems.length - 1) return;
                      const next = [...product.mediaItems];
                      [next[index + 1], next[index]] = [next[index], next[index + 1]];
                      void persistMedia(product, next);
                    }}
                    onRemove={() => void persistMedia(product, product.mediaItems.filter((candidate) => candidate.path !== item.path))}
                  />
                ))}
              </View>
            ) : null}
          </View>
        )) : <Text style={styles.emptyText}>No products yet.</Text>}
      </Panel>

      <Panel title="Seller fulfillment">
        {orders.length ? orders.map((order) => (
          <View key={order.id} style={styles.card}>
            <Text selectable style={styles.cardTitle}>Order {order.id.slice(0, 8)}</Text>
            <Text style={styles.meta}>{order.itemCount} item(s) · {order.status} · {order.paymentStatus} · {formatMinor(order.totalMinor)}</Text>
            <EvidencePreview evidence={evidence.find((item) => item.orderId === order.id && item.kind === 'packing')} emptyLabel="No packing evidence attached." />
            <SmallButton label={evidence.some((item) => item.orderId === order.id && item.kind === 'packing') ? 'Replace packing evidence' : 'Submit packing evidence'} disabled={saving} onPress={() => void uploadPackingEvidence(order.id)} />
            <View style={styles.actionRow}>
              {sellerFulfillmentDecisionsFor(order.status).map((status) => (
                <SmallButton key={status} label={status.replaceAll('_', ' ')} disabled={saving} onPress={() => void updateOrder(order.id, status)} />
              ))}
              {!sellerFulfillmentDecisionsFor(order.status).length ? <Text style={styles.meta}>No further seller transition is available.</Text> : null}
            </View>
          </View>
        )) : <Text style={styles.emptyText}>No seller orders yet.</Text>}
      </Panel>
    </ScrollView>
  );
}

export function CreatorLifecycleScreen() {
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [marketplace, setMarketplace] = useState<LifecycleProduct[]>([]);
  const [promotions, setPromotions] = useState<CreatorPromotion[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkouts, setCheckouts] = useState<CheckoutSummary[]>([]);
  const [commissions, setCommissions] = useState<CreatorCommission[]>([]);
  const [buyerItems, setBuyerItems] = useState<BuyerOrderItem[]>([]);
  const [recipientName, setRecipientName] = useState('Codex Test Buyer');
  const [phone, setPhone] = useState('9999999999');
  const [addressLine1, setAddressLine1] = useState('Creator Commerce test address');
  const [city, setCity] = useState('Hyderabad');
  const [stateCode, setStateCode] = useState('TS');
  const [postalCode, setPostalCode] = useState('500001');
  const [returnReason, setReturnReason] = useState('Buyer return test with unboxing evidence pending.');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      if (!supabase) throw new Error('Supabase is not configured.');
      const [nextMarket, nextPromotions, nextCart, nextCheckouts, nextCommissions, nextItems] = await Promise.all([
        listCreatorMarketplaceProducts(supabase),
        listMyPromotions(supabase),
        listLifecycleCart(supabase),
        listMyCheckouts(supabase),
        listCreatorCommissions(supabase),
        listBuyerOrderItems(supabase),
      ]);
      setMarketplace(nextMarket);
      setPromotions(nextPromotions);
      setCart(nextCart);
      setCheckouts(nextCheckouts);
      setCommissions(nextCommissions);
      setBuyerItems(nextItems);
      setState('ready');
    } catch (cause) {
      setError(messageFor(cause));
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const promote = async (productId: string) => {
    if (!supabase) return;
    setFeedback(null);
    setBusy(true);
    try {
      const promotion = await createPromotion(supabase, productId);
      await Clipboard.setStringAsync(promotion.trackingCode);
      await load();
      setFeedback({ tone: 'success', message: 'Promotion saved. Its buyer tracking code was copied and the authoritative list was refreshed.' });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Could not create promotion', message);
    } finally {
      setBusy(false);
    }
  };

  const addToCart = async (productId: string, trackingCode?: string | null) => {
    if (!supabase) return;
    setFeedback(null);
    setBusy(true);
    try {
      await addLifecycleCartItem(supabase, productId, 1, trackingCode);
      await load();
      setFeedback({ tone: 'success', message: 'Product added to the current account cart.' });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Could not add to cart', message);
    } finally {
      setBusy(false);
    }
  };

  const checkout = async (paymentMethod: 'cod' | 'external') => {
    if (!supabase) return;
    setFeedback(null);
    setBusy(true);
    try {
      const checkoutId = await saveAddressAndCheckout(supabase, { recipientName, phone, addressLine1, city, stateCode, postalCode, paymentMethod });
      await load();
      setFeedback({ tone: 'success', message: `Checkout ${checkoutId.slice(0, 8)} created. External provider calls remain pending where applicable.` });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Checkout blocked', message);
    } finally {
      setBusy(false);
    }
  };

  const requestReturn = async (itemId: string) => {
    if (!supabase) return;
    setFeedback(null);
    setBusy(true);
    try {
      await submitLifecycleReturn(supabase, itemId, returnReason);
      await load();
      setFeedback({ tone: 'success', message: 'Return request submitted and is now admin-controlled.' });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Return blocked', message);
    } finally {
      setBusy(false);
    }
  };

  const promotionByProduct = useMemo(() => new Map(promotions.map((promotion) => [promotion.productId, promotion])), [promotions]);
  const cartTotal = cart.reduce((total, item) => total + item.unitPriceMinor * item.quantity, 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header title="Creator commerce workspace" subtitle="Promote approved products, test attribution/cart/checkout, and track commissions." />
      <StateBanner state={state} error={error} onRetry={load} />
      <MutationFeedback feedback={feedback} />

      <Panel title="Creator product marketplace">
        {marketplace.length ? marketplace.map((product) => {
          const promotion = promotionByProduct.get(product.id);
          return (
            <View key={product.id} style={styles.card}>
              <Text style={styles.cardTitle}>{product.title}</Text>
              <Text style={styles.meta}>{product.storefrontName} · {formatMinor(product.salePriceMinor ?? product.priceMinor)} · Commission {product.creatorCommissionBps / 100}%</Text>
              <Text style={styles.meta}>Available {product.inventory - product.inventoryReserved} · Return window {product.returnWindowDays} day(s)</Text>
              {promotion ? <Text selectable style={styles.successText}>Buyer link: /commerce/buyer?ref={promotion.trackingCode}</Text> : null}
              <View style={styles.actionRow}>
                <SmallButton label={promotion ? 'Refresh promotion' : 'Promote'} disabled={busy} onPress={() => void promote(product.id)} />
                <SmallButton label="Add to cart" disabled={busy} onPress={() => void addToCart(product.id, promotion?.trackingCode)} />
              </View>
            </View>
          );
        }) : <Text style={styles.emptyText}>No approved creator-promotable products yet.</Text>}
      </Panel>

      <Panel title="Cart and checkout">
        {cart.length ? cart.map((item) => (
          <View key={item.id} style={styles.cardCompact}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.meta}>{item.storefrontName} · Qty {item.quantity} · {formatMinor(item.unitPriceMinor * item.quantity)}{item.promotionCode ? ` · ${item.promotionCode}` : ''}</Text>
          </View>
        )) : <Text style={styles.emptyText}>Cart is empty.</Text>}
        <Text style={styles.meta}>Cart subtotal: {formatMinor(cartTotal)} · Platform fee: ₹5 added by backend at unified checkout.</Text>
        <Field label="Recipient name" value={recipientName} onChangeText={setRecipientName} />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Field label="Address" value={addressLine1} onChangeText={setAddressLine1} />
        <View style={styles.twoCols}>
          <Field label="City" value={city} onChangeText={setCity} />
          <Field label="State code" value={stateCode} onChangeText={setStateCode} autoCapitalize="characters" />
        </View>
        <Field label="Postal code" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" />
        <View style={styles.actionRow}>
          <SmallButton label="Checkout external" disabled={busy || !cart.length} onPress={() => void checkout('external')} />
          <SmallButton label="Checkout COD" disabled={busy || !cart.length} onPress={() => void checkout('cod')} />
        </View>
      </Panel>

      <Panel title="Buyer orders and returns">
        <Field label="Return reason" value={returnReason} onChangeText={setReturnReason} multiline />
        {buyerItems.length ? buyerItems.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.meta}>{item.storefrontName} · {item.orderStatus} · Qty {item.quantity} · {formatMinor(item.subtotalMinor)}</Text>
            <Text style={styles.meta}>Commission status: {item.commissionStatus} · Return until {item.returnWindowEndsAt ? new Date(item.returnWindowEndsAt).toLocaleDateString() : 'after delivery'}</Text>
            <SmallButton label="Submit return request" disabled={busy || item.orderStatus !== 'delivered'} onPress={() => void requestReturn(item.id)} />
          </View>
        )) : <Text style={styles.emptyText}>No buyer order items yet.</Text>}
      </Panel>

      <Panel title="Checkouts">
        {checkouts.length ? checkouts.map((checkoutItem) => (
          <View key={checkoutItem.id} style={styles.cardCompact}>
            <Text selectable style={styles.cardTitle}>Checkout {checkoutItem.id.slice(0, 8)}</Text>
            <Text style={styles.meta}>{checkoutItem.status} · {checkoutItem.paymentMethod} · {checkoutItem.paymentStatus} · {formatMinor(checkoutItem.totalMinor)}</Text>
          </View>
        )) : <Text style={styles.emptyText}>No checkouts yet.</Text>}
      </Panel>

      <Panel title="Creator commissions">
        {commissions.length ? commissions.map((commissionItem) => (
          <View key={commissionItem.id} style={styles.cardCompact}>
            <Text style={styles.cardTitle}>{commissionItem.productTitle}</Text>
            <Text style={styles.meta}>{commissionItem.status} · {formatMinor(commissionItem.commissionMinor)} on {formatMinor(commissionItem.eligibleItemMinor)}</Text>
          </View>
        )) : <Text style={styles.emptyText}>No commissions yet. They appear after attributed checkout.</Text>}
      </Panel>
    </ScrollView>
  );
}

export function BuyerLifecycleScreen() {
  const params = useLocalSearchParams<{ ref?: string | string[] }>();
  const initialCode = Array.isArray(params.ref) ? params.ref[0] ?? '' : params.ref ?? '';
  const attributionAttempted = useRef(false);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [marketplace, setMarketplace] = useState<LifecycleProduct[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkouts, setCheckouts] = useState<CheckoutSummary[]>([]);
  const [buyerItems, setBuyerItems] = useState<BuyerOrderItem[]>([]);
  const [evidence, setEvidence] = useState<LifecycleOrderEvidence[]>([]);
  const [trackingCode, setTrackingCode] = useState(initialCode);
  const [recipientName, setRecipientName] = useState('Vamshi Test Buyer');
  const [phone, setPhone] = useState('9000000000');
  const [addressLine1, setAddressLine1] = useState('101 Test Street');
  const [city, setCity] = useState('Bengaluru');
  const [stateCode, setStateCode] = useState('KARNATAKA');
  const [postalCode, setPostalCode] = useState('560102');
  const [returnReason, setReturnReason] = useState('Manual QA return request for delivered test order.');

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      if (!supabase) throw new Error('Supabase is not configured.');
      const [nextMarket, nextCart, nextCheckouts, nextItems, nextEvidence] = await Promise.all([
        listCreatorMarketplaceProducts(supabase),
        listLifecycleCart(supabase),
        listMyCheckouts(supabase),
        listBuyerOrderItems(supabase),
        listLifecycleOrderEvidence(supabase),
      ]);
      setMarketplace(nextMarket);
      setCart(nextCart);
      setCheckouts(nextCheckouts);
      setBuyerItems(nextItems);
      setEvidence(nextEvidence);
      setState('ready');
    } catch (cause) {
      setError(messageFor(cause));
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const applyAttribution = useCallback(async (code: string) => {
    if (!supabase || !code.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      await recordCreatorPromotionClick(supabase, code);
      setTrackingCode(code.trim());
      setFeedback({ tone: 'success', message: 'Creator attribution recorded for this buyer session.' });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!initialCode || attributionAttempted.current) return;
    attributionAttempted.current = true;
    void applyAttribution(initialCode);
  }, [applyAttribution, initialCode]);

  const setQuantity = async (productId: string, quantity: number) => {
    if (!supabase) return;
    setBusy(true);
    setFeedback(null);
    try {
      await addLifecycleCartItem(supabase, productId, quantity, null);
      await load();
      setFeedback({ tone: 'success', message: quantity > 0 ? `Cart quantity updated to ${quantity}.` : 'Product removed from cart.' });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Could not update cart', message);
    } finally {
      setBusy(false);
    }
  };

  const checkout = async (paymentMethod: 'cod' | 'external') => {
    if (!supabase) return;
    setBusy(true);
    setFeedback(null);
    try {
      const checkoutId = await saveAddressAndCheckout(supabase, { recipientName, phone, addressLine1, city, stateCode, postalCode, paymentMethod });
      await load();
      setFeedback({ tone: 'success', message: `Checkout ${checkoutId.slice(0, 8)} created. No real payment was attempted.` });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Checkout blocked', message);
    } finally {
      setBusy(false);
    }
  };

  const requestReturn = async (itemId: string) => {
    if (!supabase) return;
    setBusy(true);
    setFeedback(null);
    try {
      await submitLifecycleReturn(supabase, itemId, returnReason);
      await load();
      setFeedback({ tone: 'success', message: 'Return request submitted and persisted.' });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Return blocked', message);
    } finally {
      setBusy(false);
    }
  };

  const uploadUnboxingEvidence = async (item: BuyerOrderItem) => {
    if (!supabase) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFeedback({ tone: 'error', message: 'Media permission is required to attach unboxing evidence.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.82 });
    if (result.canceled) return;
    setBusy(true);
    setFeedback(null);
    try {
      await uploadLifecycleOrderEvidence(supabase, { orderId: item.orderId, orderItemId: item.id, kind: 'unboxing', asset: result.assets[0] });
      await load();
      setFeedback({ tone: 'success', message: 'Private unboxing evidence uploaded and persisted.' });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Unboxing evidence failed', message);
    } finally {
      setBusy(false);
    }
  };

  const cartByProduct = useMemo(() => new Map(cart.map((line) => [line.productId, line])), [cart]);
  const cartTotal = cart.reduce((total, line) => total + line.unitPriceMinor * line.quantity, 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header title="Buyer commerce" subtitle="Open creator referrals, manage the real cart, checkout safely, and request returns." />
      <StateBanner state={state} error={error} onRetry={load} />
      <MutationFeedback feedback={feedback} />
      <Panel title="Creator attribution">
        <Field label="Promotion tracking code" value={trackingCode} onChangeText={setTrackingCode} autoCapitalize="none" />
        <SmallButton label="Apply creator referral" disabled={busy || !trackingCode.trim()} onPress={() => void applyAttribution(trackingCode)} />
      </Panel>
      <Panel title="Marketplace">
        {marketplace.length ? marketplace.map((product) => {
          const line = cartByProduct.get(product.id);
          return (
            <View key={product.id} style={styles.card}>
              <Text style={styles.cardTitle}>{product.title}</Text>
              <Text style={styles.meta}>{product.storefrontName} · {formatMinor(product.salePriceMinor ?? product.priceMinor)} · Available {product.inventory - product.inventoryReserved}</Text>
              <View style={styles.actionRow}>
                <SmallButton label={line ? 'Add one' : 'Add to cart'} disabled={busy} onPress={() => void setQuantity(product.id, (line?.quantity ?? 0) + 1)} />
                {line ? <SmallButton label="Remove one" disabled={busy} onPress={() => void setQuantity(product.id, line.quantity - 1)} /> : null}
                {line ? <SmallButton label="Remove" destructive disabled={busy} onPress={() => void setQuantity(product.id, 0)} /> : null}
              </View>
            </View>
          );
        }) : <Text style={styles.emptyText}>No approved products are live.</Text>}
      </Panel>
      <Panel title="Cart and checkout">
        {cart.length ? cart.map((line) => <View key={line.id} style={styles.cardCompact}><Text style={styles.cardTitle}>{line.title}</Text><Text style={styles.meta}>{line.storefrontName} · Qty {line.quantity} · {formatMinor(line.unitPriceMinor * line.quantity)}{line.promotionCode ? ' · Creator attributed' : ''}</Text></View>) : <Text style={styles.emptyText}>Cart is empty.</Text>}
        <Text style={styles.meta}>Cart subtotal: {formatMinor(cartTotal)} · Backend platform fee applies once per checkout.</Text>
        <Field label="Recipient name" value={recipientName} onChangeText={setRecipientName} />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Field label="Address" value={addressLine1} onChangeText={setAddressLine1} />
        <View style={styles.twoCols}><Field label="City" value={city} onChangeText={setCity} /><Field label="State" value={stateCode} onChangeText={setStateCode} autoCapitalize="characters" /></View>
        <Field label="Postal code" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" />
        <View style={styles.actionRow}><SmallButton label="Checkout external" disabled={busy || !cart.length} onPress={() => void checkout('external')} /><SmallButton label="Checkout COD" disabled={busy || !cart.length} onPress={() => void checkout('cod')} /></View>
      </Panel>
      <Panel title="Buyer orders and returns">
        <Field label="Return reason" value={returnReason} onChangeText={setReturnReason} multiline />
        {buyerItems.length ? buyerItems.map((item) => {
          const unboxing = evidence.find((asset) => asset.orderItemId === item.id && asset.kind === 'unboxing');
          return <View key={item.id} style={styles.card}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.meta}>{item.storefrontName} · {item.orderStatus} · Qty {item.quantity} · {formatMinor(item.subtotalMinor)}</Text><Text style={styles.meta}>Commission {item.commissionStatus} · Return until {item.returnWindowEndsAt ? new Date(item.returnWindowEndsAt).toLocaleDateString() : 'after delivery'}</Text><EvidencePreview evidence={unboxing} emptyLabel="No unboxing evidence attached." /><SmallButton label={unboxing ? 'Replace unboxing evidence' : 'Submit unboxing evidence'} disabled={busy || !['delivered', 'return_requested'].includes(item.orderStatus)} onPress={() => void uploadUnboxingEvidence(item)} /><SmallButton label="Submit return request" disabled={busy || item.orderStatus !== 'delivered'} onPress={() => void requestReturn(item.id)} /></View>;
        }) : <Text style={styles.emptyText}>No buyer order items yet.</Text>}
      </Panel>
      <Panel title="Checkouts">
        {checkouts.length ? checkouts.map((item) => <View key={item.id} style={styles.cardCompact}><Text selectable style={styles.cardTitle}>Checkout {item.id.slice(0, 8)}</Text><Text style={styles.meta}>{item.status} · {item.paymentMethod} · {item.paymentStatus} · {formatMinor(item.totalMinor)}</Text></View>) : <Text style={styles.emptyText}>No checkouts yet.</Text>}
      </Panel>
    </ScrollView>
  );
}

export function AdminProductReviewPanel() {
  const [products, setProducts] = useState<LifecycleProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setFeedback(null);
    try {
      setProducts(await listAdminProductQueue(supabase));
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Could not load products', message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (productId: string, decision: AdminProductDecision) => {
    if (!supabase) return;
    setLoading(true);
    setFeedback(null);
    try {
      await reviewLifecycleProduct(supabase, productId, decision, reasonById[productId] ?? '');
      await load();
      setFeedback({ tone: 'success', message: `Product moved to ${decision.replaceAll('_', ' ')}.` });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Could not review product', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.panel}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={styles.panelTitle}>Product moderation</Text>
          <Text style={styles.meta}>Approved Sellers publish directly. Admin can inspect live/history states, suspend unsafe Products, or reinstate them.</Text>
        </View>
        <Pressable accessibilityRole="button" disabled={loading} onPress={() => void load()} style={styles.iconButton}>
          {loading ? <ActivityIndicator color="#08713d" /> : <RefreshCcw size={16} color="#08713d" />}
        </Pressable>
      </View>
      <MutationFeedback feedback={feedback} />
      {products.length ? products.map((product) => (
        <View key={product.id} style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{product.title}</Text>
              <Text style={styles.meta}>{product.storefrontName} · {formatMinor(product.salePriceMinor ?? product.priceMinor)} · {product.approvalStatus}</Text>
              <Text style={styles.meta}>Commission {product.creatorCommissionBps / 100}% · Inventory {product.inventory - product.inventoryReserved}/{product.inventory}</Text>
              <Text style={styles.meta}>SKU {product.sku || '—'} · Return window {product.returnWindowDays} day(s)</Text>
              <Text style={styles.meta}>{product.description || product.shortDescription || 'No description supplied.'}</Text>
              <Text style={styles.meta}>Media {product.mediaPaths.length}/10 · shared product source</Text>
            </View>
            <StatusPill label={product.approvalStatus} positive={product.approvalStatus === 'approved'} />
          </View>
          {product.mediaItems.length ? (
            <View style={styles.mediaRow}>
              {product.mediaItems.map((item, index) => (
                <LifecycleProductMediaCard
                  key={item.path}
                  item={item}
                  index={index}
                  count={product.mediaItems.length}
                  disabled
                />
              ))}
            </View>
          ) : <Text style={styles.emptyText}>No product media attached. The seller can add it in Advanced Seller Studio.</Text>}
          <Field label="Reason / notes" value={reasonById[product.id] ?? ''} onChangeText={(value) => setReasonById((current) => ({ ...current, [product.id]: value }))} multiline />
          <View style={styles.actionRow}>
            {adminProductDecisionsFor(product.approvalStatus).map((decision) => (
              <SmallButton
                key={decision}
                label={decision === 'approved' ? (product.approvalStatus === 'suspended' ? 'Reinstate' : 'Approve live') : decision.replaceAll('_', ' ')}
                destructive={decision === 'rejected' || decision === 'suspended'}
                disabled={loading}
                onPress={() => void review(product.id, decision)}
              />
            ))}
          </View>
        </View>
      )) : <Text style={styles.emptyText}>No Products require moderation.</Text>}
    </View>
  );
}

export function AdminLifecycleOperationsPanel() {
  const [loading, setLoading] = useState(false);
  const [checkouts, setCheckouts] = useState<AdminCheckout[]>([]);
  const [accessRows, setAccessRows] = useState<AdminBuyerAccess[]>([]);
  const [returns, setReturns] = useState<AdminReturnRequest[]>([]);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setFeedback(null);
    try {
      const [nextCheckouts, nextAccess, nextReturns] = await Promise.all([
        listAdminCheckouts(supabase),
        listAdminBuyerAccess(supabase),
        listAdminReturns(supabase),
      ]);
      setCheckouts(nextCheckouts);
      setAccessRows(nextAccess);
      setReturns(nextReturns);
    } catch (cause) {
      setFeedback({ tone: 'error', message: messageFor(cause) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const mutate = async (operation: () => Promise<void>, success: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      await operation();
      await load();
      setFeedback({ tone: 'success', message: success });
    } catch (cause) {
      const message = messageFor(cause);
      setFeedback({ tone: 'error', message });
      Alert.alert('Admin operation failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.panel}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}><Text style={styles.panelTitle}>Checkout, KYC, and returns test controls</Text><Text style={styles.meta}>Server-authorized controls are available only to Commerce Admin while backend test mode is enabled.</Text></View>
        <Pressable accessibilityRole="button" disabled={loading} onPress={() => void load()} style={styles.iconButton}>{loading ? <ActivityIndicator color="#08713d" /> : <RefreshCcw size={16} color="#08713d" />}</Pressable>
      </View>
      <MutationFeedback feedback={feedback} />
      <Text style={styles.cardTitle}>External checkouts</Text>
      {checkouts.length ? checkouts.map((checkout) => (
        <View key={checkout.id} style={styles.cardCompact}>
          <Text selectable style={styles.cardTitle}>Checkout {checkout.id.slice(0, 8)}</Text>
          <Text selectable style={styles.meta}>Buyer {checkout.buyerId}</Text>
          <Text style={styles.meta}>{checkout.status} · {checkout.paymentMethod} · {checkout.paymentStatus} · {formatMinor(checkout.totalMinor)}</Text>
          {checkout.paymentMethod === 'external' && checkout.paymentStatus === 'external_integration_pending' ? <SmallButton label="Confirm test payment" disabled={loading} onPress={() => void mutate(() => confirmAdminCheckoutPaymentForTest(supabase!, checkout.id), 'Test payment confirmed; seller order is now placed.')} /> : null}
        </View>
      )) : <Text style={styles.emptyText}>No checkout groups yet.</Text>}
      <Text style={styles.cardTitle}>Buyer KYC test review</Text>
      {accessRows.length ? accessRows.map((access) => (
        <View key={access.userId} style={styles.cardCompact}>
          <Text selectable style={styles.meta}>User {access.userId}</Text>
          <Text style={styles.meta}>KYC {access.buyerKycStatus.replaceAll('_', ' ')}</Text>
          <View style={styles.actionRow}>
            {['submitted', 'under_review', 'verified', 'rejected'].map((status) => <SmallButton key={status} label={status.replaceAll('_', ' ')} disabled={loading || access.buyerKycStatus === status} destructive={status === 'rejected'} onPress={() => void mutate(() => setAdminBuyerKycForTest(supabase!, access.userId, status), `Buyer KYC moved to ${status.replaceAll('_', ' ')}.`)} />)}
          </View>
        </View>
      )) : <Text style={styles.emptyText}>No buyer access rows.</Text>}
      <Text style={styles.cardTitle}>Return requests</Text>
      {returns.length ? returns.map((request) => (
        <View key={request.id} style={styles.card}>
          <Text selectable style={styles.cardTitle}>Return {request.id.slice(0, 8)} · {request.status}</Text>
          <Text selectable style={styles.meta}>Buyer {request.buyerId} · Order {request.orderId.slice(0, 8)}</Text>
          <Text style={styles.meta}>{request.reason}</Text>
          <Text style={styles.meta}>Seller decision is required in the buyer/seller Business Chat. Admin can monitor this audit record but does not approve or reject returns.</Text>
        </View>
      )) : <Text style={styles.emptyText}>No return requests yet.</Text>}
    </View>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/commerce')} style={styles.iconButton}>
        <ArrowLeft size={18} color="#08713d" />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function StateBanner({ state, error, onRetry }: { state: LoadState; error: string | null; onRetry: () => Promise<void> }) {
  if (state === 'loading') {
    return <View style={styles.banner}><ActivityIndicator color="#08713d" /><Text style={styles.bannerText}>Loading Creator Commerce state...</Text></View>;
  }
  if (state === 'error') {
    return <View style={styles.errorBanner}><Text selectable style={styles.errorText}>{error}</Text><SmallButton label="Retry" onPress={() => void onRetry()} /></View>;
  }
  return <View style={styles.banner}><CheckCircle2 size={20} color="#08713d" /><Text style={styles.bannerText}>Backend lifecycle state loaded from Supabase.</Text></View>;
}

function MutationFeedback({ feedback }: { feedback: { tone: 'success' | 'error'; message: string } | null }) {
  if (!feedback) return null;
  return (
    <View style={feedback.tone === 'success' ? styles.successBanner : styles.errorBanner}>
      <Text selectable style={feedback.tone === 'success' ? styles.successBannerText : styles.errorText}>{feedback.message}</Text>
    </View>
  );
}

function EvidencePreview({ evidence, emptyLabel }: { evidence?: LifecycleOrderEvidence; emptyLabel: string }) {
  if (!evidence) return <Text style={styles.emptyText}>{emptyLabel}</Text>;
  return (
    <View style={styles.evidencePreview}>
      {evidence.signedUrl && evidence.mimeType?.startsWith('image/') ? <Image source={{ uri: evidence.signedUrl }} resizeMode="cover" style={styles.mediaThumb} /> : null}
      <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{evidence.kind} evidence attached</Text><Text numberOfLines={1} style={styles.meta}>{evidence.fileName ?? evidence.storagePath}</Text></View>
      {evidence.signedUrl ? <SmallButton label="View" onPress={() => void Linking.openURL(evidence.signedUrl!)} /> : null}
    </View>
  );
}

function LifecycleProductMediaCard({
  item,
  index,
  count,
  disabled,
  onCover,
  onEarlier,
  onLater,
  onRemove,
}: {
  item: ProductMediaItem;
  index: number;
  count: number;
  disabled?: boolean;
  onCover?: () => void;
  onEarlier?: () => void;
  onLater?: () => void;
  onRemove?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!supabase) return;
    void resolveLifecycleProductMediaUrl(supabase, item)
      .then((next) => active && setUrl(next))
      .catch(() => active && setUrl(null));
    return () => { active = false; };
  }, [item]);

  return (
    <View style={styles.productMediaCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open Product image ${index + 1}`}
        disabled={!url}
        onPress={() => url && void Linking.openURL(url)}
      >
        {url ? <Image source={{ uri: url }} resizeMode="cover" style={styles.mediaThumb} /> : <View style={[styles.mediaThumb, styles.mediaLoading]}><ActivityIndicator color="#08713d" /></View>}
      </Pressable>
      <Text style={styles.mediaCaption}>{index === 0 ? 'Cover' : `Image ${index + 1}`} · {item.storageBucket === 'product-media' ? 'Private moderation' : 'Legacy public'}</Text>
      {onCover || onEarlier || onLater || onRemove ? (
        <View style={styles.mediaControls}>
          {index > 0 ? <SmallButton label="Cover" disabled={disabled} onPress={() => onCover?.()} /> : null}
          {index > 0 ? <SmallButton label="←" disabled={disabled} onPress={() => onEarlier?.()} /> : null}
          {index < count - 1 ? <SmallButton label="→" disabled={disabled} onPress={() => onLater?.()} /> : null}
          <SmallButton label="Remove" destructive disabled={disabled || count <= 1} onPress={() => onRemove?.()} />
        </View>
      ) : null}
    </View>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.panel}><Text style={styles.panelTitle}>{title}</Text>{children}</View>;
}

function Field({ label, value, onChangeText, multiline, editable = true, keyboardType, autoCapitalize = 'sentences' }: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean; editable?: boolean; keyboardType?: 'default' | 'number-pad' | 'phone-pad'; autoCapitalize?: 'none' | 'sentences' | 'characters' }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} editable={editable} multiline={multiline} keyboardType={keyboardType} autoCapitalize={autoCapitalize} placeholderTextColor="#9aa8a1" style={[styles.input, multiline && styles.multiline, !editable && styles.disabledInput]} />
    </View>
  );
}

function Segment({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <View style={styles.segment}>
      {options.map((option) => (
        <Pressable key={option} accessibilityRole="button" onPress={() => onChange(option)} style={[styles.segmentItem, value === option && styles.segmentItemActive]}>
          <Text style={[styles.segmentText, value === option && styles.segmentTextActive]}>{option}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function SmallButton({ label, onPress, disabled, destructive }: { label: string; onPress: () => void; disabled?: boolean; destructive?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.smallButton, destructive && styles.smallButtonDanger, disabled && styles.disabled]}>
      <Text style={[styles.smallButtonText, destructive && styles.smallButtonTextDanger]}>{label}</Text>
    </Pressable>
  );
}

function StatusPill({ label, positive }: { label: string; positive?: boolean }) {
  return <View style={[styles.statusPill, positive && styles.statusPillPositive]}><Text style={[styles.statusPillText, positive && styles.statusPillTextPositive]}>{label.replaceAll('_', ' ')}</Text></View>;
}

function messageFor(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Unexpected Creator Commerce error.';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  content: { gap: 16, padding: 18, paddingBottom: 56 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f3f5f4', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#111111', fontSize: 28, fontWeight: '900' },
  subtitle: { color: '#7a8780', fontSize: 14, lineHeight: 20 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: '#dcefe2', backgroundColor: '#eff9f2', padding: 14 },
  bannerText: { flex: 1, color: '#3f4d47', fontSize: 13, lineHeight: 19 },
  successBanner: { borderRadius: 18, borderWidth: 1, borderColor: '#bfebce', backgroundColor: '#e7f8ee', padding: 14 },
  successBannerText: { color: '#08713d', fontSize: 13, fontWeight: '800', lineHeight: 19 },
  errorBanner: { gap: 10, borderRadius: 18, borderWidth: 1, borderColor: '#ffd6d2', backgroundColor: '#fff1f0', padding: 14 },
  errorText: { color: '#b42318', fontSize: 13, lineHeight: 19 },
  panel: { gap: 12, borderRadius: 22, borderWidth: 1, borderColor: '#edf0ee', backgroundColor: '#ffffff', padding: 16 },
  panelTitle: { color: '#111111', fontSize: 18, fontWeight: '900' },
  field: { gap: 6 },
  fieldLabel: { color: '#51605a', fontSize: 13, fontWeight: '900' },
  input: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: '#dce7e1', backgroundColor: '#fbfdfc', paddingHorizontal: 12, color: '#111111', fontSize: 14, fontWeight: '700' },
  multiline: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  disabledInput: { opacity: 0.55 },
  twoCols: { flexDirection: 'row', gap: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchText: { color: '#111111', fontSize: 14, fontWeight: '900' },
  pillButton: { borderRadius: 999, borderWidth: 1, borderColor: '#e3ebe7', backgroundColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 8 },
  pillButtonActive: { borderColor: '#bfebce', backgroundColor: '#e7f8ee' },
  pillButtonText: { color: '#667085', fontSize: 12, fontWeight: '900' },
  pillButtonTextActive: { color: '#08713d' },
  primaryButton: { minHeight: 48, borderRadius: 15, backgroundColor: '#08713d', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  loadingButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButton: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: '#dcefe2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryButtonText: { color: '#08713d', fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  card: { gap: 10, borderRadius: 18, borderWidth: 1, borderColor: '#e8eeeb', backgroundColor: '#fbfdfc', padding: 14 },
  cardCompact: { gap: 4, borderRadius: 16, borderWidth: 1, borderColor: '#e8eeeb', backgroundColor: '#fbfdfc', padding: 12 },
  mediaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mediaThumb: { width: 88, height: 72, borderRadius: 12, backgroundColor: '#edf5f0' },
  mediaLoading: { alignItems: 'center', justifyContent: 'center' },
  productMediaCard: { width: 190, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: '#dce9e1', backgroundColor: '#f8fcf9', gap: 6 },
  mediaCaption: { color: '#527060', fontSize: 10, lineHeight: 14 },
  mediaControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  evidencePreview: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: '#dcefe2', backgroundColor: '#f8fbf9', padding: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  cardTitle: { color: '#111111', fontSize: 15, fontWeight: '900' },
  meta: { color: '#667085', fontSize: 12, lineHeight: 18 },
  warningText: { color: '#b42318', fontSize: 12, lineHeight: 18 },
  successText: { color: '#08713d', fontSize: 12, fontWeight: '900', lineHeight: 18 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  smallButton: { minHeight: 36, borderRadius: 12, borderWidth: 1, borderColor: '#dcefe2', backgroundColor: '#eff9f2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  smallButtonDanger: { backgroundColor: '#fff1f0', borderColor: '#ffd6d2' },
  smallButtonText: { color: '#08713d', fontSize: 12, fontWeight: '900', textTransform: 'capitalize' },
  smallButtonTextDanger: { color: '#b42318' },
  statusPill: { borderRadius: 999, backgroundColor: '#eef2f0', paddingHorizontal: 9, paddingVertical: 5 },
  statusPillPositive: { backgroundColor: '#e7f8ee' },
  statusPillText: { color: '#667085', fontSize: 11, fontWeight: '900', textTransform: 'capitalize' },
  statusPillTextPositive: { color: '#08713d' },
  emptyText: { color: '#667085', fontSize: 13, lineHeight: 20 },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segmentItem: { borderRadius: 999, borderWidth: 1, borderColor: '#e3ebe7', backgroundColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 8 },
  segmentItemActive: { borderColor: '#bfebce', backgroundColor: '#e7f8ee' },
  segmentText: { color: '#667085', fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: '#08713d' },
});
