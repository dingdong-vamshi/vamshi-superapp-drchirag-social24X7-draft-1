import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SellerStudioScreen } from "../../src/features/commerce/SellerStudioScreen";
import { createSupabaseShopRepository } from "../../src/features/commerce/supabaseShopRepository";
import { localShopRepository } from "../../src/features/commerce/shopRepository";
import { getCreatorCommerceAccess } from "../../src/features/creatorCommerce/accessRepository";
import { useAuth } from "../../src/lib/AuthContext";
import { supabase } from "../../src/lib/supabase";

export default function SellerStudioPage() {
  const { user } = useAuth();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const repository = useMemo(() => {
    if (!supabase) return localShopRepository;
    return createSupabaseShopRepository({
      client: supabase,
      user: user && "identities" in user ? user : null,
    });
  }, [user]);

  const verifySellerAccess = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      if (!supabase || !user || user.app_metadata?.provider === "demo") {
        setAllowed(false);
        return;
      }
      const access = await getCreatorCommerceAccess(supabase);
      setAllowed(access?.sellerStatus === "approved");
    } catch (cause) {
      setAllowed(false);
      setError(cause instanceof Error ? cause.message : "Unable to verify seller access.");
    } finally {
      setChecking(false);
    }
  }, [user]);

  useEffect(() => {
    void verifySellerAccess();
  }, [verifySellerAccess]);

  if (checking) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color="#08713d" />
        <Text style={styles.stateText}>Checking seller approval...</Text>
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.state}>
        <Text style={styles.title}>Seller approval required</Text>
        <Text style={styles.stateText}>
          Submit seller onboarding and wait for admin approval before opening seller tools.
        </Text>
        {error ? <Text selectable style={styles.errorText}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => router.replace("/commerce/seller-onboarding")} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Open seller onboarding</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SellerStudioScreen
      repository={repository}
      persistenceKey={user ? `seller-studio-work:${user.id}` : undefined}
      pickProductImages={async () => {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Permission required",
            "Please allow media access to upload product images.",
          );
          return [];
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.86,
          allowsMultipleSelection: true,
          selectionLimit: 10,
          orderedSelection: true,
        });
        if (result.canceled) return [];
        return result.assets.map((asset) => ({
          uri: asset.uri,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
        }));
      }}
    />
  );
}

const styles = StyleSheet.create({
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24, backgroundColor: "#ffffff" },
  title: { color: "#111111", fontSize: 23, fontWeight: "900", textAlign: "center" },
  stateText: { color: "#51605a", fontSize: 15, lineHeight: 22, textAlign: "center" },
  errorText: { color: "#b42318", fontSize: 13, lineHeight: 19, textAlign: "center" },
  primaryButton: { minHeight: 48, borderRadius: 16, backgroundColor: "#08713d", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  primaryButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
});
