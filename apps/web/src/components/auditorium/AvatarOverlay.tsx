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

  useFrame(() => {
    const fg = flowerGroupRef.current;
    if (!fg) return;
    const nowMs = performance.now();
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

  const showReaction = entry.lastReaction && performance.now() < entry.reactionUntil;

  return (
    <>
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
