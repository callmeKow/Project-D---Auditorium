import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  getAuditoriumFloorY,
  type QualityPreset,
  type RoomDTO,
  type SetlistItemDTO,
  type UserRole,
  type VenueStyle,
} from '@vmw/contracts';
import { realtimeStore, type AvatarRuntimeEntry } from '../../realtime/realtimeStore';
import { audioEngine } from '../../audio/audioEngine';
import { RiggedAudienceAvatar } from './RiggedAudienceAvatar';

export type CameraMode = 'AUDIENCE_ORBIT' | 'STAGE_VIEW' | 'SEAT_POV' | 'ROOM_OVERVIEW' | 'KARAOKE_STAGE_POV';

// Keep camera strictly inside the auditorium walls (|x| <= 6.4, y in 0..6.35, z in -4.28..9.85)
const CAMERA_BOUNDS = {
  minX: -5.8,
  maxX: 5.8,
  minY: 0.85,
  maxY: 5.7,
  minZ: -3.5,
  maxZ: 9.1,
};

function clampCameraPosition(cam: THREE.Camera) {
  cam.position.x = THREE.MathUtils.clamp(cam.position.x, CAMERA_BOUNDS.minX, CAMERA_BOUNDS.maxX);
  cam.position.y = THREE.MathUtils.clamp(cam.position.y, CAMERA_BOUNDS.minY, CAMERA_BOUNDS.maxY);
  cam.position.z = THREE.MathUtils.clamp(cam.position.z, CAMERA_BOUNDS.minZ, CAMERA_BOUNDS.maxZ);
}

/**
 * Generates an offline studio IBL reflection map via Three.js RoomEnvironment so metallic,
 * clearcoat lacquer (Grand Piano, glass table, speakers, brass, disco ball) and satin floors reflect realistically.
 */
function SceneEnvironmentReflection({
  qualityPreset,
  venueStyle,
}: {
  qualityPreset: QualityPreset;
  venueStyle: VenueStyle;
}) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const envScene = new RoomEnvironment();
    const renderTarget = pmrem.fromScene(envScene, 0.04);
    scene.environment = renderTarget.texture;
    envScene.dispose();
    pmrem.dispose();
    return () => {
      scene.environment = null;
      renderTarget.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    const s = scene as THREE.Scene & { environmentIntensity?: number };
    if (venueStyle === 'CHAMBER') {
      // Keep Chamber/Opera reflections subtle & cozy so dark wood and velvet stay warm instead of washed out
      s.environmentIntensity = qualityPreset === 'HIGH' ? 0.42 : qualityPreset === 'MEDIUM' ? 0.32 : 0.2;
    } else {
      s.environmentIntensity = qualityPreset === 'HIGH' ? 1.05 : qualityPreset === 'MEDIUM' ? 0.78 : 0.5;
    }
  }, [scene, qualityPreset, venueStyle]);

  return null;
}

const LIGHTING_CONFIG: Record<
  SetlistItemDTO['lightingPreset'],
  { ambient: string; ambientInt: number; spot: string; spotInt: number; bg: string; sconce: string }
> = {
  WARM_CHAMBER: {
    ambient: '#f59e0b',
    ambientInt: 0.14,
    spot: '#fbbf24',
    spotInt: 4.5,
    bg: '#0b0604',
    sconce: '#f59e0b',
  },
  SPOTLIGHT_SOLO: {
    ambient: '#bfdbfe',
    ambientInt: 0.24,
    spot: '#ffffff',
    spotInt: 7.6,
    bg: '#080c16',
    sconce: '#93c5fd',
  },
  DYNAMIC_CONCERT: {
    ambient: '#e9d5ff',
    ambientInt: 0.28,
    spot: '#f472b6',
    spotInt: 7.2,
    bg: '#0c0714',
    sconce: '#c084fc',
  },
  ENCORE_GOLD: {
    ambient: '#fef08a',
    ambientInt: 0.38,
    spot: '#f59e0b',
    spotInt: 7.8,
    bg: '#160e06',
    sconce: '#f59e0b',
  },
  KTV_PARTY: {
    ambient: '#f0abfc',
    ambientInt: 0.32,
    spot: '#f472b6',
    spotInt: 7.4,
    bg: '#0d0618',
    sconce: '#e879f9',
  },
};

const CONCERT_NEON_COLORS = ['#ec4899', '#38bdf8', '#a855f7', '#fbbf24'];
const SPECTRUM_PALETTE = ['#ec4899', '#f43f5e', '#fbbf24', '#34d399', '#38bdf8', '#a855f7'];

function ConcertBeatLights({ isLiveOrActive, qualityPreset }: { isLiveOrActive: boolean; qualityPreset: QualityPreset }) {
  const beamRefs = useRef<(THREE.Mesh | null)[]>([]);
  const barRefs = useRef<(THREE.Mesh | null)[]>([]);
  const wallEqRefs = useRef<(THREE.Mesh | null)[]>([]);
  const crownEqRefs = useRef<(THREE.Mesh | null)[]>([]);
  const leftLightRef = useRef<THREE.PointLight>(null);
  const rightLightRef = useRef<THREE.PointLight>(null);
  const stageStripRef = useRef<THREE.MeshStandardMaterial>(null);
  const beatCountRef = useRef(0);
  const lastBeatAtRef = useRef(0);
  const smoothedBassRef = useRef(0);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const { bass, mid, high, beatHit } = audioEngine.readBeatBass(isLiveOrActive, t);
    smoothedBassRef.current = THREE.MathUtils.lerp(smoothedBassRef.current, bass, Math.min(1, delta * 14));
    const sb = smoothedBassRef.current;

    if (beatHit && t - lastBeatAtRef.current > 0.25) {
      lastBeatAtRef.current = t;
      beatCountRef.current += 1;
    }

    const activeColorHex = CONCERT_NEON_COLORS[beatCountRef.current % CONCERT_NEON_COLORS.length];
    const altColorHex = CONCERT_NEON_COLORS[(beatCountRef.current + 1) % CONCERT_NEON_COLORS.length];

    // Sweep overhead moving-head light beams & flare opacity on bass/beat
    for (let i = 0; i < 4; i++) {
      const beam = beamRefs.current[i];
      if (!beam) continue;
      const phase = t * 1.4 + i * 1.2;
      beam.rotation.z = Math.sin(phase) * (0.28 + sb * 0.22);
      beam.rotation.x = 0.25 + Math.cos(phase * 0.8) * 0.15;
      const mat = beam.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.08 + sb * 0.22 + (beatHit ? 0.1 : 0);
      mat.color.set(i % 2 === 0 ? activeColorHex : altColorHex);
    }

    // Bounce 12 rear stage-wing LED Equalizer columns upward from stage deck (y = 0.44)
    for (let i = 0; i < 12; i++) {
      const bar = barRefs.current[i];
      if (!bar) continue;
      const band = i < 4 ? sb : i < 8 ? mid : high;
      const wave = isLiveOrActive
        ? 0.35 + band * 2.1 + Math.abs(Math.sin(t * 6.5 + i * 0.65)) * 0.35
        : 0.22;
      const nextScale = THREE.MathUtils.lerp(bar.scale.y, Math.max(0.18, Math.min(2.8, wave)), Math.min(1, delta * 18));
      bar.scale.y = nextScale;
      bar.position.y = 0.44 + nextScale * 0.6;
      const mat = bar.material as THREE.MeshStandardMaterial;
      const col = SPECTRUM_PALETTE[(i + beatCountRef.current) % SPECTRUM_PALETTE.length];
      mat.emissive.set(col);
      mat.color.set(col);
      mat.emissiveIntensity = isLiveOrActive ? 1.2 + sb * 2.4 : 0.4;
    }

    // Side-Wall LED Equalizer Pillars (10 tall music bars along left & right walls)
    for (let i = 0; i < 10; i++) {
      const bar = wallEqRefs.current[i];
      if (!bar) continue;
      const sideIdx = i % 5;
      const band = sideIdx < 2 ? sb : sideIdx < 4 ? mid : high;
      const wave = isLiveOrActive
        ? 0.35 + band * 1.65 + Math.abs(Math.sin(t * 5.8 + i * 0.85)) * 0.3
        : 0.25;
      const nextScale = THREE.MathUtils.lerp(bar.scale.y, Math.max(0.2, Math.min(2.1, wave)), Math.min(1, delta * 16));
      bar.scale.y = nextScale;
      bar.position.y = 0.65 + nextScale * 0.95;
      const mat = bar.material as THREE.MeshStandardMaterial;
      const col = SPECTRUM_PALETTE[(sideIdx + beatCountRef.current) % SPECTRUM_PALETTE.length];
      mat.emissive.set(col);
      mat.color.set(col);
      mat.emissiveIntensity = isLiveOrActive ? 1.15 + sb * 2.1 : 0.35;
    }

    // Overhead Truss Spectrum Crown (12 mini overhead equalizer bars)
    for (let i = 0; i < 12; i++) {
      const bar = crownEqRefs.current[i];
      if (!bar) continue;
      const band = i % 3 === 0 ? sb : i % 3 === 1 ? mid : high;
      const wave = isLiveOrActive ? 0.3 + band * 1.6 + Math.abs(Math.cos(t * 7 + i * 0.7)) * 0.28 : 0.2;
      const nextScale = THREE.MathUtils.lerp(bar.scale.y, Math.max(0.2, Math.min(1.9, wave)), Math.min(1, delta * 18));
      bar.scale.y = nextScale;
      const mat = bar.material as THREE.MeshStandardMaterial;
      const col = SPECTRUM_PALETTE[(i + beatCountRef.current) % SPECTRUM_PALETTE.length];
      mat.emissive.set(col);
      mat.color.set(col);
      mat.emissiveIntensity = isLiveOrActive ? 1.3 + band * 2.0 : 0.4;
    }

    if (stageStripRef.current) {
      stageStripRef.current.emissive.set(activeColorHex);
      stageStripRef.current.emissiveIntensity = 1.2 + sb * 3.0;
    }

    if (leftLightRef.current) {
      leftLightRef.current.color.set(activeColorHex);
      leftLightRef.current.intensity = 2.0 + sb * 6.5 + (beatHit ? 2.5 : 0);
    }
    if (rightLightRef.current) {
      rightLightRef.current.color.set(altColorHex);
      rightLightRef.current.intensity = 2.0 + sb * 6.5 + (beatHit ? 2.5 : 0);
    }
  });

  return (
    <group>
      {/* Overhead Concert Lighting Truss */}
      <mesh position={[0, 5.4, -1.6]}>
        <boxGeometry args={[10.8, 0.16, 0.22]} />
        <meshStandardMaterial color="#18181b" metalness={0.85} roughness={0.25} />
      </mesh>

      {/* 12 Overhead Truss Music Spectrum Bars */}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh
          key={`crown-${i}`}
          ref={(el) => {
            crownEqRefs.current[i] = el;
          }}
          position={[-4.4 + i * 0.8, 5.62, -1.6]}
        >
          <boxGeometry args={[0.38, 0.36, 0.12]} />
          <meshStandardMaterial
            color={SPECTRUM_PALETTE[i % SPECTRUM_PALETTE.length]}
            emissive={SPECTRUM_PALETTE[i % SPECTRUM_PALETTE.length]}
            emissiveIntensity={1.5}
          />
        </mesh>
      ))}

      {/* 4 Moving-Head Spotlights + Volumetric Light Cones */}
      {[-3.6, -1.2, 1.2, 3.6].map((x, i) => (
        <group key={x} position={[x, 5.25, -1.6]}>
          <mesh>
            <cylinderGeometry args={[0.14, 0.16, 0.24, 10]} />
            <meshStandardMaterial color="#27272a" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh
            ref={(el) => {
              beamRefs.current[i] = el;
            }}
            position={[0, -2.1, 0.5]}
          >
            <coneGeometry args={[1.15, 4.4, 16, 1, true]} />
            <meshBasicMaterial
              color={i % 2 === 0 ? '#ec4899' : '#38bdf8'}
              transparent
              opacity={0.14}
              depthWrite={false}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>
      ))}

      {/* 12 Flanking Stage Bass/Beat LED Equalizer Columns (6 left wing + 6 right wing framing the screen) */}
      {Array.from({ length: 12 }, (_, i) => {
        const isRight = i >= 6;
        const sideIdx = i % 6;
        const x = isRight ? 5.15 : -5.15;
        const z = -3.15 + sideIdx * 0.52;
        return (
          <mesh
            key={i}
            ref={(el) => {
              barRefs.current[i] = el;
            }}
            position={[x, 1.2, z]}
          >
            <boxGeometry args={[0.2, 1.2, 0.24]} />
            <meshStandardMaterial
              color={SPECTRUM_PALETTE[i % SPECTRUM_PALETTE.length]}
              emissive={SPECTRUM_PALETTE[i % SPECTRUM_PALETTE.length]}
              emissiveIntensity={1.6}
            />
          </mesh>
        );
      })}

      {/* 10 Side-Wall Reactive LED Equalizer Pillars (5 Left Wall + 5 Right Wall) */}
      {qualityPreset !== 'LOW' &&
        Array.from({ length: 10 }, (_, i) => {
          const isRight = i >= 5;
          const sideIdx = i % 5;
          const x = isRight ? 6.32 : -6.32;
          const z = -0.8 + sideIdx * 1.85;
          return (
            <mesh
              key={`wall-eq-${i}`}
              ref={(el) => {
                wallEqRefs.current[i] = el;
              }}
              position={[x, 1.6, z]}
            >
              <boxGeometry args={[0.12, 1.9, 0.24]} />
              <meshStandardMaterial
                color={SPECTRUM_PALETTE[sideIdx % SPECTRUM_PALETTE.length]}
                emissive={SPECTRUM_PALETTE[sideIdx % SPECTRUM_PALETTE.length]}
                emissiveIntensity={1.5}
              />
            </mesh>
          );
        })}

      {/* Reactive Neon Stage Edge Strip */}
      <mesh position={[0, 0.45, 0.13]}>
        <boxGeometry args={[11.2, 0.06, 0.05]} />
        <meshStandardMaterial ref={stageStripRef} color="#ffffff" emissive="#ec4899" emissiveIntensity={1.8} />
      </mesh>

      {/* Beat-Synced Dynamic Party Point Lights */}
      <pointLight ref={leftLightRef} position={[-3.4, 3.8, -1.2]} intensity={3.2} distance={14} color="#ec4899" />
      {qualityPreset !== 'LOW' && (
        <pointLight ref={rightLightRef} position={[3.4, 3.8, -1.2]} intensity={3.2} distance={14} color="#38bdf8" />
      )}
    </group>
  );
}

function sendYtCmd(iframe: HTMLIFrameElement | null, func: string, args: unknown = '') {
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
}

function KaraokeScreenScoreOverlay({
  scoreCard,
}: {
  scoreCard?: { score: number; trackTitle?: string } | null;
}) {
  if (!scoreCard) return null;
  const rank =
    scoreCard.score >= 95 ? 'S+' : scoreCard.score >= 90 ? 'S' : scoreCard.score >= 82 ? 'A' : 'B';
  const praise =
    scoreCard.score >= 95
      ? '🔥 Tuyệt đỉnh sân khấu! Cả phòng vỗ tay rần rần!'
      : scoreCard.score >= 90
        ? '✨ Giọng hát cực cháy! Sân khấu bùng nổ!'
        : scoreCard.score >= 82
          ? '👏 Hát rất hay và đầy cảm xúc!'
          : '🎶 Phong độ ổn định! Quẩy tiếp bài sau nào!';

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
      <div className="w-[78%] max-w-[360px] rounded-2xl border-2 border-fuchsia-400/75 bg-gradient-to-br from-fuchsia-950/95 via-stone-950/95 to-indigo-950/95 px-5 py-4 text-center shadow-2xl">
        <div className="text-[11px] font-bold uppercase tracking-widest text-fuchsia-300">
          🎤 Karaoke Score • Hạng {rank}
        </div>
        <div className="mt-1 bg-gradient-to-r from-amber-300 via-pink-300 to-cyan-300 bg-clip-text text-5xl font-black text-transparent">
          {scoreCard.score} <span className="text-2xl text-fuchsia-200/80">/ 100</span>
        </div>
        <div className="mt-1.5 text-xs font-semibold text-white">{praise}</div>
        {scoreCard.trackTitle && (
          <div className="mt-1 truncate text-[10px] text-stone-300">{scoreCard.trackTitle}</div>
        )}
      </div>
    </div>
  );
}

function StageYouTubeCurtains({
  transitionVisual,
  concert,
  youtubeVideoId,
  isPlaying,
  audienceMuted,
  musicVolume = 80,
  musicMuted = false,
  venueStyle = 'CHAMBER',
  canAutoAdvance = false,
  onAutoAdvanceNext,
  onKaraokeSongEnded,
  karaokeScoreCard,
  ytIframeRef,
  onAutoplayBlocked,
}: {
  transitionVisual?: {
    active: boolean;
    phase: 'PREWARM' | 'CROSSFADE';
    progressPct: number;
    elapsedSec: number;
    totalSec: number;
    targetVideoId?: string;
    targetTitle?: string;
    oldScreenOpacity: number;
    newScreenOpacity: number;
  } | null;
  concert: RoomDTO['concert'];
  youtubeVideoId?: string;
  isPlaying: boolean;
  audienceMuted: boolean;
  musicVolume?: number;
  musicMuted?: boolean;
  venueStyle?: VenueStyle;
  canAutoAdvance?: boolean;
  onAutoAdvanceNext?: (expectedIndex: number) => void;
  onKaraokeSongEnded?: (expectedIndex: number, shouldAutoAdvance: boolean) => void;
  karaokeScoreCard?: { score: number; trackTitle?: string } | null;
  ytIframeRef?: React.MutableRefObject<HTMLIFrameElement | null>;
  onAutoplayBlocked?: (blocked: boolean) => void;
}) {
  const leftCurtainRef = useRef<THREE.Mesh>(null);
  const rightCurtainRef = useRef<THREE.Mesh>(null);
  const stageHtmlBoxRef = useRef<HTMLDivElement | null>(null);
  const camDirVec = useMemo(() => new THREE.Vector3(), []);
  const localIframeRef = useRef<HTMLIFrameElement | null>(null);
  const preloadMapRef = useRef<Map<string, HTMLIFrameElement>>(new Map());
  const openProgressRef = useRef(0);
  const [screenVisible, setScreenVisible] = useState(false);
  const [ytActiveVisual, setYtActiveVisual] = useState(false);
  const ytStateRef = useRef<number>(-1);
  const ytTimeRef = useRef<number>(0);
  const ytDurationRef = useRef<number>(0);
  const ytMutedRef = useRef<boolean>(true);
  const lastSeekAtRef = useRef<number>(0);
  const loadedAtRef = useRef<number>(performance.now());
  const lastAutoAdvanceRef = useRef<{ index: number; at: number }>({ index: -1, at: 0 });

  // Collect up to 4 unique YouTube tracks from Setlist (active + next 3 upcoming) to pre-buffer in RAM
  const preloadedVideoIds: string[] = [];
  if (youtubeVideoId) preloadedVideoIds.push(youtubeVideoId);
  if (transitionVisual?.targetVideoId && !preloadedVideoIds.includes(transitionVisual.targetVideoId)) {
    preloadedVideoIds.push(transitionVisual.targetVideoId);
  }
  if (concert.setlist.length > 0) {
    for (let offset = 0; offset < concert.setlist.length && preloadedVideoIds.length < 4; offset++) {
      const idx = (concert.currentSetlistIndex + offset) % concert.setlist.length;
      const vid = concert.setlist[idx]?.youtubeVideoId;
      if (vid && !preloadedVideoIds.includes(vid)) {
        preloadedVideoIds.push(vid);
      }
    }
  }

  // When a 5s transition is active, ensure the incoming target video iframe plays muted on the 3D stage screen so its visual crossfade shows live motion
  const activeTransitionTargetVid = transitionVisual?.active ? transitionVisual.targetVideoId : undefined;
  useEffect(() => {
    if (!activeTransitionTargetVid || activeTransitionTargetVid === youtubeVideoId) return;
    const targetWin = preloadMapRef.current.get(activeTransitionTargetVid)?.contentWindow;
    if (!targetWin) return;
    targetWin.postMessage(JSON.stringify({ event: 'command', func: 'mute', args: '' }), '*');
    targetWin.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [0] }), '*');
    targetWin.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [0, true] }), '*');
    targetWin.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: '' }), '*');
  }, [activeTransitionTargetVid, youtubeVideoId]);

  const getLoopAwareSyncSec = (c: RoomDTO['concert']) => {
    const raw = realtimeStore.getSyncedPlaybackSec(c);
    const dur = ytDurationRef.current;
    return dur > 1 ? raw % dur : raw;
  };

  const isPausedState = concert.state === 'PAUSED' || concert.state === 'INTERMISSION';
  const shouldOpen = Boolean(youtubeVideoId && (isPlaying || isPausedState));

  useEffect(() => {
    const activeEl = youtubeVideoId ? (preloadMapRef.current.get(youtubeVideoId) ?? null) : null;
    localIframeRef.current = activeEl;
    if (ytIframeRef) ytIframeRef.current = activeEl;
    setYtActiveVisual(false);
    ytStateRef.current = -1;
    ytTimeRef.current = 0;
    ytDurationRef.current = 0;
    lastSeekAtRef.current = 0;
    loadedAtRef.current = performance.now();
  }, [youtubeVideoId, ytIframeRef]);

  useEffect(() => {
    if (!isPlaying) setYtActiveVisual(false);
  }, [isPlaying]);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return;
      let parsed: { event?: string; info?: { duration?: number; playerState?: number; currentTime?: number } };
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (parsed?.event !== 'infoDelivery' || !parsed.info) return;

      const activeIframe = localIframeRef.current;
      // Background preloaded iframes: once they buffer & hit playing (1), park paused cleanly at 0s
      if (!activeIframe?.contentWindow || ev.source !== activeIframe.contentWindow) {
        for (const [vid, bgIframe] of preloadMapRef.current.entries()) {
          if (vid !== youtubeVideoId && bgIframe.contentWindow === ev.source && parsed.info.playerState === 1) {
            sendYtCmd(bgIframe, 'pauseVideo');
            sendYtCmd(bgIframe, 'seekTo', [0, true]);
          }
        }
        return;
      }

      if (typeof parsed.info.duration === 'number' && parsed.info.duration > 1) {
        ytDurationRef.current = parsed.info.duration;
      }
      if (typeof (parsed.info as { muted?: boolean }).muted === 'boolean') {
        ytMutedRef.current = Boolean((parsed.info as { muted?: boolean }).muted);
      }
      if (typeof parsed.info.playerState === 'number') {
        const st = parsed.info.playerState;
        ytStateRef.current = st;
        if (st === 1) {
          setYtActiveVisual(true);
          if (!audienceMuted && !ytMutedRef.current) {
            onAutoplayBlocked?.(false);
          }
        } else if (st === 0) {
          setYtActiveVisual(false);
          if (isPlaying && localIframeRef.current) {
            const latestConcert = realtimeStore.room?.concert ?? concert;
            const playbackMode = latestConcert.playbackMode ?? 'REPEAT_ONE';
            const shouldAdvance = playbackMode === 'QUEUE_NEXT' && latestConcert.setlist.length > 1;
            const nowMs = performance.now();
            const idx = latestConcert.currentSetlistIndex;

            if (venueStyle === 'KARAOKE' && onKaraokeSongEnded) {
              if (
                canAutoAdvance &&
                (lastAutoAdvanceRef.current.index !== idx || nowMs - lastAutoAdvanceRef.current.at > 6500)
              ) {
                lastAutoAdvanceRef.current = { index: idx, at: nowMs };
                onKaraokeSongEnded(idx, shouldAdvance);
              }
              if (!shouldAdvance) {
                const raw = realtimeStore.getSyncedPlaybackSec(latestConcert);
                const dur = ytDurationRef.current;
                const mod = dur > 1 ? raw % dur : 0;
                const loopTarget = dur > 1 && dur - mod >= 3 ? mod : 0;
                ytTimeRef.current = loopTarget;
                lastSeekAtRef.current = performance.now();
                sendYtCmd(localIframeRef.current, 'seekTo', [loopTarget, true]);
                sendYtCmd(localIframeRef.current, 'playVideo');
              }
            } else if (shouldAdvance) {
              if (
                canAutoAdvance &&
                (lastAutoAdvanceRef.current.index !== idx || nowMs - lastAutoAdvanceRef.current.at > 3000)
              ) {
                lastAutoAdvanceRef.current = { index: idx, at: nowMs };
                onAutoAdvanceNext?.(idx);
              }
            } else {
              const raw = realtimeStore.getSyncedPlaybackSec(latestConcert);
              const dur = ytDurationRef.current;
              const mod = dur > 1 ? raw % dur : 0;
              const loopTarget = dur > 1 && dur - mod >= 3 ? mod : 0;
              ytTimeRef.current = loopTarget;
              lastSeekAtRef.current = performance.now();
              sendYtCmd(localIframeRef.current, 'seekTo', [loopTarget, true]);
              sendYtCmd(localIframeRef.current, 'playVideo');
            }
          }
        } else if (st === 2 || st === 5 || st === -1) {
          setYtActiveVisual(false);
        }
      }
      if (typeof parsed.info.currentTime === 'number') {
        ytTimeRef.current = parsed.info.currentTime;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceMuted, isPlaying, youtubeVideoId, onAutoplayBlocked]);

  // Sync YouTube music volume & mute from Karaoke mixer
  useEffect(() => {
    const iframe = localIframeRef.current;
    if (!iframe || !youtubeVideoId || !screenVisible) return;
    if (audienceMuted || musicMuted || musicVolume === 0) {
      sendYtCmd(iframe, 'mute');
    } else {
      sendYtCmd(iframe, 'unMute');
      sendYtCmd(iframe, 'setVolume', [musicVolume]);
    }
  }, [musicVolume, musicMuted, audienceMuted, youtubeVideoId, screenVisible]);

  // Sync play/pause/seek when active track, epoch, or playing state changes
  useEffect(() => {
    const iframe = localIframeRef.current;
    if (!iframe || !youtubeVideoId || !screenVisible) return;
    const latestConcert = realtimeStore.room?.concert ?? concert;
    const targetSec = getLoopAwareSyncSec(latestConcert);
    if (audienceMuted || musicMuted || musicVolume === 0) {
      sendYtCmd(iframe, 'mute');
    } else {
      sendYtCmd(iframe, 'unMute');
      sendYtCmd(iframe, 'setVolume', [musicVolume]);
    }
    if (isPlaying) {
      if (Math.abs(ytTimeRef.current - targetSec) > 1.2) {
        lastSeekAtRef.current = performance.now();
        sendYtCmd(iframe, 'seekTo', [targetSec, true]);
      }
      sendYtCmd(iframe, 'playVideo');
    } else {
      sendYtCmd(iframe, 'pauseVideo');
    }
    // Also ensure any other preloaded background tracks stay paused & muted
    for (const [vid, bgIframe] of preloadMapRef.current.entries()) {
      if (vid !== youtubeVideoId) {
        sendYtCmd(bgIframe, 'mute');
        sendYtCmd(bgIframe, 'pauseVideo');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeVideoId, isPlaying, concert.trackStartedAtServerMs, concert.currentSetlistIndex, screenVisible]);

  // Periodic circular drift correction + genuine autoplay-block fallback
  useEffect(() => {
    if (!youtubeVideoId || !isPlaying || !screenVisible) return;
    const checkTimer = window.setInterval(() => {
      const iframe = localIframeRef.current;
      if (!iframe) return;
      const now = performance.now();
      const latestConcert = realtimeStore.room?.concert ?? concert;
      const targetSec = getLoopAwareSyncSec(latestConcert);
      const dur = ytDurationRef.current;
      const rawDiff = Math.abs(ytTimeRef.current - targetSec);
      const circularDiff = dur > 1 ? Math.min(rawDiff, dur - rawDiff) : rawDiff;

      if (
        ytStateRef.current === 1 &&
        ytTimeRef.current > 0 &&
        circularDiff > 3.0 &&
        now - lastSeekAtRef.current > 3500
      ) {
        lastSeekAtRef.current = now;
        sendYtCmd(iframe, 'seekTo', [targetSec, true]);
      }

      const st = ytStateRef.current;
      const hasActivation =
        (navigator as unknown as { userActivation?: { hasBeenActive?: boolean } }).userActivation?.hasBeenActive ?? false;

      if (!audienceMuted && !musicMuted && musicVolume > 0) {
        if (st === 1 && ytMutedRef.current) {
          if (hasActivation) {
            sendYtCmd(iframe, 'unMute');
            sendYtCmd(iframe, 'setVolume', [musicVolume]);
          } else if (now - loadedAtRef.current > 2600) {
            onAutoplayBlocked?.(true);
          }
        } else if (st !== 1 && st !== 3) {
          if (hasActivation) {
            sendYtCmd(iframe, 'unMute');
            sendYtCmd(iframe, 'setVolume', [musicVolume]);
            sendYtCmd(iframe, 'playVideo');
          } else if (now - loadedAtRef.current > 2600) {
            sendYtCmd(iframe, 'mute');
            sendYtCmd(iframe, 'playVideo');
            onAutoplayBlocked?.(true);
          }
        }
      } else if (!ytMutedRef.current) {
        sendYtCmd(iframe, 'mute');
      }
    }, 1800);
    return () => clearInterval(checkTimer);
  }, [youtubeVideoId, isPlaying, screenVisible, audienceMuted, musicVolume, musicMuted, concert, onAutoplayBlocked]);

  useFrame((state, delta) => {
    const target = shouldOpen ? 1 : 0;
    openProgressRef.current = THREE.MathUtils.lerp(openProgressRef.current, target, Math.min(1, delta * 7.5));
    const p = openProgressRef.current;

    if (leftCurtainRef.current) {
      leftCurtainRef.current.position.x = THREE.MathUtils.lerp(-2.15, -4.65, p);
      leftCurtainRef.current.scale.x = THREE.MathUtils.lerp(1, 0.22, p);
    }
    if (rightCurtainRef.current) {
      rightCurtainRef.current.position.x = THREE.MathUtils.lerp(2.15, 4.65, p);
      rightCurtainRef.current.scale.x = THREE.MathUtils.lerp(1, 0.22, p);
    }

    const shouldShowScreen = Boolean(youtubeVideoId) && p > 0.12;
    if (shouldShowScreen !== screenVisible) {
      setScreenVisible(shouldShowScreen);
    }

    if (stageHtmlBoxRef.current) {
      state.camera.getWorldDirection(camDirVec);
      const facingStage = camDirVec.z < 0.18 && state.camera.position.z > -3.4;
      stageHtmlBoxRef.current.style.visibility = facingStage ? 'visible' : 'hidden';
    }
  });

  const isKaraokeScreen = venueStyle === 'KARAOKE';

  return (
    <group
      position={[0, isKaraokeScreen ? 3.12 : 2.95, isKaraokeScreen ? -3.88 : -4.08]}
      scale={isKaraokeScreen ? 1.05 : 1}
    >
      {/* Dark Stage Screen Frame (maximized across clear stage span) */}
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[8.6, 4.95, 0.08]} />
        <meshStandardMaterial color="#18181b" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[8.32, 4.68]} />
        <meshStandardMaterial color="#09090b" roughness={0.8} />
      </mesh>

      {/* Embedded YouTube Screen behind transparent WebGL Canvas (occlude="blending" puts characters/stage/seats strictly IN FRONT of video) */}
      {youtubeVideoId && screenVisible && (
        <Html
          transform
          occlude="blending"
          position={[0, 0, 0.02]}
          scale={0.52}
          zIndexRange={[8, 0]}
          wrapperClass="pointer-events-none"
          pointerEvents="none"
          style={{ pointerEvents: 'none' }}
        >
          <div
            ref={stageHtmlBoxRef}
            className="pointer-events-none relative h-[360px] w-[640px] overflow-hidden rounded bg-black shadow-2xl"
          >
            {preloadedVideoIds.map((vid) => {
              const isActive = vid === youtubeVideoId;
              return (
                <iframe
                  key={vid}
                  ref={(el) => {
                    if (el) {
                      preloadMapRef.current.set(vid, el);
                    } else {
                      preloadMapRef.current.delete(vid);
                    }
                    if (isActive) {
                      localIframeRef.current = el;
                      if (ytIframeRef) ytIframeRef.current = el;
                    }
                  }}
                  onLoad={() => {
                    const iframe = preloadMapRef.current.get(vid);
                    if (!iframe?.contentWindow) return;
                    iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
                    window.setTimeout(() => {
                      iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*');
                    }, 400);
                    if (isActive) {
                      const syncSec = getLoopAwareSyncSec(realtimeStore.room?.concert ?? concert);
                      lastSeekAtRef.current = performance.now();
                      if (syncSec > 1) sendYtCmd(iframe, 'seekTo', [syncSec, true]);
                      if (audienceMuted || musicMuted || musicVolume === 0) {
                        sendYtCmd(iframe, 'mute');
                      } else {
                        sendYtCmd(iframe, 'unMute');
                        sendYtCmd(iframe, 'setVolume', [musicVolume]);
                      }
                      if (isPlaying) {
                        sendYtCmd(iframe, 'playVideo');
                      } else {
                        sendYtCmd(iframe, 'pauseVideo');
                      }
                    } else {
                      // Background preload: start muted briefly so YouTube buffers frames/audio, then parked at 0s
                      sendYtCmd(iframe, 'mute');
                      sendYtCmd(iframe, 'playVideo');
                    }
                  }}
                  title={isActive ? 'Stage Video Screen' : `Preloaded Stage Track (${vid})`}
                  src={`https://www.youtube.com/embed/${vid}?autoplay=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&enablejsapi=1&mute=1`}
                  allow="autoplay; encrypted-media"
                  style={
                    transitionVisual?.active
                      ? isActive
                        ? {
                            opacity: transitionVisual.oldScreenOpacity,
                            filter: `brightness(${(0.2 + 0.8 * transitionVisual.oldScreenOpacity).toFixed(2)})`,
                          }
                        : vid === transitionVisual.targetVideoId
                          ? {
                              opacity: transitionVisual.newScreenOpacity,
                              filter: `brightness(${(0.25 + 0.75 * transitionVisual.newScreenOpacity).toFixed(2)})`,
                            }
                          : undefined
                      : undefined
                  }
                  className={`pointer-events-none absolute left-0 top-0 h-[600px] w-[640px] -translate-y-[120px] border-0 transition-opacity duration-150 ${
                    transitionVisual?.active && vid === transitionVisual.targetVideoId && !isActive
                      ? 'z-20 opacity-100'
                      : isActive
                        ? ytActiveVisual && isPlaying
                          ? 'z-10 opacity-100'
                          : isPausedState
                            ? 'z-10 opacity-55'
                            : 'z-10 opacity-0'
                        : 'z-0 opacity-0'
                  }`}
                />
              );
            })}
            {isPausedState && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
                <div className="rounded-full border border-amber-400/50 bg-stone-950/85 px-4 py-1.5 text-xs font-bold tracking-wider text-amber-300 shadow-xl">
                  ⏸ TẠM DỪNG NHẠC
                </div>
              </div>
            )}
            <KaraokeScreenScoreOverlay scoreCard={karaokeScoreCard} />
          </div>
        </Html>
      )}

      {/* Animated Left & Right Velvet Curtains (closed initially, part open when YouTube plays) */}
      <mesh ref={leftCurtainRef} position={[-2.15, 0.05, 0.14]} castShadow>
        <boxGeometry args={[4.35, 5.1, 0.1]} />
        <meshStandardMaterial color="#58141a" roughness={0.85} />
      </mesh>
      <mesh ref={rightCurtainRef} position={[2.15, 0.05, 0.14]} castShadow>
        <boxGeometry args={[4.35, 5.1, 0.1]} />
        <meshStandardMaterial color="#58141a" roughness={0.85} />
      </mesh>
    </group>
  );
}

/**
 * Opposite-wall lyrics monitor rendered strictly in KARAOKE rooms so performers
 * facing the audience can read synced YouTube karaoke lyrics (always muted to prevent double audio).
 */
function KaraokeBackLyricsScreen({
  transitionVisual,
  concert,
  youtubeVideoId,
  isPlaying,
  karaokeScoreCard,
}: {
  transitionVisual?: {
    active: boolean;
    phase: 'PREWARM' | 'CROSSFADE';
    progressPct: number;
    elapsedSec: number;
    totalSec: number;
    targetVideoId?: string;
    targetTitle?: string;
    oldScreenOpacity: number;
    newScreenOpacity: number;
  } | null;
  concert: RoomDTO['concert'];
  youtubeVideoId?: string;
  isPlaying: boolean;
  karaokeScoreCard?: { score: number; trackTitle?: string } | null;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ytActiveVisual, setYtActiveVisual] = useState(false);
  const [facingRearWall, setFacingRearWall] = useState(false);
  const rearCamDir = useMemo(() => new THREE.Vector3(), []);
  const ytTimeRef = useRef(0);
  const ytDurationRef = useRef(0);
  const ytStateRef = useRef(-1);
  const lastSeekAtRef = useRef(0);

  const isPausedState = concert.state === 'PAUSED' || concert.state === 'INTERMISSION';
  const showVideo = Boolean(youtubeVideoId && (isPlaying || isPausedState));

  useFrame((state) => {
    state.camera.getWorldDirection(rearCamDir);
    const isLookingAtRear = rearCamDir.z > 0.08 && state.camera.position.z < 9.2;
    if (isLookingAtRear !== facingRearWall) {
      setFacingRearWall(isLookingAtRear);
    }
  });

  const getLoopAwareSyncSec = (c: RoomDTO['concert']) => {
    const raw = realtimeStore.getSyncedPlaybackSec(c);
    const dur = ytDurationRef.current;
    return dur > 1 ? raw % dur : raw;
  };

  useEffect(() => {
    setYtActiveVisual(false);
    ytTimeRef.current = 0;
    ytDurationRef.current = 0;
    ytStateRef.current = -1;
    lastSeekAtRef.current = 0;
  }, [youtubeVideoId]);

  useEffect(() => {
    if (!isPlaying) setYtActiveVisual(false);
  }, [isPlaying]);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return;
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow || ev.source !== iframe.contentWindow) return;
      let parsed: { event?: string; info?: { duration?: number; playerState?: number; currentTime?: number } };
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (parsed?.event !== 'infoDelivery' || !parsed.info) return;
      if (typeof parsed.info.duration === 'number' && parsed.info.duration > 1) {
        ytDurationRef.current = parsed.info.duration;
      }
      if (typeof parsed.info.currentTime === 'number') {
        ytTimeRef.current = parsed.info.currentTime;
      }
      if (typeof parsed.info.playerState === 'number') {
        const st = parsed.info.playerState;
        ytStateRef.current = st;
        if (st === 1) {
          setYtActiveVisual(true);
        } else if (st === 0 && isPlaying) {
          setYtActiveVisual(false);
          const latestConcert = realtimeStore.room?.concert ?? concert;
          if ((latestConcert.playbackMode ?? 'REPEAT_ONE') === 'REPEAT_ONE') {
            const target = getLoopAwareSyncSec(latestConcert);
            lastSeekAtRef.current = performance.now();
            sendYtCmd(iframe, 'mute');
            sendYtCmd(iframe, 'seekTo', [target, true]);
            sendYtCmd(iframe, 'playVideo');
          }
        } else if (st === 2 || st === 5 || st === -1) {
          setYtActiveVisual(false);
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isPlaying, concert]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !showVideo) return;
    const latestConcert = realtimeStore.room?.concert ?? concert;
    const targetSec = getLoopAwareSyncSec(latestConcert);
    sendYtCmd(iframe, 'mute');
    if (isPlaying) {
      if (Math.abs(ytTimeRef.current - targetSec) > 1.2) {
        lastSeekAtRef.current = performance.now();
        sendYtCmd(iframe, 'seekTo', [targetSec, true]);
      }
      sendYtCmd(iframe, 'playVideo');
    } else {
      sendYtCmd(iframe, 'pauseVideo');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeVideoId, isPlaying, showVideo, concert.trackStartedAtServerMs, concert.currentSetlistIndex]);

  useEffect(() => {
    if (!showVideo || !isPlaying) return;
    const timer = window.setInterval(() => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const now = performance.now();
      const latestConcert = realtimeStore.room?.concert ?? concert;
      const targetSec = getLoopAwareSyncSec(latestConcert);
      const dur = ytDurationRef.current;
      const rawDiff = Math.abs(ytTimeRef.current - targetSec);
      const circularDiff = dur > 1 ? Math.min(rawDiff, dur - rawDiff) : rawDiff;

      sendYtCmd(iframe, 'mute');
      if (
        ytStateRef.current === 1 &&
        ytTimeRef.current > 0 &&
        circularDiff > 2.2 &&
        now - lastSeekAtRef.current > 3500
      ) {
        lastSeekAtRef.current = now;
        sendYtCmd(iframe, 'seekTo', [targetSec, true]);
      } else if (ytStateRef.current !== 1 && ytStateRef.current !== 3) {
        sendYtCmd(iframe, 'playVideo');
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [showVideo, isPlaying, concert]);

  return (
    <group position={[0, 3.25, 9.79]} rotation={[0, Math.PI, 0]}>
      {/* Neon Outer Accent Frame */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[8.56, 4.92, 0.06]} />
        <meshStandardMaterial color="#3b0764" emissive="#c084fc" emissiveIntensity={0.45} roughness={0.35} />
      </mesh>
      {/* Glossy Dark Monitor Bezel */}
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[8.36, 4.72, 0.06]} />
        <meshStandardMaterial color="#18181b" roughness={0.35} metalness={0.65} />
      </mesh>
      <mesh position={[0, 0, 0.015]}>
        <planeGeometry args={[8.08, 4.54]} />
        <meshStandardMaterial color="#09090b" roughness={0.75} />
      </mesh>

      {showVideo && youtubeVideoId && facingRearWall && (
        <Html
          transform
          occlude="blending"
          position={[0, 0, 0.03]}
          scale={0.51}
          zIndexRange={[8, 0]}
          wrapperClass="pointer-events-none"
          pointerEvents="none"
          style={{ pointerEvents: 'none' }}
        >
          <div className="pointer-events-none relative h-[360px] w-[640px] overflow-hidden rounded bg-black shadow-2xl">
            <iframe
              key={youtubeVideoId}
              ref={iframeRef}
              onLoad={() => {
                const iframe = iframeRef.current;
                if (!iframe?.contentWindow) return;
                iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
                window.setTimeout(() => {
                  iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*');
                }, 400);
                sendYtCmd(iframe, 'mute');
                const targetSec = getLoopAwareSyncSec(realtimeStore.room?.concert ?? concert);
                if (targetSec > 1) {
                  lastSeekAtRef.current = performance.now();
                  sendYtCmd(iframe, 'seekTo', [targetSec, true]);
                }
                if (isPlaying) {
                  sendYtCmd(iframe, 'playVideo');
                } else {
                  sendYtCmd(iframe, 'pauseVideo');
                }
              }}
              title="Karaoke Rear Lyrics Screen"
              src={`https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&enablejsapi=1&mute=1`}
              allow="autoplay; encrypted-media"
              style={
                transitionVisual?.active
                  ? {
                      opacity: transitionVisual.oldScreenOpacity,
                      filter: `brightness(${(0.2 + 0.8 * transitionVisual.oldScreenOpacity).toFixed(2)})`,
                    }
                  : undefined
              }
              className={`pointer-events-none absolute left-0 top-0 h-[600px] w-[640px] -translate-y-[120px] border-0 transition-opacity duration-150 ${
                ytActiveVisual && isPlaying ? 'opacity-100' : isPausedState ? 'opacity-55' : 'opacity-0'
              }`}
            />
            {transitionVisual?.active &&
              transitionVisual.targetVideoId &&
              transitionVisual.targetVideoId !== youtubeVideoId && (
                <iframe
                  key={`rear-incoming-${transitionVisual.targetVideoId}`}
                  title="Incoming Karaoke Rear Lyrics Screen"
                  src={`https://www.youtube.com/embed/${transitionVisual.targetVideoId}?autoplay=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&enablejsapi=1&mute=1`}
                  allow="autoplay; encrypted-media"
                  style={{
                    opacity: transitionVisual.newScreenOpacity,
                    filter: `brightness(${(0.25 + 0.75 * transitionVisual.newScreenOpacity).toFixed(2)})`,
                  }}
                  className="pointer-events-none absolute left-0 top-0 z-20 h-[600px] w-[640px] -translate-y-[120px] border-0 transition-opacity duration-150"
                />
              )}
            {isPausedState && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
                <div className="rounded-full border border-amber-400/50 bg-stone-950/85 px-4 py-1.5 text-xs font-bold tracking-wider text-amber-300 shadow-xl">
                  ⏸ TẠM DỪNG NHẠC
                </div>
              </div>
            )}
            <KaraokeScreenScoreOverlay scoreCard={karaokeScoreCard} />
          </div>
        </Html>
      )}
    </group>
  );
}

function AuditoriumArchitecture({
  sconceColor,
  enableChandelierLights,
  venueStyle,
  onSelectStagePiano,
}: {
  sconceColor: string;
  enableChandelierLights: boolean;
  venueStyle: VenueStyle;
  onSelectStagePiano?: () => void;
}) {
  const slatOffsets = [-3.6, -2.0, -0.4, 1.2, 2.8, 4.4, 6.0, 7.6];
  const chandelierZ = [1.8, 5.4];
  const [pianoHovered, setPianoHovered] = useState(false);

  const isConcert = venueStyle === 'CONCERT';
  const accentStripColor = isConcert ? '#38bdf8' : sconceColor;

  return (
    <group>
      {/* Main Satin Hardwood / Dark Marble Floor (soft satin light sheen) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2.2]} receiveShadow>
        <planeGeometry args={[14, 16]} />
        <meshPhysicalMaterial
          color={isConcert ? '#121218' : '#2d1a10'}
          roughness={isConcert ? 0.32 : 0.38}
          metalness={isConcert ? 0.25 : 0.15}
          clearcoat={0.55}
          clearcoatRoughness={0.28}
          envMapIntensity={1.25}
        />
      </mesh>

      {/* Central Aisle Carpet */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 4.6]} receiveShadow>
        <planeGeometry args={[1.35, 8.6]} />
        <meshStandardMaterial color={isConcert ? '#1e1b4b' : '#6b141a'} roughness={0.9} />
      </mesh>

      {/* Aisle Step-Light Strips */}
      <mesh position={[-0.7, 0.015, 4.6]}>
        <boxGeometry args={[0.04, 0.02, 8.6]} />
        <meshStandardMaterial color={accentStripColor} emissive={accentStripColor} emissiveIntensity={1.6} />
      </mesh>
      <mesh position={[0.7, 0.015, 4.6]}>
        <boxGeometry args={[0.04, 0.02, 8.6]} />
        <meshStandardMaterial color={accentStripColor} emissive={accentStripColor} emissiveIntensity={1.6} />
      </mesh>

      {/* Tiered Risers for Rows C and D */}
      <mesh position={[0, 0.06, 5.1]} receiveShadow>
        <boxGeometry args={[10.5, 0.12, 1.7]} />
        <meshStandardMaterial color="#2e1b11" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.2, 6.9]} receiveShadow>
        <boxGeometry args={[10.5, 0.4, 1.9]} />
        <meshStandardMaterial color="#28170e" roughness={0.75} />
      </mesh>

      {/* Left & Right Acoustic Wood Walls */}
      <mesh position={[-6.8, 3.2, 2.2]} receiveShadow>
        <boxGeometry args={[0.3, 6.8, 16]} />
        <meshStandardMaterial color="#382014" roughness={0.75} />
      </mesh>
      <mesh position={[6.8, 3.2, 2.2]} receiveShadow>
        <boxGeometry args={[0.3, 6.8, 16]} />
        <meshStandardMaterial color="#382014" roughness={0.75} />
      </mesh>
      {/* Rear Wall */}
      <mesh position={[0, 3.2, 10.0]} receiveShadow>
        <boxGeometry args={[14, 6.8, 0.3]} />
        <meshStandardMaterial color="#2d190f" roughness={0.8} />
      </mesh>

      {/* Acoustic Timber Ribs + Warm Wall Sconces */}
      {slatOffsets.map((z) => (
        <group key={z}>
          <mesh position={[-6.58, 3.1, z]}>
            <boxGeometry args={[0.16, 6.2, 0.28]} />
            <meshStandardMaterial color="#593521" roughness={0.6} />
          </mesh>
          <mesh position={[6.58, 3.1, z]}>
            <boxGeometry args={[0.16, 6.2, 0.28]} />
            <meshStandardMaterial color="#593521" roughness={0.6} />
          </mesh>
          {/* Glowing Wall Sconces */}
          <mesh position={[-6.45, 2.8, z]}>
            <cylinderGeometry args={[0.08, 0.05, 0.32, 10]} />
            <meshStandardMaterial color={sconceColor} emissive={sconceColor} emissiveIntensity={1.8} />
          </mesh>
          <mesh position={[6.45, 2.8, z]}>
            <cylinderGeometry args={[0.08, 0.05, 0.32, 10]} />
            <meshStandardMaterial color={sconceColor} emissive={sconceColor} emissiveIntensity={1.8} />
          </mesh>
        </group>
      ))}

      {/* Coffered Ceiling & Chandeliers */}
      <mesh position={[0, 6.5, 2.2]}>
        <boxGeometry args={[14, 0.3, 16]} />
        <meshStandardMaterial color="#21130c" roughness={0.85} />
      </mesh>
      {chandelierZ.map((z) => (
        <group key={z} position={[0, 5.6, z]}>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.9, 8]} />
            <meshPhysicalMaterial color="#f59e0b" metalness={0.95} roughness={0.12} clearcoat={0.8} envMapIntensity={1.8} />
          </mesh>
          <mesh>
            <torusGeometry args={[0.75, 0.04, 8, 24]} />
            <meshPhysicalMaterial color="#f59e0b" metalness={0.95} roughness={0.12} clearcoat={0.8} envMapIntensity={1.8} />
          </mesh>
          <mesh position={[0, -0.05, 0]}>
            <sphereGeometry args={[0.2, 12, 12]} />
            <meshStandardMaterial color="#fef3c7" emissive={sconceColor} emissiveIntensity={2.0} />
          </mesh>
          {enableChandelierLights && (
            <pointLight position={[0, -0.3, 0]} intensity={0.55} distance={7.5} color="#f59e0b" />
          )}
        </group>
      ))}

      {/* Proscenium Stage Platform (Satin Polished Hardwood) */}
      <mesh position={[0, 0.22, -2.2]} receiveShadow castShadow>
        <boxGeometry args={[11.2, 0.44, 4.6]} />
        <meshPhysicalMaterial
          color="#5c361d"
          roughness={0.32}
          metalness={0.15}
          clearcoat={0.6}
          clearcoatRoughness={0.22}
          envMapIntensity={1.3}
        />
      </mesh>
      {/* Stage Front Polished Brass Trim & Footlights */}
      <mesh position={[0, 0.43, 0.12]}>
        <boxGeometry args={[11.2, 0.05, 0.06]} />
        <meshPhysicalMaterial color="#fbbf24" metalness={0.96} roughness={0.1} clearcoat={0.9} envMapIntensity={2.0} />
      </mesh>
      {[-3.2, -1.6, 0, 1.6, 3.2].map((x) => (
        <mesh key={x} position={[x, 0.46, 0.02]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color="#fef08a" emissive="#fbbf24" emissiveIntensity={2.0} />
        </mesh>
      ))}

      {/* Velvet Stage Curtains (Wings + Top Valance + Warm Acoustic Backdrop) */}
      <mesh position={[0, 3.1, -4.45]}>
        <boxGeometry args={[11.6, 5.8, 0.25]} />
        <meshStandardMaterial color="#4a161b" roughness={0.85} />
      </mesh>
      {/* Golden Acoustic Arch Panel Behind Performer */}
      <mesh position={[0, 2.7, -4.28]}>
        <boxGeometry args={[6.4, 4.2, 0.08]} />
        <meshStandardMaterial color="#5e3a22" roughness={0.55} />
      </mesh>
      <mesh position={[-5.1, 3.0, -3.5]}>
        <cylinderGeometry args={[0.65, 0.75, 5.6, 14]} />
        <meshStandardMaterial color="#58141a" roughness={0.85} />
      </mesh>
      <mesh position={[5.1, 3.0, -3.5]}>
        <cylinderGeometry args={[0.65, 0.75, 5.6, 14]} />
        <meshStandardMaterial color="#58141a" roughness={0.85} />
      </mesh>
      <mesh position={[0, 5.6, -0.3]}>
        <boxGeometry args={[12.5, 0.9, 0.35]} />
        <meshStandardMaterial color="#58141a" roughness={0.85} />
      </mesh>

      {/* Detailed Stage Grand Piano (High-Gloss Steinway Clearcoat Lacquer + Brass Trim — Clickable ONLY in Chamber/Opera) */}
      <group
        position={[-1.4, 0.44, -2.1]}
        onClick={(e) => {
          if (isConcert) return;
          e.stopPropagation();
          onSelectStagePiano?.();
        }}
        onPointerOver={() => {
          if (isConcert) return;
          document.body.style.cursor = 'pointer';
          setPianoHovered(true);
        }}
        onPointerOut={() => {
          if (isConcert) return;
          document.body.style.cursor = 'auto';
          setPianoHovered(false);
        }}
      >
        {!isConcert && pianoHovered && (
          <Html position={[0, 1.38, 0.2]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
            <span className="whitespace-nowrap rounded-full border border-amber-400/70 bg-stone-950/90 px-3 py-1 text-[10px] font-bold text-amber-200 shadow-lg">
              🎹 Bấm mở Bộ Nhạc Cụ Thính Phòng • Opera (Piano / Guitar / Bass / Violin / Drums)
            </span>
          </Html>
        )}
        {/* Piano Body */}
        <mesh position={[0, 0.58, 0]} castShadow>
          <boxGeometry args={[1.65, 0.24, 1.25]} />
          <meshPhysicalMaterial
            color="#09090b"
            roughness={0.08}
            metalness={0.2}
            clearcoat={1}
            clearcoatRoughness={0.04}
            envMapIntensity={2.1}
          />
        </mesh>
        {/* Gold Soundboard Inner Rim */}
        <mesh position={[0, 0.705, 0]}>
          <boxGeometry args={[1.56, 0.02, 1.16]} />
          <meshPhysicalMaterial color="#f59e0b" metalness={0.92} roughness={0.16} clearcoat={0.8} envMapIntensity={1.8} />
        </mesh>
        {/* Open Piano Lid */}
        <mesh position={[0.1, 0.92, -0.1]} rotation={[0, 0, -0.45]} castShadow>
          <boxGeometry args={[1.55, 0.04, 1.15]} />
          <meshPhysicalMaterial
            color="#09090b"
            roughness={0.06}
            metalness={0.25}
            clearcoat={1}
            clearcoatRoughness={0.03}
            envMapIntensity={2.2}
          />
        </mesh>
        {/* White & Glossy Keyboard Strip */}
        <mesh position={[0, 0.62, 0.65]}>
          <boxGeometry args={[1.25, 0.05, 0.16]} />
          <meshPhysicalMaterial color="#f8fafc" roughness={0.12} clearcoat={0.9} />
        </mesh>
        {/* Piano Legs with Brass Ferrules */}
        {[
          [-0.65, 0.28, 0.5],
          [0.65, 0.28, 0.5],
          [0, 0.28, -0.48],
        ].map(([lx, ly, lz], i) => (
          <mesh key={i} position={[lx, ly, lz]}>
            <cylinderGeometry args={[0.045, 0.035, 0.56]} />
            <meshPhysicalMaterial color="#09090b" roughness={0.1} metalness={0.3} clearcoat={1} envMapIntensity={1.8} />
          </mesh>
        ))}
        {/* Piano Bench */}
        <mesh position={[0, 0.36, 1.05]} castShadow>
          <boxGeometry args={[0.8, 0.08, 0.36]} />
          <meshPhysicalMaterial color="#18181b" roughness={0.25} clearcoat={0.5} />
        </mesh>
      </group>

      {/* Center Stage Vocal Mic Stand (Polished Chrome & Metallic Capsule) */}
      <group position={[0.8, 0.44, -1.3]}>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.18, 0.2, 0.04, 12]} />
          <meshPhysicalMaterial color="#18181b" metalness={0.88} roughness={0.16} clearcoat={0.8} envMapIntensity={1.7} />
        </mesh>
        <mesh position={[0, 0.62, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 1.2, 8]} />
          <meshPhysicalMaterial color="#e4e4e7" metalness={0.96} roughness={0.08} clearcoat={1} envMapIntensity={2.2} />
        </mesh>
        <mesh position={[0, 1.24, 0.03]}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshPhysicalMaterial color="#f4f4f5" metalness={0.95} roughness={0.12} clearcoat={0.9} envMapIntensity={2.0} />
        </mesh>
      </group>

      {/* Left & Right Stage Pro Monitor Speaker Stacks (Glossy Lacquer + Metallic Woofer Cones) */}
      {[-1, 1].map((dir) => (
        <group key={`stage-spk-${dir}`} position={[dir * 3.85, 1.02, -1.55]} rotation={[0, -dir * 0.32, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.68, 1.16, 0.54]} />
            <meshPhysicalMaterial
              color="#111115"
              roughness={0.14}
              metalness={0.45}
              clearcoat={0.95}
              clearcoatRoughness={0.08}
              envMapIntensity={1.8}
            />
          </mesh>
          <mesh position={[0, 0.28, 0.275]}>
            <torusGeometry args={[0.11, 0.022, 10, 24]} />
            <meshPhysicalMaterial color="#f59e0b" metalness={0.95} roughness={0.12} clearcoat={1} envMapIntensity={2.1} />
          </mesh>
          <mesh position={[0, -0.18, 0.275]}>
            <torusGeometry args={[0.21, 0.036, 12, 28]} />
            <meshPhysicalMaterial
              color={isConcert ? '#38bdf8' : '#d4af37'}
              metalness={0.92}
              roughness={0.14}
              clearcoat={1}
              envMapIntensity={2.0}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Bright, cozy 3D KTV Lounge with LED dance floor, illuminated cocktail table (drinks, fruit platter, table mics),
// cozy U-shaped sofa backdrop & dual vocal mic podium
const LED_TILE_PALETTE = ['#ec4899', '#38bdf8', '#a855f7', '#facc15', '#34d399', '#f472b6'];

const DISCO_BEAM_COLORS = ['#ec4899', '#38bdf8', '#a855f7', '#fbbf24', '#34d399', '#f43f5e', '#60a5fa', '#e879f9'];

/**
 * 360-degree rotating Karaoke Disco Ball + sweeping radial light cones & dynamic color wash.
 */
function KaraokeDiscoLightRig({
  enableLights,
  isLiveOrActive,
}: {
  enableLights: boolean;
  isLiveOrActive: boolean;
}) {
  const spinGroupRef = useRef<THREE.Group>(null);
  const beamMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const ballMatRef = useRef<THREE.MeshPhysicalMaterial>(null);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const { bass, beatHit } = audioEngine.readBeatBass(isLiveOrActive, t);
    const g = spinGroupRef.current;
    if (g) {
      const spinSpeed = isLiveOrActive ? 1.15 + bass * 1.4 : 0.45;
      g.rotation.y = (g.rotation.y + delta * spinSpeed) % (Math.PI * 2);
      g.rotation.x = Math.sin(t * 0.9) * 0.14;
      g.rotation.z = Math.cos(t * 0.75) * 0.14;
    }

    if (ballMatRef.current) {
      ballMatRef.current.emissiveIntensity = isLiveOrActive ? 0.35 + bass * 0.65 : 0.2;
    }

    for (let i = 0; i < 8; i++) {
      const mat = beamMatRefs.current[i];
      if (!mat) continue;
      mat.opacity = (isLiveOrActive ? 0.11 + bass * 0.18 + (beatHit ? 0.08 : 0) : 0.06);
    }
  });

  return (
    <group position={[0, 5.45, 4.1]}>
      {/* Ceiling Hanging Rod */}
      <mesh position={[0, 0.52, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 1.05, 8]} />
        <meshPhysicalMaterial color="#fbbf24" metalness={0.96} roughness={0.1} clearcoat={1} envMapIntensity={2.0} />
      </mesh>

      {/* 360-degree Spinning Disco Ball + 8 Radial Sweeping Light Cones */}
      <group ref={spinGroupRef}>
        <mesh>
          <icosahedronGeometry args={[0.42, 2]} />
          <meshPhysicalMaterial
            ref={ballMatRef}
            color="#ffffff"
            emissive="#e879f9"
            emissiveIntensity={0.35}
            metalness={0.98}
            roughness={0.04}
            clearcoat={1}
            clearcoatRoughness={0.02}
            envMapIntensity={2.5}
            flatShading
          />
        </mesh>

        {DISCO_BEAM_COLORS.map((col, i) => {
          const yaw = (i / 8) * Math.PI * 2;
          const tilt = i % 2 === 0 ? 0.92 : 1.12;
          return (
            <group key={i} rotation={[0, yaw, 0]}>
              <group rotation={[tilt, 0, 0]}>
                <mesh position={[0, -3.1, 0]}>
                  <coneGeometry args={[0.92, 6.2, 14, 1, true]} />
                  <meshBasicMaterial
                    ref={(el) => {
                      beamMatRefs.current[i] = el;
                    }}
                    color={col}
                    transparent
                    opacity={0.12}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                    blending={THREE.AdditiveBlending}
                  />
                </mesh>
              </group>
            </group>
          );
        })}

        {enableLights && (
          <>
            <pointLight position={[1.4, -0.4, 0]} intensity={2.2} distance={13} color="#ec4899" />
            <pointLight position={[-1.4, -0.4, 0]} intensity={2.2} distance={13} color="#38bdf8" />
          </>
        )}
      </group>
    </group>
  );
}

function KaraokeLoungeArchitecture({
  sconceColor,
  enableLights,
  isLiveOrActive,
  onSelectKaraokeMic,
}: {
  sconceColor: string;
  enableLights: boolean;
  isLiveOrActive: boolean;
  onSelectKaraokeMic?: (slot: 0 | 1) => void;
}) {
  const neonSideZ = [-2.5, -0.2, 2.1, 4.4, 6.7];
  const ledTileRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const phaseRef = useRef(0);
  const [hoveredMicSlot, setHoveredMicSlot] = useState<number | null>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const { bass, beatHit } = audioEngine.readBeatBass(isLiveOrActive, t);
    if (beatHit) phaseRef.current += 1;
    for (let i = 0; i < 12; i++) {
      const mat = ledTileRefs.current[i];
      if (!mat) continue;
      const colorHex = LED_TILE_PALETTE[(i + phaseRef.current) % LED_TILE_PALETTE.length];
      mat.emissive.set(colorHex);
      mat.color.set(colorHex);
      mat.emissiveIntensity = 0.65 + bass * 1.4 + Math.sin(t * 3 + i * 0.7) * 0.2;
    }
  });

  return (
    <group>
      {/* Satin Polished Marble Lounge Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2.2]} receiveShadow>
        <planeGeometry args={[14, 16]} />
        <meshPhysicalMaterial
          color="#241a38"
          roughness={0.32}
          metalness={0.22}
          clearcoat={0.6}
          clearcoatRoughness={0.24}
          envMapIntensity={1.35}
        />
      </mesh>

      {/* Warm Soft Lounge Rug beneath Table & Sofas */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 4.65]} receiveShadow>
        <planeGeometry args={[5.4, 5.2]} />
        <meshStandardMaterial color="#4b2c69" roughness={0.85} />
      </mesh>

      {/* Glowing Multi-Color LED Dance Floor right in front of the Karaoke Screen */}
      <group position={[0, 0.015, 1.4]}>
        <mesh position={[0, -0.005, 0]}>
          <boxGeometry args={[4.5, 0.02, 1.85]} />
          <meshStandardMaterial color="#1e1b4b" metalness={0.5} roughness={0.3} />
        </mesh>
        {Array.from({ length: 12 }, (_, idx) => {
          const col = idx % 4;
          const row = Math.floor(idx / 4);
          const tx = -1.56 + col * 1.04;
          const tz = -0.56 + row * 0.56;
          return (
            <mesh key={idx} position={[tx, 0.01, tz]}>
              <boxGeometry args={[0.92, 0.015, 0.46]} />
              <meshStandardMaterial
                ref={(el) => {
                  ledTileRefs.current[idx] = el;
                }}
                color={LED_TILE_PALETTE[idx % LED_TILE_PALETTE.length]}
                emissive={LED_TILE_PALETTE[idx % LED_TILE_PALETTE.length]}
                emissiveIntensity={0.95}
                roughness={0.2}
              />
            </mesh>
          );
        })}
      </group>

      {/* Bright Warm-Lavender Acoustic Lounge Walls */}
      <mesh position={[-6.8, 3.2, 2.2]} receiveShadow>
        <boxGeometry args={[0.3, 6.8, 16]} />
        <meshStandardMaterial color="#4d3d6e" roughness={0.6} />
      </mesh>
      <mesh position={[6.8, 3.2, 2.2]} receiveShadow>
        <boxGeometry args={[0.3, 6.8, 16]} />
        <meshStandardMaterial color="#4d3d6e" roughness={0.6} />
      </mesh>
      <mesh position={[0, 3.2, 10.0]} receiveShadow>
        <boxGeometry args={[14, 6.8, 0.3]} />
        <meshStandardMaterial color="#433463" roughness={0.65} />
      </mesh>
      <mesh position={[0, 6.5, 2.2]}>
        <boxGeometry args={[14, 0.3, 16]} />
        <meshStandardMaterial color="#352852" roughness={0.7} />
      </mesh>

      {/* Vertical Neon Wall Light Tubes + Bright Acoustic Wood Columns */}
      {neonSideZ.map((z, i) => {
        const neonCol = i % 2 === 0 ? '#f472b6' : '#38bdf8';
        return (
          <group key={z}>
            <mesh position={[-6.58, 3.0, z]}>
              <boxGeometry args={[0.14, 5.2, 0.26]} />
              <meshStandardMaterial color="#70598f" roughness={0.5} />
            </mesh>
            <mesh position={[6.58, 3.0, z]}>
              <boxGeometry args={[0.14, 5.2, 0.26]} />
              <meshStandardMaterial color="#70598f" roughness={0.5} />
            </mesh>
            <mesh position={[-6.48, 3.0, z]}>
              <boxGeometry args={[0.06, 4.3, 0.08]} />
              <meshStandardMaterial color={neonCol} emissive={neonCol} emissiveIntensity={1.6} />
            </mesh>
            <mesh position={[6.48, 3.0, z]}>
              <boxGeometry args={[0.06, 4.3, 0.08]} />
              <meshStandardMaterial color={neonCol} emissive={neonCol} emissiveIntensity={1.6} />
            </mesh>
          </group>
        );
      })}

      {/* Bright Overhead KTV Neon Light Ring + 360° Rotating Disco Ball */}
      <group position={[0, 5.8, 4.1]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.65, 0.06, 10, 36]} />
          <meshStandardMaterial color={sconceColor} emissive={sconceColor} emissiveIntensity={2.0} />
        </mesh>
        {enableLights && <pointLight position={[0, -0.35, 0]} intensity={2.6} distance={14} color="#fdf4ff" />}
      </group>
      <KaraokeDiscoLightRig enableLights={enableLights} isLiveOrActive={isLiveOrActive} />

      {/* Karaoke Singing Stage Platform with Satin Sheen & Glowing Neon Edge (y = 0.44 matches getAuditoriumFloorY) */}
      <mesh position={[0, 0.22, -2.2]} receiveShadow castShadow>
        <boxGeometry args={[11.2, 0.44, 4.6]} />
        <meshPhysicalMaterial
          color="#2d1d47"
          roughness={0.28}
          metalness={0.28}
          clearcoat={0.65}
          clearcoatRoughness={0.2}
          envMapIntensity={1.45}
        />
      </mesh>
      <mesh position={[0, 0.43, 0.12]}>
        <boxGeometry args={[11.2, 0.05, 0.07]} />
        <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1.6} />
      </mesh>
      <mesh position={[0, 3.1, -4.45]}>
        <boxGeometry args={[11.6, 5.8, 0.25]} />
        <meshStandardMaterial color="#2f214a" roughness={0.7} />
      </mesh>

      {/* Left & Right Karaoke Stage Pro Subwoofer & Horn Speaker Stacks */}
      {[-1, 1].map((dir) => (
        <group key={`ktv-spk-${dir}`} position={[dir * 4.1, 1.05, -1.6]} rotation={[0, -dir * 0.34, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.72, 1.22, 0.56]} />
            <meshPhysicalMaterial
              color="#14111f"
              roughness={0.12}
              metalness={0.5}
              clearcoat={1}
              clearcoatRoughness={0.06}
              envMapIntensity={1.9}
            />
          </mesh>
          <mesh position={[0, 0.3, 0.285]}>
            <torusGeometry args={[0.11, 0.022, 10, 24]} />
            <meshPhysicalMaterial color="#f472b6" emissive="#ec4899" emissiveIntensity={0.8} metalness={0.9} roughness={0.1} clearcoat={1} />
          </mesh>
          <mesh position={[0, -0.18, 0.285]}>
            <torusGeometry args={[0.22, 0.038, 12, 28]} />
            <meshPhysicalMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.8} metalness={0.9} roughness={0.1} clearcoat={1} />
          </mesh>
        </group>
      ))}

      {/* Glowing Vocal Mic Podium Pads (Clickable to step onto Karaoke stage) */}
      {[-0.85, 0.85].map((mx, idx) => (
        <mesh
          key={`pad-${mx}`}
          position={[mx, 0.45, -1.25]}
          onClick={(e) => {
            e.stopPropagation();
            onSelectKaraokeMic?.(idx as 0 | 1);
          }}
          onPointerOver={() => {
            document.body.style.cursor = 'pointer';
            setHoveredMicSlot(idx);
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'auto';
            setHoveredMicSlot((cur) => (cur === idx ? null : cur));
          }}
        >
          <cylinderGeometry args={[0.52, 0.56, 0.03, 24]} />
          <meshStandardMaterial
            color={idx === 0 ? '#f472b6' : '#38bdf8'}
            emissive={idx === 0 ? '#ec4899' : '#0ea5e9'}
            emissiveIntensity={hoveredMicSlot === idx ? 2.1 : 1.1}
            roughness={0.3}
          />
        </mesh>
      ))}

      {/* Decorated KTV Smoked-Glass Cocktail Table inside U-Sofa: Silver Fruit Platter, Crystal Drinks & Chrome Table Mics */}
      <group position={[0, 0, 4.2]}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[1.9, 0.34, 2.5]} />
          <meshPhysicalMaterial color="#271842" roughness={0.22} metalness={0.45} clearcoat={0.7} envMapIntensity={1.4} />
        </mesh>
        <mesh position={[0, 0.4, 0]} receiveShadow>
          <boxGeometry args={[2.35, 0.06, 2.95]} />
          <meshPhysicalMaterial
            color="#1e293b"
            roughness={0.06}
            metalness={0.35}
            clearcoat={1}
            clearcoatRoughness={0.03}
            envMapIntensity={2.2}
          />
        </mesh>
        <mesh position={[0, 0.39, 0]}>
          <boxGeometry args={[2.38, 0.025, 2.98]} />
          <meshStandardMaterial color="#f472b6" emissive="#f472b6" emissiveIntensity={1.6} />
        </mesh>

        {/* Center Polished Silver Fruit Platter */}
        <group position={[0, 0.45, 0]}>
          <mesh>
            <cylinderGeometry args={[0.38, 0.3, 0.04, 20]} />
            <meshPhysicalMaterial color="#f1f5f9" metalness={0.96} roughness={0.08} clearcoat={1} envMapIntensity={2.2} />
          </mesh>
          {/* Red Apple, Yellow Pineapple/Mango, Purple Grapes, Green Melon */}
          <mesh position={[-0.12, 0.07, 0.06]}>
            <sphereGeometry args={[0.08, 10, 10]} />
            <meshStandardMaterial color="#ef4444" roughness={0.4} />
          </mesh>
          <mesh position={[0.12, 0.08, 0.04]}>
            <sphereGeometry args={[0.085, 10, 10]} />
            <meshStandardMaterial color="#facc15" roughness={0.45} />
          </mesh>
          <mesh position={[0.02, 0.09, -0.11]}>
            <sphereGeometry args={[0.075, 10, 10]} />
            <meshStandardMaterial color="#a855f7" roughness={0.35} />
          </mesh>
          <mesh position={[-0.08, 0.06, -0.09]}>
            <sphereGeometry args={[0.07, 10, 10]} />
            <meshStandardMaterial color="#22c55e" roughness={0.45} />
          </mesh>
        </group>

        {/* 4 Colorful Drinks with Straws */}
        {[
          { pos: [-0.62, 0.43, -0.72] as const, color: '#38bdf8' },
          { pos: [0.62, 0.43, -0.72] as const, color: '#f472b6' },
          { pos: [-0.62, 0.43, 0.72] as const, color: '#fbbf24' },
          { pos: [0.62, 0.43, 0.72] as const, color: '#34d399' },
        ].map((cup, i) => (
          <group key={i} position={cup.pos}>
            <mesh position={[0, 0.09, 0]}>
              <cylinderGeometry args={[0.07, 0.055, 0.18, 12]} />
              <meshStandardMaterial color={cup.color} emissive={cup.color} emissiveIntensity={0.35} roughness={0.2} />
            </mesh>
            <mesh position={[0.02, 0.19, 0]} rotation={[0, 0, -0.22]}>
              <cylinderGeometry args={[0.01, 0.01, 0.12, 6]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
          </group>
        ))}

        {/* 2 Wireless Karaoke Microphones resting neatly on Table edge (Click to step onto stage) */}
        {[-0.45, 0.45].map((tx, i) => (
          <group
            key={`table-mic-${i}`}
            position={[tx, 0.46, 1.05]}
            rotation={[0, i === 0 ? 0.35 : -0.35, Math.PI / 2]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectKaraokeMic?.(i as 0 | 1);
            }}
            onPointerOver={() => {
              document.body.style.cursor = 'pointer';
              setHoveredMicSlot(10 + i);
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'auto';
              setHoveredMicSlot((cur) => (cur === 10 + i ? null : cur));
            }}
          >
            {/* Invisible larger click hitbox so the table microphone is effortless to click */}
            <mesh>
              <cylinderGeometry args={[0.16, 0.16, 0.42, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <mesh>
              <cylinderGeometry args={[0.026, 0.022, 0.24, 10]} />
              <meshPhysicalMaterial color="#18181b" metalness={0.85} roughness={0.18} clearcoat={0.9} envMapIntensity={1.8} />
            </mesh>
            <mesh position={[0, 0.14, 0]}>
              <sphereGeometry args={[0.036, 10, 10]} />
              <meshPhysicalMaterial
                color={i === 0 ? '#f472b6' : '#38bdf8'}
                emissive={i === 0 ? '#ec4899' : '#0ea5e9'}
                emissiveIntensity={hoveredMicSlot === 10 + i ? 1.8 : 0.6}
                metalness={0.88}
                roughness={0.14}
                clearcoat={1}
              />
            </mesh>
            {hoveredMicSlot === 10 + i && (
              <Html position={[0, 0, -0.25]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
                <span className="whitespace-nowrap rounded-full border border-pink-400/60 bg-stone-950/90 px-2.5 py-1 text-[10px] font-bold text-pink-200 shadow-lg">
                  🎤 Bấm cầm Mic {i + 1} lên sân khấu hát
                </span>
              </Html>
            )}
          </group>
        ))}
      </group>

      {/* Brighter U-Shaped Velvet Lounge Backrest Framing Rails */}
      <mesh position={[-3.95, 0.45, 3.88]} castShadow>
        <boxGeometry args={[0.24, 0.85, 4.85]} />
        <meshStandardMaterial color="#7e22ce" roughness={0.7} />
      </mesh>
      <mesh position={[3.95, 0.45, 3.88]} castShadow>
        <boxGeometry args={[0.24, 0.85, 4.85]} />
        <meshStandardMaterial color="#7e22ce" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.45, 7.36]} castShadow>
        <boxGeometry args={[5.2, 0.85, 0.24]} />
        <meshStandardMaterial color="#7e22ce" roughness={0.7} />
      </mesh>

      {/* Dual Front Karaoke Vocal Mic Stands (Polished Chrome & Metallic Capsule — Clickable to sing on stage) */}
      {[-0.85, 0.85].map((mx, idx) => (
        <group
          key={mx}
          position={[mx, 0.44, -1.25]}
          onClick={(e) => {
            e.stopPropagation();
            onSelectKaraokeMic?.(idx as 0 | 1);
          }}
          onPointerOver={() => {
            document.body.style.cursor = 'pointer';
            setHoveredMicSlot(idx);
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'auto';
            setHoveredMicSlot((cur) => (cur === idx ? null : cur));
          }}
        >
          {/* Tight hit cylinder around the mic stand shaft so it never blocks clicking seats behind it */}
          <mesh position={[0, 0.62, 0]}>
            <cylinderGeometry args={[0.11, 0.11, 1.22, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.17, 0.19, 0.04, 12]} />
            <meshPhysicalMaterial color="#27272a" metalness={0.88} roughness={0.15} clearcoat={0.8} envMapIntensity={1.8} />
          </mesh>
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 1.16, 8]} />
            <meshPhysicalMaterial color="#f4f4f5" metalness={0.96} roughness={0.08} clearcoat={1} envMapIntensity={2.2} />
          </mesh>
          <mesh position={[0, 1.2, 0.03]}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshPhysicalMaterial
              color={idx === 0 ? '#f472b6' : '#38bdf8'}
              emissive={idx === 0 ? '#f472b6' : '#38bdf8'}
              emissiveIntensity={hoveredMicSlot === idx ? 2.4 : 1.2}
              metalness={0.85}
              roughness={0.12}
              clearcoat={1}
              envMapIntensity={2.0}
            />
          </mesh>
          {hoveredMicSlot === idx && (
            <Html position={[0, 1.48, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
              <span className="whitespace-nowrap rounded-full border border-amber-400/60 bg-stone-950/90 px-2.5 py-1 text-[10px] font-bold text-amber-200 shadow-lg">
                🎤 Bấm lên sân khấu hát (Mic {idx + 1})
              </span>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}

interface ObstacleBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  allowExitIfInside?: boolean;
}

const AVATAR_COLLISION_RADIUS = 0.28;

function resolveAuditoriumCollision(
  curX: number,
  curZ: number,
  nextX: number,
  nextZ: number,
  venueStyle: VenueStyle,
  seats: RoomDTO['seats']
): [number, number] {
  const boxes: ObstacleBox[] = [];

  // 1. All Audience Seats / KTV Sofas
  const seatHalfW = venueStyle === 'KARAOKE' ? 0.44 : 0.34;
  const seatHalfD = venueStyle === 'KARAOKE' ? 0.36 : 0.3;
  for (const seat of seats) {
    const [sx, , sz] = seat.position;
    boxes.push({
      minX: sx - seatHalfW,
      maxX: sx + seatHalfW,
      minZ: sz - seatHalfD,
      maxZ: sz + seatHalfD,
      allowExitIfInside: true,
    });
  }

  if (venueStyle === 'KARAOKE') {
    // KTV Glass Cocktail Table in center of U-sofa ([0, 0, 4.2], 2.35 x 2.95)
    boxes.push({ minX: -1.18, maxX: 1.18, minZ: 2.72, maxZ: 5.68 });
    // U-Shaped Sofa Backrest Rails
    boxes.push({ minX: -4.12, maxX: -3.78, minZ: 1.45, maxZ: 6.32 });
    boxes.push({ minX: 3.78, maxX: 4.12, minZ: 1.45, maxZ: 6.32 });
    boxes.push({ minX: -2.62, maxX: 2.62, minZ: 7.2, maxZ: 7.52 });
    // Karaoke Stage Left & Right Subwoofer Speakers
    boxes.push({ minX: -4.52, maxX: -3.68, minZ: -1.96, maxZ: -1.24 });
    boxes.push({ minX: 3.68, maxX: 4.52, minZ: -1.96, maxZ: -1.24 });
  } else {
    // Chamber / Concert Stage Grand Piano Body ([-1.4, 0.44, -2.1], 1.65 x 1.25)
    boxes.push({ minX: -2.24, maxX: -0.56, minZ: -2.74, maxZ: -1.46 });
    // Piano Bench ([-1.4, 0.44, -1.05], 0.8 x 0.36) — allow smooth exit if seated/playing
    boxes.push({ minX: -1.82, maxX: -0.98, minZ: -1.24, maxZ: -0.86, allowExitIfInside: true });
    // Chamber / Concert Stage Monitor Speakers ([±3.85, 1.02, -1.55], 0.68 x 0.54)
    boxes.push({ minX: -4.24, maxX: -3.46, minZ: -1.88, maxZ: -1.22 });
    boxes.push({ minX: 3.46, maxX: 4.24, minZ: -1.88, maxZ: -1.22 });
    // Center Stage Vocal Mic Stand ([0.8, 0.44, -1.3])
    boxes.push({ minX: 0.62, maxX: 0.98, minZ: -1.48, maxZ: -1.12 });
  }

  let rx = nextX;
  let rz = nextZ;

  // Two-pass AABB push-out for smooth corner sliding along tables/chairs/piano
  for (let pass = 0; pass < 2; pass++) {
    for (const box of boxes) {
      const eMinX = box.minX - AVATAR_COLLISION_RADIUS;
      const eMaxX = box.maxX + AVATAR_COLLISION_RADIUS;
      const eMinZ = box.minZ - AVATAR_COLLISION_RADIUS;
      const eMaxZ = box.maxZ + AVATAR_COLLISION_RADIUS;

      if (box.allowExitIfInside) {
        const wasInside = curX > eMinX && curX < eMaxX && curZ > eMinZ && curZ < eMaxZ;
        if (wasInside) continue;
      }

      if (rx > eMinX && rx < eMaxX && rz > eMinZ && rz < eMaxZ) {
        const overlapLeft = rx - eMinX;
        const overlapRight = eMaxX - rx;
        const overlapTop = rz - eMinZ;
        const overlapBottom = eMaxZ - rz;
        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

        if (minOverlap === overlapLeft) rx = eMinX;
        else if (minOverlap === overlapRight) rx = eMaxX;
        else if (minOverlap === overlapTop) rz = eMinZ;
        else rz = eMaxZ;
      }
    }
  }

  return [rx, rz];
}

function AuditoriumController({
  localUserId,
  canAccessStage,
  venueStyle,
  seats,
  pianoKeyboardActive = false,
  cameraMode,
  qualityPreset,
  maxVisibleAvatars,
  controlsRef,
  onPerfSample,
}: {
  localUserId: string;
  canAccessStage: boolean;
  venueStyle: VenueStyle;
  seats: RoomDTO['seats'];
  pianoKeyboardActive?: boolean;
  cameraMode: CameraMode;
  qualityPreset: QualityPreset;
  maxVisibleAvatars: number;
  controlsRef: React.RefObject<ComponentRef<typeof OrbitControls> | null>;
  onPerfSample: (fps: number, drawCalls: number) => void;
}) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const lastBroadcast = useRef(0);
  const frameCounter = useRef({ frames: 0, lastAt: performance.now() });
  const [avatarKeys, setAvatarKeys] = useState<string[]>([]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      keys.current[e.key.toLowerCase()] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    if (cameraMode === 'STAGE_VIEW') {
      camera.position.set(0, 2.2, 2.4);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 1.2, -2.2);
        controlsRef.current.update();
      } else {
        camera.lookAt(0, 1.2, -2.2);
      }
    } else if (cameraMode === 'AUDIENCE_ORBIT') {
      camera.position.set(0, 3.6, 8.2);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 1.2, -1.0);
        controlsRef.current.update();
      } else {
        camera.lookAt(0, 1.2, -1.0);
      }
    } else if (cameraMode === 'ROOM_OVERVIEW') {
      camera.position.set(5.2, 5.45, 8.7);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 1.1, 1.5);
        controlsRef.current.update();
      } else {
        camera.lookAt(0, 1.1, 1.5);
      }
    } else if (cameraMode === 'KARAOKE_STAGE_POV') {
      const local = realtimeStore.avatars.get(localUserId);
      const stageX = local ? local.targetPosition[0] * 0.45 : 0;
      camera.position.set(stageX, 2.35, -3.25);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 1.95, 5.8);
        controlsRef.current.update();
      } else {
        camera.lookAt(0, 1.95, 5.8);
      }
    }
  }, [cameraMode, camera, controlsRef, localUserId]);

  useFrame((_state, delta) => {
    // Keep WebGL <canvas> strictly at z-index 10 above occlude="blending" video screens (z-index 0..9)
    // even when non-occluded <Html> nameplates mount and @react-three/drei resets gl.domElement.style.zIndex
    if (gl.domElement.style.zIndex !== '10') {
      gl.domElement.style.zIndex = '10';
      gl.domElement.style.position = 'absolute';
    }

    const currentKeys = Array.from(realtimeStore.avatars.keys());
    if (currentKeys.length !== avatarKeys.length) {
      setAvatarKeys(currentKeys);
    }

    frameCounter.current.frames += 1;
    const now = performance.now();
    if (now - frameCounter.current.lastAt >= 1000) {
      onPerfSample(frameCounter.current.frames, gl.info.render.calls);
      frameCounter.current.frames = 0;
      frameCounter.current.lastAt = now;
    }

    const local = realtimeStore.avatars.get(localUserId);
    if (!local) return;

    let dx = 0;
    let dz = 0;
    if (!pianoKeyboardActive) {
      if (keys.current['w'] || keys.current['arrowup']) dz -= 1;
      if (keys.current['s'] || keys.current['arrowdown']) dz += 1;
      if (keys.current['a'] || keys.current['arrowleft']) dx -= 1;
      if (keys.current['d'] || keys.current['arrowright']) dx += 1;
    }

    if (dx !== 0 || dz !== 0) {
      const speed = 3.5 * delta;
      const minZ = canAccessStage ? -3.2 : 0.8;
      const rawX = Math.max(-5.5, Math.min(5.5, local.targetPosition[0] + dx * speed));
      const rawZ = Math.max(minZ, Math.min(8.5, local.targetPosition[2] + dz * speed));
      const [colX, colZ] = resolveAuditoriumCollision(
        local.targetPosition[0],
        local.targetPosition[2],
        rawX,
        rawZ,
        venueStyle,
        seats
      );
      const nextX = Math.max(-5.5, Math.min(5.5, colX));
      const nextZ = Math.max(minZ, Math.min(8.5, colZ));
      const nextY = getAuditoriumFloorY(nextX, nextZ);
      const nextRot = Math.atan2(dx, dz);

      const wasDancing =
        local.animation === 'DANCE' ||
        local.animation === 'DANCE_2' ||
        local.animation === 'DANCE_3' ||
        local.animation === 'DANCE_4' ||
        local.animation === 'DANCE_5';
      local.targetPosition = [nextX, nextY, nextZ];
      local.targetRotationY = nextRot;
      local.animation = 'WALK';
      local.seatId = undefined;
      if (wasDancing) {
        realtimeStore.notifyUiSync();
      }

      if (now - lastBroadcast.current > 65) {
        lastBroadcast.current = now;
        realtimeStore.sendMove(local.targetPosition, nextRot, 'WALK');
      }
    } else {
      if (!local.seatId) {
        const expectedY = getAuditoriumFloorY(local.targetPosition[0], local.targetPosition[2]);
        if (Math.abs(local.targetPosition[1] - expectedY) > 0.01) {
          local.targetPosition = [local.targetPosition[0], expectedY, local.targetPosition[2]];
        }
      }
      if (local.animation === 'WALK') {
        local.animation = 'IDLE';
        realtimeStore.sendMove(local.targetPosition, local.targetRotationY, 'IDLE');
      }
    }

    if (cameraMode === 'SEAT_POV') {
      camera.position.set(local.targetPosition[0], local.targetPosition[1] + 1.25, local.targetPosition[2] - 0.15);
      camera.lookAt(0, 1.2, -2.2);
    } else if (cameraMode === 'ROOM_OVERVIEW') {
      camera.position.set(5.2, 5.45, 8.7);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 1.1, 1.5);
        controlsRef.current.update();
      } else {
        camera.lookAt(0, 1.1, 1.5);
      }
    } else if (cameraMode === 'KARAOKE_STAGE_POV') {
      camera.position.set(local.targetPosition[0] * 0.45, 2.35, -3.25);
      camera.lookAt(0, 1.95, 5.8);
    }

    // Enforce interior auditorium camera bounds every frame
    clampCameraPosition(camera);
  });

  const entries: AvatarRuntimeEntry[] = [];
  for (const k of avatarKeys) {
    const item = realtimeStore.avatars.get(k);
    if (item) entries.push(item);
  }

  // TBD-06: Cap visible avatars on LOW preset (12 max), always keeping local user and stage artists
  const localAvatar = realtimeStore.avatars.get(localUserId);
  const visibleEntries =
    entries.length <= maxVisibleAvatars
      ? entries
      : entries
          .slice()
          .sort((a, b) => {
            if (a.userId === localUserId) return -1;
            if (b.userId === localUserId) return 1;
            if (a.role === 'ARTIST' && b.role !== 'ARTIST') return -1;
            if (b.role === 'ARTIST' && a.role !== 'ARTIST') return 1;
            if (!localAvatar) return 0;
            const da = Math.hypot(a.position[0] - localAvatar.position[0], a.position[2] - localAvatar.position[2]);
            const db = Math.hypot(b.position[0] - localAvatar.position[0], b.position[2] - localAvatar.position[2]);
            return da - db;
          })
          .slice(0, maxVisibleAvatars);

  return (
    <>
      {visibleEntries.map((entry) => (
        <RiggedAudienceAvatar
          key={entry.userId}
          entry={entry}
          isLocal={entry.userId === localUserId}
          qualityPreset={qualityPreset}
        />
      ))}
    </>
  );
}

export function AuditoriumScene({
  transitionVisual,
  room,
  localUserId,
  localRole,
  lightingPreset,
  cameraMode,
  qualityPreset = 'HIGH',
  youtubeVideoId,
  isYouTubePlaying = false,
  audienceMuted = false,
  musicVolume = 80,
  musicMuted = false,
  canAutoAdvance = false,
  onAutoAdvanceNext,
  onKaraokeSongEnded,
  karaokeScoreCard,
  ytIframeRef,
  onAutoplayBlocked,
  onSelectSeat,
  onSelectKaraokeMic,
  onSelectStagePiano,
  pianoKeyboardActive = false,
  onPerfSample,
}: {
  transitionVisual?: {
    active: boolean;
    phase: 'PREWARM' | 'CROSSFADE';
    progressPct: number;
    elapsedSec: number;
    totalSec: number;
    targetVideoId?: string;
    targetTitle?: string;
    oldScreenOpacity: number;
    newScreenOpacity: number;
  } | null;
  room: RoomDTO;
  localUserId: string;
  localRole: UserRole;
  lightingPreset: SetlistItemDTO['lightingPreset'];
  cameraMode: CameraMode;
  qualityPreset?: QualityPreset;
  youtubeVideoId?: string;
  isYouTubePlaying?: boolean;
  audienceMuted?: boolean;
  musicVolume?: number;
  musicMuted?: boolean;
  canAutoAdvance?: boolean;
  onAutoAdvanceNext?: (expectedIndex: number) => void;
  onKaraokeSongEnded?: (expectedIndex: number, shouldAutoAdvance: boolean) => void;
  karaokeScoreCard?: { score: number; trackTitle?: string } | null;
  ytIframeRef?: React.MutableRefObject<HTMLIFrameElement | null>;
  onAutoplayBlocked?: (blocked: boolean) => void;
  onSelectSeat: (seatId: string) => void;
  onSelectKaraokeMic?: (slot: 0 | 1) => void;
  onSelectStagePiano?: () => void;
  pianoKeyboardActive?: boolean;
  onPerfSample: (fps: number, drawCalls: number) => void;
}) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const venueStyle: VenueStyle = room.venueStyle ?? 'CHAMBER';
  const light = LIGHTING_CONFIG[lightingPreset] ?? LIGHTING_CONFIG.WARM_CHAMBER;
  const shadowsEnabled = qualityPreset !== 'LOW';
  const dpr: [number, number] = qualityPreset === 'LOW' ? [1, 1] : qualityPreset === 'MEDIUM' ? [1, 1.5] : [1, 2];
  const maxVisibleAvatars = qualityPreset === 'LOW' ? 12 : 30; // TBD-06: 10-12 on low-tier/mobile, 20+ on desktop

  return (
    <div className="relative isolate z-0 h-full w-full">
      <Canvas
        shadows={shadowsEnabled}
        dpr={dpr}
        gl={{
          antialias: qualityPreset !== 'LOW',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: venueStyle === 'CHAMBER' ? 0.88 : 1.15,
        }}
        camera={{ position: [0, 3.6, 8.2], fov: 50 }}
        className="h-full w-full"
      >
      <SceneEnvironmentReflection qualityPreset={qualityPreset} venueStyle={venueStyle} />
      <color
        attach="background"
        args={[venueStyle === 'KARAOKE' ? '#130920' : venueStyle === 'CONCERT' ? '#07050e' : light.bg]}
      />
      <fog
        attach="fog"
        args={[
          venueStyle === 'KARAOKE' ? '#130920' : venueStyle === 'CONCERT' ? '#07050e' : light.bg,
          venueStyle === 'KARAOKE' ? 16 : venueStyle === 'CHAMBER' ? 9 : 13,
          venueStyle === 'KARAOKE' ? 34 : venueStyle === 'CHAMBER' ? 23 : 29,
        ]}
      />

      {/* Warm Candlelit Intimate Fill for Chamber/Opera; Club/Show High-Contrast for Concert/Karaoke */}
      <hemisphereLight
        args={[
          venueStyle === 'KARAOKE' ? '#f5d0fe' : venueStyle === 'CHAMBER' ? '#fbbf24' : light.ambient,
          venueStyle === 'KARAOKE' ? '#1e1035' : '#120905',
          venueStyle === 'CONCERT' ? 0.25 : venueStyle === 'KARAOKE' ? 0.42 : 0.16,
        ]}
      />
      <ambientLight
        color={venueStyle === 'KARAOKE' ? '#f8fafc' : light.ambient}
        intensity={venueStyle === 'CONCERT' ? 0.18 : venueStyle === 'KARAOKE' ? 0.32 : light.ambientInt}
      />

      {/* Focused Stage Spotlight + Soft Warm Amber Fill for Chamber/Opera */}
      <spotLight
        position={[0, 6.2, 1.4]}
        angle={venueStyle === 'CHAMBER' ? 0.45 : 0.56}
        penumbra={venueStyle === 'CHAMBER' ? 0.9 : 0.72}
        intensity={light.spotInt}
        color={light.spot}
        castShadow={shadowsEnabled}
      />
      {venueStyle === 'CHAMBER' && (
        <>
          <pointLight position={[-2.2, 3.1, -1.8]} intensity={1.75} distance={8.5} color="#f59e0b" />
          <pointLight position={[2.2, 3.1, -1.8]} intensity={1.75} distance={8.5} color="#f59e0b" />
        </>
      )}
      {venueStyle === 'KARAOKE' && (
        <>
          <pointLight position={[0, 3.8, 1.5]} intensity={3.6} distance={9.5} color="#f472b6" />
          <pointLight position={[-2.6, 3.4, -1.2]} intensity={2.8} distance={10} color="#38bdf8" />
          <pointLight position={[2.6, 3.4, -1.2]} intensity={2.8} distance={10} color="#e879f9" />
        </>
      )}

      {venueStyle === 'KARAOKE' ? (
        <KaraokeLoungeArchitecture
          sconceColor={light.sconce}
          enableLights={qualityPreset !== 'LOW'}
          isLiveOrActive={room.concert.state === 'LIVE' || room.concert.state === 'SOUND_CHECK'}
          onSelectKaraokeMic={onSelectKaraokeMic}
        />
      ) : (
        <AuditoriumArchitecture
          sconceColor={light.sconce}
          enableChandelierLights={qualityPreset === 'HIGH' && venueStyle === 'CHAMBER'}
          venueStyle={venueStyle}
          onSelectStagePiano={onSelectStagePiano}
        />
      )}

      <StageYouTubeCurtains
        transitionVisual={transitionVisual}
        concert={room.concert}
        youtubeVideoId={youtubeVideoId}
        isPlaying={isYouTubePlaying}
        audienceMuted={audienceMuted}
        musicVolume={musicVolume}
        musicMuted={musicMuted}
        venueStyle={venueStyle}
        canAutoAdvance={canAutoAdvance}
        onAutoAdvanceNext={onAutoAdvanceNext}
        onKaraokeSongEnded={onKaraokeSongEnded}
        karaokeScoreCard={karaokeScoreCard}
        ytIframeRef={ytIframeRef}
        onAutoplayBlocked={onAutoplayBlocked}
      />

      {venueStyle === 'KARAOKE' && (
        <KaraokeBackLyricsScreen
          transitionVisual={transitionVisual}
          concert={room.concert}
          youtubeVideoId={youtubeVideoId}
          isPlaying={isYouTubePlaying}
          karaokeScoreCard={karaokeScoreCard}
        />
      )}

      {(venueStyle === 'CONCERT' || venueStyle === 'KARAOKE') && (
        <ConcertBeatLights
          isLiveOrActive={room.concert.state === 'LIVE' || room.concert.state === 'SOUND_CHECK'}
          qualityPreset={qualityPreset}
        />
      )}

      {/* Seats: Plush U-Shape KTV Lounge Sofas (KARAOKE) or Theater Velvet Chairs (CHAMBER/CONCERT) */}
      {room.seats.map((seat) => {
        const isOccupied = seat.state === 'OCCUPIED';
        const isHeld = seat.state === 'HELD';
        if (venueStyle === 'KARAOKE') {
          const sofaColor = isOccupied ? '#ec4899' : isHeld ? '#f59e0b' : '#9333ea';
          const rotY = seat.row === 'L' ? -Math.PI / 2 : seat.row === 'R' ? Math.PI / 2 : 0;
          return (
            <group
              key={seat.id}
              position={seat.position}
              rotation={[0, rotY, 0]}
              onClick={(e) => {
                e.stopPropagation();
                onSelectSeat(seat.id);
              }}
              onPointerOver={() => {
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                document.body.style.cursor = 'auto';
              }}
            >
              {/* Sofa Base */}
              <mesh position={[0, 0.18, 0]} castShadow>
                <boxGeometry args={[0.92, 0.24, 0.72]} />
                <meshStandardMaterial color="#581c87" roughness={0.6} />
              </mesh>
              {/* Plush Seat Cushion */}
              <mesh position={[0, 0.34, -0.04]} castShadow>
                <boxGeometry args={[0.88, 0.14, 0.64]} />
                <meshStandardMaterial color={sofaColor} roughness={0.7} />
              </mesh>
              {/* Low Lounge Back Cushion */}
              {seat.row !== 'F' && (
                <mesh position={[0, 0.56, 0.28]} castShadow>
                  <boxGeometry args={[0.88, 0.36, 0.16]} />
                  <meshStandardMaterial color={sofaColor} roughness={0.7} />
                </mesh>
              )}
              {/* Cozy Accent Throw Pillow */}
              {seat.row !== 'F' && (
                <mesh position={[0.26, 0.48, 0.14]} rotation={[0.2, -0.25, 0.15]}>
                  <boxGeometry args={[0.2, 0.18, 0.08]} />
                  <meshStandardMaterial color="#fde047" roughness={0.8} />
                </mesh>
              )}
            </group>
          );
        }

        const velvetColor = isOccupied ? '#991b1b' : isHeld ? '#b45309' : '#581115';
        return (
          <group
            key={seat.id}
            position={seat.position}
            onClick={(e) => {
              e.stopPropagation();
              onSelectSeat(seat.id);
            }}
          >
            {/* Brass Pedestal Base */}
            <mesh position={[0, 0.14, 0]}>
              <cylinderGeometry args={[0.12, 0.16, 0.28, 10]} />
              <meshStandardMaterial color="#92400e" metalness={0.5} roughness={0.4} />
            </mesh>
            {/* Velvet Seat Cushion */}
            <mesh position={[0, 0.3, 0]} castShadow>
              <boxGeometry args={[0.64, 0.14, 0.58]} />
              <meshStandardMaterial color={velvetColor} roughness={0.8} />
            </mesh>
            {/* Padded Backrest */}
            <mesh position={[0, 0.6, 0.24]} castShadow>
              <boxGeometry args={[0.64, 0.56, 0.12]} />
              <meshStandardMaterial color={velvetColor} roughness={0.8} />
            </mesh>
            {/* Wooden Armrests */}
            <mesh position={[-0.33, 0.44, 0.02]}>
              <boxGeometry args={[0.07, 0.08, 0.48]} />
              <meshStandardMaterial color="#451a03" roughness={0.5} />
            </mesh>
            <mesh position={[0.33, 0.44, 0.02]}>
              <boxGeometry args={[0.07, 0.08, 0.48]} />
              <meshStandardMaterial color="#451a03" roughness={0.5} />
            </mesh>
          </group>
        );
      })}

      <AuditoriumController
        localUserId={localUserId}
        canAccessStage={
          venueStyle === 'KARAOKE' ||
          localRole === 'ARTIST' ||
          localRole === 'HOST' ||
          localRole === 'ADMIN' ||
          room.concert.hostUserId === localUserId ||
          room.concert.invitedPerformerIds.includes(localUserId)
        }
        venueStyle={venueStyle}
        seats={room.seats}
        pianoKeyboardActive={pianoKeyboardActive}
        cameraMode={cameraMode}
        qualityPreset={qualityPreset}
        maxVisibleAvatars={maxVisibleAvatars}
        controlsRef={controlsRef}
        onPerfSample={onPerfSample}
      />

      {cameraMode !== 'SEAT_POV' && cameraMode !== 'KARAOKE_STAGE_POV' && (
        <OrbitControls
          ref={controlsRef}
          target={[0, 1.2, -1.0]}
          minPolarAngle={0.28}
          maxPolarAngle={Math.PI / 2 - 0.06}
          minDistance={1.8}
          maxDistance={cameraMode === 'ROOM_OVERVIEW' ? 13.5 : 10.2}
          onChange={(ev) => {
            const ctrl = ev?.target;
            if (!ctrl) return;
            ctrl.target.x = THREE.MathUtils.clamp(ctrl.target.x, -3.5, 3.5);
            ctrl.target.y = THREE.MathUtils.clamp(ctrl.target.y, 0.6, 3.2);
            ctrl.target.z = THREE.MathUtils.clamp(ctrl.target.z, -2.8, 8.8);
            clampCameraPosition(ctrl.object);
          }}
        />
      )}
      </Canvas>
    </div>
  );
}
