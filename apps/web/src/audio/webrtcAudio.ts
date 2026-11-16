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

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

/**
 * Isolated WebRTC 1-to-many live audio transport for Small Room (10-20 capacity).
 * Kept outside React global state per AGENTS.md Section 4 (Audio Isolation).
 */
class WebRtcAudioTransport {
  private peers = new Map<string, RTCPeerConnection>();
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

  private createPeerConnection(remoteUserId: string, channel: 'CONCERT' | 'PERFORMER_TALKBACK' = 'CONCERT'): RTCPeerConnection {
    this.closePeer(remoteUserId);
    const pc = new RTCPeerConnection(ICE_SERVERS);

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
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
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

  private async createOfferForPeer(remoteUserId: string, channel: 'CONCERT' | 'PERFORMER_TALKBACK' = 'CONCERT') {
    if (!this.localStream) return;
    const pc = this.createPeerConnection(remoteUserId, channel);
    for (const track of this.localStream.getAudioTracks()) {
      pc.addTrack(track, this.localStream);
    }
    const offer = await pc.createOffer();
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
      const pc = this.createPeerConnection(fromUserId, channel);
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const answer = await pc.createAnswer();
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
      }
    } else if (signal.kind === 'ice') {
      const pc = this.peers.get(fromUserId);
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
      }
    }
  }

  private closePeer(userId: string) {
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
    this.stopBroadcast();
    audioEngine.detachRemoteAnalyser();
    realtimeStore.setSignalHandler(null);
    realtimeStore.setPeerChangeHandler(null);
    this.localUserId = null;
    this.onStateChange = null;
  }
}

export const webrtcAudio = new WebRtcAudioTransport();
