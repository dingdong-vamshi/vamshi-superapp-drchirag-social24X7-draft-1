import { router } from "expo-router";
import { useMemo } from "react";
import { ShopScreen } from "../../src/features/commerce/ShopScreen";
import { createSupabaseShopRepository } from "../../src/features/commerce/supabaseShopRepository";
import { localShopRepository } from "../../src/features/commerce/shopRepository";
import { useAuth } from "../../src/lib/AuthContext";
import { supabase } from "../../src/lib/supabase";

export default function ShopPage() {
  const { initialized, user } = useAuth();
  const repository = useMemo(() => {
    if (!supabase) return localShopRepository;
    if (!initialized) return null;
    return createSupabaseShopRepository({
      client: supabase,
      user: user && "identities" in user ? user : null,
    });
  }, [initialized, user]);

  if (!repository) return null;

  return (
    <ShopScreen
      repository={repository}
      onCartPress={() => router.push("/cart")}
      onWishlistPress={() => router.push("/wishlist")}
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
