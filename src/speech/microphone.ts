/** What WhisperLive expects: mono float32 at this rate. */
export const SPEECH_SAMPLE_RATE = 16_000;

/** Samples per websocket message, a quarter second at 16 kHz. */
const FRAME_SAMPLES = 4096;

const PROCESSOR_NAME = 'viewtopia-microphone';

// runs on the audio thread: gathers the 128-sample render quanta into frames
const PROCESSOR_SOURCE = `
class MicrophoneProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(${FRAME_SAMPLES});
    this.filled = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    let offset = 0;
    while (offset < channel.length) {
      const room = this.frame.length - this.filled;
      const take = Math.min(room, channel.length - offset);
      this.frame.set(channel.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;
      if (this.filled === this.frame.length) {
        this.port.postMessage(this.frame);
        this.frame = new Float32Array(${FRAME_SAMPLES});
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor('${PROCESSOR_NAME}', MicrophoneProcessor);
`;

export interface Microphone {
  close: () => void;
}

/** Open the microphone and hand every frame to `onFrame` until closed. */
export async function openMicrophone(onFrame: (frame: Float32Array) => void): Promise<Microphone> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const context = new AudioContext({ sampleRate: SPEECH_SAMPLE_RATE });
  const moduleUrl = URL.createObjectURL(
    new Blob([PROCESSOR_SOURCE], { type: 'application/javascript' }),
  );
  try {
    await context.audioWorklet.addModule(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
  const source = context.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(context, PROCESSOR_NAME);
  worklet.port.onmessage = (event: MessageEvent<Float32Array>) => onFrame(event.data);
  source.connect(worklet);

  return {
    close: () => {
      source.disconnect();
      worklet.port.onmessage = null;
      for (const track of stream.getTracks()) track.stop();
      void context.close();
    },
  };
}
