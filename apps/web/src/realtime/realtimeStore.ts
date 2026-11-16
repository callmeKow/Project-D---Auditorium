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
  public connected = false;
  public reconnecting = false;
  public reconnectAttempt = 0;
  public pingMs: number | null = null;
  public serverClockOffsetMs = 0;
  public lastMidiLatencyMs: number | null = null;
  public moderationNotice: string | null = null;
  public systemNotice: string | null = null;

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
    const wsUrl = `${proto}//${window.location.host}/ws`;
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
            existing.targetPosition = [...msg.avatar.position];
            existing.targetRotationY = msg.avatar.rotationY;
            existing.animation = msg.avatar.animation;
            existing.seatId = msg.avatar.seatId;
            existing.seq = msg.avatar.seq;
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
          for (const av of this.avatars.values()) {
            if (av.role !== 'ARTIST') av.animation = 'CLAP';
          }
          audioEngine.playReactionSound('APPLAUSE');
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

    ws.onclose = () => {
      this.connected = false;
      this.pingMs = null;
      if (this.pingTimer !== null) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
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
          const now = performance.now();
          localAv.lastReaction = msg.reaction;
          localAv.reactionUntil = now + 2500;
          localAv.animation = msg.reaction === 'FLOWER' ? 'CHEER' : msg.reaction;
          if (msg.reaction === 'FLOWER') {
            localAv.flowerBurstAt = now;
            localAv.flowerBurstUntil = now + 2400;
          }
        }
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
