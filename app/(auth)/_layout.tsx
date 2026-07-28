import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../src/lib/AuthContext';

export default function AuthLayout() {
  const { session, loading } = useAuth();
  if (loading) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator /></View>;
  }

  if (session?.user) {
    return <Redirect href="/social" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
