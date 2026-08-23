import { useEffect, useState } from "react";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Camera, Crop, ImageIcon, RotateCw, X } from "lucide-react-native";

import { insetCropRect } from "./documentScannerUtils";

export type ScannedDocumentPage = {
  uri: string;
  filename: string;
  mimeType: "image/jpeg";
  width: number;
  height: number;
};

type DraftPage = ScannedDocumentPage & {
  originalUri: string;
  originalWidth: number;
  originalHeight: number;
};

const saveEditedPage = async (
  uri: string,
  edit: (context: ReturnType<typeof ImageManipulator.manipulate>) => void,
) => {
  const context = ImageManipulator.manipulate(uri);
  edit(context);
  const rendered = await context.renderAsync();
  return rendered.saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
};

export default function DocumentScannerModal({
  visible,
  close,
  confirm,
}: {
  visible: boolean;
  close: () => void;
  confirm: (page: ScannedDocumentPage) => void;
}) {
  const [page, setPage] = useState<DraftPage | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!visible) setPage(null);
  }, [visible]);

  const acquire = async (source: "camera" | "library") => {
    try {
      const permission = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error(`${source === "camera" ? "Camera" : "Photo library"} permission is required.`);
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        quality: 0.92,
        // Expo's native picker provides the strongest lightweight manual crop
        // available in this managed build. Web gets the explicit crop below.
        allowsEditing: Platform.OS !== "web",
      };
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const draft: DraftPage = {
        uri: asset.uri,
        originalUri: asset.uri,
        filename: `scan-${Date.now()}.jpg`,
        mimeType: "image/jpeg",
        width: asset.width,
        height: asset.height,
        originalWidth: asset.width,
        originalHeight: asset.height,
      };
      setPage(draft);
    } catch (cause) {
      Alert.alert("Scanner unavailable", cause instanceof Error ? cause.message : "Please try again.");
    }
  };

  const editPage = async (kind: "rotate" | "crop" | "reset") => {
    if (!page || editing) return;
    setEditing(true);
    try {
      if (kind === "reset") {
        setPage({
          ...page,
          uri: page.originalUri,
          width: page.originalWidth,
          height: page.originalHeight,
        });
        return;
      }
      const result = await saveEditedPage(page.uri, (context) => {
        if (kind === "rotate") context.rotate(90);
        else context.crop(insetCropRect(page.width, page.height));
      });
      setPage({ ...page, uri: result.uri, width: result.width, height: result.height });
    } catch (cause) {
      Alert.alert("Edit not applied", cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setEditing(false);
    }
  };

  const finish = () => {
    if (!page || editing) return;
    confirm({
      uri: page.uri,
      filename: page.filename,
      mimeType: page.mimeType,
      width: page.width,
      height: page.height,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Scan one document page</Text>
            <Text style={styles.subtitle}>Manual capture and editing—no automatic edge detection</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close document scanner" disabled={editing} onPress={close} style={styles.iconButton}>
            <X size={20} color="#17241c" />
          </Pressable>
        </View>

        {!page ? (
          <View style={styles.acquirePanel}>
            <FilePrompt />
            <Pressable accessibilityRole="button" accessibilityLabel="Capture document page" onPress={() => void acquire("camera")} style={styles.primaryButton}>
              <Camera size={20} color="#fff" />
              <Text style={styles.primaryText}>Capture page</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Import document image" onPress={() => void acquire("library")} style={styles.secondaryButton}>
              <ImageIcon size={20} color="#087443" />
              <Text style={styles.secondaryText}>Import image</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.previewPanel}>
            <View style={styles.imageFrame}>
              <Image source={{ uri: page.uri }} resizeMode="contain" style={styles.image} />
              {editing ? <View style={styles.busy}><ActivityIndicator color="#fff" /></View> : null}
            </View>
            <Text style={styles.pageMeta}>{page.width} × {page.height} · single page JPEG</Text>
            <View style={styles.editRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Crop document edges" disabled={editing || page.width < 40 || page.height < 40} onPress={() => void editPage("crop")} style={styles.editButton}>
                <Crop size={18} color="#087443" />
                <Text style={styles.editText}>Crop edges</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Rotate document clockwise" disabled={editing} onPress={() => void editPage("rotate")} style={styles.editButton}>
                <RotateCw size={18} color="#087443" />
                <Text style={styles.editText}>Rotate</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Reset document edits" disabled={editing} onPress={() => void editPage("reset")} style={styles.editButton}>
                <Text style={styles.editText}>Reset</Text>
              </Pressable>
            </View>
            <View style={styles.bottomActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Retake document page" disabled={editing} onPress={() => setPage(null)} style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>Retake</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Confirm scanned document page" disabled={editing} onPress={finish} style={styles.primaryButton}>
                <Text style={styles.primaryText}>Confirm page</Text>
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function FilePrompt() {
  return (
    <View style={styles.prompt}>
      <View style={styles.promptIcon}><Camera size={32} color="#087443" /></View>
      <Text style={styles.promptTitle}>Place one page inside the frame</Text>
      <Text style={styles.promptCopy}>Use the native crop when offered, then preview, trim edges, rotate, retake, or confirm.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f6faf7" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 18, borderBottomWidth: 1, borderBottomColor: "#d9e8de" },
  title: { color: "#17241c", fontSize: 19, fontWeight: "900" },
  subtitle: { color: "#65756b", fontSize: 12, marginTop: 3 },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  acquirePanel: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  prompt: { alignItems: "center", marginBottom: 18 },
  promptIcon: { width: 70, height: 70, borderRadius: 24, backgroundColor: "#e2f4e9", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  promptTitle: { color: "#17241c", fontSize: 18, fontWeight: "900", textAlign: "center" },
  promptCopy: { color: "#65756b", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 7, maxWidth: 390 },
  previewPanel: { flex: 1, padding: 16, gap: 12 },
  imageFrame: { flex: 1, minHeight: 280, borderRadius: 18, overflow: "hidden", backgroundColor: "#18221c", position: "relative" },
  image: { width: "100%", height: "100%" },
  busy: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.34)" },
  pageMeta: { color: "#65756b", fontSize: 12, textAlign: "center" },
  editRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  editButton: { minHeight: 42, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, borderRadius: 12, backgroundColor: "#e5f3ea" },
  editText: { color: "#087443", fontWeight: "800", fontSize: 12 },
  bottomActions: { flexDirection: "row", gap: 10 },
  primaryButton: { minHeight: 50, flex: 1, borderRadius: 14, backgroundColor: "#087443", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  primaryText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  secondaryButton: { minHeight: 50, flex: 1, borderRadius: 14, backgroundColor: "#e5f3ea", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  secondaryText: { color: "#087443", fontWeight: "900", fontSize: 14 },
});
