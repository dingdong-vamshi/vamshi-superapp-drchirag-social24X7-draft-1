import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import {
  currentChatUserId,
  ingestChatMessage,
  localChatRepository,
  messageThreadKey,
} from './chatRepository';
import { CURRENT_USER_ID, type ChatDataSource, type ChatMessage } from './types';

type ServerChatMessage = {
  id: string;
  threadId: string;
  senderId: string;
  recipientId: string;
  text: string;
  createdAt: string;
  type?: 'text' | 'shared_post' | 'sticker';
  post?: ChatMessage['post'];
};

const toClientMessage = (message: ServerChatMessage): ChatMessage => ({
  id: message.id,
  conversationId: message.threadId,
  senderId: message.senderId,
  text: message.text,
  createdAt: message.createdAt,
  status: 'delivered',
  type: message.type,
  post: message.post,
});

export const inferSignalingUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_SIGNALING_URL;
  if (envUrl) return envUrl;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8787`;
  }

  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;
  const host = typeof hostUri === 'string' ? hostUri.split(':')[0] : '';
  return host ? `http://${host}:8787` : '';
};

export function createSocketIoChatRepository(): ChatDataSource {
  const url = inferSignalingUrl();
  let socket: Socket | null = null;
  let activeUserId: string | null = null;

  const connect = async () => {
    const userId = await currentChatUserId();
    if (!url || userId === CURRENT_USER_ID) return null;
    if (socket && activeUserId === userId) return socket;
    socket?.disconnect();
    activeUserId = userId;
    socket = io(url, {
      transports: ['websocket'],
      auth: { token: `demo:${userId}` },
      autoConnect: true,
      reconnection: true,
    });
    socket.on('chat:message', (message: ServerChatMessage) => {
      void ingestChatMessage(toClientMessage(message));
    });
    return socket;
  };

  const syncHistory = async (participantId: string) => {
    const active = await connect();
    if (!active) return;
    const userId = await currentChatUserId();
    const threadId = messageThreadKey(userId, participantId);
    await new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => resolve(), 3000);
      active.emit('chat:history', { threadId }, (result: { ok: boolean; messages?: ServerChatMessage[] }) => {
        clearTimeout(timeoutId);
        if (result.ok) {
          result.messages?.forEach((message) => void ingestChatMessage(toClientMessage(message)));
        }
        resolve();
      });
    });
  };

  return {
    async listConversations() {
      await connect();
      return localChatRepository.listConversations();
    },
    async listMessages(conversationId) {
      await syncHistory(conversationId);
      return localChatRepository.listMessages(conversationId);
    },
    async sendMessage(input) {
      const userId = await currentChatUserId();
      const message = await localChatRepository.sendMessage(input);
      const active = await connect();
      if (active) {
        const threadId = messageThreadKey(userId, input.conversationId);
        active.emit('chat:message', {
          id: message.id,
          threadId,
          recipientId: input.conversationId,
          text: input.text,
          createdAt: message.createdAt,
          type: input.type,
          post: input.post,
        });
      }
      return message;
    },
    markConversationRead: localChatRepository.markConversationRead,
    searchContacts: localChatRepository.searchContacts,
    openDirectConversation: localChatRepository.openDirectConversation,
    sendMessageRequest: localChatRepository.sendMessageRequest,
    acceptMessageRequest: localChatRepository.acceptMessageRequest,
    subscribe(listener) {
      const localUnsubscribe = localChatRepository.subscribe(listener);
      let closed = false;
      void connect().then((active) => {
        if (!active || closed) return;
        active.on('chat:message', listener);
        active.on('connect', listener);
      });
      return () => {
        closed = true;
        localUnsubscribe();
        socket?.off('chat:message', listener);
        socket?.off('connect', listener);
      };
    },
  };
}
