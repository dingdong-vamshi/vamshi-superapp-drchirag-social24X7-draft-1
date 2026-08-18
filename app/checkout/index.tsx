import { router } from "expo-router";
import { useMemo } from "react";
import { CheckoutScreen } from "../../src/features/commerce/CartCheckoutScreens";
import { createSupabaseShopRepository } from "../../src/features/commerce/supabaseShopRepository";
import { localShopRepository } from "../../src/features/commerce/shopRepository";
import { useAuth } from "../../src/lib/AuthContext";
import { supabase } from "../../src/lib/supabase";

export default function CheckoutPage() {
  const { initialized, user } = useAuth();
  const repository = useMemo(() => {
    if (!supabase) return localShopRepository;
    if (!initialized) return null;
    return createSupabaseShopRepository({ client: supabase, user: user && "identities" in user ? user : null });
  }, [initialized, user]);
  if (!supabase || !repository) return null;
  return <CheckoutScreen repository={repository} client={supabase} onBack={() => router.back()} onSuccess={(checkoutId, paymentMethod, totalMinor) => router.replace({ pathname: "/checkout/success", params: { checkoutId, paymentMethod, totalMinor: String(totalMinor) } })} />;
}
