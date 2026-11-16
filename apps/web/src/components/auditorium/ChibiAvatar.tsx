import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { AvatarPresetId } from '@vmw/contracts';
import type { AvatarRuntimeEntry } from '../../realtime/realtimeStore';

const PRESET_COLORS: Record<AvatarPresetId, { body: string; accent: string; hair: string }> = {
  'chibi-classic': { body: '#1e293b', accent: '#f59e0b', hair: '#292524' },
  'chibi-acoustic': { body: '#78350f', accent: '#fbbf24', hair: '#451a03' },
  'chibi-synth': { body: '#312e81', accent: '#38bdf8', hair: '#0f172a' },
  'chibi-strings': { body: '#7f1d1d', accent: '#fda4af', hair: '#1c1917' },
};

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

export function ChibiAvatar({ entry, isLocal }: { entry: AvatarRuntimeEntry; isLocal: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Group>(null);
  const flowerGroupRef = useRef<THREE.Group>(null);
  const flowerMeshRefs = useRef<(THREE.Group | null)[]>([]);

  const palette = PRESET_COLORS[entry.avatarPresetId] ?? PRESET_COLORS['chibi-classic'];

  useFrame((state, delta) => {
    const g = groupRef.current;
    if (!g) return;

    const nowMs = performance.now();
    if (
      entry.lastReaction &&
      nowMs > entry.reactionUntil &&
      (entry.animation === 'CLAP' ||
        entry.animation === 'CHEER' ||
        entry.animation === 'WAVE' ||
        entry.animation === 'DANCE')
    ) {
      entry.animation = entry.seatId ? 'SIT' : 'IDLE';
    }

    // Smooth interpolation for remote avatars; local avatar updates immediately
    const lerpAlpha = isLocal ? 0.5 : Math.min(1, delta * 12);
    g.position.x = THREE.MathUtils.lerp(g.position.x, entry.targetPosition[0], lerpAlpha);
    g.position.y = THREE.MathUtils.lerp(g.position.y, entry.targetPosition[1], lerpAlpha);
    g.position.z = THREE.MathUtils.lerp(g.position.z, entry.targetPosition[2], lerpAlpha);
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, entry.targetRotationY, lerpAlpha);

    const t = state.clock.elapsedTime;
    const anim = entry.animation;

    // Reset arm/head pose
    let lArmX = 0;
    let rArmX = 0;
    let lArmZ = 0.25;
    let rArmZ = -0.25;
    let bobY = 0;

    if (anim === 'IDLE' || anim === 'STAND') {
      bobY = Math.sin(t * 2.2) * 0.02;
    } else if (anim === 'WALK') {
      bobY = Math.abs(Math.sin(t * 9)) * 0.06;
      lArmX = Math.sin(t * 9) * 0.5;
      rArmX = -Math.sin(t * 9) * 0.5;
    } else if (anim === 'SIT') {
      // Rest cleanly on top of the 0.37m-tall seat cushion instead of sinking into the chair
      bobY = 0.28;
    } else if (anim === 'CLAP') {
      const clap = Math.sin(t * 14) * 0.35;
      lArmX = -0.8;
      rArmX = -0.8;
      lArmZ = -0.35 + clap;
      rArmZ = 0.35 - clap;
    } else if (anim === 'CHEER') {
      bobY = Math.abs(Math.sin(t * 8)) * 0.12;
      lArmX = -2.4 + Math.sin(t * 10) * 0.2;
      rArmX = -2.4 - Math.sin(t * 10) * 0.2;
    } else if (anim === 'WAVE') {
      rArmX = -2.2;
      rArmZ = -0.3 + Math.sin(t * 10) * 0.4;
    } else if (anim === 'DANCE') {
      bobY = Math.abs(Math.sin(t * 6)) * 0.1;
      lArmX = Math.sin(t * 6) * 0.8 - 0.6;
      rArmX = -Math.sin(t * 6) * 0.8 - 0.6;
    } else if (anim === 'PLAY_PIANO' || anim === 'PLAY_GUITAR' || anim === 'PLAY_VIOLIN' || anim === 'PLAY_DRUMS') {
      // MIDI/Performance synchronized arm motion
      const midiBoost = nowMs - entry.lastMidiAt < 250 ? 1.8 : 0.6;
      lArmX = -0.9 + Math.sin(t * 12 * midiBoost) * 0.25;
      rArmX = -0.9 + Math.cos(t * 12 * midiBoost) * 0.25;
      bobY = Math.sin(t * 4) * 0.03;
    } else if (anim === 'AFK') {
      if (headRef.current) headRef.current.rotation.x = 0.35;
    }

    if (anim !== 'AFK' && headRef.current) {
      headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, 0, 0.15);
    }

    g.position.y += bobY;
    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = lArmX;
      leftArmRef.current.rotation.z = lArmZ;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = rArmX;
      rightArmRef.current.rotation.z = rArmZ;
    }

    // 3D Flower Toss Burst animation at audience seat/position
    if (flowerGroupRef.current) {
      const active = entry.flowerBurstUntil > nowMs && entry.flowerBurstAt > 0;
      flowerGroupRef.current.visible = active;
      if (active) {
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
      }
    }
  });

  const showReaction = entry.lastReaction && performance.now() < entry.reactionUntil;

  return (
    <group ref={groupRef} position={entry.position}>
      {/* Chibi Body (bottom of 0.68m capsule touches y = 0.00 cleanly) */}
      <mesh position={[0, 0.34, 0]} castShadow>
        <capsuleGeometry args={[0.2, 0.28, 6, 12]} />
        <meshStandardMaterial color={palette.body} roughness={0.65} />
      </mesh>

      {/* Outfit Collar / Accent */}
      <mesh position={[0, 0.51, 0.04]}>
        <torusGeometry args={[0.16, 0.04, 8, 16]} />
        <meshStandardMaterial color={palette.accent} />
      </mesh>

      {/* Left & Right Arms */}
      <mesh ref={leftArmRef} position={[-0.26, 0.41, 0]} castShadow>
        <capsuleGeometry args={[0.06, 0.2, 4, 8]} />
        <meshStandardMaterial color={palette.body} />
      </mesh>
      <mesh ref={rightArmRef} position={[0.26, 0.41, 0]} castShadow>
        <capsuleGeometry args={[0.06, 0.2, 4, 8]} />
        <meshStandardMaterial color={palette.body} />
      </mesh>

      {/* Anime Chibi Large Head */}
      <group ref={headRef} position={[0, 0.87, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.3, 18, 18]} />
          <meshStandardMaterial color="#fde6d8" roughness={0.5} />
        </mesh>
        {/* Hair Cap */}
        <mesh position={[0, 0.08, -0.02]}>
          <sphereGeometry args={[0.315, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
          <meshStandardMaterial color={palette.hair} roughness={0.7} />
        </mesh>
        {/* Stylized Eyes */}
        <mesh position={[-0.1, -0.02, 0.27]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#1e1b4b" />
        </mesh>
        <mesh position={[0.1, -0.02, 0.27]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#1e1b4b" />
        </mesh>
      </group>

      {/* Pooled 3D Flower Toss Burst (visible only during active FLOWER reaction) */}
      <group ref={flowerGroupRef} visible={false}>
        {FLOWER_PARTICLES.map((p, i) => (
          <group
            key={i}
            ref={(el) => {
              flowerMeshRefs.current[i] = el;
            }}
          >
            {/* 5-petal blossom silhouette + warm golden center */}
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
              <meshStandardMaterial
                color="#fef08a"
                emissive="#fbbf24"
                emissiveIntensity={0.5}
              />
            </mesh>
          </group>
        ))}
      </group>

      {/* Nameplate & Reaction */}
      <Html position={[0, 1.38, 0]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
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
    </group>
  );
}
