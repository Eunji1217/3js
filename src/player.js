import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { SOLDIER_URL } from './skins.js';
import { QuaterniusCharacter, BONE_ALIAS } from './qchar.js';
import { UMCharacter, BONE_ALIAS_UM } from './umchar.js';

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
// 어떤 FBX 는 같은 이름의 뼈대가 두 벌 들어 있고 메시마다 다른 쪽에 묶여 있다 (예: 몸은 바깥 뼈대, 신발은 안쪽 뼈대).
// 이름으로 찾는 애니메이션 트랙과 getBone 은 한 벌만 움직이므로, 가장 큰 메시의 뼈대를 기준으로 삼아
// 다른 메시들을 그 뼈대에 다시 묶고, 기준에 없는 중복 뼈는 이름을 바꿔 트랙이 붙지 않게 한다
function unifySkeletons(root) {
  const meshes = [];
  root.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  if (meshes.length < 2) return 0;
  const main = meshes.reduce((a, b) => (b.geometry.attributes.position.count > a.geometry.attributes.position.count ? b : a));
  const mainBones = new Set(main.skeleton.bones);
  const byName = new Map(main.skeleton.bones.map((b) => [b.name, b]));
  let rebound = 0;
  for (const m of meshes) {
    if (m === main || m.skeleton.bones.every((b) => mainBones.has(b))) continue;
    const bones = m.skeleton.bones.map((b) => byName.get(b.name) || b);
    m.bind(new THREE.Skeleton(bones, m.skeleton.boneInverses), m.bindMatrix);
    rebound++;
  }
  let renamed = 0;
  root.traverse((o) => {
    if (o.isBone && !mainBones.has(o) && byName.has(o.name)) { o.name += '__unbound'; renamed++; }
  });
  if (renamed) console.warn(`뼈대가 두 벌인 모델: 메시 ${rebound}개를 기준 뼈대에 다시 묶고 중복 뼈 ${renamed}개 이름을 바꿨어요`);
  return renamed;
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
    if (skin.format === 'qchar' || skin.format === 'custom') return this.setCustom(skin);
    const { scene, animations } = await loadModel(skin.url, skin.format);
    const model = SkeletonUtils.clone(scene);
    unifySkeletons(model);
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
    this.installModel(model, skin, idle, walk, run);
    return this;
  }

  // 조립형 캐릭터 (Quaternius 부품). 기본 몸 + 부품을 조립하고 같은 뼈대용 애니메이션 라이브러리를 재생한다
  async setCustom(skin) {
    const params = skin.params || {};
    const Cls = params.family === 'um' ? UMCharacter : QuaterniusCharacter; // 팩마다 조립 방식·애니메이션 파일이 다르다
    const qc = new Cls();
    const [, clips] = await Promise.all([qc.apply(params), Cls.loadClips(params.gender)]);
    this.installQChar(qc, clips, { ...skin, format: 'qchar', params });
    return this;
  }

  installQChar(qc, clips, skin) {
    const model = qc.root;
    // 쉬는 자세에서 왼팔이 +x 쪽이면 +Z 를 보는 모델
    model.updateMatrixWorld(true);
    const arm = qc.bone(qc.leftArm || 'upperarm_l');
    model.rotation.y = arm && arm.getWorldPosition(new THREE.Vector3()).x >= 0 ? 0 : Math.PI;
    this.installModel(model, skin, clips.idle, clips.walk, clips.run);
    this.custom = qc;
    this.qClips = clips;
    this.eyeHeight = 1.65 * (skin.params.height || 1);
  }

  // 커스텀 캐릭터의 부품·색만 다시 맞춘다 (슬라이더를 움직일 때마다 호출). 성별이 바뀌면 모델을 통째로 바꾼다
  async applyCustomParams(params) {
    const qc = this.custom;
    if (!qc) return;
    const skin = { ...this.skin, params };
    if (qc.family !== (params.family || 'ubc')) { await this.setCustom(skin); return; } // 팩이 바뀌면 통째로 새로
    const rebuilt = await qc.apply(params);
    if (this.custom !== qc) return; // 그 사이 다른 스킨으로 바뀜
    if (rebuilt) {
      this.qClips = await qc.constructor.loadClips(params.gender); // 성별마다 애니메이션 파일이 다를 수 있다 (um)
      this.installQChar(qc, this.qClips, skin);
    } else {
      this.skin = skin;
      this.eyeHeight = 1.65 * (params.height || 1);
    }
  }

  // 새 모델을 플레이어에 끼우고 믹서를 새로 만든다
  installModel(model, skin, idle, walk, run) {
    prepareModel(model);
    model.visible = this.visible;
    if (this.model) {
      this.group.remove(this.model);
      this.mixer?.stopAllAction();
    }
    if (this.custom && this.custom.root !== model) { this.custom.dispose(); this.custom = null; }
    this.eyeHeight = 1.6;
    this.model = model;
    this.skin = skin;
    this.group.add(model);

    this.mixer = new THREE.AnimationMixer(model);
    this.idle = this.mixer.clipAction(idle);
    this.walk = this.mixer.clipAction(walk);
    this.run = this.mixer.clipAction(run);
    this.current = null;
    this.play(this.idle, 0);
    this.alignToGround();
    this.onModelChanged?.(this); // 무기 등 모델에 붙는 것들을 다시 붙일 기회
  }

  // 발이 y=0 에 닿게 모델을 위아래로 옮긴다. 원점이 발이 아닌 모델(허리·중심이 원점)이나,
  // Soldier 클립을 리타게팅하면서 엉덩이 높이가 달라진 모델은 떠 있거나 바닥에 묻힌다.
  // SkinnedMesh 는 뼈대 자세에 따라 모양이 바뀌므로 Idle 첫 프레임을 뼈에 반영한 뒤 precise 모드로 잰다
  alignToGround() {
    const model = this.model;
    if (!model || !this.mixer) return;
    this.mixer.update(0);
    model.position.y = 0;
    this.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true); // precise: 스키닝이 적용된 정점 위치로
    if (box.isEmpty()) return;
    const groundY = this.group.getWorldPosition(new THREE.Vector3()).y;
    const off = box.min.y - groundY; // 발바닥이 땅보다 얼마나 위(+)/아래(-)에 있는지
    if (Math.abs(off) > 0.005) model.position.y = -off;
    model.updateMatrixWorld(true);
  }

  // 이름이 suffix 로 끝나는 뼈 (예: 'RightHand' → mixamorigRightHand)
  getBone(suffix) {
    if (!this.model) return null;
    // Mixamo 이름으로 못 찾으면 다른 리그의 이름(pelvis, hand_r …)으로 한 번 더
    return findBone(this.model, suffix)
      || (BONE_ALIAS[suffix] ? findBone(this.model, BONE_ALIAS[suffix]) : null)
      || (BONE_ALIAS_UM[suffix] ? findBone(this.model, BONE_ALIAS_UM[suffix]) : null);
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
        // 대상 뼈 이름이 'Hips' / 'mixamorigHips' / 'mixamorig6Hips'(Mixamo 가 가끔 붙이는 숫자 네임스페이스) 든
        // 원본 이름('mixamorigHips')으로 맞춘다
        const base = bone.name.replace(/^mixamorig\d*:?/, '');
        return ['mixamorig' + base, 'mixamorig:' + base].find((n) => boneNames.has(n)) || 'mixamorig' + base;
      },
    };
    if (!findBone(model, 'Hips')) throw new Error('Mixamo 뼈 이름(Hips 등)을 쓰는 모델이 아니에요');
    // retargetClip 은 스켈레톤의 뼈 목록 순서대로 월드 행렬을 갱신하므로 자식이 부모보다 먼저 오면 어긋난다.
    // FBX 는 그 순서가 보장되지 않아, 부모→자식 순서(traverse 순서)로 정렬한 스켈레톤을 대신 넘긴다
    const ordered = [];
    model.traverse((o) => { if (o.isBone) ordered.push(o); });
    const skel = targetSkin.skeleton;
    model.updateMatrixWorld(true);
    const inverses = ordered.map((b) => {
      const i = skel.bones.indexOf(b);
      return i >= 0 ? skel.boneInverses[i] : b.matrixWorld.clone().invert();
    });
    const target = new THREE.Object3D();
    target.skeleton = new THREE.Skeleton(ordered, inverses);
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
      const rc = SkeletonUtils.retargetClip(target, src.skeleton, cleaned, options);
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
