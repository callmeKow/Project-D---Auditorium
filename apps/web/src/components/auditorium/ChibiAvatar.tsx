import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AvatarPresetId } from '@vmw/contracts';
import type { AvatarRuntimeEntry } from '../../realtime/realtimeStore';
import { AvatarOverlay, lerpAngleY, syncReactionExpiry } from './AvatarOverlay';

const PRESET_COLORS: Record<AvatarPresetId, { body: string; accent: string; hair: string }> = {
  'chibi-classic': { body: '#355b82', accent: '#4f79ad', hair: '#9a6544' },
  'chibi-acoustic': { body: '#f2b544', accent: '#fb7185', hair: '#e59a5c' },
  'chibi-synth': { body: '#6d5bd0', accent: '#38bdf8', hair: '#b8a2f7' },
  'chibi-strings': { body: '#2c3d6e', accent: '#e2425c', hair: '#3d2b33' },
};

export function ChibiAvatar({ entry, isLocal }: { entry: AvatarRuntimeEntry; isLocal: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Group>(null);

  const palette = PRESET_COLORS[entry.avatarPresetId] ?? PRESET_COLORS['chibi-classic'];

  useFrame((state, delta) => {
    const g = groupRef.current;
    if (!g) return;

    const nowMs = performance.now();
    syncReactionExpiry(entry, nowMs);

    // Smooth interpolation for remote avatars; local avatar updates immediately
    const lerpAlpha = isLocal ? 0.5 : Math.min(1, delta * 12);
    g.position.x = THREE.MathUtils.lerp(g.position.x, entry.targetPosition[0], lerpAlpha);
    g.position.y = THREE.MathUtils.lerp(g.position.y, entry.targetPosition[1], lerpAlpha);
    g.position.z = THREE.MathUtils.lerp(g.position.z, entry.targetPosition[2], lerpAlpha);
    g.rotation.y = lerpAngleY(g.rotation.y, entry.targetRotationY, lerpAlpha);

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
    } else if (
      anim === 'DANCE' ||
      anim === 'DANCE_2' ||
      anim === 'DANCE_3' ||
      anim === 'DANCE_4' ||
      anim === 'DANCE_5'
    ) {
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
  });

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

      <AvatarOverlay entry={entry} isLocal={isLocal} nameplateY={1.38} />
    </group>
  );
}
