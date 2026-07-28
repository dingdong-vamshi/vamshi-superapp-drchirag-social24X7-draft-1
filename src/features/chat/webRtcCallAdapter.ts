import { Platform } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { currentChatUserId } from './chatRepository';
import { inferSignalingUrl } from './socketIoChatRepository';
import type { CallAdapter, CallKind, CallSession, CallSignal } from './types';

type WireSignal = {
  callId: string;
  senderId: string;
  type: CallSignal['type'];
  payload?: {
    description?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
    kind?: CallKind;
  };
};

const rtcConfiguration: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

export function createWebRtcCallAdapter(): CallAdapter {
  let socket: Socket | null = null;
  let peer: RTCPeerConnection | null = null;
  let session: CallSession | null = null;
  let pendingOffer: WireSignal | null = null;
  let queuedCandidates: RTCIceCandidateInit[] = [];
  const listeners = new Set<(next: CallSession) => void>();

  const publish = (patch: Partial<CallSession>) => {
    if (!session) return;
    session = { ...session, ...patch };
    listeners.forEach((listener) => listener(session!));
  };

  const send = async (signal: CallSignal) => {
    const active = await connect();
    await new Promise<void>((resolve, reject) => {
      active.emit(
        'signal',
        {
          callId: signal.sessionId,
          recipientId: signal.recipientId,
          type: signal.type,
          payload: signal.payload,
        },
        (result: { ok: boolean; error?: string }) =>
          result.ok ? resolve() : reject(new Error(result.error || 'signal_failed')),
      );
    });
  };

  const closeMedia = () => {
    const local = session?.localStream as MediaStream | undefined;
    local?.getTracks().forEach((track) => track.stop());
    peer?.close();
    peer = null;
    queuedCandidates = [];
  };

  const createPeer = (activeSession: CallSession) => {
    const connection = new RTCPeerConnection(rtcConfiguration);
    connection.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      void send({
        sessionId: activeSession.id,
        recipientId: activeSession.recipientId,
        type: 'ice-candidate',
        payload: { candidate: candidate.toJSON() },
      });
    };
    connection.ontrack = ({ streams }) => {
      if (streams[0]) publish({ remoteStream: streams[0], phase: 'connected' });
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'connected') publish({ phase: 'connected' });
      if (['failed', 'disconnected'].includes(connection.connectionState)) {
        publish({ phase: 'failed', error: 'The peer connection was interrupted.' });
      }
    };
    peer = connection;
    return connection;
  };

  const acquireMedia = async (kind: CallKind) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera and microphone access is unavailable in this browser.');
    }
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === 'video' ? { facingMode: 'user' } : false,
    });
  };

  const applyQueuedCandidates = async () => {
    if (!peer?.remoteDescription) return;
    const candidates = queuedCandidates;
    queuedCandidates = [];
    for (const candidate of candidates) await peer.addIceCandidate(candidate);
  };

  const receive = async (signal: WireSignal) => {
    if (signal.type === 'offer') {
      pendingOffer = signal;
      session = {
        id: signal.callId,
        conversationId: signal.senderId,
        recipientId: signal.senderId,
        kind: signal.payload?.kind || 'audio',
        phase: 'ringing',
        direction: 'incoming',
      };
      publish({});
      return;
    }
    if (!session || signal.callId !== session.id) return;
    if (signal.type === 'answer' && signal.payload?.description && peer) {
      await peer.setRemoteDescription(signal.payload.description);
      await applyQueuedCandidates();
      publish({ phase: 'connected' });
      return;
    }
    if (signal.type === 'ice-candidate' && signal.payload?.candidate) {
      if (peer?.remoteDescription) await peer.addIceCandidate(signal.payload.candidate);
      else queuedCandidates.push(signal.payload.candidate);
      return;
    }
    if (signal.type === 'hangup') {
      closeMedia();
      publish({ phase: 'ended' });
    }
  };

  const connect = async () => {
    if (socket) return socket;
    const userId = await currentChatUserId();
    const url = inferSignalingUrl();
    if (!url) throw new Error('The call server URL is missing.');
    socket = io(url, {
      transports: ['websocket'],
      auth: { token: `demo:${userId}` },
      reconnection: true,
    });
    socket.on('signal', (signal: WireSignal) => void receive(signal));
    return socket;
  };

  const unsupported = () => {
    throw new Error('Native WebRTC requires a Social 24x7 development build; Expo Go cannot load native WebRTC.');
  };

  return {
    async startCall({ conversationId, recipientId, kind }) {
      if (Platform.OS !== 'web') return unsupported();
      await connect();
      session = {
        id: crypto.randomUUID(),
        conversationId,
        recipientId,
        kind,
        phase: 'connecting',
        direction: 'outgoing',
      };
      publish({});
      try {
        const localStream = await acquireMedia(kind);
        publish({ localStream });
        const connection = createPeer(session);
        localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));
        const description = await connection.createOffer();
        await connection.setLocalDescription(description);
        await send({
          sessionId: session.id,
          recipientId,
          type: 'offer',
          payload: { description, kind },
        });
        publish({ phase: 'ringing' });
        return session;
      } catch (error) {
        closeMedia();
        publish({ phase: 'failed', error: error instanceof Error ? error.message : 'Call failed.' });
        throw error;
      }
    },
    async acceptCall(sessionId) {
      if (Platform.OS !== 'web') return unsupported();
      if (!session || !pendingOffer || session.id !== sessionId) throw new Error('The incoming call is no longer available.');
      const offer = pendingOffer;
      pendingOffer = null;
      const localStream = await acquireMedia(session.kind);
      publish({ localStream, phase: 'connecting' });
      const connection = createPeer(session);
      localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));
      await connection.setRemoteDescription(offer.payload!.description!);
      await applyQueuedCandidates();
      const description = await connection.createAnswer();
      await connection.setLocalDescription(description);
      await send({
        sessionId,
        recipientId: session.recipientId,
        type: 'answer',
        payload: { description, kind: session.kind },
      });
      publish({ phase: 'connected' });
    },
    async endCall(sessionId) {
      if (!session || session.id !== sessionId) return;
      try {
        await send({ sessionId, recipientId: session.recipientId, type: 'hangup' });
      } finally {
        closeMedia();
        publish({ phase: 'ended' });
      }
    },
    sendSignal: send,
    async toggleMute(sessionId) {
      if (!session || session.id !== sessionId) return;
      const stream = session.localStream as MediaStream | undefined;
      const muted = !session.muted;
      stream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
      publish({ muted });
    },
    async toggleCamera(sessionId) {
      if (!session || session.id !== sessionId) return;
      const stream = session.localStream as MediaStream | undefined;
      const cameraOff = !session.cameraOff;
      stream?.getVideoTracks().forEach((track) => { track.enabled = !cameraOff; });
      publish({ cameraOff });
    },
    async shareScreen(sessionId) {
      if (Platform.OS !== 'web') return unsupported();
      if (!session || session.id !== sessionId || !peer) return;
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = display.getVideoTracks()[0];
      const sender = peer.getSenders().find((item) => item.track?.kind === 'video');
      if (!sender) throw new Error('Start a video call before sharing your screen.');
      const cameraTrack = (session.localStream as MediaStream | undefined)?.getVideoTracks()[0];
      await sender.replaceTrack(screenTrack);
      publish({ screenSharing: true });
      screenTrack.onended = () => {
        void sender.replaceTrack(cameraTrack || null);
        publish({ screenSharing: false });
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      void connect();
      if (session) listener(session);
      return () => listeners.delete(listener);
    },
  };
}
