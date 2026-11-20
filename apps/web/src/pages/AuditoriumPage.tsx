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
  X,
  GripVertical,
  Repeat1,
  ListOrdered,
  Maximize2,
  Minimize2,
  Upload,
  Film,
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
import { GrandPianoSimulator } from '../components/auditorium/GrandPianoSimulator';
import { MicActivityDot, PerformerMicPanel } from '../components/auditorium/PerformerMicPanel';
import { SyncedMediaPlayer } from '../components/auditorium/SyncedMediaPlayer';
import { realtimeStore } from '../realtime/realtimeStore';
import { useAuth } from '../state/authStore';
import { apiClient, resolveMediaUrl } from '../api/client';
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
  { id: 'KTV_PARTY', label: 'Karaoke Party Neon' },
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
  const navState = location.state as {
    seatId?: string;
    stagePosition?: [number, number, number];
    passcode?: string;
    performerInstrument?: InstrumentType;
  } | null;

  const [room, setRoom] = useState<RoomDTO | null>(realtimeStore.room);
  const [sidebarOpen, setSidebarOpen] = useState(true); // Collapsible panel (UX-04)
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'people' | 'playlist' | 'stage'>('chat');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState(realtimeStore.chat);
  const [lighting, setLighting] = useState(realtimeStore.lightingPreset);
  const [moderationNotice, setModerationNotice] = useState<string | null>(realtimeStore.moderationNotice);
  const [systemNotice, setSystemNotice] = useState<string | null>(realtimeStore.systemNotice);
  const [reconnecting, setReconnecting] = useState(realtimeStore.reconnecting);
  const [cameraMode, setCameraMode] = useState<CameraMode>('AUDIENCE_ORBIT');
  // Temporarily locked to LOW quality until further configuration
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>('LOW');
  const [perf, setPerf] = useState({ fps: 60, drawCalls: 0 });
  const [pingMs, setPingMs] = useState<number | null>(realtimeStore.pingMs);
  const [lowFpsStreak, setLowFpsStreak] = useState(0);

  // Audio & WebRTC state
  const [audienceMuted, setAudienceMuted] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [remoteAudioCount, setRemoteAudioCount] = useState(0);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [webrtcStats, setWebrtcStats] = useState<WebRtcDiagnostics | null>(null);
  const [midiDockOpen, setMidiDockOpen] = useState(false);
  const [djMixerOpen, setDjMixerOpen] = useState(false);
  const [roomInfoExpanded, setRoomInfoExpanded] = useState(true);
  const [deckAVolume, setDeckAVolume] = useState(100);
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
  const [queuedDeckBIdx, setQueuedDeckBIdx] = useState(1);
  const [atStageMic, setAtStageMic] = useState(false);
  const [micPanelOpen, setMicPanelOpen] = useState(false);
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
  const mediaElRef = useRef<HTMLMediaElement | null>(null);
  const mediaUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingUploadMedia, setPendingUploadMedia] = useState(false);
  const [inviteUserId, setInviteUserId] = useState('');

  // Report Modal
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<ReportDTO['category']>('HARASSMENT');
  const [reportTargetId, setReportTargetId] = useState('');
  const [reportText, setReportText] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [exitHostModalOpen, setExitHostModalOpen] = useState(false);
  const [selectedSuccessorHostId, setSelectedSuccessorHostId] = useState('');

  // Loading & anti-spam locks for action buttons
  type ReactionAction = 'CLAP' | 'CHEER' | 'WAVE' | 'DANCE' | 'DANCE_2' | 'DANCE_3' | 'DANCE_4' | 'DANCE_5' | 'FLOWER';
  type TransportAction = 'GO_LIVE' | 'PAUSE' | 'END_SONG' | 'NEXT_SONG' | 'TOGGLE_MODE' | 'COMPLETE';
  const [pendingReaction, setPendingReaction] = useState<ReactionAction | null>(null);
  const [pendingStand, setPendingStand] = useState(false);
  const [micPending, setMicPending] = useState(false);
  const [pendingTransport, setPendingTransport] = useState<TransportAction | null>(null);
  const [pendingAddSong, setPendingAddSong] = useState(false);
  const [pendingRemoveSongId, setPendingRemoveSongId] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState(false);
  const [pendingRoomLock, setPendingRoomLock] = useState(false);
  const [pendingSeatLockId, setPendingSeatLockId] = useState<string | null>(null);
  const [pendingReport, setPendingReport] = useState(false);
  const [pendingAudioUnlock, setPendingAudioUnlock] = useState(false);
  const [karaokeScoreCard, setKaraokeScoreCard] = useState<{ score: number; trackTitle?: string } | null>(null);
  const [passcodeModalOpen, setPasscodeModalOpen] = useState(false);
  const [passcodeEntry, setPasscodeEntry] = useState('');
  const [passcodeErr, setPasscodeErr] = useState<string | null>(null);
  const [dragTrackIdx, setDragTrackIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [fullscreenLyricsOpen, setFullscreenLyricsOpen] = useState(false);
  const [fullscreenSynced, setFullscreenSynced] = useState(false);
  const fullscreenIframeRef = useRef<HTMLIFrameElement | null>(null);
  const actionTimersRef = useRef<Set<number>>(new Set());
  const transportLockRef = useRef<{ action: TransportAction; startedAt: number } | null>(null);
  const lastScoreShownUntilRef = useRef(0);

  const scheduleActionTimeout = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      actionTimersRef.current.delete(id);
      fn();
    }, ms);
    actionTimersRef.current.add(id);
    return id;
  };

  const isPrivateRoom = Boolean(room?.isPrivate);
  const isKaraoke = room?.venueStyle === 'KARAOKE';
  const isPublicOpenRoom = Boolean(room && !room.isPrivate && (room.venueStyle === 'KARAOKE' || room.venueStyle === 'CHAMBER'));
  const isSoleRoomHost = Boolean(room?.concert.hostUserId && room.concert.hostUserId === effectiveUserId);
  const isAdmin = Boolean(user?.roles.includes('ADMIN')) || effectiveRole === 'ADMIN';
  const isHostOrAdmin = isPrivateRoom
    ? isSoleRoomHost || isAdmin
    : !isPublicOpenRoom &&
      (Boolean(user?.roles.includes('HOST') || user?.roles.includes('ADMIN')) ||
        effectiveRole === 'HOST' ||
        effectiveRole === 'ADMIN' ||
        isSoleRoomHost);
  const isPerformerOrHost =
    effectiveRole === 'ARTIST' ||
    isHostOrAdmin ||
    isSoleRoomHost ||
    Boolean(room?.concert.invitedPerformerIds.includes(effectiveUserId));
  const canUsePerformControls = isPerformerOrHost || isPublicOpenRoom;
  const canEditLighting = canUsePerformControls; // Host/Artist/Admin, or any participant in public Karaoke/Chamber mode

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
      if (realtimeStore.passcodeRequired) {
        setPasscodeModalOpen(true);
        setPasscodeErr(realtimeStore.passcodeError);
      } else {
        setPasscodeModalOpen(false);
        setPasscodeErr(null);
      }

      const kScore = realtimeStore.lastKaraokeScore;
      if (kScore && kScore.until > performance.now() && kScore.until !== lastScoreShownUntilRef.current) {
        lastScoreShownUntilRef.current = kScore.until;
        setKaraokeScoreCard({ score: kScore.score, trackTitle: kScore.trackTitle });
        scheduleActionTimeout(() => setKaraokeScoreCard(null), 6000);
      }

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
    const initialStagePosition = navState?.stagePosition;
    if (initialSeatId) {
      setTimeout(() => {
        realtimeStore.send({ type: 'OCCUPY_SEAT', seatId: initialSeatId });
      }, 400);
    } else if (initialStagePosition) {
      setTimeout(() => {
        const localAv = realtimeStore.avatars.get(effectiveUserId);
        if (localAv) {
          localAv.targetPosition = [...initialStagePosition];
          localAv.targetRotationY = 0;
          localAv.animation = 'STAND';
          localAv.seatId = undefined;
        }
        realtimeStore.sendMove(initialStagePosition, 0, 'STAND');
      }, 450);
    }

    const existingStream = audioEngine.getStream() ?? audioEngine.getPrerecordedStream();
    if (
      existingStream &&
      (effectiveRole === 'ARTIST' || effectiveRole === 'HOST' || effectiveRole === 'ADMIN' || Boolean(initialStagePosition))
    ) {
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
    if (
      reaction === 'DANCE' ||
      reaction === 'DANCE_2' ||
      reaction === 'DANCE_3' ||
      reaction === 'DANCE_4' ||
      reaction === 'DANCE_5'
    ) {
      const startedDance = realtimeStore.toggleDanceEmote(reaction);
      if (startedDance && cameraMode === 'SEAT_POV') {
        setCameraMode('AUDIENCE_ORBIT');
      }
    } else {
      realtimeStore.send({ type: 'REACTION_SEND', reaction });
    }
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
    const karaokeScore =
      action === 'END_SONG' && isKaraoke ? audioEngine.computeKaraokeScore() : undefined;
    if (action === 'END_SONG' && isKaraoke) {
      audioEngine.resetKaraokeVocalSession();
    }
    realtimeStore.send({ type: 'PERFORMER_CONCERT_CONTROL', action, karaokeScore });
    // Safety release if offline/disconnected so button never hangs
    scheduleActionTimeout(() => {
      if (transportLockRef.current?.action === action) {
        transportLockRef.current = null;
        setPendingTransport((cur) => (cur === action ? null : cur));
      }
    }, 1500);
  };

  const handlePerfSample = (fps: number, drawCalls: number) => {
    setPerf({ fps, drawCalls });
    // TBD-06: Step down quality gradually (HIGH -> MEDIUM -> LOW) only if FPS stays < 24 for 4 consecutive samples
    if (fps < 24 && qualityPreset !== 'LOW') {
      const nextStreak = lowFpsStreak + 1;
      setLowFpsStreak(nextStreak);
      if (nextStreak >= 4) {
        setQualityPreset((q) => (q === 'HIGH' ? 'MEDIUM' : 'LOW'));
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

  // Sample Mic vocal energy during live Karaoke songs for automatic end-of-song scoring
  useEffect(() => {
    if (!isKaraoke || room?.concert.state !== 'LIVE') return;
    audioEngine.resetKaraokeVocalSession();
    const id = window.setInterval(() => {
      audioEngine.sampleKaraokeVocalFrame();
    }, 250);
    return () => window.clearInterval(id);
  }, [isKaraoke, room?.concert.state, room?.concert.currentSetlistIndex]);

  const handleOpenPianoSimulator = async () => {
    if (room?.venueStyle !== 'CHAMBER') {
      setDjMixerOpen(false);
      setMidiDockOpen((v) => !v);
      return;
    }
    realtimeStore.stepOntoChamberStagePiano();
    setDjMixerOpen(false);
    const detected = await audioEngine.autoTrackPianoInputs(effectiveUserId, 'PIANO', (ev) => {
      realtimeStore.sendMidi(ev);
    });
    setMidiDockOpen(true);
    if (!detected.hasHardwareInput) {
      setSystemNotice(
        '🎹 Auto-Track: Không tìm thấy MIDI/Audio Input rời • Đã bật Bộ Nhạc Cụ Ảo Musicca trực tiếp trên bàn phím!'
      );
    } else {
      const names = [...detected.midiInputs, ...detected.externalAudioInputs].join(', ');
      setSystemNotice(`🎹 Auto-Track: Đã kết nối thiết bị Input (${names}) + Bộ Nhạc Cụ Ảo Musicca!`);
    }
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

  const handleUploadSetlistMedia = async (file: File) => {
    if (!roomId || !token || pendingUploadMedia) return;
    setSetlistError(null);
    if (file.size > 80 * 1024 * 1024) {
      setSetlistError('File tối đa 80MB.');
      return;
    }
    setPendingUploadMedia(true);
    try {
      const durationSec = await new Promise<number | undefined>((resolve) => {
        const isVid = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
        const probe = document.createElement(isVid ? 'video' : 'audio');
        const objUrl = URL.createObjectURL(file);
        const timer = window.setTimeout(() => {
          URL.revokeObjectURL(objUrl);
          resolve(undefined);
        }, 1200);
        probe.onloadedmetadata = () => {
          window.clearTimeout(timer);
          const d = Number.isFinite(probe.duration) ? Math.round(probe.duration) : undefined;
          URL.revokeObjectURL(objUrl);
          resolve(d);
        };
        probe.onerror = () => {
          window.clearTimeout(timer);
          URL.revokeObjectURL(objUrl);
          resolve(undefined);
        };
        probe.src = objUrl;
      });

      await apiClient.uploadSetlistMedia(roomId, file, newSongTitle, durationSec, token);
      setNewSongTitle('');
    } catch (err) {
      const msg = (err as Error).message;
      setSetlistError(
        msg === 'UNAUTHORIZED'
          ? 'Phiên đăng nhập đã hết hạn. Hãy bấm Sign In lại nhé!'
          : msg === 'UNSUPPORTED_MEDIA_FORMAT'
            ? 'Chỉ hỗ trợ MP3, WAV, OGG, M4A, AAC, FLAC, MP4, WEBM, MOV.'
            : msg
      );
    } finally {
      setPendingUploadMedia(false);
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
      if (mediaElRef.current && room) {
        const el = mediaElRef.current;
        const syncSec = realtimeStore.getSyncedPlaybackSec(room.concert);
        const dur = Number.isFinite(el.duration) && el.duration > 1 ? el.duration : 0;
        const target = dur > 1 ? syncSec % dur : syncSec;
        if (Math.abs(el.currentTime - target) > 1.5 && el.readyState >= 1) {
          el.currentTime = target;
        }
        el.muted = false;
        el.play().catch(() => {});
      }
      if (ytIframeRef.current?.contentWindow && room) {
        const syncSec = realtimeStore.getSyncedPlaybackSec(room.concert);
        const cap = audioEngine.getCaptureSettings();
        const targetVol = Math.min(100, Math.round((cap.musicVolume * deckAVolume) / 100));
        const shouldMuteMusic = cap.musicMuted || targetVol === 0;
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: shouldMuteMusic ? 'mute' : 'unMute', args: '' }),
          '*'
        );
        if (!shouldMuteMusic) {
          ytIframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'setVolume', args: [targetVol] }),
            '*'
          );
        }
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
  const currentMediaUrl = resolveMediaUrl(currentSong?.mediaUrl);
  const isCurrentVideoPlaying = Boolean(
    (currentSong?.youtubeVideoId || currentMediaUrl) &&
      (room?.concert.trackPlaying ?? (room?.concert.state !== 'PAUSED' && room?.concert.state !== 'COMPLETED'))
  );

  // Sync Fullscreen Karaoke Lyrics overlay iframe with room playback clock
  useEffect(() => {
    if (!fullscreenLyricsOpen || !isKaraoke) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreenLyricsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreenLyricsOpen, isKaraoke]);

  useEffect(() => {
    if (!fullscreenLyricsOpen || !isKaraoke || !currentSong?.youtubeVideoId || !room) {
      setFullscreenSynced(false);
      return;
    }
    const initialSec = realtimeStore.getSyncedPlaybackSec(room.concert);
    setFullscreenSynced(initialSec <= 1.5);
    let lastSeekAt = 0;

    const onMsg = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return;
      const win = fullscreenIframeRef.current?.contentWindow;
      if (!win || ev.source !== win) return;
      let parsed: { event?: string; info?: { currentTime?: number; playerState?: number; duration?: number } };
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (parsed?.event !== 'infoDelivery' || !parsed.info) return;
      if (typeof parsed.info.currentTime === 'number') {
        const latestConcert = realtimeStore.room?.concert ?? room.concert;
        const target = realtimeStore.getSyncedPlaybackSec(latestConcert);
        const dur = typeof parsed.info.duration === 'number' && parsed.info.duration > 1 ? parsed.info.duration : 0;
        const modTarget = dur > 1 ? target % dur : target;
        const diff = Math.abs(parsed.info.currentTime - modTarget);
        if (modTarget <= 1.5 || diff <= 2.5) {
          setFullscreenSynced(true);
        } else if (performance.now() - lastSeekAt > 700) {
          lastSeekAt = performance.now();
          win.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [modTarget, true] }), '*');
        }
      }
    };
    window.addEventListener('message', onMsg);

    const syncOverlay = () => {
      const win = fullscreenIframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage(JSON.stringify({ event: 'command', func: 'mute', args: '' }), '*');
      const sec = realtimeStore.getSyncedPlaybackSec(realtimeStore.room?.concert ?? room.concert);
      lastSeekAt = performance.now();
      win.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [sec, true] }), '*');
      win.postMessage(
        JSON.stringify({ event: 'command', func: isCurrentVideoPlaying ? 'playVideo' : 'pauseVideo', args: '' }),
        '*'
      );
    };
    syncOverlay();
    const id = window.setInterval(syncOverlay, 2500);
    return () => {
      window.removeEventListener('message', onMsg);
      clearInterval(id);
    };
  }, [
    fullscreenLyricsOpen,
    isKaraoke,
    currentSong?.youtubeVideoId,
    isCurrentVideoPlaying,
    room?.concert.trackStartedAtServerMs,
    room?.concert.currentSetlistIndex,
  ]);

  const isChamber = room?.venueStyle === 'CHAMBER';
  const participants = Array.from(realtimeStore.avatars.values());
  const localSeated = Boolean(realtimeStore.avatars.get(effectiveUserId)?.seatId);
  const localAnimation = realtimeStore.avatars.get(effectiveUserId)?.animation;
  const effectiveMusicVolume = Math.round((musicVolume * deckAVolume) / 100);

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-stone-950">
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
            mediaUrl={currentMediaUrl}
            mediaType={currentSong?.mediaType}
            isYouTubePlaying={Boolean(
              (currentSong?.youtubeVideoId || currentMediaUrl) &&
                (room.concert.trackPlaying ?? (room.concert.state !== 'PAUSED' && room.concert.state !== 'COMPLETED'))
            )}
            audienceMuted={audienceMuted}
            musicVolume={effectiveMusicVolume}
            musicMuted={musicMuted}
            canAutoAdvance={canUsePerformControls}
            onAutoAdvanceNext={(expectedIndex) =>
              realtimeStore.send({ type: 'PERFORMER_CONCERT_CONTROL', action: 'NEXT_SONG', expectedIndex })
            }
            onKaraokeSongEnded={
              isKaraoke
                ? (expectedIndex, shouldAutoAdvance) => {
                    const score = audioEngine.computeKaraokeScore();
                    audioEngine.resetKaraokeVocalSession();
                    realtimeStore.send({
                      type: 'PERFORMER_CONCERT_CONTROL',
                      action: 'END_SONG',
                      expectedIndex,
                      karaokeScore: score,
                    });
                    if (shouldAutoAdvance) {
                      scheduleActionTimeout(() => {
                        realtimeStore.send({
                          type: 'PERFORMER_CONCERT_CONTROL',
                          action: 'NEXT_SONG',
                          expectedIndex,
                        });
                      }, 6000);
                    }
                  }
                : undefined
            }
            karaokeScoreCard={isKaraoke ? karaokeScoreCard : null}
            ytIframeRef={ytIframeRef}
            mediaElRef={mediaElRef}
            onAutoplayBlocked={setAutoplayBlocked}
            onSelectSeat={(seatId) => {
              realtimeStore.send({ type: 'OCCUPY_SEAT', seatId });
              setAtStageMic(false);
              if (!isBroadcasting) setMicPanelOpen(false);
              if (cameraMode === 'KARAOKE_STAGE_POV') {
                setCameraMode('AUDIENCE_ORBIT');
              }
            }}
            onSelectKaraokeMic={(slot) => {
              realtimeStore.stepOntoKaraokeStageMic(slot);
              setCameraMode('KARAOKE_STAGE_POV');
              setAtStageMic(true);
            }}
            onSelectStageMic={() => {
              realtimeStore.stepOntoAuditoriumStageMic();
              setAtStageMic(true);
            }}
            onAtStageMicChange={(near) => {
              setAtStageMic(near);
              if (!near && !isBroadcasting) {
                setMicPanelOpen(false);
              }
            }}
            onSelectStagePiano={() => {
              if (isChamber) {
                void handleOpenPianoSimulator();
              }
            }}
            pianoKeyboardActive={isChamber && midiDockOpen}
            transitionVisual={transitionVisual}
            onPerfSample={handlePerfSample}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-stone-400">
            <Radio className="h-6 w-6 animate-pulse text-amber-400" />
            <span className="text-sm">Entering 3D Auditorium...</span>
          </div>
        )}

        {/* Synced Audio Playback for uploaded audio tracks (mp3, wav, ogg, m4a, flac) in all 3 rooms */}
        {room && !currentSong?.youtubeVideoId && currentMediaUrl && currentSong?.mediaType === 'AUDIO' && (
          <SyncedMediaPlayer
            mediaUrl={currentMediaUrl}
            mediaType="AUDIO"
            concert={room.concert}
            isPlaying={isCurrentVideoPlaying}
            isPausedState={room.concert.state === 'PAUSED' || room.concert.state === 'INTERMISSION'}
            muted={audienceMuted || musicMuted || effectiveMusicVolume === 0}
            volume={effectiveMusicVolume}
            venueStyle={room.venueStyle}
            canAutoAdvance={canUsePerformControls}
            onAutoAdvanceNext={(expectedIndex) =>
              realtimeStore.send({ type: 'PERFORMER_CONCERT_CONTROL', action: 'NEXT_SONG', expectedIndex })
            }
            onKaraokeSongEnded={
              isKaraoke
                ? (expectedIndex, shouldAutoAdvance) => {
                    const score = audioEngine.computeKaraokeScore();
                    audioEngine.resetKaraokeVocalSession();
                    realtimeStore.send({
                      type: 'PERFORMER_CONCERT_CONTROL',
                      action: 'END_SONG',
                      expectedIndex,
                      karaokeScore: score,
                    });
                    if (shouldAutoAdvance) {
                      scheduleActionTimeout(() => {
                        realtimeStore.send({
                          type: 'PERFORMER_CONCERT_CONTROL',
                          action: 'NEXT_SONG',
                          expectedIndex,
                        });
                      }, 6000);
                    }
                  }
                : undefined
            }
            onAutoplayBlocked={setAutoplayBlocked}
            mediaElementRef={mediaElRef}
          />
        )}

        {/* Fullscreen Karaoke Lyrics Video Overlay (KARAOKE only) */}
        {isKaraoke && fullscreenLyricsOpen && (
          <div className="pointer-events-auto absolute inset-0 z-[15] flex flex-col items-center justify-center bg-stone-950/95 p-4 pt-16 pb-20 backdrop-blur-md">
            <div className="relative h-full w-full max-w-6xl overflow-hidden rounded-2xl border border-fuchsia-500/40 bg-black shadow-2xl">
              {currentSong?.youtubeVideoId ? (
                <>
                  <iframe
                    key={currentSong.youtubeVideoId}
                    ref={fullscreenIframeRef}
                    onLoad={() => {
                      const win = fullscreenIframeRef.current?.contentWindow;
                      if (!win || !room) return;
                      win.postMessage(JSON.stringify({ event: 'listening' }), '*');
                      window.setTimeout(() => {
                        win.postMessage(JSON.stringify({ event: 'listening' }), '*');
                      }, 400);
                      win.postMessage(JSON.stringify({ event: 'command', func: 'mute', args: '' }), '*');
                      const sec = realtimeStore.getSyncedPlaybackSec(room.concert);
                      if (sec > 1.5) {
                        win.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [sec, true] }), '*');
                      } else {
                        setFullscreenSynced(true);
                      }
                      win.postMessage(
                        JSON.stringify({
                          event: 'command',
                          func: isCurrentVideoPlaying ? 'playVideo' : 'pauseVideo',
                          args: '',
                        }),
                        '*'
                      );
                    }}
                    title="Karaoke Fullscreen Lyrics"
                    src={`https://www.youtube.com/embed/${currentSong.youtubeVideoId}?autoplay=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&enablejsapi=1&mute=1`}
                    allow="autoplay; encrypted-media"
                    style={
                      transitionVisual?.active
                        ? {
                            opacity: transitionVisual.oldScreenOpacity,
                            filter: `brightness(${(0.2 + 0.8 * transitionVisual.oldScreenOpacity).toFixed(2)})`,
                          }
                        : undefined
                    }
                    className={`pointer-events-none h-full w-full border-0 transition-opacity duration-150 ${
                      fullscreenSynced || !isCurrentVideoPlaying ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                  {isCurrentVideoPlaying && !fullscreenSynced && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-stone-950/95">
                      <div className="h-9 w-9 animate-spin rounded-full border-2 border-fuchsia-400/30 border-t-fuchsia-400" />
                      <div className="text-sm font-semibold tracking-wider text-fuchsia-200/90">
                        Đang đồng bộ bài hát...
                      </div>
                    </div>
                  )}
                  {transitionVisual?.active &&
                    transitionVisual.targetVideoId &&
                    transitionVisual.targetVideoId !== currentSong.youtubeVideoId && (
                      <iframe
                        key={`incoming-${transitionVisual.targetVideoId}`}
                        title="Incoming Karaoke Track Preview"
                        src={`https://www.youtube.com/embed/${transitionVisual.targetVideoId}?autoplay=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&enablejsapi=1&mute=1`}
                        allow="autoplay; encrypted-media"
                        style={{
                          opacity: transitionVisual.newScreenOpacity,
                          filter: `brightness(${(0.25 + 0.75 * transitionVisual.newScreenOpacity).toFixed(2)})`,
                        }}
                        className="pointer-events-none absolute inset-0 z-10 h-full w-full border-0 transition-opacity duration-150"
                      />
                    )}
                  {!isCurrentVideoPlaying && !transitionVisual?.active && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45">
                      <span className="rounded-full border border-amber-400/50 bg-stone-950/90 px-5 py-2 text-sm font-bold text-amber-300 shadow-xl">
                        ⏸ ĐANG TẠM DỪNG NHẠC
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-stone-400">
                  <Youtube className="h-8 w-8 text-fuchsia-400" />
                  <span className="text-sm font-semibold">Chưa có video YouTube đang phát trong danh sách bài hát</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setFullscreenLyricsOpen(false)}
                className="absolute right-3 top-3 flex items-center gap-1.5 rounded-xl border border-fuchsia-400/50 bg-stone-950/85 px-3 py-1.5 text-xs font-bold text-fuchsia-200 shadow-lg backdrop-blur transition hover:bg-fuchsia-500 hover:text-stone-950"
              >
                <Minimize2 className="h-3.5 w-3.5" /> Thu nhỏ về phòng 3D (Esc)
              </button>
            </div>
          </div>
        )}

        {/* Minimal Top-Left Concert Status + Performance & WebRTC Telemetry (Horizontally Collapsible) */}
        <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-col items-start gap-1.5">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-2xl border border-stone-800/80 bg-stone-950/80 px-3 py-2 shadow-xl backdrop-blur-md transition-all duration-200">
            <button
              type="button"
              onClick={() => setRoomInfoExpanded((v) => !v)}
              title={roomInfoExpanded ? 'Thu gọn thông tin phòng' : 'Sổ ngang thông tin phòng'}
              className="flex items-center gap-2 text-left transition hover:opacity-90"
            >
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  room?.concert.state === 'LIVE' ? 'animate-pulse bg-red-500' : 'bg-emerald-400'
                }`}
              />
              {!roomInfoExpanded && room && (
                <span className="text-xs font-bold text-stone-200">
                  {room.venueStyle === 'CONCERT' ? '🎆' : room.venueStyle === 'KARAOKE' ? '🎤' : '🎻'}
                </span>
              )}
            </button>

            {roomInfoExpanded && (
              <>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    <span className="truncate">{room?.concert.title ?? 'Loading...'}</span>
                    {room && (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          room.venueStyle === 'CONCERT'
                            ? 'bg-fuchsia-500/20 text-fuchsia-300'
                            : room.venueStyle === 'KARAOKE'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {room.venueStyle === 'CONCERT'
                          ? '🎆 Concert'
                          : room.venueStyle === 'KARAOKE'
                            ? '🎤 Karaoke'
                            : '🎻 Thính phòng'}
                      </span>
                    )}
                    {room?.state === 'LOCKED' && <Lock className="h-3 w-3 shrink-0 text-amber-400" />}
                  </div>
                  <div className="truncate text-[11px] text-amber-300">
                    {room?.concert.state} • {currentSong ? currentSong.title : 'No song'}
                  </div>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setRoomInfoExpanded((v) => !v)}
              title={roomInfoExpanded ? 'Thu gọn ngang' : 'Sổ ngang thông tin phòng'}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-stone-700/80 bg-stone-900/90 text-stone-300 transition hover:border-amber-400/60 hover:bg-stone-800 hover:text-amber-300"
            >
              {roomInfoExpanded ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>

          {roomInfoExpanded && remoteAudioCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-950/70 px-2 py-1 font-mono text-[10px] font-semibold text-emerald-300">
                <Radio className="h-3 w-3 animate-pulse" />
                Live Audio {webrtcStats?.rttMs !== null && webrtcStats?.rttMs !== undefined ? `• RTT ${webrtcStats.rttMs}ms` : ''}
                {webrtcStats?.jitterMs !== null && webrtcStats?.jitterMs !== undefined ? ` • Jitter ${webrtcStats.jitterMs}ms` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Fun Entertainment Karaoke Score Card Celebration (auto-closes after 6s) */}
        {karaokeScoreCard && (
          <div className="pointer-events-auto absolute left-1/2 top-20 z-30 w-80 max-w-[92vw] -translate-x-1/2 rounded-2xl border border-fuchsia-400/60 bg-gradient-to-br from-fuchsia-950/95 via-stone-950/95 to-indigo-950/95 px-6 py-4 text-center shadow-2xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => setKaraokeScoreCard(null)}
              title="Đóng bảng điểm"
              className="absolute right-2.5 top-2.5 rounded-lg p-1 text-stone-400 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="text-[10px] font-bold uppercase tracking-widest text-fuchsia-300">
              🎤 Karaoke Score • Hạng{' '}
              {karaokeScoreCard.score >= 95
                ? 'S+'
                : karaokeScoreCard.score >= 90
                  ? 'S'
                  : karaokeScoreCard.score >= 82
                    ? 'A'
                    : 'B'}
            </div>
            <div className="mt-1 bg-gradient-to-r from-amber-300 via-pink-300 to-cyan-300 bg-clip-text text-4xl font-black text-transparent">
              {karaokeScoreCard.score} / 100
            </div>
            <div className="mt-1 text-xs font-semibold text-white">
              {karaokeScoreCard.score >= 95
                ? '🔥 Tuyệt đỉnh sân khấu! Cả phòng vỗ tay rần rần!'
                : karaokeScoreCard.score >= 90
                  ? '✨ Giọng hát cực cháy! Sân khấu bùng nổ!'
                  : karaokeScoreCard.score >= 82
                    ? '👏 Hát rất hay và đầy cảm xúc!'
                    : '🎶 Phong độ ổn định! Quẩy tiếp bài sau nào!'}
            </div>
            {karaokeScoreCard.trackTitle && (
              <div className="mt-1 truncate text-[10px] text-stone-400">
                {karaokeScoreCard.trackTitle}
              </div>
            )}
            <div className="mt-2 text-[9px] text-stone-500">Tự đóng sau 6 giây</div>
          </div>
        )}

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
        <div className="absolute right-4 top-4 z-20 flex flex-wrap items-center justify-end gap-2">
          {isKaraoke && (
            <button
              type="button"
              onClick={() => setFullscreenLyricsOpen((v) => !v)}
              title="Mở toàn màn hình Video đang phát để xem rõ lời Karaoke (Esc để đóng)"
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold backdrop-blur transition ${
                fullscreenLyricsOpen
                  ? 'border-fuchsia-400 bg-fuchsia-500/30 text-fuchsia-100 ring-2 ring-fuchsia-400/70'
                  : 'border-fuchsia-500/40 bg-stone-950/80 text-fuchsia-200 hover:bg-stone-800'
              }`}
            >
              {fullscreenLyricsOpen ? (
                <Minimize2 className="h-3.5 w-3.5 text-fuchsia-300" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5 text-fuchsia-400" />
              )}
              <span>{fullscreenLyricsOpen ? 'Thu nhỏ Video' : 'Xem lời Fullscreen'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setQualityPreset('LOW')}
            title="3D Quality: LOW (Tạm thời chỉ hỗ trợ mức Low)"
            className="rounded-xl border border-stone-700/80 bg-stone-950/80 px-2.5 py-1.5 font-mono text-[11px] text-stone-200 backdrop-blur transition"
          >
            3D:{qualityPreset}
          </button>

          <button
            onClick={() => {
              const nextMuted = !audienceMuted;
              setAudienceMuted(nextMuted);
              audioEngine.setRoomOutputMuted(nextMuted);
              webrtcAudio.setAudienceMuted(nextMuted);
              if (!nextMuted) {
                setAutoplayBlocked(false);
                void webrtcAudio.unlockPlayback();
                const cap = audioEngine.getCaptureSettings();
                const targetVol = Math.min(100, Math.round((cap.musicVolume * deckAVolume) / 100));
                const shouldMuteMusic = cap.musicMuted || targetVol === 0;
                ytIframeRef.current?.contentWindow?.postMessage(
                  JSON.stringify({ event: 'command', func: shouldMuteMusic ? 'mute' : 'unMute', args: '' }),
                  '*'
                );
                if (!shouldMuteMusic) {
                  ytIframeRef.current?.contentWindow?.postMessage(
                    JSON.stringify({ event: 'command', func: 'setVolume', args: [targetVol] }),
                    '*'
                  );
                }
              } else {
                ytIframeRef.current?.contentWindow?.postMessage(
                  JSON.stringify({ event: 'command', func: 'mute', args: '' }),
                  '*'
                );
              }
            }}
            title={audienceMuted ? 'Bật lại âm thanh phòng (chỉ riêng bạn)' : 'Tắt âm thanh phòng (chỉ riêng bạn)'}
            className="flex items-center gap-1.5 rounded-xl border border-stone-700/80 bg-stone-950/80 px-3 py-1.5 text-xs text-stone-200 backdrop-blur transition hover:bg-stone-800"
          >
            {audienceMuted ? <VolumeX className="h-3.5 w-3.5 text-red-400" /> : <Volume2 className="h-3.5 w-3.5 text-emerald-400" />}
            <span className="hidden sm:inline">{audienceMuted ? 'Muted' : 'Audio'}</span>
          </button>

          <button
            onClick={() =>
              setCameraMode((m) =>
                m === 'AUDIENCE_ORBIT'
                  ? 'STAGE_VIEW'
                  : m === 'STAGE_VIEW'
                    ? 'SEAT_POV'
                    : m === 'SEAT_POV'
                      ? 'ROOM_OVERVIEW'
                      : 'AUDIENCE_ORBIT'
              )
            }
            title="Chuyển góc nhìn (Khán giả / Sân khấu / Ghế ngồi / Toàn cảnh phòng)"
            className="flex items-center gap-1.5 rounded-xl border border-stone-700/80 bg-stone-950/80 px-3 py-1.5 text-xs text-stone-200 backdrop-blur transition hover:bg-stone-800"
          >
            <Camera className="h-3.5 w-3.5 text-amber-400" />
            {cameraMode === 'ROOM_OVERVIEW' ? 'Toàn cảnh phòng' : cameraMode.replace('_', ' ')}
          </button>

          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-1 rounded-xl border border-stone-700/80 bg-stone-950/80 px-2.5 py-1.5 text-xs text-stone-300 backdrop-blur transition hover:bg-stone-800"
          >
            <Flag className="h-3.5 w-3.5 text-red-400" /> Report
          </button>

          <button
            onClick={() => {
              const otherParticipants = participants.filter((p) => p.userId !== effectiveUserId);
              if (isPrivateRoom && isSoleRoomHost && otherParticipants.length > 0) {
                const preferred =
                  otherParticipants.find(
                    (p) => p.role === 'ARTIST' || room?.concert.invitedPerformerIds.includes(p.userId)
                  ) ?? otherParticipants[0];
                setSelectedSuccessorHostId(preferred.userId);
                setExitHostModalOpen(true);
                return;
              }
              navigate('/explore');
            }}
            className="flex items-center gap-1 rounded-xl border border-stone-700/80 bg-stone-950/80 px-2.5 py-1.5 text-xs text-stone-300 backdrop-blur transition hover:bg-stone-800"
          >
            <LogOut className="h-3.5 w-3.5" /> Exit
          </button>

          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-stone-950 shadow-md"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> More
            </button>
          )}
        </div>

        {/* Performer Mic & Self-Monitor / Stage Echo Control Panel */}
        {(canUsePerformControls || atStageMic || isBroadcasting) && (
          <PerformerMicPanel
            open={micPanelOpen}
            onClose={() => setMicPanelOpen(false)}
            isBroadcasting={isBroadcasting}
            micPending={micPending}
            onToggleBroadcast={handleToggleBroadcast}
            onNotice={setSystemNotice}
          />
        )}

        {/* Dual-Deck Transition Mixer (Concert & Karaoke only — not in Chamber) */}
        {canUsePerformControls && room && !isChamber && (
          <DualDeckMixer
            open={djMixerOpen}
            onClose={() => setDjMixerOpen(false)}
            setlist={room.concert.setlist}
            currentIndex={room.concert.currentSetlistIndex}
            queuedIndex={queuedDeckBIdx}
            onSelectQueuedIndex={setQueuedDeckBIdx}
            deckAVolume={deckAVolume}
            onDeckAVolumeChange={setDeckAVolume}
            onBeforeSwitchToDeckB={
              isKaraoke
                ? () => {
                    const score = audioEngine.computeKaraokeScore();
                    audioEngine.resetKaraokeVocalSession();
                    realtimeStore.send({
                      type: 'PERFORMER_CONCERT_CONTROL',
                      action: 'END_SONG',
                      karaokeScore: score,
                    });
                  }
                : undefined
            }
            onTransitionVisualChange={setTransitionVisual}
          />
        )}

        {/* Chamber/Opera ONLY: Musicca 5-Instrument Simulator + Auto-Tracked MIDI/Audio Input Console */}
        {isChamber ? (
          <GrandPianoSimulator
            open={midiDockOpen}
            onClose={() => setMidiDockOpen(false)}
            userId={effectiveUserId}
            instrument={instrument}
            venueTitle={room?.concert.title}
          />
        ) : (
          canUsePerformControls &&
          !isKaraoke &&
          midiDockOpen && (
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
          )
        )}

        {/* Separate Audience Reactions & Seat Dock (right side for Performers/Karaoke, bottom-center for Audience) */}
        <div
          className={
            canUsePerformControls
              ? 'absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1.5 rounded-2xl border border-stone-800/90 bg-stone-950/90 p-2 shadow-2xl'
              : 'absolute bottom-4 left-1/2 z-20 flex max-w-[95vw] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-stone-800/90 bg-stone-950/90 px-3.5 py-2 shadow-2xl'
          }
        >
          {canUsePerformControls && (
            <span className="pb-0.5 text-center text-[9px] font-bold uppercase tracking-wider text-stone-500">Emote</span>
          )}
          {(['CLAP', 'CHEER', 'WAVE', 'DANCE', 'DANCE_2', 'DANCE_3', 'DANCE_4', 'DANCE_5'] as const).map((r) => {
            const isLoading = pendingReaction === r;
            const isDanceButton =
              r === 'DANCE' || r === 'DANCE_2' || r === 'DANCE_3' || r === 'DANCE_4' || r === 'DANCE_5';
            const isActiveDance = isDanceButton && localAnimation === r;
            const otherLocked = Boolean(pendingReaction) && !isLoading;
            const reactionMeta: Record<typeof r, { emoji: string; label: string; stopLabel?: string }> = {
              CLAP: { emoji: '👏', label: 'CLAP' },
              CHEER: { emoji: '🙌', label: 'CHEER' },
              WAVE: { emoji: '👋', label: 'WAVE' },
              DANCE: { emoji: '💃', label: 'DANCE', stopLabel: 'Stop Dance' },
              DANCE_2: { emoji: '🕺', label: 'Dance 2', stopLabel: 'Stop Dance 2' },
              DANCE_3: { emoji: '🌀', label: 'Dance 3', stopLabel: 'Stop Dance 3' },
              DANCE_4: { emoji: '🪩', label: 'Dance 4', stopLabel: 'Stop Dance 4' },
              DANCE_5: { emoji: '🎶', label: 'Dance 5', stopLabel: 'Stop Dance 5' },
            };
            const { emoji, label: baseLabel, stopLabel } = reactionMeta[r];
            const label = isActiveDance && stopLabel ? stopLabel : baseLabel;
            return (
              <button
                key={r}
                disabled={Boolean(pendingReaction)}
                onClick={() => handleSendReaction(r)}
                title={isActiveDance ? 'Bấm để dừng nhảy (hoặc nhấn W/A/S/D hay chọn ghế)' : undefined}
                className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-100 active:scale-95 disabled:cursor-not-allowed ${
                  canUsePerformControls ? 'justify-start' : 'justify-center'
                } ${
                  isLoading
                    ? 'bg-amber-500/25 text-amber-200 ring-2 ring-amber-400/80'
                    : isActiveDance
                      ? 'bg-fuchsia-500/35 text-fuchsia-100 ring-2 ring-fuchsia-400/80 hover:bg-fuchsia-500/50'
                      : otherLocked
                        ? 'bg-stone-800/90 text-stone-200 opacity-50'
                        : 'bg-stone-800/90 text-stone-200 hover:bg-amber-500 hover:text-stone-950'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />
                ) : canUsePerformControls || isDanceButton ? (
                  <span>{emoji}</span>
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                <span>{label}</span>
              </button>
            );
          })}

          {/* TBD-16: Free Virtual Flower */}
          <button
            disabled={Boolean(pendingReaction)}
            onClick={() => handleSendReaction('FLOWER')}
            title="Send Free Virtual Flower (TBD-16)"
            className={`flex items-center gap-1.5 rounded-xl border border-pink-500/30 px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-100 active:scale-95 disabled:cursor-not-allowed ${
              canUsePerformControls ? 'justify-start' : 'justify-center'
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
                canUsePerformControls ? 'mt-0.5 justify-start border-t border-stone-800' : 'justify-center'
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
              canUsePerformControls
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
              {canUsePerformControls && (
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
              className={`${canUsePerformControls ? 'w-20' : 'w-16'} cursor-pointer accent-amber-400`}
            />
            {!canUsePerformControls && (
              <span className="w-7 text-right font-mono text-[10px] text-amber-300">
                {emoteMuted || emoteVolume === 0 ? 'OFF' : `${emoteVolume}%`}
              </span>
            )}
          </div>
        </div>

        {/* Dedicated Bottom-Center Performer & Stage Controls Bar (1 clean row, separated from Emotes) */}
        {(canUsePerformControls || atStageMic || isBroadcasting) && (
          <div className="absolute bottom-4 left-1/2 z-20 flex max-w-[94vw] -translate-x-1/2 items-center gap-1.5 overflow-x-auto whitespace-nowrap rounded-2xl border border-stone-800/90 bg-stone-950/90 px-3 py-2 shadow-2xl">
            {(atStageMic || isBroadcasting) && (
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
            )}

            {!isChamber && (
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
            )}

            {!isKaraoke && (
              <button
                type="button"
                onClick={() => {
                  if (midiDockOpen) {
                    setMidiDockOpen(false);
                  } else if (isChamber) {
                    void handleOpenPianoSimulator();
                  } else {
                    setDjMixerOpen(false);
                    setMidiDockOpen(true);
                  }
                }}
                title={
                  isChamber
                    ? 'Mở Bộ Nhạc Cụ Thính Phòng (Piano / Guitar / Bass / Violin / Drums + Auto-Track Input)'
                    : 'Mở phím MIDI nhanh'
                }
                className={`flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-100 active:scale-95 ${
                  midiDockOpen ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-200 hover:bg-stone-700'
                }`}
              >
                <Piano className="h-3.5 w-3.5" /> {isChamber ? 'Mở Piano' : 'MIDI'}
              </button>
            )}

            <span className="mx-0.5 h-5 w-px shrink-0 bg-stone-700/80" />

            {(() => {
              const isPlaying = room?.concert.state === 'LIVE';
              const isPaused =
                room?.concert.state === 'PAUSED' || room?.concert.state === 'INTERMISSION';
              const targetAction = isPlaying ? 'PAUSE' : 'GO_LIVE';
              const isLoading = pendingTransport === targetAction;
              return (
                <button
                  disabled={Boolean(pendingTransport)}
                  onClick={() => handleConcertControl(targetAction)}
                  title={isPlaying ? 'Tạm dừng nhạc (Pause)' : isPaused ? 'Phát tiếp nhạc (Resume)' : 'Bắt đầu phát (Live)'}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition-all duration-100 active:scale-95 disabled:cursor-not-allowed ${
                    isPlaying
                      ? 'bg-stone-800 text-amber-200 hover:bg-stone-700'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  } ${
                    isLoading
                      ? 'ring-2 ring-emerald-200/85'
                      : pendingTransport
                        ? 'opacity-50'
                        : ''
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="h-3 w-3" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}{' '}
                  {isPlaying ? 'Pause' : isPaused ? 'Resume' : 'Live'}
                </button>
              );
            })()}

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
              REC
            </button>
          </div>
        )}
      </div>

      {/* Collapsible Livestream Chat, Audience & Stage Control Panel */}
      {sidebarOpen && (
        <aside className="flex w-80 flex-col border-l border-stone-800/90 bg-stone-900/95 backdrop-blur-md">
          <div className="flex items-center justify-center border-b border-stone-800/80 bg-stone-950/80 px-2.5 py-1.5">
            <span className="flex items-center gap-2 rounded-lg bg-stone-900 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
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
          <div className="flex items-center gap-1.5 border-b border-stone-800 px-2.5 py-2">
            <button
              onClick={() => setSidebarOpen(false)}
              title="Thu gọn thanh bên"
              className="shrink-0 rounded-lg p-1 text-stone-400 hover:bg-stone-800 hover:text-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 flex-1 gap-0.5 rounded-lg bg-stone-950 p-0.5 text-[11px]">
              <button
                onClick={() => setSidebarTab('chat')}
                className={`flex items-center gap-1 rounded-md px-2 py-1 font-semibold transition ${
                  sidebarTab === 'chat' ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                <MessageSquare className="h-3 w-3 shrink-0" /> Chat
              </button>
              <button
                onClick={() => setSidebarTab('people')}
                className={`flex items-center gap-1 rounded-md px-2 py-1 font-semibold transition ${
                  sidebarTab === 'people' ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                <Users className="h-3 w-3 shrink-0" /> ({participants.length})
              </button>
              {canUsePerformControls && (
                <>
                  <button
                    onClick={() => setSidebarTab('playlist')}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 font-semibold transition ${
                      sidebarTab === 'playlist' ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <Music2 className="h-3 w-3 shrink-0" /> Playlist
                  </button>
                  <button
                    onClick={() => setSidebarTab('stage')}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 font-semibold transition ${
                      sidebarTab === 'stage' ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <Sliders className="h-3 w-3 shrink-0" /> Stage
                  </button>
                </>
              )}
            </div>
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
              {room && (
                <div
                  className={`rounded-xl border px-3 py-2 text-[11px] font-medium ${
                    isPublicOpenRoom
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                  }`}
                >
                  {isPublicOpenRoom ? (
                    <span>🔓 Phòng Public • Không cần Host (Tự do biểu diễn)</span>
                  ) : isPrivateRoom ? (
                    <span>
                      🔒 Phòng Private • Luôn có duy nhất 1 Host
                      {isSoleRoomHost ? ' (Bạn là Host)' : ''}
                    </span>
                  ) : (
                    <span>🎤 Phòng Concert • Điều phối bởi Nghệ sĩ / Host</span>
                  )}
                </div>
              )}

              {participants.map((p) => {
                const isParticipantSoleHost = Boolean(room?.concert.hostUserId && p.userId === room.concert.hostUserId);
                return (
                  <div
                    key={p.userId}
                    className="flex items-center justify-between gap-2 rounded-xl border border-stone-800/70 bg-stone-950/70 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate font-semibold text-stone-100">
                        <span className="truncate">
                          {p.displayName} {p.role === 'ARTIST' ? '★' : ''}
                        </span>
                        {isParticipantSoleHost && (
                          <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                            👑 Host
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-stone-400">
                        {p.role} {p.seatId ? `• Seat ${p.seatId}` : '• Aisle'}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {isPrivateRoom && (isSoleRoomHost || isAdmin) && !isParticipantSoleHost && (
                        <button
                          type="button"
                          onClick={() => realtimeStore.send({ type: 'TRANSFER_HOST', targetUserId: p.userId })}
                          title="Chuyển quyền Host duy nhất cho người này"
                          className="rounded bg-amber-500/20 px-2 py-1 text-[10px] font-semibold text-amber-300 transition hover:bg-amber-500 hover:text-stone-950"
                        >
                          👑 Chuyển Host
                        </button>
                      )}
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
                );
              })}
            </div>
          )}

          {sidebarTab === 'playlist' && canUsePerformControls && room && (
            <div className="flex-1 space-y-3 overflow-y-auto p-3 text-xs">
              {/* Current & Next Track Banner merged at top of Playlist tab */}
              <div className="flex items-start gap-2 rounded-xl border border-emerald-500/35 bg-stone-900/80 px-2.5 py-2 text-[11px] text-stone-200">
                <Music2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="truncate">
                    <span className="font-semibold text-emerald-300">Đang hát:</span>{' '}
                    <span className="font-medium text-white">{currentSong?.title ?? 'Chưa có bài'}</span>
                  </div>
                  {room.concert.setlist.length > 1 && (
                    <div className="truncate text-stone-400">
                      <strong className="text-amber-300">Tiếp theo:</strong>{' '}
                      {room.concert.setlist[(room.concert.currentSetlistIndex + 1) % room.concert.setlist.length]?.title}
                    </div>
                  )}
                </div>
              </div>

              {/* Editable Setlist + Playback Mode + Drag & Drop Reorder (SM-08) */}
              <div>
                <div className="mb-2 flex items-center justify-between">
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

                {/* Playback Mode Selector: Repeat 1 Track vs Queue Next */}
                <div className="mb-2.5 grid grid-cols-2 gap-1 rounded-lg border border-stone-800 bg-stone-950 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setRoom((prev) =>
                        prev ? { ...prev, concert: { ...prev.concert, playbackMode: 'REPEAT_ONE' } } : prev
                      );
                      realtimeStore.send({ type: 'SET_PLAYBACK_MODE', mode: 'REPEAT_ONE' });
                    }}
                    title="Lặp lại liên tục bài đang phát hiện tại"
                    className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                      (room.concert.playbackMode ?? 'REPEAT_ONE') === 'REPEAT_ONE'
                        ? 'bg-amber-500 text-stone-950 shadow'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <Repeat1 className="h-3 w-3" /> Lặp lại bài này
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRoom((prev) =>
                        prev ? { ...prev, concert: { ...prev.concert, playbackMode: 'QUEUE_NEXT' } } : prev
                      );
                      realtimeStore.send({ type: 'SET_PLAYBACK_MODE', mode: 'QUEUE_NEXT' });
                    }}
                    title="Hết bài tự động phát tiếp bài kế tiếp trong danh sách"
                    className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                      room.concert.playbackMode === 'QUEUE_NEXT'
                        ? 'bg-emerald-500 text-stone-950 shadow'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <ListOrdered className="h-3 w-3" /> Hàng đợi (Tiếp)
                  </button>
                </div>

                <div className="mb-1.5 text-[10px] text-stone-500">
                  Kéo thả thẻ bài (⋮⋮) để đổi thứ tự phát trong danh sách
                </div>

                <div className="space-y-1.5">
                  {room.concert.setlist.map((item, idx) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => {
                        setDragTrackIdx(idx);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverIdx !== idx) setDragOverIdx(idx);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragTrackIdx === null || dragTrackIdx === idx) {
                          setDragTrackIdx(null);
                          setDragOverIdx(null);
                          return;
                        }
                        const list = [...room.concert.setlist];
                        const activeId = list[room.concert.currentSetlistIndex]?.id;
                        const [moved] = list.splice(dragTrackIdx, 1);
                        list.splice(idx, 0, moved);
                        const nextActiveIdx = activeId ? Math.max(0, list.findIndex((s) => s.id === activeId)) : 0;
                        setRoom((prev) =>
                          prev
                            ? {
                                ...prev,
                                concert: {
                                  ...prev.concert,
                                  setlist: list,
                                  currentSetlistIndex: nextActiveIdx,
                                },
                              }
                            : prev
                        );
                        realtimeStore.send({ type: 'REORDER_SETLIST', orderedIds: list.map((s) => s.id) });
                        setDragTrackIdx(null);
                        setDragOverIdx(null);
                      }}
                      onDragEnd={() => {
                        setDragTrackIdx(null);
                        setDragOverIdx(null);
                      }}
                      className={`flex cursor-grab items-center justify-between gap-1 rounded-lg border px-2 py-1.5 transition active:cursor-grabbing ${
                        dragOverIdx === idx && dragTrackIdx !== idx
                          ? 'border-sky-400 bg-sky-500/15 ring-1 ring-sky-400/50'
                          : idx === room.concert.currentSetlistIndex
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                            : 'border-stone-800 bg-stone-950 text-stone-300'
                      } ${dragTrackIdx === idx ? 'opacity-50' : ''}`}
                    >
                      <span title="Kéo thả để sắp xếp thứ tự" className="shrink-0 text-stone-500">
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                      <button
                        type="button"
                        onClick={() => realtimeStore.send({ type: 'SELECT_SETLIST_ITEM', index: idx })}
                        title="Play this track now"
                        className="min-w-0 flex-1 pr-1 text-left"
                      >
                        <div className="flex items-center gap-1 truncate font-medium">
                          {item.youtubeVideoId && <Youtube className="h-3 w-3 shrink-0 text-red-400" />}
                          {!item.youtubeVideoId && item.mediaUrl && (
                            item.mediaType === 'VIDEO' ? (
                              <Film className="h-3 w-3 shrink-0 text-sky-400" />
                            ) : (
                              <Music2 className="h-3 w-3 shrink-0 text-emerald-400" />
                            )
                          )}
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

                {token ? (
                  <form onSubmit={handleAddSong} className="mt-3 space-y-1.5 border-t border-stone-800 pt-3">
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
                    <div className="pt-1">
                      <input
                        ref={mediaUploadInputRef}
                        type="file"
                        accept=".mp3,.wav,.ogg,.m4a,.aac,.flac,.mp4,.webm,.mov,audio/*,video/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) void handleUploadSetlistMedia(file);
                        }}
                      />
                      <button
                        type="button"
                        disabled={pendingUploadMedia}
                        onClick={() => mediaUploadInputRef.current?.click()}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-[11px] font-semibold text-stone-200 transition hover:border-amber-400/60 hover:bg-stone-800 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {pendingUploadMedia ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                        ) : (
                          <Upload className="h-3.5 w-3.5 text-amber-400" />
                        )}
                        {pendingUploadMedia ? 'Đang tải file lên...' : 'Tải file nhạc / video (MP3, MP4, WAV...)'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="mt-3 rounded-lg border border-stone-800 bg-stone-950/70 p-2.5 text-[11px] text-stone-400">
                    Bạn có thể bấm chọn bài ở trên để phát/chuyển bài ngay;{' '}
                    <button type="button" onClick={() => navigate('/auth')} className="font-semibold text-amber-400 underline">
                      Sign In
                    </button>{' '}
                    để thêm hoặc xóa bài khỏi Playlist.
                  </p>
                )}
              </div>
            </div>
          )}

          {sidebarTab === 'stage' && canUsePerformControls && room && (
            <div className="flex-1 space-y-4 overflow-y-auto p-3 text-xs">
              {/* Lighting Script Cue (SM-07: Host, Artist, Admin, or any Karaoke singer) */}
              {canEditLighting && (
                <div>
                  <div className="mb-1.5 font-semibold text-stone-300">Lighting Script Cue (SM-07)</div>
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

              {/* Invite Co-Performer (LMR-09) & Room Lock (Host / Admin / Room Owner only) */}
              {token && isPerformerOrHost && (
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

      {/* Host Exit Transfer Modal (Private Room: Host chooses successor before leaving) */}
      {exitHostModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/45 bg-stone-900 p-6 shadow-2xl">
            <h3 className="flex items-center gap-2 text-base font-bold text-white">
              👑 Chọn người nhận quyền Host trước khi rời phòng
            </h3>
            <p className="mt-1 text-xs text-stone-400">
              Phòng Private luôn cần duy nhất 1 Host. Hãy chọn một thành viên đang có mặt trong phòng để bàn giao quyền Host:
            </p>

            <div className="mt-4 max-h-60 space-y-2 overflow-y-auto pr-1">
              {participants
                .filter((p) => p.userId !== effectiveUserId)
                .map((p) => {
                  const isPerformer = p.role === 'ARTIST' || room?.concert.invitedPerformerIds.includes(p.userId);
                  const selected = selectedSuccessorHostId === p.userId;
                  return (
                    <button
                      key={p.userId}
                      type="button"
                      onClick={() => setSelectedSuccessorHostId(p.userId)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs transition ${
                        selected
                          ? 'border-amber-400 bg-amber-500/20 text-white ring-1 ring-amber-400'
                          : 'border-stone-800 bg-stone-950 text-stone-300 hover:border-stone-600'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-bold">
                          {p.displayName} {isPerformer ? '★' : ''}
                        </div>
                        <div className="text-[10px] text-stone-400">
                          {isPerformer ? 'Performer (Ưu tiên)' : p.role} {p.seatId ? `• Seat ${p.seatId}` : '• Aisle'}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          selected ? 'bg-amber-400 text-stone-950' : 'bg-stone-800 text-stone-400'
                        }`}
                      >
                        {selected ? 'Đã chọn' : 'Chọn'}
                      </span>
                    </button>
                  );
                })}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setExitHostModalOpen(false)}
                className="rounded-xl px-3.5 py-2 text-xs text-stone-300 hover:bg-stone-800"
              >
                Ở lại phòng
              </button>
              <button
                type="button"
                disabled={!selectedSuccessorHostId}
                onClick={() => {
                  if (!selectedSuccessorHostId) return;
                  realtimeStore.send({ type: 'TRANSFER_HOST', targetUserId: selectedSuccessorHostId });
                  setExitHostModalOpen(false);
                  window.setTimeout(() => {
                    navigate('/explore');
                  }, 120);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-stone-950 transition hover:bg-amber-400 disabled:opacity-50"
              >
                👑 Chuyển Host &amp; Rời phòng
              </button>
            </div>
          </div>
        </div>
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

      {/* Passcode Entry Modal when joining a passcode-locked Karaoke / Private room directly */}
      {passcodeModalOpen && roomId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              realtimeStore.connect({
                roomId,
                userId: effectiveUserId,
                displayName: effectiveName,
                role: effectiveRole,
                avatarPresetId: effectiveAvatar,
                passcode: passcodeEntry,
              });
            }}
            className="w-full max-w-xs rounded-2xl border border-amber-500/40 bg-stone-900 p-6 shadow-2xl"
          >
            <h3 className="flex items-center gap-2 text-base font-bold text-white">
              <Lock className="h-4 w-4 text-amber-400" /> Nhập mật khẩu phòng
            </h3>
            <p className="mt-1 text-xs text-stone-400">Phòng này được khóa bằng Passcode.</p>
            <input
              autoFocus
              required
              value={passcodeEntry}
              onChange={(e) => setPasscodeEntry(e.target.value)}
              placeholder="Nhập Passcode..."
              className="mt-3 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-white focus:border-amber-500/60 focus:outline-none"
            />
            {passcodeErr && <p className="mt-2 text-xs text-red-400">{passcodeErr}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => navigate('/explore')}
                className="rounded-xl px-3 py-2 text-xs text-stone-400 hover:bg-stone-800"
              >
                Thoát
              </button>
              <button className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-stone-950 hover:bg-amber-400">
                Vào phòng
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
