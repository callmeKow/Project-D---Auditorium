import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
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
import { ChibiAvatar } from './ChibiAvatar';

export type CameraMode = 'AUDIENCE_ORBIT' | 'STAGE_VIEW' | 'SEAT_POV';

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

const LIGHTING_CONFIG: Record<
  SetlistItemDTO['lightingPreset'],
  { ambient: string; ambientInt: number; spot: string; spotInt: number; bg: string; sconce: string }
> = {
  WARM_CHAMBER: {
    ambient: '#fde68a',
    ambientInt: 0.75,
    spot: '#fcd34d',
    spotInt: 4.5,
    bg: '#1c120d',
    sconce: '#fbbf24',
  },
  SPOTLIGHT_SOLO: {
    ambient: '#bfdbfe',
    ambientInt: 0.5,
    spot: '#ffffff',
    spotInt: 5.2,
    bg: '#0d1321',
    sconce: '#93c5fd',
  },
  DYNAMIC_CONCERT: {
    ambient: '#e9d5ff',
    ambientInt: 0.65,
    spot: '#f472b6',
    spotInt: 4.8,
    bg: '#190f24',
    sconce: '#c084fc',
  },
  ENCORE_GOLD: {
    ambient: '#fef08a',
    ambientInt: 0.85,
    spot: '#f59e0b',
    spotInt: 5.5,
    bg: '#23170b',
    sconce: '#f59e0b',
  },
};

const CONCERT_NEON_COLORS = ['#ec4899', '#38bdf8', '#a855f7', '#fbbf24'];

function ConcertBeatLights({ isLiveOrActive, qualityPreset }: { isLiveOrActive: boolean; qualityPreset: QualityPreset }) {
  const beamRefs = useRef<(THREE.Mesh | null)[]>([]);
  const barRefs = useRef<(THREE.Mesh | null)[]>([]);
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

    // Bounce 12 rear LED Equalizer columns with bass / mid / high
    for (let i = 0; i < 12; i++) {
      const bar = barRefs.current[i];
      if (!bar) continue;
      const band = i < 4 ? sb : i < 8 ? mid : high;
      const wave = 0.25 + band * 1.8 + Math.abs(Math.sin(t * 6 + i * 0.6)) * 0.25;
      bar.scale.y = THREE.MathUtils.lerp(bar.scale.y, Math.max(0.15, Math.min(2.6, wave)), Math.min(1, delta * 18));
      const mat = bar.material as THREE.MeshStandardMaterial;
      mat.emissive.set(i % 2 === 0 ? activeColorHex : altColorHex);
      mat.emissiveIntensity = 1.0 + sb * 2.5;
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

      {/* 12 Flanking Stage Bass/Beat LED Equalizer Columns (6 left wing + 6 right wing framing the big screen) */}
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
            position={[x, 1.55, z]}
          >
            <boxGeometry args={[0.18, 1.5, 0.22]} />
            <meshStandardMaterial
              color="#18181b"
              emissive={i % 2 === 0 ? '#ec4899' : '#38bdf8'}
              emissiveIntensity={1.6}
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

function StageYouTubeCurtains({
  concert,
  youtubeVideoId,
  isPlaying,
  audienceMuted,
  musicVolume = 80,
  musicMuted = false,
  ytIframeRef,
  onAutoplayBlocked,
}: {
  concert: RoomDTO['concert'];
  youtubeVideoId?: string;
  isPlaying: boolean;
  audienceMuted: boolean;
  musicVolume?: number;
  musicMuted?: boolean;
  ytIframeRef?: React.MutableRefObject<HTMLIFrameElement | null>;
  onAutoplayBlocked?: (blocked: boolean) => void;
}) {
  const leftCurtainRef = useRef<THREE.Mesh>(null);
  const rightCurtainRef = useRef<THREE.Mesh>(null);
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

  // Collect up to 4 unique YouTube tracks from Setlist (active + next 3 upcoming) to pre-buffer in RAM
  const preloadedVideoIds: string[] = [];
  if (youtubeVideoId) preloadedVideoIds.push(youtubeVideoId);
  if (concert.setlist.length > 0) {
    for (let offset = 0; offset < concert.setlist.length && preloadedVideoIds.length < 4; offset++) {
      const idx = (concert.currentSetlistIndex + offset) % concert.setlist.length;
      const vid = concert.setlist[idx]?.youtubeVideoId;
      if (vid && !preloadedVideoIds.includes(vid)) {
        preloadedVideoIds.push(vid);
      }
    }
  }

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
            const raw = realtimeStore.getSyncedPlaybackSec(realtimeStore.room?.concert ?? concert);
            const dur = ytDurationRef.current;
            const mod = dur > 1 ? raw % dur : 0;
            const loopTarget = dur > 1 && dur - mod >= 3 ? mod : 0;
            ytTimeRef.current = loopTarget;
            lastSeekAtRef.current = performance.now();
            sendYtCmd(localIframeRef.current, 'seekTo', [loopTarget, true]);
            sendYtCmd(localIframeRef.current, 'playVideo');
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
      }
    }, 1800);
    return () => clearInterval(checkTimer);
  }, [youtubeVideoId, isPlaying, screenVisible, audienceMuted, concert, onAutoplayBlocked]);

  useFrame((_state, delta) => {
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
  });

  return (
    <group position={[0, 2.95, -4.08]}>
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
          zIndexRange={[20, 0]}
          pointerEvents="none"
          style={{ pointerEvents: 'none' }}
        >
          <div className="pointer-events-none relative h-[360px] w-[640px] overflow-hidden rounded bg-black shadow-2xl">
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
                  className={`pointer-events-none absolute left-0 top-0 h-[600px] w-[640px] -translate-y-[120px] border-0 transition-opacity duration-500 ${
                    isActive
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

function AuditoriumArchitecture({
  sconceColor,
  enableChandelierLights,
  venueStyle,
}: {
  sconceColor: string;
  enableChandelierLights: boolean;
  venueStyle: VenueStyle;
}) {
  const slatOffsets = [-3.6, -2.0, -0.4, 1.2, 2.8, 4.4, 6.0, 7.6];
  const chandelierZ = [1.8, 5.4];

  const isConcert = venueStyle === 'CONCERT';
  const accentStripColor = isConcert ? '#38bdf8' : sconceColor;

  return (
    <group>
      {/* Main Hardwood Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2.2]} receiveShadow>
        <planeGeometry args={[14, 16]} />
        <meshStandardMaterial color={isConcert ? '#18181b' : '#3b2316'} roughness={isConcert ? 0.45 : 0.65} />
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
            <meshStandardMaterial color="#d4af37" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh>
            <torusGeometry args={[0.75, 0.04, 8, 24]} />
            <meshStandardMaterial color="#d4af37" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0, -0.05, 0]}>
            <sphereGeometry args={[0.2, 12, 12]} />
            <meshStandardMaterial color="#fef3c7" emissive={sconceColor} emissiveIntensity={2.0} />
          </mesh>
          {enableChandelierLights && (
            <pointLight position={[0, -0.3, 0]} intensity={1.6} distance={10} color={sconceColor} />
          )}
        </group>
      ))}

      {/* Proscenium Stage Platform */}
      <mesh position={[0, 0.22, -2.2]} receiveShadow castShadow>
        <boxGeometry args={[11.2, 0.44, 4.6]} />
        <meshStandardMaterial color="#6e4427" roughness={0.5} />
      </mesh>
      {/* Stage Front Brass Trim & Footlights */}
      <mesh position={[0, 0.43, 0.12]}>
        <boxGeometry args={[11.2, 0.05, 0.06]} />
        <meshStandardMaterial color="#d4af37" metalness={0.7} roughness={0.3} />
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

      {/* Detailed Stage Grand Piano + Bench + Mic Stand */}
      <group position={[-1.4, 0.44, -2.1]}>
        {/* Piano Body */}
        <mesh position={[0, 0.58, 0]} castShadow>
          <boxGeometry args={[1.65, 0.24, 1.25]} />
          <meshStandardMaterial color="#141414" roughness={0.15} metalness={0.4} />
        </mesh>
        {/* Open Piano Lid */}
        <mesh position={[0.1, 0.92, -0.1]} rotation={[0, 0, -0.45]} castShadow>
          <boxGeometry args={[1.55, 0.04, 1.15]} />
          <meshStandardMaterial color="#18181b" roughness={0.12} metalness={0.45} />
        </mesh>
        {/* White Keyboard Strip */}
        <mesh position={[0, 0.62, 0.65]}>
          <boxGeometry args={[1.25, 0.05, 0.16]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.3} />
        </mesh>
        {/* Piano Legs */}
        {[
          [-0.65, 0.28, 0.5],
          [0.65, 0.28, 0.5],
          [0, 0.28, -0.48],
        ].map(([lx, ly, lz], i) => (
          <mesh key={i} position={[lx, ly, lz]}>
            <cylinderGeometry args={[0.045, 0.035, 0.56]} />
            <meshStandardMaterial color="#141414" metalness={0.3} />
          </mesh>
        ))}
        {/* Piano Bench */}
        <mesh position={[0, 0.36, 1.05]} castShadow>
          <boxGeometry args={[0.8, 0.08, 0.36]} />
          <meshStandardMaterial color="#27272a" roughness={0.4} />
        </mesh>
      </group>

      {/* Center Stage Vocal Mic Stand */}
      <group position={[0.8, 0.44, -1.3]}>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.18, 0.2, 0.04, 12]} />
          <meshStandardMaterial color="#27272a" metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.62, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 1.2, 8]} />
          <meshStandardMaterial color="#a1a1aa" metalness={0.8} />
        </mesh>
        <mesh position={[0, 1.24, 0.03]}>
          <sphereGeometry args={[0.045, 10, 10]} />
          <meshStandardMaterial color="#d4d4d8" metalness={0.85} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
}

function AuditoriumController({
  localUserId,
  canAccessStage,
  cameraMode,
  maxVisibleAvatars,
  controlsRef,
  onPerfSample,
}: {
  localUserId: string;
  canAccessStage: boolean;
  cameraMode: CameraMode;
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
    }
  }, [cameraMode, camera, controlsRef]);

  useFrame((_state, delta) => {
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
    if (keys.current['w'] || keys.current['arrowup']) dz -= 1;
    if (keys.current['s'] || keys.current['arrowdown']) dz += 1;
    if (keys.current['a'] || keys.current['arrowleft']) dx -= 1;
    if (keys.current['d'] || keys.current['arrowright']) dx += 1;

    if (dx !== 0 || dz !== 0) {
      const speed = 3.5 * delta;
      const minZ = canAccessStage ? -3.2 : 0.8;
      const nextX = Math.max(-5.5, Math.min(5.5, local.targetPosition[0] + dx * speed));
      const nextZ = Math.max(minZ, Math.min(8.5, local.targetPosition[2] + dz * speed));
      const nextY = getAuditoriumFloorY(nextX, nextZ);
      const nextRot = Math.atan2(dx, dz);

      local.targetPosition = [nextX, nextY, nextZ];
      local.targetRotationY = nextRot;
      local.animation = 'WALK';
      local.seatId = undefined;

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
        <ChibiAvatar key={entry.userId} entry={entry} isLocal={entry.userId === localUserId} />
      ))}
    </>
  );
}

export function AuditoriumScene({
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
  ytIframeRef,
  onAutoplayBlocked,
  onSelectSeat,
  onPerfSample,
}: {
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
  ytIframeRef?: React.MutableRefObject<HTMLIFrameElement | null>;
  onAutoplayBlocked?: (blocked: boolean) => void;
  onSelectSeat: (seatId: string) => void;
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
      <Canvas shadows={shadowsEnabled} dpr={dpr} camera={{ position: [0, 3.6, 8.2], fov: 50 }} className="h-full w-full">
      <color attach="background" args={[venueStyle === 'CONCERT' ? '#09090f' : light.bg]} />
      <fog attach="fog" args={[venueStyle === 'CONCERT' ? '#09090f' : light.bg, 15, 32]} />

      <hemisphereLight args={[light.ambient, '#3b2316', venueStyle === 'CONCERT' ? 0.45 : 0.65]} />
      <ambientLight color={light.ambient} intensity={venueStyle === 'CONCERT' ? 0.35 : light.ambientInt} />

      {/* Main Stage Spotlight + Warm Stage Wash */}
      <spotLight
        position={[0, 6.2, 1.8]}
        angle={0.62}
        penumbra={0.65}
        intensity={light.spotInt}
        color={light.spot}
        castShadow={shadowsEnabled}
      />
      {venueStyle === 'CHAMBER' && (
        <>
          <pointLight position={[-2.8, 3.6, -1.8]} intensity={2.2} distance={10} color="#fde68a" />
          <pointLight position={[2.8, 3.6, -1.8]} intensity={2.2} distance={10} color="#fde68a" />
        </>
      )}

      <AuditoriumArchitecture
        sconceColor={light.sconce}
        enableChandelierLights={qualityPreset === 'HIGH' && venueStyle === 'CHAMBER'}
        venueStyle={venueStyle}
      />

      <StageYouTubeCurtains
        concert={room.concert}
        youtubeVideoId={youtubeVideoId}
        isPlaying={isYouTubePlaying}
        audienceMuted={audienceMuted}
        musicVolume={musicVolume}
        musicMuted={musicMuted}
        ytIframeRef={ytIframeRef}
        onAutoplayBlocked={onAutoplayBlocked}
      />

      {venueStyle === 'CONCERT' && (
        <ConcertBeatLights
          isLiveOrActive={room.concert.state === 'LIVE' || room.concert.state === 'SOUND_CHECK'}
          qualityPreset={qualityPreset}
        />
      )}

      {/* Plush Velvet 20-Seat Small Room Layout */}
      {room.seats.map((seat) => {
        const isOccupied = seat.state === 'OCCUPIED';
        const isHeld = seat.state === 'HELD';
        const velvetColor = isOccupied ? '#b91c1c' : isHeld ? '#d97706' : '#7f1d1d';
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
          localRole === 'ARTIST' ||
          localRole === 'HOST' ||
          localRole === 'ADMIN' ||
          room.concert.hostUserId === localUserId ||
          room.concert.invitedPerformerIds.includes(localUserId)
        }
        cameraMode={cameraMode}
        maxVisibleAvatars={maxVisibleAvatars}
        controlsRef={controlsRef}
        onPerfSample={onPerfSample}
      />

      {cameraMode !== 'SEAT_POV' && (
        <OrbitControls
          ref={controlsRef}
          target={[0, 1.2, -1.0]}
          minPolarAngle={0.28}
          maxPolarAngle={Math.PI / 2 - 0.06}
          minDistance={1.8}
          maxDistance={10.2}
          onChange={(ev) => {
            const ctrl = ev?.target;
            if (!ctrl) return;
            ctrl.target.x = THREE.MathUtils.clamp(ctrl.target.x, -3.5, 3.5);
            ctrl.target.y = THREE.MathUtils.clamp(ctrl.target.y, 0.6, 3.0);
            ctrl.target.z = THREE.MathUtils.clamp(ctrl.target.z, -2.8, 6.5);
            clampCameraPosition(ctrl.object);
          }}
        />
      )}
      </Canvas>
    </div>
  );
}
