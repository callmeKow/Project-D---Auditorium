import type {
  AvatarAnimationState,
  AvatarPresetId,
  AvatarTransformPayload,
  ChatMessageDTO,
  ConcertDTO,
  LightingPreset,
  MidiNoteEventPayload,
  ReactionType,
  RealtimeClientMessage,
  RealtimeServerMessage,
  RoomDTO,
  UserRole,
} from '@vmw/contracts';
import { audioEngine } from '../audio/audioEngine';

/**
 * High-frequency 3D runtime & multiplayer store.
 * Intentionally kept OUTSIDE React/Redux global state per AGENTS.md Section 4.
 */
export interface AvatarRuntimeEntry extends AvatarTransformPayload {
  targetPosition: [number, number, number];
  targetRotationY: number;
  lastMidiAt: number;
  lastReaction?: ReactionType;
  reactionUntil: number;
  flowerBurstAt: number;
  flowerBurstUntil: number;
  pointScore?: number;
  pointAt?: number;
  pointUntil?: number;
}

type Listener = () => void;

interface ConnectParams {
  roomId: string;
  userId: string;
  displayName: string;
  role: UserRole;
  avatarPresetId: AvatarPresetId;
  passcode?: string;
}

class RealtimeRoomStore {
  private ws: WebSocket | null = null;
  public avatars = new Map<string, AvatarRuntimeEntry>();
  public room: RoomDTO | null = null;
  public chat: ChatMessageDTO[] = [];
  public lightingPreset: LightingPreset = 'WARM_CHAMBER';
  public applauseUntil = 0;
  public lastKaraokeScore: { score: number; until: number; trackTitle?: string } | null = null;
  public passcodeRequired = false;
  public passcodeError: string | null = null;
  public connected = false;
  public reconnecting = false;
  public reconnectAttempt = 0;
  public pingMs: number | null = null;
  public serverClockOffsetMs = 0;
  public lastMidiLatencyMs: number | null = null;
  public moderationNotice: string | null = null;
  public systemNotice: string | null = null;
  private ignoreNextLeaveSeatEchoUntil = 0;

  private listeners = new Set<Listener>();
  private signalHandler: ((fromUserId: string, channel: 'CONCERT' | 'PERFORMER_TALKBACK', signal: unknown) => void) | null = null;
  private peerChangeHandler: ((type: 'JOIN' | 'LEAVE', userId: string) => void) | null = null;
  private seq = 0;
  private lastConnectParams: ConnectParams | null = null;
  private manualDisconnect = false;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;

  setSignalHandler(
    handler: ((fromUserId: string, channel: 'CONCERT' | 'PERFORMER_TALKBACK', signal: unknown) => void) | null
  ) {
    this.signalHandler = handler;
  }

  setPeerChangeHandler(handler: ((type: 'JOIN' | 'LEAVE', userId: string) => void) | null) {
    this.peerChangeHandler = handler;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  connect(params: ConnectParams) {
    this.manualDisconnect = false;
    this.lastConnectParams = params;
    this.openSocket(params);
  }

  private openSocket(params: ConnectParams) {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = import.meta.env.VITE_WS_URL || `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.reconnecting = false;
      this.reconnectAttempt = 0;
      this.send({ type: 'JOIN_ROOM', ...params });
      this.send({ type: 'PING', clientSentAt: performance.now() });
      if (this.pingTimer !== null) clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => {
        this.send({ type: 'PING', clientSentAt: performance.now() });
      }, 2000);
      this.emit();
    };

    ws.onmessage = (ev) => {
      let msg: RealtimeServerMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'ROOM_SNAPSHOT': {
          if (msg.serverTime) {
            this.serverClockOffsetMs = msg.serverTime - Date.now();
          }
          this.passcodeRequired = false;
          this.passcodeError = null;
          this.room = msg.room;
          this.chat = msg.chat;
          this.avatars.clear();
          for (const av of msg.avatars) {
            this.avatars.set(av.userId, {
              ...av,
              targetPosition: [...av.position],
              targetRotationY: av.rotationY,
              lastMidiAt: 0,
              reactionUntil: 0,
              flowerBurstAt: 0,
              flowerBurstUntil: 0,
            });
          }
          const current = msg.room.concert.setlist[msg.room.concert.currentSetlistIndex];
          if (current) this.lightingPreset = current.lightingPreset;
          this.emit();
          break;
        }

        case 'ROOM_STATE_UPDATED': {
          if (this.room) {
            this.room.state = msg.roomState;
            this.emit();
          }
          break;
        }

        case 'AVATAR_STATE': {
          const existing = this.avatars.get(msg.avatar.userId);
          if (existing) {
            const isLocal = msg.avatar.userId === this.lastConnectParams?.userId;
            const isLocalEchoResetFromDance =
              isLocal &&
              msg.avatar.animation === 'STAND' &&
              (existing.animation === 'DANCE' ||
                existing.animation === 'DANCE_2' ||
                existing.animation === 'DANCE_3' ||
                existing.animation === 'DANCE_4' ||
                existing.animation === 'DANCE_5' ||
                performance.now() < this.ignoreNextLeaveSeatEchoUntil);
            const localAnimChanged =
              isLocal && !isLocalEchoResetFromDance && existing.animation !== msg.avatar.animation;
            if (!isLocalEchoResetFromDance) {
              existing.targetPosition = [...msg.avatar.position];
              existing.targetRotationY = msg.avatar.rotationY;
              existing.animation = msg.avatar.animation;
            }
            existing.seatId = msg.avatar.seatId;
            existing.seq = msg.avatar.seq;
            if (localAnimChanged) {
              this.emit();
            }
          } else {
            this.avatars.set(msg.avatar.userId, {
              ...msg.avatar,
              targetPosition: [...msg.avatar.position],
              targetRotationY: msg.avatar.rotationY,
              lastMidiAt: 0,
              reactionUntil: 0,
              flowerBurstAt: 0,
              flowerBurstUntil: 0,
            });
            this.peerChangeHandler?.('JOIN', msg.avatar.userId);
            this.emit();
          }
          // Intentionally DO NOT call this.emit() on transform updates!
          // R3F useFrame reads `this.avatars` directly at 60fps.
          break;
        }

        case 'AVATAR_LEFT': {
          this.avatars.delete(msg.userId);
          this.peerChangeHandler?.('LEAVE', msg.userId);
          this.emit();
          break;
        }

        case 'SEAT_UPDATED': {
          if (this.room) {
            const idx = this.room.seats.findIndex((s) => s.id === msg.seat.id);
            if (idx >= 0) this.room.seats[idx] = msg.seat;
            this.emit();
          }
          break;
        }

        case 'CONCERT_STATE_UPDATED': {
          if (this.room) {
            this.room.concert = msg.concert;
            if (msg.fallbackNotice) {
              this.systemNotice = msg.fallbackNotice;
            }
            this.emit();
          }
          break;
        }

        case 'CHAT_MESSAGE': {
          this.chat = [...this.chat.slice(-99), msg.message];
          this.emit();
          break;
        }

        case 'REACTION': {
          const av = this.avatars.get(msg.userId);
          if (av) {
            const now = performance.now();
            av.lastReaction = msg.reaction;
            av.reactionUntil = now + 2500;
            av.animation = msg.reaction === 'FLOWER' ? 'CHEER' : msg.reaction;
            if (msg.reaction === 'FLOWER' && now - av.flowerBurstAt > 250) {
              av.flowerBurstAt = now;
              av.flowerBurstUntil = now + 2400;
            }
          }
          if (msg.userId !== this.lastConnectParams?.userId) {
            audioEngine.playReactionSound(msg.reaction);
          }
          if (msg.reaction === 'FLOWER') {
            this.systemNotice = `🌸 ${msg.displayName ?? 'Audience'} sent a free Virtual Flower to the stage!`;
            this.emit();
          }
          break;
        }

        case 'SONG_ENDED_APPLAUSE': {
          this.applauseUntil = performance.now() + 4000;
          if (typeof msg.karaokeScore === 'number') {
            const currentTitle = this.room?.concert.setlist[this.room.concert.currentSetlistIndex]?.title;
            this.lastKaraokeScore = {
              score: msg.karaokeScore,
              until: performance.now() + 6000,
              trackTitle: currentTitle,
            };
          }
          for (const av of this.avatars.values()) {
            if (av.role !== 'ARTIST') av.animation = 'CLAP';
          }
          audioEngine.playReactionSound('APPLAUSE');
          this.emit();
          break;
        }

        case 'POINT_CARD': {
          const av = this.avatars.get(msg.userId);
          if (av) {
            const now = performance.now();
            av.pointScore = msg.score;
            av.pointAt = now;
            av.pointUntil = now + 5000;
            // Raise arm to hold up the score paddle unless actively dancing
            if (
              av.animation !== 'DANCE' &&
              av.animation !== 'DANCE_2' &&
              av.animation !== 'DANCE_3' &&
              av.animation !== 'DANCE_4' &&
              av.animation !== 'DANCE_5'
            ) {
              av.animation = 'WAVE';
              av.lastReaction = 'WAVE';
              av.reactionUntil = now + 2600;
            }
          }
          audioEngine.playReactionSound(msg.score >= 9 ? 'CHEER' : 'CLAP');
          this.emit();
          break;
        }

        case 'LIGHTING_CUE': {
          this.lightingPreset = msg.preset;
          this.emit();
          break;
        }

        case 'AUDIO_TIMING_MIDI': {
          const av = this.avatars.get(msg.event.userId);
          if (av) {
            av.lastMidiAt = performance.now();
            av.animation =
              msg.event.instrument === 'GUITAR' || msg.event.instrument === 'BASS'
                ? 'PLAY_GUITAR'
                : msg.event.instrument === 'VIOLIN' || msg.event.instrument === 'CELLO'
                  ? 'PLAY_VIOLIN'
                  : msg.event.instrument === 'DRUMS'
                    ? 'PLAY_DRUMS'
                    : 'PLAY_PIANO';
          }
          if (msg.event.userId !== this.lastConnectParams?.userId) {
            if (msg.event.isNoteOn) {
              audioEngine.playInstrumentNoteOn(msg.event.instrument, msg.event.note, msg.event.velocity);
            } else {
              audioEngine.playInstrumentNoteOff(msg.event.instrument, msg.event.note);
            }
          }
          break;
        }

        case 'MODERATION_ACTION': {
          this.moderationNotice = `${msg.action}: ${msg.reason}`;
          if (msg.action === 'KICK' || msg.action === 'BAN') {
            this.manualDisconnect = true;
          }
          this.emit();
          break;
        }

        case 'WEBRTC_SIGNAL': {
          this.signalHandler?.(msg.fromUserId, msg.channel ?? 'CONCERT', msg.signal);
          break;
        }

        case 'PONG': {
          const rtt = Math.max(1, Math.round(performance.now() - msg.clientSentAt));
          this.pingMs = rtt;
          this.serverClockOffsetMs = msg.serverTime - (Date.now() - rtt / 2);
          this.emit();
          break;
        }
      }
    };

    ws.onclose = (ev) => {
      this.connected = false;
      this.pingMs = null;
      if (this.pingTimer !== null) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      if (ev.code === 4006) {
        this.passcodeRequired = true;
        this.passcodeError = 'Phòng yêu cầu mật khẩu hoặc mật khẩu chưa đúng.';
        this.reconnecting = false;
        this.emit();
        return;
      }
      if (!this.manualDisconnect && this.lastConnectParams && this.reconnectAttempt < 5) {
        this.reconnecting = true;
        this.reconnectAttempt += 1;
        const delayMs = Math.min(8000, 1000 * Math.pow(2, this.reconnectAttempt - 1));
        this.emit();
        this.reconnectTimer = window.setTimeout(() => {
          if (this.lastConnectParams && !this.manualDisconnect) {
            this.openSocket(this.lastConnectParams);
          }
        }, delayMs);
      } else {
        this.reconnecting = false;
        this.emit();
      }
    };
  }

  send(msg: RealtimeClientMessage) {
    if (msg.type === 'REACTION_SEND') {
      audioEngine.playReactionSound(msg.reaction);
      if (this.lastConnectParams) {
        const localAv = this.avatars.get(this.lastConnectParams.userId);
        if (localAv) {
          const wasDancing =
            localAv.animation === 'DANCE' ||
            localAv.animation === 'DANCE_2' ||
            localAv.animation === 'DANCE_3' ||
            localAv.animation === 'DANCE_4' ||
            localAv.animation === 'DANCE_5';
          const now = performance.now();
          localAv.lastReaction = msg.reaction;
          localAv.reactionUntil = now + 2500;
          localAv.animation = msg.reaction === 'FLOWER' ? 'CHEER' : msg.reaction;
          if (msg.reaction === 'FLOWER') {
            localAv.flowerBurstAt = now;
            localAv.flowerBurstUntil = now + 2400;
          }
          if (
            wasDancing &&
            msg.reaction !== 'DANCE' &&
            msg.reaction !== 'DANCE_2' &&
            msg.reaction !== 'DANCE_3' &&
            msg.reaction !== 'DANCE_4' &&
            msg.reaction !== 'DANCE_5'
          ) {
            this.emit();
          }
        }
      }
    }
    if (msg.type === 'OCCUPY_SEAT' && this.lastConnectParams && this.room) {
      const userId = this.lastConnectParams.userId;
      const seat = this.room.seats.find((s) => s.id === msg.seatId);
      const localAv = this.avatars.get(userId);
      if (seat && (seat.state === 'AVAILABLE' || seat.occupiedByUserId === userId || seat.heldByUserId === userId)) {
        for (const s of this.room.seats) {
          if (s.occupiedByUserId === userId && s.id !== seat.id) {
            s.occupiedByUserId = undefined;
            if (s.state === 'OCCUPIED') s.state = 'AVAILABLE';
          }
        }
        seat.state = 'OCCUPIED';
        seat.occupiedByUserId = userId;
        if (localAv) {
          localAv.seatId = seat.id;
          localAv.targetPosition = [...seat.position];
          localAv.targetRotationY =
            this.room.venueStyle === 'KARAOKE'
              ? seat.row === 'L'
                ? Math.PI * 0.65
                : seat.row === 'R'
                  ? -Math.PI * 0.65
                  : Math.PI
              : Math.PI;
          localAv.animation = 'SIT';
        }
        this.emit();
      }
    }
    if (msg.type === 'LEAVE_SEAT' && this.lastConnectParams) {
      const userId = this.lastConnectParams.userId;
      const localAv = this.avatars.get(userId);
      if (localAv) {
        localAv.seatId = undefined;
        localAv.animation = 'STAND';
      }
      if (this.room) {
        for (const s of this.room.seats) {
          if (s.occupiedByUserId === userId) {
            s.occupiedByUserId = undefined;
            if (s.state === 'OCCUPIED') s.state = 'AVAILABLE';
          }
        }
        this.emit();
      }
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendMove(position: [number, number, number], rotationY: number, animation: AvatarAnimationState) {
    this.seq += 1;
    this.send({ type: 'AVATAR_MOVE', position, rotationY, animation, seq: this.seq });
  }

  notifyUiSync() {
    this.emit();
  }

  updateLocalAvatarPreset(presetId: AvatarPresetId) {
    if (this.lastConnectParams) {
      this.lastConnectParams.avatarPresetId = presetId;
      const localAv = this.avatars.get(this.lastConnectParams.userId);
      if (localAv) {
        localAv.avatarPresetId = presetId;
        this.emit();
      }
    }
  }

  /**
   * Toggles continuous full-body Dance ('DANCE' = Samba, 'DANCE_2' = Arms Hip Hop, 'DANCE_3' = Northern Soul Spin, 'DANCE_4' = Samba 2, 'DANCE_5' = YMCA) for audience/guests.
   * If seated, releases the seat on the server and steps out into an open aisle/floor spot.
   * Returns true if dancing started or switched, false if toggled off back to IDLE.
   */
  toggleDanceEmote(danceAnim: 'DANCE' | 'DANCE_2' | 'DANCE_3' | 'DANCE_4' | 'DANCE_5' = 'DANCE'): boolean {
    const userId = this.lastConnectParams?.userId;
    const localAv = userId ? this.avatars.get(userId) : undefined;
    if (!localAv) {
      this.send({ type: 'REACTION_SEND', reaction: danceAnim });
      return true;
    }

    if (localAv.animation === danceAnim) {
      localAv.animation = 'IDLE';
      localAv.lastReaction = undefined;
      localAv.reactionUntil = 0;
      this.sendMove(localAv.targetPosition, localAv.targetRotationY, 'IDLE');
      this.emit();
      return false;
    }

    if (localAv.seatId) {
      const [curX, , curZ] = localAv.targetPosition;
      const isKaraoke = this.room?.venueStyle === 'KARAOKE';
      const dancePos: [number, number, number] = isKaraoke
        ? [
            Math.max(-1.6, Math.min(1.6, Number((curX * 0.45).toFixed(2)))),
            0,
            Math.max(2.8, Math.min(5.0, Number(curZ.toFixed(2)))),
          ]
        : [
            curX >= 0 ? 0.35 : -0.35,
            0,
            Math.max(1.4, Math.min(4.1, Number(curZ.toFixed(2)))),
          ];
      this.ignoreNextLeaveSeatEchoUntil = performance.now() + 800;
      this.send({ type: 'LEAVE_SEAT' });
      localAv.targetPosition = dancePos;
      localAv.targetRotationY = Math.PI;
      localAv.animation = danceAnim;
      this.sendMove(dancePos, Math.PI, danceAnim);
    } else {
      localAv.animation = danceAnim;
      this.sendMove(localAv.targetPosition, localAv.targetRotationY, danceAnim);
    }

    this.send({ type: 'REACTION_SEND', reaction: danceAnim });
    this.emit();
    return true;
  }

  /**
   * Moves the local avatar onto the Karaoke stage mic podium (slot 0 = left mic, slot 1 = right mic)
   * facing down from the stage toward the audience & opposite-wall lyrics screen (rotationY = 0).
   */
  stepOntoKaraokeStageMic(slot: 0 | 1) {
    const userId = this.lastConnectParams?.userId;
    const localAv = userId ? this.avatars.get(userId) : undefined;
    const stageX = slot === 0 ? -0.85 : 0.85;
    const stagePos: [number, number, number] = [stageX, 0.44, -1.55];

    if (localAv) {
      if (localAv.seatId) {
        this.ignoreNextLeaveSeatEchoUntil = performance.now() + 800;
        this.send({ type: 'LEAVE_SEAT' });
        localAv.seatId = undefined;
      }
      localAv.targetPosition = stagePos;
      localAv.targetRotationY = 0; // Face +Z (looking down from stage toward audience & rear lyrics monitor)
      localAv.animation = 'IDLE';
      this.sendMove(stagePos, 0, 'IDLE');
      this.emit();
    } else {
      this.sendMove(stagePos, 0, 'IDLE');
    }
  }

  /**
   * Moves the local avatar onto the Chamber/Opera stage at the Steinway Grand Piano bench
   * facing the piano keyboard (position [-1.4, 0.44, -1.05], rotationY = Math.PI).
   */
  stepOntoChamberStagePiano() {
    const userId = this.lastConnectParams?.userId;
    const localAv = userId ? this.avatars.get(userId) : undefined;
    const pianoPos: [number, number, number] = [-1.4, 0.44, -1.05];

    if (localAv) {
      if (localAv.seatId) {
        this.ignoreNextLeaveSeatEchoUntil = performance.now() + 800;
        this.send({ type: 'LEAVE_SEAT' });
        localAv.seatId = undefined;
      }
      localAv.targetPosition = pianoPos;
      localAv.targetRotationY = Math.PI;
      localAv.animation = 'PLAY_PIANO';
      this.sendMove(pianoPos, Math.PI, 'PLAY_PIANO');
      this.emit();
    } else {
      this.sendMove(pianoPos, Math.PI, 'PLAY_PIANO');
    }
  }

  sendMidi(event: MidiNoteEventPayload) {
    // Also trigger local avatar animation immediately for low-latency feedback
    const localAv = this.avatars.get(event.userId);
    if (localAv) {
      localAv.lastMidiAt = performance.now();
      localAv.animation =
        event.instrument === 'GUITAR' || event.instrument === 'BASS'
          ? 'PLAY_GUITAR'
          : event.instrument === 'VIOLIN' || event.instrument === 'CELLO'
            ? 'PLAY_VIOLIN'
            : event.instrument === 'DRUMS'
              ? 'PLAY_DRUMS'
              : 'PLAY_PIANO';
    }
    this.send({ type: 'MIDI_EVENT', event });
  }

  getSyncedPlaybackSec(concert?: ConcertDTO | null): number {
    if (!concert) return 0;
    const isPlaying = concert.trackPlaying ?? (concert.state === 'LIVE' || concert.state === 'SOUND_CHECK');
    if (isPlaying && concert.trackStartedAtServerMs) {
      return Math.max(0, (Date.now() + this.serverClockOffsetMs - concert.trackStartedAtServerMs) / 1000);
    }
    return concert.trackPausedAtSec ?? 0;
  }

  disconnect() {
    this.manualDisconnect = true;
    this.lastConnectParams = null;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.avatars.clear();
    this.room = null;
    this.chat = [];
    this.moderationNotice = null;
    this.systemNotice = null;
    this.pingMs = null;
    this.connected = false;
    this.reconnecting = false;
    this.reconnectAttempt = 0;
  }
}

export const realtimeStore = new RealtimeRoomStore();
