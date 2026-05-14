import { create } from 'zustand';
import {
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import { useAppStore } from './app';

export interface LkParticipant {
  identity: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  videoElement?: HTMLVideoElement;
}

interface LiveKitState {
  /** Whether we're connected to a LiveKit room. */
  connected: boolean;
  /** Local mic enabled. */
  micEnabled: boolean;
  /** Local camera enabled. */
  camEnabled: boolean;
  /** Remote participants. */
  participants: LkParticipant[];

  join: (roomName: string, token: string) => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleCam: () => Promise<void>;
}

let room: Room | null = null;

function syncParticipants() {
  if (!room) {
    useLiveKitStore.setState({ participants: [] });
    return;
  }
  const list: LkParticipant[] = [];
  for (const p of room.remoteParticipants.values()) {
    let audioEnabled = false;
    let videoEnabled = false;
    for (const pub of p.trackPublications.values()) {
      if (pub.kind === Track.Kind.Audio && pub.isSubscribed) audioEnabled = true;
      if (pub.kind === Track.Kind.Video && pub.isSubscribed) videoEnabled = true;
    }
    list.push({ identity: p.identity, audioEnabled, videoEnabled });
  }
  useLiveKitStore.setState({ participants: list });
}

export const useLiveKitStore = create<LiveKitState>()((set, get) => ({
  connected: false,
  micEnabled: false,
  camEnabled: false,
  participants: [],

  join: async (roomName, token) => {
    if (room) await get().leave();

    const { livekitUrl } = useAppStore.getState().settings;
    if (!livekitUrl) throw new Error('LiveKit URL not configured in Settings');

    room = new Room();

    room.on(RoomEvent.ParticipantConnected, () => syncParticipants());
    room.on(RoomEvent.ParticipantDisconnected, () => syncParticipants());
    room.on(RoomEvent.TrackSubscribed, () => syncParticipants());
    room.on(RoomEvent.TrackUnsubscribed, () => syncParticipants());
    room.on(RoomEvent.Disconnected, () => {
      set({ connected: false, micEnabled: false, camEnabled: false, participants: [] });
      room = null;
    });

    await room.connect(livekitUrl, token);
    set({ connected: true });
    syncParticipants();
  },

  leave: async () => {
    if (room) {
      await room.disconnect();
      room = null;
    }
    set({ connected: false, micEnabled: false, camEnabled: false, participants: [] });
  },

  toggleMic: async () => {
    if (!room) return;
    const enabled = get().micEnabled;
    await room.localParticipant.setMicrophoneEnabled(!enabled);
    set({ micEnabled: !enabled });
  },

  toggleCam: async () => {
    if (!room) return;
    const enabled = get().camEnabled;
    await room.localParticipant.setCameraEnabled(!enabled);
    set({ camEnabled: !enabled });
  },
}));
