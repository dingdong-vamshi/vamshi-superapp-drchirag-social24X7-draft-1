import { router } from "expo-router";
import { useMemo } from "react";
import { CartScreen } from "../src/features/commerce/CartCheckoutScreens";
import { createSupabaseShopRepository } from "../src/features/commerce/supabaseShopRepository";
import { localShopRepository } from "../src/features/commerce/shopRepository";
import { useAuth } from "../src/lib/AuthContext";
import { supabase } from "../src/lib/supabase";

export default function CartPage() {
  const { user } = useAuth();
  const repository = useMemo(() => supabase ? createSupabaseShopRepository({ client: supabase, user: user && "identities" in user ? user : null }) : localShopRepository, [user]);
  if (!supabase) return null;
  return <CartScreen repository={repository} client={supabase} onBack={() => router.back()} onContinue={() => router.push("/checkout")} />;
}
