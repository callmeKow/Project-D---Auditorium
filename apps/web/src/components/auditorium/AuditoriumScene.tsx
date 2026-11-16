import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { RoomDTO, SetlistItemDTO, UserRole } from '@vmw/contracts';
import { realtimeStore, type AvatarRuntimeEntry } from '../../realtime/realtimeStore';
import { ChibiAvatar } from './ChibiAvatar';

export type CameraMode = 'AUDIENCE_ORBIT' | 'STAGE_VIEW' | 'SEAT_POV';

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

function AuditoriumArchitecture({ sconceColor }: { sconceColor: string }) {
  const slatOffsets = [-3.6, -2.0, -0.4, 1.2, 2.8, 4.4, 6.0, 7.6];
  const chandelierZ = [1.8, 5.4];

  return (
    <group>
      {/* Main Hardwood Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2.2]} receiveShadow>
        <planeGeometry args={[14, 16]} />
        <meshStandardMaterial color="#3b2316" roughness={0.65} />
      </mesh>

      {/* Crimson Velvet Central Aisle Carpet */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 4.6]} receiveShadow>
        <planeGeometry args={[1.35, 8.6]} />
        <meshStandardMaterial color="#6b141a" roughness={0.9} />
      </mesh>

      {/* Warm Aisle Step-Light Strips */}
      <mesh position={[-0.7, 0.015, 4.6]}>
        <boxGeometry args={[0.04, 0.02, 8.6]} />
        <meshStandardMaterial color={sconceColor} emissive={sconceColor} emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0.7, 0.015, 4.6]}>
        <boxGeometry args={[0.04, 0.02, 8.6]} />
        <meshStandardMaterial color={sconceColor} emissive={sconceColor} emissiveIntensity={1.4} />
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
          <pointLight position={[0, -0.3, 0]} intensity={1.6} distance={10} color={sconceColor} />
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
  localRole,
  cameraMode,
  onFpsSample,
}: {
  localUserId: string;
  localRole: UserRole;
  cameraMode: CameraMode;
  onFpsSample: (fps: number) => void;
}) {
  const { camera } = useThree();
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
      camera.position.set(0, 2.3, 2.4);
      camera.lookAt(0, 1.1, -2.2);
    } else if (cameraMode === 'AUDIENCE_ORBIT') {
      camera.position.set(0, 4.2, 8.8);
      camera.lookAt(0, 1.1, -1.0);
    }
  }, [cameraMode, camera]);

  useFrame((_state, delta) => {
    const currentKeys = Array.from(realtimeStore.avatars.keys());
    if (currentKeys.length !== avatarKeys.length) {
      setAvatarKeys(currentKeys);
    }

    frameCounter.current.frames += 1;
    const now = performance.now();
    if (now - frameCounter.current.lastAt >= 1000) {
      onFpsSample(frameCounter.current.frames);
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
      const minZ = localRole === 'ARTIST' ? -3.2 : 0.8;
      const nextX = Math.max(-5.5, Math.min(5.5, local.targetPosition[0] + dx * speed));
      const nextZ = Math.max(minZ, Math.min(8.5, local.targetPosition[2] + dz * speed));
      const nextRot = Math.atan2(dx, dz);

      local.targetPosition = [nextX, local.seatId ? 0 : local.targetPosition[1], nextZ];
      local.targetRotationY = nextRot;
      local.animation = 'WALK';
      local.seatId = undefined;

      if (now - lastBroadcast.current > 65) {
        lastBroadcast.current = now;
        realtimeStore.sendMove(local.targetPosition, nextRot, 'WALK');
      }
    } else if (local.animation === 'WALK') {
      local.animation = 'IDLE';
      realtimeStore.sendMove(local.targetPosition, local.targetRotationY, 'IDLE');
    }

    if (cameraMode === 'SEAT_POV') {
      camera.position.set(local.targetPosition[0], local.targetPosition[1] + 1.25, local.targetPosition[2] - 0.15);
      camera.lookAt(0, 1.2, -2.2);
    }
  });

  const entries: AvatarRuntimeEntry[] = [];
  for (const k of avatarKeys) {
    const item = realtimeStore.avatars.get(k);
    if (item) entries.push(item);
  }

  return (
    <>
      {entries.map((entry) => (
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
  onSelectSeat,
  onFpsSample,
}: {
  room: RoomDTO;
  localUserId: string;
  localRole: UserRole;
  lightingPreset: SetlistItemDTO['lightingPreset'];
  cameraMode: CameraMode;
  onSelectSeat: (seatId: string) => void;
  onFpsSample: (fps: number) => void;
}) {
  const light = LIGHTING_CONFIG[lightingPreset] ?? LIGHTING_CONFIG.WARM_CHAMBER;

  return (
    <Canvas shadows camera={{ position: [0, 4.2, 8.8], fov: 50 }} className="h-full w-full">
      <color attach="background" args={[light.bg]} />
      <fog attach="fog" args={[light.bg, 15, 32]} />

      <hemisphereLight args={[light.ambient, '#3b2316', 0.65]} />
      <ambientLight color={light.ambient} intensity={light.ambientInt} />

      {/* Main Stage Spotlight + Warm Stage Wash */}
      <spotLight
        position={[0, 6.2, 1.8]}
        angle={0.62}
        penumbra={0.65}
        intensity={light.spotInt}
        color={light.spot}
        castShadow
      />
      <pointLight position={[-2.8, 3.6, -1.8]} intensity={2.2} distance={10} color="#fde68a" />
      <pointLight position={[2.8, 3.6, -1.8]} intensity={2.2} distance={10} color="#fde68a" />

      <AuditoriumArchitecture sconceColor={light.sconce} />

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
        localRole={localRole}
        cameraMode={cameraMode}
        onFpsSample={onFpsSample}
      />

      {cameraMode !== 'SEAT_POV' && <OrbitControls maxPolarAngle={Math.PI / 2 - 0.05} minDistance={2} maxDistance={14} />}
    </Canvas>
  );
}
