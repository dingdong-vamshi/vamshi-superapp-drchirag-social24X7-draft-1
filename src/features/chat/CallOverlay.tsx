import { createElement, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  PhoneOff,
  RefreshCw,
  Video,
  VideoOff,
} from 'lucide-react-native';

import { formatCallDuration } from './callMediaUtils';
import type { CallAdapter, CallSession } from './types';

function StreamVideo({ stream, muted, mode, hidden }: {
  stream?: unknown;
  muted?: boolean;
  mode: 'remote' | 'local';
  hidden?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.srcObject = (stream as MediaStream | undefined) || null;
    if (stream) void element.play().catch(() => undefined);
    return () => { element.srcObject = null; };
  }, [stream]);
  if (Platform.OS !== 'web' || !stream) return null;
  return createElement('video', {
    ref: videoRef,
    autoPlay: true,
    playsInline: true,
    muted,
    'aria-hidden': true,
    style: hidden
      ? { position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }
      : mode === 'local'
        ? { width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#18231f', transform: 'scaleX(-1)' }
        : { width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#0b1411' },
  });
}

function CallButton({ label, icon, action, danger, success, active, compact }: {
  label: string;
  icon: ReactNode;
  action: () => void;
  danger?: boolean;
  success?: boolean;
  active?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={[styles.callButtonWrap, compact && styles.callButtonWrapCompact]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        onPress={action}
        style={({ pressed }) => [
          styles.callButton,
          compact && styles.callButtonCompact,
          active && styles.callButtonActive,
          danger && styles.callButtonDanger,
          success && styles.callButtonSuccess,
          pressed && styles.callButtonPressed,
        ]}
      >
        {icon}
      </Pressable>
      <Text numberOfLines={2} style={styles.callButtonLabel}>{label}</Text>
    </View>
  );
}

const initialsFor = (name: string) => name
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase() || 'SC';

export default function CallOverlay({ session, adapter }: { session: CallSession | null; adapter: CallAdapter }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [clock, setClock] = useState(Date.now());
  const connectedAt = session?.phase === 'connected' ? session.connectedAt : undefined;

  useEffect(() => {
    if (!connectedAt) return;
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [connectedAt]);

  if (!session || session.phase === 'ended') return null;
  const participantName = session.remoteName || 'Social 24x7 caller';
  const incoming = session.direction === 'incoming'
    && (session.phase === 'ringing' || (session.phase === 'failed' && session.canRetryAccept));
  const connected = session.phase === 'connected';
  const duration = connectedAt ? formatCallDuration((clock - connectedAt) / 1_000) : '';
  const remoteVideoActive = connected && Boolean(session.remoteVideoEnabled && session.remoteStream);
  const localVideoActive = connected && Boolean(session.localVideoEnabled && session.localStream);
  const compact = width < 520;
  const shortViewport = height < 620;

  const run = async (action?: (id: string) => Promise<void>) => {
    if (!action) return;
    try {
      await action(session.id);
    } catch (cause) {
      Alert.alert('Call action unavailable', cause instanceof Error ? cause.message : 'Please try again.');
    }
  };
  const status = session.phase === 'failed'
    ? session.error || 'Call failed'
    : incoming
      ? `Incoming ${session.kind} call`
      : session.phase === 'ringing'
        ? 'Ringing…'
        : session.phase === 'connecting'
          ? 'Connecting securely…'
          : `Connected · ${duration}`;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" statusBarTranslucent>
      <View style={styles.callScreen}>
        <View style={styles.wallpaperGlowTop} />
        <View style={styles.wallpaperGlowBottom} />
        <View style={styles.remoteVideo}>
          <StreamVideo stream={session.remoteStream} mode="remote" hidden={!remoteVideoActive} />
          {!remoteVideoActive && (
            <View style={[styles.callIdentity, shortViewport && styles.callIdentityShort]}>
              <View style={[styles.callAvatar, shortViewport && styles.callAvatarShort]}>
                {session.remoteAvatarUrl ? (
                  <Image source={{ uri: session.remoteAvatarUrl }} style={styles.callAvatarImage} />
                ) : (
                  <Text style={styles.callAvatarText}>{initialsFor(participantName)}</Text>
                )}
              </View>
              <Text numberOfLines={1} style={styles.callName}>{participantName}</Text>
              <Text style={styles.callStatus}>{status}</Text>
              {session.remoteScreenSharing && <Text style={styles.shareBadge}>Sharing screen</Text>}
            </View>
          )}
          {remoteVideoActive && (
            <View style={[styles.videoHeader, { top: insets.top + 18 }]}>
              <View style={styles.videoHeaderText}>
                <Text numberOfLines={1} style={styles.videoName}>{participantName}</Text>
                <Text style={styles.videoStatus}>
                  {session.remoteScreenSharing ? `Screen sharing · ${duration}` : duration}
                </Text>
              </View>
            </View>
          )}
          {localVideoActive && (
            <View style={[
              styles.localPreview,
              compact && styles.localPreviewCompact,
              { top: insets.top + (compact ? 18 : 26) },
            ]}>
              <StreamVideo stream={session.localStream} muted mode="local" />
              <View style={styles.localLabel}><Text style={styles.localLabelText}>You</Text></View>
            </View>
          )}
        </View>
        <View style={[styles.callControls, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {incoming ? (
            <>
              <CallButton label="Decline" danger compact={compact} icon={<PhoneOff color="#ffffff" size={26} />} action={() => void run(adapter.endCall.bind(adapter))} />
              <CallButton label="Accept" success compact={compact} icon={<Phone color="#ffffff" size={26} />} action={() => void run(adapter.acceptCall?.bind(adapter))} />
            </>
          ) : (
            <>
              <CallButton
                label={session.muted ? 'Unmute' : 'Mute'} active={session.muted} compact={compact}
                icon={session.muted ? <MicOff color="#ffffff" size={24} /> : <Mic color="#ffffff" size={24} />}
                action={() => void run(adapter.toggleMute?.bind(adapter))}
              />
              {connected && (
                <CallButton
                  label={session.localVideoEnabled ? 'Video off' : 'Video on'} active={session.localVideoEnabled} compact={compact}
                  icon={session.localVideoEnabled ? <Video color="#ffffff" size={24} /> : <VideoOff color="#ffffff" size={24} />}
                  action={() => void run(adapter.toggleCamera?.bind(adapter))}
                />
              )}
              {connected && session.localVideoEnabled && session.canSwitchCamera && (
                <CallButton label="Switch" compact={compact} icon={<RefreshCw color="#ffffff" size={23} />} action={() => void run(adapter.switchCamera?.bind(adapter))} />
              )}
              {connected && session.canShareScreen && (
                <CallButton
                  label={session.screenSharing ? 'Stop share' : 'Share screen'} active={session.screenSharing} compact={compact}
                  icon={session.screenSharing ? <Camera color="#ffffff" size={23} /> : <MonitorUp color="#ffffff" size={23} />}
                  action={() => void run(adapter.shareScreen?.bind(adapter))}
                />
              )}
              <CallButton label="End" danger compact={compact} icon={<PhoneOff color="#ffffff" size={26} />} action={() => void run(adapter.endCall.bind(adapter))} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  callScreen: { flex: 1, backgroundColor: '#09130f', overflow: 'hidden' },
  wallpaperGlowTop: { position: 'absolute', width: 500, height: 500, borderRadius: 250, top: -280, right: -180, backgroundColor: 'rgba(18, 114, 72, 0.24)' },
  wallpaperGlowBottom: { position: 'absolute', width: 560, height: 560, borderRadius: 280, bottom: -390, left: -210, backgroundColor: 'rgba(5, 193, 96, 0.14)' },
  remoteVideo: { flex: 1, overflow: 'hidden', position: 'relative', backgroundColor: 'transparent' },
  callIdentity: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 48, paddingHorizontal: 28 },
  callIdentityShort: { paddingBottom: 12 },
  callAvatar: { width: 124, height: 124, borderRadius: 44, backgroundColor: '#08bd63', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 54px rgba(8,189,99,0.30)' },
  callAvatarShort: { width: 92, height: 92, borderRadius: 34 },
  callAvatarImage: { width: '100%', height: '100%' },
  callAvatarText: { color: '#ffffff', fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  callName: { color: '#ffffff', fontSize: 28, fontWeight: '800', marginTop: 24, maxWidth: 420 },
  callStatus: { color: '#aebdb5', fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 },
  shareBadge: { color: '#bdf4d6', fontSize: 12, fontWeight: '700', marginTop: 14, backgroundColor: 'rgba(7,193,96,0.18)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  videoHeader: { position: 'absolute', left: 22, right: 22, flexDirection: 'row', alignItems: 'center', zIndex: 3 },
  videoHeaderText: { borderRadius: 16, backgroundColor: 'rgba(5,12,9,0.58)', paddingHorizontal: 14, paddingVertical: 9 },
  videoName: { color: '#ffffff', fontSize: 17, fontWeight: '800', maxWidth: 260 },
  videoStatus: { color: '#d6e4dc', fontSize: 12, marginTop: 2 },
  localPreview: { position: 'absolute', right: 24, width: 156, height: 208, borderRadius: 22, overflow: 'hidden', backgroundColor: '#18231f', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', zIndex: 4, boxShadow: '0 12px 38px rgba(0,0,0,0.34)' },
  localPreviewCompact: { right: 16, width: 104, height: 142, borderRadius: 17 },
  localLabel: { position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(4,10,7,0.56)' },
  localLabelText: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
  callControls: { minHeight: 124, backgroundColor: 'rgba(9,19,15,0.96)', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 16, rowGap: 10, paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  callButtonWrap: { alignItems: 'center', width: 82, gap: 7 },
  callButtonWrapCompact: { width: 62 },
  callButton: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#2c3934', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  callButtonCompact: { width: 52, height: 52, borderRadius: 26 },
  callButtonActive: { backgroundColor: '#11784b', borderColor: '#21c978' },
  callButtonDanger: { backgroundColor: '#ed3f4f', borderColor: '#ff6d78' },
  callButtonSuccess: { backgroundColor: '#07b85e', borderColor: '#2be683' },
  callButtonPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  callButtonLabel: { color: '#e8efeb', fontSize: 11, lineHeight: 13, textAlign: 'center', fontWeight: '600' },
});
