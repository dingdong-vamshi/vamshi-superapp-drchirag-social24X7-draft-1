import type { CallPhase } from './types';

export type CallLifecycleEvent =
  | 'start-outgoing'
  | 'receive-offer'
  | 'remote-ringing'
  | 'accept'
  | 'answer'
  | 'peer-connected'
  | 'end'
  | 'fail';

/**
 * Small, deterministic state machine shared by the WebRTC adapter and tests.
 * Invalid late events are ignored so a declined/cancelled call cannot revive.
 */
export const nextCallPhase = (
  current: CallPhase | null,
  event: CallLifecycleEvent,
): CallPhase | null => {
  if (current === 'ended') return 'ended';

  switch (event) {
    case 'start-outgoing':
      return current === null ? 'connecting' : current;
    case 'receive-offer':
      return current === null || current === 'failed' ? 'ringing' : current;
    case 'remote-ringing':
      return current === 'connecting' ? 'ringing' : current;
    case 'accept':
      return current === 'ringing' || current === 'failed' ? 'connecting' : current;
    case 'answer':
      return current === 'ringing' || current === 'connecting' ? 'connecting' : current;
    case 'peer-connected':
      return current === 'connecting' || current === 'ringing' || current === 'failed'
        ? 'connected'
        : current;
    case 'end':
      return current === null ? null : 'ended';
    case 'fail':
      return current === null ? null : 'failed';
  }
};
