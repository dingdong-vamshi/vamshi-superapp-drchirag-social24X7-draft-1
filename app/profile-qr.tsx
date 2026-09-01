import { useRef, useState } from "react";
import { Camera, CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { ArrowLeft, Camera as CameraIcon, ImagePlus, QrCode, X } from "lucide-react-native";

import { useAuth } from "../src/lib/AuthContext";
import { profileIdFromQrPayload } from "../src/features/profile/profileQrUtils";

export default function ProfileQrPage() {
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manual, setManual] = useState("");
  const scanHandled = useRef(false);
  const payload = `social24x7://profile/${user?.id || ""}`;

  const openPayload = (value: string) => {
    if (scanHandled.current) return;
    const userId = profileIdFromQrPayload(value);
    if (!userId) {
      Alert.alert("Invalid Social 24x7 QR", "Use a Social 24x7 profile QR or enter a valid profile ID.");
      return;
    }
    scanHandled.current = true;
    setScannerOpen(false);
    router.replace({ pathname: "/social-profile", params: { userId } });
  };

  const openCamera = async () => {
    const next = permission?.granted ? permission : await requestPermission();
    if (!next.granted) {
      Alert.alert("Camera access needed", "Allow camera access to scan a profile QR.");
      return;
    }
    scanHandled.current = false;
    setScannerOpen(true);
  };

  const scanImage = async () => {
    const access = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!access.granted) return;
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (picked.canceled) return;
    const results = await Camera.scanFromURLAsync(picked.assets[0].uri, ["qr"]);
    if (!results[0]?.data) {
      Alert.alert("No QR found", "Choose a clear image containing a Social 24x7 profile QR.");
      return;
    }
    openPayload(results[0].data);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace("/profile")} style={styles.icon}><ArrowLeft color="#172235" size={24} /></Pressable>
        <Text accessibilityRole="header" style={styles.title}>Profile QR</Text>
        <View style={styles.icon} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.qrCard}>
          <Text style={styles.cardTitle}>My QR</Text>
          <Text style={styles.copy}>People can scan this code to open your Social 24x7 profile. It contains only your profile ID.</Text>
          {user?.id ? <View style={styles.qr}><QRCode value={payload} size={220} color="#102319" backgroundColor="#ffffff" /></View> : null}
        </View>
        <View style={styles.scanCard}>
          <Text style={styles.cardTitle}>Connect by QR</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Scan QR with camera" onPress={() => void openCamera()} style={styles.primary}><CameraIcon color="#ffffff" size={20} /><Text style={styles.primaryText}>Scan with camera</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Upload QR image" onPress={() => void scanImage()} style={styles.secondary}><ImagePlus color="#078f4a" size={20} /><Text style={styles.secondaryText}>Upload QR image</Text></Pressable>
          <Text style={styles.or}>or enter a profile link / ID</Text>
          <TextInput value={manual} onChangeText={setManual} autoCapitalize="none" placeholder="social24x7://profile/…" style={styles.input} />
          <Pressable accessibilityRole="button" accessibilityLabel="Open profile from QR value" onPress={() => openPayload(manual)} disabled={!manual.trim()} style={[styles.primary, !manual.trim() && styles.disabled]}><QrCode color="#ffffff" size={20} /><Text style={styles.primaryText}>Open profile</Text></Pressable>
        </View>
      </ScrollView>
      {scannerOpen ? (
        <View style={StyleSheet.absoluteFill}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => openPayload(data)}
          />
          <Pressable accessibilityLabel="Close QR scanner" onPress={() => { scanHandled.current = false; setScannerOpen(false); }} style={styles.closeScanner}><X color="#ffffff" size={26} /></Pressable>
          <View pointerEvents="none" style={styles.scanFrame} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7faf8" },
  header: { minHeight: 62, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#e7ece9" },
  icon: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  title: { color: "#172235", fontSize: 20, fontWeight: "900" },
  content: { padding: 18, gap: 16, paddingBottom: 50 },
  qrCard: { padding: 22, borderRadius: 24, backgroundColor: "#effaf3", borderWidth: 1, borderColor: "#ccebd7", alignItems: "center" },
  scanCard: { padding: 20, borderRadius: 24, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e1e8e4", gap: 12 },
  cardTitle: { color: "#172235", fontSize: 22, fontWeight: "900", alignSelf: "flex-start" },
  copy: { color: "#617067", lineHeight: 21, alignSelf: "flex-start", marginTop: 6 },
  qr: { marginTop: 22, padding: 18, borderRadius: 20, backgroundColor: "#ffffff" },
  primary: { minHeight: 52, paddingHorizontal: 18, borderRadius: 17, backgroundColor: "#07b85a", flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#ffffff", fontWeight: "900", fontSize: 16 },
  secondary: { minHeight: 52, paddingHorizontal: 18, borderRadius: 17, backgroundColor: "#effaf3", flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: "#078f4a", fontWeight: "900", fontSize: 16 },
  or: { color: "#748078", textAlign: "center", marginTop: 4 },
  input: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: "#d6dfda", paddingHorizontal: 14, color: "#172235" },
  disabled: { opacity: 0.42 },
  closeScanner: { position: "absolute", top: 55, right: 20, width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  scanFrame: { position: "absolute", width: 260, height: 260, top: "32%", alignSelf: "center", borderWidth: 3, borderColor: "#44ef94", borderRadius: 24 },
});
