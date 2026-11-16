import type { InstrumentType, MidiNoteEventPayload } from '@vmw/contracts';

export interface AudioMeterSnapshot {
  rms: number; // 0..1
  peak: number; // 0..1
  clipping: boolean;
  gateOpen: boolean;
}

export interface BrowserAudioCapabilities {
  webAudio: boolean;
  mediaCapture: boolean;
  webRtc: boolean;
  webMidi: boolean;
  baseLatencyMs: number | null;
  companionBridgeReachable: boolean;
}

export type KaraokePresetId = 'STUDIO' | 'BALLAD' | 'CONCERT' | 'PARTY' | 'CUSTOM';

export interface KaraokePresetConfig {
  id: Exclude<KaraokePresetId, 'CUSTOM'>;
  label: string;
  stageEchoEnabled: boolean;
  stageEchoDelayMs: number;
  stageEchoFeedback: number;
  stageEchoMix: number;
  reverbEnabled: boolean;
  reverbMix: number;
  reverbRoomSec: number;
}

export const KARAOKE_PRESETS: KaraokePresetConfig[] = [
  {
    id: 'STUDIO',
    label: 'Mộc Studio',
    stageEchoEnabled: false,
    stageEchoDelayMs: 220,
    stageEchoFeedback: 0.25,
    stageEchoMix: 0,
    reverbEnabled: false,
    reverbMix: 0,
    reverbRoomSec: 1.2,
  },
  {
    id: 'BALLAD',
    label: 'Ballad Vang',
    stageEchoEnabled: true,
    stageEchoDelayMs: 240,
    stageEchoFeedback: 0.34,
    stageEchoMix: 0.38,
    reverbEnabled: true,
    reverbMix: 0.35,
    reverbRoomSec: 1.8,
  },
  {
    id: 'CONCERT',
    label: 'Concert Hall',
    stageEchoEnabled: true,
    stageEchoDelayMs: 310,
    stageEchoFeedback: 0.38,
    stageEchoMix: 0.32,
    reverbEnabled: true,
    reverbMix: 0.56,
    reverbRoomSec: 2.8,
  },
  {
    id: 'PARTY',
    label: 'Tiệc Sôi Động',
    stageEchoEnabled: true,
    stageEchoDelayMs: 180,
    stageEchoFeedback: 0.44,
    stageEchoMix: 0.48,
    reverbEnabled: true,
    reverbMix: 0.42,
    reverbRoomSec: 1.5,
  },
];

const KARAOKE_STORAGE_KEY = 'vmw_karaoke_settings_v1';

export interface CaptureOptions {
  voiceMode?: boolean;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  inputGain?: number;
  monitorVolume?: number;
  stageEcho?: boolean;
  stageEchoMix?: number;
  stageEchoDelayMs?: number;
  stageEchoFeedback?: number;
  reverbEnabled?: boolean;
  reverbMix?: number;
  reverbRoomSec?: number;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private rawStream: MediaStream | null = null;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private vocalMixGain: GainNode | null = null;
  private micMuteGain: GainNode | null = null;
  private echoDelay: DelayNode | null = null;
  private echoFilter: BiquadFilterNode | null = null;
  private echoFeedback: GainNode | null = null;
  private echoWetGain: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbWetGain: GainNode | null = null;
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
  private highpassFilter: BiquadFilterNode | null = null;
  private noiseGateGain: GainNode | null = null;
  private noiseGateThreshold = 0.08; // Discord-style input sensitivity gate (0 = off .. 0.7)
  private gateOpen = true;
  private gateHoldUntil = 0;
  private gateTimer: number | null = null;
  private vocalMixVolume = 1.0;
  private micMuted = false;
  private monitorGain: GainNode | null = null;
  private monitorEnabled = true;
  private monitorVolume = 1.0;
  private stageEchoEnabled = true;
  private stageEchoMix = 0.38;
  private stageEchoDelayMs = 240;
  private stageEchoFeedback = 0.34;
  private reverbEnabled = true;
  private reverbMix = 0.35;
  private reverbRoomSec = 1.8;
  private karaokePreset: KaraokePresetId = 'BALLAD';
  private musicVolume = 80;
  private musicMuted = false;
  private emoteVolume = 70;
  private emoteMuted = false;
  private roomOutputMuted = false;
  private lastEmoteSoundAt = new Map<string, number>();
  private echoCancellation = false;
  private noiseSuppression = false;
  private selectedDeviceId = '';
  private midiAccess: MIDIAccess | null = null;
  private prerecordedTimer: number | null = null;
  private prerecordedAudioEl: HTMLAudioElement | null = null;
  private prerecordedStream: MediaStream | null = null;
  private onDeviceEnded: (() => void) | null = null;
  private musicListeners = new Set<(vol: number, muted: boolean) => void>();
  private emoteListeners = new Set<(vol: number, muted: boolean) => void>();

  constructor() {
    this.loadSavedSettings();
  }

  private loadSavedSettings() {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(KARAOKE_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<ReturnType<AudioEngine['getCaptureSettings']>>;
      if (typeof saved.deviceId === 'string') this.selectedDeviceId = saved.deviceId;
      if (typeof saved.monitorEnabled === 'boolean') this.monitorEnabled = saved.monitorEnabled;
      if (typeof saved.monitorVolume === 'number') this.monitorVolume = saved.monitorVolume;
      if (typeof saved.inputGain === 'number') this.inputGainValue = saved.inputGain;
      if (typeof saved.noiseGateThreshold === 'number') this.noiseGateThreshold = saved.noiseGateThreshold;
      if (typeof saved.vocalMixVolume === 'number') this.vocalMixVolume = saved.vocalMixVolume;
      if (typeof saved.micMuted === 'boolean') this.micMuted = saved.micMuted;
      if (typeof saved.stageEchoEnabled === 'boolean') this.stageEchoEnabled = saved.stageEchoEnabled;
      if (typeof saved.stageEchoMix === 'number') this.stageEchoMix = saved.stageEchoMix;
      if (typeof saved.stageEchoDelayMs === 'number') this.stageEchoDelayMs = saved.stageEchoDelayMs;
      if (typeof saved.stageEchoFeedback === 'number') this.stageEchoFeedback = saved.stageEchoFeedback;
      if (typeof saved.reverbEnabled === 'boolean') this.reverbEnabled = saved.reverbEnabled;
      if (typeof saved.reverbMix === 'number') this.reverbMix = saved.reverbMix;
      if (typeof saved.reverbRoomSec === 'number') this.reverbRoomSec = saved.reverbRoomSec;
      if (typeof saved.karaokePreset === 'string') this.karaokePreset = saved.karaokePreset as KaraokePresetId;
      if (typeof saved.musicVolume === 'number') this.musicVolume = saved.musicVolume;
      if (typeof saved.musicMuted === 'boolean') this.musicMuted = saved.musicMuted;
      if (typeof saved.emoteVolume === 'number') this.emoteVolume = saved.emoteVolume;
      if (typeof saved.emoteMuted === 'boolean') this.emoteMuted = saved.emoteMuted;
      if (typeof saved.echoCancellation === 'boolean') this.echoCancellation = saved.echoCancellation;
      if (typeof saved.noiseSuppression === 'boolean') this.noiseSuppression = saved.noiseSuppression;
    } catch {
      // Ignore malformed localStorage entries
    }
  }

  private persistSettings() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(KARAOKE_STORAGE_KEY, JSON.stringify(this.getCaptureSettings()));
    } catch {
      // Ignore storage quota errors
    }
  }

  private buildReverbImpulse(ctx: AudioContext, durationSec: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * Math.max(0.4, Math.min(4.0, durationSec))));
    const impulse = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 2.4);
        // Smooth stereo room tail (warm high-frequency rolloff on later samples)
        const white = Math.random() * 2 - 1;
        data[i] = white * decay * 0.45;
      }
    }
    return impulse;
  }

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
    monitor?: boolean,
    options?: CaptureOptions
  ): Promise<MediaStream> {
    this.stopCapture();
    const ctx = await this.ensureContextRunning();
    const fallbackVoice = options?.voiceMode ?? false;
    const echoCancellation = options?.echoCancellation ?? (this.echoCancellation || fallbackVoice);
    const noiseSuppression = options?.noiseSuppression ?? (this.noiseSuppression || fallbackVoice);
    const autoGainControl = options?.autoGainControl ?? fallbackVoice;

    if (deviceId !== undefined) this.selectedDeviceId = deviceId;
    this.echoCancellation = echoCancellation;
    this.noiseSuppression = noiseSuppression;
    if (typeof monitor === 'boolean') this.monitorEnabled = monitor;
    if (typeof options?.monitorVolume === 'number') {
      this.monitorVolume = Math.max(0, Math.min(2, options.monitorVolume));
    }
    if (typeof options?.inputGain === 'number') {
      this.inputGainValue = Math.max(0, Math.min(3.0, options.inputGain));
    }
    if (typeof options?.stageEcho === 'boolean') {
      this.stageEchoEnabled = options.stageEcho;
    }
    if (typeof options?.stageEchoMix === 'number') {
      this.stageEchoMix = Math.max(0, Math.min(0.9, options.stageEchoMix));
    }
    if (typeof options?.stageEchoDelayMs === 'number') {
      this.stageEchoDelayMs = Math.max(60, Math.min(500, options.stageEchoDelayMs));
    }
    if (typeof options?.stageEchoFeedback === 'number') {
      this.stageEchoFeedback = Math.max(0, Math.min(0.68, options.stageEchoFeedback));
    }
    if (typeof options?.reverbEnabled === 'boolean') {
      this.reverbEnabled = options.reverbEnabled;
    }
    if (typeof options?.reverbMix === 'number') {
      this.reverbMix = Math.max(0, Math.min(0.9, options.reverbMix));
    }
    if (typeof options?.reverbRoomSec === 'number') {
      this.reverbRoomSec = Math.max(0.5, Math.min(3.8, options.reverbRoomSec));
    }
    this.persistSettings();

    this.rawStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: (deviceId ?? this.selectedDeviceId) ? { exact: deviceId ?? this.selectedDeviceId } : undefined,
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

    // Gentle low-cut filter removes AC/fan rumble when Discord noise gate is active
    this.highpassFilter = ctx.createBiquadFilter();
    this.highpassFilter.type = 'highpass';
    this.highpassFilter.frequency.value = this.noiseGateThreshold > 0 ? 75 : 10;

    this.noiseGateGain = ctx.createGain();
    this.noiseGateGain.gain.value = this.noiseGateThreshold > 0 ? 0 : 1;
    this.gateOpen = this.noiseGateThreshold === 0;
    this.gateHoldUntil = 0;

    this.vocalMixGain = ctx.createGain();
    this.vocalMixGain.gain.value = this.vocalMixVolume;

    this.micMuteGain = ctx.createGain();
    this.micMuteGain.gain.value = this.micMuted ? 0 : 1;

    // Gentle leveling & anti-clipping limiter so higher mic sensitivity stays clean
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 3.5;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.12;

    // Warm Concert Hall / Karaoke Echo loop
    this.echoDelay = ctx.createDelay(1.0);
    this.echoDelay.delayTime.value = this.stageEchoDelayMs / 1000;
    this.echoFilter = ctx.createBiquadFilter();
    this.echoFilter.type = 'lowpass';
    this.echoFilter.frequency.value = 3400;
    this.echoFeedback = ctx.createGain();
    this.echoFeedback.gain.value = this.stageEchoFeedback;
    this.echoWetGain = ctx.createGain();
    this.echoWetGain.gain.value = this.stageEchoEnabled ? this.stageEchoMix : 0;

    // Room Reverb Convolver
    this.reverbConvolver = ctx.createConvolver();
    this.reverbConvolver.buffer = this.buildReverbImpulse(ctx, this.reverbRoomSec);
    this.reverbWetGain = ctx.createGain();
    this.reverbWetGain.gain.value = this.reverbEnabled ? this.reverbMix : 0;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.35;

    this.monitorGain = ctx.createGain();
    this.monitorGain.gain.value = this.monitorEnabled ? this.monitorVolume : 0;

    this.broadcastDest = ctx.createMediaStreamDestination();

    // Preamp -> Low-cut -> Meter Analyser -> Noise Gate -> Compressor
    this.sourceNode.connect(this.inputGain);
    this.inputGain.connect(this.highpassFilter);
    this.highpassFilter.connect(this.analyser);
    this.highpassFilter.connect(this.noiseGateGain);
    this.noiseGateGain.connect(this.compressor);

    // Dry path -> Vocal Mix Gain
    this.compressor.connect(this.vocalMixGain);

    // Wet Stage Echo loop -> Vocal Mix Gain
    this.compressor.connect(this.echoDelay);
    this.echoDelay.connect(this.echoFilter);
    this.echoFilter.connect(this.echoFeedback);
    this.echoFeedback.connect(this.echoDelay);
    this.echoFilter.connect(this.echoWetGain);
    this.echoWetGain.connect(this.vocalMixGain);

    // Wet Room Reverb -> Vocal Mix Gain
    this.compressor.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.reverbWetGain);
    this.reverbWetGain.connect(this.vocalMixGain);

    // Vocal Mix -> Mute Gate -> Self-Monitor & WebRTC Audience Stream
    this.vocalMixGain.connect(this.micMuteGain);
    this.micMuteGain.connect(this.monitorGain);
    this.micMuteGain.connect(this.broadcastDest);
    this.monitorGain.connect(ctx.destination);

    this.stream = this.broadcastDest.stream;
    this.meterPeakHold = 0;

    // Fast background Discord-style Noise Gate envelope follower (works even when panel is closed)
    this.gateTimer = window.setInterval(() => {
      if (!this.noiseGateGain || !this.ctx || !this.analyser) return;
      if (this.noiseGateThreshold <= 0) {
        if (!this.gateOpen) {
          this.gateOpen = true;
          this.noiseGateGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
        }
        return;
      }
      const m = this.readMeter();
      const level = Math.min(1, Math.max(m.rms * 3.5, m.peak * 1.1));
      const nowMs = performance.now();
      if (level >= this.noiseGateThreshold) {
        this.gateHoldUntil = nowMs + 180;
        if (!this.gateOpen) {
          this.gateOpen = true;
          this.noiseGateGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.006);
        }
      } else if (nowMs > this.gateHoldUntil && this.gateOpen) {
        this.gateOpen = false;
        this.noiseGateGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.055);
      }
    }, 35);

    return this.stream;
  }

  setNoiseGate(threshold: number) {
    this.noiseGateThreshold = Math.max(0, Math.min(0.7, threshold));
    if (this.highpassFilter && this.ctx) {
      this.highpassFilter.frequency.setTargetAtTime(this.noiseGateThreshold > 0 ? 75 : 10, this.ctx.currentTime, 0.02);
    }
    if (this.noiseGateThreshold === 0 && this.noiseGateGain && this.ctx) {
      this.gateOpen = true;
      this.noiseGateGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
    }
    this.persistSettings();
  }

  setInputGain(gain: number) {
    this.inputGainValue = Math.max(0, Math.min(3.0, gain));
    if (this.inputGain && this.ctx) {
      this.inputGain.gain.setTargetAtTime(this.inputGainValue, this.ctx.currentTime, 0.015);
    }
    this.persistSettings();
  }

  setVocalMixVolume(volume: number) {
    this.vocalMixVolume = Math.max(0, Math.min(2.0, volume));
    if (this.vocalMixGain && this.ctx) {
      this.vocalMixGain.gain.setTargetAtTime(this.vocalMixVolume, this.ctx.currentTime, 0.015);
    }
    this.persistSettings();
  }

  setMicMuted(muted: boolean) {
    this.micMuted = muted;
    if (this.micMuteGain && this.ctx) {
      this.micMuteGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.01);
    }
    this.persistSettings();
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
    this.persistSettings();
  }

  async setStageEcho(enabled: boolean, mix?: number, delayMs?: number, feedback?: number) {
    this.stageEchoEnabled = enabled;
    if (typeof mix === 'number') {
      this.stageEchoMix = Math.max(0, Math.min(0.9, mix));
    }
    if (typeof delayMs === 'number') {
      this.stageEchoDelayMs = Math.max(60, Math.min(500, delayMs));
    }
    if (typeof feedback === 'number') {
      this.stageEchoFeedback = Math.max(0, Math.min(0.68, feedback));
    }
    this.karaokePreset = 'CUSTOM';
    const ctx = await this.ensureContextRunning();
    if (this.echoDelay) {
      this.echoDelay.delayTime.setTargetAtTime(this.stageEchoDelayMs / 1000, ctx.currentTime, 0.02);
    }
    if (this.echoFeedback) {
      this.echoFeedback.gain.setTargetAtTime(this.stageEchoFeedback, ctx.currentTime, 0.02);
    }
    if (this.echoWetGain) {
      this.echoWetGain.gain.setTargetAtTime(this.stageEchoEnabled ? this.stageEchoMix : 0, ctx.currentTime, 0.02);
    }
    this.persistSettings();
  }

  async setStageReverb(enabled: boolean, mix?: number, roomSec?: number) {
    this.reverbEnabled = enabled;
    if (typeof mix === 'number') {
      this.reverbMix = Math.max(0, Math.min(0.9, mix));
    }
    const roomChanged = typeof roomSec === 'number' && Math.abs(roomSec - this.reverbRoomSec) > 0.05;
    if (typeof roomSec === 'number') {
      this.reverbRoomSec = Math.max(0.5, Math.min(3.8, roomSec));
    }
    this.karaokePreset = 'CUSTOM';
    const ctx = await this.ensureContextRunning();
    if (roomChanged && this.reverbConvolver) {
      this.reverbConvolver.buffer = this.buildReverbImpulse(ctx, this.reverbRoomSec);
    }
    if (this.reverbWetGain) {
      this.reverbWetGain.gain.setTargetAtTime(this.reverbEnabled ? this.reverbMix : 0, ctx.currentTime, 0.02);
    }
    this.persistSettings();
  }

  async applyKaraokePreset(presetId: Exclude<KaraokePresetId, 'CUSTOM'>) {
    const preset = KARAOKE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    await this.setStageEcho(preset.stageEchoEnabled, preset.stageEchoMix, preset.stageEchoDelayMs, preset.stageEchoFeedback);
    await this.setStageReverb(preset.reverbEnabled, preset.reverbMix, preset.reverbRoomSec);
    this.karaokePreset = presetId;
    this.persistSettings();
  }

  setMusicVolume(volume: number, muted?: boolean) {
    this.musicVolume = Math.max(0, Math.min(100, Math.round(volume)));
    if (typeof muted === 'boolean') this.musicMuted = muted;
    if (this.prerecordedAudioEl) {
      this.prerecordedAudioEl.volume = this.musicMuted ? 0 : this.musicVolume / 100;
    }
    this.persistSettings();
    for (const cb of this.musicListeners) {
      cb(this.musicVolume, this.musicMuted);
    }
  }

  subscribeMusicVolume(cb: (vol: number, muted: boolean) => void) {
    this.musicListeners.add(cb);
    cb(this.musicVolume, this.musicMuted);
    return () => {
      this.musicListeners.delete(cb);
    };
  }

  setEmoteVolume(volume: number, muted?: boolean) {
    this.emoteVolume = Math.max(0, Math.min(100, Math.round(volume)));
    if (typeof muted === 'boolean') this.emoteMuted = muted;
    this.persistSettings();
    for (const cb of this.emoteListeners) {
      cb(this.emoteVolume, this.emoteMuted);
    }
  }

  subscribeEmoteVolume(cb: (vol: number, muted: boolean) => void) {
    this.emoteListeners.add(cb);
    cb(this.emoteVolume, this.emoteMuted);
    return () => {
      this.emoteListeners.delete(cb);
    };
  }

  setRoomOutputMuted(muted: boolean) {
    this.roomOutputMuted = muted;
  }

  getCaptureSettings() {
    return {
      deviceId: this.selectedDeviceId,
      monitorEnabled: this.monitorEnabled,
      monitorVolume: this.monitorVolume,
      inputGain: this.inputGainValue,
      noiseGateThreshold: this.noiseGateThreshold,
      vocalMixVolume: this.vocalMixVolume,
      micMuted: this.micMuted,
      stageEchoEnabled: this.stageEchoEnabled,
      stageEchoMix: this.stageEchoMix,
      stageEchoDelayMs: this.stageEchoDelayMs,
      stageEchoFeedback: this.stageEchoFeedback,
      reverbEnabled: this.reverbEnabled,
      reverbMix: this.reverbMix,
      reverbRoomSec: this.reverbRoomSec,
      karaokePreset: this.karaokePreset,
      musicVolume: this.musicVolume,
      musicMuted: this.musicMuted,
      emoteVolume: this.emoteVolume,
      emoteMuted: this.emoteMuted,
      echoCancellation: this.echoCancellation,
      noiseSuppression: this.noiseSuppression,
    };
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  getPrerecordedStream(): MediaStream | null {
    return this.prerecordedStream;
  }

  readMeter(): AudioMeterSnapshot {
    if (!this.analyser) return { rms: 0, peak: 0, clipping: false, gateOpen: true };
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
    return { rms, peak: this.meterPeakHold, clipping: peak >= 0.96, gateOpen: this.gateOpen };
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
    if (this.gateTimer !== null) {
      clearInterval(this.gateTimer);
      this.gateTimer = null;
    }
    this.sourceNode?.disconnect();
    this.inputGain?.disconnect();
    this.highpassFilter?.disconnect();
    this.noiseGateGain?.disconnect();
    this.vocalMixGain?.disconnect();
    this.micMuteGain?.disconnect();
    this.compressor?.disconnect();
    this.echoDelay?.disconnect();
    this.echoFilter?.disconnect();
    this.echoFeedback?.disconnect();
    this.echoWetGain?.disconnect();
    this.reverbConvolver?.disconnect();
    this.reverbWetGain?.disconnect();
    this.analyser?.disconnect();
    this.monitorGain?.disconnect();
    this.sourceNode = null;
    this.highpassFilter = null;
    this.noiseGateGain = null;
    this.vocalMixGain = null;
    this.micMuteGain = null;
    this.compressor = null;
    this.echoDelay = null;
    this.echoFilter = null;
    this.echoFeedback = null;
    this.echoWetGain = null;
    this.reverbConvolver = null;
    this.reverbWetGain = null;
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
    audio.volume = this.musicMuted ? 0 : this.musicVolume / 100;
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

  // Synthesize distinct SFX for Auditorium Emotes & Applause with adjustable Emote Volume
  playReactionSound(reaction: 'CLAP' | 'CHEER' | 'WAVE' | 'DANCE' | 'FLOWER' | 'APPLAUSE') {
    if (this.roomOutputMuted || this.emoteMuted || this.emoteVolume <= 0) return;

    const nowMs = performance.now();
    const lastAt = this.lastEmoteSoundAt.get(reaction) ?? 0;
    if (nowMs - lastAt < 110) return; // Prevent audio clipping when multiple users react simultaneously
    this.lastEmoteSoundAt.set(reaction, nowMs);

    try {
      const ctx = this.ensureContext();
      const master = ctx.createGain();
      master.gain.value = (this.emoteVolume / 100) * 0.45;
      master.connect(ctx.destination);
      const t0 = ctx.currentTime;

      const triggerNoiseClap = (offset: number, centerHz: number, dur = 0.08, amp = 0.45) => {
        const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = centerHz;
        bp.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(amp, t0 + offset);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + offset + dur);
        src.connect(bp);
        bp.connect(g);
        g.connect(master);
        src.start(t0 + offset);
      };

      const triggerTone = (
        freq: number,
        offset: number,
        dur: number,
        type: OscillatorType = 'triangle',
        amp = 0.22
      ) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0 + offset);
        g.gain.setValueAtTime(0.001, t0 + offset);
        g.gain.exponentialRampToValueAtTime(amp, t0 + offset + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + offset + dur);
        osc.connect(g);
        g.connect(master);
        osc.start(t0 + offset);
        osc.stop(t0 + offset + dur + 0.02);
      };

      if (reaction === 'CLAP') {
        [0, 0.11, 0.22, 0.34, 0.47].forEach((ofs, i) => {
          triggerNoiseClap(ofs, 1250 + (i % 3) * 260, 0.085, 0.55);
        });
      } else if (reaction === 'APPLAUSE') {
        for (let i = 0; i < 14; i++) {
          const ofs = i * 0.1 + (i % 3) * 0.025;
          triggerNoiseClap(ofs, 1050 + (i % 5) * 240, 0.12, 0.42);
        }
        triggerTone(523.25, 0.02, 0.55, 'sine', 0.14);
        triggerTone(659.25, 0.08, 0.65, 'sine', 0.14);
      } else if (reaction === 'CHEER') {
        triggerTone(523.25, 0, 0.28, 'triangle', 0.2);
        triggerTone(659.25, 0.08, 0.32, 'triangle', 0.22);
        triggerTone(783.99, 0.16, 0.45, 'triangle', 0.24);
        triggerTone(1046.5, 0.24, 0.5, 'sine', 0.22);
        triggerNoiseClap(0.05, 1600, 0.45, 0.25);
      } else if (reaction === 'WAVE') {
        triggerTone(783.99, 0, 0.16, 'sine', 0.22);
        triggerTone(987.77, 0.09, 0.24, 'sine', 0.24);
      } else if (reaction === 'DANCE') {
        [130.81, 196.0, 233.08, 261.63].forEach((f, idx) => {
          triggerTone(f, idx * 0.13, 0.14, 'sawtooth', 0.12);
          triggerTone(f * 2, idx * 0.13, 0.11, 'triangle', 0.14);
        });
      } else if (reaction === 'FLOWER') {
        [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98].forEach((f, idx) => {
          triggerTone(f, idx * 0.055, 0.35, 'sine', 0.18);
        });
      }
    } catch {
      // Ignore if AudioContext cannot start before user gesture
    }
  }
}

export const audioEngine = new AudioEngine();
