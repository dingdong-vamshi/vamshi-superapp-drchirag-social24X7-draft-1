import { useLocalSearchParams } from 'expo-router';

import { CommerceChatRoute } from '../../../src/features/chat/CommerceChatRoute';

export default function SellerCreatorChatPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CommerceChatRoute conversationId={id} surface="seller" />;
}
