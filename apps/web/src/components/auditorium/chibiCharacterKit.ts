import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AvatarPresetId } from '@vmw/contracts';

/**
 * Anime Chibi character kit.
 *
 * Stylized big-head chibi parts are built from merged primitive geometry (1 draw call per bone)
 * and parented onto the animated Mixamo skeleton bones. The original humanoid skin is hidden,
 * so every existing animation clip (idle / walk / sit / clap / cheer / wave / Samba dance)
 * keeps driving the chibi without any new asset.
 *
 * Units: all part coordinates are in rig meters relative to the bone (rest pose = identity rotation,
 * arms along +X / -X, legs along -Y, face toward +Z).
 */

export const CHIBI_RIG_SCALE = 0.66;
/** Extra lift while seated so the shorter chibi rests on top of the cushion. */
export const CHIBI_SIT_LIFT = 0.16;
export const CHIBI_NAMEPLATE_Y = 1.66;

type BoneKey =
  | 'Head'
  | 'Spine'
  | 'Hips'
  | 'LeftArm'
  | 'LeftForeArm'
  | 'LeftHand'
  | 'RightArm'
  | 'RightForeArm'
  | 'RightHand'
  | 'LeftUpLeg'
  | 'LeftLeg'
  | 'LeftFoot'
  | 'RightUpLeg'
  | 'RightLeg'
  | 'RightFoot';

const BONE_KEYS: BoneKey[] = [
  'Head',
  'Spine',
  'Hips',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
];

type HairStyle = 'messy' | 'buns' | 'fluffy' | 'bob';
type TopStyle = 'tee' | 'blouse' | 'hoodie' | 'sailor';
type BottomStyle = 'shorts' | 'skirt' | 'pants';

interface ChibiLook {
  skin: string;
  blush: string;
  hair: string;
  hairShade: string;
  eye: string;
  mouth: string;
  top: string;
  topAccent: string;
  bottom: string;
  sock: string;
  sockLength: number;
  shoe: string;
  sole: string;
  accent: string;
  hairStyle: HairStyle;
  topStyle: TopStyle;
  bottomStyle: BottomStyle;
}

export const CHIBI_LOOKS: Record<AvatarPresetId, ChibiLook> = {
  // Bé Gấu Nâu — reference look: messy brown hair, raglan tee, denim shorts, sneakers
  'chibi-classic': {
    skin: '#ffe2cf',
    blush: '#ffadb9',
    hair: '#9a6544',
    hairShade: '#6e4430',
    eye: '#3a2318',
    mouth: '#6b2f2f',
    top: '#fbfbf7',
    topAccent: '#355b82',
    bottom: '#4f79ad',
    sock: '#ffffff',
    sockLength: 0.08,
    shoe: '#3f3f46',
    sole: '#f4f4f5',
    accent: '#f59e0b',
    hairStyle: 'messy',
    topStyle: 'tee',
    bottomStyle: 'shorts',
  },
  // Bé Mơ Mật Ong — caramel twin buns, cream puff-sleeve blouse, honey skirt, ribbon
  'chibi-acoustic': {
    skin: '#ffe6d6',
    blush: '#ff9fb2',
    hair: '#e59a5c',
    hairShade: '#b8703c',
    eye: '#5a3418',
    mouth: '#7a3333',
    top: '#fff6e5',
    topAccent: '#f59e0b',
    bottom: '#f2b544',
    sock: '#ffffff',
    sockLength: 0.16,
    shoe: '#8b4a2b',
    sole: '#5c2f1a',
    accent: '#fb7185',
    hairStyle: 'buns',
    topStyle: 'blouse',
    bottomStyle: 'skirt',
  },
  // Bé Neon Synth — fluffy lavender hair, cyan headphones, oversized hoodie, joggers
  'chibi-synth': {
    skin: '#ffe0cc',
    blush: '#ffa8c0',
    hair: '#b8a2f7',
    hairShade: '#8a72dd',
    eye: '#2b2a6b',
    mouth: '#5a2a3a',
    top: '#6d5bd0',
    topAccent: '#f5f3ff',
    bottom: '#2a2a35',
    sock: '#38bdf8',
    sockLength: 0.05,
    shoe: '#f8fafc',
    sole: '#38bdf8',
    accent: '#38bdf8',
    hairStyle: 'fluffy',
    topStyle: 'hoodie',
    bottomStyle: 'pants',
  },
  // Bé Dâu Tây — dark bob with red beret, sailor top + bow, navy pleated skirt, knee socks
  'chibi-strings': {
    skin: '#ffe4d4',
    blush: '#ff9aaa',
    hair: '#3d2b33',
    hairShade: '#241820',
    eye: '#7a1f2b',
    mouth: '#7a2a33',
    top: '#fdfdfd',
    topAccent: '#2c3d6e',
    bottom: '#2c3d6e',
    sock: '#fdfdfd',
    sockLength: 0.32,
    shoe: '#1f1f24',
    sole: '#1f1f24',
    accent: '#e2425c',
    hairStyle: 'bob',
    topStyle: 'sailor',
    bottomStyle: 'skirt',
  },
};

type Vec3 = [number, number, number];

class PartBuilder {
  private parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: string, pos: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0], scl: Vec3 = [1, 1, 1]) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
      new THREE.Vector3(...scl)
    );
    const g = geo;
    g.applyMatrix4(m);
    const c = new THREE.Color(color);
    const count = g.attributes.position.count;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(g);
  }

  build(): THREE.BufferGeometry | null {
    if (this.parts.length === 0) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (!merged) return null;
    merged.computeBoundingSphere();
    return merged;
  }
}

const sphere = (seg = 18) => new THREE.SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.75)));
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 5, 12);
const cyl = (rt: number, rb: number, h: number, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);

// ---------- Head ----------
const HC = 0.17; // head center above head bone
const RX = 0.36;
const RY = 0.32;
const RZ = 0.33;

function facePoint(x: number, y: number, lift = 0): Vec3 {
  const k = 1 - (x / RX) ** 2 - (y / RY) ** 2;
  return [x, HC + y, Math.sqrt(Math.max(0, k)) * RZ + lift];
}

function buildHead(look: ChibiLook): THREE.BufferGeometry | null {
  const b = new PartBuilder();

  // Soft mochi head + neck
  b.add(sphere(30), look.skin, [0, HC, 0], [0, 0, 0], [RX, RY, RZ]);
  b.add(cyl(0.06, 0.065, 0.12, 10), look.skin, [0, -0.06, 0]);
  // Ears
  for (const d of [-1, 1]) {
    b.add(sphere(10), look.skin, [d * (RX - 0.015), HC - 0.035, -0.01], [0, 0, 0], [0.035, 0.06, 0.05]);
  }

  // Big sparkly anime eyes
  for (const d of [-1, 1]) {
    const ex = d * 0.125;
    b.add(sphere(16), look.eye, facePoint(ex, -0.035, -0.014), [0, d * 0.32, 0], [0.054, 0.072, 0.03]);
    b.add(sphere(10), '#ffffff', facePoint(ex + 0.02, -0.005, 0.01), [0, 0, 0], [0.019, 0.022, 0.01]);
    b.add(sphere(8), '#ffffff', facePoint(ex - 0.018, -0.062, 0.008), [0, 0, 0], [0.009, 0.009, 0.006]);
    // Eyebrows
    b.add(capsule(0.008, 0.045), look.hairShade, facePoint(ex, 0.06, -0.003), [0, d * 0.3, Math.PI / 2 + d * 0.12]);
    // Blush with tiny hatch
    b.add(sphere(12), look.blush, facePoint(d * 0.215, -0.115, -0.006), [0, d * 0.6, 0], [0.058, 0.03, 0.014]);
  }

  // Cat "ω" mouth
  for (const d of [-1, 1]) {
    b.add(
      new THREE.TorusGeometry(0.018, 0.005, 5, 10, Math.PI),
      look.mouth,
      facePoint(d * 0.018, -0.118, -0.002),
      [0, 0, Math.PI]
    );
  }

  addHair(b, look);
  addHeadAccessory(b, look);
  return b.build();
}

function addHair(b: PartBuilder, look: ChibiLook) {
  const hs = [RX * 1.075, RY * 1.11, RZ * 1.09] as Vec3;

  // Crown cap (open face) + back shell
  b.add(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), look.hair, [0, HC + 0.01, 0], [0, 0, 0], hs);
  const backEnd = look.hairStyle === 'bob' ? 0.6 : 0.5;
  b.add(
    new THREE.SphereGeometry(1, 28, 14, Math.PI, Math.PI, Math.PI * 0.28, Math.PI * backEnd),
    look.hair,
    [0, HC + 0.005, -0.005],
    [0, 0, 0],
    hs
  );

  // Bangs (fanned soft locks across forehead)
  const bangXs =
    look.hairStyle === 'buns' || look.hairStyle === 'bob'
      ? [-0.2, -0.1, 0, 0.1, 0.2]
      : [-0.23, -0.12, -0.02, 0.09, 0.2];
  bangXs.forEach((x, i) => {
    const tipY = look.hairStyle === 'bob' ? 0.075 : 0.095;
    const p = facePoint(x, tipY + 0.06, 0.012);
    const size: Vec3 =
      look.hairStyle === 'fluffy' ? [0.095, 0.11, 0.055] : look.hairStyle === 'messy' ? [0.085, 0.115, 0.05] : [0.078, 0.1, 0.045];
    const swing = look.hairStyle === 'messy' ? (i % 2 === 0 ? 0.22 : -0.12) : 0;
    b.add(sphere(12), i % 2 === 0 ? look.hair : look.hairShade, p, [-0.35, x * 0.9, -x * 1.1 + swing], size);
  });

  // Side locks framing the cheeks
  const lockLen = look.hairStyle === 'bob' ? 0.22 : look.hairStyle === 'buns' ? 0.16 : 0.13;
  for (const d of [-1, 1]) {
    b.add(sphere(12), look.hair, [d * (RX * 0.98), HC - 0.05 - lockLen * 0.35, 0.09], [0.15, 0, d * 0.12], [0.06, lockLen, 0.06]);
  }

  if (look.hairStyle === 'messy') {
    // Ahoge cowlick + spiky tufts like the reference
    b.add(new THREE.TorusGeometry(0.06, 0.013, 6, 14, Math.PI * 1.25), look.hair, [0.02, HC + RY * 1.11 + 0.035, 0.02], [0, Math.PI / 2, 0.3]);
    b.add(sphere(12), look.hairShade, [-0.24, HC + 0.2, -0.1], [0.3, 0, 0.7], [0.08, 0.12, 0.09]);
    b.add(sphere(12), look.hair, [0.25, HC + 0.18, -0.12], [0.3, 0, -0.75], [0.08, 0.12, 0.09]);
    b.add(sphere(12), look.hair, [0, HC + 0.12, -0.3], [-0.6, 0, 0], [0.12, 0.09, 0.08]);
  } else if (look.hairStyle === 'buns') {
    for (const d of [-1, 1]) {
      b.add(sphere(16), look.hair, [d * 0.24, HC + 0.27, -0.05], [0, 0, 0], [0.11, 0.105, 0.11]);
      b.add(new THREE.TorusGeometry(0.075, 0.018, 6, 14), look.accent, [d * 0.2, HC + 0.22, -0.04], [0.3, 0, d * 0.75]);
      // little tail under each bun
      b.add(sphere(12), look.hairShade, [d * 0.3, HC + 0.12, -0.08], [0, 0, d * 0.4], [0.05, 0.1, 0.05]);
    }
  } else if (look.hairStyle === 'fluffy') {
    const puffs: Vec3[] = [
      [-0.2, HC + 0.24, 0.02],
      [0.2, HC + 0.24, 0.02],
      [0, HC + 0.3, -0.06],
      [-0.28, HC + 0.08, -0.12],
      [0.28, HC + 0.08, -0.12],
      [0, HC + 0.1, -0.31],
    ];
    puffs.forEach((p, i) => b.add(sphere(12), i % 2 ? look.hairShade : look.hair, p, [0, 0, 0], [0.1, 0.09, 0.1]));
  } else if (look.hairStyle === 'bob') {
    // Rounded bob tips curling under the jaw line at the back
    b.add(sphere(16), look.hair, [0, HC - 0.17, -0.12], [0, 0, 0], [0.32, 0.09, 0.2]);
  }
}

function addHeadAccessory(b: PartBuilder, look: ChibiLook) {
  if (look.hairStyle === 'fluffy') {
    // Cyan studio headphones
    b.add(new THREE.TorusGeometry(RX * 1.14, 0.022, 8, 28, Math.PI), '#e5e7eb', [0, HC + 0.02, -0.02]);
    for (const d of [-1, 1]) {
      b.add(cyl(0.09, 0.09, 0.07, 18), look.accent, [d * (RX * 1.12), HC + 0.0, -0.02], [0, 0, Math.PI / 2]);
      b.add(cyl(0.06, 0.06, 0.08, 14), '#1f2937', [d * (RX * 1.16), HC + 0.0, -0.02], [0, 0, Math.PI / 2]);
    }
  } else if (look.hairStyle === 'bob') {
    // Strawberry-red beret
    b.add(sphere(20), look.accent, [0.06, HC + 0.33, -0.02], [0, 0, -0.28], [0.31, 0.085, 0.29]);
    b.add(cyl(0.012, 0.018, 0.05, 8), look.accent, [0.1, HC + 0.42, -0.02], [0, 0, -0.28]);
  } else if (look.hairStyle === 'messy') {
    // Small music-note hair pin
    b.add(sphere(10), look.accent, [-0.28, HC + 0.2, 0.17], [0, 0, 0], [0.028, 0.022, 0.02]);
    b.add(cyl(0.006, 0.006, 0.07, 6), look.accent, [-0.26, HC + 0.24, 0.17], [0, 0, 0]);
  }
}

// ---------- Torso (Spine bone, rest world y ~1.14) ----------
function buildTorso(look: ChibiLook): THREE.BufferGeometry | null {
  const b = new PartBuilder();
  const topR = look.topStyle === 'hoodie' ? 0.175 : 0.16;
  b.add(capsule(topR, 0.24), look.top, [0, 0.11, 0], [0, 0, 0], [1, 1, 0.86]);

  if (look.topStyle === 'tee') {
    b.add(new THREE.TorusGeometry(0.075, 0.018, 6, 18), look.topAccent, [0, 0.355, 0.01], [Math.PI / 2, 0, 0]);
    // tiny star badge
    b.add(sphere(8), look.accent, [0.07, 0.24, 0.13], [0, 0, 0], [0.025, 0.025, 0.012]);
  } else if (look.topStyle === 'blouse') {
    b.add(new THREE.TorusGeometry(0.08, 0.02, 6, 18), '#ffffff', [0, 0.35, 0.01], [Math.PI / 2, 0, 0]);
    addBow(b, look.accent, [0, 0.31, 0.12], 1);
    // honey suspenders
    for (const d of [-1, 1]) {
      b.add(cyl(0.014, 0.014, 0.3, 6), look.bottom, [d * 0.08, 0.12, 0.125], [0.2, 0, 0]);
    }
  } else if (look.topStyle === 'hoodie') {
    b.add(new THREE.TorusGeometry(0.115, 0.05, 8, 18), look.top, [0, 0.36, -0.035], [Math.PI / 2 - 0.25, 0, 0]);
    for (const d of [-1, 1]) {
      b.add(cyl(0.008, 0.008, 0.12, 6), look.topAccent, [d * 0.04, 0.27, 0.15], [0.15, 0, 0]);
      b.add(sphere(6), look.accent, [d * 0.04, 0.2, 0.155], [0, 0, 0], [0.013, 0.013, 0.013]);
    }
    // kangaroo pocket
    b.add(new THREE.BoxGeometry(0.2, 0.08, 0.03), '#5b4bc0', [0, 0.0, 0.14]);
  } else if (look.topStyle === 'sailor') {
    // Navy sailor collar flap + red bow
    b.add(new THREE.BoxGeometry(0.3, 0.16, 0.04), look.topAccent, [0, 0.31, -0.13], [0.25, 0, 0]);
    b.add(new THREE.TorusGeometry(0.095, 0.025, 6, 18), look.topAccent, [0, 0.35, 0.0], [Math.PI / 2, 0, 0]);
    addBow(b, look.accent, [0, 0.29, 0.13], 1.15);
    b.add(cyl(0.162, 0.162, 0.025, 18), look.topAccent, [0, -0.06, 0], [0, 0, 0], [1, 1, 0.86]);
  }
  return b.build();
}

function addBow(b: PartBuilder, color: string, at: Vec3, s: number) {
  b.add(sphere(10), color, [at[0] - 0.035 * s, at[1], at[2]], [0, 0, 0.4], [0.035 * s, 0.024 * s, 0.018 * s]);
  b.add(sphere(10), color, [at[0] + 0.035 * s, at[1], at[2]], [0, 0, -0.4], [0.035 * s, 0.024 * s, 0.018 * s]);
  b.add(sphere(8), color, [at[0], at[1], at[2] + 0.006], [0, 0, 0], [0.016 * s, 0.016 * s, 0.016 * s]);
}

// ---------- Hips (Hips bone, rest world y ~1.04) ----------
function buildHips(look: ChibiLook): THREE.BufferGeometry | null {
  const b = new PartBuilder();
  if (look.bottomStyle === 'skirt') {
    const isPleated = look.topStyle === 'sailor';
    b.add(cyl(0.165, 0.29, 0.26, isPleated ? 12 : 22), look.bottom, [0, -0.08, 0], [0, 0, 0], [1, 1, 0.9]);
    b.add(cyl(0.168, 0.168, 0.03, 18), isPleated ? look.bottom : look.topAccent, [0, 0.04, 0], [0, 0, 0], [1, 1, 0.9]);
  } else {
    b.add(cyl(0.17, 0.18, 0.2, 18), look.bottom, [0, -0.02, 0], [0, 0, 0], [1, 1, 0.88]);
    b.add(cyl(0.172, 0.172, 0.03, 18), look.bottomStyle === 'pants' ? look.accent : '#3a5d8a', [0, 0.07, 0], [0, 0, 0], [1, 1, 0.88]);
  }
  return b.build();
}

// ---------- Arms ----------
function buildUpperArm(look: ChibiLook, d: number): THREE.BufferGeometry | null {
  const b = new PartBuilder();
  const along: Vec3 = [0, 0, Math.PI / 2];
  if (look.topStyle === 'hoodie') {
    b.add(capsule(0.066, 0.2), look.top, [d * 0.13, 0, 0], along);
  } else {
    b.add(capsule(0.05, 0.2), look.skin, [d * 0.14, 0, 0], along);
    if (look.topStyle === 'tee') {
      b.add(sphere(14), look.topAccent, [d * 0.02, 0, 0], [0, 0, 0], [0.078, 0.078, 0.078]);
      b.add(capsule(0.068, 0.07), look.topAccent, [d * 0.07, 0, 0], along);
    } else {
      // Puff sleeves
      b.add(sphere(14), look.top, [d * 0.05, 0, 0], [0, 0, 0], [0.095, 0.085, 0.085]);
      if (look.topStyle === 'sailor') {
        b.add(cyl(0.07, 0.07, 0.02, 12), look.topAccent, [d * 0.12, 0, 0], along);
      }
    }
  }
  return b.build();
}

function buildForeArm(look: ChibiLook, d: number): THREE.BufferGeometry | null {
  const b = new PartBuilder();
  const along: Vec3 = [0, 0, Math.PI / 2];
  if (look.topStyle === 'hoodie') {
    b.add(capsule(0.062, 0.2), look.top, [d * 0.13, 0, 0], along);
    b.add(cyl(0.058, 0.058, 0.04, 12), look.topAccent, [d * 0.25, 0, 0], along);
  } else {
    b.add(capsule(0.047, 0.21), look.skin, [d * 0.14, 0, 0], along);
  }
  return b.build();
}

function buildHand(look: ChibiLook, d: number): THREE.BufferGeometry | null {
  const b = new PartBuilder();
  b.add(sphere(12), look.skin, [d * 0.05, -0.005, 0], [0, 0, 0], [0.062, 0.056, 0.05]);
  b.add(sphere(8), look.skin, [d * 0.03, 0.01, 0.045], [0, 0, 0], [0.024, 0.02, 0.024]);
  return b.build();
}

// ---------- Legs ----------
function buildThigh(look: ChibiLook): THREE.BufferGeometry | null {
  const b = new PartBuilder();
  if (look.bottomStyle === 'pants') {
    b.add(capsule(0.085, 0.34), look.bottom, [0, -0.22, 0]);
  } else {
    b.add(capsule(0.068, 0.36), look.skin, [0, -0.22, 0]);
    if (look.bottomStyle === 'shorts') {
      b.add(cyl(0.096, 0.09, 0.2, 14), look.bottom, [0, -0.08, 0]);
      b.add(cyl(0.093, 0.093, 0.025, 14), '#3a5d8a', [0, -0.18, 0]);
    }
  }
  return b.build();
}

function buildShin(look: ChibiLook): THREE.BufferGeometry | null {
  const b = new PartBuilder();
  if (look.bottomStyle === 'pants') {
    b.add(capsule(0.078, 0.33), look.bottom, [0, -0.2, 0]);
    b.add(cyl(0.072, 0.072, 0.05, 12), look.accent, [0, -0.39, 0]);
  } else {
    b.add(capsule(0.064, 0.34), look.skin, [0, -0.21, 0]);
    const h = look.sockLength;
    b.add(cyl(0.069, 0.069, h, 12), look.sock, [0, -0.425 + h / 2, 0]);
    if (h > 0.2) {
      b.add(new THREE.TorusGeometry(0.068, 0.012, 6, 14), look.topAccent, [0, -0.425 + h, 0], [Math.PI / 2, 0, 0]);
    }
  }
  return b.build();
}

function buildFoot(look: ChibiLook): THREE.BufferGeometry | null {
  const b = new PartBuilder();
  b.add(sphere(14), look.shoe, [0, -0.02, 0.05], [0, 0, 0], [0.088, 0.07, 0.15]);
  b.add(sphere(12), look.sole, [0, -0.065, 0.05], [0, 0, 0], [0.094, 0.03, 0.158]);
  if (look.bottomStyle === 'skirt') {
    // Mary-jane strap
    b.add(new THREE.TorusGeometry(0.07, 0.01, 5, 12, Math.PI), look.shoe === '#1f1f24' ? '#e2425c' : '#5c2f1a', [0, 0.02, 0.06], [0, 0, 0]);
  } else {
    // Sneaker toe cap
    b.add(sphere(10), look.sole, [0, -0.03, 0.15], [0, 0, 0], [0.07, 0.045, 0.05]);
  }
  return b.build();
}

function buildPart(look: ChibiLook, key: BoneKey): THREE.BufferGeometry | null {
  switch (key) {
    case 'Head':
      return buildHead(look);
    case 'Spine':
      return buildTorso(look);
    case 'Hips':
      return buildHips(look);
    case 'LeftArm':
      return buildUpperArm(look, 1);
    case 'RightArm':
      return buildUpperArm(look, -1);
    case 'LeftForeArm':
      return buildForeArm(look, 1);
    case 'RightForeArm':
      return buildForeArm(look, -1);
    case 'LeftHand':
      return buildHand(look, 1);
    case 'RightHand':
      return buildHand(look, -1);
    case 'LeftUpLeg':
    case 'RightUpLeg':
      return buildThigh(look);
    case 'LeftLeg':
    case 'RightLeg':
      return buildShin(look);
    case 'LeftFoot':
    case 'RightFoot':
      return buildFoot(look);
  }
}

// ---------- Shared caches (geometry & material built once, shared by every avatar) ----------
const geometryCache = new Map<AvatarPresetId, Partial<Record<BoneKey, THREE.BufferGeometry | null>>>();

function getPresetGeometry(presetId: AvatarPresetId, key: BoneKey): THREE.BufferGeometry | null {
  let entry = geometryCache.get(presetId);
  if (!entry) {
    entry = {};
    geometryCache.set(presetId, entry);
  }
  if (!(key in entry)) {
    const look = CHIBI_LOOKS[presetId] ?? CHIBI_LOOKS['chibi-classic'];
    entry[key] = buildPart(look, key);
  }
  return entry[key] ?? null;
}

let figureMaterial: THREE.MeshPhysicalMaterial | null = null;
let glossyShoeMaterial: THREE.MeshPhysicalMaterial | null = null;
let outlineMaterial: THREE.MeshBasicMaterial | null = null;

function getFigureMaterial(): THREE.MeshPhysicalMaterial {
  if (figureMaterial) return figureMaterial;
  figureMaterial = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.34,
    metalness: 0.05,
    clearcoat: 0.48,
    clearcoatRoughness: 0.14,
    sheen: 0.4,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color('#fff7ed'),
    envMapIntensity: 1.1,
  });
  return figureMaterial;
}

function getGlossyShoeMaterial(): THREE.MeshPhysicalMaterial {
  if (glossyShoeMaterial) return glossyShoeMaterial;
  glossyShoeMaterial = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.18,
    metalness: 0.12,
    clearcoat: 0.92,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.45,
  });
  return glossyShoeMaterial;
}

function getOutlineMaterial(): THREE.MeshBasicMaterial {
  if (outlineMaterial) return outlineMaterial;
  const mat = new THREE.MeshBasicMaterial({ color: '#2b1d22', side: THREE.BackSide });
  // Inverted-hull outline: push vertices outward along their normals (sticker-style anime line art)
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  transformed += normalize(normal) * 0.011;'
    );
  };
  mat.customProgramCacheKey = () => 'vmw-chibi-outline';
  outlineMaterial = mat;
  return mat;
}

/**
 * Hides the humanoid skin of a cloned Mixamo rig and dresses its bones with the chibi preset.
 */
export function dressRigAsChibi(rig: THREE.Object3D, presetId: AvatarPresetId, castShadow: boolean) {
  rig.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) obj.visible = false;
  });

  const figureMat = getFigureMaterial();
  const shoeMat = getGlossyShoeMaterial();
  const outline = getOutlineMaterial();

  for (const key of BONE_KEYS) {
    const bone = rig.getObjectByName(`mixamorig${key}`);
    const geo = getPresetGeometry(presetId, key);
    if (!bone || !geo) continue;

    // Bones live under an Armature scaled 0.01 (centimeters); scale wrapper back to rig meters
    const wrapper = new THREE.Group();
    wrapper.name = `chibi-${key}`;
    wrapper.scale.setScalar(100);

    const isShoe = key === 'LeftFoot' || key === 'RightFoot';
    const mesh = new THREE.Mesh(geo, isShoe ? shoeMat : figureMat);
    mesh.castShadow = castShadow;
    mesh.userData.chibiPart = true;
    wrapper.add(mesh);

    const line = new THREE.Mesh(geo, outline);
    line.userData.chibiOutline = true;
    line.castShadow = false;
    line.visible = castShadow;
    wrapper.add(line);

    bone.add(wrapper);
  }
}
