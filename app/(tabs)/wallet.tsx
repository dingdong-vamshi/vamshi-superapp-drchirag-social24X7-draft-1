import { router } from "expo-router";
import WalletScreen from "../../src/features/wallet/WalletScreen";
import { useMemo } from "react";
import { createSupabaseRewardRepository, unavailableRewardRepository } from "../../src/features/wallet/rewardRepository";
import { supabase } from "../../src/lib/supabase";

export default function WalletPage() {
  const repository = useMemo(() => supabase ? createSupabaseRewardRepository(supabase) : unavailableRewardRepository, []);
  return (
    <WalletScreen
      repository={repository}
      onEditProfile={() => router.push("/profile")}
      onOpenCreatorCommerce={() => router.push("/commerce")}
    />
  );
}
