import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGltf } from './furniture.js';

// Quaternius "Ultimate Modular Men / Women" (CC0, https://quaternius.com) 조립 캐릭터 (26단계).
// 의상마다 glb 하나에 머리·상의·하의·신발(+가방 같은 덤) SkinnedMesh 가 들어 있고, 성별 안에서는 모두 같은 62뼈 뼈대를 쓴다.
// 그래서 "A 의상의 머리 + B 의상의 상의" 처럼 메시만 골라 한 뼈대에 다시 묶으면 된다 (17단계 attach 와 같은 원리).
// 애니메이션(Idle/Walk/Run 등 24개)은 성별당 anim.glb 하나에서 가져온다. 파일은 public/models/um/ (um-prep 으로 용량을 줄인 것).

const BASE = '/models/um/';

export const UM_GENDERS = {
  female: {
    label: '여성',
    outfits: { Adventurer: '모험가', Casual: '캐주얼', Formal: '정장', Medieval: '중세', Punk: '펑크', SciFi: 'SF', Soldier: '군인', Suit: '수트', Witch: '마녀', Worker: '작업복' },
  },
  male: {
    label: '남성',
    outfits: { Adventurer: '모험가', Beach: '비치', Casual_2: '캐주얼', Casual_Hoodie: '후드티', Farmer: '농부', King: '왕', Punk: '펑크', Spacesuit: '우주복', Suit: '수트', Swat: 'SWAT', Worker: '작업복' },
  },
};
export const UM_SLOTS = { head: '머리', body: '상의', legs: '하의', feet: '신발' };
// 피부·머리색은 "원본" 아니면 색을 통째로 바꾼다 (재질이 단색이라 곱하기로는 밝게 못 만든다)
export const UM_SKINS = { orig: '원본', pale: '밝은', fair: '보통', tan: '구릿빛', brown: '갈색', deep: '짙은' };
const UM_SKIN_HEX = { pale: '#f6dcc8', fair: '#e8b89a', tan: '#c98f68', brown: '#9a6a4a', deep: '#5e3d2c' };
export const UM_HAIRS = { orig: '원본', black: '검정', brown: '갈색', blonde: '금발', red: '빨강', gray: '회색', white: '흰색', blue: '파랑', pink: '분홍' };
const UM_HAIR_HEX = { black: '#1a1310', brown: '#5a3a22', blonde: '#d9b36a', red: '#a33a2b', gray: '#8a8a8a', white: '#eeeeee', blue: '#4a63a8', pink: '#e08ab0' };
export const UM_EXTRAS = { on: '표시', off: '숨김' };

export const UM_DEFAULT = {
  family: 'um', gender: 'female', height: 1,
  head: 'Casual', body: 'Casual', legs: 'Casual', feet: 'Casual', extras: 'on',
  skin: 'orig', hair: 'orig', topColor: '#ffffff', legsColor: '#ffffff', feetColor: '#ffffff',
};

// 성별에 맞는 의상 목록으로 셀렉트를 만든다 (성별이 바뀌면 폼을 다시 그려야 한다)
export function umSchema(P, familyField) {
  const g = UM_GENDERS[P.gender] || UM_GENDERS.female;
  const outfit = (key, label) => ({ key, label, type: 'select', options: g.outfits });
  return [
    { group: '기본', fields: [
      familyField,
      { key: 'gender', label: '성별', type: 'select', options: Object.fromEntries(Object.entries(UM_GENDERS).map(([k, v]) => [k, v.label])) },
      { key: 'height', label: '키', type: 'range', min: 0.88, max: 1.12, step: 0.01 },
      { key: 'skin', label: '피부', type: 'select', options: UM_SKINS },
    ] },
    { group: '머리', fields: [
      outfit('head', '머리 (의상)'),
      { key: 'hair', label: '머리색', type: 'select', options: UM_HAIRS },
    ] },
    { group: '의상', fields: [
      outfit('body', '상의'), { key: 'topColor', label: '상의 색 (곱하기)', type: 'color' },
      outfit('legs', '하의'), { key: 'legsColor', label: '하의 색 (곱하기)', type: 'color' },
      outfit('feet', '신발'), { key: 'feetColor', label: '신발 색 (곱하기)', type: 'color' },
      { key: 'extras', label: '가방·장식', type: 'select', options: UM_EXTRAS },
    ] },
  ];
}

export function umSanitize(params) {
  const P = { ...UM_DEFAULT, ...(params || {}), family: 'um' };
  if (!(P.gender in UM_GENDERS)) P.gender = UM_DEFAULT.gender;
  const outfits = UM_GENDERS[P.gender].outfits;
  const first = Object.keys(outfits)[0];
  for (const s of Object.keys(UM_SLOTS)) if (!(P[s] in outfits)) P[s] = first;
  if (!(P.skin in UM_SKINS)) P.skin = 'orig';
  if (!(P.hair in UM_HAIRS)) P.hair = 'orig';
  if (!(P.extras in UM_EXTRAS)) P.extras = 'on';
  for (const k of ['topColor', 'legsColor', 'feetColor']) if (!/^#[0-9a-f]{6}$/i.test(P[k] || '')) P[k] = '#ffffff';
  P.height = Math.min(1.12, Math.max(0.88, Number(P.height) || 1));
  return P;
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];
export function umRandom() {
  const gender = pick(Object.keys(UM_GENDERS));
  const outfits = Object.keys(UM_GENDERS[gender].outfits);
  const P = { ...UM_DEFAULT, gender, height: +(0.9 + Math.random() * 0.2).toFixed(2) };
  const same = Math.random() < 0.4 ? pick(outfits) : null; // 40% 는 한 벌로 맞춰 입는다
  for (const s of Object.keys(UM_SLOTS)) P[s] = same || pick(outfits);
  P.skin = pick(Object.keys(UM_SKINS));
  P.hair = pick(Object.keys(UM_HAIRS));
  P.extras = Math.random() < 0.7 ? 'on' : 'off';
  return P;
}

// Mixamo 식 이름(무기·조준 코드) → 이 리그의 이름. PT.L/R 은 발가락이 아니라 IK 보조 뼈라 뺀다. GLTFLoader 가 이름의 '.' 을 지우므로(sanitizeNodeName) 'Wrist.R' → 'WristR'
export const BONE_ALIAS_UM = {
  Hips: 'Hips', Spine: 'Abdomen', Spine1: 'Torso', Spine2: 'Chest', Neck: 'Neck', Head: 'Head',
  LeftShoulder: 'ShoulderL', LeftArm: 'UpperArmL', LeftForeArm: 'LowerArmL', LeftHand: 'WristL', LeftHandMiddle1: 'Middle1L',
  RightShoulder: 'ShoulderR', RightArm: 'UpperArmR', RightForeArm: 'LowerArmR', RightHand: 'WristR', RightHandMiddle1: 'Middle1R',
  LeftUpLeg: 'UpperLegL', LeftLeg: 'LowerLegL', LeftFoot: 'FootL',
  RightUpLeg: 'UpperLegR', RightLeg: 'LowerLegR', RightFoot: 'FootR',
};

const SLOT_RE = { head: /_Head$/i, body: /_Body$/i, legs: /_Legs$/i, feet: /_Feet$/i };
const slotOf = (name) => Object.keys(SLOT_RE).find((s) => SLOT_RE[s].test(name)) || 'extras';
// 부위 노드: Armature 바로 아래 노드. 재질이 여러 개인 부위는 GLTFLoader 가 'Casual_Head' 그룹 아래 'Cube037', 'Cube037_1' 메시로 쪼개 놓으므로
// 메시 이름이 아니라 "Armature 바로 아래 조상"의 이름으로 슬롯을 정한다
function partNodes(root, armature) {
  const nodes = new Set();
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    let n = o;
    while (n.parent && n.parent !== armature && n.parent !== root) n = n.parent;
    nodes.add(n);
  });
  return [...nodes];
}
const skinnedIn = (node) => { const out = []; node.traverse((o) => { if (o.isSkinnedMesh) out.push(o); }); return out; };
const isSkinMat = (m) => /^Skin/i.test(m.name);
const isHairMat = (m) => /^(Hair|Eyebrow)/i.test(m.name);
const isEyeMat = (m) => /^Eye/i.test(m.name);

export class UMCharacter {
  constructor() {
    this.family = 'um';
    this.leftArm = 'UpperArmL'; // 정면 판정용 (player.installQChar)
    this.root = null;
    this.skeleton = null;
    this.holder = null;   // 메시를 넣을 노드 (원래 메시들이 있던 Armature)
    this.boneNames = [];
    this.gender = null;
    this.parts = new Map(); // slot → { file, meshes }
    this.version = 0;
  }

  static async loadClips(gender = 'female') {
    const g = await loadGltf(BASE + (gender in UM_GENDERS ? gender : 'female') + '/anim.glb');
    const find = (n) => g.animations.find((c) => c.name === n);
    return { idle: find('Idle'), walk: find('Walk'), run: find('Run'), all: g.animations };
  }

  // 뼈대: 첫 의상 파일을 복제해 메시를 전부 떼고 Armature 만 남긴다
  async loadBase(gender) {
    const first = Object.keys(UM_GENDERS[gender].outfits)[0];
    const g = await loadGltf(`${BASE}${gender}/${first}.glb`);
    const root = SkeletonUtils.clone(g.scene);
    let mesh = null;
    root.traverse((o) => { if (!mesh && o.isSkinnedMesh) mesh = o; });
    if (!mesh) throw new Error('SkinnedMesh 가 없는 파일: ' + first);
    this.skeleton = mesh.skeleton;
    this.holder = this.skeleton.bones[0].parent; // CharacterArmature (Root 뼈와 부위 노드들의 부모)
    for (const n of partNodes(root, this.holder)) n.removeFromParent(); // 부위는 전부 떼고 뼈대만 남긴다
    this.boneNames = this.skeleton.bones.map((b) => b.name);
    this.root = root;
    this.gender = gender;
    this.parts.clear();
  }

  bone(name) {
    return this.skeleton?.bones.find((b) => b.name === name) || null;
  }

  // outfit 파일에서 slot 에 해당하는 메시만 떼어 와 기본 뼈대에 묶는다 (extras 는 슬롯 접미사가 없는 나머지 전부)
  async attach(slot, outfit) {
    const g = await loadGltf(`${BASE}${this.gender}/${outfit}.glb`);
    const clone = SkeletonUtils.clone(g.scene);
    let any = null;
    clone.traverse((o) => { if (!any && o.isSkinnedMesh) any = o; });
    const armature = any.skeleton.bones[0].parent;
    const nodes = partNodes(clone, armature).filter((n) => slotOf(n.name) === slot);
    const picked = nodes.flatMap(skinnedIn);
    for (const m of picked) {
      const map = m.skeleton.bones.map((b) => this.boneNames.indexOf(b.name));
      if (map.some((v, i) => v !== i)) { // 뼈 순서가 다르면 skinIndex 를 이름 기준으로 바꿔 끼운다
        const a = m.geometry.attributes.skinIndex;
        const arr = a.array.slice();
        for (let i = 0; i < arr.length; i++) arr[i] = Math.max(0, map[arr[i]]);
        m.geometry = m.geometry.clone();
        m.geometry.setAttribute('skinIndex', new THREE.BufferAttribute(arr, a.itemSize));
      }
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const cloned = mats.map((mat) => { const c = mat.clone(); c.userData.orig = mat.color.clone(); return c; });
      m.material = Array.isArray(m.material) ? cloned : cloned[0];
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.bind(this.skeleton, m.bindMatrix); // 기본 뼈대에 다시 묶기
    }
    // 부위 노드(그룹째)를 기본 뼈대의 Armature 아래로 옮긴다 (이름이 'Casual_Head' 로 남아 디버깅하기 좋다)
    for (const n of nodes) { n.removeFromParent(); this.holder.add(n); }
    this.parts.set(slot, { file: outfit, nodes, meshes: picked });
    return picked;
  }

  detach(slot) {
    const p = this.parts.get(slot);
    if (!p) return;
    for (const m of p.meshes) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
    for (const n of p.nodes) n.removeFromParent();
    this.parts.delete(slot);
  }

  // 색: 피부·머리는 통째로 바꾸고(원본 선택 시 되돌림), 옷은 원본색 × 곱하기 색
  colorize(P) {
    const tints = { body: P.topColor, legs: P.legsColor, feet: P.feetColor, extras: P.topColor, head: '#ffffff' };
    const tint = new THREE.Color();
    for (const [slot, p] of this.parts) {
      tint.set(tints[slot] || '#ffffff');
      for (const m of p.meshes) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        const orig = mat.userData.orig;
        if (isSkinMat(mat)) mat.color.set(UM_SKIN_HEX[P.skin] || orig);
        else if (isHairMat(mat)) mat.color.set(UM_HAIR_HEX[P.hair] || orig);
        else if (isEyeMat(mat)) mat.color.copy(orig);
        else mat.color.copy(orig).multiply(tint);
      }
    }
  }

  /** params 대로 조립. 성별이 바뀌어 뼈대를 새로 만들었으면 true (호출자가 모델·클립을 교체) */
  async apply(params) {
    const P = umSanitize(params);
    const v = ++this.version;
    let rebuilt = false;
    if (!this.root || this.gender !== P.gender) {
      await this.loadBase(P.gender);
      rebuilt = true;
    }
    if (v !== this.version) return rebuilt;
    const want = { head: P.head, body: P.body, legs: P.legs, feet: P.feet, extras: P.extras === 'on' ? P.body : null };
    const jobs = [];
    for (const [slot, file] of Object.entries(want)) {
      if (this.parts.get(slot)?.file === file) continue;
      this.detach(slot);
      if (file) jobs.push(this.attach(slot, file));
    }
    await Promise.all(jobs);
    if (v !== this.version) return rebuilt;
    this.colorize(P);
    this.root.scale.setScalar(P.height || 1);
    return rebuilt;
  }

  dispose() {
    for (const slot of [...this.parts.keys()]) this.detach(slot);
    this.root?.removeFromParent();
    this.root = null;
  }
}
