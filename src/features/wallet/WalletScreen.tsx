import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ActivityIndicator, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { Bolt, Camera, Check, Copy, History, QrCode, Send, ShieldCheck, UsersRound, X } from "lucide-react-native";

import { formatCoins, type RewardHistoryItem, type RewardNetwork, type RewardRepository, type RewardSnapshot, type WalletContact, unavailableRewardRepository } from "./rewardRepository";

const coinInputToMicrounits = (value: string) => {
  const clean = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(clean)) return null;
  const [whole, fraction = ""] = clean.split(".");
  const amount = Number(whole) * 1_000_000 + Number((fraction + "000000").slice(0, 6));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
};

const readWalletRecipient = (raw: string) => {
  try {
    const parsed = new URL(raw);
    const id = parsed.searchParams.get("user");
    return parsed.protocol === "social24:" && parsed.hostname === "wallet" && parsed.pathname === "/receive" ? id : null;
  } catch { return null; }
};

export default function WalletScreen({ repository = unavailableRewardRepository }: { repository?: RewardRepository }) {
  const [snapshot, setSnapshot] = useState<RewardSnapshot | null>(null);
  const [history, setHistory] = useState<RewardHistoryItem[]>([]);
  const [network, setNetwork] = useState<RewardNetwork>({ totalFriends: 0, activeFriends: 0, bonusBps: 0 });
  const [lifetimeMined, setLifetimeMined] = useState(0);
  const [contacts, setContacts] = useState<WalletContact[]>([]);
  const [receiveCode, setReceiveCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const load = useCallback(async () => {
    if (!repository.available) { setLoading(false); return; }
    try {
      setError(null);
      const [next, nextHistory, nextLifetime, nextNetwork, nextContacts, nextCode] = await Promise.all([
        repository.getSnapshot(), repository.getHistory(), repository.getLifetimeMinedMicrounits(),
        repository.getNetwork(), repository.getContacts(), repository.getReceiveCode(),
      ]);
      setSnapshot(next); setHistory(nextHistory); setLifetimeMined(nextLifetime); setNetwork(nextNetwork); setContacts(nextContacts); setReceiveCode(nextCode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet could not be loaded.");
    } finally { setLoading(false); }
  }, [repository]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    const refresh = setInterval(() => void load(), 30_000);
    return () => { clearInterval(timer); clearInterval(refresh); };
  }, [load]);

  const active = Boolean(snapshot?.activeSessionId && snapshot.endsAt && new Date(snapshot.endsAt).getTime() > now);
  const remaining = active && snapshot?.endsAt ? Math.max(0, new Date(snapshot.endsAt).getTime() - now) : 0;
  const estimatedPending = useMemo(() => {
    if (!snapshot?.startedAt || !snapshot.endsAt || !snapshot.activeSessionId) return 0;
    const anchor = new Date(snapshot.serverNow).getTime();
    const effectiveNow = Math.min(new Date(snapshot.endsAt).getTime(), anchor + Math.max(0, now - anchor));
    return Math.floor(snapshot.rateMicrounitsPerHour * Math.max(0, effectiveNow - new Date(snapshot.startedAt).getTime()) / 3_600_000);
  }, [now, snapshot]);

  const start = async () => {
    if (starting || active) return;
    setStarting(true);
    try { setSnapshot(await repository.startSession()); setNow(Date.now()); setError(null); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Mining session could not start."); }
    finally { setStarting(false); }
  };
  const sendCoins = async () => {
    const value = coinInputToMicrounits(amount);
    if (!recipientId) return Alert.alert("Choose a friend", "Select a Social24 friend or scan their receive QR.");
    if (!value) return Alert.alert("Invalid amount", "Enter a positive amount with up to six decimal places.");
    setSending(true);
    try {
      await repository.transferCoins({ recipientId, amountMicrounits: value, note });
      setShowSend(false); setAmount(""); setNote(""); setRecipientId(null);
      await load(); Alert.alert("Coins sent", "The transfer is recorded in both Social24 wallets.");
    } catch (cause) { Alert.alert("Transfer not sent", cause instanceof Error ? cause.message : "Please try again."); }
    finally { setSending(false); }
  };
  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) return Alert.alert("Camera permission needed", "Allow camera access to scan a Social24 Wallet QR.");
    }
    setShowScanner(true);
  };
  const scanReceiveCode = ({ data }: { data: string }) => {
    const id = readWalletRecipient(data);
    if (!id) return Alert.alert("Not a Social24 Wallet QR", "Scan a QR generated from a Social24 Wallet receive screen.");
    setRecipientId(id); setShowScanner(false);
  };

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View><Text style={styles.title}>Wallet</Text><Text style={styles.subtitle}>Mine, send, and receive Social24 Coins.</Text></View>
      <View style={styles.hero}>
        <View style={styles.heroHead}><View><Text style={styles.heroLabel}>MINED COINS</Text><Text style={styles.mined}>{loading ? "—" : formatCoins(lifetimeMined)}</Text><Text style={styles.heroCaption}>Lifetime personally mined</Text></View><Pressable accessibilityRole="button" accessibilityLabel={active ? "Mining session active" : "Start a 24-hour mining session"} onPress={() => void start()} disabled={starting || !repository.available} style={[styles.bolt, (starting || !repository.available) && styles.disabled]}>{starting ? <ActivityIndicator color="#073f24" /> : <Bolt color="#073f24" size={24} fill="#073f24" />}</Pressable></View>
        <View style={styles.heroFoot}><View><Text style={styles.totalLabel}>TOTAL BALANCE</Text><Text style={styles.total}>{formatCoins((snapshot?.confirmedBalanceMicrounits ?? 0) + (active ? estimatedPending : 0))}</Text></View><View style={styles.mineState}><Text style={styles.mineStateText}>{active ? `${formatRemaining(remaining)} left` : "⚡ Start Mining"}</Text><Text style={styles.rate}>{formatCoins(snapshot?.rateMicrounitsPerHour ?? 0)}/hour</Text></View></View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.quickRow}><QuickAction icon={Send} label="Send Coins" onPress={() => setShowSend(true)} /><QuickAction icon={QrCode} label="Receive via QR" onPress={() => setShowReceive(true)} /></View>
      <View style={styles.card}><View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>Friend Circle</Text><Text style={styles.sectionHint}>{network.activeFriends} / {network.totalFriends} friends mining now</Text></View><UsersRound color="#08713d" size={25} /></View><View style={styles.avatarRow}>{contacts.slice(0, 6).map((contact) => <View key={contact.id} style={styles.avatar}><Text style={styles.avatarText}>{contact.name.slice(0, 1).toUpperCase()}</Text></View>)}{!contacts.length ? <Text style={styles.empty}>Connect with friends in Nearby People to build your circle.</Text> : null}</View><Text style={styles.networkText}>Current network boost: +{(network.bonusBps / 100).toFixed(0)}%. It uses active friends and network size, with a server-set cap.</Text></View>
      <View style={styles.notice}><ShieldCheck color="#08713d" size={21} /><Text style={styles.noticeText}>Social24 Coins are in-app reward points, not cash, cryptocurrency, or a guaranteed redeemable asset.</Text></View>
      <View style={styles.card}><Text style={styles.sectionTitle}>Recent activity</Text>{history.length ? history.slice(0, 10).map((item) => <HistoryRow key={item.id} item={item} />) : <Text style={styles.empty}>Mining and transfers will appear here.</Text>}</View>
    </ScrollView>
    <SendModal visible={showSend} contacts={contacts} recipientId={recipientId} amount={amount} note={note} sending={sending} onClose={() => setShowSend(false)} onRecipient={setRecipientId} onAmount={setAmount} onNote={setNote} onScan={() => void openScanner()} onSend={() => void sendCoins()} />
    <ReceiveModal visible={showReceive} code={receiveCode} onClose={() => setShowReceive(false)} />
    <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}><SafeAreaView style={styles.scanner}><View style={styles.scannerHeader}><Text style={styles.scannerTitle}>Scan Social24 Wallet QR</Text><Pressable onPress={() => setShowScanner(false)} accessibilityRole="button"><X color="#fff" size={27} /></Pressable></View><CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={scanReceiveCode} /><Text style={styles.scannerHint}>Point the camera at a friend’s Social24 Wallet receive QR.</Text></SafeAreaView></Modal>
  </SafeAreaView>;
}

function QuickAction({ icon: Icon, label, onPress }: { icon: typeof Send; label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" onPress={onPress} style={styles.quick}><View style={styles.quickIcon}><Icon size={22} color="#08713d" /></View><Text style={styles.quickLabel}>{label}</Text></Pressable>; }
function HistoryRow({ item }: { item: RewardHistoryItem }) { const positive = item.amountMicrounits >= 0; return <View style={styles.history}><History color="#08713d" size={19} /><View style={styles.grow}><Text style={styles.historyTitle}>{item.description}</Text><Text style={styles.historyDate}>{new Date(item.createdAt).toLocaleString()}</Text></View><Text style={[styles.historyAmount, !positive && styles.negative]}>{positive ? "+" : ""}{formatCoins(item.amountMicrounits)}</Text></View>; }
function SendModal({ visible, contacts, recipientId, amount, note, sending, onClose, onRecipient, onAmount, onNote, onScan, onSend }: { visible: boolean; contacts: WalletContact[]; recipientId: string | null; amount: string; note: string; sending: boolean; onClose: () => void; onRecipient: (id: string) => void; onAmount: (value: string) => void; onNote: (value: string) => void; onScan: () => void; onSend: () => void }) { return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}><View style={styles.modalShade}><View style={styles.modal}><View style={styles.modalHead}><Text style={styles.modalTitle}>Send Social24 Coins</Text><Pressable accessibilityRole="button" onPress={onClose}><X size={23} color="#1d2a22" /></Pressable></View><Text style={styles.fieldLabel}>Choose a friend</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contactRow}>{contacts.map((contact) => <Pressable key={contact.id} onPress={() => onRecipient(contact.id)} style={[styles.contact, recipientId === contact.id && styles.contactSelected]}><Text style={styles.contactInitial}>{contact.name.slice(0, 1).toUpperCase()}</Text><Text numberOfLines={1} style={styles.contactName}>{contact.name}</Text></Pressable>)}{!contacts.length ? <Text style={styles.empty}>No accepted Social24 friends yet.</Text> : null}</ScrollView><Pressable onPress={onScan} style={styles.scan}><Camera color="#08713d" size={19} /><Text style={styles.scanText}>Scan friend’s Wallet QR</Text></Pressable><Text style={styles.fieldLabel}>Coin amount</Text><TextInput value={amount} onChangeText={onAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#95a39a" style={styles.input} /><Text style={styles.fieldLabel}>Note (optional)</Text><TextInput value={note} onChangeText={onNote} placeholder="For you" placeholderTextColor="#95a39a" style={styles.input} maxLength={140} /><Pressable disabled={sending} onPress={onSend} style={[styles.primary, sending && styles.disabled]}>{sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Confirm transfer</Text>}</Pressable></View></View></Modal>; }
function ReceiveModal({ visible, code, onClose }: { visible: boolean; code: string | null; onClose: () => void }) { const [copied, setCopied] = useState(false); const copy = async () => { if (!code) return; await Clipboard.setStringAsync(code); setCopied(true); setTimeout(() => setCopied(false), 1_800); }; return <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}><View style={styles.modalShade}><View style={styles.modal}><View style={styles.modalHead}><Text style={styles.modalTitle}>Receive Social24 Coins</Text><Pressable accessibilityRole="button" onPress={onClose}><X size={23} color="#1d2a22" /></Pressable></View>{code ? <View style={styles.qr}><QRCode value={code} size={210} backgroundColor="#fff" color="#0b3921" /></View> : <ActivityIndicator color="#08713d" />}<Text style={styles.receiveText}>Ask a friend to scan this QR from their Wallet. It contains only your Social24 account ID.</Text><Pressable onPress={() => void copy()} style={styles.scan}>{copied ? <Check color="#08713d" size={19} /> : <Copy color="#08713d" size={19} />}<Text style={styles.scanText}>{copied ? "Copied" : "Copy receive code"}</Text></Pressable></View></View></Modal>; }
function formatRemaining(ms: number) { const seconds = Math.floor(ms / 1_000); return `${Math.floor(seconds / 3_600).toString().padStart(2, "0")}:${Math.floor(seconds % 3_600 / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7faf8" }, content: { padding: 18, gap: 16, paddingBottom: 42 }, title: { color: "#101b15", fontSize: 34, fontWeight: "900" }, subtitle: { color: "#657169", marginTop: 5 }, hero: { backgroundColor: "#04a953", borderRadius: 28, padding: 22, gap: 26, shadowColor: "#035c2e", shadowOpacity: .18, shadowRadius: 12, elevation: 4 }, heroHead: { flexDirection: "row", justifyContent: "space-between" }, heroLabel: { color: "#dfffea", letterSpacing: 1.1, fontWeight: "900", fontSize: 12 }, mined: { color: "#fff", fontSize: 40, fontWeight: "900", marginTop: 4 }, heroCaption: { color: "#dfffea", marginTop: 2 }, bolt: { width: 54, height: 54, borderRadius: 19, backgroundColor: "#b9f3d2", alignItems: "center", justifyContent: "center" }, heroFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }, totalLabel: { color: "#dfffea", fontSize: 11, fontWeight: "900" }, total: { color: "#fff", fontSize: 25, fontWeight: "900", marginTop: 3 }, mineState: { alignItems: "flex-end" }, mineStateText: { color: "#073f24", fontWeight: "900", backgroundColor: "#e0f8e8", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }, rate: { color: "#dfffea", fontSize: 12, fontWeight: "700", marginTop: 6 }, quickRow: { flexDirection: "row", gap: 12 }, quick: { flex: 1, minHeight: 88, borderWidth: 1, borderColor: "#dce7e0", backgroundColor: "#fff", borderRadius: 22, padding: 14, flexDirection: "row", gap: 10, alignItems: "center" }, quickIcon: { width: 39, height: 39, borderRadius: 14, backgroundColor: "#e9f9ef", alignItems: "center", justifyContent: "center" }, quickLabel: { flex: 1, color: "#1b2a20", fontWeight: "900", fontSize: 15 }, card: { padding: 18, gap: 13, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe9e3", borderRadius: 24 }, sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, sectionTitle: { color: "#17231c", fontSize: 19, fontWeight: "900" }, sectionHint: { color: "#657169", marginTop: 3 }, avatarRow: { flexDirection: "row", minHeight: 50, alignItems: "center" }, avatar: { width: 43, height: 43, borderRadius: 22, marginRight: -8, borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center", backgroundColor: "#c8f1d7" }, avatarText: { color: "#08713d", fontWeight: "900" }, networkText: { color: "#526158", lineHeight: 19, fontSize: 13 }, notice: { padding: 16, borderRadius: 20, backgroundColor: "#effaf3", flexDirection: "row", gap: 11, alignItems: "flex-start" }, noticeText: { flex: 1, color: "#526158", lineHeight: 20, fontSize: 13 }, history: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e2e7e4" }, grow: { flex: 1 }, historyTitle: { color: "#233129", fontWeight: "800" }, historyDate: { color: "#748078", fontSize: 11, marginTop: 3 }, historyAmount: { color: "#07934a", fontWeight: "900" }, negative: { color: "#b42318" }, empty: { color: "#748078", lineHeight: 20 }, error: { color: "#b42318", fontWeight: "700" }, disabled: { opacity: .5 }, modalShade: { flex: 1, backgroundColor: "rgba(4,21,12,.48)", justifyContent: "flex-end" }, modal: { maxHeight: "88%", padding: 22, gap: 12, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: "#fff" }, modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, modalTitle: { color: "#17231c", fontWeight: "900", fontSize: 22 }, fieldLabel: { color: "#526158", fontWeight: "800", marginTop: 3 }, contactRow: { gap: 9, paddingVertical: 2 }, contact: { width: 84, padding: 9, borderRadius: 14, borderWidth: 1, borderColor: "#dce7e0", alignItems: "center", gap: 4 }, contactSelected: { borderColor: "#08713d", backgroundColor: "#eaf9ef" }, contactInitial: { color: "#08713d", fontSize: 18, fontWeight: "900" }, contactName: { color: "#45564c", fontSize: 11, fontWeight: "800", maxWidth: 70 }, scan: { minHeight: 46, borderRadius: 14, backgroundColor: "#effaf3", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 14 }, scanText: { color: "#08713d", fontWeight: "900" }, input: { minHeight: 48, paddingHorizontal: 13, borderRadius: 14, borderWidth: 1, borderColor: "#d5e1da", color: "#17231c", fontSize: 16 }, primary: { minHeight: 52, marginTop: 8, borderRadius: 16, backgroundColor: "#08713d", alignItems: "center", justifyContent: "center" }, primaryText: { color: "#fff", fontSize: 16, fontWeight: "900" }, qr: { alignItems: "center", paddingVertical: 13, backgroundColor: "#f4faf6", borderRadius: 18 }, receiveText: { color: "#526158", lineHeight: 20, textAlign: "center" }, scanner: { flex: 1, backgroundColor: "#071a0f" }, scannerHeader: { padding: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, scannerTitle: { color: "#fff", fontSize: 18, fontWeight: "900" }, camera: { flex: 1 }, scannerHint: { padding: 20, color: "#d8f4e3", textAlign: "center", lineHeight: 21 },
});
