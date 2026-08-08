import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { CommerceAccessProvider, useCommerceAccess } from '../../src/features/creatorCommerce/CommerceAccessContext';

function CommerceNavigator() {
  const { access, loading } = useCommerceAccess();

  if (loading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#0f9f5f" /></View>;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="commerce/index" />
      <Stack.Screen name="commerce/seller-onboarding" />
      <Stack.Screen name="commerce/creator-onboarding" />
      <Stack.Screen name="commerce/buyer" />
      <Stack.Protected guard={access?.sellerStatus === 'approved'}>
        <Stack.Screen name="commerce/seller" />
      </Stack.Protected>
      <Stack.Protected guard={access?.creatorStatus === 'approved'}>
        <Stack.Screen name="commerce/creator" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(access?.adminAccess)}>
        <Stack.Screen name="commerce/admin" />
      </Stack.Protected>
    </Stack>
  );
}

export default function CreatorCommerceLayout() {
  return <CommerceAccessProvider><CommerceNavigator /></CommerceAccessProvider>;
}
