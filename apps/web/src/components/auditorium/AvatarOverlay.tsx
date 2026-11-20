import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { AvatarRuntimeEntry } from '../../realtime/realtimeStore';

// Pooled flower particle trajectories for upward seat toss burst (AGENTS.md: zero per-frame React allocs)
const FLOWER_COLORS = ['#f472b6', '#fbcfe8', '#fb7185', '#fbbf24', '#f9a8d4', '#fda4af'];
const FLOWER_PARTICLES = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2 + (i % 3) * 0.25;
  const speedXZ = 0.45 + (i % 4) * 0.22;
  return {
    vx: Math.cos(angle) * speedXZ,
    vy: 2.3 + (i % 5) * 0.36,
    vz: Math.sin(angle) * speedXZ,
    spinX: (i % 2 === 0 ? 1 : -1) * (3.5 + (i % 3)),
    spinY: (i % 3 === 0 ? -1 : 1) * (4.0 + (i % 4)),
    color: FLOWER_COLORS[i % FLOWER_COLORS.length],
    scale: 0.85 + (i % 3) * 0.22,
  };
});

/**
 * Shortest-angle Y rotation lerp so avatars never spin 360deg across -PI/+PI.
 */
export function lerpAngleY(current: number, target: number, alpha: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * alpha;
}

/**
 * Auto-expires transient reaction animations (CLAP/CHEER/WAVE) back to SIT/IDLE,
 * while preserving continuous DANCE until the user walks, sits, or cancels.
 */
export function syncReactionExpiry(entry: AvatarRuntimeEntry, nowMs: number) {
  if (
    entry.lastReaction &&
    nowMs > entry.reactionUntil &&
    (entry.animation === 'CLAP' || entry.animation === 'CHEER' || entry.animation === 'WAVE')
  ) {
    entry.animation = entry.seatId ? 'SIT' : 'IDLE';
  }
}

export function AvatarOverlay({
  entry,
  isLocal,
  nameplateY,
}: {
  entry: AvatarRuntimeEntry;
  isLocal: boolean;
  nameplateY: number;
}) {
  const flowerGroupRef = useRef<THREE.Group>(null);
  const flowerMeshRefs = useRef<(THREE.Group | null)[]>([]);
  const paddleGroupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const nowMs = performance.now();

    const pg = paddleGroupRef.current;
    if (pg) {
      const pointActive = Boolean(entry.pointScore && entry.pointUntil && entry.pointUntil > nowMs);
      pg.visible = pointActive;
      if (pointActive && entry.pointAt) {
        const elapsed = Math.max(0, (nowMs - entry.pointAt) / 1000);
        const popScale = elapsed < 0.18 ? elapsed / 0.18 : 1;
        const sway = Math.sin(elapsed * 5.2) * 0.14;
        pg.position.set(0.34, 0.92 + Math.sin(elapsed * 3.5) * 0.04, 0.18);
        pg.rotation.set(0, 0, -0.15 + sway);
        pg.scale.setScalar(popScale);
      }
    }

    const fg = flowerGroupRef.current;
    if (!fg) return;
    const active = entry.flowerBurstUntil > nowMs && entry.flowerBurstAt > 0;
    fg.visible = active;
    if (!active) return;

    const elapsed = Math.max(0, (nowMs - entry.flowerBurstAt) / 1000);
    const duration = 2.4;
    const progress = Math.min(1, elapsed / duration);
    const fadeScale = progress < 0.15 ? progress / 0.15 : Math.max(0, 1 - (progress - 0.15) / 0.85);
    const gravity = 2.4;

    for (let i = 0; i < FLOWER_PARTICLES.length; i++) {
      const meshGroup = flowerMeshRefs.current[i];
      if (!meshGroup) continue;
      const p = FLOWER_PARTICLES[i];
      const px = p.vx * elapsed + Math.sin(elapsed * 4 + i) * 0.08;
      const py = 0.85 + p.vy * elapsed - 0.5 * gravity * elapsed * elapsed;
      const pz = p.vz * elapsed + Math.cos(elapsed * 3.5 + i) * 0.08;

      meshGroup.position.set(px, Math.max(0.2, py), pz);
      meshGroup.rotation.set(elapsed * p.spinX, elapsed * p.spinY, elapsed * 2.2);
      meshGroup.scale.setScalar(p.scale * fadeScale);
    }
  });

  const nowMs = performance.now();
  const showReaction = entry.lastReaction && nowMs < entry.reactionUntil;
  const showPointPaddle = Boolean(entry.pointScore && entry.pointUntil && nowMs < entry.pointUntil);

  return (
    <>
      {/* 3D Judge Scoreboard Paddle held up when user types /point:[1-10] in chat */}
      <group ref={paddleGroupRef} visible={false} position={[0.34, 0.92, 0.18]}>
        {/* Handle Stick */}
        <mesh position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.016, 0.018, 0.36, 8]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.75} roughness={0.25} />
        </mesh>
        {/* Paddle Board */}
        <mesh position={[0, 0.48, 0]}>
          <boxGeometry args={[0.36, 0.36, 0.035]} />
          <meshStandardMaterial
            color="#1e1b4b"
            emissive={(entry.pointScore ?? 0) >= 9 ? '#ec4899' : '#6366f1'}
            emissiveIntensity={0.45}
            roughness={0.25}
          />
        </mesh>
        {/* Gold Rim */}
        <mesh position={[0, 0.48, 0]}>
          <boxGeometry args={[0.39, 0.39, 0.025]} />
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.5} />
        </mesh>
        {showPointPaddle && (
          <Html position={[0, 0.48, 0.03]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
            <div className="flex h-11 w-11 flex-col items-center justify-center rounded-xl border-2 border-amber-300 bg-gradient-to-br from-fuchsia-700 via-indigo-900 to-stone-950 shadow-xl select-none">
              <span className="text-[7px] font-bold uppercase leading-none tracking-wider text-amber-200">
                POINT
              </span>
              <span className="text-lg font-black leading-tight text-white">{entry.pointScore}</span>
            </div>
          </Html>
        )}
      </group>

      <group ref={flowerGroupRef} visible={false}>
        {FLOWER_PARTICLES.map((p, i) => (
          <group
            key={i}
            ref={(el) => {
              flowerMeshRefs.current[i] = el;
            }}
          >
            <mesh>
              <dodecahedronGeometry args={[0.085, 0]} />
              <meshStandardMaterial
                color={p.color}
                emissive={p.color}
                emissiveIntensity={0.65}
                roughness={0.35}
              />
            </mesh>
            <mesh scale={[1.6, 0.35, 1.6]}>
              <octahedronGeometry args={[0.075, 0]} />
              <meshStandardMaterial color="#fef08a" emissive="#fbbf24" emissiveIntensity={0.5} />
            </mesh>
          </group>
        ))}
      </group>

      <Html position={[0, nameplateY, 0]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
        <div className="flex flex-col items-center gap-0.5 select-none">
          {showReaction && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-stone-950 shadow">
              {entry.lastReaction === 'FLOWER' ? '🌸 Virtual Flower' : entry.lastReaction}
            </span>
          )}
          <span
            className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium shadow ${
              entry.role === 'ARTIST'
                ? 'bg-amber-500/90 text-stone-950'
                : isLocal
                  ? 'bg-sky-500/90 text-white'
                  : 'bg-stone-900/80 text-stone-200'
            }`}
          >
            {entry.displayName} {entry.role === 'ARTIST' ? '★' : ''}
          </span>
        </div>
      </Html>
    </>
  );
}
