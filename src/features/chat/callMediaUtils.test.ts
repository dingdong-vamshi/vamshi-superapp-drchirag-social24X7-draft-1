import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canShareDisplay,
  canSwitchCamera,
  formatCallDuration,
  nextCameraFacingMode,
  replaceLocalVideoTrack,
} from './callMediaUtils.ts';

test('call duration starts at zero and formats minute and hour boundaries', () => {
  assert.equal(formatCallDuration(0), '00:00');
  assert.equal(formatCallDuration(8), '00:08');
  assert.equal(formatCallDuration(84), '01:24');
  assert.equal(formatCallDuration(3723), '01:02:03');
  assert.equal(formatCallDuration(-5), '00:00');
});

test('camera facing mode switches front to rear and back without inventing a device', () => {
  assert.equal(nextCameraFacingMode('user'), 'environment');
  assert.equal(nextCameraFacingMode('environment'), 'user');
  assert.equal(nextCameraFacingMode(), 'environment');
});

test('camera switch requires real facing capabilities or multiple mobile cameras', () => {
  assert.equal(canSwitchCamera({ facingModes: ['user', 'environment'], videoInputCount: 1, mobileHint: false }), true);
  assert.equal(canSwitchCamera({ videoInputCount: 2, mobileHint: true }), true);
  assert.equal(canSwitchCamera({ videoInputCount: 2, mobileHint: false }), false);
  assert.equal(canSwitchCamera({ videoInputCount: 1, mobileHint: true }), false);
});

test('screen sharing is exposed only when capture exists on a non-mobile browser', () => {
  assert.equal(canShareDisplay({ hasDisplayMedia: true, mobileHint: false }), true);
  assert.equal(canShareDisplay({ hasDisplayMedia: true, mobileHint: true }), false);
  assert.equal(canShareDisplay({ hasDisplayMedia: false, mobileHint: false }), false);
});

test('camera replacement updates the actual sender and stream before stopping the old track', async () => {
  const events: string[] = [];
  const oldTrack = { id: 'front', stop: () => events.push('stop:front') };
  const rearTrack = { id: 'rear' };
  const tracks = [oldTrack];
  const stream = {
    getTracks: () => tracks,
    removeTrack: (track: typeof oldTrack) => {
      events.push(`remove:${track.id}`);
      tracks.splice(tracks.indexOf(track), 1);
    },
    addTrack: (track: typeof rearTrack) => {
      events.push(`add:${track.id}`);
      tracks.push(track as typeof oldTrack);
    },
  };
  const sender = { replaceTrack: async (track: typeof rearTrack) => { events.push(`send:${track.id}`); } };

  await replaceLocalVideoTrack({
    stream: stream as never,
    sender: sender as never,
    currentTrack: oldTrack as never,
    nextTrack: rearTrack as never,
  });

  assert.deepEqual(events, ['send:rear', 'remove:front', 'add:rear', 'stop:front']);
  assert.deepEqual(tracks.map((track) => track.id), ['rear']);
});

test('camera removal can leave a screen-share sender untouched while stopping capture', async () => {
  const events: string[] = [];
  const camera = { id: 'camera', stop: () => events.push('stop') };
  const tracks = [camera];
  const stream = {
    getTracks: () => tracks,
    removeTrack: () => { events.push('remove'); tracks.splice(0, 1); },
    addTrack: () => undefined,
  };
  const sender = { replaceTrack: async () => { events.push('replace'); } };

  await replaceLocalVideoTrack({
    stream: stream as never,
    sender: sender as never,
    currentTrack: camera as never,
    nextTrack: null,
    updateSender: false,
  });

  assert.deepEqual(events, ['remove', 'stop']);
});
