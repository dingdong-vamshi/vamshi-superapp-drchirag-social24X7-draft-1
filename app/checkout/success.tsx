import { router, useLocalSearchParams } from "expo-router";
import { CheckoutSuccessScreen } from "../../src/features/commerce/CartCheckoutScreens";

export default function CheckoutSuccessPage() {
  const params = useLocalSearchParams<{ checkoutId?: string; paymentMethod?: string; totalMinor?: string }>();
  return <CheckoutSuccessScreen paymentMethod={params.paymentMethod ?? "external"} totalMinor={Number(params.totalMinor ?? 0)} reference={params.checkoutId ?? "pending"} onContinue={() => router.replace("/(tabs)/shop")} />;
}
