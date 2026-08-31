import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { createSupabaseProfileRepository } from '../profile/profileRepository';
import ChatScreen from './ChatScreen';
import { useCall } from './CallProvider';
import { createSupabaseChatRepository } from './supabaseChatRepository';
import type { ChatContact } from './types';

type Props = {
  conversationId?: string;
  surface: 'creator' | 'seller';
};

export function CommerceChatRoute({ conversationId, surface }: Props) {
  const { user } = useAuth();
  const { adapter: callAdapter } = useCall();
  const [viewer, setViewer] = useState<ChatContact | null>(null);
  const repository = useMemo(() => {
    const isDemoUser = Boolean(user?.app_metadata?.provider === 'demo');
    if (!supabase || !user || isDemoUser) return undefined;
    return createSupabaseChatRepository({ client: supabase, user, context: 'creator_seller' });
  }, [user]);

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

  const returnToCommerceInbox = () => {
    if (surface === 'creator') {
      router.replace({ pathname: '/commerce/creator', params: { section: 'chats' } });
      return;
    }
    router.replace({ pathname: '/seller', params: { section: 'creator_chat' } });
  };

  return (
    <ChatScreen
      dataSource={repository}
      callAdapter={callAdapter}
      viewer={viewer}
      initialConversationId={conversationId}
      onBack={returnToCommerceInbox}
      onViewStore={(slug) => router.push({ pathname: '/store/[slug]', params: { slug } })}
      onViewProfile={(userId) => router.push({ pathname: '/social-profile', params: { userId } })}
    />
  );
}
