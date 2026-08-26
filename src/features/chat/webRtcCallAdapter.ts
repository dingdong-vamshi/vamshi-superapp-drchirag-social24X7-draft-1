import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { supabase } from '../../lib/supabase';
import { nextCallPhase, type CallLifecycleEvent } from './callLifecycle';
import {
  canShareDisplay,
  canSwitchCamera as detectCanSwitchCamera,
  nextCameraFacingMode,
  replaceLocalVideoTrack,
  type CameraFacingMode,
} from './callMediaUtils';
import type { CallAdapter, CallKind, CallSession, CallSignal } from './types';

type WireSignal = {
  callId: string;
  senderId: string;
  recipientId: string;
  type: CallSignal['type'];
  sentAt: number;
  payload?: {
    description?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
    kind?: CallKind;
    conversationId?: string;
    callerName?: string;
    callerAvatarUrl?: string;
    videoEnabled?: boolean;
    screenSharing?: boolean;
    reason?: 'busy' | 'cancelled' | 'declined' | 'ended' | 'failed' | 'timeout';
  };
};

type RealtimeChannel = ReturnType<NonNullable<typeof supabase>['channel']>;

const CALL_SIGNAL_EVENT = 'call-signal';
const CHANNEL_READY_TIMEOUT_MS = 10_000;
const OFFER_RETRY_MS = 2_000;
const MAX_OFFER_RETRIES = 3;
const RING_TIMEOUT_MS = 45_000;
const CONNECTION_TIMEOUT_MS = 30_000;
const DISCONNECT_GRACE_MS = 8_000;
const MAX_SIGNAL_AGE_MS = 60_000;

const stunUrls = (process.env.EXPO_PUBLIC_STUN_URLS
  || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
  .split(',')
  .map((value: string) => value.trim())
  .filter(Boolean);

const rtcConfiguration: RTCConfiguration = {
  iceCandidatePoolSize: 10,
  iceServers: [{ urls: stunUrls }],
};

export const callSignalChannelName = (userId: string) => `social24-calls:${userId}`;

export const buildWireSignal = (signal: CallSignal, senderId: string): WireSignal => ({
  callId: signal.sessionId,
  senderId,
  recipientId: signal.recipientId,
  type: signal.type,
  sentAt: Date.now(),
  payload: signal.payload as WireSignal['payload'],
});

export const isWireSignalForUser = (signal: WireSignal, userId: string) =>
  Boolean(
    signal
    && typeof signal.callId === 'string'
    && typeof signal.senderId === 'string'
    && signal.recipientId === userId
    && signal.senderId !== userId
    && ['offer', 'ringing', 'answer', 'ice-candidate', 'renegotiate-offer', 'renegotiate-answer', 'media-state', 'hangup'].includes(signal.type),
  );

const isMobileBrowser = () => {
  if (typeof navigator === 'undefined') return Platform.OS !== 'web';
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return Boolean(nav.userAgentData?.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
};

const supportsScreenShare = () =>
  typeof navigator !== 'undefined'
  && canShareDisplay({
    hasDisplayMedia: Boolean(navigator.mediaDevices?.getDisplayMedia),
    mobileHint: isMobileBrowser(),
  });

const currentCallUserId = async () => {
  if (!supabase) return 'anonymous';
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw new Error(`Call authentication failed: ${error.message}`);
  if (!user?.id) throw new Error('Sign in on this device before starting or receiving calls.');
  return user.id;
};

const currentCallUserName = async () => {
  if (!supabase) return '';
  const { data: { user } } = await supabase.auth.getUser();
  const metadata = user?.user_metadata || {};
  return typeof metadata.full_name === 'string'
    ? metadata.full_name
    : typeof metadata.name === 'string'
      ? metadata.name
      : typeof metadata.display_name === 'string'
        ? metadata.display_name
        : '';
};

const describeCallError = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  if (Platform.OS === 'web' && typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Accepting calls needs a secure HTTPS page on phones. Open Social 24x7 from the deployed HTTPS link or an HTTPS tunnel; local http:// IP links can receive rings but cannot open the microphone/camera.';
  }
  if (/permission|denied|notallowed/i.test(message)) {
    return 'Microphone/camera permission was blocked. Allow access in the browser and try the call again.';
  }
  if (/notfound|devicesnotfound/i.test(message)) {
    return 'No microphone or camera was found for this call.';
  }
  if (/notreadable|trackstarterror/i.test(message)) {
    return 'The microphone or camera is already in use by another app.';
  }
  return message || 'Call failed.';
};

const inferSignalingUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_SIGNALING_URL;
  if (envUrl) return envUrl;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8787`;
  }

  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;
  const host = typeof hostUri === 'string' ? hostUri.split(':')[0] : '';
  return host ? `http://${host}:8787` : '';
};

export function createWebRtcCallAdapter(): CallAdapter {
  let socket: Socket | null = null;
  let socketReady: Promise<void> | null = null;
  let inboundChannel: RealtimeChannel | null = null;
  let inboundReady: Promise<void> | null = null;
  const outboundChannels = new Map<string, { channel: RealtimeChannel; ready: Promise<void> }>();
  let activeUserId = '';
  let peer: RTCPeerConnection | null = null;
  let session: CallSession | null = null;
  let pendingOffer: WireSignal | null = null;
  let queuedCandidates: RTCIceCandidateInit[] = [];
  let queuedLocalCandidates: RTCIceCandidateInit[] = [];
  let canSendLocalCandidates = false;
  let remoteMediaStream: MediaStream | null = null;
  let videoSender: RTCRtpSender | null = null;
  let cameraTrack: MediaStreamTrack | null = null;
  let sharedScreenTrack: MediaStreamTrack | null = null;
  let makingOffer = false;
  let ignoreOffer = false;
  let isSettingRemoteAnswerPending = false;
  let renegotiationChain: Promise<void> = Promise.resolve();
  let offerRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let ringTimer: ReturnType<typeof setTimeout> | null = null;
  let connectionTimer: ReturnType<typeof setTimeout> | null = null;
  let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  const listeners = new Set<(next: CallSession) => void>();

  const publish = (patch: Partial<CallSession>) => {
    if (!session || destroyed) return;
    session = { ...session, ...patch };
    listeners.forEach((listener) => listener(session!));
  };

  const transition = (event: CallLifecycleEvent, patch: Partial<CallSession> = {}) => {
    if (!session) return;
    const phase = nextCallPhase(session.phase, event);
    publish(phase ? { ...patch, phase } : patch);
  };

  const clearTimer = (timer: ReturnType<typeof setTimeout> | null) => {
    if (timer) clearTimeout(timer);
  };

  const clearSessionTimers = () => {
    clearTimer(offerRetryTimer);
    clearTimer(ringTimer);
    clearTimer(connectionTimer);
    clearTimer(disconnectTimer);
    offerRetryTimer = null;
    ringTimer = null;
    connectionTimer = null;
    disconnectTimer = null;
  };

  const awaitChannelSubscription = (channel: RealtimeChannel, label: string) =>
    new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`${label} signaling timed out.`));
      }, CHANNEL_READY_TIMEOUT_MS);
      channel.subscribe((status, error) => {
        if (settled) return;
        if (status === 'SUBSCRIBED') {
          settled = true;
          clearTimeout(timer);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          settled = true;
          clearTimeout(timer);
          reject(new Error(error?.message || `${label} signaling could not connect.`));
        }
      });
    });

  const waitForSocket = async (activeSocket: Socket) => {
    if (activeSocket.connected) return;
    if (socketReady) return socketReady;
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('The call server did not respond.'));
      }, CHANNEL_READY_TIMEOUT_MS);
      const cleanup = () => {
        clearTimeout(timer);
        activeSocket.off('connect', onConnect);
        activeSocket.off('connect_error', onError);
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(new Error(error.message || 'The call server rejected the connection.'));
      };
      activeSocket.once('connect', onConnect);
      activeSocket.once('connect_error', onError);
    });
    socketReady = ready;
    try {
      await ready;
    } finally {
      if (socketReady === ready) socketReady = null;
    }
  };

  const ensureOutboundChannel = (recipientId: string) => {
    const client = supabase;
    if (!client) throw new Error('Supabase realtime is not configured.');
    const existing = outboundChannels.get(recipientId);
    if (existing) return existing;
    const channel = client.channel(callSignalChannelName(recipientId), {
      config: { broadcast: { self: false } },
    });
    const entry = {
      channel,
      ready: awaitChannelSubscription(channel, 'Outgoing call').catch((error) => {
        outboundChannels.delete(recipientId);
        void client.removeChannel(channel);
        throw error;
      }),
    };
    outboundChannels.set(recipientId, entry);
    return entry;
  };

  const connect = async () => {
    if (destroyed) throw new Error('This call session has been closed.');
    if (inboundReady) {
      await inboundReady;
      return socket;
    }
    inboundReady = (async () => {
      const userId = await currentCallUserId();
      activeUserId = userId;
      if (supabase) {
        inboundChannel = supabase.channel(callSignalChannelName(userId), {
          config: { broadcast: { self: false } },
        });
        inboundChannel.on('broadcast', { event: CALL_SIGNAL_EVENT }, ({ payload }) => {
          void safelyReceive(payload as WireSignal);
        });
        await awaitChannelSubscription(inboundChannel, 'Incoming call');
        return;
      }

      const url = inferSignalingUrl();
      if (!url) throw new Error('The call server URL is missing.');
      socket = io(url, {
        transports: ['websocket'],
        auth: { token: `demo:${userId}` },
        reconnection: true,
      });
      socket.on('signal', (signal: WireSignal) => {
        void safelyReceive({ ...signal, recipientId: signal.recipientId || userId });
      });
      await waitForSocket(socket);
    })().catch((error) => {
      if (inboundChannel && supabase) void supabase.removeChannel(inboundChannel);
      inboundChannel = null;
      socket?.disconnect();
      socket = null;
      inboundReady = null;
      throw error;
    });
    await inboundReady;
    return socket;
  };

  const send = async (signal: CallSignal) => {
    await connect();
    const senderId = activeUserId || await currentCallUserId();
    const wireSignal = buildWireSignal(signal, senderId);
    if (supabase) {
      const { channel, ready } = ensureOutboundChannel(signal.recipientId);
      await ready;
      const result = await channel.send({
        type: 'broadcast',
        event: CALL_SIGNAL_EVENT,
        payload: wireSignal,
      });
      if (result !== 'ok') throw new Error(`Call signal was not delivered (${result}).`);
      return;
    }
    const active = socket;
    if (!active) throw new Error('The call server connection is unavailable.');
    await waitForSocket(active);
    await new Promise<void>((resolve, reject) => {
      active.emit(
        'signal',
        wireSignal,
        (result: { ok: boolean; error?: string }) =>
          result.ok ? resolve() : reject(new Error(result.error || 'signal_failed')),
      );
    });
  };

  const closeMedia = () => {
    clearSessionTimers();
    if (sharedScreenTrack) {
      sharedScreenTrack.onended = null;
      sharedScreenTrack.stop();
    }
    sharedScreenTrack = null;
    videoSender = null;
    cameraTrack = null;
    makingOffer = false;
    ignoreOffer = false;
    isSettingRemoteAnswerPending = false;
    renegotiationChain = Promise.resolve();
    const local = session?.localStream as MediaStream | undefined;
    local?.getTracks().forEach((track) => track.stop());
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      peer.oniceconnectionstatechange = null;
      peer.close();
    }
    peer = null;
    remoteMediaStream = null;
    queuedCandidates = [];
    queuedLocalCandidates = [];
    canSendLocalCandidates = false;
  };

  const failCall = (message: string, notifyRemote = true) => {
    if (!session || session.phase === 'ended' || session.phase === 'failed') return;
    const failedSession = session;
    closeMedia();
    pendingOffer = null;
    transition('fail', { error: message, canRetryAccept: false, screenSharing: false });
    if (notifyRemote) {
      void send({
        sessionId: failedSession.id,
        recipientId: failedSession.recipientId,
        type: 'hangup',
        payload: { reason: 'failed' },
      }).catch(() => undefined);
    }
  };

  const sendCandidate = (activeSession: CallSession, candidate: RTCIceCandidateInit) =>
    send({
      sessionId: activeSession.id,
      recipientId: activeSession.recipientId,
      type: 'ice-candidate',
      payload: { candidate },
    }).catch(() => {
      if (session?.id === activeSession.id) failCall('The call lost its signaling connection.', false);
    });

  const flushLocalCandidates = async (activeSession: CallSession) => {
    canSendLocalCandidates = true;
    const candidates = queuedLocalCandidates;
    queuedLocalCandidates = [];
    for (const candidate of candidates) await sendCandidate(activeSession, candidate);
  };

  const markPeerConnected = () => {
    clearTimer(connectionTimer);
    clearTimer(disconnectTimer);
    connectionTimer = null;
    disconnectTimer = null;
    transition('peer-connected', {
      connectedAt: session?.connectedAt || Date.now(),
      error: undefined,
      canRetryAccept: false,
    });
  };

  const scheduleDisconnectFailure = () => {
    if (disconnectTimer) return;
    disconnectTimer = setTimeout(() => {
      disconnectTimer = null;
      if (peer?.connectionState === 'disconnected' || peer?.iceConnectionState === 'disconnected') {
        failCall('The peer connection was interrupted.');
      }
    }, DISCONNECT_GRACE_MS);
  };

  const createPeer = (activeSession: CallSession) => {
    const connection = new RTCPeerConnection(rtcConfiguration);
    connection.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      const value = candidate.toJSON();
      if (!canSendLocalCandidates) queuedLocalCandidates.push(value);
      else void sendCandidate(activeSession, value);
    };
    connection.ontrack = ({ track, streams }) => {
      const stream = streams[0] || remoteMediaStream || new MediaStream();
      if (!streams[0] && !stream.getTracks().some((item) => item.id === track.id)) stream.addTrack(track);
      remoteMediaStream = stream;
      publish({
        remoteStream: stream,
        ...(track.kind === 'video' ? { remoteVideoEnabled: !track.muted && track.readyState === 'live' } : {}),
      });
      if (track.kind === 'video') {
        track.onmute = () => publish({ remoteVideoEnabled: false });
        track.onunmute = () => publish({ remoteVideoEnabled: true });
        track.onended = () => publish({ remoteVideoEnabled: false, remoteScreenSharing: false });
      }
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'connected') markPeerConnected();
      else if (connection.connectionState === 'disconnected') scheduleDisconnectFailure();
      else if (connection.connectionState === 'failed') failCall('The peer connection failed.');
    };
    connection.oniceconnectionstatechange = () => {
      if (connection.iceConnectionState === 'connected' || connection.iceConnectionState === 'completed') {
        markPeerConnected();
      } else if (connection.iceConnectionState === 'disconnected') {
        scheduleDisconnectFailure();
      } else if (connection.iceConnectionState === 'failed') {
        failCall('The network could not establish a media path for this call.');
      }
    };
    peer = connection;
    return connection;
  };

  const detectCameraCapabilities = async (track: MediaStreamTrack) => {
    const facingModes = track.getCapabilities?.().facingMode;
    const devices = await navigator.mediaDevices.enumerateDevices?.().catch(() => []) || [];
    return detectCanSwitchCamera({
      facingModes: Array.isArray(facingModes) ? facingModes : facingModes ? [facingModes] : [],
      videoInputCount: devices.filter((device) => device.kind === 'videoinput').length,
      mobileHint: isMobileBrowser(),
    });
  };

  const sendMediaState = (activeSession: CallSession) =>
    send({
      sessionId: activeSession.id,
      recipientId: activeSession.recipientId,
      type: 'media-state',
      payload: {
        videoEnabled: Boolean(sharedScreenTrack || cameraTrack),
        screenSharing: Boolean(sharedScreenTrack),
      },
    });

  const performRenegotiation = async (activeSession: CallSession) => {
    const connection = peer;
    if (!connection || connection.signalingState === 'closed') return;
    if (connection.signalingState !== 'stable') {
      await new Promise<void>((resolve) => setTimeout(resolve, 60));
      if (!peer || peer.signalingState !== 'stable') return;
    }
    try {
      makingOffer = true;
      const description = await connection.createOffer();
      await connection.setLocalDescription(description);
      await send({
        sessionId: activeSession.id,
        recipientId: activeSession.recipientId,
        type: 'renegotiate-offer',
        payload: { description: connection.localDescription || description },
      });
    } finally {
      makingOffer = false;
    }
  };

  const renegotiate = (activeSession: CallSession) => {
    renegotiationChain = renegotiationChain
      .catch(() => undefined)
      .then(() => performRenegotiation(activeSession));
    return renegotiationChain;
  };

  const registerLocalTracks = async (connection: RTCPeerConnection, localStream: MediaStream) => {
    for (const track of localStream.getTracks()) {
      const sender = connection.addTrack(track, localStream);
      if (track.kind === 'video') {
        videoSender = sender;
        cameraTrack = track;
        publish({
          cameraOff: false,
          localVideoEnabled: true,
          canSwitchCamera: await detectCameraCapabilities(track),
        });
      }
    }
  };

  const acquireMedia = async (kind: CallKind) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && !window.isSecureContext) {
      throw new Error(describeCallError(new Error('insecure_context')));
    }
    if (typeof RTCPeerConnection === 'undefined') throw new Error('This browser does not support WebRTC calls.');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera and microphone access is unavailable in this browser.');
    }
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === 'video' ? { facingMode: 'user' } : false,
      });
    } catch (error) {
      throw new Error(describeCallError(error));
    }
  };

  const applyQueuedCandidates = async () => {
    if (!peer?.remoteDescription) return;
    const candidates = queuedCandidates;
    queuedCandidates = [];
    for (const candidate of candidates) await peer.addIceCandidate(candidate);
  };

  const startConnectionTimeout = () => {
    clearTimer(connectionTimer);
    connectionTimer = setTimeout(() => {
      connectionTimer = null;
      if (session?.phase !== 'connected') failCall('The call could not connect in time.');
    }, CONNECTION_TIMEOUT_MS);
  };

  const startRingTimeout = () => {
    clearTimer(ringTimer);
    ringTimer = setTimeout(() => {
      ringTimer = null;
      if (!session || (!['connecting', 'ringing'].includes(session.phase)
        && !(session.phase === 'failed' && session.canRetryAccept))) return;
      const expired = session;
      closeMedia();
      pendingOffer = null;
      transition('fail', { error: 'The call was not answered.', canRetryAccept: false });
      void send({
        sessionId: expired.id,
        recipientId: expired.recipientId,
        type: 'hangup',
        payload: { reason: 'timeout' },
      }).catch(() => undefined);
    }, RING_TIMEOUT_MS);
  };

  const startOfferRetries = (offer: CallSignal) => {
    let attempts = 0;
    const retry = () => {
      clearTimer(offerRetryTimer);
      offerRetryTimer = setTimeout(() => {
        if (!session || session.id !== offer.sessionId || session.phase !== 'connecting') return;
        if (attempts >= MAX_OFFER_RETRIES) return;
        attempts += 1;
        void send(offer).then(retry).catch(() => retry());
      }, OFFER_RETRY_MS);
    };
    retry();
  };

  const acknowledgeRinging = (signal: WireSignal) => {
    void send({
      sessionId: signal.callId,
      recipientId: signal.senderId,
      type: 'ringing',
    }).catch(() => undefined);
  };

  const receive = async (signal: WireSignal) => {
    if (!activeUserId || !isWireSignalForUser(signal, activeUserId)) return;
    if (!Number.isFinite(signal.sentAt) || Date.now() - signal.sentAt > MAX_SIGNAL_AGE_MS) return;

    if (signal.type === 'offer') {
      if (!signal.payload?.description) return;
      if (session?.id === signal.callId && session.direction === 'incoming') {
        if (session.phase === 'ringing' || (session.phase === 'failed' && session.canRetryAccept)) {
          pendingOffer = signal;
          acknowledgeRinging(signal);
        }
        return;
      }
      if (session && !['ended', 'failed'].includes(session.phase)) {
        void send({
          sessionId: signal.callId,
          recipientId: signal.senderId,
          type: 'hangup',
          payload: { reason: 'busy' },
        }).catch(() => undefined);
        return;
      }
      closeMedia();
      pendingOffer = signal;
      session = {
        id: signal.callId,
        conversationId: signal.payload.conversationId || signal.senderId,
        recipientId: signal.senderId,
        kind: signal.payload.kind || 'audio',
        phase: nextCallPhase(null, 'receive-offer') || 'ringing',
        direction: 'incoming',
        remoteName: signal.payload.callerName,
        remoteAvatarUrl: signal.payload.callerAvatarUrl,
        cameraOff: true,
        localVideoEnabled: false,
        remoteVideoEnabled: signal.payload.kind === 'video',
        cameraFacingMode: 'user',
        canShareScreen: supportsScreenShare(),
      };
      publish({});
      startRingTimeout();
      acknowledgeRinging(signal);
      return;
    }

    if (!session || signal.callId !== session.id || session.phase === 'ended') return;
    if (signal.type === 'ringing' && session.direction === 'outgoing') {
      clearTimer(offerRetryTimer);
      offerRetryTimer = null;
      transition('remote-ringing');
      return;
    }
    if (signal.type === 'answer' && signal.payload?.description && peer && session.direction === 'outgoing') {
      clearTimer(offerRetryTimer);
      clearTimer(ringTimer);
      offerRetryTimer = null;
      ringTimer = null;
      if (!peer.currentRemoteDescription) await peer.setRemoteDescription(signal.payload.description);
      await applyQueuedCandidates();
      transition('answer');
      startConnectionTimeout();
      return;
    }
    if (signal.type === 'renegotiate-offer' && signal.payload?.description && peer) {
      const readyForOffer = !makingOffer
        && (peer.signalingState === 'stable' || isSettingRemoteAnswerPending);
      const offerCollision = !readyForOffer;
      const polite = activeUserId.localeCompare(session.recipientId) > 0;
      ignoreOffer = !polite && offerCollision;
      if (ignoreOffer) return;
      if (offerCollision) {
        await Promise.all([
          peer.setLocalDescription({ type: 'rollback' }),
          peer.setRemoteDescription(signal.payload.description),
        ]);
      } else {
        await peer.setRemoteDescription(signal.payload.description);
      }
      await applyQueuedCandidates();
      const description = await peer.createAnswer();
      await peer.setLocalDescription(description);
      await send({
        sessionId: session.id,
        recipientId: session.recipientId,
        type: 'renegotiate-answer',
        payload: { description: peer.localDescription || description },
      });
      return;
    }
    if (signal.type === 'renegotiate-answer' && signal.payload?.description && peer) {
      if (peer.signalingState !== 'have-local-offer') return;
      isSettingRemoteAnswerPending = true;
      try {
        await peer.setRemoteDescription(signal.payload.description);
        await applyQueuedCandidates();
      } finally {
        isSettingRemoteAnswerPending = false;
      }
      return;
    }
    if (signal.type === 'media-state') {
      publish({
        remoteVideoEnabled: Boolean(signal.payload?.videoEnabled),
        remoteScreenSharing: Boolean(signal.payload?.screenSharing),
      });
      return;
    }
    if (signal.type === 'ice-candidate' && signal.payload?.candidate) {
      if (peer?.remoteDescription) {
        try {
          await peer.addIceCandidate(signal.payload.candidate);
        } catch (error) {
          if (!ignoreOffer) throw error;
        }
      }
      else queuedCandidates.push(signal.payload.candidate);
      return;
    }
    if (signal.type === 'hangup') {
      closeMedia();
      pendingOffer = null;
      transition('end', { screenSharing: false, canRetryAccept: false });
    }
  };

  async function safelyReceive(signal: WireSignal) {
    try {
      await receive(signal);
    } catch (error) {
      failCall(describeCallError(error));
    }
  }

  const stopScreenShare = async () => {
    const track = sharedScreenTrack;
    sharedScreenTrack = null;
    if (track) track.onended = null;
    if (videoSender) await videoSender.replaceTrack(cameraTrack || null);
    if (track && track.readyState !== 'ended') track.stop();
    publish({ screenSharing: false });
    if (session) await sendMediaState(session);
  };

  const unsupported = () => {
    throw new Error('Native WebRTC requires a Social 24x7 development build; Expo Go cannot load native WebRTC. Use the secure web build on this phone for the current QA round.');
  };

  return {
    async startCall({ conversationId, recipientId, kind, callerName, callerAvatarUrl, remoteName, remoteAvatarUrl }) {
      if (Platform.OS !== 'web') return unsupported();
      await connect();
      if (session && !['ended', 'failed'].includes(session.phase)) throw new Error('End the current call before starting another.');
      closeMedia();
      session = {
        id: crypto.randomUUID(),
        conversationId,
        recipientId,
        kind,
        phase: nextCallPhase(null, 'start-outgoing') || 'connecting',
        direction: 'outgoing',
        remoteName,
        remoteAvatarUrl,
        cameraOff: kind !== 'video',
        localVideoEnabled: kind === 'video',
        remoteVideoEnabled: kind === 'video',
        cameraFacingMode: 'user',
        canShareScreen: supportsScreenShare(),
      };
      publish({});
      try {
        const localStream = await acquireMedia(kind);
        publish({ localStream });
        const activeSession = session;
        const connection = createPeer(activeSession);
        await registerLocalTracks(connection, localStream);
        const description = await connection.createOffer();
        await connection.setLocalDescription(description);
        const offer: CallSignal = {
          sessionId: activeSession.id,
          recipientId,
          type: 'offer',
          payload: {
            description: connection.localDescription || description,
            kind,
            conversationId,
            callerName: callerName || await currentCallUserName() || undefined,
            callerAvatarUrl,
          },
        };
        await send(offer);
        await flushLocalCandidates(activeSession);
        startOfferRetries(offer);
        startRingTimeout();
        return session;
      } catch (error) {
        closeMedia();
        transition('fail', { error: describeCallError(error), canRetryAccept: false });
        throw error;
      }
    },
    async acceptCall(sessionId) {
      if (Platform.OS !== 'web') return unsupported();
      if (!session || !pendingOffer || session.id !== sessionId) {
        throw new Error('The incoming call is no longer available.');
      }
      const offer = pendingOffer;
      pendingOffer = null;
      clearTimer(ringTimer);
      ringTimer = null;
      transition('accept', { error: undefined, canRetryAccept: false });
      try {
        const localStream = await acquireMedia(session.kind);
        publish({ localStream });
        const activeSession = session;
        const connection = createPeer(activeSession);
        await registerLocalTracks(connection, localStream);
        await connection.setRemoteDescription(offer.payload!.description!);
        await applyQueuedCandidates();
        const description = await connection.createAnswer();
        await connection.setLocalDescription(description);
        await send({
          sessionId,
          recipientId: activeSession.recipientId,
          type: 'answer',
          payload: { description: connection.localDescription || description, kind: activeSession.kind },
        });
        await flushLocalCandidates(activeSession);
        startConnectionTimeout();
      } catch (error) {
        pendingOffer = offer;
        closeMedia();
        transition('fail', {
          error: describeCallError(error),
          canRetryAccept: true,
        });
        startRingTimeout();
        throw error;
      }
    },
    async endCall(sessionId) {
      if (!session || session.id !== sessionId) return;
      const ending = session;
      const reason = ending.direction === 'incoming' && (ending.phase === 'ringing' || ending.canRetryAccept)
        ? 'declined'
        : ending.direction === 'outgoing' && ['connecting', 'ringing'].includes(ending.phase)
          ? 'cancelled'
          : 'ended';
      pendingOffer = null;
      try {
        await send({
          sessionId,
          recipientId: ending.recipientId,
          type: 'hangup',
          payload: { reason },
        });
      } finally {
        closeMedia();
        transition('end', { screenSharing: false, canRetryAccept: false });
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
      if (!session || session.id !== sessionId || !peer || session.phase !== 'connected') return;
      const activeSession = session;
      const stream = session.localStream as MediaStream | undefined;
      if (!stream) throw new Error('The local call media is unavailable.');
      if (cameraTrack) {
        const previousTrack = cameraTrack;
        cameraTrack = null;
        await replaceLocalVideoTrack({
          stream,
          sender: videoSender,
          currentTrack: previousTrack,
          nextTrack: null,
          updateSender: !sharedScreenTrack,
        });
        publish({ cameraOff: true, localVideoEnabled: false, canSwitchCamera: false });
        await sendMediaState(activeSession);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable in this browser.');
      let cameraStream: MediaStream;
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: session.cameraFacingMode || 'user' } },
        });
      } catch (error) {
        throw new Error(describeCallError(error));
      }
      const nextTrack = cameraStream.getVideoTracks()[0];
      if (!nextTrack) throw new Error('No camera was found.');
      cameraTrack = nextTrack;
      if (!sharedScreenTrack) {
        if (videoSender) {
          await replaceLocalVideoTrack({ stream, sender: videoSender, nextTrack });
        }
        else {
          stream.addTrack(nextTrack);
          videoSender = peer.addTrack(nextTrack, stream);
          await renegotiate(activeSession);
        }
      } else {
        await replaceLocalVideoTrack({ stream, nextTrack, updateSender: false });
      }
      publish({
        cameraOff: false,
        localVideoEnabled: true,
        canSwitchCamera: await detectCameraCapabilities(nextTrack),
      });
      await sendMediaState(activeSession);
    },
    async switchCamera(sessionId) {
      if (!session || session.id !== sessionId || !peer || session.phase !== 'connected' || !cameraTrack) return;
      const activeSession = session;
      const stream = session.localStream as MediaStream | undefined;
      if (!stream) throw new Error('The local call media is unavailable.');
      const facingMode: CameraFacingMode = nextCameraFacingMode(session.cameraFacingMode);
      let cameraStream: MediaStream;
      try {
        try {
          cameraStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { exact: facingMode } },
          });
        } catch {
          cameraStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: facingMode } },
          });
        }
      } catch (error) {
        throw new Error(describeCallError(error));
      }
      const nextTrack = cameraStream.getVideoTracks()[0];
      if (!nextTrack) throw new Error('The requested camera is unavailable.');
      const previousTrack = cameraTrack;
      cameraTrack = nextTrack;
      await replaceLocalVideoTrack({
        stream,
        sender: videoSender,
        currentTrack: previousTrack,
        nextTrack,
        updateSender: !sharedScreenTrack,
      });
      publish({
        cameraFacingMode: facingMode,
        canSwitchCamera: await detectCameraCapabilities(nextTrack),
      });
    },
    async shareScreen(sessionId) {
      if (Platform.OS !== 'web') return unsupported();
      if (!session || session.id !== sessionId || !peer || session.phase !== 'connected') {
        throw new Error('Connect the call before sharing your screen.');
      }
      if (sharedScreenTrack) {
        await stopScreenShare();
        return;
      }
      if (!supportsScreenShare() || !navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('Screen sharing is not supported by this browser.');
      }
      let display: MediaStream;
      try {
        display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      } catch (error) {
        throw new Error(error instanceof Error && /notallowed|permission|denied/i.test(error.message)
          ? 'Screen sharing was cancelled or blocked.'
          : describeCallError(error));
      }
      const screenTrack = display.getVideoTracks()[0];
      if (!screenTrack) throw new Error('No screen was selected.');
      const activeSession = session;
      sharedScreenTrack = screenTrack;
      if (videoSender) await videoSender.replaceTrack(screenTrack);
      else {
        videoSender = peer.addTrack(screenTrack, display);
        await renegotiate(activeSession);
      }
      publish({ screenSharing: true });
      await sendMediaState(activeSession);
      screenTrack.onended = () => { void stopScreenShare(); };
    },
    subscribe(listener) {
      listeners.add(listener);
      void connect().catch((error) => {
        if (session) transition('fail', { error: describeCallError(error) });
      });
      if (session) listener(session);
      return () => listeners.delete(listener);
    },
    async destroy() {
      if (destroyed) return;
      closeMedia();
      pendingOffer = null;
      destroyed = true;
      listeners.clear();
      socket?.disconnect();
      socket = null;
      socketReady = null;
      inboundReady = null;
      activeUserId = '';
      if (supabase) {
        const client = supabase;
        const removals: Promise<unknown>[] = [];
        if (inboundChannel) removals.push(client.removeChannel(inboundChannel));
        outboundChannels.forEach(({ channel }) => removals.push(client.removeChannel(channel)));
        await Promise.allSettled(removals);
      }
      inboundChannel = null;
      outboundChannels.clear();
    },
  };
}
