import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ActivityIndicator, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { Bolt, Camera, Check, Copy, History, MessageCircle, QrCode, Send, ShieldCheck, UserRound, UsersRound, X } from "lucide-react-native";

import { coinInputToMicrounits, createTransferIdempotencyKey, formatCoins, readWalletRecipient, type RewardHistoryItem, type RewardNetwork, type RewardRepository, type RewardSnapshot, type WalletContact, unavailableRewardRepository } from "./rewardRepository";

export default function WalletScreen({ repository = unavailableRewardRepository }: { repository?: RewardRepository }) {
  const [snapshot, setSnapshot] = useState<RewardSnapshot | null>(null);
  const [history, setHistory] = useState<RewardHistoryItem[]>([]);
  const [network, setNetwork] = useState<RewardNetwork>({ totalReferred: 0, activeReferred: 0, bonusBps: 0, referralCode: "" });
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
  const [showFriends, setShowFriends] = useState(false);
  const [showReferralFriends, setShowReferralFriends] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const sendingRef = useRef(false);
  const transferIdempotencyKeyRef = useRef<string | null>(null);

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
  const start = async () => {
    if (starting || active) return;
    setStarting(true);
    try { setSnapshot(await repository.startSession()); setNow(Date.now()); setError(null); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Mining session could not start."); }
    finally { setStarting(false); }
  };
  const sendCoins = async () => {
    if (sendingRef.current) return;
    const value = coinInputToMicrounits(amount);
    if (!recipientId) return Alert.alert("Choose a friend", "Select a Social24 friend or scan their receive QR.");
    if (!value) return Alert.alert("Invalid amount", "Enter a positive amount with up to six decimal places.");
    sendingRef.current = true;
    setSending(true);
    try {
      transferIdempotencyKeyRef.current ??= createTransferIdempotencyKey();
      await repository.transferCoins({ recipientId, amountMicrounits: value, note, idempotencyKey: transferIdempotencyKeyRef.current });
      setShowSend(false); setAmount(""); setNote(""); setRecipientId(null);
      transferIdempotencyKeyRef.current = null;
      await load(); Alert.alert("Coins sent", "The transfer is recorded in both Social24 wallets.");
    } catch (cause) { Alert.alert("Transfer not sent", cause instanceof Error ? cause.message : "Please try again."); }
    finally { sendingRef.current = false; setSending(false); }
  };
  const copyReferralInvite = async () => {
    if (!network.referralCode) return;
    await Clipboard.setStringAsync(`social24://signup?ref=${encodeURIComponent(network.referralCode)}`);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2_000);
  };
  const shareReferralInvite = async (contact: WalletContact) => {
    if (!network.referralCode) return;
    try {
      const referralUrl = `social24://signup?ref=${encodeURIComponent(network.referralCode)}`;
      const conversationId = await repository.shareReferralToChat(contact.id, referralUrl);
      setShowReferralFriends(false);
      router.push({ pathname: "/chats", params: { conversationId } });
    } catch (cause) {
      Alert.alert("Invite not shared", cause instanceof Error ? cause.message : "Please try again.");
    }
  };
  const openScanner = async () => {
    setShowSend(false);
    setScannerError(null);
    if (Platform.OS === "web" && typeof window !== "undefined" && !window.isSecureContext) {
      setShowSend(true);
      return Alert.alert("Secure camera required", "Open the deployed HTTPS app on your phone to scan a Wallet QR. Browsers block camera access on non-secure LAN links.");
    }
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        setShowSend(true);
        return Alert.alert("Camera permission needed", "Allow camera access to scan a Social24 Wallet QR.");
      }
    }
    setShowScanner(true);
  };
  const scanReceiveCode = ({ data }: { data: string }) => {
    const id = readWalletRecipient(data);
    if (!id) return Alert.alert("Not a Social24 Wallet QR", "Scan a QR generated from a Social24 Wallet receive screen.");
    setRecipientId(id); setShowScanner(false); setShowSend(true);
  };
  const closeScanner = () => { setShowScanner(false); setShowSend(true); };
  const chooseFriend = (contact: WalletContact) => {
    setRecipientId(contact.id);
    setShowFriends(false);
    setShowSend(true);
  };
  const openFriendChat = async (contact: WalletContact) => {
    try {
      const conversationId = await repository.openChat(contact.id);
      setShowFriends(false);
      router.push({ pathname: "/chats", params: { conversationId } });
    } catch (cause) {
      Alert.alert("Chat unavailable", cause instanceof Error ? cause.message : "Please try again.");
    }
  };

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View><Text style={styles.title}>Wallet</Text><Text style={styles.subtitle}>Mine, send, and receive Social24 Coins.</Text></View>
      <View style={styles.hero}>
        <View style={styles.heroHead}><View><Text style={styles.heroLabel}>MINED COINS</Text><Text style={styles.mined}>{loading ? "—" : formatCoins(lifetimeMined)}</Text><Text style={styles.heroCaption}>Lifetime personally mined</Text></View><Pressable accessibilityRole="button" accessibilityLabel={active ? "Mining session active" : "Start a 24-hour mining session"} onPress={() => void start()} disabled={starting || !repository.available} style={[styles.bolt, (starting || !repository.available) && styles.disabled]}>{starting ? <ActivityIndicator color="#073f24" /> : <Bolt color="#073f24" size={24} fill="#073f24" />}</Pressable></View>
        <View style={styles.heroFoot}><View><Text style={styles.totalLabel}>TOTAL BALANCE</Text><Text style={styles.total}>{formatCoins(snapshot?.confirmedBalanceMicrounits ?? 0)}</Text><Text style={styles.heroCaption}>Confirmed ledger balance</Text></View><View style={styles.mineState}><Text style={styles.mineStateText}>{active ? `⚡ ${formatRemaining(remaining)} left` : "⚡ Start Mining"}</Text><Text style={styles.rate}>{formatCoins(snapshot?.rateMicrounitsPerHour ?? 0)}/hour</Text><Text style={styles.rate}>{active ? "Reward credits after this session" : "Start a 24-hour session"}</Text></View></View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.quickRow}><QuickAction icon={Send} label="Send Coins" onPress={() => setShowSend(true)} /><QuickAction icon={QrCode} label="Receive via QR" onPress={() => setShowReceive(true)} /></View>
      <View style={styles.card}><View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>Referral mining</Text><Text style={styles.sectionHint}>{network.activeReferred} / {network.totalReferred} referred people mining now</Text></View><UsersRound color="#08713d" size={25} /></View><Text style={styles.networkText}>Current mining boost: +{(network.bonusBps / 100).toFixed(0)}%. It reflects real referral sign-ups with active mining sessions, with a server-set cap.</Text><Pressable accessibilityRole="button" onPress={() => void copyReferralInvite()} disabled={!network.referralCode} style={[styles.scan, !network.referralCode && styles.disabled]}>{inviteCopied ? <Check color="#08713d" size={19} /> : <Copy color="#08713d" size={19} />}<Text accessibilityLiveRegion="polite" style={styles.scanText}>{inviteCopied ? "Copied ✓" : "Copy referral link"}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setShowReferralFriends(true)} disabled={!network.referralCode || !contacts.length} style={[styles.scan, (!network.referralCode || !contacts.length) && styles.disabled]}><MessageCircle color="#08713d" size={19} /><Text style={styles.scanText}>Share with a friend</Text></Pressable></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Open Wallet friends" onPress={() => setShowFriends(true)} style={styles.card}><View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>Friends</Text><Text style={styles.sectionHint}>{contacts.length ? `${contacts.length} accepted friend${contacts.length === 1 ? "" : "s"} · Tap to open` : "Friends and referrals are separate"}</Text></View><UsersRound color="#08713d" size={25} /></View><View style={styles.avatarRow}>{contacts.slice(0, 6).map((contact) => <View key={contact.id} style={styles.avatar}><Text style={styles.avatarText}>{contact.name.slice(0, 1).toUpperCase()}</Text></View>)}{!contacts.length ? <Text style={styles.empty}>Connect with friends in Nearby People to send coins.</Text> : null}</View></Pressable>
      <View style={styles.notice}><ShieldCheck color="#08713d" size={21} /><Text style={styles.noticeText}>Social24 Coins are in-app reward points, not cash, cryptocurrency, or a guaranteed redeemable asset.</Text></View>
      <View style={styles.card}><Text style={styles.sectionTitle}>Recent activity</Text>{history.length ? history.slice(0, 10).map((item) => <HistoryRow key={item.id} item={item} />) : <Text style={styles.empty}>Mining and transfers will appear here.</Text>}</View>
    </ScrollView>
    <SendModal visible={showSend} contacts={contacts} recipientId={recipientId} amount={amount} note={note} sending={sending} onClose={() => setShowSend(false)} onRecipient={setRecipientId} onAmount={setAmount} onNote={setNote} onScan={() => void openScanner()} onSend={() => void sendCoins()} />
    <FriendsModal visible={showFriends} contacts={contacts} close={() => setShowFriends(false)} send={chooseFriend} profile={(contact) => { setShowFriends(false); router.push({ pathname: "/social-profile", params: { userId: contact.id } }); }} chat={(contact) => void openFriendChat(contact)} />
    <ReferralShareModal visible={showReferralFriends} contacts={contacts} close={() => setShowReferralFriends(false)} share={(contact) => void shareReferralInvite(contact)} />
    <ReceiveModal visible={showReceive} code={receiveCode} onClose={() => setShowReceive(false)} />
    <Modal visible={showScanner} animationType="slide" onRequestClose={closeScanner}><SafeAreaView style={styles.scanner}><View style={styles.scannerHeader}><Text style={styles.scannerTitle}>Scan Social24 Wallet QR</Text><Pressable onPress={closeScanner} accessibilityRole="button"><X color="#fff" size={27} /></Pressable></View><CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onMountError={(event) => setScannerError(event.message || "The camera could not start.")} onBarcodeScanned={scanReceiveCode} />{scannerError ? <Text accessibilityLiveRegion="assertive" style={styles.scannerError}>{scannerError}</Text> : null}<Text style={styles.scannerHint}>Point the camera at a friend’s Social24 Wallet receive QR.</Text></SafeAreaView></Modal>
  </SafeAreaView>;
}

function QuickAction({ icon: Icon, label, onPress }: { icon: typeof Send; label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" onPress={onPress} style={styles.quick}><View style={styles.quickIcon}><Icon size={22} color="#08713d" /></View><Text style={styles.quickLabel}>{label}</Text></Pressable>; }
function HistoryRow({ item }: { item: RewardHistoryItem }) { const positive = item.amountMicrounits >= 0; return <View style={styles.history}><History color="#08713d" size={19} /><View style={styles.grow}><Text style={styles.historyTitle}>{item.description}</Text><Text style={styles.historyDate}>{new Date(item.createdAt).toLocaleString()}</Text></View><Text style={[styles.historyAmount, !positive && styles.negative]}>{positive ? "+" : ""}{formatCoins(item.amountMicrounits)}</Text></View>; }
function SendModal({ visible, contacts, recipientId, amount, note, sending, onClose, onRecipient, onAmount, onNote, onScan, onSend }: { visible: boolean; contacts: WalletContact[]; recipientId: string | null; amount: string; note: string; sending: boolean; onClose: () => void; onRecipient: (id: string) => void; onAmount: (value: string) => void; onNote: (value: string) => void; onScan: () => void; onSend: () => void }) { return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}><View style={styles.modalShade}><View style={styles.modal}><View style={styles.modalHead}><Text style={styles.modalTitle}>Send Social24 Coins</Text><Pressable accessibilityRole="button" onPress={onClose}><X size={23} color="#1d2a22" /></Pressable></View><Text style={styles.fieldLabel}>Choose a friend</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contactRow}>{contacts.map((contact) => <Pressable key={contact.id} onPress={() => onRecipient(contact.id)} style={[styles.contact, recipientId === contact.id && styles.contactSelected]}><Text style={styles.contactInitial}>{contact.name.slice(0, 1).toUpperCase()}</Text><Text numberOfLines={1} style={styles.contactName}>{contact.name}</Text></Pressable>)}{!contacts.length ? <Text style={styles.empty}>No accepted Social24 friends yet.</Text> : null}</ScrollView><Pressable onPress={onScan} style={styles.scan}><Camera color="#08713d" size={19} /><Text style={styles.scanText}>Scan friend’s Wallet QR</Text></Pressable><Text style={styles.fieldLabel}>Coin amount</Text><TextInput value={amount} onChangeText={onAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#95a39a" style={styles.input} /><Text style={styles.fieldLabel}>Note (optional)</Text><TextInput value={note} onChangeText={onNote} placeholder="For you" placeholderTextColor="#95a39a" style={styles.input} maxLength={140} /><Pressable disabled={sending} onPress={onSend} style={[styles.primary, sending && styles.disabled]}>{sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Confirm transfer</Text>}</Pressable></View></View></Modal>; }
function ReceiveModal({ visible, code, onClose }: { visible: boolean; code: string | null; onClose: () => void }) { const [copied, setCopied] = useState(false); const copy = async () => { if (!code) return; await Clipboard.setStringAsync(code); setCopied(true); setTimeout(() => setCopied(false), 1_800); }; return <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}><View style={styles.modalShade}><View style={styles.modal}><View style={styles.modalHead}><Text style={styles.modalTitle}>Receive Social24 Coins</Text><Pressable accessibilityRole="button" onPress={onClose}><X size={23} color="#1d2a22" /></Pressable></View>{code ? <View style={styles.qr}><QRCode value={code} size={210} backgroundColor="#fff" color="#0b3921" /></View> : <ActivityIndicator color="#08713d" />}<Text style={styles.receiveText}>Ask a friend to scan this QR from their Wallet. It contains only your Social24 account ID.</Text><Pressable onPress={() => void copy()} style={styles.scan}>{copied ? <Check color="#08713d" size={19} /> : <Copy color="#08713d" size={19} />}<Text accessibilityLiveRegion="polite" style={styles.scanText}>{copied ? "Copied ✓" : "Copy receive code"}</Text></Pressable></View></View></Modal>; }
function FriendsModal({ visible, contacts, close, send, profile, chat }: { visible: boolean; contacts: WalletContact[]; close: () => void; send: (contact: WalletContact) => void; profile: (contact: WalletContact) => void; chat: (contact: WalletContact) => void }) { return <Modal visible={visible} animationType="slide" transparent onRequestClose={close}><View style={styles.modalShade}><View style={styles.modal}><View style={styles.modalHead}><View><Text style={styles.modalTitle}>Wallet friends</Text><Text style={styles.sectionHint}>Real accepted Social24 friends</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close friends" onPress={close}><X size={23} color="#1d2a22" /></Pressable></View><ScrollView contentContainerStyle={styles.friendList}>{contacts.map((contact) => <View key={contact.id} style={styles.friendRow}><View style={styles.friendAvatar}><Text style={styles.avatarText}>{contact.name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.grow}><Text style={styles.friendName}>{contact.name}</Text><Text style={styles.friendHandle}>@{contact.username}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Send coins to ${contact.name}`} onPress={() => send(contact)} style={styles.friendIcon}><Send size={18} color="#08713d" /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Chat with ${contact.name}`} onPress={() => chat(contact)} style={styles.friendIcon}><MessageCircle size={18} color="#08713d" /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`View ${contact.name} profile`} onPress={() => profile(contact)} style={styles.friendIcon}><UserRound size={18} color="#08713d" /></Pressable></View>)}{!contacts.length ? <Text style={styles.empty}>No accepted friends yet. Connect in Nearby People first.</Text> : null}</ScrollView></View></View></Modal>; }
function ReferralShareModal({ visible, contacts, close, share }: { visible: boolean; contacts: WalletContact[]; close: () => void; share: (contact: WalletContact) => void }) { return <Modal visible={visible} animationType="slide" transparent onRequestClose={close}><View style={styles.modalShade}><View style={styles.modal}><View style={styles.modalHead}><View><Text style={styles.modalTitle}>Share referral</Text><Text style={styles.sectionHint}>Send through an existing personal chat</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close referral sharing" onPress={close}><X size={23} color="#1d2a22" /></Pressable></View><ScrollView contentContainerStyle={styles.friendList}>{contacts.map((contact) => <Pressable accessibilityRole="button" accessibilityLabel={`Share referral with ${contact.name}`} key={contact.id} style={styles.friendRow} onPress={() => share(contact)}><View style={styles.friendAvatar}><Text style={styles.avatarText}>{contact.name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.grow}><Text style={styles.friendName}>{contact.name}</Text><Text style={styles.friendHandle}>@{contact.username}</Text></View><Send size={19} color="#08713d" /></Pressable>)}</ScrollView></View></View></Modal>; }
function formatRemaining(ms: number) { const seconds = Math.floor(ms / 1_000); return `${Math.floor(seconds / 3_600).toString().padStart(2, "0")}:${Math.floor(seconds % 3_600 / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7faf8" }, content: { padding: 18, gap: 16, paddingBottom: 42 }, title: { color: "#101b15", fontSize: 34, fontWeight: "900" }, subtitle: { color: "#657169", marginTop: 5 }, hero: { backgroundColor: "#04a953", borderRadius: 28, padding: 22, gap: 26, shadowColor: "#035c2e", shadowOpacity: .18, shadowRadius: 12, elevation: 4 }, heroHead: { flexDirection: "row", justifyContent: "space-between" }, heroLabel: { color: "#dfffea", letterSpacing: 1.1, fontWeight: "900", fontSize: 12 }, mined: { color: "#fff", fontSize: 40, fontWeight: "900", marginTop: 4 }, heroCaption: { color: "#dfffea", marginTop: 2 }, bolt: { width: 54, height: 54, borderRadius: 19, backgroundColor: "#b9f3d2", alignItems: "center", justifyContent: "center" }, heroFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }, totalLabel: { color: "#dfffea", fontSize: 11, fontWeight: "900" }, total: { color: "#fff", fontSize: 25, fontWeight: "900", marginTop: 3 }, mineState: { alignItems: "flex-end" }, mineStateText: { color: "#073f24", fontWeight: "900", backgroundColor: "#e0f8e8", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }, rate: { color: "#dfffea", fontSize: 12, fontWeight: "700", marginTop: 6 }, quickRow: { flexDirection: "row", gap: 12 }, quick: { flex: 1, minHeight: 88, borderWidth: 1, borderColor: "#dce7e0", backgroundColor: "#fff", borderRadius: 22, padding: 14, flexDirection: "row", gap: 10, alignItems: "center" }, quickIcon: { width: 39, height: 39, borderRadius: 14, backgroundColor: "#e9f9ef", alignItems: "center", justifyContent: "center" }, quickLabel: { flex: 1, color: "#1b2a20", fontWeight: "900", fontSize: 15 }, card: { padding: 18, gap: 13, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe9e3", borderRadius: 24 }, sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, sectionTitle: { color: "#17231c", fontSize: 19, fontWeight: "900" }, sectionHint: { color: "#657169", marginTop: 3 }, avatarRow: { flexDirection: "row", minHeight: 50, alignItems: "center" }, avatar: { width: 43, height: 43, borderRadius: 22, marginRight: -8, borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center", backgroundColor: "#c8f1d7" }, avatarText: { color: "#08713d", fontWeight: "900" }, networkText: { color: "#526158", lineHeight: 19, fontSize: 13 }, notice: { padding: 16, borderRadius: 20, backgroundColor: "#effaf3", flexDirection: "row", gap: 11, alignItems: "flex-start" }, noticeText: { flex: 1, color: "#526158", lineHeight: 20, fontSize: 13 }, history: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e2e7e4" }, grow: { flex: 1 }, historyTitle: { color: "#233129", fontWeight: "800" }, historyDate: { color: "#748078", fontSize: 11, marginTop: 3 }, historyAmount: { color: "#07934a", fontWeight: "900" }, negative: { color: "#b42318" }, empty: { color: "#748078", lineHeight: 20 }, error: { color: "#b42318", fontWeight: "700" }, disabled: { opacity: .5 }, modalShade: { flex: 1, backgroundColor: "rgba(4,21,12,.48)", justifyContent: "flex-end" }, modal: { maxHeight: "88%", padding: 22, gap: 12, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: "#fff" }, modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, modalTitle: { color: "#17231c", fontWeight: "900", fontSize: 22 }, fieldLabel: { color: "#526158", fontWeight: "800", marginTop: 3 }, contactRow: { gap: 9, paddingVertical: 2 }, contact: { width: 84, padding: 9, borderRadius: 14, borderWidth: 1, borderColor: "#dce7e0", alignItems: "center", gap: 4 }, contactSelected: { borderColor: "#08713d", backgroundColor: "#eaf9ef" }, contactInitial: { color: "#08713d", fontSize: 18, fontWeight: "900" }, contactName: { color: "#45564c", fontSize: 11, fontWeight: "800", maxWidth: 70 }, scan: { minHeight: 46, borderRadius: 14, backgroundColor: "#effaf3", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 14 }, scanText: { color: "#08713d", fontWeight: "900" }, input: { minHeight: 48, paddingHorizontal: 13, borderRadius: 14, borderWidth: 1, borderColor: "#d5e1da", color: "#17231c", fontSize: 16 }, primary: { minHeight: 52, marginTop: 8, borderRadius: 16, backgroundColor: "#08713d", alignItems: "center", justifyContent: "center" }, primaryText: { color: "#fff", fontSize: 16, fontWeight: "900" }, qr: { alignItems: "center", paddingVertical: 13, backgroundColor: "#f4faf6", borderRadius: 18 }, receiveText: { color: "#526158", lineHeight: 20, textAlign: "center" }, scanner: { flex: 1, backgroundColor: "#071a0f" }, scannerHeader: { padding: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, scannerTitle: { color: "#fff", fontSize: 18, fontWeight: "900" }, camera: { flex: 1 }, scannerHint: { padding: 20, color: "#d8f4e3", textAlign: "center", lineHeight: 21 }, scannerError: { color: "#ffd5d2", backgroundColor: "#7a1d17", padding: 12, textAlign: "center", fontWeight: "800" }, friendList: { gap: 10, paddingBottom: 4 }, friendRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e1e8e3" }, friendAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#c8f1d7" }, friendName: { color: "#17231c", fontSize: 15, fontWeight: "900" }, friendHandle: { color: "#657169", fontSize: 12, marginTop: 2 }, friendIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#effaf3" },
});
