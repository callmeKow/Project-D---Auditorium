import type { InstrumentType, MidiNoteEventPayload } from '@vmw/contracts';

export interface AudioMeterSnapshot {
  rms: number; // 0..1
  peak: number; // 0..1
  clipping: boolean;
}

export interface BrowserAudioCapabilities {
  webAudio: boolean;
  mediaCapture: boolean;
  webRtc: boolean;
  webMidi: boolean;
  baseLatencyMs: number | null;
  companionBridgeReachable: boolean;
}

export interface CaptureOptions {
  voiceMode?: boolean;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  inputGain?: number;
  monitorVolume?: number;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private rawStream: MediaStream | null = null;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private broadcastDest: MediaStreamAudioDestinationNode | null = null;
  private analyser: AnalyserNode | null = null;
  private remoteAnalyser: AnalyserNode | null = null;
  private remoteSource: MediaStreamAudioSourceNode | null = null;
  private freqBuf: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(512));
  private meterBuf: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(1024 * 4));
  private meterPeakHold = 0;
  private bassAvg = 0;
  private inputGain: GainNode | null = null;
  private inputGainValue = 1.4;
  private monitorGain: GainNode | null = null;
  private monitorEnabled = false;
  private monitorVolume = 1.0;
  private midiAccess: MIDIAccess | null = null;
  private prerecordedTimer: number | null = null;
  private prerecordedAudioEl: HTMLAudioElement | null = null;
  private prerecordedStream: MediaStream | null = null;
  private onDeviceEnded: (() => void) | null = null;

  private ensureContext(): AudioContext {
    this.ctx = this.ctx ?? new AudioContext({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private async ensureContextRunning(): Promise<AudioContext> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return ctx;
  }

  async getCapabilities(): Promise<BrowserAudioCapabilities> {
    const webAudio = typeof AudioContext !== 'undefined';
    const mediaCapture = Boolean(navigator.mediaDevices?.getUserMedia);
    const webRtc = typeof RTCPeerConnection !== 'undefined';
    const webMidi = 'requestMIDIAccess' in navigator;

    let baseLatencyMs: number | null = null;
    if (this.ctx && typeof this.ctx.baseLatency === 'number') {
      baseLatencyMs = Math.round(this.ctx.baseLatency * 1000);
    }

    // Optional Experiment F probe: local Desktop Companion App bridge (port 49152)
    let companionBridgeReachable = false;
    try {
      companionBridgeReachable = await new Promise<boolean>((resolve) => {
        const ws = new WebSocket('ws://127.0.0.1:49152');
        const timer = window.setTimeout(() => {
          ws.close();
          resolve(false);
        }, 350);
        ws.onopen = () => {
          clearTimeout(timer);
          ws.close();
          resolve(true);
        };
        ws.onerror = () => {
          clearTimeout(timer);
          resolve(false);
        };
      });
    } catch {
      companionBridgeReachable = false;
    }

    return {
      webAudio,
      mediaCapture,
      webRtc,
      webMidi,
      baseLatencyMs,
      companionBridgeReachable,
    };
  }

  async listAudioInputs(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  setOnDeviceDisconnected(cb: (() => void) | null) {
    this.onDeviceEnded = cb;
  }

  async startCapture(
    deviceId?: string,
    monitor = false,
    options?: CaptureOptions
  ): Promise<MediaStream> {
    this.stopCapture();
    const ctx = await this.ensureContextRunning();
    const fallbackVoice = options?.voiceMode ?? false;
    const echoCancellation = options?.echoCancellation ?? fallbackVoice;
    const noiseSuppression = options?.noiseSuppression ?? fallbackVoice;
    const autoGainControl = options?.autoGainControl ?? fallbackVoice;

    this.monitorEnabled = monitor;
    if (typeof options?.monitorVolume === 'number') {
      this.monitorVolume = Math.max(0, Math.min(2, options.monitorVolume));
    }
    if (typeof options?.inputGain === 'number') {
      this.inputGainValue = Math.max(0.25, Math.min(3.5, options.inputGain));
    }

    this.rawStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation,
        noiseSuppression,
        autoGainControl,
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48000 },
        sampleSize: { ideal: 16 },
      },
    });

    for (const track of this.rawStream.getAudioTracks()) {
      track.onended = () => {
        this.onDeviceEnded?.();
      };
    }

    this.sourceNode = ctx.createMediaStreamSource(this.rawStream);
    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = this.inputGainValue;

    // Gentle leveling & anti-clipping limiter so higher mic sensitivity stays clean
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 3.5;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.12;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.35;

    this.monitorGain = ctx.createGain();
    this.monitorGain.gain.value = this.monitorEnabled ? this.monitorVolume : 0;

    this.broadcastDest = ctx.createMediaStreamDestination();

    this.sourceNode.connect(this.inputGain);
    this.inputGain.connect(this.compressor);
    this.compressor.connect(this.analyser);
    this.compressor.connect(this.broadcastDest);
    this.analyser.connect(this.monitorGain);
    this.monitorGain.connect(ctx.destination);

    this.stream = this.broadcastDest.stream;
    this.meterPeakHold = 0;

    return this.stream;
  }

  setInputGain(gain: number) {
    this.inputGainValue = Math.max(0.25, Math.min(3.5, gain));
    if (this.inputGain && this.ctx) {
      this.inputGain.gain.setTargetAtTime(this.inputGainValue, this.ctx.currentTime, 0.015);
    }
  }

  async setMonitoring(enabled: boolean, volume?: number) {
    this.monitorEnabled = enabled;
    if (typeof volume === 'number') {
      this.monitorVolume = Math.max(0, Math.min(2, volume));
    }
    const ctx = await this.ensureContextRunning();
    if (this.monitorGain) {
      this.monitorGain.gain.setTargetAtTime(
        this.monitorEnabled ? this.monitorVolume : 0,
        ctx.currentTime,
        0.02
      );
    }
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  getPrerecordedStream(): MediaStream | null {
    return this.prerecordedStream;
  }

  readMeter(): AudioMeterSnapshot {
    if (!this.analyser) return { rms: 0, peak: 0, clipping: false };
    if (this.meterBuf.length !== this.analyser.fftSize) {
      this.meterBuf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    }
    this.analyser.getFloatTimeDomainData(this.meterBuf);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < this.meterBuf.length; i++) {
      const abs = Math.abs(this.meterBuf[i]);
      sum += abs * abs;
      if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sum / this.meterBuf.length);
    this.meterPeakHold = Math.max(peak, this.meterPeakHold * 0.72);
    return { rms, peak: this.meterPeakHold, clipping: peak >= 0.96 };
  }

  attachRemoteAnalyser(stream: MediaStream) {
    try {
      const ctx = this.ensureContext();
      this.detachRemoteAnalyser();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      this.remoteSource = src;
      this.remoteAnalyser = analyser;
    } catch {
      // Ignore if stream has no audio track
    }
  }

  detachRemoteAnalyser() {
    if (this.remoteSource) {
      this.remoteSource.disconnect();
      this.remoteSource = null;
    }
    this.remoteAnalyser = null;
  }

  // Zero-allocation per-frame Bass & Beat reader for 3D Concert Stage lighting
  readBeatBass(concertPulseFallback: boolean, elapsedSec: number): {
    bass: number;
    mid: number;
    high: number;
    beatHit: boolean;
  } {
    const activeAnalyser = this.analyser ?? this.remoteAnalyser;
    if (activeAnalyser) {
      if (this.freqBuf.length !== activeAnalyser.frequencyBinCount) {
        this.freqBuf = new Uint8Array(new ArrayBuffer(activeAnalyser.frequencyBinCount));
      }
      activeAnalyser.getByteFrequencyData(this.freqBuf);

      let bassSum = 0;
      for (let i = 0; i < 8; i++) bassSum += this.freqBuf[i];
      let midSum = 0;
      for (let i = 8; i < 28; i++) midSum += this.freqBuf[i];
      let highSum = 0;
      for (let i = 28; i < 64; i++) highSum += this.freqBuf[i];

      const bass = bassSum / (8 * 255);
      const mid = midSum / (20 * 255);
      const high = highSum / (36 * 255);

      if (bass + mid > 0.03) {
        this.bassAvg = this.bassAvg * 0.92 + bass * 0.08;
        const beatHit = bass > Math.max(0.24, this.bassAvg * 1.22);
        return { bass, mid, high, beatHit };
      }
    }

    // Fallback rhythmic concert pulse (124 BPM) for YouTube / demo live rooms
    if (concertPulseFallback) {
      const beatPhase = (elapsedSec * (124 / 60)) % 1;
      const bass = Math.pow(Math.max(0, 1 - beatPhase * 2.6), 2);
      const mid = 0.25 + Math.abs(Math.sin(elapsedSec * 4.1)) * 0.45;
      const high = 0.2 + Math.abs(Math.cos(elapsedSec * 8.2)) * 0.5;
      const beatHit = beatPhase < 0.16;
      return { bass, mid, high, beatHit };
    }

    return { bass: 0, mid: 0, high: 0, beatHit: false };
  }

  stopCapture() {
    this.sourceNode?.disconnect();
    this.inputGain?.disconnect();
    this.compressor?.disconnect();
    this.analyser?.disconnect();
    this.monitorGain?.disconnect();
    this.sourceNode = null;
    this.compressor = null;
    this.broadcastDest = null;

    if (this.rawStream) {
      for (const track of this.rawStream.getTracks()) track.stop();
      this.rawStream = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.inputGain = null;
    this.monitorGain = null;
    this.analyser = null;
    this.meterPeakHold = 0;
  }

  // Load and play a prerecorded audio file routed into a MediaStream for LMR-06 live/prerecorded switch
  async playPrerecordedFile(file: File): Promise<MediaStream> {
    this.stopPrerecordedFile();
    const ctx = this.ensureContext();
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.loop = true;
    audio.crossOrigin = 'anonymous';
    this.prerecordedAudioEl = audio;

    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const dest = ctx.createMediaStreamDestination();
    source.connect(analyser);
    analyser.connect(dest);
    analyser.connect(ctx.destination);
    this.remoteAnalyser = analyser;
    this.prerecordedStream = dest.stream;

    await audio.play();
    return dest.stream;
  }

  stopPrerecordedFile() {
    if (this.prerecordedAudioEl) {
      this.prerecordedAudioEl.pause();
      if (this.prerecordedAudioEl.src) {
        URL.revokeObjectURL(this.prerecordedAudioEl.src);
      }
      this.prerecordedAudioEl = null;
    }
    this.prerecordedStream = null;
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
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
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
