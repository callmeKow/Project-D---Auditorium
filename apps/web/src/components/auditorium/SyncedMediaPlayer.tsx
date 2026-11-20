import { useEffect, useRef, useState } from 'react';
import type { RoomDTO } from '@vmw/contracts';
import { realtimeStore } from '../../realtime/realtimeStore';

interface SyncedMediaPlayerProps {
  mediaUrl: string;
  mediaType: 'AUDIO' | 'VIDEO';
  concert: RoomDTO['concert'];
  isPlaying: boolean;
  isPausedState: boolean;
  muted: boolean;
  volume: number; // 0..200
  venueStyle?: RoomDTO['venueStyle'];
  canAutoAdvance?: boolean;
  onAutoAdvanceNext?: (expectedIndex: number) => void;
  onKaraokeSongEnded?: (expectedIndex: number, shouldAutoAdvance: boolean) => void;
  onAutoplayBlocked?: (blocked: boolean) => void;
  className?: string;
  showLoadingOverlay?: boolean;
  accentColor?: 'amber' | 'fuchsia';
  mediaElementRef?: React.MutableRefObject<HTMLMediaElement | null>;
}

/**
 * Synced HTML5 Audio/Video player for uploaded tracks (mp3, wav, mp4, webm, etc.).
 * Keeps media muted & hidden behind a loading state until seeked to the room's live clock,
 * and boosts gain up to 2.0x via Web Audio API when volume > 100%.
 */
export function SyncedMediaPlayer({
  mediaUrl,
  mediaType,
  concert,
  isPlaying,
  isPausedState,
  muted,
  volume,
  venueStyle = 'CHAMBER',
  canAutoAdvance = false,
  onAutoAdvanceNext,
  onKaraokeSongEnded,
  onAutoplayBlocked,
  className = '',
  showLoadingOverlay = false,
  accentColor = 'amber',
  mediaElementRef,
}: SyncedMediaPlayerProps) {
  const elRef = useRef<HTMLMediaElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceAttachedRef = useRef(false);
  const [synced, setSynced] = useState(false);
  const syncedRef = useRef(false);
  const lastAdvanceRef = useRef<{ index: number; at: number }>({ index: -1, at: 0 });

  const setSyncedBoth = (val: boolean) => {
    if (syncedRef.current !== val) {
      syncedRef.current = val;
      setSynced(val);
    }
  };

  const ensureGainNode = (el: HTMLMediaElement) => {
    if (muted || sourceAttachedRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = ctxRef.current ?? new AudioCtx();
      ctxRef.current = ctx;
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
      const source = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      source.connect(gain);
      gain.connect(ctx.destination);
      gainRef.current = gain;
      sourceAttachedRef.current = true;
    } catch {
      // Fallback to native element volume (0..1) if Web Audio attachment fails
    }
  };

  const applyVolume = (el: HTMLMediaElement, allowUnmute: boolean) => {
    const effectiveMuted = muted || !allowUnmute || volume <= 0;
    el.muted = effectiveMuted;
    if (gainRef.current && ctxRef.current) {
      el.volume = 1;
      const gainVal = effectiveMuted ? 0 : Math.max(0, Math.min(2, volume / 100));
      gainRef.current.gain.setTargetAtTime(gainVal, ctxRef.current.currentTime, 0.02);
    } else {
      el.volume = effectiveMuted ? 0 : Math.max(0, Math.min(1, volume / 100));
    }
  };

  const getLoopAwareTarget = (el: HTMLMediaElement, c: RoomDTO['concert']) => {
    const raw = realtimeStore.getSyncedPlaybackSec(c);
    const dur = Number.isFinite(el.duration) && el.duration > 1 ? el.duration : 0;
    return dur > 1 ? raw % dur : raw;
  };

  useEffect(() => {
    setSyncedBoth(false);
  }, [mediaUrl, concert.currentSetlistIndex]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    applyVolume(el, syncedRef.current && isPlaying);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted, volume, synced, isPlaying]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const syncAndPlay = () => {
      const latestConcert = realtimeStore.room?.concert ?? concert;
      const targetSec = getLoopAwareTarget(el, latestConcert);
      if (!isPlaying) {
        el.pause();
        if (Math.abs(el.currentTime - targetSec) > 1.5 && el.readyState >= 1) {
          try {
            el.currentTime = targetSec;
          } catch {
            // ignore before metadata
          }
        }
        applyVolume(el, false);
        return;
      }

      if (el.readyState < 1) {
        setSyncedBoth(false);
        applyVolume(el, false);
        return;
      }

      const diff = Math.abs(el.currentTime - targetSec);
      if (targetSec > 1.5 && diff > 2.2) {
        setSyncedBoth(false);
        applyVolume(el, false);
        try {
          el.currentTime = targetSec;
        } catch {
          // ignore
        }
      } else {
        setSyncedBoth(true);
        ensureGainNode(el);
        applyVolume(el, true);
      }

      el.play()
        .then(() => {
          if (!muted) onAutoplayBlocked?.(false);
        })
        .catch(() => {
          if (!muted) {
            el.muted = true;
            el.play().catch(() => {});
            onAutoplayBlocked?.(true);
          }
        });
    };

    const onLoadedMetadata = () => syncAndPlay();
    const onSeeked = () => {
      const latestConcert = realtimeStore.room?.concert ?? concert;
      const targetSec = getLoopAwareTarget(el, latestConcert);
      if (Math.abs(el.currentTime - targetSec) <= 2.5 || targetSec <= 1.5) {
        setSyncedBoth(true);
        ensureGainNode(el);
        applyVolume(el, isPlaying);
      }
    };
    const onEnded = () => {
      if (!isPlaying) return;
      const latestConcert = realtimeStore.room?.concert ?? concert;
      const playbackMode = latestConcert.playbackMode ?? 'REPEAT_ONE';
      const shouldAdvance = playbackMode === 'QUEUE_NEXT' && latestConcert.setlist.length > 1;
      const nowMs = performance.now();
      const idx = latestConcert.currentSetlistIndex;

      if (venueStyle === 'KARAOKE' && onKaraokeSongEnded && !muted) {
        if (canAutoAdvance && (lastAdvanceRef.current.index !== idx || nowMs - lastAdvanceRef.current.at > 6500)) {
          lastAdvanceRef.current = { index: idx, at: nowMs };
          onKaraokeSongEnded(idx, shouldAdvance);
        }
      } else if (shouldAdvance && !muted) {
        if (canAutoAdvance && (lastAdvanceRef.current.index !== idx || nowMs - lastAdvanceRef.current.at > 3000)) {
          lastAdvanceRef.current = { index: idx, at: nowMs };
          onAutoAdvanceNext?.(idx);
        }
      }

      if (!shouldAdvance) {
        el.currentTime = 0;
        el.play().catch(() => {});
      }
    };

    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('seeked', onSeeked);
    el.addEventListener('ended', onEnded);
    syncAndPlay();

    const driftTimer = window.setInterval(() => {
      if (!isPlaying || el.readyState < 1) return;
      const latestConcert = realtimeStore.room?.concert ?? concert;
      const targetSec = getLoopAwareTarget(el, latestConcert);
      const dur = Number.isFinite(el.duration) && el.duration > 1 ? el.duration : 0;
      const rawDiff = Math.abs(el.currentTime - targetSec);
      const circularDiff = dur > 1 ? Math.min(rawDiff, dur - rawDiff) : rawDiff;
      if (circularDiff > 2.6) {
        try {
          el.currentTime = targetSec;
        } catch {
          // ignore
        }
      } else if (!syncedRef.current) {
        setSyncedBoth(true);
        ensureGainNode(el);
        applyVolume(el, true);
      }
    }, 1800);

    return () => {
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('seeked', onSeeked);
      el.removeEventListener('ended', onEnded);
      window.clearInterval(driftTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaUrl, isPlaying, concert.trackStartedAtServerMs, concert.currentSetlistIndex, muted]);

  const setRef = (node: HTMLMediaElement | null) => {
    elRef.current = node;
    if (mediaElementRef) mediaElementRef.current = node;
  };

  if (mediaType === 'AUDIO') {
    return <audio ref={setRef} src={mediaUrl} crossOrigin="anonymous" preload="auto" className="hidden" />;
  }

  const spinnerBorder = accentColor === 'fuchsia' ? 'border-fuchsia-400/30 border-t-fuchsia-400' : 'border-amber-400/30 border-t-amber-400';
  const textColor = accentColor === 'fuchsia' ? 'text-fuchsia-200/90' : 'text-amber-200/90';

  return (
    <>
      <video
        ref={setRef}
        src={mediaUrl}
        crossOrigin="anonymous"
        preload="auto"
        playsInline
        className={`${className} ${synced || isPausedState ? 'opacity-100' : 'opacity-0'}`}
      />
      {showLoadingOverlay && isPlaying && !synced && !isPausedState && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-stone-950/95">
          <div className={`h-7 w-7 animate-spin rounded-full border-2 ${spinnerBorder}`} />
          <div className={`text-xs font-semibold tracking-wider ${textColor}`}>Đang đồng bộ bài hát...</div>
        </div>
      )}
    </>
  );
}
