import type { CallAdapter, CallSignal } from './types';

/**
 * Contract for the app-shell implementation of real calling.
 * Authenticate callers server-side, send `CallSignal` over a private realtime
 * channel, and use a custom development build for native WebRTC peers. Issue
 * short-lived TURN credentials from the backend—never from Expo Go/client code.
 */
export type CallSignalingConfig = {
  sendAuthenticatedSignal: (signal: CallSignal) => Promise<void>;
  subscribeToPrivateSignals: (listener: (signal: CallSignal) => void) => () => void;
};

/** Safe default: exposes controls but never claims that a call has connected. */
export const unconfiguredCallAdapter: CallAdapter = {
  async startCall() { throw new Error('Calling has not been configured for this build.'); },
  async endCall() {},
  async sendSignal() { throw new Error('Call signaling has not been configured.'); },
  subscribe() { return () => undefined; },
};
