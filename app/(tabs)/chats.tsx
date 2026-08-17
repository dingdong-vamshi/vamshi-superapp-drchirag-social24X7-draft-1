import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import ChatScreen from '../../src/features/chat/ChatScreen';
import { createSupabaseChatRepository } from '../../src/features/chat/supabaseChatRepository';
import { createWebRtcCallAdapter } from '../../src/features/chat/webRtcCallAdapter';
import { createSupabaseProfileRepository } from '../../src/features/profile/profileRepository';
import type { ChatContact } from '../../src/features/chat/types';
import { useAuth } from '../../src/lib/AuthContext';
import { supabase } from '../../src/lib/supabase';

export default function ChatsPage() {
  const params = useLocalSearchParams<{ sharedId?: string; sharedAuthor?: string; sharedCaption?: string }>();
  const { user } = useAuth();
  const [viewer, setViewer] = useState<ChatContact | null>(null);
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
  useEffect(() => {
    let mounted = true;
    if (!user) {
      setViewer(null);
      return () => { mounted = false; };
    }
    void createSupabaseProfileRepository(user).getProfile().then((profile) => {
      if (!mounted) return;
      setViewer({
        id: profile.id,
        name: profile.displayName,
        username: profile.handle,
        avatarLabel: profile.avatarInitials,
        avatarUrl: profile.avatarUrl,
        isOnline: true,
      });
    }).catch(() => {
      if (mounted) setViewer(null);
    });
    return () => { mounted = false; };
  }, [user]);

  return <ChatScreen dataSource={repository} callAdapter={callAdapter} viewer={viewer} onOpenOwnProfile={() => router.push('/profile')} sharedPost={sharedPost} onShareComplete={() => router.replace('/chats')} onOpenQr={() => router.push('/profile-qr')} onBusinessSearch={() => router.push('/business-directory')} onViewStore={(slug) => router.push({ pathname: '/store/[slug]', params: { slug } })} onViewOrder={(orderId) => router.push({ pathname: '/commerce/order/[id]', params: { id: orderId } })} onViewProfile={(userId) => router.push({ pathname: '/social-profile', params: { userId } })} />;
}
