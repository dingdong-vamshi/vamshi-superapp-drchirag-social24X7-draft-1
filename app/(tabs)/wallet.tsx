import { router } from "expo-router";
import WalletScreen from "../../src/features/wallet/WalletScreen";

export default function WalletPage() {
  return (
    <WalletScreen
      onBrowseShop={() => router.push("/shop")}
      onOpenProfile={() => router.push("/profile")}
    />
  );
}
