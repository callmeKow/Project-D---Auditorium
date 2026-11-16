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
}: DualDeckMixerProps) {
  const initialAudio = audioEngine.getCaptureSettings();

  const [crossfader, setCrossfader] = useState(0); // 0 = Deck A, 100 = Deck B
  const [deckBVolume, setDeckBVolume] = useState(0);
  const [micGain, setMicGain] = useState(initialAudio.inputGain);
  const [fadeTimeSec, setFadeTimeSec] = useState(3);
  const [echoTailMix, setEchoTailMix] = useState(initialAudio.stageEchoEnabled ? initialAudio.stageEchoMix : 0);
  const [cuePlaying, setCuePlaying] = useState(false);
  const [cueReady, setCueReady] = useState(false);
  const [isAutoMixing, setIsAutoMixing] = useState(false);
  const [mixProgressPct, setMixProgressPct] = useState(0);

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

  const applyCrossfadeCurve = (xf: number) => {
    const clamped = Math.max(0, Math.min(100, xf));
    setCrossfader(clamped);
    const t = clamped / 100;
    const nextA = Math.round(100 * Math.cos(t * Math.PI * 0.5));
    const nextB = Math.round(100 * Math.sin(t * Math.PI * 0.5));
    onDeckAVolumeChange(nextA);
    setDeckBVolume(nextB);
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

    const durationMs = Math.max(1000, fadeTimeSec * 1000);
    const startMs = performance.now();

    autoMixTimerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startMs;
      const ratio = Math.min(1, elapsed / durationMs);
      setMixProgressPct(Math.round(ratio * 100));
      applyCrossfadeCurve(ratio * 100);

      if (ratio >= 1) {
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
          <span className="text-amber-300">Deck A ({deckAVolume}%)</span>
          <span className="inline-flex items-center gap-1 text-stone-300">
            <SlidersHorizontal className="h-3 w-3" /> Crossfader
          </span>
          <span className="text-sky-300">Deck B ({deckBVolume}%)</span>
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

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {isAutoMixing ? (
            <button
              type="button"
              onClick={handleCancelAutoMix}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-500"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Đang chuyển bài mượt ({mixProgressPct}%) — Hủy
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
