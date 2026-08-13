import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import ChatScreen from '../../src/features/chat/ChatScreen';
import { createSupabaseChatRepository } from '../../src/features/chat/supabaseChatRepository';
import { createWebRtcCallAdapter } from '../../src/features/chat/webRtcCallAdapter';
import { useAuth } from '../../src/lib/AuthContext';
import { supabase } from '../../src/lib/supabase';

export default function ChatsPage() {
  const params = useLocalSearchParams<{ sharedId?: string; sharedAuthor?: string; sharedCaption?: string }>();
  const { user } = useAuth();
  const sharedPost = params.sharedId && params.sharedAuthor && params.sharedCaption ? { id: params.sharedId, author: params.sharedAuthor, caption: params.sharedCaption } : undefined;
  const repository = useMemo(() => {
    const isDemoUser = Boolean(
      user &&
      'app_metadata' in user &&
      user.app_metadata?.provider === 'demo',
    );
    if (!supabase || !user || isDemoUser) return undefined;
    return createSupabaseChatRepository({ client: supabase, user });
  }, [user]);
  const callAdapter = useMemo(() => createWebRtcCallAdapter(), [user]);

  return <ChatScreen dataSource={repository} callAdapter={callAdapter} sharedPost={sharedPost} onBusinessSearch={() => router.push('/business-directory')} onViewStore={(slug) => router.push({ pathname: '/store/[slug]', params: { slug } })} onViewOrder={(orderId) => router.push({ pathname: '/commerce/order/[id]', params: { id: orderId } })} onViewProfile={(userId) => router.push({ pathname: '/social-profile', params: { userId } })} />;
}
