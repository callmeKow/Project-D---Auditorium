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
  private vocalMudFilter: BiquadFilterNode | null = null;
  private vocalPresenceFilter: BiquadFilterNode | null = null;
  private reverbHighpass: BiquadFilterNode | null = null;
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
  private prerecordedGain: GainNode | null = null;
  private musicBassDb = 0; // -12 .. +14 dB low-shelf EQ at 110Hz
  private musicBassFilter: BiquadFilterNode | null = null;
  private synthBassFilter: BiquadFilterNode | null = null;
  private emoteVolume = 70;
  private emoteMuted = false;
  private roomOutputMuted = false;
  private emoteMasterGain: GainNode | null = null;
  private applauseRawPromise: Promise<ArrayBuffer | null> | null = null;
  private applauseBuffer: AudioBuffer | null = null;
  private applauseDecodePromise: Promise<AudioBuffer | null> | null = null;
  private activeApplause: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private activeSynthBus: GainNode | null = null;
  private lastEmoteSoundAt = new Map<string, number>();
  private echoCancellation = false;
  private noiseSuppression = false;
  private selectedDeviceId = '';
  // Second Microphone Channel (Mic 2 — Song ca / Phụ)
  private rawStream2: MediaStream | null = null;
  private sourceNode2: MediaStreamAudioSourceNode | null = null;
  private inputGain2: GainNode | null = null;
  private inputGainValue2 = 1.4;
  private highpassFilter2: BiquadFilterNode | null = null;
  private vocalMudFilter2: BiquadFilterNode | null = null;
  private vocalPresenceFilter2: BiquadFilterNode | null = null;
  private noiseGateGain2: GainNode | null = null;
  private noiseGateThreshold2 = 0.08;
  private gateOpen2 = true;
  private gateHoldUntil2 = 0;
  private compressor2: DynamicsCompressorNode | null = null;
  private vocalMixGain2: GainNode | null = null;
  private vocalMixVolume2 = 1.0;
  private mic2MuteGain: GainNode | null = null;
  private mic2Muted = false;
  private analyser2: AnalyserNode | null = null;
  private meterBuf2: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(1024 * 4));
  private meterPeakHold2 = 0;
  private remoteMeterBuf: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(1024 * 4));
  private remoteMeterPeakHold = 0;
  private selectedDeviceId2 = '';
  private midiAccess: MIDIAccess | null = null;
  private pianoTimbre: 'CONCERT_GRAND' | 'FELT_WARM' | 'OPERA_BRIGHT' = 'CONCERT_GRAND';
  private pianoVolume = 0.85;
  private pianoSustainPedal = false;
  private pianoHeldNotes = new Set<number>();
  private pianoSustainedNotes = new Set<number>();
  private activePianoVoices = new Map<
    number,
    {
      osc1: OscillatorNode;
      osc2: OscillatorNode;
      osc3: OscillatorNode;
      filter: BiquadFilterNode;
      envGain: GainNode;
      cleanupTimer: number | null;
    }
  >();
  private pianoReverbConvolver: ConvolverNode | null = null;
  private pianoReverbGain: GainNode | null = null;
  private pianoMasterGain: GainNode | null = null;
  private prerecordedTimer: number | null = null;
  private prerecordedAudioEl: HTMLAudioElement | null = null;
  private prerecordedStream: MediaStream | null = null;
  private onDeviceEnded: (() => void) | null = null;
  private musicListeners = new Set<(vol: number, muted: boolean) => void>();
  private emoteListeners = new Set<(vol: number, muted: boolean) => void>();

  constructor() {
    this.loadSavedSettings();
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      void this.preloadApplauseRaw();
    }
  }

  private loadSavedSettings() {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(KARAOKE_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<ReturnType<AudioEngine['getCaptureSettings']>>;
      if (typeof saved.deviceId === 'string') this.selectedDeviceId = saved.deviceId;
      if (typeof saved.deviceId2 === 'string') this.selectedDeviceId2 = saved.deviceId2;
      if (typeof saved.monitorEnabled === 'boolean') this.monitorEnabled = saved.monitorEnabled;
      if (typeof saved.monitorVolume === 'number') this.monitorVolume = saved.monitorVolume;
      if (typeof saved.inputGain === 'number') this.inputGainValue = saved.inputGain;
      if (typeof saved.noiseGateThreshold === 'number') this.noiseGateThreshold = saved.noiseGateThreshold;
      if (typeof saved.vocalMixVolume === 'number') this.vocalMixVolume = saved.vocalMixVolume;
      if (typeof saved.micMuted === 'boolean') this.micMuted = saved.micMuted;
      if (typeof saved.inputGain2 === 'number') this.inputGainValue2 = saved.inputGain2;
      if (typeof saved.noiseGateThreshold2 === 'number') this.noiseGateThreshold2 = saved.noiseGateThreshold2;
      if (typeof saved.vocalMixVolume2 === 'number') this.vocalMixVolume2 = saved.vocalMixVolume2;
      if (typeof saved.mic2Muted === 'boolean') this.mic2Muted = saved.mic2Muted;
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
      if (typeof saved.musicBassDb === 'number') this.musicBassDb = Math.max(-12, Math.min(14, saved.musicBassDb));
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
    const preDelaySamples = Math.floor(rate * 0.012); // 12ms pre-delay preserves dry vocal clarity
    const impulse = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let lp = 0;
      for (let i = preDelaySamples; i < length; i++) {
        const decay = Math.pow(1 - (i - preDelaySamples) / Math.max(1, length - preDelaySamples), 2.6);
        const white = Math.random() * 2 - 1;
        // 1-pole lowpass smoothing eliminates metallic digital fizz on reverb tail
        lp = lp * 0.62 + white * 0.38;
        data[i] = lp * decay * 0.42;
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

    // Low-cut filter removes AC/fan rumble & plosives cleanly
    this.highpassFilter = ctx.createBiquadFilter();
    this.highpassFilter.type = 'highpass';
    this.highpassFilter.frequency.value = this.noiseGateThreshold > 0 ? 95 : 25;

    // Studio vocal clarity EQ: tame boxy 270Hz mud + add crisp 3.8kHz presence air
    this.vocalMudFilter = ctx.createBiquadFilter();
    this.vocalMudFilter.type = 'peaking';
    this.vocalMudFilter.frequency.value = 270;
    this.vocalMudFilter.Q.value = 1.1;
    this.vocalMudFilter.gain.value = -2.5;

    this.vocalPresenceFilter = ctx.createBiquadFilter();
    this.vocalPresenceFilter.type = 'highshelf';
    this.vocalPresenceFilter.frequency.value = 3800;
    this.vocalPresenceFilter.gain.value = 3.5;

    this.noiseGateGain = ctx.createGain();
    this.noiseGateGain.gain.value = this.noiseGateThreshold > 0 ? 0 : 1;
    this.gateOpen = this.noiseGateThreshold === 0;
    this.gateHoldUntil = 0;

    this.vocalMixGain = ctx.createGain();
    this.vocalMixGain.gain.value = this.vocalMixVolume;

    this.micMuteGain = ctx.createGain();
    this.micMuteGain.gain.value = this.micMuted ? 0 : 1;

    // Fast leveling & anti-clipping limiter so higher mic sensitivity stays punchy and clean
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -13;
    this.compressor.knee.value = 16;
    this.compressor.ratio.value = 3.2;
    this.compressor.attack.value = 0.002;
    this.compressor.release.value = 0.09;

    // Airy Concert Hall / Karaoke Echo loop
    this.echoDelay = ctx.createDelay(1.0);
    this.echoDelay.delayTime.value = this.stageEchoDelayMs / 1000;
    this.echoFilter = ctx.createBiquadFilter();
    this.echoFilter.type = 'lowpass';
    this.echoFilter.frequency.value = 4800;
    this.echoFeedback = ctx.createGain();
    this.echoFeedback.gain.value = this.stageEchoFeedback;
    this.echoWetGain = ctx.createGain();
    this.echoWetGain.gain.value = this.stageEchoEnabled ? this.stageEchoMix : 0;

    // Room Reverb Convolver with 220Hz wet highpass to keep lows crystal-clear
    this.reverbConvolver = ctx.createConvolver();
    this.reverbConvolver.buffer = this.buildReverbImpulse(ctx, this.reverbRoomSec);
    this.reverbHighpass = ctx.createBiquadFilter();
    this.reverbHighpass.type = 'highpass';
    this.reverbHighpass.frequency.value = 220;
    this.reverbWetGain = ctx.createGain();
    this.reverbWetGain.gain.value = this.reverbEnabled ? this.reverbMix : 0;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.25;

    this.monitorGain = ctx.createGain();
    this.monitorGain.gain.value = this.monitorEnabled ? this.monitorVolume : 0;

    this.broadcastDest = ctx.createMediaStreamDestination();

    // Preamp -> Low-cut -> Meter Analyser -> Noise Gate -> Vocal Clarity EQ -> Compressor
    this.sourceNode.connect(this.inputGain);
    this.inputGain.connect(this.highpassFilter);
    this.highpassFilter.connect(this.analyser);
    this.highpassFilter.connect(this.noiseGateGain);
    this.noiseGateGain.connect(this.vocalMudFilter);
    this.vocalMudFilter.connect(this.vocalPresenceFilter);
    this.vocalPresenceFilter.connect(this.compressor);

    // Dry path -> Vocal Mix Gain
    this.compressor.connect(this.vocalMixGain);

    // Wet Stage Echo loop -> Vocal Mix Gain
    this.compressor.connect(this.echoDelay);
    this.echoDelay.connect(this.echoFilter);
    this.echoFilter.connect(this.echoFeedback);
    this.echoFeedback.connect(this.echoDelay);
    this.echoFilter.connect(this.echoWetGain);
    this.echoWetGain.connect(this.vocalMixGain);

    // Wet Room Reverb -> 220Hz Highpass -> Vocal Mix Gain
    this.compressor.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.reverbHighpass);
    this.reverbHighpass.connect(this.reverbWetGain);
    this.reverbWetGain.connect(this.vocalMixGain);

    // Vocal Mix -> Mute Gate -> Self-Monitor & WebRTC Audience Stream
    this.vocalMixGain.connect(this.micMuteGain);
    this.micMuteGain.connect(this.monitorGain);
    this.micMuteGain.connect(this.broadcastDest);
    this.monitorGain.connect(ctx.destination);

    this.stream = this.broadcastDest.stream;
    this.meterPeakHold = 0;

    // Fast background Discord-style Noise Gate envelope follower for Mic 1 & Mic 2
    this.gateTimer = window.setInterval(() => {
      const nowMs = performance.now();
      if (this.noiseGateGain && this.ctx && this.analyser) {
        if (this.noiseGateThreshold <= 0) {
          if (!this.gateOpen) {
            this.gateOpen = true;
            this.noiseGateGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
          }
        } else {
          const m = this.readMeter();
          const level = Math.min(1, Math.max(m.rms * 3.5, m.peak * 1.1));
          if (level >= this.noiseGateThreshold) {
            this.gateHoldUntil = nowMs + 180;
            if (!this.gateOpen) {
              this.gateOpen = true;
              this.noiseGateGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.003);
            }
          } else if (nowMs > this.gateHoldUntil && this.gateOpen) {
            this.gateOpen = false;
            this.noiseGateGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.045);
          }
        }
      }

      if (this.noiseGateGain2 && this.ctx && this.analyser2) {
        if (this.noiseGateThreshold2 <= 0) {
          if (!this.gateOpen2) {
            this.gateOpen2 = true;
            this.noiseGateGain2.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
          }
        } else {
          const m2 = this.readMeterMic2();
          const level2 = Math.min(1, Math.max(m2.rms * 3.5, m2.peak * 1.1));
          if (level2 >= this.noiseGateThreshold2) {
            this.gateHoldUntil2 = nowMs + 180;
            if (!this.gateOpen2) {
              this.gateOpen2 = true;
              this.noiseGateGain2.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.003);
            }
          } else if (nowMs > this.gateHoldUntil2 && this.gateOpen2) {
            this.gateOpen2 = false;
            this.noiseGateGain2.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.045);
          }
        }
      }
    }, 15);

    return this.stream;
  }

  async startCaptureMic2(deviceId?: string): Promise<MediaStream> {
    this.stopCaptureMic2();
    const ctx = await this.ensureContextRunning();
    if (!this.stream || !this.broadcastDest || !this.monitorGain) {
      await this.startCapture(this.selectedDeviceId || undefined, this.monitorEnabled);
    }
    if (deviceId !== undefined) {
      this.selectedDeviceId2 = deviceId;
      this.persistSettings();
    }

    this.rawStream2 = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: (deviceId ?? this.selectedDeviceId2) ? { exact: deviceId ?? this.selectedDeviceId2 } : undefined,
        echoCancellation: this.echoCancellation,
        noiseSuppression: this.noiseSuppression,
        autoGainControl: false,
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48000 },
        sampleSize: { ideal: 16 },
      },
    });

    this.sourceNode2 = ctx.createMediaStreamSource(this.rawStream2);
    this.inputGain2 = ctx.createGain();
    this.inputGain2.gain.value = this.inputGainValue2;

    this.highpassFilter2 = ctx.createBiquadFilter();
    this.highpassFilter2.type = 'highpass';
    this.highpassFilter2.frequency.value = this.noiseGateThreshold2 > 0 ? 95 : 25;

    this.vocalMudFilter2 = ctx.createBiquadFilter();
    this.vocalMudFilter2.type = 'peaking';
    this.vocalMudFilter2.frequency.value = 270;
    this.vocalMudFilter2.Q.value = 1.1;
    this.vocalMudFilter2.gain.value = -2.5;

    this.vocalPresenceFilter2 = ctx.createBiquadFilter();
    this.vocalPresenceFilter2.type = 'highshelf';
    this.vocalPresenceFilter2.frequency.value = 3800;
    this.vocalPresenceFilter2.gain.value = 3.5;

    this.noiseGateGain2 = ctx.createGain();
    this.noiseGateGain2.gain.value = this.noiseGateThreshold2 > 0 ? 0 : 1;
    this.gateOpen2 = this.noiseGateThreshold2 === 0;
    this.gateHoldUntil2 = 0;

    this.compressor2 = ctx.createDynamicsCompressor();
    this.compressor2.threshold.value = -13;
    this.compressor2.knee.value = 16;
    this.compressor2.ratio.value = 3.2;
    this.compressor2.attack.value = 0.002;
    this.compressor2.release.value = 0.09;

    this.vocalMixGain2 = ctx.createGain();
    this.vocalMixGain2.gain.value = this.vocalMixVolume2;

    this.mic2MuteGain = ctx.createGain();
    this.mic2MuteGain.gain.value = this.mic2Muted ? 0 : 1;

    this.analyser2 = ctx.createAnalyser();
    this.analyser2.fftSize = 512;
    this.analyser2.smoothingTimeConstant = 0.25;

    this.sourceNode2.connect(this.inputGain2);
    this.inputGain2.connect(this.highpassFilter2);
    this.highpassFilter2.connect(this.analyser2);
    this.highpassFilter2.connect(this.noiseGateGain2);
    this.noiseGateGain2.connect(this.vocalMudFilter2);
    this.vocalMudFilter2.connect(this.vocalPresenceFilter2);
    this.vocalPresenceFilter2.connect(this.compressor2);

    this.compressor2.connect(this.vocalMixGain2);
    if (this.echoDelay) {
      this.compressor2.connect(this.echoDelay);
    }
    if (this.reverbConvolver) {
      this.compressor2.connect(this.reverbConvolver);
    }

    this.vocalMixGain2.connect(this.mic2MuteGain);
    if (this.monitorGain) {
      this.mic2MuteGain.connect(this.monitorGain);
    }
    if (this.broadcastDest) {
      this.mic2MuteGain.connect(this.broadcastDest);
    }

    this.meterPeakHold2 = 0;
    return this.stream ?? this.rawStream2;
  }

  stopCaptureMic2() {
    this.sourceNode2?.disconnect();
    this.inputGain2?.disconnect();
    this.highpassFilter2?.disconnect();
    this.vocalMudFilter2?.disconnect();
    this.vocalPresenceFilter2?.disconnect();
    this.noiseGateGain2?.disconnect();
    this.compressor2?.disconnect();
    this.vocalMixGain2?.disconnect();
    this.mic2MuteGain?.disconnect();
    this.analyser2?.disconnect();
    this.sourceNode2 = null;
    this.inputGain2 = null;
    this.highpassFilter2 = null;
    this.vocalMudFilter2 = null;
    this.vocalPresenceFilter2 = null;
    this.noiseGateGain2 = null;
    this.compressor2 = null;
    this.vocalMixGain2 = null;
    this.mic2MuteGain = null;
    this.analyser2 = null;
    if (this.rawStream2) {
      for (const track of this.rawStream2.getTracks()) track.stop();
      this.rawStream2 = null;
    }
    this.meterPeakHold2 = 0;
  }

  getStreamMic2(): MediaStream | null {
    return this.rawStream2;
  }

  setSelectedDeviceMic2(deviceId: string) {
    this.selectedDeviceId2 = deviceId;
    this.persistSettings();
  }

  setNoiseGateMic2(threshold: number) {
    this.noiseGateThreshold2 = Math.max(0, Math.min(0.7, threshold));
    if (this.highpassFilter2 && this.ctx) {
      this.highpassFilter2.frequency.setTargetAtTime(
        this.noiseGateThreshold2 > 0 ? 95 : 25,
        this.ctx.currentTime,
        0.015
      );
    }
    if (this.noiseGateThreshold2 === 0 && this.noiseGateGain2 && this.ctx) {
      this.gateOpen2 = true;
      this.noiseGateGain2.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
    }
    this.persistSettings();
  }

  setInputGainMic2(gain: number) {
    this.inputGainValue2 = Math.max(0, Math.min(3.0, gain));
    if (this.inputGain2 && this.ctx) {
      this.inputGain2.gain.setTargetAtTime(this.inputGainValue2, this.ctx.currentTime, 0.015);
    }
    this.persistSettings();
  }

  setVocalMixVolumeMic2(volume: number) {
    this.vocalMixVolume2 = Math.max(0, Math.min(2.0, volume));
    if (this.vocalMixGain2 && this.ctx) {
      this.vocalMixGain2.gain.setTargetAtTime(this.vocalMixVolume2, this.ctx.currentTime, 0.015);
    }
    this.persistSettings();
  }

  setMic2Muted(muted: boolean) {
    this.mic2Muted = muted;
    if (this.mic2MuteGain && this.ctx) {
      this.mic2MuteGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.01);
    }
    this.persistSettings();
  }

  setNoiseGate(threshold: number) {
    this.noiseGateThreshold = Math.max(0, Math.min(0.7, threshold));
    if (this.highpassFilter && this.ctx) {
      this.highpassFilter.frequency.setTargetAtTime(this.noiseGateThreshold > 0 ? 95 : 25, this.ctx.currentTime, 0.015);
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
    this.musicVolume = Math.max(0, Math.min(200, Math.round(volume)));
    if (typeof muted === 'boolean') this.musicMuted = muted;
    if (this.prerecordedAudioEl) {
      this.prerecordedAudioEl.volume = this.musicMuted ? 0 : Math.min(1, this.musicVolume / 100);
    }
    if (this.prerecordedGain && this.ctx) {
      const boost = this.musicMuted ? 0 : this.musicVolume > 100 ? this.musicVolume / 100 : 1;
      this.prerecordedGain.gain.setTargetAtTime(boost, this.ctx.currentTime, 0.02);
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

  setMusicBass(db: number) {
    this.musicBassDb = Math.max(-12, Math.min(14, Math.round(db)));
    if (this.ctx) {
      if (this.musicBassFilter) {
        this.musicBassFilter.gain.setTargetAtTime(this.musicBassDb, this.ctx.currentTime, 0.02);
      }
      if (this.synthBassFilter) {
        this.synthBassFilter.gain.setTargetAtTime(this.musicBassDb, this.ctx.currentTime, 0.02);
      }
    }
    this.persistSettings();
  }

  private ensureMusicBassFilter(ctx: AudioContext): BiquadFilterNode {
    if (!this.musicBassFilter || this.musicBassFilter.context !== ctx) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowshelf';
      f.frequency.value = 110;
      f.gain.value = this.musicBassDb;
      this.musicBassFilter = f;
    }
    return this.musicBassFilter;
  }

  private ensureSynthBassFilter(ctx: AudioContext): BiquadFilterNode {
    if (!this.synthBassFilter || this.synthBassFilter.context !== ctx) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowshelf';
      f.frequency.value = 110;
      f.gain.value = this.musicBassDb;
      f.connect(ctx.destination);
      this.synthBassFilter = f;
    }
    return this.synthBassFilter;
  }

  setEmoteVolume(volume: number, muted?: boolean) {
    this.emoteVolume = Math.max(0, Math.min(100, Math.round(volume)));
    if (typeof muted === 'boolean') this.emoteMuted = muted;
    this.syncEmoteMasterGain();
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
    this.syncEmoteMasterGain();
  }

  getCaptureSettings() {
    return {
      deviceId: this.selectedDeviceId,
      deviceId2: this.selectedDeviceId2,
      monitorEnabled: this.monitorEnabled,
      monitorVolume: this.monitorVolume,
      inputGain: this.inputGainValue,
      noiseGateThreshold: this.noiseGateThreshold,
      vocalMixVolume: this.vocalMixVolume,
      micMuted: this.micMuted,
      inputGain2: this.inputGainValue2,
      noiseGateThreshold2: this.noiseGateThreshold2,
      vocalMixVolume2: this.vocalMixVolume2,
      mic2Muted: this.mic2Muted,
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
      musicBassDb: this.musicBassDb,
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
    return {
      rms,
      peak: this.meterPeakHold,
      clipping: peak >= 0.96,
      gateOpen: this.gateOpen,
    };
  }

  readMeterMic2(): AudioMeterSnapshot {
    const activeAnalyser = this.analyser2 ?? this.remoteAnalyser;
    if (!activeAnalyser) return { rms: 0, peak: 0, clipping: false, gateOpen: true };
    const usingLocalMic2 = Boolean(this.analyser2);
    if (usingLocalMic2) {
      if (this.meterBuf2.length !== activeAnalyser.fftSize) {
        this.meterBuf2 = new Float32Array(new ArrayBuffer(activeAnalyser.fftSize * 4));
      }
      activeAnalyser.getFloatTimeDomainData(this.meterBuf2);
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < this.meterBuf2.length; i++) {
        const abs = Math.abs(this.meterBuf2[i]);
        sum += abs * abs;
        if (abs > peak) peak = abs;
      }
      const rms = Math.sqrt(sum / this.meterBuf2.length);
      this.meterPeakHold2 = Math.max(peak, this.meterPeakHold2 * 0.72);
      return {
        rms,
        peak: this.meterPeakHold2,
        clipping: peak >= 0.96,
        gateOpen: this.gateOpen2,
      };
    }

    if (this.remoteMeterBuf.length !== activeAnalyser.fftSize) {
      this.remoteMeterBuf = new Float32Array(new ArrayBuffer(activeAnalyser.fftSize * 4));
    }
    activeAnalyser.getFloatTimeDomainData(this.remoteMeterBuf);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < this.remoteMeterBuf.length; i++) {
      const abs = Math.abs(this.remoteMeterBuf[i]);
      sum += abs * abs;
      if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sum / this.remoteMeterBuf.length);
    this.remoteMeterPeakHold = Math.max(peak, this.remoteMeterPeakHold * 0.72);
    return {
      rms,
      peak: this.remoteMeterPeakHold,
      clipping: peak >= 0.96,
      gateOpen: rms >= this.noiseGateThreshold2 || this.noiseGateThreshold2 <= 0,
    };
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

  private karaokeVocalStats = {
    totalSamples: 0,
    singingSamples: 0,
    rmsSum: 0,
    rmsSqSum: 0,
  };

  /** Resets mic vocal tracking at the start of a new Karaoke song. */
  resetKaraokeVocalSession() {
    this.karaokeVocalStats = {
      totalSamples: 0,
      singingSamples: 0,
      rmsSum: 0,
      rmsSqSum: 0,
    };
  }

  /** Samples current Mic 1 / Mic 2 vocal energy to evaluate singing participation & steadiness. */
  sampleKaraokeVocalFrame() {
    const m1 = this.readMeter();
    const m2 = this.readMeterMic2();
    const activeRms = Math.max(m1.rms, m2.rms);
    this.karaokeVocalStats.totalSamples += 1;
    if (activeRms > 0.012) {
      this.karaokeVocalStats.singingSamples += 1;
      this.karaokeVocalStats.rmsSum += activeRms;
      this.karaokeVocalStats.rmsSqSum += activeRms * activeRms;
    }
  }

  /**
   * Computes a 75–100 Karaoke score combining real Mic vocal steadiness/activity
   * with a fun entertainment baseline so every performance feels rewarding.
   */
  computeKaraokeScore(): number {
    const { totalSamples, singingSamples, rmsSum, rmsSqSum } = this.karaokeVocalStats;
    if (singingSamples < 6 || totalSamples === 0) {
      // No active mic singing detected -> fun entertainment baseline (75..86)
      return 75 + Math.floor(Math.random() * 12);
    }

    const singingRatio = Math.min(1, singingSamples / Math.max(12, totalSamples * 0.65));
    const meanRms = rmsSum / singingSamples;
    const variance = Math.max(0, rmsSqSum / singingSamples - meanRms * meanRms);
    const stdDev = Math.sqrt(variance);
    const steadiness = Math.max(0, 1 - stdDev / Math.max(0.02, meanRms));

    const activityPts = singingRatio * 11; // 0..11
    const steadinessPts = steadiness * 8; // 0..8
    const entertainmentBonus = Math.floor(Math.random() * 5); // 0..4
    const raw = Math.round(77 + activityPts + steadinessPts + entertainmentBonus);
    return Math.max(75, Math.min(100, raw));
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
      const bassBoost = Math.max(0.35, 1 + this.musicBassDb * 0.045);
      const bass = Math.min(1, Math.pow(Math.max(0, 1 - beatPhase * 2.6), 2) * bassBoost);
      const mid = 0.25 + Math.abs(Math.sin(elapsedSec * 4.1)) * 0.45;
      const high = 0.2 + Math.abs(Math.cos(elapsedSec * 8.2)) * 0.5;
      const beatHit = beatPhase < 0.16;
      return { bass, mid, high, beatHit };
    }

    return { bass: 0, mid: 0, high: 0, beatHit: false };
  }

  stopCapture() {
    this.stopCaptureMic2();
    if (this.gateTimer !== null) {
      clearInterval(this.gateTimer);
      this.gateTimer = null;
    }
    this.sourceNode?.disconnect();
    this.inputGain?.disconnect();
    this.highpassFilter?.disconnect();
    this.vocalMudFilter?.disconnect();
    this.vocalPresenceFilter?.disconnect();
    this.noiseGateGain?.disconnect();
    this.vocalMixGain?.disconnect();
    this.micMuteGain?.disconnect();
    this.compressor?.disconnect();
    this.echoDelay?.disconnect();
    this.echoFilter?.disconnect();
    this.echoFeedback?.disconnect();
    this.echoWetGain?.disconnect();
    this.reverbConvolver?.disconnect();
    this.reverbHighpass?.disconnect();
    this.reverbWetGain?.disconnect();
    this.analyser?.disconnect();
    this.monitorGain?.disconnect();
    this.sourceNode = null;
    this.highpassFilter = null;
    this.vocalMudFilter = null;
    this.vocalPresenceFilter = null;
    this.reverbHighpass = null;
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
    audio.volume = this.musicMuted ? 0 : Math.min(1, this.musicVolume / 100);
    audio.crossOrigin = 'anonymous';
    this.prerecordedAudioEl = audio;

    const source = ctx.createMediaElementSource(audio);
    const boostGain = ctx.createGain();
    boostGain.gain.value = this.musicMuted ? 0 : this.musicVolume > 100 ? this.musicVolume / 100 : 1;
    this.prerecordedGain = boostGain;
    const bassFilter = this.ensureMusicBassFilter(ctx);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const dest = ctx.createMediaStreamDestination();
    source.connect(boostGain);
    boostGain.connect(bassFilter);
    bassFilter.connect(analyser);
    analyser.connect(dest);
    analyser.connect(ctx.destination);
    this.remoteAnalyser = analyser;
    this.prerecordedStream = dest.stream;

    await audio.play();
    return dest.stream;
  }

  stopPrerecordedFile() {
    this.prerecordedGain = null;
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

  private ensurePianoBus(ctx: AudioContext): GainNode {
    if (!this.pianoMasterGain || this.pianoMasterGain.context !== ctx) {
      const master = ctx.createGain();
      master.gain.value = this.pianoVolume;

      const bassFilter = this.ensureSynthBassFilter(ctx);
      master.connect(bassFilter);

      // Subtle Concert Hall Soundboard Reverb on the Grand Piano bus
      const rev = ctx.createConvolver();
      rev.buffer = this.buildReverbImpulse(ctx, 2.1);
      const revGain = ctx.createGain();
      revGain.gain.value = 0.28;
      master.connect(rev);
      rev.connect(revGain);
      revGain.connect(bassFilter);

      this.pianoReverbConvolver = rev;
      this.pianoReverbGain = revGain;
      this.pianoMasterGain = master;
    }
    this.pianoMasterGain.gain.setTargetAtTime(this.pianoVolume, ctx.currentTime, 0.015);
    return this.pianoMasterGain;
  }

  setPianoTimbre(timbre: 'CONCERT_GRAND' | 'FELT_WARM' | 'OPERA_BRIGHT') {
    this.pianoTimbre = timbre;
  }

  getPianoTimbre(): 'CONCERT_GRAND' | 'FELT_WARM' | 'OPERA_BRIGHT' {
    return this.pianoTimbre;
  }

  setPianoVolume(volume: number) {
    this.pianoVolume = Math.max(0, Math.min(1.5, volume));
    if (this.pianoMasterGain && this.ctx) {
      this.pianoMasterGain.gain.setTargetAtTime(this.pianoVolume, this.ctx.currentTime, 0.015);
    }
  }

  getPianoVolume(): number {
    return this.pianoVolume;
  }

  setPianoSustainPedal(active: boolean) {
    this.pianoSustainPedal = active;
    if (!active) {
      for (const note of Array.from(this.pianoSustainedNotes)) {
        if (!this.pianoHeldNotes.has(note)) {
          this.stopPianoVoice(note, 0.26);
        }
      }
      this.pianoSustainedNotes.clear();
    }
  }

  getPianoSustainPedal(): boolean {
    return this.pianoSustainPedal;
  }

  /**
   * Polyphonic Steinway Concert Grand Piano Note-On synthesizer:
   * - 3 harmonic oscillators with natural unison string detune (+1.6 cents / -1.2 cents)
   * - Woody felt-hammer strike transient (first 22ms)
   * - Velocity & key-scaled lowpass filter envelope (bright strike -> warm decay)
   */
  noteOnGrandPiano(midiNote: number, velocity = 100) {
    const ctx = this.ensureContext();
    const master = this.ensurePianoBus(ctx);
    this.pianoHeldNotes.add(midiNote);
    this.pianoSustainedNotes.delete(midiNote);

    // If the same note is re-struck while decaying, release previous voice smoothly
    if (this.activePianoVoices.has(midiNote)) {
      this.stopPianoVoice(midiNote, 0.035);
    }

    const now = ctx.currentTime;
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const velNorm = Math.max(0.2, Math.min(1.0, velocity / 127));

    const envGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    const brightnessMult =
      this.pianoTimbre === 'OPERA_BRIGHT' ? 8.2 : this.pianoTimbre === 'FELT_WARM' ? 3.4 : 5.8;
    const sustainFilterMult =
      this.pianoTimbre === 'OPERA_BRIGHT' ? 3.2 : this.pianoTimbre === 'FELT_WARM' ? 1.5 : 2.3;

    const peakCutoff = Math.min(16000, Math.max(600, freq * brightnessMult * (0.7 + 0.5 * velNorm)));
    const tailCutoff = Math.min(9000, Math.max(320, freq * sustainFilterMult));
    filter.frequency.setValueAtTime(peakCutoff, now);
    filter.frequency.exponentialRampToValueAtTime(tailCutoff, now + 0.75);
    filter.Q.value = 0.85;

    // 1. Fundamental string (warm body)
    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, now);

    // 2. Unison string + octave overtone (Steinway double/triple string chorus)
    const osc2 = ctx.createOscillator();
    osc2.type = this.pianoTimbre === 'FELT_WARM' ? 'sine' : 'sawtooth';
    osc2.frequency.setValueAtTime(freq, now);
    osc2.detune.setValueAtTime(1.7, now);
    const g2 = ctx.createGain();
    g2.gain.value = this.pianoTimbre === 'OPERA_BRIGHT' ? 0.24 : this.pianoTimbre === 'FELT_WARM' ? 0.12 : 0.18;

    // 3. Harmonic 2nd partial (2 * freq) for acoustic piano string resonance
    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq * 2, now);
    osc3.detune.setValueAtTime(-1.4, now);
    const g3 = ctx.createGain();
    // Higher notes have fewer audible upper partials on a real grand piano
    const registerScale = Math.max(0.04, Math.min(0.22, (84 - midiNote) / 220));
    g3.gain.value = registerScale;

    osc1.connect(filter);
    osc2.connect(g2);
    g2.connect(filter);
    osc3.connect(g3);
    g3.connect(filter);

    // Subtle felt-hammer woody thump transient (18ms)
    const strikeLen = Math.max(1, Math.floor(ctx.sampleRate * 0.02));
    const strikeBuf = ctx.createBuffer(1, strikeLen, ctx.sampleRate);
    const ch = strikeBuf.getChannelData(0);
    for (let i = 0; i < strikeLen; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / strikeLen, 2.5);
    }
    const strikeSrc = ctx.createBufferSource();
    strikeSrc.buffer = strikeBuf;
    const strikeBp = ctx.createBiquadFilter();
    strikeBp.type = 'bandpass';
    strikeBp.frequency.value = Math.min(4800, Math.max(400, freq * 2.4));
    strikeBp.Q.value = 1.6;
    const strikeGain = ctx.createGain();
    strikeGain.gain.value = (this.pianoTimbre === 'FELT_WARM' ? 0.09 : 0.15) * velNorm;
    strikeSrc.connect(strikeBp);
    strikeBp.connect(strikeGain);
    strikeGain.connect(filter);

    filter.connect(envGain);
    envGain.connect(master);
    if (this.broadcastDest && this.broadcastDest.context === ctx) {
      envGain.connect(this.broadcastDest);
    }

    // Natural Grand Piano percussive ADSR envelope (fast hammer attack -> natural soundboard decay)
    const peakAmp = 0.28 * velNorm;
    const naturalDecaySec = Math.max(1.4, Math.min(4.8, 3.8 - (midiNote - 48) * 0.045));
    envGain.gain.setValueAtTime(0.0001, now);
    envGain.gain.linearRampToValueAtTime(peakAmp, now + 0.006);
    envGain.gain.exponentialRampToValueAtTime(peakAmp * 0.52, now + 0.14);
    envGain.gain.exponentialRampToValueAtTime(0.0008, now + naturalDecaySec);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    strikeSrc.start(now);

    const cleanupTimer =
      typeof window !== 'undefined'
        ? window.setTimeout(() => {
            this.stopPianoVoice(midiNote, 0.05);
          }, Math.round(naturalDecaySec * 1000) + 120)
        : null;

    this.activePianoVoices.set(midiNote, {
      osc1,
      osc2,
      osc3,
      filter,
      envGain,
      cleanupTimer,
    });
  }

  noteOffGrandPiano(midiNote: number) {
    this.pianoHeldNotes.delete(midiNote);
    if (this.pianoSustainPedal) {
      this.pianoSustainedNotes.add(midiNote);
      return;
    }
    this.stopPianoVoice(midiNote, 0.24);
  }

  private stopPianoVoice(midiNote: number, releaseSec = 0.22) {
    const voice = this.activePianoVoices.get(midiNote);
    if (!voice) return;
    this.activePianoVoices.delete(midiNote);
    if (voice.cleanupTimer !== null && typeof window !== 'undefined') {
      clearTimeout(voice.cleanupTimer);
    }
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      voice.envGain.gain.cancelScheduledValues(now);
      voice.envGain.gain.setValueAtTime(Math.max(0.0005, voice.envGain.gain.value), now);
      voice.envGain.gain.exponentialRampToValueAtTime(0.0001, now + releaseSec);
      const stopAt = now + releaseSec + 0.02;
      voice.osc1.stop(stopAt);
      voice.osc2.stop(stopAt);
      voice.osc3.stop(stopAt);
    } catch {
      // Ignore if context already closed
    }
  }

  releaseAllPianoNotes() {
    this.pianoHeldNotes.clear();
    this.pianoSustainedNotes.clear();
    for (const note of Array.from(this.activePianoVoices.keys())) {
      this.stopPianoVoice(note, 0.12);
    }
  }

  /**
   * Musicca Multi-Instrument Synthesizer (PIANO, GUITAR, BASS, VIOLIN/CELLO, DRUMS).
   * Routes through the Chamber/Opera instrument bus + WebRTC broadcast stream.
   */
  playInstrumentNoteOn(instrument: InstrumentType, midiNote: number, velocity = 100) {
    if (instrument === 'PIANO') {
      this.noteOnGrandPiano(midiNote, velocity);
      return;
    }

    const ctx = this.ensureContext();
    const master = this.ensurePianoBus(ctx);
    const now = ctx.currentTime;
    const vel = Math.max(0.2, Math.min(1, velocity / 127));

    if (instrument === 'DRUMS') {
      this.triggerDrumKitPiece(ctx, master, midiNote, vel, now);
      return;
    }

    // Stop existing voice on same MIDI note if re-triggered
    if (this.activePianoVoices.has(midiNote)) {
      this.stopPianoVoice(midiNote, 0.03);
    }

    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const envGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();

    let naturalDecaySec = 1.8;

    if (instrument === 'GUITAR') {
      // Plucked Acoustic / Classical Guitar
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc3.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.frequency.setValueAtTime(freq, now);
      osc2.detune.setValueAtTime(2.2, now);
      osc3.frequency.setValueAtTime(freq * 2, now);

      const g2 = ctx.createGain();
      g2.gain.value = 0.45;
      const g3 = ctx.createGain();
      g3.gain.value = 0.14;

      filter.frequency.setValueAtTime(Math.min(9500, freq * 7.5), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(420, freq * 2.1), now + 0.35);
      filter.Q.value = 1.4;

      osc1.connect(filter);
      osc2.connect(g2);
      g2.connect(filter);
      osc3.connect(g3);
      g3.connect(filter);

      naturalDecaySec = 2.1;
      envGain.gain.setValueAtTime(0.0001, now);
      envGain.gain.linearRampToValueAtTime(0.3 * vel, now + 0.005);
      envGain.gain.exponentialRampToValueAtTime(0.14 * vel, now + 0.12);
      envGain.gain.exponentialRampToValueAtTime(0.0008, now + naturalDecaySec);
    } else if (instrument === 'BASS') {
      // 4-String Fingered Bass Guitar
      osc1.type = 'sine';
      osc2.type = 'sawtooth';
      osc3.type = 'triangle';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.frequency.setValueAtTime(freq, now);
      osc3.frequency.setValueAtTime(freq * 2, now);

      const g2 = ctx.createGain();
      g2.gain.value = 0.38;
      const g3 = ctx.createGain();
      g3.gain.value = 0.15;

      filter.frequency.setValueAtTime(Math.min(2200, freq * 8.5), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(180, freq * 2.4), now + 0.18);
      filter.Q.value = 2.1;

      osc1.connect(filter);
      osc2.connect(g2);
      g2.connect(filter);
      osc3.connect(g3);
      g3.connect(filter);

      naturalDecaySec = 1.9;
      envGain.gain.setValueAtTime(0.0001, now);
      envGain.gain.linearRampToValueAtTime(0.38 * vel, now + 0.007);
      envGain.gain.exponentialRampToValueAtTime(0.22 * vel, now + 0.14);
      envGain.gain.exponentialRampToValueAtTime(0.0008, now + naturalDecaySec);
    } else {
      // VIOLIN / CELLO: Bowed String with Vibrato LFO & Wooden Bridge Resonance
      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc3.type = 'triangle';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.frequency.setValueAtTime(freq, now);
      osc2.detune.setValueAtTime(4.5, now);
      osc3.frequency.setValueAtTime(freq * 2, now);

      // 5.6Hz Bowed Vibrato
      const vibLfo = ctx.createOscillator();
      const vibGain = ctx.createGain();
      vibLfo.frequency.value = 5.6;
      vibGain.gain.value = freq * 0.0075;
      vibLfo.connect(vibGain);
      vibGain.connect(osc1.frequency);
      vibGain.connect(osc2.frequency);
      vibLfo.start(now);
      vibLfo.stop(now + 4.2);

      const g2 = ctx.createGain();
      g2.gain.value = 0.5;
      const g3 = ctx.createGain();
      g3.gain.value = 0.18;

      filter.frequency.setValueAtTime(Math.min(5800, freq * 4.8), now);
      filter.Q.value = 1.25;

      osc1.connect(filter);
      osc2.connect(g2);
      g2.connect(filter);
      osc3.connect(g3);
      g3.connect(filter);

      naturalDecaySec = 3.6;
      envGain.gain.setValueAtTime(0.0001, now);
      envGain.gain.linearRampToValueAtTime(0.24 * vel, now + 0.075);
      envGain.gain.exponentialRampToValueAtTime(0.2 * vel, now + 0.45);
      envGain.gain.exponentialRampToValueAtTime(0.001, now + naturalDecaySec);
    }

    filter.connect(envGain);
    envGain.connect(master);
    if (this.broadcastDest && this.broadcastDest.context === ctx) {
      envGain.connect(this.broadcastDest);
    }

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);

    const cleanupTimer =
      typeof window !== 'undefined'
        ? window.setTimeout(() => {
            this.stopPianoVoice(midiNote, 0.08);
          }, Math.round(naturalDecaySec * 1000) + 120)
        : null;

    this.activePianoVoices.set(midiNote, {
      osc1,
      osc2,
      osc3,
      filter,
      envGain,
      cleanupTimer,
    });
  }

  playInstrumentNoteOff(instrument: InstrumentType, midiNote: number) {
    if (instrument === 'DRUMS') return;
    if (instrument === 'PIANO') {
      this.noteOffGrandPiano(midiNote);
      return;
    }
    const releaseSec = instrument === 'VIOLIN' || instrument === 'CELLO' ? 0.28 : 0.35;
    this.stopPianoVoice(midiNote, releaseSec);
  }

  private triggerDrumKitPiece(
    ctx: AudioContext,
    master: GainNode,
    midiNote: number,
    vel: number,
    now: number
  ) {
    const out = ctx.createGain();
    out.gain.value = vel;
    out.connect(master);
    if (this.broadcastDest && this.broadcastDest.context === ctx) {
      out.connect(this.broadcastDest);
    }

    const createNoise = (durSec: number) => {
      const len = Math.max(1, Math.floor(ctx.sampleRate * durSec));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      return src;
    };

    if (midiNote === 36) {
      // Bass Drum (Kick: X / Z)
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.09);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.28);
      g.gain.setValueAtTime(0.65, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.connect(g);
      g.connect(out);
      osc.start(now);
      osc.stop(now + 0.34);
    } else if (midiNote === 38 || midiNote === 37) {
      // Snare Drum (38: S / A) or Cross Stick (37: D / F)
      const isCross = midiNote === 37;
      const bodyOsc = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      bodyOsc.type = 'triangle';
      bodyOsc.frequency.setValueAtTime(isCross ? 420 : 195, now);
      bodyOsc.frequency.exponentialRampToValueAtTime(isCross ? 260 : 110, now + 0.08);
      bodyGain.gain.setValueAtTime(isCross ? 0.35 : 0.42, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + (isCross ? 0.09 : 0.14));
      bodyOsc.connect(bodyGain);
      bodyGain.connect(out);
      bodyOsc.start(now);
      bodyOsc.stop(now + 0.16);

      const noise = createNoise(isCross ? 0.08 : 0.22);
      const filter = ctx.createBiquadFilter();
      filter.type = isCross ? 'bandpass' : 'highpass';
      filter.frequency.value = isCross ? 1850 : 950;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(isCross ? 0.22 : 0.38, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + (isCross ? 0.075 : 0.21));
      noise.connect(filter);
      filter.connect(ng);
      ng.connect(out);
      noise.start(now);
    } else if (midiNote === 50 || midiNote === 47 || midiNote === 41) {
      // Toms: High Tom (50: G), Low Tom (47: H), Floor Tom (41: J)
      const startHz = midiNote === 50 ? 210 : midiNote === 47 ? 155 : 108;
      const endHz = midiNote === 50 ? 105 : midiNote === 47 ? 78 : 54;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(startHz, now);
      osc.frequency.exponentialRampToValueAtTime(endHz, now + 0.22);
      g.gain.setValueAtTime(0.5, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.connect(g);
      g.connect(out);
      osc.start(now);
      osc.stop(now + 0.34);
    } else {
      // Cymbals & Hi-Hats: Closed HH (42: R/T), Open HH (46: E/W), Foot HH (44: C), Crash (49: Y), Ride (51: U)
      const dur = midiNote === 49 ? 1.15 : midiNote === 51 ? 0.85 : midiNote === 46 ? 0.45 : 0.095;
      const noise = createNoise(dur);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = midiNote === 49 ? 3600 : midiNote === 51 ? 4800 : 6200;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(midiNote === 49 ? 0.34 : 0.26, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
      noise.connect(hp);
      hp.connect(ng);
      ng.connect(out);
      noise.start(now);
    }
  }

  /**
   * Auto-tracks connected hardware MIDI keyboards & external audio instrument interfaces.
   * When a hardware MIDI keyboard is present, binds real-time NoteOn/NoteOff directly to the Grand Piano engine.
   */
  async autoTrackPianoInputs(
    userId: string,
    instrument: InstrumentType,
    onNote: (ev: MidiNoteEventPayload) => void,
    onDevicesUpdated?: (status: {
      midiSupported: boolean;
      midiInputs: string[];
      externalAudioInputs: string[];
      hasHardwareInput: boolean;
    }) => void
  ): Promise<{
    midiSupported: boolean;
    midiInputs: string[];
    externalAudioInputs: string[];
    hasHardwareInput: boolean;
  }> {
    const scanDevices = async (access: MIDIAccess | null) => {
      const midiInputs: string[] = [];
      if (access) {
        for (const input of access.inputs.values()) {
          if (input.state === 'connected') {
            midiInputs.push(input.name ?? 'MIDI Keyboard');
            input.onmidimessage = (msg) => {
              if (!msg.data || msg.data.length < 3) return;
              const status = msg.data[0];
              const note = msg.data[1];
              const velocity = msg.data[2];
              const cmd = status & 0xf0;
              if (cmd === 0x90 || cmd === 0x80) {
                const isNoteOn = cmd === 0x90 && velocity > 0;
                if (isNoteOn) {
                  this.noteOnGrandPiano(note, velocity);
                } else {
                  this.noteOffGrandPiano(note);
                }
                onNote({
                  userId,
                  instrument,
                  note,
                  velocity,
                  isNoteOn,
                  clientTimestampMs: performance.now(),
                });
              } else if (cmd === 0xb0 && note === 64) {
                // MIDI CC 64 = Sustain Damper Pedal
                this.setPianoSustainPedal(velocity >= 64);
              }
            };
          }
        }
      }

      const audioDevices = await this.listAudioInputs();
      const externalAudioInputs = audioDevices
        .map((d) => d.label || '')
        .filter((label) =>
          /piano|midi|yamaha|roland|korg|casio|nord|steinberg|focusrite|scarlett|behringer|motu|asio|line in|instrument/i.test(
            label
          )
        );

      const result = {
        midiSupported: Boolean(access),
        midiInputs,
        externalAudioInputs,
        hasHardwareInput: midiInputs.length > 0 || externalAudioInputs.length > 0,
      };
      onDevicesUpdated?.(result);
      return result;
    };

    if (!('requestMIDIAccess' in navigator)) {
      return scanDevices(null);
    }
    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      this.midiAccess.onstatechange = () => {
        void scanDevices(this.midiAccess);
      };
      return await scanDevices(this.midiAccess);
    } catch {
      return scanDevices(null);
    }
  }

  // Synthesize a clean Grand Piano tone for Sound Check & MIDI testing
  playSynthNote(midiNote: number, durationSec = 0.45) {
    this.noteOnGrandPiano(midiNote, 100);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        this.noteOffGrandPiano(midiNote);
      }, Math.max(120, Math.round(durationSec * 1000)));
    }
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

  private ensureEmoteMasterGain(ctx: AudioContext): GainNode {
    if (!this.emoteMasterGain || this.emoteMasterGain.context !== ctx) {
      this.emoteMasterGain = ctx.createGain();
      this.emoteMasterGain.connect(ctx.destination);
    }
    this.syncEmoteMasterGain();
    return this.emoteMasterGain;
  }

  private syncEmoteMasterGain() {
    if (!this.emoteMasterGain || !this.ctx) return;
    const target = this.roomOutputMuted || this.emoteMuted ? 0 : this.emoteVolume / 100;
    this.emoteMasterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  private preloadApplauseRaw(): Promise<ArrayBuffer | null> {
    if (!this.applauseRawPromise) {
      this.applauseRawPromise = fetch('/sounds/applause.wav')
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .catch(() => null);
    }
    return this.applauseRawPromise;
  }

  private async getApplauseBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
    if (this.applauseBuffer) return this.applauseBuffer;
    if (!this.applauseDecodePromise) {
      this.applauseDecodePromise = (async () => {
        try {
          const raw = await this.preloadApplauseRaw();
          if (!raw) return null;
          // Copy buffer so decodeAudioData never detaches cached ArrayBuffer
          const decoded = await ctx.decodeAudioData(raw.slice(0));
          this.applauseBuffer = decoded;
          return decoded;
        } catch {
          return null;
        } finally {
          this.applauseDecodePromise = null;
        }
      })();
    }
    return this.applauseDecodePromise;
  }

  private applyTimedFadeEnvelope(
    gainParam: AudioParam,
    now: number,
    peakGain: number,
    totalDurationSec: number,
    fadeStartSec: number
  ) {
    const safeFadeStart = Math.min(Math.max(0.05, fadeStartSec), Math.max(0.06, totalDurationSec - 0.15));
    const tailRampSec = Math.min(0.12, (totalDurationSec - safeFadeStart) * 0.15);
    gainParam.setValueAtTime(0.001, now);
    gainParam.linearRampToValueAtTime(peakGain, now + 0.04);
    gainParam.setValueAtTime(peakGain, now + safeFadeStart);
    gainParam.exponentialRampToValueAtTime(0.015, now + totalDurationSec - tailRampSec);
    gainParam.linearRampToValueAtTime(0, now + totalDurationSec);
  }

  private async playRecordedApplause(
    ctx: AudioContext,
    playDurationSec: number,
    fadeStartSec: number
  ): Promise<boolean> {
    const buffer = await this.getApplauseBuffer(ctx);
    if (!buffer || this.roomOutputMuted || this.emoteMuted || this.emoteVolume <= 0) {
      return Boolean(buffer);
    }

    const master = this.ensureEmoteMasterGain(ctx);
    const now = ctx.currentTime;

    // Fade out any overlapping applause cleanly instead of stacking loud layers
    if (this.activeApplause) {
      const prev = this.activeApplause;
      this.activeApplause = null;
      try {
        prev.gain.gain.cancelScheduledValues(now);
        prev.gain.gain.setTargetAtTime(0, now, 0.04);
        prev.source.stop(now + 0.18);
      } catch {
        // Ignore if already ended
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const clipGain = ctx.createGain();
    const effectiveDur = Math.min(playDurationSec, buffer.duration);

    // Hold normal volume up to fadeStartSec (e.g. 3.0s), then fade out smoothly until effectiveDur (4.0s)
    this.applyTimedFadeEnvelope(clipGain.gain, now, 1.15, effectiveDur, fadeStartSec);

    src.connect(clipGain);
    clipGain.connect(master);

    const entry = { source: src, gain: clipGain };
    this.activeApplause = entry;
    src.onended = () => {
      clipGain.disconnect();
      if (this.activeApplause === entry) {
        this.activeApplause = null;
      }
    };

    src.start(now, 0, effectiveDur + 0.02);
    return true;
  }

  // Play SFX for Auditorium Emotes & Applause
  // CLAP emote plays for 7s total (normal 0..4s, fade out 4..7s to silence);
  // other Emotes play for 4s total (normal 0..3s, fade out 3..4s to silence).
  playReactionSound(
    reaction: 'CLAP' | 'CHEER' | 'WAVE' | 'DANCE' | 'DANCE_2' | 'DANCE_3' | 'DANCE_4' | 'DANCE_5' | 'FLOWER' | 'APPLAUSE'
  ) {
    if (this.roomOutputMuted || this.emoteMuted || this.emoteVolume <= 0) return;

    const nowMs = performance.now();
    const lastAt = this.lastEmoteSoundAt.get(reaction) ?? 0;
    if (nowMs - lastAt < 110) return; // Prevent audio clipping when multiple users react simultaneously
    this.lastEmoteSoundAt.set(reaction, nowMs);

    try {
      const ctx = this.ensureContext();
      const master = this.ensureEmoteMasterGain(ctx);
      const t0 = ctx.currentTime;

      if (reaction === 'CLAP' || reaction === 'APPLAUSE') {
        const isStageApplause = reaction === 'APPLAUSE';
        const durationSec = isStageApplause ? 10.0 : 7.0;
        const fadeStartSec = isStageApplause ? 7.5 : 4.0;
        void this.playRecordedApplause(ctx, durationSec, fadeStartSec).then((played) => {
          if (played) return;
          // Fallback synth applause only if /sounds/applause.wav fails to fetch/decode
          const synthFallback = ctx.createGain();
          this.applyTimedFadeEnvelope(synthFallback.gain, ctx.currentTime, 0.45, durationSec, fadeStartSec);
          synthFallback.connect(master);
          const steps = isStageApplause ? 36 : 28;
          for (let i = 0; i < steps; i++) {
            const ofs = (i / steps) * (durationSec - 0.15);
            const len = Math.max(1, Math.floor(ctx.sampleRate * 0.12));
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const ch = buf.getChannelData(0);
            for (let j = 0; j < len; j++) {
              ch[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 2.2);
            }
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(synthFallback);
            src.start(ctx.currentTime + ofs);
          }
        });
        return;
      }

      // Fade out previous synth emote cleanly if re-triggered within 4s
      if (this.activeSynthBus) {
        const prev = this.activeSynthBus;
        try {
          prev.gain.cancelScheduledValues(t0);
          prev.gain.setTargetAtTime(0, t0, 0.04);
        } catch {
          // Ignore
        }
      }

      const synthBus = ctx.createGain();
      // Emote 4s envelope: normal 0..3s, fade out 3..4s
      this.applyTimedFadeEnvelope(synthBus.gain, t0, 0.45, 4.0, 3.0);
      synthBus.connect(master);
      this.activeSynthBus = synthBus;

      const triggerNoiseBurst = (offset: number, centerHz: number, dur = 0.08, amp = 0.45) => {
        if (offset >= 3.95) return;
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
        g.connect(synthBus);
        src.start(t0 + offset);
      };

      const triggerTone = (
        freq: number,
        offset: number,
        dur: number,
        type: OscillatorType = 'triangle',
        amp = 0.22
      ) => {
        if (offset >= 3.95) return;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0 + offset);
        g.gain.setValueAtTime(0.001, t0 + offset);
        g.gain.exponentialRampToValueAtTime(amp, t0 + offset + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + offset + dur);
        osc.connect(g);
        g.connect(synthBus);
        osc.start(t0 + offset);
        osc.stop(t0 + offset + dur + 0.02);
      };

      if (reaction === 'CHEER') {
        const fanfare = [523.25, 659.25, 783.99, 1046.5];
        for (let bar = 0; bar < 4; bar++) {
          const base = bar * 0.95;
          fanfare.forEach((f, idx) => {
            triggerTone(f, base + idx * 0.1, 0.35, idx === 3 ? 'sine' : 'triangle', 0.22);
          });
          triggerNoiseBurst(base + 0.12, 1500, 0.55, 0.24);
        }
      } else if (reaction === 'WAVE') {
        for (let bar = 0; bar < 5; bar++) {
          const base = bar * 0.78;
          triggerTone(783.99, base, 0.24, 'sine', 0.2);
          triggerTone(987.77, base + 0.14, 0.38, 'sine', 0.22);
        }
      } else if (
        reaction === 'DANCE' ||
        reaction === 'DANCE_2' ||
        reaction === 'DANCE_3' ||
        reaction === 'DANCE_4' ||
        reaction === 'DANCE_5'
      ) {
        const groove = [130.81, 196.0, 233.08, 261.63];
        for (let step = 0; step < 16; step++) {
          const f = groove[step % groove.length];
          const ofs = step * 0.24;
          triggerTone(f, ofs, 0.18, 'sawtooth', 0.12);
          triggerTone(f * 2, ofs, 0.15, 'triangle', 0.14);
        }
      } else if (reaction === 'FLOWER') {
        const arp = [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98];
        for (let loop = 0; loop < 3; loop++) {
          const base = loop * 1.25;
          arp.forEach((f, idx) => {
            triggerTone(f, base + idx * 0.16, 0.45, 'sine', 0.17);
          });
        }
      }
    } catch {
      // Ignore if AudioContext cannot start before user gesture
    }
  }
}

export const audioEngine = new AudioEngine();
