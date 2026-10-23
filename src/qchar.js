import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { umSchema, umSanitize, umRandom } from './umchar.js';

// 커스터마이저가 조립할 수 있는 팩. ubc = Universal Base Characters(이 파일), um = Ultimate Modular Men/Women(umchar.js)
export const FAMILIES = { ubc: '유니버설 베이스 (기본)', um: '얼티밋 모듈러 (남/여 의상)' };
const FAMILY_FIELD = { key: 'family', label: '캐릭터 팩', type: 'select', options: FAMILIES };

// Quaternius 모듈형 캐릭터 (CC0). 기본 몸(Universal Base Characters) 위에 머리카락·의상 부품(glTF)을 붙인다.
// 모든 부품이 같은 65개 뼈대(root, pelvis, spine_01 … hand_r)를 쓰므로 부품의 SkinnedMesh 를 기본 몸의 Skeleton 에 다시 묶기만 하면 된다.
// 애니메이션도 같은 뼈대용 Universal Animation Library 를 그대로 재생한다 (리타게팅 없음).

const BASE = '/models/q/';
const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const cache = new Map(); // url → Promise<gltf>
function load(url) {
  if (!cache.has(url)) {
    const p = loader.loadAsync(BASE + url);
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return cache.get(url);
}
const texCache = new Map();
function loadTex(name) {
  if (!texCache.has(name)) {
    const t = texLoader.load(BASE + 'tex/' + name);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false; // glTF 텍스처 규약
    texCache.set(name, t);
  }
  return texCache.get(name);
}

export const BODIES = {
  male: { label: '남성', file: 'body/Superhero_Male_FullBody.gltf', skin: { light: 'T_Superhero_Male_Light.png', dark: 'T_Superhero_Male_Dark.png' } },
  female: { label: '여성', file: 'body/Superhero_Female_FullBody.gltf', skin: { light: 'T_Superhero_Female_Light_BaseColor.png', dark: 'T_Superhero_Female_Dark_BaseColor.png' } },
};
// 피부: 밝은/어두운 텍스처 + 색 곱하기
export const SKINS = {
  pale: { label: '밝은', tex: 'light', tint: '#ffffff' },
  fair: { label: '보통', tex: 'light', tint: '#e8c9a8' },
  tan: { label: '구릿빛', tex: 'light', tint: '#c99a70' },
  brown: { label: '갈색', tex: 'dark', tint: '#ffffff' },
  deep: { label: '짙은', tex: 'dark', tint: '#8f6a52' },
};
export const HAIRS = { none: '없음', Hair_Buzzed: '아주 짧은', Hair_BuzzedFemale: '짧은 (여성)', Hair_SimpleParted: '가르마', Hair_Long: '긴 머리', Hair_Buns: '양갈래 번' };
export const BEARDS = { none: '없음', Hair_Beard: '수염' };
export const EYEBROWS = { base: '기본', Eyebrows_Regular: '굵은', Eyebrows_Female: '가는' };
export const OUTFIT_SETS = { none: '없음 (기본)', Peasant: '농부', Ranger: '레인저' };
export const HEADWEAR = { none: '없음', Ranger_Head_Hood: '레인저 후드' };
export const ACC = { none: '없음', Ranger_Acc: '레인저 어깨 보호대' };

// 실제 파일 이름 (성별·세트·부위 조합). 없는 조합은 undefined
const PART_FILES = {
  male: {
    Peasant: { body: 'Male_Peasant_Body', arms: 'Male_Peasant_Arms', legs: 'Male_Peasant_Legs', feet: 'Male_Peasant_Feet' },
    Ranger: { body: 'Male_Ranger_Body', arms: 'Male_Ranger_Arms', legs: 'Male_Ranger_Legs', feet: 'Male_Ranger_Feet_Boots', head: 'Male_Ranger_Head_Hood', acc: 'Male_Ranger_Acc_Pauldron' },
  },
  female: {
    Peasant: { body: 'Female_Peasant_Body', arms: 'Female_Peasant_Arms', legs: 'Female_Peasant_Legs', feet: 'Female_Peasant_Feet' },
    Ranger: { body: 'Female_Ranger_Body', arms: 'Female_Ranger_Arms', legs: 'Female_Ranger_Legs', feet: 'Female_Ranger_Feet', head: 'Female_Ranger_Head_Hood', acc: 'Female_Ranger_Acc_Pauldrons' },
  },
};
// 의상 부위가 덮는 뼈 그룹: 기본 몸에서 그 뼈에 묶인 삼각형을 잘라내 옷 밖으로 삐져나오지 않게 한다
const COVER = {
  body: /^(spine_0[1-3]|clavicle_[lr]|pelvis|upperarm_twist|neck_)/,
  arms: /^(upperarm|lowerarm|hand_|index|middle|ring|pinky|thumb)/,
  legs: /^(thigh|calf)/,
  feet: /^(foot_|ball_)/,
};

export const DEFAULT_PARAMS = {
  family: 'ubc', gender: 'male', height: 1, skin: 'fair',
  eyeColor: '#6b4a2b', eyebrows: 'base',
  hair: 'Hair_SimpleParted', beard: 'none', hairColor: '#3a2416',
  top: 'Peasant', topColor: '#ffffff', legs: 'Peasant', legsColor: '#ffffff', arms: 'Peasant', armsColor: '#ffffff', feet: 'Peasant', feetColor: '#ffffff',
  headwear: 'none', acc: 'none',
};
export const PRESETS = {
  male: { gender: 'male', height: 1.02, hair: 'Hair_SimpleParted', beard: 'none', eyebrows: 'base', top: 'Peasant', legs: 'Peasant', arms: 'Peasant', feet: 'Peasant' },
  female: { gender: 'female', height: 0.96, hair: 'Hair_Long', beard: 'none', eyebrows: 'base', top: 'Ranger', legs: 'Ranger', arms: 'Ranger', feet: 'Ranger' },
};
export const SCHEMA = [
  { group: '기본', fields: [
    FAMILY_FIELD,
    { key: 'gender', label: '성별', type: 'select', options: Object.fromEntries(Object.entries(BODIES).map(([k, v]) => [k, v.label])) },
    { key: 'height', label: '키', type: 'range', min: 0.88, max: 1.12, step: 0.01 },
    { key: 'skin', label: '피부', type: 'select', options: Object.fromEntries(Object.entries(SKINS).map(([k, v]) => [k, v.label])) },
  ] },
  { group: '얼굴', fields: [
    { key: 'eyeColor', label: '눈 색', type: 'color' },
    { key: 'eyebrows', label: '눈썹', type: 'select', options: EYEBROWS },
    { key: 'beard', label: '수염', type: 'select', options: BEARDS },
  ] },
  { group: '머리', fields: [
    { key: 'hair', label: '스타일', type: 'select', options: HAIRS },
    { key: 'hairColor', label: '머리색', type: 'color' },
    { key: 'headwear', label: '모자', type: 'select', options: HEADWEAR },
  ] },
  { group: '의상', fields: [
    { key: 'top', label: '상의', type: 'select', options: OUTFIT_SETS },
    { key: 'topColor', label: '상의 색', type: 'color' },
    { key: 'arms', label: '소매·장갑', type: 'select', options: OUTFIT_SETS },
    { key: 'armsColor', label: '소매 색', type: 'color' },
    { key: 'legs', label: '하의', type: 'select', options: OUTFIT_SETS },
    { key: 'legsColor', label: '하의 색', type: 'color' },
    { key: 'feet', label: '신발', type: 'select', options: OUTFIT_SETS },
    { key: 'feetColor', label: '신발 색', type: 'color' },
    { key: 'acc', label: '장신구', type: 'select', options: ACC },
  ] },
];
// 지금 값에 맞는 폼 정의 (팩·성별에 따라 선택지가 달라진다)
export function schemaFor(P) {
  return P?.family === 'um' ? umSchema(P, FAMILY_FIELD) : SCHEMA;
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const TINTS = ['#ffffff', '#f3d9a4', '#c96a5a', '#6a9bd1', '#7bb46a', '#a07ad1', '#555555', '#d9d9d9', '#e0a14a'];
export function randomParams(family = 'ubc') {
  if (family === 'um') return umRandom();
  const p = { ...DEFAULT_PARAMS };
  p.gender = pick(Object.keys(BODIES));
  p.height = +(0.9 + Math.random() * 0.2).toFixed(2);
  p.skin = pick(Object.keys(SKINS));
  p.eyeColor = pick(['#6b4a2b', '#2e5a8a', '#3f7a3f', '#8a8a8a', '#3a2416']);
  p.eyebrows = pick(Object.keys(EYEBROWS));
  p.hair = pick(Object.keys(HAIRS));
  p.beard = p.gender === 'male' ? pick(Object.keys(BEARDS)) : 'none';
  p.hairColor = pick(['#1a1310', '#3a2416', '#6b4a2b', '#b07a3a', '#d9b36a', '#e8dcc0', '#8a8a8a', '#a33a2b', '#4a63a8']);
  const set = pick(Object.keys(OUTFIT_SETS));
  for (const s of ['top', 'arms', 'legs', 'feet']) { p[s] = set; p[s + 'Color'] = pick(TINTS); }
  p.headwear = set === 'Ranger' && Math.random() < 0.5 ? 'Ranger_Head_Hood' : 'none';
  p.acc = set === 'Ranger' && Math.random() < 0.5 ? 'Ranger_Acc' : 'none';
  return p;
}

// 저장된 값이 목록에 없으면(예전 도형 캐릭터 저장본, 지워진 부품 등) 기본값으로 바꾼다. 없는 파일을 요청하지 않게
export function sanitize(params) {
  if (params?.family === 'um') return umSanitize(params);
  const P = { ...DEFAULT_PARAMS, ...(params || {}), family: 'ubc' };
  const fix = (key, options) => { if (!(P[key] in options)) P[key] = DEFAULT_PARAMS[key]; };
  fix('gender', BODIES); fix('skin', SKINS); fix('hair', HAIRS); fix('beard', BEARDS); fix('eyebrows', EYEBROWS);
  for (const s of ['top', 'arms', 'legs', 'feet']) fix(s, OUTFIT_SETS);
  fix('headwear', HEADWEAR); fix('acc', ACC);
  for (const k of ['eyeColor', 'hairColor', 'topColor', 'armsColor', 'legsColor', 'feetColor']) if (!/^#[0-9a-f]{6}$/i.test(P[k] || '')) P[k] = DEFAULT_PARAMS[k];
  P.height = Math.min(1.12, Math.max(0.88, Number(P.height) || 1));
  return P;
}

// Mixamo 식 뼈 이름(무기·조준 자세 코드가 쓰는 이름) → 이 리그의 이름
export const BONE_ALIAS = {
  Hips: 'pelvis', Spine: 'spine_01', Spine1: 'spine_02', Spine2: 'spine_03', Neck: 'neck_01', Head: 'Head',
  LeftShoulder: 'clavicle_l', LeftArm: 'upperarm_l', LeftForeArm: 'lowerarm_l', LeftHand: 'hand_l', LeftHandMiddle1: 'middle_01_l',
  RightShoulder: 'clavicle_r', RightArm: 'upperarm_r', RightForeArm: 'lowerarm_r', RightHand: 'hand_r', RightHandMiddle1: 'middle_01_r',
  LeftUpLeg: 'thigh_l', LeftLeg: 'calf_l', LeftFoot: 'foot_l', LeftToeBase: 'ball_l',
  RightUpLeg: 'thigh_r', RightLeg: 'calf_r', RightFoot: 'foot_r', RightToeBase: 'ball_r',
};

function firstSkinned(root) {
  let f = null;
  root.traverse((o) => { if (!f && o.isSkinnedMesh) f = o; });
  return f;
}

// 기본 몸 지오메트리에서, 지배적인 뼈 이름이 remove 정규식들 중 하나에 맞는 정점을 포함한 삼각형을 모두 뺀다
function cutGeometry(geometry, boneNames, removeRes) {
  if (!removeRes.length) return geometry;
  // GLTFLoader 는 JOINTS_0/WEIGHTS_0 를 skinIndex/skinWeight 로 이름 바꿔 넣는다
  const joints = geometry.attributes.skinIndex, weights = geometry.attributes.skinWeight;
  const bad = new Uint8Array(joints.count);
  for (let i = 0; i < joints.count; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = weights.getComponent(i, k); if (w > bw) { bw = w; best = joints.getComponent(i, k); } }
    const name = boneNames[best] || '';
    if (removeRes.some((re) => re.test(name))) bad[i] = 1;
  }
  const src = geometry.index ? geometry.index.array : Uint32Array.from({ length: joints.count }, (_, i) => i), out = [];
  for (let t = 0; t < src.length; t += 3) {
    if (!bad[src[t]] && !bad[src[t + 1]] && !bad[src[t + 2]]) out.push(src[t], src[t + 1], src[t + 2]);
  }
  const g = geometry.clone();
  g.setIndex(out);
  return g;
}

export class QuaterniusCharacter {
  constructor() {
    this.family = 'ubc';
    this.leftArm = 'upperarm_l'; // 정면 판정용 (player.installQChar)
    this.root = null;        // 기본 몸 glTF 씬 (Armature 포함)
    this.skeleton = null;
    this.bodyMesh = null;    // 기본 몸 SkinnedMesh
    this.baseGeometry = null;
    this.boneNames = [];
    this.parts = new Map();  // slot → Object3D[] (붙인 부품)
    this.gender = null;
    this.clips = null;
    this.version = 0;        // 늦게 끝난 apply 가 최신 상태를 덮어쓰지 않게
  }

  static async loadClips() {
    const g = await load('anim/UAL1_Standard.glb');
    const find = (n) => g.animations.find((c) => c.name === n);
    return { idle: find('Idle_Loop'), walk: find('Walk_Loop'), run: find('Jog_Fwd_Loop'), all: g.animations };
  }

  // 기본 몸을 (다시) 만든다. 성별이 바뀌면 전부 새로
  async loadBody(gender) {
    const body = BODIES[gender] || BODIES.male;
    const g = await load(body.file);
    const root = SkeletonUtils.clone(g.scene);
    const mesh = firstSkinned(root);
    // 가장 큰 스킨 메시가 몸 (눈·눈썹도 SkinnedMesh)
    let bodyMesh = mesh;
    root.traverse((o) => { if (o.isSkinnedMesh && o.geometry.attributes.position.count > bodyMesh.geometry.attributes.position.count) bodyMesh = o; });
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        o.material = o.material.clone(); // 색을 따로 칠할 수 있게
      }
    });
    this.root = root;
    this.gender = gender;
    this.bodyMesh = bodyMesh;
    this.baseGeometry = bodyMesh.geometry;
    this.skeleton = bodyMesh.skeleton;
    this.boneNames = this.skeleton.bones.map((b) => b.name);
    this.parts.clear();
    return root;
  }

  bone(name) {
    return this.skeleton?.bones.find((b) => b.name === name) || null;
  }
  // 'Eyes', 'Eyebrows' 처럼 이름으로 기본 메시 찾기
  baseMesh(name) {
    let f = null;
    this.root.traverse((o) => { if (!f && o.isSkinnedMesh && o !== this.bodyMesh && new RegExp(name, 'i').test(o.name)) f = o; });
    return f;
  }

  // 부품 glTF 의 SkinnedMesh 들을 기본 몸 뼈대에 묶어서 붙인다
  async attach(slot, file, tint) {
    const g = await load(`${slot === 'hair' || slot === 'beard' || slot === 'eyebrows' ? 'hair' : 'parts'}/${file}.gltf`);
    const clone = SkeletonUtils.clone(g.scene);
    const added = [];
    clone.traverse((o) => { if (o.isSkinnedMesh) added.push(o); });
    for (const m of added) {
      // 부품 뼈 순서가 기본 몸과 다르면 JOINTS 인덱스를 이름 기준으로 바꿔 끼운다
      const map = m.skeleton.bones.map((b) => this.boneNames.indexOf(b.name));
      if (map.some((v, i) => v !== i)) {
        for (const key of ['skinIndex', 'skinIndex1']) {
          const a = m.geometry.attributes[key];
          if (!a) continue;
          const arr = a.array.slice();
          for (let i = 0; i < arr.length; i++) arr[i] = Math.max(0, map[arr[i]]);
          m.geometry = m.geometry.clone();
          m.geometry.setAttribute(key, new THREE.BufferAttribute(arr, a.itemSize));
        }
      }
      m.removeFromParent();
      m.material = m.material.clone();
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.bodyMesh.parent.add(m);
      m.bind(this.skeleton, m.bindMatrix);
      if (tint) this.tint(m, tint);
    }
    this.parts.set(slot, added);
    return added;
  }

  detach(slot) {
    for (const m of this.parts.get(slot) || []) { m.removeFromParent(); m.material.dispose(); }
    this.parts.delete(slot);
  }

  tint(mesh, color) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) if (mat.name !== 'MI_Regular_Male' && mat.name !== 'MI_Regular_Female') mat.color.set(color); // 옷만, 맨살 부분은 제외
  }

  /**
   * params 대로 부품·색을 맞춘다. 성별이 바뀌면 몸을 새로 만들고 true 를 돌려준다 (호출자가 모델을 교체해야 함)
   */
  async apply(params) {
    const P = sanitize(params);
    const v = ++this.version;
    let rebuilt = false;
    if (!this.root || this.gender !== P.gender) {
      await this.loadBody(P.gender);
      rebuilt = true;
    }
    if (v !== this.version) return rebuilt;
    const files = PART_FILES[P.gender] || PART_FILES.male;
    const want = {
      hair: P.hair !== 'none' ? P.hair : null,
      beard: P.beard !== 'none' ? P.beard : null,
      eyebrows: P.eyebrows !== 'base' ? P.eyebrows : null,
      body: files[P.top]?.body || null,
      arms: files[P.arms]?.arms || null,
      legs: files[P.legs]?.legs || null,
      feet: files[P.feet]?.feet || null,
      head: P.headwear === 'Ranger_Head_Hood' ? files.Ranger.head : null,
      acc: P.acc === 'Ranger_Acc' ? files.Ranger.acc : null,
    };
    const tints = { hair: P.hairColor, beard: P.hairColor, eyebrows: P.hairColor, body: P.topColor, arms: P.armsColor, legs: P.legsColor, feet: P.feetColor, head: P.topColor, acc: P.armsColor };
    const jobs = [];
    for (const [slot, file] of Object.entries(want)) {
      const cur = this.parts.get(slot);
      if (cur && cur[0].userData.file === file) {
        for (const m of cur) this.tint(m, tints[slot]);
        continue;
      }
      this.detach(slot);
      if (file) jobs.push(this.attach(slot, file, tints[slot]).then((ms) => { for (const m of ms) m.userData.file = file; }));
    }
    await Promise.all(jobs);
    if (v !== this.version) return rebuilt;

    // 기본 몸: 피부 텍스처·색, 옷이 덮는 부분 잘라내기, 기본 눈썹 숨김
    const skin = SKINS[P.skin] || SKINS.fair;
    const body = BODIES[P.gender] || BODIES.male;
    const bm = this.bodyMesh.material;
    bm.map = loadTex(body.skin[skin.tex]);
    bm.color.set(skin.tint);
    bm.needsUpdate = true;
    const removeRes = ['body', 'arms', 'legs', 'feet'].filter((s) => want[s]).map((s) => COVER[s]);
    const key = removeRes.map(String).join('|');
    if (this.bodyMesh.userData.cutKey !== key) {
      if (this.bodyMesh.geometry !== this.baseGeometry) this.bodyMesh.geometry.dispose();
      this.bodyMesh.geometry = cutGeometry(this.baseGeometry, this.boneNames, removeRes);
      this.bodyMesh.userData.cutKey = key;
    }
    const eyes = this.baseMesh('Eyes');
    if (eyes) eyes.material.color.set(P.eyeColor);
    const brows = this.baseMesh('Eyebrows');
    if (brows) { brows.visible = !want.eyebrows; brows.material.color.set(P.hairColor); }
    this.root.scale.setScalar(P.height || 1);
    return rebuilt;
  }

  dispose() {
    for (const slot of [...this.parts.keys()]) this.detach(slot);
    this.root?.removeFromParent();
    this.root = null;
  }
}
