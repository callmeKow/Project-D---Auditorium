import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { AvatarPresetId } from '@vmw/contracts';
import { CHIBI_PRESET_CATALOG } from './ChibiPresetPreview';
import { CHIBI_RIG_SCALE } from './auditorium/chibiCharacterKit';
import {
  cloneAudienceRig,
  getCachedAudienceRigAssets,
  loadAudienceRigAssets,
  type AudienceClipKey,
  type AudienceRigAssets,
} from './auditorium/audienceRigAssets';

export type ShowcaseDanceKey = 'DANCE' | 'DANCE_2' | 'DANCE_3' | 'DANCE_4' | 'DANCE_5';

export const SHOWCASE_DANCES: Array<{ key: ShowcaseDanceKey; emoji: string; label: string }> = [
  { key: 'DANCE', emoji: '💃', label: 'Samba' },
  { key: 'DANCE_2', emoji: '🕺', label: 'Hip Hop' },
  { key: 'DANCE_3', emoji: '🌀', label: 'Soul Spin' },
  { key: 'DANCE_4', emoji: '🪩', label: 'Samba 2' },
  { key: 'DANCE_5', emoji: '🎶', label: 'YMCA' },
];

const SHOWCASE_SLOTS: Array<{ presetId: AvatarPresetId; x: number; defaultDance: ShowcaseDanceKey; color: string }> = [
  { presetId: 'chibi-classic', x: -1.95, defaultDance: 'DANCE', color: '#38bdf8' },
  { presetId: 'chibi-acoustic', x: -0.65, defaultDance: 'DANCE_2', color: '#818cf8' },
  { presetId: 'chibi-synth', x: 0.65, defaultDance: 'DANCE_3', color: '#fbbf24' },
  { presetId: 'chibi-strings', x: 1.95, defaultDance: 'DANCE_5', color: '#f472b6' },
];

function DancingChibiModel({
  assets,
  presetId,
  position,
  clipKey,
  timeOffset,
  accentColor,
}: {
  assets: AudienceRigAssets;
  presetId: AvatarPresetId;
  position: [number, number, number];
  clipKey: ShowcaseDanceKey;
  timeOffset: number;
  accentColor: string;
}) {
  const activeKeyRef = useRef<AudienceClipKey>(clipKey);
  const ringRef = useRef<THREE.Mesh>(null);

  const { rig, mixer, actions } = useMemo(() => {
    const cloned = cloneAudienceRig(assets.templateScene, presetId, false);
    const animMixer = new THREE.AnimationMixer(cloned);
    const clipActions = {} as Record<ShowcaseDanceKey, THREE.AnimationAction>;

    SHOWCASE_DANCES.forEach(({ key }) => {
      const clip = assets.clips[key];
      const action = animMixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      clipActions[key] = action;
    });

    const initialAction = clipActions[clipKey];
    initialAction.time = timeOffset;
    initialAction.play();
    activeKeyRef.current = clipKey;

    return { rig: cloned, mixer: animMixer, actions: clipActions };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, presetId]);

  useEffect(() => {
    return () => {
      mixer.stopAllAction();
    };
  }, [mixer]);

  useFrame(({ clock }, delta) => {
    if (clipKey !== activeKeyRef.current) {
      const prevAction = actions[activeKeyRef.current as ShowcaseDanceKey];
      const nextAction = actions[clipKey];
      if (nextAction) {
        nextAction.reset();
        nextAction.enabled = true;
        nextAction.setEffectiveTimeScale(1);
        nextAction.setEffectiveWeight(1);
        nextAction.play();
        if (prevAction && prevAction !== nextAction) {
          prevAction.crossFadeTo(nextAction, 0.25, true);
        }
        activeKeyRef.current = clipKey;
      }
    }

    mixer.update(Math.min(delta, 0.05));

    if (ringRef.current) {
      const pulse = 1 + Math.sin(clock.getElapsedTime() * 3.2 + position[0]) * 0.04;
      ringRef.current.scale.set(pulse, pulse, 1);
    }
  });

  return (
    <group position={position}>
      <primitive object={rig} scale={[CHIBI_RIG_SCALE, CHIBI_RIG_SCALE, CHIBI_RIG_SCALE]} />
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[0.38, 0.48, 32]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.65} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function LandingDanceShowcase3D() {
  const [assets, setAssets] = useState<AudienceRigAssets | null>(() => getCachedAudienceRigAssets());
  const [selectedMode, setSelectedMode] = useState<'MIX' | ShowcaseDanceKey>('MIX');
  const [autoCycleIndex, setAutoCycleIndex] = useState(0);

  useEffect(() => {
    if (assets) return;
    let active = true;
    loadAudienceRigAssets()
      .then((loaded) => {
        if (active) setAssets(loaded);
      })
      .catch(() => {
        // Fallback handled in UI
      });
    return () => {
      active = false;
    };
  }, [assets]);

  // In MIX mode, gently rotate which dance each character performs every 6s so all 5 dances are showcased
  useEffect(() => {
    if (selectedMode !== 'MIX') return;
    const id = window.setInterval(() => {
      setAutoCycleIndex((prev) => (prev + 1) % SHOWCASE_DANCES.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, [selectedMode]);

  return (
    <div className="mt-5">
      {/* Interactive Dance Style Selector */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedMode('MIX')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
              selectedMode === 'MIX'
                ? 'bg-gradient-to-r from-amber-500 to-pink-500 text-stone-950 shadow-sm'
                : 'border border-stone-700/80 bg-stone-900/90 text-stone-300 hover:border-stone-500'
            }`}
          >
            ✨ Mix 5 Điệu
          </button>
          {SHOWCASE_DANCES.map((d) => {
            const active = selectedMode === d.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => setSelectedMode(d.key)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  active
                    ? 'bg-fuchsia-500 text-white shadow-sm shadow-fuchsia-500/30'
                    : 'border border-stone-800 bg-stone-950/80 text-stone-300 hover:border-fuchsia-500/50 hover:text-white'
                }`}
              >
                {d.emoji} {d.label}
              </button>
            );
          })}
        </div>
        <span className="text-[10px] text-stone-500">Kéo để xoay 3D</span>
      </div>

      {/* 3D Mini-Stage Canvas */}
      <div className="relative h-56 w-full overflow-hidden rounded-2xl border border-stone-800/90 bg-gradient-to-b from-stone-950 via-[#150f1e] to-stone-950 sm:h-64">
        {!assets ? (
          <div className="flex h-full w-full items-center justify-center text-xs text-stone-400">
            Đang tải 4 nhân vật Chibi 3D &amp; 5 điệu nhảy...
          </div>
        ) : (
          <Canvas camera={{ position: [0, 1.45, 4.3], fov: 36 }} dpr={[1, 1.5]}>
            <color attach="background" args={['#100b18']} />
            <ambientLight intensity={0.85} />
            <directionalLight position={[3, 5, 4]} intensity={1.4} color="#fff7ed" />
            <pointLight position={[-2.5, 2.5, 2]} intensity={1.2} color="#38bdf8" distance={8} />
            <pointLight position={[2.5, 2.5, 2]} intensity={1.2} color="#f472b6" distance={8} />

            {/* Glowing Stage Floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
              <circleGeometry args={[3.2, 48]} />
              <meshStandardMaterial color="#181224" roughness={0.55} metalness={0.35} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
              <ringGeometry args={[2.95, 3.02, 64]} />
              <meshBasicMaterial color="#a855f7" transparent opacity={0.45} side={THREE.DoubleSide} />
            </mesh>

            {SHOWCASE_SLOTS.map((slot, idx) => {
              const clipKey =
                selectedMode === 'MIX'
                  ? SHOWCASE_DANCES[(autoCycleIndex + idx) % SHOWCASE_DANCES.length].key
                  : selectedMode;
              return (
                <DancingChibiModel
                  key={slot.presetId}
                  assets={assets}
                  presetId={slot.presetId}
                  position={[slot.x, 0, 0]}
                  clipKey={clipKey}
                  timeOffset={selectedMode === 'MIX' ? idx * 0.45 : 0}
                  accentColor={slot.color}
                />
              );
            })}

            <OrbitControls
              enableZoom={false}
              enablePan={false}
              target={[0, 0.62, 0]}
              minPolarAngle={Math.PI / 3.2}
              maxPolarAngle={Math.PI / 2.15}
            />
          </Canvas>
        )}
      </div>

      {/* Compact 4 Outfit Labels */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CHIBI_PRESET_CATALOG.map((p) => (
          <div
            key={p.id}
            className="flex flex-col items-center rounded-xl border border-stone-800/80 bg-stone-950/75 px-2.5 py-2 text-center"
          >
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                p.gender === 'NAM'
                  ? 'border border-sky-500/30 bg-sky-500/20 text-sky-300'
                  : 'border border-pink-500/30 bg-pink-500/20 text-pink-300'
              }`}
            >
              {p.genderLabel}
            </span>
            <span className="mt-1 text-[11px] font-bold text-white">{p.name}</span>
            <span className="mt-0.5 text-[10px] text-amber-300">{p.outfitTitle}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
