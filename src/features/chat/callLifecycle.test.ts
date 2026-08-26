import assert from 'node:assert/strict';
import test from 'node:test';

import { nextCallPhase, type CallLifecycleEvent } from './callLifecycle.ts';
import type { CallPhase } from './types.ts';

const run = (events: CallLifecycleEvent[]) =>
  events.reduce<CallPhase | null>((phase, event) => nextCallPhase(phase, event), null);

test('outgoing accepted call connects only after the peer connects', () => {
  let phase: CallPhase | null = null;
  phase = nextCallPhase(phase, 'start-outgoing');
  assert.equal(phase, 'connecting');
  phase = nextCallPhase(phase, 'remote-ringing');
  assert.equal(phase, 'ringing');
  phase = nextCallPhase(phase, 'answer');
  assert.equal(phase, 'connecting');
  phase = nextCallPhase(phase, 'peer-connected');
  assert.equal(phase, 'connected');
  assert.equal(nextCallPhase(phase, 'end'), 'ended');
});
test('incoming accept follows ringing to connecting to connected', () => {
  assert.equal(run(['receive-offer', 'accept']), 'connecting');
  assert.equal(run(['receive-offer', 'accept', 'peer-connected']), 'connected');
});

test('decline, outgoing cancel and either-side hangup are terminal', () => {
  assert.equal(run(['receive-offer', 'end']), 'ended');
  assert.equal(run(['start-outgoing', 'end']), 'ended');
  assert.equal(run(['start-outgoing', 'remote-ringing', 'answer', 'peer-connected', 'end']), 'ended');
  assert.equal(run(['receive-offer', 'accept', 'peer-connected', 'end']), 'ended');
});

test('late signaling cannot revive an ended call', () => {
  const ended = run(['receive-offer', 'end']);
  assert.equal(nextCallPhase(ended, 'accept'), 'ended');
  assert.equal(nextCallPhase(ended, 'answer'), 'ended');
  assert.equal(nextCallPhase(ended, 'peer-connected'), 'ended');
});

test('a recoverable incoming media failure can be accepted again', () => {
  let phase = run(['receive-offer', 'accept', 'fail']);
  assert.equal(phase, 'failed');
  phase = nextCallPhase(phase, 'accept');
  assert.equal(phase, 'connecting');
});
