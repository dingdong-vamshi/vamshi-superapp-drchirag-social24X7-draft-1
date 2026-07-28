import * as ImagePicker from "expo-image-picker";
import { useMemo } from "react";
import { Alert } from "react-native";
import { SellerStudioScreen } from "../../src/features/commerce/SellerStudioScreen";
import { createSupabaseShopRepository } from "../../src/features/commerce/supabaseShopRepository";
import { localShopRepository } from "../../src/features/commerce/shopRepository";
import { useAuth } from "../../src/lib/AuthContext";
import { supabase } from "../../src/lib/supabase";

export default function SellerStudioPage() {
  const { user } = useAuth();
  const repository = useMemo(() => {
    if (!supabase) return localShopRepository;
    return createSupabaseShopRepository({
      client: supabase,
      user: user && "identities" in user ? user : null,
    });
  }, [user]);

  return (
    <SellerStudioScreen
      repository={repository}
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
