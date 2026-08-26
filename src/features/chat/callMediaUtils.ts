export type CameraFacingMode = 'user' | 'environment';

export const formatCallDuration = (elapsedSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(elapsedSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const pair = (value: number) => String(value).padStart(2, '0');
  return hours > 0
    ? `${pair(hours)}:${pair(minutes)}:${pair(seconds)}`
    : `${pair(minutes)}:${pair(seconds)}`;
};

export const nextCameraFacingMode = (current?: CameraFacingMode): CameraFacingMode =>
  current === 'environment' ? 'user' : 'environment';

export const canSwitchCamera = ({
  facingModes,
  videoInputCount,
  mobileHint,
}: {
  facingModes?: string[];
  videoInputCount: number;
  mobileHint: boolean;
}) => {
  const modes = new Set(facingModes || []);
  return (modes.has('user') && modes.has('environment')) || (mobileHint && videoInputCount > 1);
};

export const canShareDisplay = ({
  hasDisplayMedia,
  mobileHint,
}: {
  hasDisplayMedia: boolean;
  mobileHint: boolean;
}) => hasDisplayMedia && !mobileHint;

export const replaceLocalVideoTrack = async ({
  stream,
  sender,
  currentTrack,
  nextTrack,
  updateSender = true,
}: {
  stream: Pick<MediaStream, 'addTrack' | 'removeTrack' | 'getTracks'>;
  sender?: Pick<RTCRtpSender, 'replaceTrack'> | null;
  currentTrack?: Pick<MediaStreamTrack, 'id' | 'stop'> | null;
  nextTrack?: MediaStreamTrack | null;
  updateSender?: boolean;
}) => {
  if (updateSender && sender) await sender.replaceTrack(nextTrack || null);
  if (currentTrack && stream.getTracks().some((track) => track.id === currentTrack.id)) {
    stream.removeTrack(currentTrack as MediaStreamTrack);
  }
  if (nextTrack && !stream.getTracks().some((track) => track.id === nextTrack.id)) {
    stream.addTrack(nextTrack);
  }
  if (currentTrack && currentTrack !== nextTrack) currentTrack.stop();
};
