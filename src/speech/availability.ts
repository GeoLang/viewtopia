import { create } from 'zustand';

/** nginx forwards this to the Aavaaz REST health route. */
const SPEECH_HEALTH_PATH = '/speech/health';
const PROBE_TIMEOUT_MS = 3000;

interface SpeechAvailability {
  available: boolean;
  probed: boolean;
  probe: () => Promise<void>;
}

/**
 * Whether the speech service answers. The mic is offered only then, so a
 * container still downloading its model does not show a dead button.
 */
export const useSpeechAvailability = create<SpeechAvailability>((set, get) => ({
  available: false,
  probed: false,
  probe: async () => {
    if (get().probed) return;
    set({ probed: true });
    let available = false;
    try {
      const res = await fetch(SPEECH_HEALTH_PATH, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      available = res.ok;
    } catch {
      available = false;
    }
    set({ available });
  },
}));
