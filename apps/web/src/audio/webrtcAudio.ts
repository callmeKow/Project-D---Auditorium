import { realtimeStore } from '../realtime/realtimeStore';
import { audioEngine } from './audioEngine';

type SignalPayload =
  | { kind: 'offer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

export interface WebRtcDiagnostics {
  peerCount: number;
  remoteAudioCount: number;
  isBroadcasting: boolean;
  rttMs: number | null;
  jitterMs: number | null;
  packetsLost: number;
}

const turnUrl = import.meta.env.VITE_TURN_URL;
const ICE_SERVERS: RTCConfiguration = {
  iceCandidatePoolSize: 4,
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    ...(turnUrl
      ? [
          {
            urls: turnUrl,
            username: import.meta.env.VITE_TURN_USERNAME || undefined,
            credential: import.meta.env.VITE_TURN_CREDENTIAL || undefined,
          },
        ]
      : []),
  ],
};

/**
 * Tunes Opus SDP parameters for low-latency (20ms ptime, 10ms minptime), in-band FEC for WAN packet loss recovery,
 * and 96kbps 48kHz clarity that avoids congesting mobile/cross-network uplinks.
 */
function tuneOpusSdp(sdp?: string): string | undefined {
  if (!sdp) return sdp;
  const match = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000\/2/i);
  if (!match) return sdp;
  const pt = match[1];
  const desiredParams = 'minptime=10;ptime=20;useinbandfec=1;usedtx=0;maxaveragebitrate=96000;maxplaybackrate=48000;sprop-maxcapturerate=48000';
  const fmtpRegex = new RegExp(`(a=fmtp:${pt}\\s+)([^\\r\\n]+)`, 'i');
  if (fmtpRegex.test(sdp)) {
    return sdp.replace(fmtpRegex, `$1${desiredParams}`);
  }
  return sdp.replace(
    new RegExp(`(a=rtpmap:${pt}\\s+opus\\/48000\\/2\\r?\\n)`, 'i'),
    `$1a=fmtp:${pt} ${desiredParams}\r\n`
  );
}

/**
 * Isolated WebRTC 1-to-many live audio transport for Small Room (10-20 capacity).
 * Kept outside React global state per AGENTS.md Section 4 (Audio Isolation).
 */
class WebRtcAudioTransport {
  private peers = new Map<string, RTCPeerConnection>();
  private peerChannels = new Map<string, 'CONCERT' | 'PERFORMER_TALKBACK'>();
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();
  private remoteReceivers = new Map<string, RTCRtpReceiver>();
  private adaptiveTimer: number | null = null;
  private audioElements = new Map<string, HTMLAudioElement>();
  private localStream: MediaStream | null = null;
  private localUserId: string | null = null;
  private isBroadcasting = false;
  private muted = false;
  private volume = 0.85;
  public autoplayBlocked = false;
  private onStateChange: (() => void) | null = null;

  attach(localUserId: string, onStateChange?: () => void) {
    this.localUserId = localUserId;
    this.onStateChange = onStateChange ?? null;

    realtimeStore.setSignalHandler((fromUserId, channel, rawSignal) => {
      void this.handleSignal(fromUserId, channel, rawSignal as SignalPayload);
    });

    realtimeStore.setPeerChangeHandler((type, userId) => {
      if (type === 'JOIN' && this.isBroadcasting && this.localStream && userId !== this.localUserId) {
        void this.createOfferForPeer(userId);
      }
      if (type === 'LEAVE') {
        this.closePeer(userId);
      }
    });
  }

  async startBroadcast(stream: MediaStream) {
    this.localStream = stream;
    this.isBroadcasting = true;
    const targets = Array.from(realtimeStore.avatars.keys()).filter((id) => id !== this.localUserId);
    await Promise.all(targets.map((userId) => this.createOfferForPeer(userId)));
    this.onStateChange?.();
  }

  async replaceBroadcastStream(nextStream: MediaStream) {
    this.localStream = nextStream;
    const nextTrack = nextStream.getAudioTracks()[0];
    if (!nextTrack) return;

    if (!this.isBroadcasting) {
      await this.startBroadcast(nextStream);
      return;
    }

    await Promise.all(
      Array.from(this.peers.values()).map(async (pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
        if (sender) {
          await sender.replaceTrack(nextTrack);
        }
      })
    );
    this.onStateChange?.();
  }

  stopBroadcast() {
    this.isBroadcasting = false;
    this.localStream = null;
    for (const userId of Array.from(this.peers.keys())) {
      this.closePeer(userId);
    }
    this.onStateChange?.();
  }

  setAudienceMuted(muted: boolean) {
    this.muted = muted;
    for (const audio of this.audioElements.values()) {
      audio.muted = muted;
    }
  }

  setAudienceVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    for (const audio of this.audioElements.values()) {
      audio.volume = this.volume;
    }
  }

  async unlockPlayback() {
    this.autoplayBlocked = false;
    for (const audio of this.audioElements.values()) {
      audio.muted = this.muted;
      audio.volume = this.volume;
      await audio.play().catch(() => {});
    }
    this.onStateChange?.();
  }

  getActiveRemoteAudioCount(): number {
    return this.audioElements.size;
  }

  getIsBroadcasting(): boolean {
    return this.isBroadcasting;
  }

  // Experiment B diagnostics: RTT, jitter, and packet loss via RTCPeerConnection.getStats()
  async getDiagnostics(): Promise<WebRtcDiagnostics> {
    let rttMs: number | null = null;
    let jitterMs: number | null = null;
    let packetsLost = 0;

    for (const pc of this.peers.values()) {
      try {
        const stats = await pc.getStats();
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded' && typeof report.currentRoundTripTime === 'number') {
            rttMs = Math.round(report.currentRoundTripTime * 1000);
          }
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            if (typeof report.jitter === 'number') {
              jitterMs = Math.round(report.jitter * 1000);
            }
            if (typeof report.packetsLost === 'number') {
              packetsLost += report.packetsLost;
            }
          }
        });
      } catch {
        // Ignore transient stats error
      }
    }

    return {
      peerCount: this.peers.size,
      remoteAudioCount: this.audioElements.size,
      isBroadcasting: this.isBroadcasting,
      rttMs,
      jitterMs,
      packetsLost,
    };
  }

  private ensureAdaptivePlayoutLoop() {
    if (this.adaptiveTimer !== null) return;
    this.adaptiveTimer = window.setInterval(() => {
      if (this.peers.size === 0 && this.adaptiveTimer !== null) {
        clearInterval(this.adaptiveTimer);
        this.adaptiveTimer = null;
        return;
      }
      for (const [userId, pc] of this.peers.entries()) {
        const receiver = this.remoteReceivers.get(userId);
        if (!receiver) continue;
        void pc
          .getStats()
          .then((stats) => {
            let rttMs = 0;
            let jitterMs = 0;
            stats.forEach((report) => {
              if (report.type === 'candidate-pair' && report.state === 'succeeded' && typeof report.currentRoundTripTime === 'number') {
                rttMs = report.currentRoundTripTime * 1000;
              }
              if (report.type === 'inbound-rtp' && report.kind === 'audio' && typeof report.jitter === 'number') {
                jitterMs = report.jitter * 1000;
              }
            });
            // Adapt jitter buffer: 20ms on LAN/same-WiFi, 45-160ms on WAN/cross-network to prevent choppy audio
            const targetHint =
              rttMs <= 25 && jitterMs <= 8
                ? 0.02
                : Math.min(0.16, Math.max(0.045, (jitterMs * 2.5) / 1000 + (rttMs > 120 ? 0.03 : 0.01)));
            const rx = receiver as unknown as { playoutDelayHint?: number };
            if (rx && typeof rx === 'object') {
              try {
                rx.playoutDelayHint = targetHint;
              } catch {
                // Ignore if unsupported
              }
            }
          })
          .catch(() => {});
      }
    }, 2000);
  }

  private async flushPendingIce(userId: string, pc: RTCPeerConnection) {
    const queued = this.pendingIce.get(userId);
    if (!queued || queued.length === 0) return;
    this.pendingIce.delete(userId);
    for (const candidate of queued) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
  }

  private createPeerConnection(remoteUserId: string, channel: 'CONCERT' | 'PERFORMER_TALKBACK' = 'CONCERT'): RTCPeerConnection {
    this.closePeer(remoteUserId);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerChannels.set(remoteUserId, channel);
    this.ensureAdaptivePlayoutLoop();

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        realtimeStore.send({
          type: 'WEBRTC_SIGNAL',
          targetUserId: remoteUserId,
          channel,
          signal: { kind: 'ice', candidate: ev.candidate.toJSON() } satisfies SignalPayload,
        });
      }
    };

    pc.ontrack = (ev) => {
      const [remoteStream] = ev.streams;
      if (!remoteStream) return;
      this.remoteReceivers.set(remoteUserId, ev.receiver);
      // Start with balanced 45ms playout delay; adaptive loop lowers to 20ms on LAN or raises up to 160ms on WAN
      const rx = ev.receiver as unknown as { playoutDelayHint?: number };
      if (rx && typeof rx === 'object') {
        try {
          rx.playoutDelayHint = 0.045;
        } catch {
          // Ignore if unsupported by browser
        }
      }
      let audio = this.audioElements.get(remoteUserId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        this.audioElements.set(remoteUserId, audio);
      }
      audio.srcObject = remoteStream;
      audio.muted = this.muted;
      audio.volume = this.volume;
      audioEngine.attachRemoteAnalyser(remoteStream);
      void audio.play().catch(() => {
        this.autoplayBlocked = true;
        this.onStateChange?.();
      });
      this.onStateChange?.();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' && this.isBroadcasting && this.localStream) {
        // Attempt ICE restart if cross-network NAT path drops momentarily
        window.setTimeout(() => {
          if (this.peers.get(remoteUserId) === pc && pc.connectionState === 'disconnected' && this.isBroadcasting) {
            const ch = this.peerChannels.get(remoteUserId) ?? 'CONCERT';
            void this.createOfferForPeer(remoteUserId, ch, true);
          }
        }, 2000);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeer(remoteUserId);
      }
    };

    this.peers.set(remoteUserId, pc);
    return pc;
  }

  // TBD-08: Private Performer Talkback (never audible to Audience)
  async startPerformerTalkback(stream: MediaStream) {
    this.localStream = stream;
    const artistIds = Array.from(realtimeStore.avatars.entries())
      .filter(([userId, av]) => userId !== this.localUserId && av.role === 'ARTIST')
      .map(([userId]) => userId);
    await Promise.all(artistIds.map((userId) => this.createOfferForPeer(userId, 'PERFORMER_TALKBACK')));
  }

  private async createOfferForPeer(
    remoteUserId: string,
    channel: 'CONCERT' | 'PERFORMER_TALKBACK' = 'CONCERT',
    iceRestart = false
  ) {
    if (!this.localStream) return;
    const existing = iceRestart ? this.peers.get(remoteUserId) : undefined;
    const pc = existing ?? this.createPeerConnection(remoteUserId, channel);
    if (!existing) {
      for (const track of this.localStream.getAudioTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }
    const rawOffer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
    const offer: RTCSessionDescriptionInit = {
      type: rawOffer.type,
      sdp: tuneOpusSdp(rawOffer.sdp),
    };
    await pc.setLocalDescription(offer);
    realtimeStore.send({
      type: 'WEBRTC_SIGNAL',
      targetUserId: remoteUserId,
      channel,
      signal: { kind: 'offer', sdp: offer } satisfies SignalPayload,
    });
  }

  private async handleSignal(fromUserId: string, channel: 'CONCERT' | 'PERFORMER_TALKBACK', signal: SignalPayload) {
    if (!signal || typeof signal !== 'object') return;
    if (signal.kind === 'offer') {
      const existing = this.peers.get(fromUserId);
      const pc = existing ?? this.createPeerConnection(fromUserId, channel);
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      await this.flushPendingIce(fromUserId, pc);
      const rawAnswer = await pc.createAnswer();
      const answer: RTCSessionDescriptionInit = {
        type: rawAnswer.type,
        sdp: tuneOpusSdp(rawAnswer.sdp),
      };
      await pc.setLocalDescription(answer);
      realtimeStore.send({
        type: 'WEBRTC_SIGNAL',
        targetUserId: fromUserId,
        channel,
        signal: { kind: 'answer', sdp: answer } satisfies SignalPayload,
      });
    } else if (signal.kind === 'answer') {
      const pc = this.peers.get(fromUserId);
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await this.flushPendingIce(fromUserId, pc);
      }
    } else if (signal.kind === 'ice') {
      const pc = this.peers.get(fromUserId);
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
      } else {
        const queue = this.pendingIce.get(fromUserId) ?? [];
        queue.push(signal.candidate);
        this.pendingIce.set(fromUserId, queue);
      }
    }
  }

  private closePeer(userId: string) {
    this.pendingIce.delete(userId);
    this.peerChannels.delete(userId);
    this.remoteReceivers.delete(userId);
    const pc = this.peers.get(userId);
    if (pc) {
      pc.close();
      this.peers.delete(userId);
    }
    const audio = this.audioElements.get(userId);
    if (audio) {
      audio.srcObject = null;
      this.audioElements.delete(userId);
      this.onStateChange?.();
    }
  }

  destroy() {
    if (this.adaptiveTimer !== null) {
      clearInterval(this.adaptiveTimer);
      this.adaptiveTimer = null;
    }
    this.stopBroadcast();
    audioEngine.detachRemoteAnalyser();
    realtimeStore.setSignalHandler(null);
    realtimeStore.setPeerChangeHandler(null);
    this.localUserId = null;
    this.onStateChange = null;
  }
}

export const webrtcAudio = new WebRtcAudioTransport();
