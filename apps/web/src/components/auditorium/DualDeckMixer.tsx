import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Disc3, Loader2, Pause, Play, SlidersHorizontal, X, Youtube } from 'lucide-react';
import type { SetlistItemDTO } from '@vmw/contracts';
import { audioEngine } from '../../audio/audioEngine';
import { realtimeStore } from '../../realtime/realtimeStore';

interface DualDeckMixerProps {
  open: boolean;
  onClose: () => void;
  setlist: SetlistItemDTO[];
  currentIndex: number;
  queuedIndex: number;
  onSelectQueuedIndex: (index: number) => void;
  deckAVolume: number;
  onDeckAVolumeChange: (vol: number) => void;
  onBeforeSwitchToDeckB?: () => void;
}

function sendCueYtCmd(iframe: HTMLIFrameElement | null, func: string, args: unknown = '') {
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
}

function VerticalFader({
  label,
  valueText,
  min,
  max,
  step = 1,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  valueText: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  disabled?: boolean;
  onChange: (val: number) => void;
}) {
  const pct = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-mono text-[10px] font-semibold text-amber-300">{valueText}</span>
      <div className="relative flex h-24 w-7 items-center justify-center rounded-lg border border-stone-800 bg-stone-900/90">
        {/* Yellow-gold visual fader fill matching DJ deck sketch */}
        <div
          className="pointer-events-none absolute bottom-1.5 w-2 rounded-full bg-amber-400/35"
          style={{ height: `calc(${pct}% - 6px)` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-3 w-20 -rotate-90 cursor-pointer accent-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      <span className="text-center text-[9px] font-medium leading-tight text-stone-400">{label}</span>
    </div>
  );
}

export function DualDeckMixer({
  open,
  onClose,
  setlist,
  currentIndex,
  queuedIndex,
  onSelectQueuedIndex,
  deckAVolume,
  onDeckAVolumeChange,
  onBeforeSwitchToDeckB,
  onTransitionVisualChange,
}: DualDeckMixerProps & {
  onTransitionVisualChange?: (state: {
    active: boolean;
    phase: 'PREWARM' | 'CROSSFADE';
    progressPct: number;
    elapsedSec: number;
    totalSec: number;
    targetVideoId?: string;
    targetTitle?: string;
    oldScreenOpacity: number;
    newScreenOpacity: number;
  } | null) => void;
}) {
  const initialAudio = audioEngine.getCaptureSettings();

  const [crossfader, setCrossfader] = useState(0); // 0 = Deck A, 100 = Deck B
  const [deckBVolume, setDeckBVolume] = useState(0);
  const [micGain, setMicGain] = useState(initialAudio.inputGain);
  const [fadeTimeSec, setFadeTimeSec] = useState(4);
  const [echoTailMix, setEchoTailMix] = useState(initialAudio.stageEchoEnabled ? initialAudio.stageEchoMix : 0);
  const [cuePlaying, setCuePlaying] = useState(false);
  const [cueReady, setCueReady] = useState(false);
  const [isAutoMixing, setIsAutoMixing] = useState(false);
  const [mixProgressPct, setMixProgressPct] = useState(0);
  const [transitionVisual, setTransitionVisual] = useState<{
    active: boolean;
    phase: 'PREWARM' | 'CROSSFADE';
    progressPct: number;
    elapsedSec: number;
    totalSec: number;
    targetVideoId?: string;
    targetTitle?: string;
    oldScreenOpacity: number;
    newScreenOpacity: number;
  } | null>(null);

  const cueIframeRef = useRef<HTMLIFrameElement | null>(null);
  const autoMixTimerRef = useRef<number | null>(null);
  const cuePlayingRef = useRef(false);
  const isAutoMixingRef = useRef(false);
  cuePlayingRef.current = cuePlaying;
  isAutoMixingRef.current = isAutoMixing;

  const deckATrack = setlist[currentIndex];
  const safeQueuedIdx = setlist.length > 0 ? Math.max(0, Math.min(setlist.length - 1, queuedIndex)) : 0;
  const deckBTrack = setlist[safeQueuedIdx];
  const deckBVideoId = deckBTrack?.youtubeVideoId;

  const stopAutoMixTimer = () => {
    if (autoMixTimerRef.current !== null) {
      clearInterval(autoMixTimerRef.current);
      autoMixTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopAutoMixTimer();
    };
  }, []);

  // Reset readiness flag when Deck B changes video
  useEffect(() => {
    setCueReady(false);
    setCuePlaying(false);
  }, [deckBVideoId]);

  // Listen to Deck B iframe readiness so it pre-buffers quietly at 0:00 before user clicks Mix
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const iframe = cueIframeRef.current;
      if (!iframe?.contentWindow || ev.source !== iframe.contentWindow) return;
      if (typeof ev.data !== 'string') return;
      try {
        const parsed = JSON.parse(ev.data);
        if (parsed?.event === 'infoDelivery' && parsed.info && typeof parsed.info.playerState === 'number') {
          const st = parsed.info.playerState as number;
          if (st === 1) {
            setCueReady(true);
            // If only background-preloading (not actively auditioning/mixing), park cleanly paused at 0s
            if (!cuePlayingRef.current && !isAutoMixingRef.current) {
              sendCueYtCmd(iframe, 'pauseVideo');
              sendCueYtCmd(iframe, 'seekTo', [0, true]);
              sendCueYtCmd(iframe, 'mute');
            }
          } else if (st === 2 || st === 5) {
            setCueReady(true);
          }
        }
      } catch {
        // Ignore non-JSON postMessages
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Pause Cue preview if mixer closes (while keeping Deck B pre-buffered in DOM!)
  useEffect(() => {
    if (!open) {
      stopAutoMixTimer();
      setIsAutoMixing(false);
      setCuePlaying(false);
      if (cueIframeRef.current) {
        sendCueYtCmd(cueIframeRef.current, 'mute');
        sendCueYtCmd(cueIframeRef.current, 'pauseVideo');
      }
    }
  }, [open]);

  // Play / pause & apply Deck B preview volume smoothly on the preloaded iframe
  useEffect(() => {
    const iframe = cueIframeRef.current;
    if (!iframe) return;
    if (!cuePlaying) {
      sendCueYtCmd(iframe, 'mute');
      sendCueYtCmd(iframe, 'pauseVideo');
      return;
    }
    if (deckBVolume <= 0) {
      sendCueYtCmd(iframe, 'mute');
    } else {
      sendCueYtCmd(iframe, 'unMute');
      sendCueYtCmd(iframe, 'setVolume', [deckBVolume]);
    }
    sendCueYtCmd(iframe, 'playVideo');
  }, [deckBVolume, cuePlaying]);

  useEffect(() => {
    if (!isAutoMixing && crossfader === 0 && transitionVisual !== null) {
      setTransitionVisual(null);
      onTransitionVisualChange?.(null);
    }
  }, [isAutoMixing, crossfader, transitionVisual, onTransitionVisualChange]);

  const applyCrossfadeCurve = (xf: number) => {
    const clamped = Math.max(0, Math.min(100, xf));
    setCrossfader(clamped);
    const t = clamped / 100;
    const nextA = Math.round(100 * Math.cos(t * Math.PI * 0.5));
    const nextB = Math.round(100 * Math.sin(t * Math.PI * 0.5));
    onDeckAVolumeChange(nextA);
    setDeckBVolume(nextB);

    if (!isAutoMixingRef.current) {
      if (clamped <= 0) {
        setTransitionVisual(null);
        onTransitionVisualChange?.(null);
      } else {
        const nextVisual = {
          active: true,
          phase: (clamped < 60 ? 'PREWARM' : 'CROSSFADE') as 'PREWARM' | 'CROSSFADE',
          progressPct: Math.round(clamped),
          elapsedSec: Number(((clamped / 100) * fadeTimeSec).toFixed(1)),
          totalSec: fadeTimeSec,
          targetVideoId: deckBVideoId,
          targetTitle: deckBTrack?.title,
          oldScreenOpacity: Number(Math.cos(t * Math.PI * 0.5).toFixed(3)),
          newScreenOpacity: Number(Math.sin(t * Math.PI * 0.5).toFixed(3)),
        };
        setTransitionVisual(nextVisual);
        onTransitionVisualChange?.(nextVisual);
      }
    }
  };

  const handleToggleCuePreview = () => {
    if (!deckBVideoId) return;
    if (cuePlaying) {
      sendCueYtCmd(cueIframeRef.current, 'pauseVideo');
      setCuePlaying(false);
    } else {
      if (deckBVolume === 0) setDeckBVolume(65);
      setCuePlaying(true);
    }
  };

  const finishSwitchToDeckB = () => {
    stopAutoMixTimer();
    onBeforeSwitchToDeckB?.();
    if (cueIframeRef.current) {
      sendCueYtCmd(cueIframeRef.current, 'mute');
      sendCueYtCmd(cueIframeRef.current, 'pauseVideo');
    }
    setCuePlaying(false);
    setIsAutoMixing(false);
    setMixProgressPct(0);

    realtimeStore.send({ type: 'SELECT_SETLIST_ITEM', index: safeQueuedIdx });

    // Reset faders back cleanly to Deck A ready for the next queued song
    onDeckAVolumeChange(100);
    setCrossfader(0);
    setDeckBVolume(0);
    if (setlist.length > 1) {
      onSelectQueuedIndex((safeQueuedIdx + 1) % setlist.length);
    }
  };

  const handleStartAutoMix = () => {
    if (isAutoMixing || !deckBTrack) return;
    if (safeQueuedIdx === currentIndex && setlist.length > 1) {
      onSelectQueuedIndex((currentIndex + 1) % setlist.length);
    }

    stopAutoMixTimer();
    setIsAutoMixing(true);
    setMixProgressPct(0);
    if (deckBVideoId) {
      sendCueYtCmd(cueIframeRef.current, 'seekTo', [0, true]);
      setCuePlaying(true);
    }

    const durationMs = Math.max(2000, fadeTimeSec * 1000);
    // 5s default transition: first 3s (60%) pre-warms Deck B at low volume, then 3s..5s (last 40%) ramps Deck B up & Deck A down
    const preWarmSplitRatio = fadeTimeSec === 5 ? 3 / 5 : 0.6;
    const startMs = performance.now();

    // Immediately at t=0s: start Deck B quietly (~12%) while Deck A remains at 100%
    onDeckAVolumeChange(100);
    setDeckBVolume(12);
    setCrossfader(5);
    const initialVisual = {
      active: true,
      phase: 'PREWARM' as const,
      progressPct: 0,
      elapsedSec: 0,
      totalSec: fadeTimeSec,
      targetVideoId: deckBVideoId,
      targetTitle: deckBTrack?.title,
      oldScreenOpacity: 1,
      newScreenOpacity: 0.05,
    };
    setTransitionVisual(initialVisual);
    onTransitionVisualChange?.(initialVisual);

    autoMixTimerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startMs;
      const ratio = Math.min(1, elapsed / durationMs);
      const pct = Math.round(ratio * 100);
      setMixProgressPct(pct);

      let nextA = 100;
      let nextB = 12;
      let nextXf = pct;
      let oldOpacity = 1;
      let newOpacity = 0;
      let phase: 'PREWARM' | 'CROSSFADE' = 'PREWARM';

      if (ratio < preWarmSplitRatio) {
        // Phase 1 (0s -> 3s): Deck B is loaded & playing softly in background (12% -> 18%), Deck A holds strong (100% -> 92%)
        // Screen of old track begins darkening gently (1.00 -> 0.65), new track screen emerges dimly (0.05 -> 0.30)
        const p1 = Math.max(0, Math.min(1, ratio / preWarmSplitRatio));
        phase = 'PREWARM';
        nextA = Math.round(100 - 8 * p1);
        nextB = Math.round(12 + 6 * p1);
        nextXf = Math.round(5 + 25 * p1);
        oldOpacity = Number((1 - 0.35 * p1).toFixed(3));
        newOpacity = Number((0.05 + 0.25 * p1).toFixed(3));
      } else {
        // Phase 2 (3s -> 5s): Deck B volume swells smoothly (18% -> 100%) and Deck A fades out (92% -> 0%)
        // Old track screen darkens completely to 0, while new track screen brightens clearly to 1.0
        const p2 = Math.max(0, Math.min(1, (ratio - preWarmSplitRatio) / (1 - preWarmSplitRatio)));
        const smooth = 0.5 - 0.5 * Math.cos(p2 * Math.PI);
        phase = 'CROSSFADE';
        nextA = Math.round(92 * (1 - smooth));
        nextB = Math.round(18 + 82 * smooth);
        nextXf = Math.round(30 + 70 * smooth);
        oldOpacity = Number((0.65 * (1 - smooth)).toFixed(3));
        newOpacity = Number((0.30 + 0.70 * smooth).toFixed(3));
      }

      setCrossfader(nextXf);
      onDeckAVolumeChange(nextA);
      setDeckBVolume(nextB);

      const stepVisual = {
        active: true,
        phase,
        progressPct: pct,
        elapsedSec: Number((Math.min(durationMs, elapsed) / 1000).toFixed(1)),
        totalSec: fadeTimeSec,
        targetVideoId: deckBVideoId,
        targetTitle: deckBTrack?.title,
        oldScreenOpacity: oldOpacity,
        newScreenOpacity: newOpacity,
      };
      setTransitionVisual(stepVisual);
      onTransitionVisualChange?.(stepVisual);

      if (ratio >= 1) {
        setTransitionVisual(null);
        onTransitionVisualChange?.(null);
        finishSwitchToDeckB();
      }
    }, 60);
  };

  const handleCancelAutoMix = () => {
    stopAutoMixTimer();
    setIsAutoMixing(false);
    setMixProgressPct(0);
    if (cueIframeRef.current) {
      sendCueYtCmd(cueIframeRef.current, 'mute');
      sendCueYtCmd(cueIframeRef.current, 'pauseVideo');
      sendCueYtCmd(cueIframeRef.current, 'seekTo', [0, true]);
    }
    setCuePlaying(false);
    applyCrossfadeCurve(0);
  };

  return (
    <>
      {/* Always pre-buffer Deck B YouTube iframe in background even while mixer modal is closed */}
      {deckBVideoId && (
        <iframe
          key={deckBVideoId}
          ref={cueIframeRef}
          title="Deck B Preloaded Cue Audio"
          src={`https://www.youtube.com/embed/${deckBVideoId}?autoplay=1&controls=0&enablejsapi=1&playsinline=1&mute=1`}
          allow="autoplay; encrypted-media"
          onLoad={() => {
            const iframe = cueIframeRef.current;
            if (!iframe?.contentWindow) return;
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
            window.setTimeout(() => {
              iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*');
            }, 350);
            sendCueYtCmd(iframe, 'mute');
            sendCueYtCmd(iframe, 'playVideo');
          }}
          className="pointer-events-none fixed -left-[9999px] h-1 w-1 opacity-0"
        />
      )}

      {open && (
        <div className="pointer-events-auto absolute bottom-20 left-1/2 z-20 w-[560px] max-w-[92vw] -translate-x-1/2 rounded-2xl border border-amber-500/35 bg-stone-950/95 p-3.5 text-xs text-stone-200 shadow-2xl">
          <div className="flex items-center justify-between border-b border-stone-800 pb-2">
            <div className="flex items-center gap-2">
              <Disc3 className={`h-4 w-4 text-amber-400 ${isAutoMixing ? 'animate-spin' : ''}`} />
              <span className="font-bold text-white">Dual-Deck Transition Mixer</span>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                Chuyển bài mượt
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              title="Đóng Deck Mixer"
              className="rounded-lg p-1 text-stone-400 transition hover:bg-stone-800 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

      {/* Left Deck (Now Playing) | Right Deck (Queued / Upcoming) */}
      <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* LEFT DECK: NOW PLAYING */}
        <div className="flex flex-col justify-between rounded-xl border border-amber-500/35 bg-stone-900/75 p-2.5">
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-amber-300">
              <span>Deck A • Đang phát</span>
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] text-emerald-300">ON AIR</span>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-stone-950/90 px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 truncate font-semibold text-amber-100">
                {deckATrack?.youtubeVideoId && <Youtube className="h-3.5 w-3.5 shrink-0 text-red-400" />}
                <span className="truncate">
                  {currentIndex + 1}. {deckATrack?.title ?? 'No Track'}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] text-stone-400">{deckATrack?.mode ?? 'LIVE'} • Now Playing</div>
            </div>
          </div>

          <div className="mt-3 flex justify-center gap-6">
            <VerticalFader
              label="Deck A Vol"
              valueText={`${deckAVolume}%`}
              min={0}
              max={100}
              value={deckAVolume}
              disabled={isAutoMixing}
              onChange={(v) => onDeckAVolumeChange(v)}
            />
            <VerticalFader
              label="Mic Gain"
              valueText={`${Math.round(micGain * 100)}%`}
              min={0.5}
              max={3.0}
              step={0.05}
              value={micGain}
              onChange={(g) => {
                setMicGain(g);
                audioEngine.setInputGain(g);
              }}
            />
          </div>
        </div>

        {/* RIGHT DECK: UPCOMING / CUE TRACK */}
        <div className="flex flex-col justify-between rounded-xl border border-sky-500/35 bg-stone-900/75 p-2.5">
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-sky-300">
              <div className="flex items-center gap-1.5">
                <span>Deck B • Sắp chuyển</span>
                {deckBVideoId && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold normal-case ${
                      cueReady ? 'bg-emerald-500/20 text-emerald-300' : 'animate-pulse bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {cueReady ? '● Đã tải sẵn' : '◌ Đang tải...'}
                  </span>
                )}
              </div>
              {deckBVideoId && (
                <button
                  type="button"
                  disabled={isAutoMixing}
                  onClick={handleToggleCuePreview}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold transition ${
                    cuePlaying ? 'bg-sky-500 text-stone-950' : 'bg-stone-800 text-sky-200 hover:bg-stone-700'
                  }`}
                >
                  {cuePlaying ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
                  {cuePlaying ? 'Cue On' : 'Cue Test'}
                </button>
              )}
            </div>

            <select
              value={safeQueuedIdx}
              disabled={isAutoMixing}
              onChange={(e) => {
                setCuePlaying(false);
                onSelectQueuedIndex(Number(e.target.value));
              }}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-2 py-1.5 text-[11px] font-medium text-white focus:border-sky-400 focus:outline-none disabled:opacity-60"
            >
              {setlist.map((item, idx) => (
                <option key={item.id} value={idx}>
                  {idx + 1}. {item.title} ({item.mode}) {idx === currentIndex ? '• Current' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex justify-center gap-4">
            <VerticalFader
              label="Deck B Vol"
              valueText={`${deckBVolume}%`}
              min={0}
              max={100}
              value={deckBVolume}
              disabled={isAutoMixing}
              onChange={(v) => {
                setDeckBVolume(v);
                if (v > 0 && deckBTrack?.youtubeVideoId && !cuePlaying) {
                  setCuePlaying(true);
                }
              }}
            />
            <VerticalFader
              label="Fade Sec"
              valueText={`${fadeTimeSec}s`}
              min={1}
              max={8}
              step={1}
              value={fadeTimeSec}
              disabled={isAutoMixing}
              onChange={(s) => setFadeTimeSec(s)}
            />
            <VerticalFader
              label="Echo FX"
              valueText={`${Math.round(echoTailMix * 100)}%`}
              min={0}
              max={0.85}
              step={0.05}
              value={echoTailMix}
              onChange={(m) => {
                setEchoTailMix(m);
                void audioEngine.setStageEcho(m > 0, m);
              }}
            />
          </div>
        </div>
      </div>

      {/* Crossfader Bridge + Auto-Mix Transition Trigger */}
      <div className="mt-3 rounded-xl border border-stone-800 bg-stone-900/85 p-2.5">
        <div className="flex items-center justify-between text-[10px] font-semibold text-stone-400">
          <span className="text-amber-300">
            Deck A ({deckAVolume}%)
            {transitionVisual?.active ? ` • Màn hình ${Math.round(transitionVisual.oldScreenOpacity * 100)}%` : ''}
          </span>
          <span className="inline-flex items-center gap-1 text-stone-300">
            <SlidersHorizontal className="h-3 w-3" /> Crossfader
          </span>
          <span className="text-sky-300">
            Deck B ({deckBVolume}%)
            {transitionVisual?.active ? ` • Màn hình ${Math.round(transitionVisual.newScreenOpacity * 100)}%` : ''}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={crossfader}
          disabled={isAutoMixing}
          onChange={(e) => applyCrossfadeCurve(Number(e.target.value))}
          className="mt-1 w-full accent-amber-400"
        />

        {transitionVisual?.active && (
          <div className="mt-1.5 rounded-lg border border-stone-700/80 bg-stone-950/85 px-2.5 py-1.5 text-[10px]">
            <div className="flex items-center justify-between font-semibold">
              <span className={transitionVisual.phase === 'PREWARM' ? 'text-amber-300' : 'text-sky-300'}>
                {transitionVisual.phase === 'PREWARM'
                  ? `Giai đoạn 1 (${transitionVisual.elapsedSec}s/${transitionVisual.totalSec}s): Nạp & mở nhỏ bài mới`
                  : `Giai đoạn 2 (${transitionVisual.elapsedSec}s/${transitionVisual.totalSec}s): Tăng âm bài mới & giảm bài cũ`}
              </span>
              <span className="text-stone-400">{transitionVisual.progressPct}%</span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2 text-[9px] text-stone-400">
              <div className="flex items-center justify-between rounded bg-stone-900 px-1.5 py-0.5">
                <span>Màn hình bài cũ (Tối dần)</span>
                <span className="font-bold text-amber-300">{Math.round(transitionVisual.oldScreenOpacity * 100)}%</span>
              </div>
              <div className="flex items-center justify-between rounded bg-stone-900 px-1.5 py-0.5">
                <span>Màn hình bài mới (Rõ dần)</span>
                <span className="font-bold text-sky-300">{Math.round(transitionVisual.newScreenOpacity * 100)}%</span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {isAutoMixing ? (
            <button
              type="button"
              onClick={handleCancelAutoMix}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-500"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Đang chuyển bài mượt ({transitionVisual?.elapsedSec ?? 0}s/{fadeTimeSec}s • {mixProgressPct}%) — Hủy
            </button>
          ) : (
            <button
              type="button"
              disabled={!deckBTrack || setlist.length === 0}
              onClick={handleStartAutoMix}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-sky-500 px-3 py-1.5 text-xs font-bold text-stone-950 shadow transition hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Auto Mix & Chuyển sang Deck B ({fadeTimeSec}s)
            </button>
          )}

          <button
            type="button"
            disabled={isAutoMixing || !deckBTrack}
            onClick={finishSwitchToDeckB}
            className="rounded-xl border border-stone-700 bg-stone-950 px-3 py-1.5 text-[11px] font-semibold text-stone-200 transition hover:bg-stone-800 active:scale-95 disabled:opacity-50"
          >
            Chuyển ngay
          </button>
        </div>
      </div>
    </div>
      )}
    </>
  );
}
