import { useEffect, useState } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sliders,
  Loader2,
  X,
  Sparkles,
  AlertTriangle,
  Music,
} from 'lucide-react';
import {
  audioEngine,
  KARAOKE_PRESETS,
  type AudioMeterSnapshot,
  type KaraokePresetId,
} from '../../audio/audioEngine';
import { webrtcAudio } from '../../audio/webrtcAudio';

interface PerformerMicPanelProps {
  open: boolean;
  onClose: () => void;
  isBroadcasting: boolean;
  micPending: boolean;
  onToggleBroadcast: () => Promise<void>;
  onNotice: (msg: string) => void;
}

export function MicActivityDot() {
  const [status, setStatus] = useState<'off' | 'idle' | 'active' | 'clip'>('off');

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!audioEngine.getStream()) {
        setStatus((s) => (s === 'off' ? s : 'off'));
        return;
      }
      const m = audioEngine.readMeter();
      const next = m.clipping ? 'clip' : m.peak > 0.04 ? 'active' : 'idle';
      setStatus((s) => (s === next ? s : next));
    }, 180);
    return () => clearInterval(id);
  }, []);

  if (status === 'off') return null;
  return (
    <span
      title={status === 'clip' ? 'Cảnh báo vỡ tiếng (Clipping)' : status === 'active' ? 'Mic đang vào tiếng' : 'Mic đang chờ'}
      className={`h-2 w-2 rounded-full ${
        status === 'clip'
          ? 'animate-ping bg-red-400'
          : status === 'active'
            ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]'
            : 'bg-stone-500'
      }`}
    />
  );
}

export function PerformerMicPanel({
  open,
  onClose,
  isBroadcasting,
  micPending,
  onToggleBroadcast,
  onNotice,
}: PerformerMicPanelProps) {
  const initial = audioEngine.getCaptureSettings();

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(initial.deviceId);
  const [monitorEnabled, setMonitorEnabled] = useState(initial.monitorEnabled);
  const [monitorVolume, setMonitorVolume] = useState(initial.monitorVolume);
  const [inputGain, setInputGain] = useState(initial.inputGain);
  const [noiseGate, setNoiseGate] = useState(initial.noiseGateThreshold);
  const [vocalMixVolume, setVocalMixVolume] = useState(initial.vocalMixVolume);
  const [micMuted, setMicMuted] = useState(initial.micMuted);
  const [musicVolume, setMusicVolume] = useState(initial.musicVolume);
  const [musicMuted, setMusicMuted] = useState(initial.musicMuted);
  const [emoteVolume, setEmoteVolume] = useState(initial.emoteVolume);
  const [emoteMuted, setEmoteMuted] = useState(initial.emoteMuted);
  const [activePreset, setActivePreset] = useState<KaraokePresetId>(initial.karaokePreset);
  const [stageEcho, setStageEcho] = useState(initial.stageEchoEnabled);
  const [stageEchoMix, setStageEchoMix] = useState(initial.stageEchoMix);
  const [stageEchoDelayMs, setStageEchoDelayMs] = useState(initial.stageEchoDelayMs);
  const [stageEchoFeedback, setStageEchoFeedback] = useState(initial.stageEchoFeedback);
  const [reverbEnabled, setReverbEnabled] = useState(initial.reverbEnabled);
  const [reverbMix, setReverbMix] = useState(initial.reverbMix);
  const [noiseSuppression, setNoiseSuppression] = useState(initial.noiseSuppression);
  const [echoCancellation, setEchoCancellation] = useState(initial.echoCancellation);
  const [capturing, setCapturing] = useState(Boolean(audioEngine.getStream()));
  const [localPending, setLocalPending] = useState(false);
  const [meter, setMeter] = useState<AudioMeterSnapshot>({ rms: 0, peak: 0, clipping: false, gateOpen: true });

  const refreshDevices = async () => {
    const list = await audioEngine.listAudioInputs();
    setDevices(list);
    if (list.length > 0 && (!selectedDeviceId || !list.some((d) => d.deviceId === selectedDeviceId))) {
      setSelectedDeviceId(list[0].deviceId);
    }
  };

  useEffect(() => {
    if (!open) return;
    void refreshDevices();
    setCapturing(Boolean(audioEngine.getStream()));
  }, [open, isBroadcasting]);

  useEffect(() => {
    return audioEngine.subscribeEmoteVolume((vol, muted) => {
      setEmoteVolume(vol);
      setEmoteMuted(muted);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      const hasStream = Boolean(audioEngine.getStream());
      if (hasStream !== capturing) setCapturing(hasStream);
      if (hasStream) {
        setMeter(audioEngine.readMeter());
      } else if (meter.rms !== 0 || meter.peak !== 0) {
        setMeter({ rms: 0, peak: 0, clipping: false, gateOpen: true });
      }
    }, 60);
    return () => clearInterval(id);
  }, [open, capturing, meter.rms, meter.peak]);

  if (!open) return null;

  const ensureCaptureForSoundcheck = async (overrides?: {
    deviceId?: string;
    monitor?: boolean;
    noise?: boolean;
    echoCancel?: boolean;
  }) => {
    if (localPending || micPending) return;
    setLocalPending(true);
    try {
      const nextStream = await audioEngine.startCapture(
        (overrides?.deviceId ?? selectedDeviceId) || undefined,
        overrides?.monitor ?? monitorEnabled,
        {
          echoCancellation: overrides?.echoCancel ?? echoCancellation,
          noiseSuppression: overrides?.noise ?? noiseSuppression,
          autoGainControl: false,
          inputGain,
          monitorVolume,
          stageEcho,
          stageEchoMix,
          stageEchoDelayMs,
          stageEchoFeedback,
          reverbEnabled,
          reverbMix,
        }
      );
      setCapturing(true);
      await refreshDevices();
      if (isBroadcasting) {
        await webrtcAudio.replaceBroadcastStream(nextStream);
      }
    } catch (err) {
      onNotice((err as Error).message || 'Không thể truy cập Microphone.');
    } finally {
      setLocalPending(false);
    }
  };

  const handleToggleSelfMonitor = async (checked: boolean) => {
    setMonitorEnabled(checked);
    await audioEngine.setMonitoring(checked, monitorVolume);
    if (checked && !audioEngine.getStream()) {
      await ensureCaptureForSoundcheck({ monitor: true });
    }
  };

  const handlePresetSelect = async (presetId: Exclude<KaraokePresetId, 'CUSTOM'>) => {
    await audioEngine.applyKaraokePreset(presetId);
    const updated = audioEngine.getCaptureSettings();
    setActivePreset(presetId);
    setStageEcho(updated.stageEchoEnabled);
    setStageEchoMix(updated.stageEchoMix);
    setStageEchoDelayMs(updated.stageEchoDelayMs);
    setStageEchoFeedback(updated.stageEchoFeedback);
    setReverbEnabled(updated.reverbEnabled);
    setReverbMix(updated.reverbMix);
    if (!audioEngine.getStream() && (updated.stageEchoEnabled || updated.reverbEnabled)) {
      setMonitorEnabled(true);
      await ensureCaptureForSoundcheck({ monitor: true });
    }
  };

  const handleEchoChange = async (
    nextEnabled: boolean,
    nextMix = stageEchoMix,
    nextDelayMs = stageEchoDelayMs,
    nextFeedback = stageEchoFeedback
  ) => {
    setStageEcho(nextEnabled);
    setStageEchoMix(nextMix);
    setStageEchoDelayMs(nextDelayMs);
    setStageEchoFeedback(nextFeedback);
    setActivePreset('CUSTOM');
    await audioEngine.setStageEcho(nextEnabled, nextMix, nextDelayMs, nextFeedback);
    if (nextEnabled && !audioEngine.getStream()) {
      setMonitorEnabled(true);
      await ensureCaptureForSoundcheck({ monitor: true });
    }
  };

  const handleReverbChange = async (nextEnabled: boolean, nextMix = reverbMix) => {
    setReverbEnabled(nextEnabled);
    setReverbMix(nextMix);
    setActivePreset('CUSTOM');
    await audioEngine.setStageReverb(nextEnabled, nextMix);
    if (nextEnabled && !audioEngine.getStream()) {
      setMonitorEnabled(true);
      await ensureCaptureForSoundcheck({ monitor: true });
    }
  };

  const displayLevel = Math.min(100, Math.round(Math.max(meter.rms * 350, meter.peak * 110)));
  const busy = micPending || localPending;

  return (
    <div className="pointer-events-auto absolute bottom-20 left-4 z-20 max-h-[74vh] w-80 overflow-y-auto rounded-2xl border border-stone-700/90 bg-stone-950/95 p-3.5 text-xs text-stone-200 shadow-2xl">
      <div className="flex items-center justify-between border-b border-stone-800 pb-2">
        <div className="flex items-center gap-2">
          <Sliders className="h-3.5 w-3.5 text-amber-400" />
          <span className="font-bold text-white">Karaoke & Mic Mixer</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
              isBroadcasting
                ? 'bg-red-500/20 text-red-300'
                : capturing
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-stone-800 text-stone-400'
            }`}
          >
            {isBroadcasting ? 'Live' : capturing ? 'Check' : 'Off'}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Thu gọn bảng Karaoke"
          className="rounded-lg p-1 text-stone-400 transition hover:bg-stone-800 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2.5 space-y-2.5">
        {/* Quick Karaoke Preset Dropdown */}
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="karaoke-preset-select" className="shrink-0 text-[11px] font-medium text-stone-400">
            Preset phòng hát
          </label>
          <select
            id="karaoke-preset-select"
            value={activePreset}
            disabled={busy}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'CUSTOM') return;
              void handlePresetSelect(val as Exclude<KaraokePresetId, 'CUSTOM'>);
            }}
            className="min-w-0 flex-1 rounded-lg border border-stone-800 bg-stone-900 px-2 py-1.5 text-[11px] font-semibold text-amber-200 focus:border-amber-500/60 focus:outline-none disabled:opacity-60"
          >
            {KARAOKE_PRESETS.map((p) => (
              <option key={p.id} value={p.id} className="bg-stone-900 text-stone-200">
                {p.label}
              </option>
            ))}
            {activePreset === 'CUSTOM' && (
              <option value="CUSTOM" className="bg-stone-900 text-amber-300">
                Tùy chỉnh (Custom)
              </option>
            )}
          </select>
        </div>

        {/* Main Broadcast Toggle + Quick Mute Mic */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onToggleBroadcast()}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white transition active:scale-95 disabled:cursor-not-allowed ${
              busy ? 'ring-2 ring-white/80' : ''
            } ${isBroadcasting ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isBroadcasting ? (
              <Mic className="h-3.5 w-3.5" />
            ) : (
              <MicOff className="h-3.5 w-3.5" />
            )}
            {busy
              ? isBroadcasting
                ? 'Đang tắt Mic...'
                : 'Đang mở Mic...'
              : isBroadcasting
                ? 'Mic Live (Đang phát)'
                : 'Mở Mic lên sân khấu'}
          </button>

          <button
            type="button"
            onClick={() => {
              const next = !micMuted;
              setMicMuted(next);
              audioEngine.setMicMuted(next);
            }}
            title={micMuted ? 'Bỏ tắt tiếng Mic nhanh' : 'Mute Mic tạm thời (giữ kết nối)'}
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-2 text-[11px] font-semibold transition active:scale-95 ${
              micMuted
                ? 'border-red-500/60 bg-red-500/20 text-red-200'
                : 'border-stone-700 bg-stone-900 text-stone-300 hover:bg-stone-800'
            }`}
          >
            {micMuted ? <MicOff className="h-3.5 w-3.5 text-red-400" /> : <Mic className="h-3.5 w-3.5 text-emerald-400" />}
            {micMuted ? 'Muted' : 'Mute'}
          </button>

          <button
            type="button"
            onClick={() => {
              const nextSolo = !musicMuted || micMuted;
              setMusicMuted(nextSolo);
              if (nextSolo && micMuted) {
                setMicMuted(false);
                audioEngine.setMicMuted(false);
              }
              audioEngine.setMusicVolume(musicVolume, nextSolo);
            }}
            title="Solo Giọng (ngắt nhạc nền tức thì để giao lưu MC)"
            className={`inline-flex items-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-semibold transition active:scale-95 ${
              musicMuted && !micMuted
                ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                : 'border-stone-700 bg-stone-900 text-stone-300 hover:bg-stone-800'
            }`}
          >
            Solo
          </button>
        </div>

        {/* Device & Live Input Meter */}
        <div className="space-y-1.5">
          <select
            value={selectedDeviceId}
            disabled={busy}
            onChange={(e) => {
              const nextId = e.target.value;
              setSelectedDeviceId(nextId);
              if (capturing) void ensureCaptureForSoundcheck({ deviceId: nextId });
            }}
            className="w-full rounded-lg border border-stone-800 bg-stone-900 px-2 py-1.5 text-[11px] text-white focus:border-amber-500/60 focus:outline-none disabled:opacity-60"
          >
            {devices.length === 0 && <option value="">Default Browser Microphone</option>}
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Audio Input ${i + 1}`}
              </option>
            ))}
          </select>

          <div className="space-y-1.5 rounded-xl border border-stone-800 bg-stone-900/80 p-2.5">
            <div className="flex justify-between text-[10px] text-stone-400">
              <span>Input Level &amp; Gate</span>
              <span
                className={
                  micMuted
                    ? 'font-semibold text-red-400'
                    : meter.clipping
                      ? 'font-bold text-red-400'
                      : noiseGate > 0 && !meter.gateOpen
                        ? 'font-mono text-amber-400'
                        : 'font-mono text-emerald-400'
                }
              >
                {micMuted
                  ? 'MIC MUTED'
                  : meter.clipping
                    ? 'CLIPPING!'
                    : noiseGate > 0 && !meter.gateOpen
                      ? `${displayLevel}% • Lọc ồn`
                      : `${displayLevel}%`}
              </span>
            </div>
            {/* Discord-style sensitivity bar with vertical Noise Gate threshold line */}
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-stone-800">
              <div
                className={`h-full transition-all duration-75 ${
                  meter.clipping
                    ? 'bg-red-500'
                    : noiseGate > 0 && !meter.gateOpen
                      ? 'bg-amber-500/80'
                      : 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-lime-400'
                }`}
                style={{ width: `${micMuted ? 0 : displayLevel}%` }}
              />
              {noiseGate > 0 && (
                <div
                  title={`Ngưỡng lọc tiếng ồn: ${Math.round(noiseGate * 100)}%`}
                  className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-white shadow-[0_0_4px_rgba(255,255,255,0.95)]"
                  style={{ left: `${Math.round(noiseGate * 100)}%` }}
                />
              )}
            </div>

            <div className="pt-1">
              <div className="flex items-center justify-between text-[11px]">
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

            <div className="border-t border-stone-800/80 pt-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-teal-200">Âm lượng Input đầu vào Micro</span>
                <span className="font-mono font-semibold text-teal-300">{Math.round(inputGain * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={3.0}
                step={0.05}
                value={inputGain}
                onChange={(e) => {
                  const gain = Number(e.target.value);
                  setInputGain(gain);
                  audioEngine.setInputGain(gain);
                }}
                className="mt-1 w-full accent-teal-400"
              />
            </div>
          </div>
        </div>

        {/* 2-Channel Mixer: Mic Mix Output vs Music Volume */}
        <div className="space-y-2 rounded-xl border border-stone-800 bg-stone-900/60 p-2.5">
          <div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-emerald-200">Âm lượng Mic (Mix ra sân khấu)</span>
              <span className="font-mono font-semibold text-emerald-300">{Math.round(vocalMixVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={2.0}
              step={0.05}
              value={vocalMixVolume}
              onChange={(e) => {
                const vol = Number(e.target.value);
                setVocalMixVolume(vol);
                audioEngine.setVocalMixVolume(vol);
              }}
              className="mt-1 w-full accent-emerald-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px]">
              <button
                type="button"
                onClick={() => {
                  const nextMute = !musicMuted;
                  setMusicMuted(nextMute);
                  audioEngine.setMusicVolume(musicVolume, nextMute);
                }}
                className="inline-flex items-center gap-1 font-medium text-purple-200 hover:text-white"
                title="Bấm để tắt/bật nhanh nhạc nền"
              >
                {musicMuted ? (
                  <VolumeX className="h-3.5 w-3.5 text-red-400" />
                ) : (
                  <Music className="h-3.5 w-3.5 text-purple-400" />
                )}
                Nhạc nền sân khấu
              </button>
              <span className="font-mono font-semibold text-purple-300">
                {musicMuted ? 'MUTED' : `${musicVolume}%`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={musicVolume}
              onChange={(e) => {
                const vol = Number(e.target.value);
                setMusicVolume(vol);
                if (vol > 0 && musicMuted) setMusicMuted(false);
                audioEngine.setMusicVolume(vol, vol === 0);
              }}
              className="mt-1 w-full accent-purple-500"
            />
          </div>

          <div className="border-t border-stone-800/80 pt-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <button
                type="button"
                onClick={() => {
                  const nextMute = !emoteMuted;
                  setEmoteMuted(nextMute);
                  audioEngine.setEmoteVolume(emoteVolume, nextMute);
                }}
                className="inline-flex items-center gap-1 font-medium text-amber-200 hover:text-white"
                title="Bấm để tắt/bật nhanh âm thanh Emote"
              >
                {emoteMuted || emoteVolume === 0 ? (
                  <VolumeX className="h-3.5 w-3.5 text-red-400" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                )}
                Âm lượng Emote (SFX)
              </button>
              <span className="font-mono font-semibold text-amber-300">
                {emoteMuted || emoteVolume === 0 ? 'MUTED' : `${emoteVolume}%`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={emoteVolume}
              onChange={(e) => {
                const vol = Number(e.target.value);
                setEmoteVolume(vol);
                if (vol > 0 && emoteMuted) setEmoteMuted(false);
                audioEngine.setEmoteVolume(vol, vol === 0);
              }}
              className="mt-1 w-full accent-amber-400"
            />
          </div>
        </div>

        {/* Self-Monitor + Karaoke Echo + Reverb */}
        <div className="space-y-2 rounded-xl border border-stone-800 bg-stone-900/60 p-2.5">
          <div>
            <label className="flex cursor-pointer items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-semibold text-amber-200">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={monitorEnabled}
                  onChange={(e) => void handleToggleSelfMonitor(e.target.checked)}
                  className="accent-amber-500"
                />
                <Volume2 className="h-3.5 w-3.5 text-amber-400" />
                Nghe lại giọng (Self-Monitor)
              </span>
              <span className="font-mono text-[10px] text-amber-300">{Math.round(monitorVolume * 100)}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={1.8}
              step={0.05}
              value={monitorVolume}
              onChange={(e) => {
                const vol = Number(e.target.value);
                setMonitorVolume(vol);
                void audioEngine.setMonitoring(monitorEnabled, vol);
              }}
              className="mt-1 w-full accent-amber-500"
            />
          </div>

          <div className="border-t border-stone-800/80 pt-2">
            <label className="flex cursor-pointer items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-semibold text-sky-200">
                <input
                  type="checkbox"
                  checked={stageEcho}
                  onChange={(e) => void handleEchoChange(e.target.checked, e.target.checked && stageEchoMix === 0 ? 0.38 : stageEchoMix)}
                  className="accent-sky-400"
                />
                <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                Echo (Vang lặp Karaoke)
              </span>
              <span className="font-mono text-[10px] text-sky-300">{stageEcho ? `${Math.round(stageEchoMix * 100)}%` : 'OFF'}</span>
            </label>
            <input
              type="range"
              min={0}
              max={0.9}
              step={0.05}
              value={stageEcho ? stageEchoMix : 0}
              onChange={(e) => {
                const mix = Number(e.target.value);
                void handleEchoChange(mix > 0, mix);
              }}
              className="mt-1 w-full accent-sky-400"
            />
            <div className="mt-1 grid grid-cols-2 gap-2 text-[10px] text-stone-400">
              <div>
                <div className="flex justify-between">
                  <span>Delay</span>
                  <span className="font-mono text-sky-300">{stageEchoDelayMs}ms</span>
                </div>
                <input
                  type="range"
                  min={80}
                  max={450}
                  step={10}
                  value={stageEchoDelayMs}
                  onChange={(e) => void handleEchoChange(true, stageEchoMix || 0.35, Number(e.target.value), stageEchoFeedback)}
                  className="w-full accent-sky-400"
                />
              </div>
              <div>
                <div className="flex justify-between">
                  <span>Độ lặp</span>
                  <span className="font-mono text-sky-300">{Math.round(stageEchoFeedback * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.65}
                  step={0.05}
                  value={stageEchoFeedback}
                  onChange={(e) => void handleEchoChange(true, stageEchoMix || 0.35, stageEchoDelayMs, Number(e.target.value))}
                  className="w-full accent-sky-400"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-stone-800/80 pt-2">
            <label className="flex cursor-pointer items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-semibold text-indigo-200">
                <input
                  type="checkbox"
                  checked={reverbEnabled}
                  onChange={(e) => void handleReverbChange(e.target.checked, e.target.checked && reverbMix === 0 ? 0.35 : reverbMix)}
                  className="accent-indigo-400"
                />
                Reverb (Độ vang phòng)
              </span>
              <span className="font-mono text-[10px] text-indigo-300">
                {reverbEnabled ? `${Math.round(reverbMix * 100)}%` : 'OFF'}
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={0.9}
              step={0.05}
              value={reverbEnabled ? reverbMix : 0}
              onChange={(e) => {
                const mix = Number(e.target.value);
                void handleReverbChange(mix > 0, mix);
              }}
              className="mt-1 w-full accent-indigo-400"
            />
          </div>
        </div>

        {/* Advanced DSP toggles */}
        <div className="space-y-1.5 rounded-xl border border-stone-800 bg-stone-900/50 px-2.5 py-2 text-[10px] text-stone-300">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <label className="flex cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                disabled={busy}
                checked={noiseSuppression}
                onChange={(e) => {
                  const next = e.target.checked;
                  setNoiseSuppression(next);
                  if (capturing) void ensureCaptureForSoundcheck({ noise: next });
                }}
                className="accent-amber-500"
              />
              Giảm ồn nền
            </label>
            <label className="flex cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                disabled={busy}
                checked={echoCancellation}
                onChange={(e) => {
                  const next = e.target.checked;
                  setEchoCancellation(next);
                  if (capturing) void ensureCaptureForSoundcheck({ echoCancel: next });
                }}
                className="accent-amber-500"
              />
              Chống hú loa ngoài
            </label>
          </div>
          {monitorEnabled && echoCancellation && (
            <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>Tắt Chống hú loa ngoài nếu đang đeo tai nghe để nghe Echo trọn vẹn.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
