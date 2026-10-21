import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { SOLDIER_URL } from './skins.js';

const WALK_SPEED = 2.0;
const RUN_SPEED = 5.0;
const RADIUS = 0.35;    // 충돌용 반지름
const TURN_SPEED = 12;  // 회전 보간 속도
const GRAVITY = 20;
const JUMP_SPEED = 7;   // 약 1.2m 점프

const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const modelCache = new Map(); // url -> Promise<{ scene, animations }>

function loadModel(url, format = 'glb') {
  if (!modelCache.has(url)) {
    const p = format === 'fbx'
      ? fbxLoader.loadAsync(url).then((obj) => ({ scene: obj, animations: obj.animations || [] }))
      : gltfLoader.loadAsync(url).then((g) => ({ scene: g.scene, animations: g.animations || [] }));
    p.catch(() => modelCache.delete(url)); // 실패한 로드는 다시 시도할 수 있게
    modelCache.set(url, p);
  }
  return modelCache.get(url);
}

function findSkinnedMesh(root) {
  let found = null;
  root.traverse((o) => { if (!found && o.isSkinnedMesh) found = o; });
  return found;
}
function findBone(root, suffix) {
  let found = null;
  root.traverse((o) => { if (!found && o.isBone && o.name.endsWith(suffix)) found = o; });
  return found;
}
// 이름이 정확히 같거나(대소문자 무시) 포함하는 클립
function pickClip(clips, key) {
  const k = key.toLowerCase();
  return clips.find((c) => c.name.toLowerCase() === k) || clips.find((c) => c.name.toLowerCase().includes(k));
}
function prepareModel(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.isSkinnedMesh) o.frustumCulled = false; // 애니메이션 중 사라짐 방지
    }
  });
}
// cm 단위 모델(Mixamo FBX 등)은 m 단위로 맞춘다
function normalizeScale(model) {
  model.updateMatrixWorld(true);
  const h = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y;
  if (h > 20) model.scale.multiplyScalar(0.01);
  model.updateMatrixWorld(true);
}
// 쉬는 자세에서 왼팔 뼈가 +x 쪽이면 +Z 를 보는 모델, -x 쪽이면 -Z 를 보는 모델
function facingRotation(model) {
  const arm = findBone(model, 'LeftArm') || findBone(model, 'LeftShoulder');
  if (!arm) return Math.PI;
  const p = new THREE.Vector3();
  arm.getWorldPosition(p);
  return p.x >= 0 ? 0 : Math.PI;
}

export class Player {
  constructor() {
    this.group = new THREE.Group(); // +Z 가 정면
    this.model = null;
    this.mixer = null;
    this.current = null;
    this.skin = null;
    this.heading = 0;   // 바라보는 방향 (rad)
    this.eyeHeight = 1.6;
    this.vy = 0;
    this.grounded = true;
    this.visible = true;
    this.source = null; // 리타게팅용 Soldier 원본
    this.retargetCache = new Map();
  }

  // Soldier 를 애니메이션 원본으로 준비한다 (한 번만)
  async loadSource() {
    if (this.source) return this.source;
    const { scene: original, animations } = await loadModel(SOLDIER_URL, 'glb');
    const scene = SkeletonUtils.clone(original);
    scene.updateMatrixWorld(true); // Character 노드의 회전/스케일을 뼈 월드행렬에 반영
    // 스킨 메시의 joint 목록에는 손가락 끝 뼈가 빠져 있어 경고가 나므로, 모델의 모든 뼈로 스켈레톤을 만든다
    const skeleton = new THREE.Skeleton(new THREE.SkeletonHelper(scene).bones);
    this.source = { scene, skeleton, clips: animations };
    return this.source;
  }

  async setSkin(skin) {
    await this.loadSource();
    const { scene, animations } = await loadModel(skin.url, skin.format);
    const model = SkeletonUtils.clone(scene);
    normalizeScale(model);

    // 모델에 걷기 애니메이션이 있으면 그대로, 없으면 Soldier 것을 옮겨 쓴다
    let idle = pickClip(animations, 'idle');
    let walk = pickClip(animations, 'walk');
    let run = pickClip(animations, 'run');
    let facing;
    if (idle && walk) {
      run = run || walk;
      facing = facingRotation(model);
    } else {
      [idle, walk, run] = this.retargetClips(skin.url, model);
      facing = Math.PI; // 리타게팅하면 Soldier 와 같은 방향(-Z)을 본다
    }
    model.rotation.y = facing;
    prepareModel(model);
    model.visible = this.visible;

    // 이전 모델 교체
    if (this.model) {
      this.group.remove(this.model);
      this.mixer?.stopAllAction();
    }
    this.model = model;
    this.skin = skin;
    this.group.add(model);

    this.mixer = new THREE.AnimationMixer(model);
    this.idle = this.mixer.clipAction(idle);
    this.walk = this.mixer.clipAction(walk);
    this.run = this.mixer.clipAction(run);
    this.current = null;
    this.play(this.idle, 0);
    this.onModelChanged?.(this); // 무기 등 모델에 붙는 것들을 다시 붙일 기회
    return this;
  }

  // 이름이 suffix 로 끝나는 뼈 (예: 'RightHand' → mixamorigRightHand)
  getBone(suffix) {
    return this.model ? findBone(this.model, suffix) : null;
  }

  // Soldier 의 Idle/Walk/Run 을 다른 Mixamo 리그(Ready Player Me, Mixamo FBX 등)로 옮긴다
  retargetClips(key, model) {
    if (this.retargetCache.has(key)) return this.retargetCache.get(key);
    const targetSkin = findSkinnedMesh(model);
    if (!targetSkin) throw new Error('스킨 메시가 없는 모델이에요 (사람형 리그 모델이 필요해요)');
    const src = this.source;
    const srcBones = src.skeleton.bones;
    const boneNames = new Set(srcBones.map((b) => b.name));
    const options = {
      hip: 'mixamorigHips',
      scale: 1, // 원본 뼈 월드행렬에 이미 0.01 스케일이 반영되어 있음
      getBoneName: (bone) => {
        // 대상 뼈 이름이 'Hips' 든 'mixamorigHips' 든 원본 이름('mixamorigHips')으로 맞춘다
        const base = bone.name.replace(/^mixamorig:?/, '');
        return ['mixamorig' + base, 'mixamorig:' + base].find((n) => boneNames.has(n)) || 'mixamorig' + base;
      },
    };
    if (!findBone(model, 'Hips')) throw new Error('Mixamo 뼈 이름(Hips 등)을 쓰는 모델이 아니에요');
    // retargetClip 은 대상 뼈를 직접 움직이며 샘플링하고 스케일을 되돌리지 않으므로, 뼈 상태를 저장해 뒀다 복원한다
    const snapshot = [];
    model.traverse((o) => {
      if (o.isBone) snapshot.push({ bone: o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
    });
    const clips = ['Idle', 'Walk', 'Run'].map((name) => {
      const clip = pickClip(src.clips, name);
      // 스켈레톤에 없는 노드(손가락 끝 등)의 트랙은 미리 걸러 경고를 막는다
      const tracks = clip.tracks.filter((t) => boneNames.has(t.name.split('.')[0]));
      const cleaned = new THREE.AnimationClip(clip.name, clip.duration, tracks);
      const rc = SkeletonUtils.retargetClip(targetSkin, src.skeleton, cleaned, options);
      // '.bones[Hips].quaternion' → 'Hips.quaternion' : 모델 루트에 걸린 믹서가 찾을 수 있게
      for (const t of rc.tracks) t.name = t.name.replace(/^\.bones\[(.+?)\]/, '$1');
      return rc;
    });
    for (const { bone, p, q, s } of snapshot) {
      bone.position.copy(p);
      bone.quaternion.copy(q);
      bone.scale.copy(s);
    }
    model.updateMatrixWorld(true);
    this.retargetCache.set(key, clips);
    return clips;
  }

  play(action, fade = 0.25) {
    if (!action || action === this.current) return;
    action.reset().setEffectiveWeight(1).play();
    if (this.current) this.current.crossFadeTo(action, fade, false);
    this.current = action;
  }

  get position() {
    return this.group.position;
  }

  setVisible(v) {
    this.visible = v;
    if (this.model) this.model.visible = v;
  }

  /**
   * @param {number} dt
   * @param {import('./input.js').Input} input
   * @param {number} camYaw 카메라 Y 회전 (이동 기준)
   * @param {object} world createWorld() 결과
   * @param {boolean} faceCamera 1인칭이면 항상 카메라 방향을 본다
   */
  update(dt, input, camYaw, world, faceCamera) {
    const axis = input.moveAxis();
    const running = input.running;
    const moving = axis.x !== 0 || axis.z !== 0;
    const speed = running ? RUN_SPEED : WALK_SPEED;

    // 카메라 기준 앞/오른쪽 벡터 (XZ 평면)
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);

    let dx = 0, dz = 0;
    if (moving) {
      dx = (fx * axis.z + rx * axis.x) * speed * dt;
      dz = (fz * axis.z + rz * axis.x) * speed * dt;
      this.heading = faceCamera ? camYaw + Math.PI : Math.atan2(dx, dz);
    } else if (faceCamera) {
      this.heading = camYaw + Math.PI;
    }

    // 점프
    if (this.grounded && input.pressed('Space')) {
      this.vy = JUMP_SPEED;
      this.grounded = false;
    }

    // 축별로 이동해 벽/가구에 미끄러지듯 막힘
    const p = this.group.position;
    const colliders = world.allColliders();
    p.x += dx; this.resolve(p, world.bounds, colliders);
    p.z += dz; this.resolve(p, world.bounds, colliders);

    // 중력
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      p.y += this.vy * dt;
      if (p.y <= 0) {
        p.y = 0;
        this.vy = 0;
        this.grounded = true;
      }
    }

    // 부드러운 회전
    let diff = this.heading - this.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.group.rotation.y += diff * Math.min(1, TURN_SPEED * dt);

    // 애니메이션 상태 (점프 클립이 없어 공중에서는 Idle)
    if (!this.grounded || !moving) this.play(this.idle);
    else this.play(running ? this.run : this.walk);
    if (this.mixer) this.mixer.update(dt);
  }

  resolve(p, b, colliders) {
    p.x = THREE.MathUtils.clamp(p.x, b.minX + RADIUS, b.maxX - RADIUS);
    p.z = THREE.MathUtils.clamp(p.z, b.minZ + RADIUS, b.maxZ - RADIUS);
    for (const box of colliders) {
      // 원(플레이어) vs 박스 XZ 충돌. 점프로 넘을 수 있는 낮은 상자는 통과
      if (box.max.y <= p.y + 0.05) continue;
      const cx = THREE.MathUtils.clamp(p.x, box.min.x, box.max.x);
      const cz = THREE.MathUtils.clamp(p.z, box.min.z, box.max.z);
      let ox = p.x - cx, oz = p.z - cz;
      const d = Math.hypot(ox, oz);
      if (d < RADIUS) {
        if (d < 1e-5) { ox = 1; oz = 0; }
        else { ox /= d; oz /= d; }
        p.x = cx + ox * RADIUS;
        p.z = cz + oz * RADIUS;
      }
    }
  }
}
