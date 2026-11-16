import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Mic,
  Volume2,
  Piano,
  Radio,
  CheckCircle2,
  Circle,
  ArrowRight,
  AlertTriangle,
  Cpu,
  Upload,
  Loader2,
} from 'lucide-react';
import type { AudioInputMode, InstrumentType } from '@vmw/contracts';
import { audioEngine, type AudioMeterSnapshot, type BrowserAudioCapabilities } from '../audio/audioEngine';
import { useAuth } from '../state/authStore';

const DEMO_NOTES = [
  { label: 'C4', midi: 60 },
  { label: 'D4', midi: 62 },
  { label: 'E4', midi: 64 },
  { label: 'F4', midi: 65 },
  { label: 'G4', midi: 67 },
  { label: 'A4', midi: 69 },
  { label: 'B4', midi: 71 },
  { label: 'C5', midi: 72 },
];

export function PerformerSetupPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const savedAudio = audioEngine.getCaptureSettings();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(savedAudio.deviceId);
  const [inputMode, setInputMode] = useState<AudioInputMode>('MICROPHONE');
  const [instrument, setInstrument] = useState<InstrumentType>('PIANO');
  const [monitoring, setMonitoring] = useState(savedAudio.monitorEnabled); // Persisted Discord-style mic playback
  const [monitorVolume, setMonitorVolume] = useState(savedAudio.monitorVolume);
  const [inputGain, setInputGain] = useState(savedAudio.inputGain);
  const [noiseGate, setNoiseGate] = useState(savedAudio.noiseGateThreshold);
  // Default browser VoIP DSP to OFF so Chrome AEC/Noise-Gate never chops off live playback or quiet voice/instruments
  const [echoCancellation, setEchoCancellation] = useState(savedAudio.echoCancellation);
  const [noiseSuppression, setNoiseSuppression] = useState(savedAudio.noiseSuppression);
  const [autoGainControl, setAutoGainControl] = useState(false);
  const [capturePending, setCapturePending] = useState(false);
  const [capturing, setCapturing] = useState(Boolean(audioEngine.getStream()));
  const [meter, setMeter] = useState<AudioMeterSnapshot>({ rms: 0, peak: 0, clipping: false, gateOpen: true });
  const [midiStatus, setMidiStatus] = useState('Not initialized');
  const [midiReady, setMidiReady] = useState(false);
  const [lastMidiNote, setLastMidiNote] = useState<number | null>(null);
  const [prerecordedPlaying, setPrerecordedPlaying] = useState(false);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [copyrightAgreed, setCopyrightAgreed] = useState(false); // TBD-19
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<BrowserAudioCapabilities | null>(null);

  const refreshDevices = async () => {
    const list = await audioEngine.listAudioInputs();
    setDevices(list);
    if (list.length > 0 && (!selectedDeviceId || !list.some((d) => d.deviceId === selectedDeviceId))) {
      setSelectedDeviceId(list[0].deviceId);
    }
  };

  useEffect(() => {
    void refreshDevices();
    audioEngine.getCapabilities().then(setCapabilities).catch(() => {});
    audioEngine.setOnDeviceDisconnected(() => {
      setCapturing(false);
      setCaptureError('Audio device disconnected! Check your USB/mic connection or switch to Prerecorded.');
    });

    return () => {
      audioEngine.setOnDeviceDisconnected(null);
      audioEngine.stopPrerecordedDemoLoop();
    };
  }, []);

  useEffect(() => {
    if (!capturing) return;
    const id = window.setInterval(() => setMeter(audioEngine.readMeter()), 60);
    return () => clearInterval(id);
  }, [capturing]);

  const startCaptureWithOptions = async (
    devId?: string,
    enableMonitor = monitoring,
    dsp?: { echo?: boolean; noise?: boolean; agc?: boolean; gain?: number }
  ) => {
    if (capturePending) return;
    setCapturePending(true);
    setCaptureError(null);
    try {
      await audioEngine.startCapture(devId || undefined, enableMonitor, {
        echoCancellation: dsp?.echo ?? echoCancellation,
        noiseSuppression: dsp?.noise ?? noiseSuppression,
        autoGainControl: dsp?.agc ?? autoGainControl,
        inputGain: dsp?.gain ?? inputGain,
        monitorVolume,
      });
      setCapturing(true);
      await refreshDevices();
      audioEngine.getCapabilities().then(setCapabilities).catch(() => {});
    } catch (err) {
      setCaptureError((err as Error).message || 'Could not access microphone / audio interface.');
    } finally {
      setCapturePending(false);
    }
  };

  const handleToggleCapture = async () => {
    if (capturePending) return;
    if (capturing) {
      audioEngine.stopCapture();
      setCapturing(false);
    } else {
      await startCaptureWithOptions(selectedDeviceId, monitoring);
    }
  };

  const handleToggleMicPlayback = async () => {
    const next = !monitoring;
    setMonitoring(next);
    if (!capturing && next) {
      await startCaptureWithOptions(selectedDeviceId, true);
    } else {
      await audioEngine.setMonitoring(next, monitorVolume);
    }
  };

  const handleInitMidi = async () => {
    const res = await audioEngine.initMidi(user?.id ?? 'performer', instrument, (ev) => {
      if (ev.isNoteOn) {
        setLastMidiNote(ev.note);
        audioEngine.playSynthNote(ev.note);
      }
    });
    setMidiReady(true);
    setMidiStatus(
      res.supported
        ? res.inputs.length > 0
          ? `Connected: ${res.inputs.join(', ')}`
          : 'WebMIDI ready (no physical device detected; use virtual keys below)'
        : 'WebMIDI unsupported in this browser (use virtual keys below)'
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCaptureError(null);
    try {
      await audioEngine.playPrerecordedFile(file);
      setLoadedFileName(file.name);
    } catch (err) {
      setCaptureError((err as Error).message);
    }
  };

  const enterStage = () => {
    navigate(`/room/${roomId}`, {
      state: { performerInstrument: instrument, soundChecked: capturing || midiReady || Boolean(loadedFileName) },
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            Pre-Show Workflow (LMR-08)
          </span>
          <h1 className="mt-1 text-2xl font-extrabold text-white">Performer Setup & Sound Check</h1>
          <p className="mt-1 text-sm text-stone-400">
            Verify audio input, level headroom, and MIDI-to-animation sync before stepping onto the 3D stage.
          </p>
        </div>
        <button
          disabled={!copyrightAgreed}
          onClick={enterStage}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-5 py-3 text-sm font-bold text-stone-950 shadow-lg shadow-amber-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Enter Stage (3D Auditorium) <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Mandatory Copyright Declaration (TBD-19 / SEC-09) */}
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100">
        <input
          type="checkbox"
          checked={copyrightAgreed}
          onChange={(e) => setCopyrightAgreed(e.target.checked)}
          className="mt-0.5 accent-amber-500"
        />
        <span>
          <strong>Cam kết Bản quyền Âm nhạc (SEC-09 / TBD-19):</strong> Tôi xác nhận tác phẩm tôi biểu diễn là nhạc gốc,
          thuộc phạm vi công cộng, hoặc đã có quyền biểu diễn hợp lệ và tuân thủ quy tắc nền tảng.
        </span>
      </label>

      {/* Readiness Checklist */}
      <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-stone-800 bg-stone-900/60 p-4 sm:grid-cols-3">
        <div className="flex items-center gap-2.5 text-xs">
          {capturing || loadedFileName ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <Circle className="h-4 w-4 shrink-0 text-stone-600" />
          )}
          <div>
            <div className="font-semibold text-stone-200">1. Audio Input Active</div>
            <div className="text-stone-400">
              {capturing ? 'Mic/Interface ready for WebRTC' : loadedFileName ? `Track: ${loadedFileName}` : 'Start Sound Check below'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 text-xs">
          {capturing && !meter.clipping ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <Circle className="h-4 w-4 shrink-0 text-stone-600" />
          )}
          <div>
            <div className="font-semibold text-stone-200">2. Clean Headroom</div>
            <div className="text-stone-400">{meter.clipping ? 'Reduce input gain (clipping)' : 'No clipping detected'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 text-xs">
          {midiReady || lastMidiNote !== null ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <Circle className="h-4 w-4 shrink-0 text-stone-600" />
          )}
          <div>
            <div className="font-semibold text-stone-200">3. Instrument & MIDI</div>
            <div className="text-stone-400">Selected: {instrument}</div>
          </div>
        </div>
      </div>

      {/* Browser & Companion Capability Diagnostics (Exp A & Exp F) */}
      {capabilities && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-stone-800/80 bg-stone-950/80 px-4 py-3 text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-stone-300">
            <Cpu className="h-4 w-4 text-amber-400" /> Device Capability Probe:
          </span>
          <div className="flex flex-wrap gap-2 font-mono text-[11px]">
            <span className={capabilities.webAudio ? 'text-emerald-400' : 'text-red-400'}>
              WebAudio:{capabilities.webAudio ? 'OK' : 'NO'}
            </span>
            <span className={capabilities.webRtc ? 'text-emerald-400' : 'text-red-400'}>
              WebRTC:{capabilities.webRtc ? 'OK' : 'NO'}
            </span>
            <span className={capabilities.webMidi ? 'text-emerald-400' : 'text-amber-300'}>
              WebMIDI:{capabilities.webMidi ? 'OK' : 'UNSUPPORTED'}
            </span>
            {capabilities.baseLatencyMs !== null && (
              <span className="text-sky-300">BaseLatency:{capabilities.baseLatencyMs}ms</span>
            )}
            <span className={capabilities.companionBridgeReachable ? 'text-emerald-400' : 'text-stone-400'}>
              CompanionApp:{capabilities.companionBridgeReachable ? 'CONNECTED' : 'BROWSER_ONLY'}
            </span>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Experiment A: Browser Audio Capture & Sound Check */}
        <div className="rounded-2xl border border-stone-800/90 bg-stone-900/80 p-6 shadow-lg">
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <Mic className="h-4 w-4 text-amber-400" /> Audio Input & Level Meter (Exp A)
          </h2>

          <div className="mt-4 space-y-4 text-sm">
            <div>
              <label className="block text-xs font-medium text-stone-400">Input Source Mode</label>
              <select
                value={inputMode}
                onChange={(e) => {
                  const nextMode = e.target.value as AudioInputMode;
                  setInputMode(nextMode);
                  if (nextMode !== 'MICROPHONE') {
                    setEchoCancellation(false);
                    setNoiseSuppression(false);
                    setAutoGainControl(false);
                    if (capturing) {
                      void startCaptureWithOptions(selectedDeviceId, monitoring, {
                        echo: false,
                        noise: false,
                        agc: false,
                      });
                    }
                  }
                }}
                className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-white focus:border-amber-500/60 focus:outline-none"
              >
                <option value="MICROPHONE">Microphone</option>
                <option value="AUDIO_INTERFACE">USB Audio Interface</option>
                <option value="MIDI">MIDI Controller</option>
                <option value="VIRTUAL_DAW">Virtual DAW Audio</option>
                <option value="PRERECORDED">Prerecorded Backing Track</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-400">Audio Device</label>
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedDeviceId(nextId);
                  if (capturing) void startCaptureWithOptions(nextId, monitoring);
                }}
                className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-white focus:border-amber-500/60 focus:outline-none"
              >
                {devices.length === 0 && <option value="">Default Browser Microphone</option>}
                {devices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Audio Input ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                disabled={capturePending}
                onClick={() => void handleToggleCapture()}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition active:scale-95 disabled:cursor-not-allowed ${
                  capturePending
                    ? 'ring-2 ring-amber-300/80 opacity-95'
                    : ''
                } ${
                  capturing
                    ? 'bg-red-600 text-white hover:bg-red-500'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500'
                }`}
              >
                {capturePending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {capturePending
                  ? 'Connecting Mic...'
                  : capturing
                    ? 'Stop Mic Test'
                    : "Let's Check (Bắt đầu Test Mic)"}
              </button>

              <button
                type="button"
                disabled={capturePending}
                onClick={() => void handleToggleMicPlayback()}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${
                  monitoring
                    ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                    : 'border-stone-700 bg-stone-950 text-stone-300 hover:bg-stone-800'
                }`}
              >
                <Volume2 className="h-3.5 w-3.5 text-amber-400" />
                {monitoring ? 'Mic Playback: ON (Đang nghe lại)' : 'Mic Playback: OFF'}
              </button>
            </div>

            {/* Discord-style Mic Input Gain + Playback Volume + Unbundled Raw DSP toggles */}
            <div className="space-y-2.5 rounded-xl border border-stone-800/80 bg-stone-950/70 p-3">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-300">Độ nhạy Mic (Input Gain + Soft Limiter)</span>
                  <span className="font-mono font-semibold text-emerald-300">{Math.round(inputGain * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={3.0}
                  step={0.05}
                  value={inputGain}
                  onChange={(e) => {
                    const gain = Number(e.target.value);
                    setInputGain(gain);
                    audioEngine.setInputGain(gain);
                  }}
                  className="mt-1 w-full accent-emerald-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-400">Playback Volume (Nghe lại giọng)</span>
                  <span className="font-mono font-semibold text-amber-300">{Math.round(monitorVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.8}
                  step={0.05}
                  value={monitorVolume}
                  onChange={(e) => {
                    const vol = Number(e.target.value);
                    setMonitorVolume(vol);
                    void audioEngine.setMonitoring(monitoring, vol);
                  }}
                  className="mt-1 w-full accent-amber-500"
                />
              </div>

              <div className="space-y-1.5 border-t border-stone-800/80 pt-2">
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-stone-300">
                  <input
                    type="checkbox"
                    checked={noiseSuppression}
                    onChange={(e) => {
                      const nextNoise = e.target.checked;
                      setNoiseSuppression(nextNoise);
                      if (capturing) void startCaptureWithOptions(selectedDeviceId, monitoring, { noise: nextNoise });
                    }}
                    className="accent-amber-500"
                  />
                  <span>Noise Suppression (Giảm ồn nền — tắt để giữ trọn âm nhỏ/hát)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-stone-300">
                  <input
                    type="checkbox"
                    checked={echoCancellation}
                    onChange={(e) => {
                      const nextEcho = e.target.checked;
                      setEchoCancellation(nextEcho);
                      if (capturing) void startCaptureWithOptions(selectedDeviceId, monitoring, { echo: nextEcho });
                    }}
                    className="accent-amber-500"
                  />
                  <span>Echo Cancellation (Chỉ bật khi dùng loa ngoài, tắt khi đeo tai nghe)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-stone-300">
                  <input
                    type="checkbox"
                    checked={autoGainControl}
                    onChange={(e) => {
                      const nextAgc = e.target.checked;
                      setAutoGainControl(nextAgc);
                      if (capturing) void startCaptureWithOptions(selectedDeviceId, monitoring, { agc: nextAgc });
                    }}
                    className="accent-amber-500"
                  />
                  <span>Auto Gain Control (Tự chỉnh gain trình duyệt)</span>
                </label>
              </div>

              {monitoring && echoCancellation && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
                  ⚠️ Đang bật Echo Cancellation cùng lúc với Nghe lại giọng: trình duyệt có thể nhận nhầm tiếng mic phát ra loa là tiếng vọng và tự cắt mất âm của bạn. Hãy tắt Echo Cancellation nếu đang đeo tai nghe.
                </div>
              )}
            </div>

            {captureError && (
              <div className="flex items-center gap-2 rounded-xl bg-red-950/60 p-3 text-xs text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{captureError}</span>
              </div>
            )}

            <div className="space-y-2.5 rounded-xl border border-stone-800 bg-stone-950 p-3.5">
              <div>
                <div className="flex justify-between text-[11px] text-stone-400">
                  <span>Input Level (RMS / Peak Hold)</span>
                  <span
                    className={
                      meter.clipping
                        ? 'font-bold text-red-400'
                        : noiseGate > 0 && !meter.gateOpen
                          ? 'font-mono text-amber-400'
                          : 'font-mono text-emerald-400'
                    }
                  >
                    {meter.clipping
                      ? 'CLIPPING!'
                      : `${Math.min(100, Math.round(Math.max(meter.rms * 350, meter.peak * 110)))}% (Peak ${Math.round(meter.peak * 100)}%)${
                          noiseGate > 0 && !meter.gateOpen ? ' • Đang lọc ồn' : ''
                        }`}
                  </span>
                </div>
                <div className="relative mt-2 h-3 w-full overflow-hidden rounded-full bg-stone-800">
                  <div
                    className={`h-full transition-all duration-75 ${
                      meter.clipping
                        ? 'bg-red-500'
                        : noiseGate > 0 && !meter.gateOpen
                          ? 'bg-amber-500/80'
                          : 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-lime-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.round(Math.max(meter.rms * 350, meter.peak * 110)))}%` }}
                  />
                  {noiseGate > 0 && (
                    <div
                      className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-white shadow-[0_0_4px_rgba(255,255,255,0.95)]"
                      style={{ left: `${Math.round(noiseGate * 100)}%` }}
                    />
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-amber-200">Mức độ lọc tiếng ồn (Discord Gate)</span>
                  <span className="font-mono font-semibold text-amber-300">
                    {noiseGate === 0 ? 'Tắt' : `${Math.round(noiseGate * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.7}
                  step={0.02}
                  value={noiseGate}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setNoiseGate(val);
                    audioEngine.setNoiseGate(val);
                  }}
                  className="mt-1 w-full accent-amber-400"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Experiment C: MIDI-to-Animation & Live/Prerecorded Switching */}
        <div className="rounded-2xl border border-stone-800/90 bg-stone-900/80 p-6 shadow-lg">
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <Piano className="h-4 w-4 text-amber-400" /> MIDI & Prerecorded Switch (Exp C)
          </h2>

          <div className="mt-4 space-y-4 text-sm">
            <div>
              <label className="block text-xs font-medium text-stone-400">Instrument Rig</label>
              <select
                value={instrument}
                onChange={(e) => setInstrument(e.target.value as InstrumentType)}
                className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-white focus:border-amber-500/60 focus:outline-none"
              >
                <option value="PIANO">Piano / Keyboard</option>
                <option value="GUITAR">Guitar / Acoustic</option>
                <option value="BASS">Bass Guitar</option>
                <option value="VIOLIN">Violin</option>
                <option value="CELLO">Cello</option>
                <option value="DRUMS">Drums / Pads</option>
              </select>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={handleInitMidi}
                className="rounded-xl border border-stone-700 bg-stone-950 px-4 py-2 text-xs font-semibold text-stone-200 transition hover:border-amber-500/50 hover:bg-stone-800"
              >
                Connect WebMIDI Device
              </button>
              <span className="truncate text-xs text-stone-400">{midiStatus}</span>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-stone-400">Virtual MIDI Test Keys (Note-On + Synth):</p>
              <div className="grid grid-cols-8 gap-1.5">
                {DEMO_NOTES.map((n) => (
                  <button
                    key={n.midi}
                    onClick={() => {
                      setLastMidiNote(n.midi);
                      audioEngine.playSynthNote(n.midi);
                    }}
                    className={`flex h-14 flex-col items-center justify-end rounded-lg border pb-2 text-[11px] font-bold transition ${
                      lastMidiNote === n.midi
                        ? 'border-amber-400 bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
                        : 'border-stone-700 bg-stone-100 text-stone-900 hover:bg-amber-100'
                    }`}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 border-t border-stone-800 pt-4">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-stone-700 bg-stone-950 px-4 py-2.5 text-xs font-medium text-stone-300 hover:border-amber-500/50 hover:text-amber-200">
                <Upload className="h-3.5 w-3.5 text-amber-400" />
                <span>{loadedFileName ? `Loaded: ${loadedFileName}` : 'Load Prerecorded Audio File (MP3/WAV)'}</span>
                <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
              </label>

              <button
                onClick={() => {
                  if (prerecordedPlaying) {
                    audioEngine.stopPrerecordedDemoLoop();
                    setPrerecordedPlaying(false);
                  } else {
                    audioEngine.startPrerecordedDemoLoop((n) => setLastMidiNote(n));
                    setPrerecordedPlaying(true);
                  }
                }}
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white transition ${
                  prerecordedPlaying ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                <Radio className="h-3.5 w-3.5" />
                {prerecordedPlaying ? 'Stop Demo Backing Loop' : 'Test Built-in Backing Loop (LMR-06)'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
