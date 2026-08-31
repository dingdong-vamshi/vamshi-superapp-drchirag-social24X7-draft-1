import { useLocalSearchParams } from 'expo-router';

import { CommerceChatRoute } from '../../src/features/chat/CommerceChatRoute';

export default function CreatorCommerceChatPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CommerceChatRoute conversationId={id} surface="creator" />;
}
