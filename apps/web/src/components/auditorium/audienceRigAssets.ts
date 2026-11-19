import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AvatarAnimationState, AvatarPresetId } from '@vmw/contracts';
import { dressRigAsChibi } from './chibiCharacterKit';

export type AudienceClipKey =
  | 'IDLE'
  | 'WALK'
  | 'SIT'
  | 'CLAP'
  | 'CHEER'
  | 'WAVE'
  | 'DANCE'
  | 'DANCE_2'
  | 'DANCE_3'
  | 'DANCE_4'
  | 'DANCE_5'
  | 'AFK'
  | 'PLAY';

export interface AudienceRigAssets {
  templateScene: THREE.Group;
  clips: Record<AudienceClipKey, THREE.AnimationClip>;
}

function quatTrack(bone: string, times: number[], eulers: Array<[number, number, number]>) {
  const values: number[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const [x, y, z] of eulers) {
    e.set(x, y, z, 'XYZ');
    q.setFromEuler(e);
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
}

function posTrack(bone: string, times: number[], positions: Array<[number, number, number]>) {
  const values: number[] = [];
  for (const [x, y, z] of positions) {
    values.push(x, y, z);
  }
  return new THREE.VectorKeyframeTrack(`${bone}.position`, times, values);
}

function buildSitClip(): THREE.AnimationClip {
  const times = [0, 1.4, 2.8];
  const tracks: THREE.KeyframeTrack[] = [
    posTrack('mixamorigHips', times, [
      [0, 44, -2],
      [0, 44.5, -2],
      [0, 44, -2],
    ]),
    quatTrack('mixamorigHips', times, [
      [0.04, 0, 0],
      [0.05, 0, 0],
      [0.04, 0, 0],
    ]),
    quatTrack('mixamorigSpine', times, [
      [-0.04, 0, 0],
      [-0.02, 0, 0],
      [-0.04, 0, 0],
    ]),
    quatTrack('mixamorigLeftUpLeg', times, [
      [-1.45, 0.08, 0],
      [-1.45, 0.08, 0],
      [-1.45, 0.08, 0],
    ]),
    quatTrack('mixamorigRightUpLeg', times, [
      [-1.45, -0.08, 0],
      [-1.45, -0.08, 0],
      [-1.45, -0.08, 0],
    ]),
    quatTrack('mixamorigLeftLeg', times, [
      [1.45, 0, 0],
      [1.45, 0, 0],
      [1.45, 0, 0],
    ]),
    quatTrack('mixamorigRightLeg', times, [
      [1.45, 0, 0],
      [1.45, 0, 0],
      [1.45, 0, 0],
    ]),
    quatTrack('mixamorigLeftArm', times, [
      [0.25, -0.4, -1.15],
      [0.25, -0.4, -1.12],
      [0.25, -0.4, -1.15],
    ]),
    quatTrack('mixamorigRightArm', times, [
      [0.25, 0.4, 1.15],
      [0.25, 0.4, 1.12],
      [0.25, 0.4, 1.15],
    ]),
    quatTrack('mixamorigLeftForeArm', times, [
      [0, -0.45, 0],
      [0, -0.48, 0],
      [0, -0.45, 0],
    ]),
    quatTrack('mixamorigRightForeArm', times, [
      [0, 0.45, 0],
      [0, 0.48, 0],
      [0, 0.45, 0],
    ]),
  ];
  return new THREE.AnimationClip('vmw_sit', 2.8, tracks);
}

function buildClapClip(): THREE.AnimationClip {
  const times = [0, 0.22, 0.44];
  const tracks: THREE.KeyframeTrack[] = [
    posTrack('mixamorigHips', times, [
      [0, 102, 1.5],
      [0, 100, 1.5],
      [0, 102, 1.5],
    ]),
    quatTrack('mixamorigSpine2', times, [
      [0.05, 0, 0],
      [0.09, 0, 0],
      [0.05, 0, 0],
    ]),
    quatTrack('mixamorigLeftArm', times, [
      [0.1, -0.95, -0.85],
      [0.1, -1.18, -0.82],
      [0.1, -0.95, -0.85],
    ]),
    quatTrack('mixamorigRightArm', times, [
      [0.1, 0.95, 0.85],
      [0.1, 1.18, 0.82],
      [0.1, 0.95, 0.85],
    ]),
    quatTrack('mixamorigLeftForeArm', times, [
      [0, -0.95, 0],
      [0, -1.15, 0],
      [0, -0.95, 0],
    ]),
    quatTrack('mixamorigRightForeArm', times, [
      [0, 0.95, 0],
      [0, 1.15, 0],
      [0, 0.95, 0],
    ]),
    quatTrack('mixamorigLeftUpLeg', times, [
      [-0.08, 0.08, 0.08],
      [-0.1, 0.08, 0.08],
      [-0.08, 0.08, 0.08],
    ]),
    quatTrack('mixamorigRightUpLeg', times, [
      [-0.08, -0.08, -0.08],
      [-0.1, -0.08, -0.08],
      [-0.08, -0.08, -0.08],
    ]),
    quatTrack('mixamorigLeftLeg', times, [
      [0.08, 0, 0],
      [0.12, 0, 0],
      [0.08, 0, 0],
    ]),
    quatTrack('mixamorigRightLeg', times, [
      [0.08, 0, 0],
      [0.12, 0, 0],
      [0.08, 0, 0],
    ]),
  ];
  return new THREE.AnimationClip('vmw_clap', 0.44, tracks);
}

function buildCheerClip(): THREE.AnimationClip {
  const times = [0, 0.3, 0.6];
  const tracks: THREE.KeyframeTrack[] = [
    posTrack('mixamorigHips', times, [
      [0, 102, 1.5],
      [0, 111, 1.5],
      [0, 102, 1.5],
    ]),
    quatTrack('mixamorigSpine2', times, [
      [-0.04, 0, 0],
      [-0.1, 0, 0],
      [-0.04, 0, 0],
    ]),
    quatTrack('mixamorigLeftArm', times, [
      [0.15, -0.2, 0.65],
      [0.15, -0.2, 0.95],
      [0.15, -0.2, 0.65],
    ]),
    quatTrack('mixamorigRightArm', times, [
      [0.15, 0.2, -0.65],
      [0.15, 0.2, -0.95],
      [0.15, 0.2, -0.65],
    ]),
    quatTrack('mixamorigLeftForeArm', times, [
      [0, -0.25, 0.25],
      [0, -0.15, 0.1],
      [0, -0.25, 0.25],
    ]),
    quatTrack('mixamorigRightForeArm', times, [
      [0, 0.25, -0.25],
      [0, 0.15, -0.1],
      [0, 0.25, -0.25],
    ]),
    quatTrack('mixamorigLeftUpLeg', times, [
      [-0.12, 0.08, 0.1],
      [-0.02, 0.08, 0.1],
      [-0.12, 0.08, 0.1],
    ]),
    quatTrack('mixamorigRightUpLeg', times, [
      [-0.12, -0.08, -0.1],
      [-0.02, -0.08, -0.1],
      [-0.12, -0.08, -0.1],
    ]),
    quatTrack('mixamorigLeftLeg', times, [
      [0.16, 0, 0],
      [0.02, 0, 0],
      [0.16, 0, 0],
    ]),
    quatTrack('mixamorigRightLeg', times, [
      [0.16, 0, 0],
      [0.02, 0, 0],
      [0.16, 0, 0],
    ]),
  ];
  return new THREE.AnimationClip('vmw_cheer', 0.6, tracks);
}

function buildWaveClip(): THREE.AnimationClip {
  const times = [0, 0.28, 0.56];
  const tracks: THREE.KeyframeTrack[] = [
    posTrack('mixamorigHips', times, [
      [0, 102.5, 1.5],
      [0, 103.5, 1.5],
      [0, 102.5, 1.5],
    ]),
    quatTrack('mixamorigLeftArm', times, [
      [0.08, -0.2, -1.15],
      [0.08, -0.2, -1.15],
      [0.08, -0.2, -1.15],
    ]),
    quatTrack('mixamorigRightArm', times, [
      [0.1, 0.2, -0.65],
      [0.1, 0.2, -0.82],
      [0.1, 0.2, -0.65],
    ]),
    quatTrack('mixamorigRightForeArm', times, [
      [0, 0.15, -0.55],
      [0, 0.15, -0.05],
      [0, 0.15, -0.55],
    ]),
    quatTrack('mixamorigHead', times, [
      [0, 0.05, -0.06],
      [0, 0.05, 0.04],
      [0, 0.05, -0.06],
    ]),
  ];
  return new THREE.AnimationClip('vmw_wave', 0.56, tracks);
}

function buildAfkClip(): THREE.AnimationClip {
  const times = [0, 1];
  const tracks: THREE.KeyframeTrack[] = [
    posTrack('mixamorigHips', times, [
      [0, 101, 1.5],
      [0, 101, 1.5],
    ]),
    quatTrack('mixamorigSpine2', times, [
      [0.14, 0, 0],
      [0.14, 0, 0],
    ]),
    quatTrack('mixamorigHead', times, [
      [0.35, 0, 0],
      [0.35, 0, 0],
    ]),
    quatTrack('mixamorigLeftArm', times, [
      [0.1, -0.15, -1.18],
      [0.1, -0.15, -1.18],
    ]),
    quatTrack('mixamorigRightArm', times, [
      [0.1, 0.15, 1.18],
      [0.1, 0.15, 1.18],
    ]),
  ];
  return new THREE.AnimationClip('vmw_afk', 1, tracks);
}

function buildPlayClip(): THREE.AnimationClip {
  const times = [0, 0.32, 0.64];
  const tracks: THREE.KeyframeTrack[] = [
    posTrack('mixamorigHips', times, [
      [0, 102, 1.5],
      [0, 100.5, 1.5],
      [0, 102, 1.5],
    ]),
    quatTrack('mixamorigSpine2', times, [
      [0.06, -0.06, 0],
      [0.09, 0.06, 0],
      [0.06, -0.06, 0],
    ]),
    quatTrack('mixamorigLeftArm', times, [
      [0.15, -0.7, -0.95],
      [0.2, -0.82, -0.9],
      [0.15, -0.7, -0.95],
    ]),
    quatTrack('mixamorigRightArm', times, [
      [0.15, 0.7, 0.95],
      [0.2, 0.82, 0.9],
      [0.15, 0.7, 0.95],
    ]),
    quatTrack('mixamorigLeftForeArm', times, [
      [0, -0.65, 0],
      [0, -0.85, 0],
      [0, -0.65, 0],
    ]),
    quatTrack('mixamorigRightForeArm', times, [
      [0, 0.65, 0],
      [0, 0.85, 0],
      [0, 0.65, 0],
    ]),
  ];
  return new THREE.AnimationClip('vmw_play', 0.64, tracks);
}

export function mapAnimationToClipKey(anim: AvatarAnimationState): AudienceClipKey {
  switch (anim) {
    case 'WALK':
      return 'WALK';
    case 'SIT':
      return 'SIT';
    case 'CLAP':
      return 'CLAP';
    case 'CHEER':
      return 'CHEER';
    case 'WAVE':
      return 'WAVE';
    case 'DANCE':
      return 'DANCE';
    case 'DANCE_2':
      return 'DANCE_2';
    case 'DANCE_3':
      return 'DANCE_3';
    case 'DANCE_4':
      return 'DANCE_4';
    case 'DANCE_5':
      return 'DANCE_5';
    case 'AFK':
      return 'AFK';
    case 'PLAY_PIANO':
    case 'PLAY_GUITAR':
    case 'PLAY_VIOLIN':
    case 'PLAY_DRUMS':
      return 'PLAY';
    default:
      return 'IDLE';
  }
}

let cachedAssets: AudienceRigAssets | null = null;
let loadPromise: Promise<AudienceRigAssets> | null = null;

export function getCachedAudienceRigAssets(): AudienceRigAssets | null {
  return cachedAssets;
}

export function loadAudienceRigAssets(): Promise<AudienceRigAssets> {
  if (cachedAssets) return Promise.resolve(cachedAssets);
  if (loadPromise) return loadPromise;

  const gltfLoader = new GLTFLoader();
  const fbxLoader = new FBXLoader();

  loadPromise = Promise.all([
    gltfLoader.loadAsync('/models/xbot.glb'),
    fbxLoader.loadAsync('/models/samba-dancing.fbx'),
    fbxLoader.loadAsync('/models/arms-hip-hop-dance.fbx'),
    fbxLoader.loadAsync('/models/northern-soul-spin-combo.fbx'),
    fbxLoader.loadAsync('/models/samba-dancing-2.fbx'),
    fbxLoader.loadAsync('/models/ymca-dance.fbx'),
  ]).then(([gltf, fbx, fbx2, fbx3, fbx4, fbx5]) => {
    const idleClip = gltf.animations.find((a) => a.name === 'idle') ?? gltf.animations[0];
    const walkClip = gltf.animations.find((a) => a.name === 'walk') ?? idleClip;
    const extractDanceClip = (loaded: THREE.Group) =>
      loaded.animations.find((a) => a.tracks.length > 0 && a.duration > 1) ?? loaded.animations[0];
    const fbxDance = extractDanceClip(fbx);
    const fbxDance2 = extractDanceClip(fbx2);
    const fbxDance3 = extractDanceClip(fbx3);
    const fbxDance4 = extractDanceClip(fbx4);
    const fbxDance5 = extractDanceClip(fbx5);

    const assets: AudienceRigAssets = {
      templateScene: gltf.scene,
      clips: {
        IDLE: idleClip,
        WALK: walkClip,
        SIT: buildSitClip(),
        CLAP: buildClapClip(),
        CHEER: buildCheerClip(),
        WAVE: buildWaveClip(),
        DANCE: fbxDance,
        DANCE_2: fbxDance2,
        DANCE_3: fbxDance3,
        DANCE_4: fbxDance4,
        DANCE_5: fbxDance5,
        AFK: buildAfkClip(),
        PLAY: buildPlayClip(),
      },
    };
    cachedAssets = assets;
    return assets;
  });

  return loadPromise;
}

export function cloneAudienceRig(templateScene: THREE.Group, presetId: AvatarPresetId, castShadow: boolean): THREE.Group {
  const cloned = SkeletonUtils.clone(templateScene) as THREE.Group;
  dressRigAsChibi(cloned, presetId, castShadow);
  return cloned;
}

// Preload once at module startup in the browser so first auditorium entry feels instant
if (typeof window !== 'undefined') {
  void loadAudienceRigAssets().catch(() => {
    // Component handles fallback cleanly if offline/missing
  });
}
