import { router } from "expo-router";
import { useMemo } from "react";
import { ShopScreen } from "../../src/features/commerce/ShopScreen";
import { addLifecycleCartItem } from "../../src/features/creatorCommerce/lifecycleRepository";
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
      onCheckout={async (lines) => {
        if (!supabase || !user || !("identities" in user)) {
          throw new Error("Please sign in before continuing to checkout.");
        }
        if (!lines.length) {
          throw new Error("Add a product before continuing to checkout.");
        }

        for (const line of lines) {
          await addLifecycleCartItem(supabase, line.productId, line.quantity, null);
        }

        router.push("/commerce/buyer");
      }}
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
