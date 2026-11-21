import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { QualityPreset } from '@vmw/contracts';
import type { AvatarRuntimeEntry } from '../../realtime/realtimeStore';
import { AvatarOverlay, lerpAngleY, syncReactionExpiry } from './AvatarOverlay';
import { ChibiAvatar } from './ChibiAvatar';
import { CHIBI_NAMEPLATE_Y, CHIBI_RIG_SCALE, CHIBI_SIT_LIFT } from './chibiCharacterKit';
import {
  cloneAudienceRig,
  ensureDanceClipLoaded,
  getCachedAudienceRigAssets,
  isDanceClipKey,
  loadAudienceRigAssets,
  mapAnimationToClipKey,
  subscribeDanceClipLoaded,
  type AudienceClipKey,
  type AudienceRigAssets,
} from './audienceRigAssets';

export function RiggedAudienceAvatar({
  entry,
  isLocal,
  qualityPreset,
}: {
  entry: AvatarRuntimeEntry;
  isLocal: boolean;
  qualityPreset: QualityPreset;
}) {
  const [assets, setAssets] = useState<AudienceRigAssets | null>(() => getCachedAudienceRigAssets());
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (assets || loadFailed) return;
    let active = true;
    loadAudienceRigAssets()
      .then((loaded) => {
        if (active) setAssets(loaded);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [assets, loadFailed]);

  if (!assets || loadFailed) {
    return <ChibiAvatar entry={entry} isLocal={isLocal} />;
  }

  return (
    <LoadedRiggedAudienceAvatar
      assets={assets}
      entry={entry}
      isLocal={isLocal}
      qualityPreset={qualityPreset}
    />
  );
}

function LoadedRiggedAudienceAvatar({
  assets,
  entry,
  isLocal,
  qualityPreset,
}: {
  assets: AudienceRigAssets;
  entry: AvatarRuntimeEntry;
  isLocal: boolean;
  qualityPreset: QualityPreset;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const activeKeyRef = useRef<AudienceClipKey>('IDLE');
  const accumDeltaRef = useRef(0);

  const { rig, mixer, actions } = useMemo(() => {
    const clonedRig = cloneAudienceRig(assets.templateScene, entry.avatarPresetId, qualityPreset !== 'LOW');
    const animMixer = new THREE.AnimationMixer(clonedRig);
    const clipActions = {} as Record<AudienceClipKey, THREE.AnimationAction>;

    (Object.keys(assets.clips) as AudienceClipKey[]).forEach((key) => {
      const action = animMixer.clipAction(assets.clips[key]);
      action.setLoop(THREE.LoopRepeat, Infinity);
      clipActions[key] = action;
    });

    const initialKey = mapAnimationToClipKey(entry.animation);
    activeKeyRef.current = initialKey;
    clipActions[initialKey].play();

    return { rig: clonedRig, mixer: animMixer, actions: clipActions };
    // Intentionally omit qualityPreset & entry.animation so FPS downgrade never re-clones Skeleton
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, entry.avatarPresetId]);

  useEffect(() => {
    const highQuality = qualityPreset !== 'LOW';
    rig.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.userData.chibiOutline) {
        mesh.visible = highQuality;
      } else if (mesh.userData.chibiPart) {
        mesh.castShadow = highQuality;
      }
    });
  }, [rig, qualityPreset]);

  useEffect(() => {
    return subscribeDanceClipLoaded((key, clip) => {
      const oldAction = actions[key];
      const wasActive = activeKeyRef.current === key;
      const newAction = mixer.clipAction(clip);
      newAction.setLoop(THREE.LoopRepeat, Infinity);
      actions[key] = newAction;
      if (wasActive) {
        newAction.reset();
        newAction.enabled = true;
        newAction.setEffectiveTimeScale(1);
        newAction.setEffectiveWeight(1);
        newAction.play();
        if (oldAction && oldAction !== newAction) {
          oldAction.crossFadeTo(newAction, 0.25, true);
        }
      }
    });
  }, [mixer, actions]);

  useEffect(() => {
    const activeAction = actions[activeKeyRef.current];
    if (activeAction) {
      activeAction.reset();
      activeAction.enabled = true;
      activeAction.setEffectiveTimeScale(1);
      activeAction.setEffectiveWeight(1);
      activeAction.play();
    }
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(rig);
    };
  }, [mixer, rig, actions]);

  useFrame((_state, delta) => {
    const g = groupRef.current;
    if (!g) return;

    const nowMs = performance.now();
    syncReactionExpiry(entry, nowMs);

    const lerpAlpha = isLocal ? 0.5 : Math.min(1, delta * 12);
    g.position.x = THREE.MathUtils.lerp(g.position.x, entry.targetPosition[0], lerpAlpha);
    g.position.y = THREE.MathUtils.lerp(g.position.y, entry.targetPosition[1], lerpAlpha);
    g.position.z = THREE.MathUtils.lerp(g.position.z, entry.targetPosition[2], lerpAlpha);
    g.rotation.y = lerpAngleY(g.rotation.y, entry.targetRotationY, lerpAlpha);

    const nextKey = mapAnimationToClipKey(entry.animation);
    if (nextKey !== activeKeyRef.current) {
      if (isDanceClipKey(nextKey)) {
        void ensureDanceClipLoaded(nextKey);
      }
      const prevAction = actions[activeKeyRef.current];
      const nextAction = actions[nextKey];
      if (nextAction) {
        nextAction.reset();
        nextAction.enabled = true;
        nextAction.setEffectiveTimeScale(1);
        nextAction.setEffectiveWeight(1);
        nextAction.play();
        if (prevAction && prevAction !== nextAction) {
          const isDance =
            nextKey === 'DANCE' ||
            nextKey === 'DANCE_2' ||
            nextKey === 'DANCE_3' ||
            nextKey === 'DANCE_4' ||
            nextKey === 'DANCE_5';
          prevAction.crossFadeTo(nextAction, isDance ? 0.25 : 0.2, true);
        }
        activeKeyRef.current = nextKey;
      }
    }

    const clampedDelta = Math.min(delta, 0.05);

    // Lift the shorter chibi onto the seat cushion while sitting
    const inner = innerRef.current;
    if (inner) {
      const liftTarget = activeKeyRef.current === 'SIT' ? CHIBI_SIT_LIFT : 0;
      inner.position.y = THREE.MathUtils.lerp(inner.position.y, liftTarget, Math.min(1, delta * 10));
    }
    if (!isLocal && qualityPreset === 'LOW') {
      accumDeltaRef.current += clampedDelta;
      if (accumDeltaRef.current >= 0.033) {
        mixer.update(accumDeltaRef.current);
        accumDeltaRef.current = 0;
      }
    } else {
      mixer.update(clampedDelta);
    }
  });

  return (
    <group ref={groupRef} position={entry.position} rotation={[0, entry.rotationY, 0]}>
      <group ref={innerRef}>
        <primitive object={rig} scale={[CHIBI_RIG_SCALE, CHIBI_RIG_SCALE, CHIBI_RIG_SCALE]} />
      </group>
      <AvatarOverlay entry={entry} isLocal={isLocal} nameplateY={CHIBI_NAMEPLATE_Y} />
    </group>
  );
}
