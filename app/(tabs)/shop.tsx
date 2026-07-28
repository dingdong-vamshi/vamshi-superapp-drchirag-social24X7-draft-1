import { router } from "expo-router";
import { Alert } from "react-native";
import { useMemo } from "react";
import { ShopScreen } from "../../src/features/commerce/ShopScreen";
import { createSupabaseShopRepository } from "../../src/features/commerce/supabaseShopRepository";
import { localShopRepository } from "../../src/features/commerce/shopRepository";
import { useAuth } from "../../src/lib/AuthContext";
import { supabase } from "../../src/lib/supabase";

export default function ShopPage() {
  const { user } = useAuth();
  const repository = useMemo(() => {
    if (!supabase) return localShopRepository;
    return createSupabaseShopRepository({
      client: supabase,
      user: user && "identities" in user ? user : null,
    });
  }, [user]);

  return (
    <ShopScreen
      repository={repository}
      onCheckout={() =>
        Alert.alert(
          "Checkout next",
          "Seller onboarding, storefronts, and product publishing are now connected. Payment settlement can be wired after this.",
        )
      }
      onStorefrontPress={(storefront) =>
        router.push({ pathname: "/store/[slug]", params: { slug: storefront.slug } })
      }
      onProductPress={(product) =>
        router.push({
          pathname: "/store/[slug]/product/[productSlug]",
          params: { slug: product.storefrontSlug, productSlug: product.slug },
        })
      }
    />
  );
}
