import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  Camera,
  Flag,
  Sparkles,
  LogOut,
  Play,
  Pause,
  SkipForward,
  Music2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Users,
  Piano,
  Armchair,
  Radio,
  Sliders,
  Plus,
  Trash2,
  Lock,
  Unlock,
  UserPlus,
  WifiOff,
  Youtube,
  Loader2,
  Disc3,
} from 'lucide-react';
import {
  extractStandardYouTubeVideoId,
  type InstrumentType,
  type LightingPreset,
  type QualityPreset,
  type ReportDTO,
  type RoomDTO,
} from '@vmw/contracts';
import { AuditoriumScene, type CameraMode } from '../components/auditorium/AuditoriumScene';
import { DualDeckMixer } from '../components/auditorium/DualDeckMixer';
import { MicActivityDot, PerformerMicPanel } from '../components/auditorium/PerformerMicPanel';
import { realtimeStore } from '../realtime/realtimeStore';
import { useAuth } from '../state/authStore';
import { apiClient } from '../api/client';
import { audioEngine } from '../audio/audioEngine';
import { webrtcAudio, type WebRtcDiagnostics } from '../audio/webrtcAudio';

const STAGE_MIDI_KEYS = [
  { label: 'C4', midi: 60 },
  { label: 'D4', midi: 62 },
  { label: 'E4', midi: 64 },
  { label: 'G4', midi: 67 },
  { label: 'A4', midi: 69 },
  { label: 'C5', midi: 72 },
];

const LIGHTING_PRESETS: { id: LightingPreset; label: string }[] = [
  { id: 'WARM_CHAMBER', label: 'Warm Chamber' },
  { id: 'SPOTLIGHT_SOLO', label: 'Spotlight Solo' },
  { id: 'DYNAMIC_CONCERT', label: 'Dynamic Concert' },
  { id: 'ENCORE_GOLD', label: 'Encore Gold' },
];

export function AuditoriumPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const effectiveUserId = user?.id ?? 'guest-listener';
  const effectiveName = user?.displayName ?? 'Guest Listener';
  const effectiveRole = user?.roles.includes('ADMIN')
    ? 'ADMIN'
    : user?.roles.includes('ARTIST')
      ? 'ARTIST'
      : user?.roles.includes('HOST')
        ? 'HOST'
        : 'AUDIENCE';
  const effectiveAvatar = user?.avatarPresetId ?? 'chibi-classic';
  const navState = location.state as { seatId?: string; passcode?: string; performerInstrument?: InstrumentType } | null;

  const [room, setRoom] = useState<RoomDTO | null>(realtimeStore.room);
  const [sidebarOpen, setSidebarOpen] = useState(true); // Collapsible panel (UX-04)
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'people' | 'stage'>('chat');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState(realtimeStore.chat);
  const [lighting, setLighting] = useState(realtimeStore.lightingPreset);
  const [moderationNotice, setModerationNotice] = useState<string | null>(realtimeStore.moderationNotice);
  const [systemNotice, setSystemNotice] = useState<string | null>(realtimeStore.systemNotice);
  const [reconnecting, setReconnecting] = useState(realtimeStore.reconnecting);
  const [cameraMode, setCameraMode] = useState<CameraMode>('AUDIENCE_ORBIT');
  // TBD-06 & TBD-23: Auto quality preset (LOW for mobile/low-core, HIGH for desktop)
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const lowCores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4;
    return isMobile || lowCores ? 'LOW' : 'HIGH';
  });
  const [perf, setPerf] = useState({ fps: 60, drawCalls: 0 });
  const [pingMs, setPingMs] = useState<number | null>(realtimeStore.pingMs);
  const [lowFpsStreak, setLowFpsStreak] = useState(0);

  // Audio & WebRTC state
  const [audienceMuted, setAudienceMuted] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [remoteAudioCount, setRemoteAudioCount] = useState(0);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [talkbackActive, setTalkbackActive] = useState(false); // TBD-08
  const [webrtcStats, setWebrtcStats] = useState<WebRtcDiagnostics | null>(null);
  const [midiDockOpen, setMidiDockOpen] = useState(false);
  const [djMixerOpen, setDjMixerOpen] = useState(false);
  const [deckAVolume, setDeckAVolume] = useState(100);
  const [queuedDeckBIdx, setQueuedDeckBIdx] = useState(1);
  const [micPanelOpen, setMicPanelOpen] = useState(
    () => effectiveRole === 'ARTIST' || effectiveRole === 'HOST' || effectiveRole === 'ADMIN'
  );
  const [musicVolume, setMusicVolume] = useState(() => audioEngine.getCaptureSettings().musicVolume);
  const [musicMuted, setMusicMuted] = useState(() => audioEngine.getCaptureSettings().musicMuted);
  const [emoteVolume, setEmoteVolume] = useState(() => audioEngine.getCaptureSettings().emoteVolume);
  const [emoteMuted, setEmoteMuted] = useState(() => audioEngine.getCaptureSettings().emoteMuted);
  const [instrument] = useState<InstrumentType>(navState?.performerInstrument ?? 'PIANO');

  // Setlist & Invite state
  const [newSongTitle, setNewSongTitle] = useState('');
  const [newSongYoutubeUrl, setNewSongYoutubeUrl] = useState('');
  const [newSongMode, setNewSongMode] = useState<'LIVE' | 'PRERECORDED'>('LIVE');
  const [setlistError, setSetlistError] = useState<string | null>(null);
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [inviteUserId, setInviteUserId] = useState('');

  // Report Modal
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<ReportDTO['category']>('HARASSMENT');
  const [reportTargetId, setReportTargetId] = useState('');
  const [reportText, setReportText] = useState('');
  const [reportSent, setReportSent] = useState(false);

  // Loading & anti-spam locks for action buttons
  type ReactionAction = 'CLAP' | 'CHEER' | 'WAVE' | 'DANCE' | 'FLOWER';
  type TransportAction = 'GO_LIVE' | 'PAUSE' | 'END_SONG' | 'NEXT_SONG' | 'TOGGLE_MODE' | 'COMPLETE';
  const [pendingReaction, setPendingReaction] = useState<ReactionAction | null>(null);
  const [pendingStand, setPendingStand] = useState(false);
  const [micPending, setMicPending] = useState(false);
  const [talkbackPending, setTalkbackPending] = useState(false);
  const [pendingTransport, setPendingTransport] = useState<TransportAction | null>(null);
  const [pendingAddSong, setPendingAddSong] = useState(false);
  const [pendingRemoveSongId, setPendingRemoveSongId] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState(false);
  const [pendingRoomLock, setPendingRoomLock] = useState(false);
  const [pendingSeatLockId, setPendingSeatLockId] = useState<string | null>(null);
  const [pendingReport, setPendingReport] = useState(false);
  const [pendingAudioUnlock, setPendingAudioUnlock] = useState(false);
  const actionTimersRef = useRef<Set<number>>(new Set());
  const transportLockRef = useRef<{ action: TransportAction; startedAt: number } | null>(null);

  const scheduleActionTimeout = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      actionTimersRef.current.delete(id);
      fn();
    }, ms);
    actionTimersRef.current.add(id);
    return id;
  };

  const isHostOrAdmin =
    Boolean(user?.roles.includes('HOST') || user?.roles.includes('ADMIN')) ||
    effectiveRole === 'HOST' ||
    effectiveRole === 'ADMIN';
  const isPerformerOrHost =
    effectiveRole === 'ARTIST' ||
    isHostOrAdmin ||
    Boolean(room?.concert.hostUserId === effectiveUserId) ||
    Boolean(room?.concert.invitedPerformerIds.includes(effectiveUserId));
  const canEditLighting = isPerformerOrHost; // Host, Artist, and Admin can adjust lighting
  const isAdmin = Boolean(user?.roles.includes('ADMIN')) || effectiveRole === 'ADMIN';

  useEffect(() => {
    if (!roomId) return;
    let lastConcertRef = realtimeStore.room?.concert ?? null;

    const unsub = realtimeStore.subscribe(() => {
      const nextConcert = realtimeStore.room?.concert ?? null;
      const concertUpdated = nextConcert !== lastConcertRef;
      lastConcertRef = nextConcert;

      setRoom(realtimeStore.room ? { ...realtimeStore.room } : null);
      setChatMessages([...realtimeStore.chat]);
      setLighting(realtimeStore.lightingPreset);
      setModerationNotice(realtimeStore.moderationNotice);
      setSystemNotice(realtimeStore.systemNotice);
      setReconnecting(realtimeStore.reconnecting);
      setPingMs(realtimeStore.pingMs);

      if (concertUpdated && transportLockRef.current) {
        const lock = transportLockRef.current;
        transportLockRef.current = null;
        const elapsed = performance.now() - lock.startedAt;
        const remaining = Math.max(0, 380 - elapsed);
        if (remaining === 0) {
          setPendingTransport(null);
        } else {
          scheduleActionTimeout(() => setPendingTransport((cur) => (cur === lock.action ? null : cur)), remaining);
        }
      }
    });

    webrtcAudio.attach(effectiveUserId, () => {
      setRemoteAudioCount(webrtcAudio.getActiveRemoteAudioCount());
      setIsBroadcasting(webrtcAudio.getIsBroadcasting());
      if (webrtcAudio.autoplayBlocked) setAutoplayBlocked(true);
    });

    realtimeStore.connect({
      roomId,
      userId: effectiveUserId,
      displayName: effectiveName,
      role: effectiveRole,
      avatarPresetId: effectiveAvatar,
      passcode: navState?.passcode,
    });

    const initialSeatId = navState?.seatId;
    if (initialSeatId) {
      setTimeout(() => {
        realtimeStore.send({ type: 'OCCUPY_SEAT', seatId: initialSeatId });
      }, 400);
    }

    const existingStream = audioEngine.getStream() ?? audioEngine.getPrerecordedStream();
    if (existingStream && (effectiveRole === 'ARTIST' || effectiveRole === 'HOST' || effectiveRole === 'ADMIN')) {
      setTimeout(() => {
        void webrtcAudio.startBroadcast(existingStream);
      }, 600);
    }

    const statsTimer = window.setInterval(() => {
      void webrtcAudio.getDiagnostics().then(setWebrtcStats);
    }, 2500);

    return () => {
      clearInterval(statsTimer);
      for (const timerId of actionTimersRef.current) {
        clearTimeout(timerId);
      }
      actionTimersRef.current.clear();
      unsub();
      webrtcAudio.destroy();
      audioEngine.stopCapture();
      audioEngine.stopPrerecordedFile();
      realtimeStore.disconnect();
    };
  }, [roomId, effectiveUserId, effectiveName, effectiveRole, effectiveAvatar]);

  useEffect(() => {
    return audioEngine.subscribeMusicVolume((vol, muted) => {
      setMusicVolume(vol);
      setMusicMuted(muted);
    });
  }, []);

  useEffect(() => {
    return audioEngine.subscribeEmoteVolume((vol, muted) => {
      setEmoteVolume(vol);
      setEmoteMuted(muted);
    });
  }, []);

  useEffect(() => {
    if (!systemNotice) return;
    const timer = window.setTimeout(() => {
      realtimeStore.systemNotice = null;
      setSystemNotice(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [systemNotice]);

  // Unlock browser-restricted audio seamlessly on the very first click/keypress anywhere
  useEffect(() => {
    if (!autoplayBlocked) return;
    const onFirstGesture = () => {
      void handleUnlockSyncedAudio();
    };
    window.addEventListener('pointerdown', onFirstGesture, { capture: true, once: true });
    window.addEventListener('keydown', onFirstGesture, { capture: true, once: true });
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture, { capture: true });
      window.removeEventListener('keydown', onFirstGesture, { capture: true });
    };
  }, [autoplayBlocked]);

  const handleSendReaction = (reaction: ReactionAction) => {
    if (pendingReaction) return;
    setPendingReaction(reaction);
    realtimeStore.send({ type: 'REACTION_SEND', reaction });
    const cooldownMs = reaction === 'FLOWER' ? 650 : 500;
    scheduleActionTimeout(() => {
      setPendingReaction((cur) => (cur === reaction ? null : cur));
    }, cooldownMs);
  };

  const handleStandUp = () => {
    if (pendingStand) return;
    setPendingStand(true);
    realtimeStore.send({ type: 'LEAVE_SEAT' });
    scheduleActionTimeout(() => setPendingStand(false), 380);
  };

  const handleConcertControl = (action: Exclude<TransportAction, 'TOGGLE_MODE'>) => {
    if (pendingTransport) return;
    setPendingTransport(action);
    transportLockRef.current = { action, startedAt: performance.now() };
    realtimeStore.send({ type: 'PERFORMER_CONCERT_CONTROL', action });
    // Safety release if offline/disconnected so button never hangs
    scheduleActionTimeout(() => {
      if (transportLockRef.current?.action === action) {
        transportLockRef.current = null;
        setPendingTransport((cur) => (cur === action ? null : cur));
      }
    }, 1500);
  };

  const handleToggleTalkback = async () => {
    if (talkbackPending) return;
    setTalkbackPending(true);
    try {
      if (talkbackActive) {
        webrtcAudio.stopBroadcast();
        setTalkbackActive(false);
      } else {
        const stream = audioEngine.getStream() ?? (await audioEngine.startCapture(undefined, false));
        await webrtcAudio.startPerformerTalkback(stream);
        setTalkbackActive(true);
      }
    } catch (err) {
      setSystemNotice((err as Error).message || 'Không thể bật Talkback mic.');
    } finally {
      setTalkbackPending(false);
    }
  };

  const handlePerfSample = (fps: number, drawCalls: number) => {
    setPerf({ fps, drawCalls });
    // TBD-06: Auto quality downgrade if FPS drops below 28 for 3 consecutive samples
    if (fps < 28 && qualityPreset !== 'LOW') {
      const nextStreak = lowFpsStreak + 1;
      setLowFpsStreak(nextStreak);
      if (nextStreak >= 3) {
        setQualityPreset('LOW');
        setLowFpsStreak(0);
      }
    } else if (lowFpsStreak !== 0) {
      setLowFpsStreak(0);
    }
  };

  const handleToggleSeatLock = async (seatId: string) => {
    if (!roomId || !token || pendingSeatLockId) return;
    setPendingSeatLockId(seatId);
    try {
      await apiClient.toggleSeatLock(roomId, seatId, token);
    } catch (err) {
      console.error(err);
    } finally {
      setPendingSeatLockId(null);
    }
  };

  const handleToggleBroadcast = async () => {
    if (micPending) return;
    setMicPending(true);
    try {
      if (isBroadcasting) {
        webrtcAudio.stopBroadcast();
        audioEngine.stopCapture();
        setIsBroadcasting(false);
      } else {
        const s = audioEngine.getCaptureSettings();
        const stream =
          audioEngine.getStream() ??
          (await audioEngine.startCapture(s.deviceId || undefined, s.monitorEnabled, {
            echoCancellation: s.echoCancellation,
            noiseSuppression: s.noiseSuppression,
            autoGainControl: false,
            inputGain: s.inputGain,
            monitorVolume: s.monitorVolume,
            stageEcho: s.stageEchoEnabled,
            stageEchoMix: s.stageEchoMix,
            stageEchoDelayMs: s.stageEchoDelayMs,
            stageEchoFeedback: s.stageEchoFeedback,
            reverbEnabled: s.reverbEnabled,
            reverbMix: s.reverbMix,
            reverbRoomSec: s.reverbRoomSec,
          }));
        await webrtcAudio.startBroadcast(stream);
        setIsBroadcasting(true);
      }
    } catch (err) {
      setSystemNotice((err as Error).message || 'Không thể truy cập Microphone.');
    } finally {
      setMicPending(false);
    }
  };

  const handleSwitchMode = async () => {
    if (pendingTransport) return;
    setPendingTransport('TOGGLE_MODE');
    transportLockRef.current = { action: 'TOGGLE_MODE', startedAt: performance.now() };
    realtimeStore.send({ type: 'PERFORMER_CONCERT_CONTROL', action: 'TOGGLE_MODE' });
    scheduleActionTimeout(() => {
      if (transportLockRef.current?.action === 'TOGGLE_MODE') {
        transportLockRef.current = null;
        setPendingTransport((cur) => (cur === 'TOGGLE_MODE' ? null : cur));
      }
    }, 1500);
    try {
      const nextStream =
        audioEngine.getPrerecordedStream() && isBroadcasting ? audioEngine.getPrerecordedStream() : audioEngine.getStream();
      if (nextStream && isBroadcasting) {
        await webrtcAudio.replaceBroadcastStream(nextStream);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleStageMidiNote = (midi: number) => {
    audioEngine.playSynthNote(midi, 0.35);
    realtimeStore.sendMidi({
      userId: effectiveUserId,
      instrument,
      note: midi,
      velocity: 100,
      isNoteOn: true,
      clientTimestampMs: performance.now(),
    });
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    realtimeStore.send({ type: 'CHAT_SEND', text: chatInput });
    setChatInput('');
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId || !reportText.trim() || pendingReport) return;
    setPendingReport(true);
    try {
      await apiClient.submitReport({
        roomId,
        reporterUserId: effectiveUserId,
        targetUserId: reportTargetId || undefined,
        category: reportCategory,
        description: reportText,
      });
      setReportText('');
      setReportTargetId('');
      setReportOpen(false);
      setReportSent(true);
      scheduleActionTimeout(() => setReportSent(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setPendingReport(false);
    }
  };

  const handleModerate = async (targetUserId: string, action: 'MUTE' | 'KICK' | 'BAN') => {
    if (!roomId || !token) return;
    try {
      await apiClient.moderateUser({ roomId, targetUserId, action }, token);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId || !token || pendingAddSong) return;
    const ytInput = newSongYoutubeUrl.trim();
    if (!newSongTitle.trim() && !ytInput) return;
    setSetlistError(null);
    if (ytInput && !extractStandardYouTubeVideoId(ytInput)) {
      setSetlistError('Chỉ chấp nhận link video YouTube chuẩn dạng https://www.youtube.com/watch?v=... (không hỗ trợ Shorts).');
      return;
    }
    setPendingAddSong(true);
    try {
      await apiClient.addSetlistItem(
        roomId,
        {
          title: newSongTitle.trim() || undefined,
          youtubeUrl: ytInput || undefined,
          mode: ytInput ? 'PRERECORDED' : newSongMode,
          lightingPreset: lighting,
        },
        token
      );
      setNewSongTitle('');
      setNewSongYoutubeUrl('');
    } catch (err) {
      const msg = (err as Error).message;
      setSetlistError(
        msg === 'UNAUTHORIZED'
          ? 'Phiên đăng nhập đã hết hạn (server vừa restart). Hãy bấm Sign In lại nhé!'
          : msg === 'INVALID_YOUTUBE_URL'
            ? 'Chỉ chấp nhận link video YouTube chuẩn dạng https://www.youtube.com/watch?v=... (không hỗ trợ Shorts).'
            : msg
      );
    } finally {
      setPendingAddSong(false);
    }
  };

  const handleRemoveSong = async (itemId: string) => {
    if (!roomId || !token || pendingRemoveSongId) return;
    setPendingRemoveSongId(itemId);
    try {
      await apiClient.removeSetlistItem(roomId, itemId, token);
    } catch (err) {
      console.error(err);
    } finally {
      setPendingRemoveSongId(null);
    }
  };

  const handleInvitePerformer = async (targetId: string) => {
    if (!roomId || !token || !targetId.trim() || pendingInvite) return;
    setPendingInvite(true);
    try {
      await apiClient.invitePerformer(roomId, targetId, token);
      setInviteUserId('');
    } catch (err) {
      console.error(err);
    } finally {
      setPendingInvite(false);
    }
  };

  const handleToggleRoomLock = async () => {
    if (!room || !token || pendingRoomLock) return;
    setPendingRoomLock(true);
    try {
      const nextState = room.state === 'LOCKED' ? 'ACTIVE' : 'LOCKED';
      await apiClient.setRoomState(room.id, nextState, token);
    } catch (err) {
      console.error(err);
    } finally {
      setPendingRoomLock(false);
    }
  };

  const handleUnlockSyncedAudio = async () => {
    if (pendingAudioUnlock) return;
    setPendingAudioUnlock(true);
    try {
      setAutoplayBlocked(false);
      setAudienceMuted(false);
      audioEngine.setRoomOutputMuted(false);
      webrtcAudio.setAudienceMuted(false);
      await webrtcAudio.unlockPlayback();
      if (ytIframeRef.current?.contentWindow && room) {
        const syncSec = realtimeStore.getSyncedPlaybackSec(room.concert);
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'unMute', args: '' }),
          '*'
        );
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'seekTo', args: [syncSec, true] }),
          '*'
        );
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'playVideo', args: '' }),
          '*'
        );
      }
    } finally {
      setPendingAudioUnlock(false);
    }
  };

  const currentSong = room?.concert.setlist[room.concert.currentSetlistIndex];
  const participants = Array.from(realtimeStore.avatars.values());
  const localSeated = Boolean(realtimeStore.avatars.get(effectiveUserId)?.seatId);
  const effectiveMusicVolume = Math.round((musicVolume * deckAVolume) / 100);

  return (
    <div className="relative flex h-[calc(100vh-57px)] w-full overflow-hidden bg-stone-950">
      {/* Main 3D Stage Viewport */}
      <div className="relative flex-1">
        {room ? (
          <AuditoriumScene
            room={room}
            localUserId={effectiveUserId}
            localRole={effectiveRole}
            lightingPreset={lighting}
            cameraMode={cameraMode}
            qualityPreset={qualityPreset}
            youtubeVideoId={currentSong?.youtubeVideoId}
            isYouTubePlaying={Boolean(
              currentSong?.youtubeVideoId &&
                (room.concert.trackPlaying ?? (room.concert.state !== 'PAUSED' && room.concert.state !== 'COMPLETED'))
            )}
            audienceMuted={audienceMuted}
            musicVolume={effectiveMusicVolume}
            musicMuted={musicMuted}
            ytIframeRef={ytIframeRef}
            onAutoplayBlocked={setAutoplayBlocked}
            onSelectSeat={(seatId) => realtimeStore.send({ type: 'OCCUPY_SEAT', seatId })}
            onPerfSample={handlePerfSample}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-stone-400">
            <Radio className="h-6 w-6 animate-pulse text-amber-400" />
            <span className="text-sm">Entering 3D Auditorium...</span>
          </div>
        )}

        {/* Minimal Top-Left Concert Status + Performance & WebRTC Telemetry */}
        <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-1.5">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-stone-800/80 bg-stone-950/75 px-4 py-2.5 shadow-xl backdrop-blur-md">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                room?.concert.state === 'LIVE' ? 'animate-pulse bg-red-500' : 'bg-emerald-400'
              }`}
            />
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <span>{room?.concert.title ?? 'Loading...'}</span>
                {room && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      room.venueStyle === 'CONCERT'
                        ? 'bg-fuchsia-500/20 text-fuchsia-300'
                        : 'bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {room.venueStyle === 'CONCERT' ? '🎆 Concert' : '🎻 Thính phòng'}
                  </span>
                )}
                {room?.state === 'LOCKED' && <Lock className="h-3 w-3 text-amber-400" />}
              </div>
              <div className="text-[11px] text-amber-300">
                {room?.concert.state} • {currentSong ? `${currentSong.title} (${currentSong.mode})` : 'No song'}
              </div>
            </div>
            <span className="ml-2 flex items-center gap-1.5 rounded-lg bg-stone-900 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
              <span>{perf.fps} FPS</span>
              <span className="text-stone-600">•</span>
              <span>{perf.drawCalls} DC</span>
              <span className="text-stone-600">•</span>
              <span
                className={
                  pingMs === null
                    ? 'text-stone-400'
                    : pingMs <= 60
                      ? 'text-emerald-300'
                      : pingMs <= 150
                        ? 'text-amber-300'
                        : 'text-red-400'
                }
              >
                {pingMs !== null ? `${pingMs} ms` : '-- ms'}
              </span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-lg bg-stone-950/70 px-2.5 py-1 text-[10px] text-stone-400 backdrop-blur">
              Move: WASD / Arrows • Click seat to sit
            </span>
            {remoteAudioCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-950/70 px-2 py-1 font-mono text-[10px] font-semibold text-emerald-300">
                <Radio className="h-3 w-3 animate-pulse" />
                Live Audio {webrtcStats?.rttMs !== null && webrtcStats?.rttMs !== undefined ? `• RTT ${webrtcStats.rttMs}ms` : ''}
                {webrtcStats?.jitterMs !== null && webrtcStats?.jitterMs !== undefined ? ` • Jitter ${webrtcStats.jitterMs}ms` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Autoplay-Blocked Notice (only shown when a fresh tab hasn't received any browser click yet) */}
        {autoplayBlocked && (
          <button
            disabled={pendingAudioUnlock}
            onClick={() => void handleUnlockSyncedAudio()}
            className={`absolute left-1/2 top-16 z-20 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-emerald-400/50 bg-emerald-600/95 px-5 py-2.5 text-xs font-bold text-white shadow-2xl transition-all duration-100 hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed ${
              pendingAudioUnlock ? 'ring-2 ring-emerald-200/80' : ''
            }`}
          >
            {pendingAudioUnlock ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Volume2 className="h-4 w-4 animate-pulse" />
            )}
            {pendingAudioUnlock
              ? 'Đang bật âm thanh...'
              : 'Âm thanh sân khấu đã đồng bộ — chạm bất kỳ đâu để bật tiếng'}
          </button>
        )}

        {/* Reconnecting / Moderation / System / Flower Toast Banner */}
        {(reconnecting || moderationNotice || systemNotice || reportSent) && (
          <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-amber-500/40 bg-stone-950/90 px-4 py-2 text-xs font-semibold text-amber-200 shadow-lg backdrop-blur">
            {reconnecting && <WifiOff className="h-3.5 w-3.5 animate-pulse text-amber-400" />}
            <span>
              {reconnecting
                ? 'Connection lost — attempting automatic reconnect...'
                : (moderationNotice ?? systemNotice ?? 'Safety / Copyright report submitted for review.')}
            </span>
          </div>
        )}

        {/* Top-Right Minimal Controls */}
        <div className="absolute right-4 top-4 z-10 flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() =>
              setQualityPreset((q) => (q === 'HIGH' ? 'MEDIUM' : q === 'MEDIUM' ? 'LOW' : 'HIGH'))
            }
            title="3D Quality Preset (Exp E)"
            className="rounded-xl border border-stone-700/80 bg-stone-950/80 px-2.5 py-1.5 font-mono text-[11px] text-stone-200 backdrop-blur transition hover:bg-stone-800"
          >
            3D:{qualityPreset}
          </button>

          <button
            onClick={() => {
              const next = !audienceMuted;
              if (!next) {
                void handleUnlockSyncedAudio();
                return;
              }
              setAudienceMuted(true);
              audioEngine.setRoomOutputMuted(true);
              webrtcAudio.setAudienceMuted(true);
              ytIframeRef.current?.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: 'mute', args: '' }),
                '*'
              );
            }}
            title={audienceMuted ? 'Unmute Concert Audio' : 'Mute Concert Audio'}
            className="flex items-center gap-1.5 rounded-xl border border-stone-700/80 bg-stone-950/80 px-3 py-1.5 text-xs text-stone-200 backdrop-blur transition hover:bg-stone-800"
          >
            {audienceMuted ? <VolumeX className="h-3.5 w-3.5 text-red-400" /> : <Volume2 className="h-3.5 w-3.5 text-emerald-400" />}
            <span className="hidden sm:inline">{audienceMuted ? 'Muted' : 'Audio'}</span>
          </button>

          <button
            onClick={() =>
              setCameraMode((m) =>
                m === 'AUDIENCE_ORBIT' ? 'STAGE_VIEW' : m === 'STAGE_VIEW' ? 'SEAT_POV' : 'AUDIENCE_ORBIT'
              )
            }
            className="flex items-center gap-1.5 rounded-xl border border-stone-700/80 bg-stone-950/80 px-3 py-1.5 text-xs text-stone-200 backdrop-blur transition hover:bg-stone-800"
          >
            <Camera className="h-3.5 w-3.5 text-amber-400" />
            {cameraMode.replace('_', ' ')}
          </button>

          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-1 rounded-xl border border-stone-700/80 bg-stone-950/80 px-2.5 py-1.5 text-xs text-stone-300 backdrop-blur transition hover:bg-stone-800"
          >
            <Flag className="h-3.5 w-3.5 text-red-400" /> Report
          </button>

          <button
            onClick={() => navigate('/explore')}
            className="flex items-center gap-1 rounded-xl border border-stone-700/80 bg-stone-950/80 px-2.5 py-1.5 text-xs text-stone-300 backdrop-blur transition hover:bg-stone-800"
          >
            <LogOut className="h-3.5 w-3.5" /> Exit
          </button>

          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-stone-950 shadow-md"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Chat
            </button>
          )}
        </div>

        {/* Performer Mic & Self-Monitor / Stage Echo Control Panel */}
        {isPerformerOrHost && (
          <PerformerMicPanel
            open={micPanelOpen}
            onClose={() => setMicPanelOpen(false)}
            isBroadcasting={isBroadcasting}
            micPending={micPending}
            onToggleBroadcast={handleToggleBroadcast}
            onNotice={setSystemNotice}
          />
        )}

        {/* Dual-Deck Transition Mixer (Deck A: Now Playing vs Deck B: Queued/Fade) */}
        {isPerformerOrHost && room && (
          <DualDeckMixer
            open={djMixerOpen}
            onClose={() => setDjMixerOpen(false)}
            setlist={room.concert.setlist}
            currentIndex={room.concert.currentSetlistIndex}
            queuedIndex={queuedDeckBIdx}
            onSelectQueuedIndex={setQueuedDeckBIdx}
            deckAVolume={deckAVolume}
            onDeckAVolumeChange={setDeckAVolume}
          />
        )}

        {/* Floating Performer MIDI Keys Dock */}
        {isPerformerOrHost && midiDockOpen && (
          <div className="absolute bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-amber-500/30 bg-stone-950/90 px-4 py-2.5 shadow-2xl backdrop-blur-md">
            <span className="text-[11px] font-semibold text-amber-300">Live MIDI ({instrument}):</span>
            <div className="flex gap-1">
              {STAGE_MIDI_KEYS.map((k) => (
                <button
                  key={k.midi}
                  onClick={() => handleStageMidiNote(k.midi)}
                  className="rounded-lg border border-stone-700 bg-stone-100 px-2.5 py-1.5 text-[11px] font-bold text-stone-900 transition hover:bg-amber-400"
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Separate Audience Reactions & Seat Dock (right side for Performers, bottom-center for Audience) */}
        <div
          className={
            isPerformerOrHost
              ? 'absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1.5 rounded-2xl border border-stone-800/90 bg-stone-950/90 p-2 shadow-2xl'
              : 'absolute bottom-4 left-1/2 z-10 flex max-w-[95vw] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-stone-800/90 bg-stone-950/90 px-3.5 py-2 shadow-2xl'
          }
        >
          {isPerformerOrHost && (
            <span className="pb-0.5 text-center text-[9px] font-bold uppercase tracking-wider text-stone-500">Emote</span>
          )}
          {(['CLAP', 'CHEER', 'WAVE', 'DANCE'] as const).map((r) => {
            const isLoading = pendingReaction === r;
            const otherLocked = Boolean(pendingReaction) && !isLoading;
            const emoji = r === 'CLAP' ? '👏' : r === 'CHEER' ? '🙌' : r === 'WAVE' ? '👋' : '💃';
            return (
              <button
                key={r}
                disabled={Boolean(pendingReaction)}
                onClick={() => handleSendReaction(r)}
                className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-100 active:scale-95 disabled:cursor-not-allowed ${
                  isPerformerOrHost ? 'justify-start' : 'justify-center'
                } ${
                  isLoading
                    ? 'bg-amber-500/25 text-amber-200 ring-2 ring-amber-400/80'
                    : otherLocked
                      ? 'bg-stone-800/90 text-stone-200 opacity-50'
                      : 'bg-stone-800/90 text-stone-200 hover:bg-amber-500 hover:text-stone-950'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />
                ) : isPerformerOrHost ? (
                  <span>{emoji}</span>
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                <span>{r}</span>
              </button>
            );
          })}

          {/* TBD-16: Free Virtual Flower */}
          <button
            disabled={Boolean(pendingReaction)}
            onClick={() => handleSendReaction('FLOWER')}
            title="Send Free Virtual Flower (TBD-16)"
            className={`flex items-center gap-1.5 rounded-xl border border-pink-500/30 px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-100 active:scale-95 disabled:cursor-not-allowed ${
              isPerformerOrHost ? 'justify-start' : 'justify-center'
            } ${
              pendingReaction === 'FLOWER'
                ? 'bg-pink-500/30 text-pink-100 ring-2 ring-pink-400/80'
                : pendingReaction
                  ? 'bg-pink-500/15 text-pink-200 opacity-50'
                  : 'bg-pink-500/15 text-pink-200 hover:bg-pink-500 hover:text-stone-950'
            }`}
          >
            {pendingReaction === 'FLOWER' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-pink-300" /> : '🌸'} Flower
          </button>

          {(localSeated || pendingStand) && (
            <button
              disabled={pendingStand}
              onClick={handleStandUp}
              className={`flex items-center gap-1.5 rounded-xl border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-[11px] text-stone-300 transition-all duration-100 hover:bg-stone-800 active:scale-95 disabled:cursor-not-allowed ${
                isPerformerOrHost ? 'mt-0.5 justify-start border-t border-stone-800' : 'justify-center'
              } ${pendingStand ? 'ring-2 ring-amber-400/80 text-amber-200' : ''}`}
            >
              {pendingStand ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
              ) : (
                <Armchair className="h-3 w-3 text-amber-400" />
              )}
              <span>Stand</span>
            </button>
          )}

          {/* Emote Sound Effects (SFX) Volume Control */}
          <div
            className={
              isPerformerOrHost
                ? 'mt-0.5 flex flex-col gap-1 border-t border-stone-800/80 px-1 pt-1.5'
                : 'ml-0.5 flex items-center gap-1.5 border-l border-stone-800/80 pl-2'
            }
          >
            <button
              type="button"
              onClick={() => {
                const nextMute = !emoteMuted;
                setEmoteMuted(nextMute);
                audioEngine.setEmoteVolume(emoteVolume, nextMute);
              }}
              title={emoteMuted ? 'Bật âm thanh Emote' : 'Tắt tiếng Emote'}
              className="flex items-center justify-between gap-1 text-[10px] font-semibold text-stone-300 hover:text-amber-300"
            >
              <span className="inline-flex items-center gap-1">
                {emoteMuted || emoteVolume === 0 ? (
                  <VolumeX className="h-3 w-3 text-red-400" />
                ) : (
                  <Volume2 className="h-3 w-3 text-amber-400" />
                )}
                <span>SFX</span>
              </span>
              {isPerformerOrHost && (
                <span className="font-mono text-[9px] text-amber-300">
                  {emoteMuted || emoteVolume === 0 ? 'OFF' : `${emoteVolume}%`}
                </span>
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={emoteVolume}
              title={`Âm lượng Emote: ${emoteMuted || emoteVolume === 0 ? 'Muted' : `${emoteVolume}%`}`}
              onChange={(e) => {
                const vol = Number(e.target.value);
                setEmoteVolume(vol);
                if (vol > 0 && emoteMuted) setEmoteMuted(false);
                audioEngine.setEmoteVolume(vol, vol === 0);
              }}
              className={`${isPerformerOrHost ? 'w-20' : 'w-16'} cursor-pointer accent-amber-400`}
            />
            {!isPerformerOrHost && (
              <span className="w-7 text-right font-mono text-[10px] text-amber-300">
                {emoteMuted || emoteVolume === 0 ? 'OFF' : `${emoteVolume}%`}
              </span>
            )}
          </div>
        </div>

        {/* Dedicated Bottom-Center Performer & Stage Controls Bar (1 clean row, separated from Emotes) */}
        {isPerformerOrHost && (
          <div className="absolute bottom-4 left-1/2 z-10 flex max-w-[94vw] -translate-x-1/2 items-center gap-1.5 overflow-x-auto whitespace-nowrap rounded-2xl border border-stone-800/90 bg-stone-950/90 px-3 py-2 shadow-2xl">
            <button
              disabled={micPending}
              onClick={() => void handleToggleBroadcast()}
              className={`flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-white transition-all duration-100 active:scale-95 disabled:cursor-not-allowed ${
                micPending ? 'ring-2 ring-white/80' : ''
              } ${isBroadcasting ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
            >
              {micPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isBroadcasting ? (
                <Mic className="h-3.5 w-3.5" />
              ) : (
                <MicOff className="h-3.5 w-3.5" />
              )}
              {micPending ? (isBroadcasting ? 'Stopping...' : 'Starting...') : isBroadcasting ? 'Mic Live' : 'Go Mic'}
            </button>

            <button
              type="button"
              onClick={() => setMicPanelOpen((v) => !v)}
              title="Mở bảng điều khiển Karaoke, Mic, Self-Monitor & Echo"
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-100 active:scale-95 ${
                micPanelOpen ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-200 hover:bg-stone-700'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" /> Mic Panel
              <MicActivityDot />
            </button>

            <button
              disabled={talkbackPending}
              onClick={() => void handleToggleTalkback()}
              title="Private Performer Talkback (TBD-08)"
              className={`flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-100 active:scale-95 disabled:cursor-not-allowed ${
                talkbackPending ? 'ring-2 ring-sky-300/80' : ''
              } ${talkbackActive ? 'bg-sky-600 text-white' : 'bg-stone-800 text-stone-300 hover:bg-stone-700'}`}
            >
              {talkbackPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {talkbackPending ? 'Linking...' : talkbackActive ? 'Talkback On' : 'Talkback'}
            </button>

            <button
              type="button"
              onClick={() => {
                setDjMixerOpen((v) => !v);
                setMidiDockOpen(false);
              }}
              title="Mở bảng chuyển bài mượt Dual-Deck Mixer (Deck A -> Deck B)"
              className={`flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-100 active:scale-95 ${
                djMixerOpen ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-200 hover:bg-stone-700'
              }`}
            >
              <Disc3 className="h-3.5 w-3.5" /> DJ Mix
            </button>

            <button
              onClick={() => {
                setMidiDockOpen((v) => !v);
                setDjMixerOpen(false);
              }}
              className={`flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-100 active:scale-95 ${
                midiDockOpen ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-200 hover:bg-stone-700'
              }`}
            >
              <Piano className="h-3.5 w-3.5" /> MIDI
            </button>

            <span className="mx-0.5 h-5 w-px shrink-0 bg-stone-700/80" />

            <button
              disabled={Boolean(pendingTransport)}
              onClick={() => handleConcertControl('GO_LIVE')}
              className={`inline-flex shrink-0 items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition-all duration-100 active:scale-95 disabled:cursor-not-allowed ${
                pendingTransport === 'GO_LIVE'
                  ? 'ring-2 ring-emerald-200/85'
                  : pendingTransport
                    ? 'opacity-50'
                    : 'hover:bg-emerald-500'
              }`}
            >
              {pendingTransport === 'GO_LIVE' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3 w-3" />}{' '}
              {room?.concert.state === 'PAUSED' || room?.concert.state === 'INTERMISSION' ? 'Resume' : 'Live'}
            </button>

            <button
              disabled={Boolean(pendingTransport)}
              onClick={() =>
                handleConcertControl(
                  room?.concert.state === 'PAUSED' || room?.concert.state === 'INTERMISSION' ? 'GO_LIVE' : 'PAUSE'
                )
              }
              title={
                room?.concert.state === 'PAUSED' || room?.concert.state === 'INTERMISSION'
                  ? 'Phát tiếp nhạc từ đoạn đang tạm dừng'
                  : 'Tạm dừng nhạc (Pause)'
              }
              className={`inline-flex shrink-0 items-center justify-center rounded-xl px-2.5 py-1.5 text-[11px] transition-all duration-100 active:scale-95 disabled:cursor-not-allowed ${
                pendingTransport === 'PAUSE'
                  ? 'bg-stone-800 ring-2 ring-amber-300/80 text-amber-200'
                  : pendingTransport
                    ? 'bg-stone-800 text-stone-200 opacity-50'
                    : room?.concert.state === 'PAUSED' || room?.concert.state === 'INTERMISSION'
                      ? 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/60 hover:bg-amber-500/35'
                      : 'bg-stone-800 text-stone-200 hover:bg-stone-700'
              }`}
            >
              {pendingTransport === 'PAUSE' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : room?.concert.state === 'PAUSED' || room?.concert.state === 'INTERMISSION' ? (
                <Play className="h-3 w-3" />
              ) : (
                <Pause className="h-3 w-3" />
              )}
            </button>

            <button
              disabled={Boolean(pendingTransport)}
              onClick={() => handleConcertControl('END_SONG')}
              className={`inline-flex shrink-0 items-center gap-1 rounded-xl bg-amber-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition-all duration-100 active:scale-95 disabled:cursor-not-allowed ${
                pendingTransport === 'END_SONG'
                  ? 'ring-2 ring-amber-200/85'
                  : pendingTransport
                    ? 'opacity-50'
                    : 'hover:bg-amber-500'
              }`}
            >
              {pendingTransport === 'END_SONG' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Applause
            </button>

            <button
              disabled={Boolean(pendingTransport)}
              onClick={() => handleConcertControl('NEXT_SONG')}
              className={`inline-flex shrink-0 items-center gap-1 rounded-xl bg-stone-800 px-2.5 py-1.5 text-[11px] text-stone-200 transition-all duration-100 active:scale-95 disabled:cursor-not-allowed ${
                pendingTransport === 'NEXT_SONG'
                  ? 'ring-2 ring-amber-300/80 text-amber-200'
                  : pendingTransport
                    ? 'opacity-50'
                    : 'hover:bg-stone-700'
              }`}
            >
              {pendingTransport === 'NEXT_SONG' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <SkipForward className="h-3 w-3" />
              )}{' '}
              Next
            </button>

            <button
              disabled={Boolean(pendingTransport)}
              onClick={() => void handleSwitchMode()}
              className={`inline-flex shrink-0 items-center gap-1 rounded-xl bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-all duration-100 active:scale-95 disabled:cursor-not-allowed ${
                pendingTransport === 'TOGGLE_MODE'
                  ? 'ring-2 ring-indigo-200/85'
                  : pendingTransport
                    ? 'opacity-50'
                    : 'hover:bg-indigo-500'
              }`}
            >
              {pendingTransport === 'TOGGLE_MODE' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Music2 className="h-3 w-3" />
              )}{' '}
              Live/Rec
            </button>
          </div>
        )}
      </div>

      {/* Collapsible Livestream Chat, Audience & Stage Control Panel */}
      {sidebarOpen && (
        <aside className="flex w-80 flex-col border-l border-stone-800/90 bg-stone-900/95 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-stone-800 px-3 py-2">
            <div className="flex gap-1 rounded-lg bg-stone-950 p-0.5 text-xs">
              <button
                onClick={() => setSidebarTab('chat')}
                className={`flex items-center gap-1 rounded-md px-2 py-1 font-semibold transition ${
                  sidebarTab === 'chat' ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                <MessageSquare className="h-3 w-3" /> Chat
              </button>
              <button
                onClick={() => setSidebarTab('people')}
                className={`flex items-center gap-1 rounded-md px-2 py-1 font-semibold transition ${
                  sidebarTab === 'people' ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                <Users className="h-3 w-3" /> ({participants.length})
              </button>
              {isPerformerOrHost && (
                <button
                  onClick={() => setSidebarTab('stage')}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 font-semibold transition ${
                    sidebarTab === 'stage' ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Sliders className="h-3 w-3" /> Stage
                </button>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-1 text-stone-400 hover:bg-stone-800 hover:text-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {sidebarTab === 'chat' && (
            <>
              <div className="flex-1 space-y-2 overflow-y-auto p-3 text-xs">
                {chatMessages.length === 0 && (
                  <p className="mt-6 text-center text-stone-500">No messages yet. Say hello between songs!</p>
                )}
                {chatMessages.map((m) => (
                  <div key={m.id} className="rounded-xl border border-stone-800/60 bg-stone-950/70 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-bold ${
                          m.role === 'ARTIST' ? 'text-amber-300' : m.role === 'ADMIN' ? 'text-sky-300' : 'text-stone-300'
                        }`}
                      >
                        {m.displayName} {m.role === 'ARTIST' ? '★' : ''}
                      </span>
                      <span className="text-[10px] text-stone-600">
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="mt-0.5 break-words text-stone-200">{m.text}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSendChat} className="border-t border-stone-800 p-2.5">
                <div className="flex gap-1.5">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Chat with audience..."
                    className="flex-1 rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-xs text-white focus:border-amber-500/60 focus:outline-none"
                  />
                  <button className="rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-stone-950 hover:bg-amber-400">
                    Send
                  </button>
                </div>
              </form>
            </>
          )}

          {sidebarTab === 'people' && (
            <div className="flex-1 space-y-2 overflow-y-auto p-3 text-xs">
              {participants.map((p) => (
                <div
                  key={p.userId}
                  className="flex items-center justify-between rounded-xl border border-stone-800/70 bg-stone-950/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-stone-100">
                      {p.displayName} {p.role === 'ARTIST' ? '★' : ''}
                    </div>
                    <div className="text-[10px] text-stone-400">
                      {p.role} {p.seatId ? `• Seat ${p.seatId}` : '• Aisle'}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {isPerformerOrHost && p.role === 'AUDIENCE' && token && (
                      <button
                        onClick={() => void handleInvitePerformer(p.userId)}
                        title="Invite to Stage (LMR-09)"
                        className="rounded bg-amber-500/20 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/30"
                      >
                        <UserPlus className="inline h-3 w-3" />
                      </button>
                    )}
                    {isHostOrAdmin && p.userId !== effectiveUserId && token && (
                      <>
                        <button
                          onClick={() => void handleModerate(p.userId, 'MUTE')}
                          className="rounded bg-stone-800 px-2 py-1 text-[10px] text-amber-300 hover:bg-stone-700"
                        >
                          Mute
                        </button>
                        <button
                          onClick={() => void handleModerate(p.userId, 'KICK')}
                          className="rounded bg-stone-800 px-2 py-1 text-[10px] text-red-300 hover:bg-stone-700"
                        >
                          Kick
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => void handleModerate(p.userId, 'BAN')}
                            className="rounded bg-red-950 px-2 py-1 text-[10px] text-red-300 hover:bg-red-900"
                          >
                            Ban
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {sidebarTab === 'stage' && isPerformerOrHost && room && (
            <div className="flex-1 space-y-4 overflow-y-auto p-3 text-xs">
              {/* Lighting Script Cue (SM-07: Host, Artist, and Admin) */}
              {canEditLighting && (
                <div>
                  <div className="mb-1.5 font-semibold text-stone-300">Lighting Script Cue (Host / Artist • SM-07)</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {LIGHTING_PRESETS.map((lp) => (
                      <button
                        key={lp.id}
                        onClick={() => realtimeStore.send({ type: 'SET_LIGHTING_CUE', preset: lp.id })}
                        className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium transition ${
                          lighting === lp.id
                            ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                            : 'border-stone-800 bg-stone-950 text-stone-400 hover:border-stone-700'
                        }`}
                      >
                        {lp.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Editable Setlist + YouTube Track Insertion (SM-08) */}
              <div className="border-t border-stone-800 pt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-semibold text-stone-300">Setlist ({room.concert.setlist.length})</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDjMixerOpen((v) => !v);
                      setMidiDockOpen(false);
                    }}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                      djMixerOpen
                        ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                        : 'border-stone-700 bg-stone-900 text-amber-300 hover:bg-stone-800'
                    }`}
                  >
                    <Disc3 className="h-3 w-3" /> {djMixerOpen ? 'Ẩn Deck Mix' : 'Deck Mix'}
                  </button>
                </div>
                <div className="space-y-1.5">
                  {room.concert.setlist.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-1 rounded-lg border px-2.5 py-1.5 ${
                        idx === room.concert.currentSetlistIndex
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                          : 'border-stone-800 bg-stone-950 text-stone-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => realtimeStore.send({ type: 'SELECT_SETLIST_ITEM', index: idx })}
                        title="Play this track now"
                        className="min-w-0 flex-1 pr-1 text-left"
                      >
                        <div className="flex items-center gap-1 truncate font-medium">
                          {item.youtubeVideoId && <Youtube className="h-3 w-3 shrink-0 text-red-400" />}
                          <span className="truncate">
                            {idx + 1}. {item.title}
                          </span>
                        </div>
                        <div className="text-[10px] text-stone-500">
                          {item.mode} {idx === room.concert.currentSetlistIndex ? '• Now Playing' : '• Click to play'}
                        </div>
                      </button>
                      {idx !== room.concert.currentSetlistIndex && (
                        <button
                          type="button"
                          onClick={() => {
                            setQueuedDeckBIdx(idx);
                            setDjMixerOpen(true);
                            setMidiDockOpen(false);
                          }}
                          title="Đưa vào Deck B để mix & chuyển bài mượt"
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold transition ${
                            djMixerOpen && queuedDeckBIdx === idx
                              ? 'bg-sky-500 text-stone-950'
                              : 'bg-stone-800 text-sky-300 hover:bg-sky-500/20'
                          }`}
                        >
                          Cue B
                        </button>
                      )}
                      {token && room.concert.setlist.length > 1 && (
                        <button
                          disabled={pendingRemoveSongId === item.id}
                          onClick={() => void handleRemoveSong(item.id)}
                          className="text-stone-500 transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pendingRemoveSongId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {token && (
                  <form onSubmit={handleAddSong} className="mt-2.5 space-y-1.5">
                    <input
                      value={newSongYoutubeUrl}
                      onChange={(e) => setNewSongYoutubeUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=... (không nhận Shorts)"
                      className="w-full rounded-lg border border-stone-700 bg-stone-950 px-2.5 py-1.5 text-xs text-white placeholder:text-stone-500"
                    />
                    <input
                      value={newSongTitle}
                      onChange={(e) => setNewSongTitle(e.target.value)}
                      placeholder="Song title (optional if YouTube link)..."
                      className="w-full rounded-lg border border-stone-700 bg-stone-950 px-2.5 py-1.5 text-xs text-white placeholder:text-stone-500"
                    />
                    {setlistError && <p className="text-[10px] text-red-400">{setlistError}</p>}
                    <div className="flex gap-1.5">
                      <select
                        value={newSongYoutubeUrl.trim() ? 'PRERECORDED' : newSongMode}
                        disabled={Boolean(newSongYoutubeUrl.trim())}
                        onChange={(e) => setNewSongMode(e.target.value as 'LIVE' | 'PRERECORDED')}
                        className="flex-1 rounded-lg border border-stone-700 bg-stone-950 px-2 py-1 text-[11px]"
                      >
                        <option value="LIVE">Live</option>
                        <option value="PRERECORDED">Prerecorded</option>
                      </select>
                      <button
                        disabled={pendingAddSong}
                        className={`inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1 text-[11px] font-bold text-stone-950 transition-all duration-100 hover:bg-amber-400 active:scale-95 disabled:cursor-not-allowed ${
                          pendingAddSong ? 'ring-2 ring-amber-200/80' : ''
                        }`}
                      >
                        {pendingAddSong ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}{' '}
                        {pendingAddSong ? 'Adding...' : 'Add Track'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Invite Co-Performer (LMR-09) & Room Lock */}
              {token && (
                <div className="space-y-2 border-t border-stone-800 pt-3">
                  <div className="font-semibold text-stone-300">Stage & Room Controls</div>
                  <div className="flex gap-1.5">
                    <input
                      value={inviteUserId}
                      onChange={(e) => setInviteUserId(e.target.value)}
                      placeholder="User ID to invite..."
                      className="flex-1 rounded-lg border border-stone-700 bg-stone-950 px-2.5 py-1.5 text-[11px]"
                    />
                    <button
                      disabled={pendingInvite}
                      onClick={() => void handleInvitePerformer(inviteUserId)}
                      className={`inline-flex items-center gap-1 rounded-lg bg-stone-800 px-2.5 py-1 text-[11px] text-amber-300 transition-all duration-100 hover:bg-stone-700 active:scale-95 disabled:cursor-not-allowed ${
                        pendingInvite ? 'ring-2 ring-amber-300/70' : ''
                      }`}
                    >
                      {pendingInvite && <Loader2 className="h-3 w-3 animate-spin" />}
                      Invite
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      disabled={pendingRoomLock}
                      onClick={() => void handleToggleRoomLock()}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-lg border border-stone-700 bg-stone-950 py-1.5 text-[11px] text-stone-200 transition-all duration-100 hover:bg-stone-800 active:scale-95 disabled:cursor-not-allowed ${
                        pendingRoomLock ? 'ring-2 ring-amber-300/70' : ''
                      }`}
                    >
                      {pendingRoomLock ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : room.state === 'LOCKED' ? (
                        <Unlock className="h-3 w-3" />
                      ) : (
                        <Lock className="h-3 w-3" />
                      )}
                      {room.state === 'LOCKED' ? 'Unlock Room' : 'Lock Room'}
                    </button>
                    <button
                      disabled={Boolean(pendingTransport)}
                      onClick={() => handleConcertControl('COMPLETE')}
                      className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-700 py-1.5 text-[11px] font-semibold text-white transition-all duration-100 hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed ${
                        pendingTransport === 'COMPLETE' ? 'ring-2 ring-emerald-200/80' : pendingTransport ? 'opacity-50' : ''
                      }`}
                    >
                      {pendingTransport === 'COMPLETE' && <Loader2 className="h-3 w-3 animate-spin" />}
                      End Concert
                    </button>
                  </div>

                  {/* TBD-12: Host / Admin Seat Lock */}
                  {isHostOrAdmin && (
                    <div className="pt-2">
                      <div className="mb-1 text-[11px] font-semibold text-stone-400">Seat Locks (Host/Admin)</div>
                      <div className="flex flex-wrap gap-1">
                        {room.seats.slice(0, 10).map((s) => (
                          <button
                            key={s.id}
                            disabled={pendingSeatLockId === s.id}
                            onClick={() => void handleToggleSeatLock(s.id)}
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] transition active:scale-95 disabled:cursor-not-allowed ${
                              pendingSeatLockId === s.id ? 'ring-2 ring-amber-300/80' : ''
                            } ${
                              s.state === 'LOCKED'
                                ? 'bg-red-900/70 text-red-200'
                                : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                            }`}
                          >
                            {pendingSeatLockId === s.id && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                            {s.id}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </aside>
      )}

      {/* Safety / Copyright Report Modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <form onSubmit={handleReport} className="w-full max-w-sm rounded-2xl border border-stone-700 bg-stone-900 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">Submit Safety / Copyright Report</h3>
            <p className="mt-0.5 text-xs text-stone-400">Triaged by AI & reviewed by Host / Admin (SEC-04, SEC-11).</p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-400">Category</label>
                <select
                  value={reportCategory}
                  onChange={(e) => setReportCategory(e.target.value as ReportDTO['category'])}
                  className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-xs text-white"
                >
                  <option value="HARASSMENT">Harassment / Disruptive Behavior</option>
                  <option value="SPAM">Chat Spam</option>
                  <option value="COPYRIGHT">Copyright / Unauthorized Audio</option>
                  <option value="INAPPROPRIATE_CONTENT">Inappropriate Content</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-400">Target User (Optional)</label>
                <select
                  value={reportTargetId}
                  onChange={(e) => setReportTargetId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-xs text-white"
                >
                  <option value="">General Room Issue</option>
                  {participants
                    .filter((p) => p.userId !== effectiveUserId)
                    .map((p) => (
                      <option key={p.userId} value={p.userId}>
                        {p.displayName} ({p.role})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-400">Details</label>
                <textarea
                  required
                  rows={3}
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  placeholder="Describe the issue..."
                  className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 p-2.5 text-xs text-white"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="rounded-xl px-3.5 py-2 text-xs text-stone-300 hover:bg-stone-800"
              >
                Cancel
              </button>
              <button
                disabled={pendingReport}
                className={`inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed ${
                  pendingReport ? 'ring-2 ring-red-300/80' : ''
                }`}
              >
                {pendingReport && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {pendingReport ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
