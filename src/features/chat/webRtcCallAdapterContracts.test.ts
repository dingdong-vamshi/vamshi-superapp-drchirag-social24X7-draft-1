import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./webRtcCallAdapter.ts', import.meta.url), 'utf8');
const providerSource = readFileSync(new URL('./CallProvider.tsx', import.meta.url), 'utf8');
const overlaySource = readFileSync(new URL('./CallOverlay.tsx', import.meta.url), 'utf8');

test('calls route to the authenticated recipient and wait for realtime readiness', () => {
  assert.match(source, /social24-calls:\$\{userId\}/);
  assert.match(source, /if \(!user\?\.id\) throw new Error\('Sign in on this device before starting or receiving calls\.'\)/);
  assert.match(source, /await awaitChannelSubscription\(inboundChannel, 'Incoming call'\)/);
  assert.match(source, /await ready;\s*const result = await channel\.send/s);
  assert.match(source, /isWireSignalForUser\(signal, activeUserId\)/);
  assert.doesNotMatch(source, /return user\?\.id \|\| 'anonymous'/);
});

test('offer delivery uses acknowledgement, bounded retries, stale filtering and timeouts', () => {
  assert.match(source, /type: 'ringing'/);
  assert.match(source, /MAX_OFFER_RETRIES = 3/);
  assert.match(source, /startOfferRetries\(offer\)/);
  assert.match(source, /startRingTimeout\(\)/);
  assert.match(source, /Date\.now\(\) - signal\.sentAt > MAX_SIGNAL_AGE_MS/);
  assert.match(source, /The call was not answered\./);
});

test('ICE candidates cannot overtake the offer or answer', () => {
  assert.match(source, /queuedLocalCandidates/);
  assert.match(source, /if \(!canSendLocalCandidates\) queuedLocalCandidates\.push\(value\)/);
  assert.match(source, /await send\(offer\);\s*await flushLocalCandidates\(activeSession\)/s);
  assert.match(source, /type: 'answer',[\s\S]*await flushLocalCandidates\(activeSession\)/);
});

test('connected is driven only by real peer or ICE state', () => {
  assert.match(source, /connection\.connectionState === 'connected'/);
  assert.match(source, /connection\.iceConnectionState === 'connected' \|\| connection\.iceConnectionState === 'completed'/);
  assert.match(source, /transition\('peer-connected'/);
  assert.doesNotMatch(source, /publish\(\{ phase: 'connected'/);
});

test('accept errors are retryable but terminal failures cannot revive a call', () => {
  assert.match(source, /!window\.isSecureContext/);
  assert.match(source, /local http:\/\/ IP links can receive rings but cannot open the microphone\/camera/);
  assert.match(source, /pendingOffer = offer;\s*closeMedia\(\);\s*transition\('fail',[\s\S]*canRetryAccept: true/s);
  assert.match(source, /session\.phase === 'ended'\) return/);
});

test('disconnect recovery, cleanup and screen-share restoration are explicit', () => {
  assert.match(source, /DISCONNECT_GRACE_MS = 8_000/);
  assert.match(source, /startConnectionTimeout\(\)/);
  assert.match(source, /clearSessionTimers\(\)/);
  assert.match(source, /peer\.onicecandidate = null/);
  assert.match(source, /await videoSender\.replaceTrack\(cameraTrack \|\| null\)/);
  assert.match(source, /if \(sharedScreenTrack\) \{\s*await stopScreenShare\(\)/s);
  assert.match(source, /async destroy\(\)/);
});

test('connected audio calls can add and remove video without replacing the peer', () => {
  assert.match(source, /videoSender = peer\.addTrack\(nextTrack, stream\);\s*await renegotiate\(activeSession\)/s);
  assert.match(source, /replaceLocalVideoTrack\(\{[\s\S]*nextTrack: null,[\s\S]*updateSender: !sharedScreenTrack/s);
  assert.match(source, /type: 'renegotiate-offer'/);
  assert.match(source, /type: 'renegotiate-answer'/);
  assert.match(source, /const polite = activeUserId\.localeCompare\(session\.recipientId\) > 0/);
});

test('camera, screen share and remote media state preserve the audio session', () => {
  assert.match(source, /type: 'media-state'/);
  assert.match(source, /remoteVideoEnabled: Boolean\(signal\.payload\?\.videoEnabled\)/);
  assert.match(source, /async switchCamera\(sessionId\)/);
  assert.match(source, /getDisplayMedia\(\{ video: true \}\)/);
  assert.doesNotMatch(source, /session\.kind !== 'video'/);
});

test('the authenticated app shell owns one call subscription across navigation', () => {
  assert.match(providerSource, /user\?\.id && !isDemoUser \? createWebRtcCallAdapter\(\)/);
  assert.match(providerSource, /adapter\.subscribe/);
  assert.match(providerSource, /adapter\.destroy\?\.\(\)/);
  assert.match(providerSource, /<CallOverlay session=\{session\} adapter=\{adapter\} \/>/);
  assert.match(overlaySource, /session\.canRetryAccept/);
  assert.match(overlaySource, /Stop share/);
  assert.match(overlaySource, /formatCallDuration/);
  assert.match(overlaySource, /session\.canSwitchCamera/);
  assert.match(overlaySource, /session\.canShareScreen/);
});
