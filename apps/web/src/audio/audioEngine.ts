import type { InstrumentType, MidiNoteEventPayload } from '@vmw/contracts';

export interface AudioMeterSnapshot {
  rms: number; // 0..1
  peak: number; // 0..1
  clipping: boolean;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private monitorGain: GainNode | null = null;
  private midiAccess: MIDIAccess | null = null;
  private prerecordedTimer: number | null = null;

  async listAudioInputs(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  async startCapture(deviceId?: string, monitor = false): Promise<MediaStream> {
    this.stopCapture();
    this.ctx = this.ctx ?? new AudioContext({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false, // Preserve musical dynamics
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;

    this.monitorGain = this.ctx.createGain();
    this.monitorGain.gain.value = monitor ? 0.8 : 0;

    source.connect(this.analyser);
    this.analyser.connect(this.monitorGain);
    this.monitorGain.connect(this.ctx.destination);

    return this.stream;
  }

  setMonitoring(enabled: boolean) {
    if (this.monitorGain && this.ctx) {
      this.monitorGain.gain.setTargetAtTime(enabled ? 0.8 : 0, this.ctx.currentTime, 0.02);
    }
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  readMeter(): AudioMeterSnapshot {
    if (!this.analyser) return { rms: 0, peak: 0, clipping: false };
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const abs = Math.abs(buf[i]);
      sum += abs * abs;
      if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sum / buf.length);
    return { rms, peak, clipping: peak >= 0.98 };
  }

  stopCapture() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.analyser = null;
  }

  // Experiment C: WebMIDI Capture + Timestamping
  async initMidi(
    userId: string,
    instrument: InstrumentType,
    onNote: (ev: MidiNoteEventPayload) => void
  ): Promise<{ supported: boolean; inputs: string[] }> {
    if (!('requestMIDIAccess' in navigator)) {
      return { supported: false, inputs: [] };
    }
    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      const inputs: string[] = [];
      for (const input of this.midiAccess.inputs.values()) {
        inputs.push(input.name ?? 'MIDI Device');
        input.onmidimessage = (msg) => {
          if (!msg.data || msg.data.length < 3) return;
          const status = msg.data[0];
          const note = msg.data[1];
          const velocity = msg.data[2];
          const cmd = status & 0xf0;
          if (cmd === 0x90 || cmd === 0x80) {
            const isNoteOn = cmd === 0x90 && velocity > 0;
            onNote({
              userId,
              instrument,
              note,
              velocity,
              isNoteOn,
              clientTimestampMs: performance.now(),
            });
          }
        };
      }
      return { supported: true, inputs };
    } catch {
      return { supported: false, inputs: [] };
    }
  }

  // Synthesize a clean piano/chamber tone for Sound Check & MIDI testing
  playSynthNote(midiNote: number, durationSec = 0.35) {
    this.ctx = this.ctx ?? new AudioContext({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  startPrerecordedDemoLoop(onNote?: (note: number) => void) {
    this.stopPrerecordedDemoLoop();
    const chordProgression = [60, 64, 67, 72, 69, 64, 60, 67];
    let idx = 0;
    this.prerecordedTimer = window.setInterval(() => {
      const note = chordProgression[idx % chordProgression.length];
      this.playSynthNote(note, 0.45);
      onNote?.(note);
      idx++;
    }, 520);
  }

  stopPrerecordedDemoLoop() {
    if (this.prerecordedTimer !== null) {
      clearInterval(this.prerecordedTimer);
      this.prerecordedTimer = null;
    }
  }
}

export const audioEngine = new AudioEngine();
