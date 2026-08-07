import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { AuthProvider } from '../src/lib/AuthContext';

export default function RootLayout() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 2, staleTime: 15_000 } } }));
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="seller/index" />
        <Stack.Screen name="business-directory" />
        <Stack.Screen name="business-chat/[id]" />
        <Stack.Screen name="games/index" />
        <Stack.Screen name="games/[id]" />
        <Stack.Screen name="store/[slug]" />
        <Stack.Screen name="store/[slug]/product/[productSlug]" />
      </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
