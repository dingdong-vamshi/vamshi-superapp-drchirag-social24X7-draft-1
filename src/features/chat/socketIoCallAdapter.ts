import { io, type Socket } from 'socket.io-client';
import type { CallAdapter, CallSession, CallSignal } from './types';

/**
 * Authenticated signaling transport for the dedicated Node service. This does
 * not carry audio/video. A custom development build injects react-native-webrtc
 * to create peer connections, then forwards offer/answer/ICE through this adapter.
 */
export function createSocketIoCallAdapter(url: string, token: string): CallAdapter {
  let socket: Socket | null = null;
  const connect = () => socket ??= io(url, { transports: ['websocket'], auth: { token }, autoConnect: true });
  return {
    async startCall({ conversationId, recipientId, kind }) { connect(); return { id: crypto.randomUUID(), conversationId, recipientId, kind, phase: 'connecting' }; },
    async endCall(sessionId) { throw new Error(`Recipient context required to end call ${sessionId}.`); },
    async sendSignal(signal: CallSignal) {
      await new Promise<void>((resolve, reject) => {
        connect().emit('signal', { callId: signal.sessionId, recipientId: signal.recipientId, type: signal.type, payload: signal.payload }, (result: { ok: boolean; error?: string }) => result.ok ? resolve() : reject(new Error(result.error)));
      });
    },
    subscribe(listener) { const active = connect(); const handler = (signal: { callId: string; senderId: string; type: CallSignal['type'] }) => listener({ id: signal.callId, conversationId: '', recipientId: signal.senderId, kind: 'audio', phase: signal.type === 'hangup' ? 'ended' : 'ringing' }); active.on('signal', handler); return () => active.off('signal', handler); },
  };
}
