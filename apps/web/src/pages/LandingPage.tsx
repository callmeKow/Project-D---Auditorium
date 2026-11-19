import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  ArrowRight,
  Volume2,
  VolumeX,
  Disc3,
  Mic2,
  Sliders,
  Sparkles,
  Headphones,
  ShieldCheck,
  Music2,
} from 'lucide-react';
import { CHIBI_PRESET_CATALOG } from '../components/ChibiPresetPreview';
import { LandingDanceShowcase3D } from '../components/LandingDanceShowcase3D';

type StageAcousticTheme = 'CHAMBER' | 'CONCERT' | 'KARAOKE';

const THEME_CONFIG: Record<
  StageAcousticTheme,
  {
    name: string;
    subtitle: string;
    primary: string;
    secondary: string;
    bg: string;
    chordFreqs: number[];
    arpNotes: number[];
  }
> = {
  CHAMBER: {
    name: '🎻 Thính Phòng Acoustic',
    subtitle: 'Âm hưởng gỗ ấm • Hòa âm Piano & Strings chân thực',
    primary: '#f59e0b',
    secondary: '#fde68a',
    bg: '#140c08',
    chordFreqs: [261.63, 329.63, 392.0, 493.88], // Cmaj7
    arpNotes: [523.25, 659.25, 783.99, 987.77],
  },
  CONCERT: {
    name: '🎆 Sân Khấu Concert 3D',
    subtitle: 'Bass-Sync Subwoofers • Đèn Moving-Head & Âm trường rộng',
    primary: '#38bdf8',
    secondary: '#ec4899',
    bg: '#090d1a',
    chordFreqs: [220.0, 261.63, 329.63, 392.0], // Am7
    arpNotes: [440.0, 523.25, 659.25, 783.99],
  },
  KARAOKE: {
    name: '🎤 Karaoke Lounge 360°',
    subtitle: 'Echo/Reverb Phòng Thu • Đèn Disco 360° & Sàn LED',
    primary: '#ec4899',
    secondary: '#a855f7',
    bg: '#160b24',
    chordFreqs: [293.66, 369.99, 440.0, 554.37], // Dmaj7
    arpNotes: [587.33, 739.99, 880.0, 1108.73],
  },
};

interface SpatialAudioState {
  energy: number;
  bass: number;
  treble: number;
  sourceAngle: number;
  pulseAt: number;
  bins: Uint8Array;
}

/**
 * Self-contained Web Audio 3D HRTF Spatial Synthesizer for the Landing Page preview.
 */
class LandingSpatialSoundEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private panner: PannerNode | null = null;
  private masterGain: GainNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(64));
  private loopTimer: number | null = null;
  private step = 0;
  public isPlaying = false;
  public sourceAngle = 0;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.72;

      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2.5;
      panner.maxDistance = 15;
      panner.rolloffFactor = 1.1;

      const master = ctx.createGain();
      master.gain.value = 0.55;

      panner.connect(master);
      master.connect(analyser);
      analyser.connect(ctx.destination);

      this.ctx = ctx;
      this.analyser = analyser;
      this.panner = panner;
      this.masterGain = master;
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public updateSpatialPosition(angleRad: number) {
    this.sourceAngle = angleRad;
    if (!this.panner || !this.ctx) return;
    const radius = 3.2;
    const x = Math.sin(angleRad) * radius;
    const z = Math.cos(angleRad) * radius - 0.5;
    const now = this.ctx.currentTime;
    if (this.panner.positionX) {
      this.panner.positionX.setTargetAtTime(x, now, 0.04);
      this.panner.positionY.setTargetAtTime(0.4, now, 0.04);
      this.panner.positionZ.setTargetAtTime(z, now, 0.04);
    } else {
      this.panner.setPosition(x, 0.4, z);
    }
  }

  public triggerPad(kind: 'CHORD' | 'BASS' | 'PLUCK' | 'SPARKLE', theme: StageAcousticTheme) {
    const ctx = this.ensureContext();
    if (!this.panner) return;
    const now = ctx.currentTime;
    const cfg = THEME_CONFIG[theme];

    if (kind === 'CHORD') {
      cfg.chordFreqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2200, now);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.11, now + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0008, now + 1.25);
        osc.connect(filter);
        filter.connect(g);
        g.connect(this.panner!);
        osc.start(now);
        osc.stop(now + 1.3);
      });
    } else if (kind === 'BASS') {
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const g = ctx.createGain();
      const root = cfg.chordFreqs[0] / 2;
      osc.type = 'sawtooth';
      sub.type = 'sine';
      osc.frequency.setValueAtTime(root * 1.5, now);
      osc.frequency.exponentialRampToValueAtTime(root * 0.5, now + 0.22);
      sub.frequency.setValueAtTime(root, now);
      sub.frequency.exponentialRampToValueAtTime(42, now + 0.38);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(360, now);

      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.32, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

      osc.connect(lp);
      sub.connect(lp);
      lp.connect(g);
      g.connect(this.panner!);
      osc.start(now);
      sub.start(now);
      osc.stop(now + 0.5);
      sub.stop(now + 0.5);
    } else if (kind === 'PLUCK') {
      cfg.arpNotes.forEach((freq, i) => {
        const t = now + i * 0.065;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.16, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0008, t + 0.55);
        osc.connect(g);
        g.connect(this.panner!);
        osc.start(t);
        osc.stop(t + 0.58);
      });
    } else if (kind === 'SPARKLE') {
      cfg.arpNotes.forEach((freq, i) => {
        const t = now + i * 0.05;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * 1.5, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.12, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0008, t + 0.45);
        osc.connect(g);
        g.connect(this.panner!);
        osc.start(t);
        osc.stop(t + 0.48);
      });
    }
  }

  public startAmbientLoop(getTheme: () => StageAcousticTheme) {
    this.ensureContext();
    if (this.loopTimer !== null) window.clearInterval(this.loopTimer);
    this.isPlaying = true;
    this.step = 0;

    const tick = () => {
      if (!this.isPlaying) return;
      const theme = getTheme();
      const s = this.step % 8;
      if (s === 0) this.triggerPad('CHORD', theme);
      if (s % 2 === 0) this.triggerPad('BASS', theme);
      if (s === 3 || s === 7) this.triggerPad('PLUCK', theme);
      if (s === 5) this.triggerPad('SPARKLE', theme);
      this.step += 1;
    };
    tick();
    this.loopTimer = window.setInterval(tick, 480);
  }

  public stopAmbientLoop() {
    this.isPlaying = false;
    if (this.loopTimer !== null) {
      window.clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
  }

  public sampleAudio(target: SpatialAudioState, elapsed: number, autoOrbit: boolean) {
    if (autoOrbit) {
      this.updateSpatialPosition(elapsed * 0.85);
    }
    target.sourceAngle = this.sourceAngle;

    if (!this.analyser || !this.ctx || this.ctx.state !== 'running') {
      // Gentle idle breathing animation even when audio is muted
      for (let i = 0; i < 36; i++) {
        target.bins[i] = Math.round(28 + Math.sin(elapsed * 2.6 + i * 0.35) * 18);
      }
      target.bass = 0.14 + Math.sin(elapsed * 2.2) * 0.06;
      target.treble = 0.12 + Math.cos(elapsed * 3.1) * 0.05;
      target.energy = 0.15;
      return;
    }

    this.analyser.getByteFrequencyData(this.freqData);
    let bassSum = 0;
    let trebleSum = 0;
    for (let i = 0; i < 36; i++) {
      const val = this.freqData[i] ?? 0;
      const idleWave = Math.round(18 + Math.sin(elapsed * 3 + i * 0.3) * 10);
      target.bins[i] = Math.max(val, idleWave);
      if (i < 8) bassSum += val;
      else if (i >= 16) trebleSum += val;
    }
    target.bass = Math.min(1, bassSum / (8 * 210));
    target.treble = Math.min(1, trebleSum / (20 * 180));
    target.energy = Math.min(1, target.bass * 0.65 + target.treble * 0.35);
  }

  public dispose() {
    this.stopAmbientLoop();
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

const NUM_SPECTRUM_BARS = 36;

function Soundstage3DScene({
  theme,
  soundEngine,
  autoOrbitSound,
}: {
  theme: StageAcousticTheme;
  soundEngine: LandingSpatialSoundEngine;
  autoOrbitSound: boolean;
}) {
  const cfg = THEME_CONFIG[theme];
  const barRefs = useRef<(THREE.Mesh | null)[]>([]);
  const waveRingRefs = useRef<(THREE.Mesh | null)[]>([]);
  const vinylGroupRef = useRef<THREE.Group>(null);
  const soundOrbGroupRef = useRef<THREE.Group>(null);
  const wooferLeftRef = useRef<THREE.Mesh>(null);
  const wooferRightRef = useRef<THREE.Mesh>(null);
  const discoGroupRef = useRef<THREE.Group>(null);
  const audioState = useMemo<SpatialAudioState>(
    () => ({
      energy: 0.15,
      bass: 0.15,
      treble: 0.1,
      sourceAngle: 0,
      pulseAt: 0,
      bins: new Uint8Array(NUM_SPECTRUM_BARS),
    }),
    []
  );

  const primaryColor = useMemo(() => new THREE.Color(cfg.primary), [cfg.primary]);
  const secondaryColor = useMemo(() => new THREE.Color(cfg.secondary), [cfg.secondary]);
  const tempColor = useMemo(() => new THREE.Color(), []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    soundEngine.sampleAudio(audioState, t, autoOrbitSound);
    const { bass, energy, bins, sourceAngle } = audioState;

    // Spin central 3D Acoustic Vinyl & Equalizer Core
    if (vinylGroupRef.current) {
      vinylGroupRef.current.rotation.y += delta * (0.55 + energy * 1.6);
    }

    // Update 36 circular 3D Spectrum Bars
    for (let i = 0; i < NUM_SPECTRUM_BARS; i++) {
      const mesh = barRefs.current[i];
      if (!mesh) continue;
      const norm = (bins[i] ?? 20) / 255;
      const targetH = Math.max(0.14, norm * 2.1 + bass * 0.45);
      mesh.scale.y = THREE.MathUtils.lerp(mesh.scale.y, targetH, Math.min(1, delta * 18));
      mesh.position.y = 0.08 + mesh.scale.y * 0.25;

      const mat = mesh.material as THREE.MeshStandardMaterial;
      tempColor.lerpColors(primaryColor, secondaryColor, i / NUM_SPECTRUM_BARS);
      mat.color.copy(tempColor);
      mat.emissive.copy(tempColor);
      mat.emissiveIntensity = 0.8 + norm * 2.2;
    }

    // Expand 3 concentric 3D Acoustic Pressure Wave Rings outward
    for (let r = 0; r < 3; r++) {
      const ring = waveRingRefs.current[r];
      if (!ring) continue;
      const phase = ((t * (0.65 + bass * 0.4) + r * 0.33) % 1);
      const scale = 1.1 + phase * 3.2;
      ring.scale.set(scale, scale, 1);
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - phase) * (0.22 + bass * 0.45);
      mat.color.copy(r % 2 === 0 ? primaryColor : secondaryColor);
    }

    // Pulse Left & Right Studio Subwoofer Cones on Bass hits
    const coneScale = 1 + bass * 0.38;
    if (wooferLeftRef.current) {
      wooferLeftRef.current.scale.set(coneScale, coneScale, 1 + bass * 0.55);
    }
    if (wooferRightRef.current) {
      wooferRightRef.current.scale.set(coneScale, coneScale, 1 + bass * 0.55);
    }

    // Move 3D Spatial Audio HRTF Source Orb along its real 3D panner trajectory
    if (soundOrbGroupRef.current) {
      const r = 2.65;
      soundOrbGroupRef.current.position.set(
        Math.sin(sourceAngle) * r,
        0.95 + Math.sin(t * 2.8) * 0.18 + bass * 0.22,
        Math.cos(sourceAngle) * r
      );
      soundOrbGroupRef.current.rotation.y = -sourceAngle;
    }

    if (discoGroupRef.current) {
      discoGroupRef.current.rotation.y += delta * (0.9 + bass * 1.5);
    }
  });

  return (
    <>
      <color attach="background" args={[cfg.bg]} />
      <fog attach="fog" args={[cfg.bg, 7, 16]} />

      <ambientLight intensity={0.65} color="#f8fafc" />
      <spotLight
        position={[0, 5.5, 2.2]}
        angle={0.65}
        penumbra={0.7}
        intensity={4.5}
        color={cfg.primary}
        castShadow
      />
      <pointLight position={[-3.2, 2.6, 1.5]} intensity={2.4} distance={10} color={cfg.secondary} />
      <pointLight position={[3.2, 2.6, 1.5]} intensity={2.4} distance={10} color={cfg.primary} />

      {/* Stage Floor (concept-specific material & accents) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[6.5, 48]} />
        <meshStandardMaterial
          color={theme === 'CHAMBER' ? '#2c180e' : theme === 'KARAOKE' ? '#130b1c' : '#0b0e17'}
          roughness={theme === 'CHAMBER' ? 0.55 : 0.22}
          metalness={theme === 'CHAMBER' ? 0.15 : 0.68}
        />
      </mesh>

      {/* Concept-Specific Central Stage Architecture */}
      {theme === 'CHAMBER' && (
        <group>
          {/* Warm Wooden Acoustic Platform */}
          <mesh position={[0, 0.03, 0]} receiveShadow>
            <cylinderGeometry args={[1.65, 1.75, 0.08, 48]} />
            <meshStandardMaterial color="#5c3018" roughness={0.5} metalness={0.1} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.075, 0]}>
            <ringGeometry args={[1.52, 1.62, 48]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.6} side={THREE.DoubleSide} />
          </mesh>

          {/* Grand Piano */}
          <group position={[-0.35, 0.07, -0.15]} rotation={[0, 0.35, 0]}>
            {/* Piano Body */}
            <mesh position={[0, 0.58, 0]} castShadow>
              <boxGeometry args={[1.05, 0.2, 1.25]} />
              <meshStandardMaterial color="#18110e" roughness={0.2} metalness={0.6} />
            </mesh>
            {/* Open Piano Lid */}
            <mesh position={[-0.08, 0.88, -0.05]} rotation={[0, 0, 0.42]}>
              <boxGeometry args={[1.02, 0.04, 1.2]} />
              <meshStandardMaterial color="#271812" roughness={0.18} metalness={0.55} />
            </mesh>
            {/* Lid Prop Stick */}
            <mesh position={[0.35, 0.78, 0.25]} rotation={[0, 0, -0.25]}>
              <cylinderGeometry args={[0.012, 0.012, 0.48, 8]} />
              <meshStandardMaterial color="#d97706" metalness={0.8} roughness={0.25} />
            </mesh>
            {/* Keyboard Bed */}
            <mesh position={[0, 0.54, 0.66]}>
              <boxGeometry args={[0.98, 0.06, 0.24]} />
              <meshStandardMaterial color="#fafaf9" roughness={0.3} />
            </mesh>
            {/* 3 Legs */}
            {[
              [-0.42, 0.26, 0.5],
              [0.42, 0.26, 0.5],
              [0, 0.26, -0.5],
            ].map((pos, idx) => (
              <mesh key={idx} position={pos as [number, number, number]}>
                <cylinderGeometry args={[0.035, 0.025, 0.52, 10]} />
                <meshStandardMaterial color="#18110e" roughness={0.3} metalness={0.5} />
              </mesh>
            ))}
          </group>

          {/* Acoustic Music Stand + Warm Lamp + Violin/Cello Silhouette */}
          <group position={[0.78, 0.07, 0.25]} rotation={[0, -0.4, 0]}>
            <mesh position={[0, 0.48, 0]}>
              <cylinderGeometry args={[0.018, 0.03, 0.96, 10]} />
              <meshStandardMaterial color="#b45309" metalness={0.75} roughness={0.25} />
            </mesh>
            <mesh position={[0, 0.96, 0]} rotation={[-0.45, 0, 0]}>
              <boxGeometry args={[0.42, 0.28, 0.025]} />
              <meshStandardMaterial color="#78350f" roughness={0.45} />
            </mesh>
            <mesh position={[0, 0.98, 0.02]} rotation={[-0.45, 0, 0]}>
              <boxGeometry args={[0.34, 0.22, 0.01]} />
              <meshStandardMaterial color="#fef3c7" emissive="#fde68a" emissiveIntensity={0.35} />
            </mesh>
          </group>
        </group>
      )}

      {theme === 'CONCERT' && (
        <group>
          {/* Central Spinning Turntable / Concert Stage Core */}
          <group ref={vinylGroupRef} position={[0, 0.04, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.42, 1.5, 48]} />
              <meshStandardMaterial color="#18181b" roughness={0.25} metalness={0.85} side={THREE.DoubleSide} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
              <ringGeometry args={[0.14, 0.42, 32]} />
              <meshStandardMaterial
                color={cfg.primary}
                emissive={cfg.primary}
                emissiveIntensity={1.4}
                roughness={0.3}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>

          {/* Center Lead Vocal Mic + Drum & Synth Backline */}
          <group position={[0, 0.04, 0.25]}>
            <mesh position={[0, 0.55, 0]}>
              <cylinderGeometry args={[0.02, 0.025, 1.1, 10]} />
              <meshStandardMaterial color="#e4e4e7" metalness={0.9} roughness={0.15} />
            </mesh>
            <mesh position={[0, 1.14, 0]}>
              <capsuleGeometry args={[0.06, 0.08, 8, 16]} />
              <meshStandardMaterial
                color="#f4f4f5"
                emissive={cfg.secondary}
                emissiveIntensity={0.65}
                metalness={0.85}
                roughness={0.2}
              />
            </mesh>
          </group>

          {/* Backline Kick Drum & Cymbal */}
          <group position={[0, 0.04, -0.75]}>
            <mesh position={[0, 0.36, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.34, 0.34, 0.38, 24]} />
              <meshStandardMaterial color="#1e1b4b" metalness={0.65} roughness={0.25} />
            </mesh>
            <mesh position={[0, 0.36, 0.195]}>
              <ringGeometry args={[0.26, 0.32, 24]} />
              <meshBasicMaterial color={cfg.secondary} />
            </mesh>
            {/* Overhead Concert Truss Arch */}
            <mesh position={[-2.2, 1.65, -0.6]}>
              <boxGeometry args={[0.14, 3.3, 0.14]} />
              <meshStandardMaterial color="#3f3f46" metalness={0.85} roughness={0.3} />
            </mesh>
            <mesh position={[2.2, 1.65, -0.6]}>
              <boxGeometry args={[0.14, 3.3, 0.14]} />
              <meshStandardMaterial color="#3f3f46" metalness={0.85} roughness={0.3} />
            </mesh>
            <mesh position={[0, 3.25, -0.6]}>
              <boxGeometry args={[4.54, 0.16, 0.16]} />
              <meshStandardMaterial color="#52525b" metalness={0.85} roughness={0.3} />
            </mesh>
            {/* LED Concert Backdrop Screen */}
            <mesh position={[0, 1.75, -1.35]}>
              <boxGeometry args={[3.2, 1.55, 0.08]} />
              <meshStandardMaterial
                color="#090d16"
                emissive={cfg.primary}
                emissiveIntensity={0.45}
                roughness={0.2}
              />
            </mesh>
          </group>
        </group>
      )}

      {theme === 'KARAOKE' && (
        <group>
          {/* Glowing LED Dance Floor Tiles */}
          <group position={[0, 0.02, 0.25]}>
            {[-1, 0, 1].map((gx) =>
              [-1, 0, 1].map((gz) => (
                <mesh key={`${gx}-${gz}`} position={[gx * 0.62, 0, gz * 0.62]} rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[0.56, 0.56]} />
                  <meshStandardMaterial
                    color={(gx + gz) % 2 === 0 ? '#ec4899' : '#38bdf8'}
                    emissive={(gx + gz) % 2 === 0 ? '#ec4899' : '#38bdf8'}
                    emissiveIntensity={0.55}
                    roughness={0.2}
                  />
                </mesh>
              ))
            )}
          </group>

          {/* Duet Karaoke Mic Stands */}
          {[-0.65, 0.65].map((mx, idx) => (
            <group key={mx} position={[mx, 0.04, 0.2]}>
              <mesh position={[0, 0.5, 0]}>
                <cylinderGeometry args={[0.018, 0.024, 1.0, 10]} />
                <meshStandardMaterial color="#e4e4e7" metalness={0.9} roughness={0.15} />
              </mesh>
              <mesh position={[0, 1.04, 0]}>
                <sphereGeometry args={[0.06, 12, 12]} />
                <meshStandardMaterial
                  color="#ffffff"
                  emissive={idx === 0 ? '#ec4899' : '#38bdf8'}
                  emissiveIntensity={1.2}
                />
              </mesh>
            </group>
          ))}

          {/* Giant Widescreen Karaoke Lyrics TV */}
          <group position={[0, 1.45, -1.65]}>
            <mesh>
              <boxGeometry args={[3.1, 1.55, 0.1]} />
              <meshStandardMaterial color="#18181b" metalness={0.6} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0, 0.055]}>
              <planeGeometry args={[2.86, 1.32]} />
              <meshStandardMaterial color="#0f0720" emissive="#a855f7" emissiveIntensity={0.35} />
            </mesh>
            {/* Glowing Lyric Lines */}
            <mesh position={[0, 0.16, 0.065]}>
              <planeGeometry args={[1.9, 0.12]} />
              <meshBasicMaterial color="#38bdf8" />
            </mesh>
            <mesh position={[0, -0.1, 0.065]}>
              <planeGeometry args={[1.45, 0.12]} />
              <meshBasicMaterial color="#f472b6" />
            </mesh>
          </group>

          {/* Spinning Disco Ball */}
          <group ref={vinylGroupRef} position={[0, 2.85, 0]}>
            <mesh>
              <icosahedronGeometry args={[0.32, 1]} />
              <meshStandardMaterial color="#f8fafc" metalness={0.95} roughness={0.1} flatShading />
            </mesh>
            <mesh position={[0, 0.5, 0]}>
              <cylinderGeometry args={[0.01, 0.01, 0.8, 6]} />
              <meshBasicMaterial color="#cbd5e1" />
            </mesh>
          </group>
        </group>
      )}

      {/* 36-Bar Circular 3D Frequency Analyzer Ring */}
      <group>
        {Array.from({ length: NUM_SPECTRUM_BARS }, (_, i) => {
          const angle = (i / NUM_SPECTRUM_BARS) * Math.PI * 2;
          const radius = 1.85;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          return (
            <mesh
              key={i}
              ref={(el) => {
                barRefs.current[i] = el;
              }}
              position={[x, 0.25, z]}
              rotation={[0, -angle, 0]}
            >
              <boxGeometry args={[0.09, 0.5, 0.09]} />
              <meshStandardMaterial
                color={cfg.primary}
                emissive={cfg.primary}
                emissiveIntensity={1.4}
                roughness={0.25}
                metalness={0.5}
              />
            </mesh>
          );
        })}
      </group>

      {/* 3 Expanding Concentric 3D Sound Wave Ripples */}
      {[0, 1, 2].map((idx) => (
        <mesh
          key={idx}
          ref={(el) => {
            waveRingRefs.current[idx] = el;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.02 + idx * 0.005, 0]}
        >
          <ringGeometry args={[0.88, 0.94, 48]} />
          <meshBasicMaterial
            color={cfg.primary}
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* Left & Right Side Architecture: Warm Acoustic Lantern Pillars for Chamber vs Subwoofer Stacks for Concert/Karaoke */}
      {theme === 'CHAMBER'
        ? [-1, 1].map((dir) => (
            <group key={dir} position={[dir * 2.55, 0, -1.0]}>
              <mesh position={[0, 0.55, 0]} castShadow>
                <cylinderGeometry args={[0.18, 0.24, 1.1, 16]} />
                <meshStandardMaterial color="#451a03" roughness={0.55} metalness={0.15} />
              </mesh>
              <mesh position={[0, 1.15, 0]}>
                <cylinderGeometry args={[0.21, 0.21, 0.08, 16]} />
                <meshStandardMaterial color="#b45309" metalness={0.8} roughness={0.25} />
              </mesh>
              <mesh
                ref={dir === -1 ? wooferLeftRef : wooferRightRef}
                position={[0, 1.38, 0]}
              >
                <sphereGeometry args={[0.16, 16, 16]} />
                <meshStandardMaterial
                  color="#fef3c7"
                  emissive="#f59e0b"
                  emissiveIntensity={1.6}
                  roughness={0.2}
                />
              </mesh>
            </group>
          ))
        : [-1, 1].map((dir) => (
            <group key={dir} position={[dir * 2.55, 0.68, -1.1]} rotation={[0, -dir * 0.38, 0]}>
              {/* Speaker Cabinet */}
              <mesh castShadow>
                <boxGeometry args={[0.76, 1.36, 0.62]} />
                <meshStandardMaterial color="#18181b" roughness={0.45} metalness={0.55} />
              </mesh>
              {/* Neon Acoustic Rim */}
              <mesh position={[0, 0, 0.315]}>
                <boxGeometry args={[0.7, 1.28, 0.02]} />
                <meshStandardMaterial color="#09090b" roughness={0.8} />
              </mesh>
              {/* Tweeter Horn */}
              <mesh position={[0, 0.36, 0.33]}>
                <torusGeometry args={[0.12, 0.022, 10, 24]} />
                <meshStandardMaterial color={cfg.secondary} emissive={cfg.secondary} emissiveIntensity={1.5} />
              </mesh>
              {/* Bass Woofer Cone (Reactive) */}
              <mesh
                ref={dir === -1 ? wooferLeftRef : wooferRightRef}
                position={[0, -0.2, 0.33]}
              >
                <torusGeometry args={[0.23, 0.045, 12, 28]} />
                <meshStandardMaterial
                  color={cfg.primary}
                  emissive={cfg.primary}
                  emissiveIntensity={1.8}
                  metalness={0.7}
                  roughness={0.2}
                />
              </mesh>
            </group>
          ))}

      {/* Orbiting 3D HRTF Sound Source Satellite (shows exact 3D audio position in real time) */}
      <group ref={soundOrbGroupRef} position={[0, 1.0, 2.65]}>
        <mesh>
          <icosahedronGeometry args={[0.2, 2]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive={cfg.secondary}
            emissiveIntensity={2.2}
            roughness={0.1}
            metalness={0.9}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.34, 0.015, 8, 32]} />
          <meshBasicMaterial color={cfg.primary} />
        </mesh>
        <pointLight intensity={2.2} distance={4.5} color={cfg.secondary} />
      </group>

      {/* Overhead Volumetric Light Cones / Disco Beams */}
      <group ref={discoGroupRef} position={[0, 3.8, 0]}>
        {[0, 1, 2, 3].map((i) => {
          const angle = (i / 4) * Math.PI * 2;
          return (
            <group key={i} rotation={[0, angle, 0]}>
              <mesh position={[0, -1.8, 0.9]} rotation={[0.48, 0, 0]}>
                <coneGeometry args={[0.95, 4.0, 16, 1, true]} />
                <meshBasicMaterial
                  color={i % 2 === 0 ? cfg.primary : cfg.secondary}
                  transparent
                  opacity={0.09}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
            </group>
          );
        })}
      </group>

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI * 0.24}
        maxPolarAngle={Math.PI * 0.44}
        target={[0, 0.55, 0]}
      />
    </>
  );
}

export function LandingPage() {
  const [theme, setTheme] = useState<StageAcousticTheme>('CONCERT');
  const [audioPlaying, setAudioPlaying] = useState(false);
  const themeRef = useRef<StageAcousticTheme>(theme);
  themeRef.current = theme;

  const soundEngine = useMemo(() => new LandingSpatialSoundEngine(), []);

  useEffect(() => {
    return () => {
      soundEngine.dispose();
    };
  }, [soundEngine]);

  const handleToggleSpatialLoop = () => {
    if (audioPlaying) {
      soundEngine.stopAmbientLoop();
      setAudioPlaying(false);
    } else {
      soundEngine.startAmbientLoop(() => themeRef.current);
      setAudioPlaying(true);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-3xl border border-stone-800/90 bg-stone-950 shadow-2xl">
        {/* Top Section: Spacious Centered Headline & Primary CTAs */}
        <div className="flex flex-col items-center px-6 pt-10 pb-8 text-center sm:px-12 sm:pt-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-semibold text-amber-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            3D Live Music &amp; Karaoke
          </div>

          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:whitespace-nowrap lg:text-5xl">
            Không Gian Âm Nhạc{' '}
            <span className="bg-gradient-to-r from-amber-300 via-fuchsia-400 to-sky-400 bg-clip-text text-transparent">
              3D Sống Động
            </span>
          </h1>

          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-stone-400 sm:text-base lg:whitespace-nowrap">
            Bước vào Thính phòng, Sân khấu Concert và Phòng Karaoke 3D cùng nhân vật Anime Chibi.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3.5">
            <Link
              to="/explore"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-6 py-3 text-sm font-bold text-stone-950 shadow-lg shadow-amber-500/20 transition hover:brightness-110"
            >
              Khám Phá Phòng Nhạc <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/lobby"
              className="inline-flex items-center gap-2 rounded-xl border border-stone-700 bg-stone-900/90 px-6 py-3 text-sm font-semibold text-stone-100 transition hover:border-stone-600 hover:bg-stone-800"
            >
              Vào Sảnh / Mã Phòng
            </Link>
          </div>
        </div>

        {/* Bottom Section: Wide Panoramic 3D Soundstage */}
        <div className="relative h-[440px] w-full border-t border-stone-800/80 sm:h-[520px]">
          <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 2.6, 5.2], fov: 44 }}>
            <Soundstage3DScene theme={theme} soundEngine={soundEngine} autoOrbitSound={true} />
          </Canvas>

          {/* Floating Top Controls inside 3D Stage */}
          <div className="pointer-events-auto absolute left-4 right-4 top-4 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleToggleSpatialLoop}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold backdrop-blur-md transition active:scale-95 ${
                audioPlaying
                  ? 'bg-emerald-500 text-stone-950 shadow-lg shadow-emerald-500/25'
                  : 'border border-amber-400/50 bg-stone-950/80 text-amber-200 hover:bg-amber-500 hover:text-stone-950'
              }`}
            >
              {audioPlaying ? <Volume2 className="h-3.5 w-3.5 animate-bounce" /> : <VolumeX className="h-3.5 w-3.5" />}
              {audioPlaying ? 'Tắt Nhạc 3D' : 'Nghe Thử Âm Thanh 3D'}
            </button>

            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-stone-800/90 bg-stone-950/80 p-1 backdrop-blur-md">
              {(['CHAMBER', 'CONCERT', 'KARAOKE'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTheme(t);
                    soundEngine.triggerPad('CHORD', t);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    theme === t
                      ? 'bg-amber-400 text-stone-950 shadow'
                      : 'text-stone-300 hover:bg-stone-800 hover:text-white'
                  }`}
                >
                  {t === 'CHAMBER' ? '🎻 Thính Phòng' : t === 'CONCERT' ? '🎆 Concert' : '🎤 Karaoke'}
                </button>
              ))}
            </div>
          </div>

          {/* Floating Bottom Info Strip */}
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-xl border border-stone-800/80 bg-stone-950/75 px-4 py-2 text-xs text-stone-300 backdrop-blur-md">
            <span className="flex items-center gap-1.5 font-medium text-amber-200">
              <Disc3 className="h-3.5 w-3.5 animate-spin text-amber-400" />
              {THEME_CONFIG[theme].name} • {THEME_CONFIG[theme].subtitle}
            </span>
            <span className="text-[11px] text-stone-400">Kéo chuột để xoay 360°</span>
          </div>
        </div>
      </div>

      {/* Section 1: 3 Signature 3D Venues Showcase */}
      <div className="mt-14">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
            <Sparkles className="h-3.5 w-3.5" /> 3 Không Gian Biểu Diễn 3D
          </span>
          <h2 className="mt-3 text-2xl font-extrabold text-white sm:text-3xl">
            Mỗi Đêm Nhạc Là Một Không Gian Sân Khấu Riêng
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-stone-400">
            Tự do lựa chọn phong cách khán phòng phù hợp từ độc tấu cổ điển, đêm nhạc EDM sôi động đến phòng hát Karaoke
            cùng bạn bè.
          </p>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            {
              badge: '🎻 Thính Phòng Acoustic',
              title: 'Chamber Auditorium',
              desc: 'Không gian gỗ ấm áp với đàn Grand Piano sơn mài bóng, đèn chùm pha lê và sơ đồ chọn ghế 2D trước khi bước vào khán phòng 3D.',
              highlights: ['Sơ đồ giữ ghế 2D trực quan', 'Đàn Grand Piano & ánh đèn vàng ấm', 'Phù hợp Solo, Duo, Acoustic & Strings'],
              accentClass: 'border-amber-500/30 hover:border-amber-400/60',
              pillClass: 'bg-amber-500/15 text-amber-300',
            },
            {
              badge: '🎆 Sân Khấu Concert',
              title: 'Beat-Sync Live Arena',
              desc: 'Sân khấu tương phản cao với cặp loa Subwoofer phòng thu, đèn Moving-Head và hệ thống cột sóng LED nhảy theo đúng nhịp Bass.',
              highlights: ['Ánh sáng nháy theo phổ tần số Bass', 'Hỗ trợ MIDI Controller & DAW trực tiếp', 'Tương tác tung hoa 3D & nhảy Samba'],
              accentClass: 'border-sky-500/30 hover:border-sky-400/60',
              pillClass: 'bg-sky-500/15 text-sky-300',
            },
            {
              badge: '🎤 Phòng Karaoke 360°',
              title: 'VIP Disco KTV Lounge',
              desc: 'Phòng hát ấm cúng với quả cầu gương Disco xoay 360°, sàn nhảy LED, bàn kính VIP và màn hình chiếu lời đối diện + chế độ xem lời Fullscreen.',
              highlights: ['Bấm vào Micro để lên thẳng sân khấu hát', 'Màn hình xem lời đối diện & Fullscreen', 'Chấm điểm Karaoke tự động cuối bài'],
              accentClass: 'border-fuchsia-500/30 hover:border-fuchsia-400/60',
              pillClass: 'bg-fuchsia-500/15 text-fuchsia-300',
            },
          ].map((venue) => (
            <div
              key={venue.title}
              className={`flex flex-col justify-between rounded-2xl border bg-stone-900/65 p-6 transition ${venue.accentClass}`}
            >
              <div>
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${venue.pillClass}`}>
                  {venue.badge}
                </span>
                <h3 className="mt-4 text-lg font-extrabold text-white">{venue.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-400">{venue.desc}</p>
              </div>
              <ul className="mt-5 space-y-1.5 border-t border-stone-800/80 pt-4 text-xs text-stone-300">
                {venue.highlights.map((h) => (
                  <li key={h} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Studio Vocal DSP + 4 Default Chibi Outfits (2 Male / 2 Female) */}
      <div className="mt-14 grid gap-6 lg:grid-cols-12">
        {/* Left: Studio Audio DSP Capabilities */}
        <div className="flex flex-col justify-between rounded-3xl border border-stone-800/90 bg-stone-900/60 p-7 sm:p-9 lg:col-span-6">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              <Sliders className="h-3.5 w-3.5" /> Công Nghệ Âm Thanh Trực Tiếp
            </span>
            <h2 className="mt-3 text-2xl font-extrabold text-white sm:text-3xl">
              Bộ Xử Lý Giọng Hát Phòng Thu Ngay Trên Trình Duyệt
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-400">
              Không cần cài đặt phần mềm phức tạp. Cắm micro hoặc nhạc cụ và tinh chỉnh âm thanh trực tiếp với độ trễ cực
              thấp.
            </p>

            <div className="mt-6 grid gap-3.5 sm:grid-cols-2">
              {[
                {
                  icon: <Mic2 className="h-4 w-4 text-fuchsia-400" />,
                  title: 'Autotune & Khóa Nốt Live',
                  desc: 'Tự động bắt cao độ giọng hát mỗi 15ms, chỉnh mượt tự nhiên hoặc hiệu ứng giọng Idol/T-Pain.',
                },
                {
                  icon: <Sparkles className="h-4 w-4 text-sky-400" />,
                  title: 'Echo +1 Tông & Reverb',
                  desc: 'Hiệu ứng vang Karaoke kèm tùy chọn nâng bè Echo +1 cung (+2ST) và Reverb 12ms pre-delay trong trẻo.',
                },
                {
                  icon: <Sliders className="h-4 w-4 text-amber-400" />,
                  title: 'Bass EQ 110Hz & Noise Gate',
                  desc: 'Tăng lực trầm cho nhạc nền, lọc tiếng ồn môi trường kiểu Discord và cắt tần số ù đục 270Hz.',
                },
                {
                  icon: <Headphones className="h-4 w-4 text-emerald-400" />,
                  title: 'WebRTC Opus 10ms • 48kHz',
                  desc: 'Truyền tải âm thanh 128kbps fullband với bộ đệm jitter 20ms và kênh Talkback riêng cho ban nhạc.',
                },
              ].map((feat) => (
                <div key={feat.title} className="rounded-2xl border border-stone-800/80 bg-stone-950/75 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    {feat.icon}
                    {feat.title}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-stone-400">{feat.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: 4 Anime Chibi Outfits Showcase (2 Nam • 2 Nữ) */}
        <div className="flex flex-col justify-between rounded-3xl border border-stone-800/90 bg-stone-900/60 p-7 sm:p-9 lg:col-span-6">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-pink-500/30 bg-pink-500/10 px-3 py-1 text-xs font-semibold text-pink-300">
              <Sparkles className="h-3.5 w-3.5" /> 4 Outfit Mặc Định (2 Nam • 2 Nữ)
            </span>
            <h2 className="mt-3 text-2xl font-extrabold text-white sm:text-3xl">
              Nhân Vật Anime Chibi 3D Cử Động &amp; Nhảy 5 Điệu
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-400">
              Hóa thân thành 4 phong cách Chibi đáng yêu được gắn khớp xương 3D hoàn chỉnh — hỗ trợ đi dạo, ngồi ghế, vẫy
              tay, tung hoa và nhảy 5 điệu (Samba, Hip Hop, Soul Spin, Samba 2, YMCA).
            </p>

            <LandingDanceShowcase3D />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-800/80 bg-stone-950/70 px-4 py-3 text-xs text-stone-300">
            <span>Đổi Outfit tự do bất cứ lúc nào ngay trong phòng 3D</span>
            <Link to="/auth" className="font-bold text-amber-400 hover:underline">
              Tạo tài khoản &amp; Chọn Outfit →
            </Link>
          </div>
        </div>
      </div>

      {/* Section 3: Bottom Call-to-Action & Trust Footer */}
      <div className="mt-14 overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-r from-stone-900 via-stone-950 to-amber-950/40 p-8 sm:p-10">
        <div className="flex flex-col items-center justify-between gap-6 text-center lg:flex-row lg:text-left">
          <div>
            <h2 className="text-2xl font-extrabold text-white sm:text-3xl">
              Sẵn Sàng Bước Lên Sân Khấu Âm Nhạc 3D?
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-stone-300">
              Tham gia ngay các buổi biểu diễn trực tiếp hoặc tự mở phòng Karaoke 3D cùng bạn bè hoàn toàn miễn phí trên
              trình duyệt.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Link
              to="/explore"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-6 py-3.5 text-sm font-bold text-stone-950 shadow-lg shadow-amber-500/20 transition hover:brightness-110"
            >
              Vào Xem Các Phòng Đang Mở <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/lobby"
              className="inline-flex items-center gap-2 rounded-xl border border-stone-700 bg-stone-900/90 px-5 py-3.5 text-sm font-semibold text-stone-100 transition hover:bg-stone-800"
            >
              Tạo Phòng / Nhập Mã
            </Link>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-stone-800/80 pt-5 text-xs text-stone-400">
          <div className="flex items-center gap-2">
            <Music2 className="h-4 w-4 text-amber-400" />
            <span>Virtual Music World • Hỗ trợ Solo, Duo, Band, Orchestra &amp; Karaoke 3D (10–20 người/phòng)</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>100% Free Web App • 16+ Age Policy • Low-Latency WebRTC &amp; WebAudio</span>
          </div>
        </div>
      </div>
    </div>
  );
}
