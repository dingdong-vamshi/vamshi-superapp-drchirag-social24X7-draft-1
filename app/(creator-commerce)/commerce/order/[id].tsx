import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, PackageCheck } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { supabase } from '../../../../src/lib/supabase';

type OrderDetail = {
  id: string;
  status: string;
  currency: string;
  subtotal_minor: number;
  total_minor: number;
  payment_method: string;
  payment_status: string;
  created_at: string;
  storefronts: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

type OrderItem = {
  id: string;
  product_title_snapshot: string;
  quantity: number;
  unit_price_minor: number;
  subtotal_minor: number;
};

type Fulfillment = {
  status: string;
  carrier: string | null;
  tracking_number: string | null;
  package_reference: string | null;
  customer_note: string | null;
};

const money = (minor: number, currency: string) => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency,
}).format(minor / 100);

export default function CommerceOrderDetailPage() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [fulfillment, setFulfillment] = useState<Fulfillment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !id) {
      setError('Order is unavailable.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [orderResult, itemResult, fulfillmentResult] = await Promise.all([
      supabase
        .from('orders')
        .select('id,status,currency,subtotal_minor,total_minor,payment_method,payment_status,created_at,storefronts!orders_storefront_id_fkey(name,slug)')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('order_items')
        .select('id,product_title_snapshot,quantity,unit_price_minor,subtotal_minor')
        .eq('order_id', id)
        .order('created_at'),
      supabase
        .from('order_fulfillments')
        .select('status,carrier,tracking_number,package_reference,customer_note')
        .eq('order_id', id)
        .maybeSingle(),
    ]);
    const failure = orderResult.error || itemResult.error || fulfillmentResult.error;
    if (failure) {
      setError(failure.message);
    } else if (!orderResult.data) {
      setError('This order does not exist or your account is not authorized to view it.');
    } else {
      setOrder(orderResult.data as OrderDetail);
      setItems((itemResult.data as OrderItem[] | null) ?? []);
      setFulfillment((fulfillmentResult.data as Fulfillment | null) ?? null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const storefront = Array.isArray(order?.storefronts) ? order?.storefronts[0] : order?.storefronts;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace(from === 'chats' ? '/chats' : '/commerce/buyer')} style={styles.back}>
          <ArrowLeft color="#087c43" size={24} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Order details</Text>
          <Text style={styles.subtitle}>Authoritative status from Creator Commerce</Text>
        </View>
      </View>

      {loading ? <ActivityIndicator color="#087c43" /> : null}
      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      ) : null}
      {order ? (
        <>
          <View style={styles.statusCard}>
            <PackageCheck color="#087c43" size={24} />
            <View>
              <Text style={styles.status}>{order.status.replaceAll('_', ' ')}</Text>
              <Text style={styles.meta}>{storefront?.name ?? 'Store'} · #{order.id.slice(0, 8)}</Text>
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Items</Text>
            {items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemCopy}>
                  <Text style={styles.itemTitle}>{item.product_title_snapshot}</Text>
                  <Text style={styles.meta}>{item.quantity} × {money(item.unit_price_minor, order.currency)}</Text>
                </View>
                <Text style={styles.itemTotal}>{money(item.subtotal_minor, order.currency)}</Text>
              </View>
            ))}
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.total}>{money(order.total_minor, order.currency)}</Text></View>
            <Text style={styles.meta}>{order.payment_method.toUpperCase()} · {order.payment_status.replaceAll('_', ' ')}</Text>
          </View>
          {fulfillment ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Fulfillment</Text>
              <Text style={styles.itemTitle}>{fulfillment.status.replaceAll('_', ' ')}</Text>
              {fulfillment.carrier ? <Text style={styles.meta}>Carrier: {fulfillment.carrier}</Text> : null}
              {fulfillment.tracking_number ? <Text style={styles.meta}>Tracking: {fulfillment.tracking_number}</Text> : null}
              {fulfillment.package_reference ? <Text style={styles.meta}>Package: {fulfillment.package_reference}</Text> : null}
              {fulfillment.customer_note ? <Text style={styles.meta}>{fulfillment.customer_note}</Text> : null}
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { minHeight: '100%', padding: 20, gap: 16, backgroundColor: '#fbfdfb' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f2' },
  headerCopy: { flex: 1 },
  title: { color: '#101713', fontSize: 28, fontWeight: '900' },
  subtitle: { color: '#68766e', fontSize: 14 },
  errorCard: { borderRadius: 16, padding: 16, gap: 12, backgroundColor: '#fff1f0', borderWidth: 1, borderColor: '#ffc9c5' },
  errorText: { color: '#b42318' },
  retry: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#ffffff' },
  retryText: { color: '#087c43', fontWeight: '800' },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 18, backgroundColor: '#edf9f1', borderWidth: 1, borderColor: '#d4ecdc' },
  status: { color: '#102a1b', fontSize: 20, fontWeight: '900', textTransform: 'capitalize' },
  card: { borderRadius: 18, padding: 18, gap: 10, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e0e9e3' },
  sectionTitle: { color: '#18251d', fontSize: 18, fontWeight: '900' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#edf1ee' },
  itemCopy: { flex: 1 },
  itemTitle: { color: '#17241c', fontSize: 15, fontWeight: '800', textTransform: 'capitalize' },
  itemTotal: { color: '#17241c', fontSize: 14, fontWeight: '800' },
  meta: { color: '#67756c', fontSize: 13 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 },
  totalLabel: { color: '#17241c', fontSize: 16, fontWeight: '800' },
  total: { color: '#087c43', fontSize: 18, fontWeight: '900' },
});
