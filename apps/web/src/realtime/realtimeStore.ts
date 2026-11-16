import type {
  AvatarAnimationState,
  AvatarPresetId,
  AvatarTransformPayload,
  ChatMessageDTO,
  MidiNoteEventPayload,
  RealtimeClientMessage,
  RealtimeServerMessage,
  RoomDTO,
  SetlistItemDTO,
  UserRole,
} from '@vmw/contracts';

/**
 * High-frequency 3D runtime & multiplayer store.
 * Intentionally kept OUTSIDE React/Redux global state per AGENTS.md Section 4.
 */
export interface AvatarRuntimeEntry extends AvatarTransformPayload {
  targetPosition: [number, number, number];
  targetRotationY: number;
  lastMidiAt: number;
  lastReaction?: 'CLAP' | 'CHEER' | 'WAVE' | 'DANCE';
  reactionUntil: number;
}

type Listener = () => void;

class RealtimeRoomStore {
  private ws: WebSocket | null = null;
  public avatars = new Map<string, AvatarRuntimeEntry>();
  public room: RoomDTO | null = null;
  public chat: ChatMessageDTO[] = [];
  public lightingPreset: SetlistItemDTO['lightingPreset'] = 'WARM_CHAMBER';
  public applauseUntil = 0;
  public connected = false;
  public lastMidiLatencyMs: number | null = null;
  public moderationNotice: string | null = null;

  private listeners = new Set<Listener>();
  private seq = 0;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  connect(params: {
    roomId: string;
    userId: string;
    displayName: string;
    role: UserRole;
    avatarPresetId: AvatarPresetId;
  }) {
    this.disconnect();
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.connected = true;
      this.send({ type: 'JOIN_ROOM', ...params });
      this.emit();
    };

    this.ws.onmessage = (ev) => {
      let msg: RealtimeServerMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'ROOM_SNAPSHOT': {
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
            });
          }
          const current = msg.room.concert.setlist[msg.room.concert.currentSetlistIndex];
          if (current) this.lightingPreset = current.lightingPreset;
          this.emit();
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
            });
          }
          // Intentionally DO NOT call this.emit() on every frame/transform update!
          // R3F useFrame reads `this.avatars` directly at 60fps.
          break;
        }

        case 'AVATAR_LEFT': {
          this.avatars.delete(msg.userId);
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
            av.lastReaction = msg.reaction;
            av.reactionUntil = performance.now() + 2500;
            av.animation = msg.reaction;
          }
          break;
        }

        case 'SONG_ENDED_APPLAUSE': {
          this.applauseUntil = performance.now() + 4000;
          for (const av of this.avatars.values()) {
            if (av.role !== 'ARTIST') av.animation = 'CLAP';
          }
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
          this.emit();
          break;
        }
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.emit();
    };
  }

  send(msg: RealtimeClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendMove(position: [number, number, number], rotationY: number, animation: AvatarAnimationState) {
    this.seq += 1;
    this.send({ type: 'AVATAR_MOVE', position, rotationY, animation, seq: this.seq });
  }

  sendMidi(event: MidiNoteEventPayload) {
    this.send({ type: 'MIDI_EVENT', event });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.avatars.clear();
    this.room = null;
    this.connected = false;
  }
}

export const realtimeStore = new RealtimeRoomStore();
