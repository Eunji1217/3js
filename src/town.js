import * as THREE from 'three';
import { asset } from './paths.js';
import { createKit } from './furniture.js';
import { UMCharacter, UM_DEFAULT } from './umchar.js';
import { ITEMS, hasTag } from './items.js';

// 광장 (33단계): 마당 동쪽 울타리 문 밖. Kenney Fantasy Town Kit (CC0) 로 돌길·분수·노점·집을 세우고,
// Food Kit (CC0) 음식을 노점에 진열하고, Quaternius 의상(26단계)을 입힌 상인 NPC 를 세운다.
// 상인 앞에서 E 를 누르면 사고파는 창이 열린다 (ui.openShop).

export const TOWN_SCALE = 2.4; // 키트 1단위(벽 한 장) = 2.4m. 캐릭터(1.8m)와 맞는 집 높이
export const TOWN = { id: 'town', name: '광장', outdoor: true, minX: 39, maxX: 67, minZ: -15, maxZ: 17 };
export const VENDOR_DIST = 2.8; // 노점 앞에서 상호작용할 수 있는 거리
const C = { x: 52, z: 2 };      // 분수 중심
const U = TOWN_SCALE;
// 지도(34단계)가 그릴 광장 윤곽. 3D 배치와 같은 숫자를 쓴다
export const TOWN_LAYOUT = {
  square: { minX: C.x - 3.5 * U, maxX: C.x + 3.5 * U, minZ: C.z - 3.5 * U, maxZ: C.z + 3.5 * U },
  fountain: { x: C.x, z: C.z, r: 2.4 },
  stalls: [{ x: 46, z: 11.5, color: '#c93b3b' }, { x: 52, z: 11.5, color: '#3f9a4a' }, { x: 58, z: 11.5, color: '#c93b3b' }],
  houses: [{ x: 44.5, z: -8, half: U }, { x: 59.5, z: -8, half: U }],
};

// --- 가격표 ---
// 재료는 표대로, 요리는 포만감 × 5 + 5. 사는 값은 파는 값의 약 2배 (상인이 남겨야 하니까)
export const SELL_PRICE = { beef: 6, pork: 5, boar: 7, venison: 7, rabbit: 3, foxmeat: 3, chicken: 4, egg: 2, bone: 2, fat: 2, pumpkin: 3, mushroom: 2 };
export const priceOf = (id) => { const it = ITEMS[id]; if (!it) return 0; return it.sate ? it.sate * 5 + 5 : SELL_PRICE[id] || 1; };
export const AMMO_PACKS = [
  { ammo: 'pistol', name: '권총 탄약', n: 12, price: 10, icon: '🔫' },
  { ammo: 'rifle', name: '소총 탄약', n: 30, price: 25, icon: '🔫' },
  { ammo: 'shotgun', name: '산탄', n: 6, price: 15, icon: '🔫' },
  { ammo: 'sniper', name: '저격 탄약', n: 5, price: 30, icon: '🔫' },
];
export const VENDORS = [
  { id: 'butcher', name: '정육점', greet: '고기와 요리를 삽니다', x: 46, z: 11.5, stall: 'stall-red', gender: 'male', outfit: 'Worker',
    buys: (id) => hasTag(id, 'meat') || hasTag(id, 'dish'), sells: [], display: ['meat-raw', 'meat-ribs', 'sausage'] },
  { id: 'general', name: '잡화점', greet: '탄약을 팝니다 · 뼈·비계는 삽니다', x: 52, z: 11.5, stall: 'stall-green', gender: 'female', outfit: 'Medieval',
    buys: (id) => id === 'bone' || id === 'fat', sells: AMMO_PACKS, display: ['barrel', 'bag', 'bread'] },
  { id: 'grocer', name: '농산물 가게', greet: '달걀·호박·버섯을 사고팝니다', x: 58, z: 11.5, stall: 'stall-red', gender: 'male', outfit: 'Farmer',
    buys: (id) => ['egg', 'pumpkin', 'mushroom'].includes(id), sells: [{ item: 'egg', price: 4 }, { item: 'pumpkin', price: 6 }, { item: 'mushroom', price: 4 }], display: ['pumpkin', 'egg', 'mushroom', 'carrot'] },
];

/**
 * @param {object} ctx
 * @param {THREE.Group} ctx.group
 * @param {THREE.Box3[]} ctx.colliders
 * @param {THREE.Object3D[]} ctx.shootables
 */
export function buildTown({ group, colliders, shootables }) {
  const kit = createKit({ base: asset('models/town/'), scale: U, group, colliders, shootables });
  const food = createKit({ base: asset('models/food/'), scale: 1.3, group, colliders: [], shootables: [] });
  const jobs = [];
  const lights = [];
  const vendors = VENDORS.map((v) => ({ ...v, center: new THREE.Vector3(v.x, 1, v.z), npc: null }));

  // --- 돌바닥: 7×7 타일을 인스턴싱 한 번으로 ---
  const tiles = [];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) tiles.push({ x: C.x + i * U, z: C.z + j * U });
  jobs.push(kit.scatter('road', tiles, { y: -0.03 }));
  // 분수 (가운데, 충돌 있음)
  jobs.push(kit.place('fountain-round-detail', C.x, C.z));

  // --- 노점 셋 (+z 쪽, 분수를 보고) + 진열 음식 + 상인 ---
  for (const v of vendors) {
    jobs.push(kit.place(v.stall, v.x, v.z, { rotY: Math.PI }));
    v.display.forEach((name, i) => jobs.push(food.place(name, v.x + (i - (v.display.length - 1) / 2) * 0.55, v.z - 0.25, { y: 1.0, rotY: i * 0.7, collide: false })));
    jobs.push(makeNpc(v));
  }
  // 노점 옆 소품
  jobs.push(kit.place('cart', 42.5, 12.5, { rotY: 0.4 }));
  jobs.push(kit.place('stall-bench', 49, 13.8, { rotY: Math.PI / 2, collide: false }));
  jobs.push(kit.place('stall-bench', 55, 13.8, { rotY: Math.PI / 2, collide: false }));
  jobs.push(food.place('barrel', 61.5, 13.5, { scale: 1.6 }));
  jobs.push(food.place('barrel', 62.3, 12.6, { scale: 1.6, rotY: 0.8 }));

  // --- 집 두 채 (-z 쪽): 2×2 칸, 2층 벽 + 피라미드 지붕 하나를 2배로 키워 덮는다 ---
  const house = (cx, cz) => {
    const wallAt = (name, x, z, rotY, floor) => jobs.push(kit.place(name, x, z, { rotY, y: floor * U }));
    for (let f = 0; f < 2; f++) {
      for (const j of [-0.5, 0.5]) {
        wallAt(f ? 'wall-window-glass' : 'wall-wood', cx - U, cz + j * U, 0, f);           // 서쪽 벽 (z 방향으로 놓임)
        wallAt(f ? 'wall-window-glass' : 'wall', cx + U, cz + j * U, 0, f);                 // 동쪽 벽
      }
      for (const i of [-0.5, 0.5]) {
        wallAt(f ? 'wall-window-shutters' : 'wall', cx + i * U, cz - U, Math.PI / 2, f);    // 뒤쪽 벽 (x 방향)
        wallAt(f ? 'wall-window-glass' : i < 0 ? 'wall-door' : 'wall-window-shutters', cx + i * U, cz + U, Math.PI / 2, f); // 앞쪽: 1층 왼쪽이 문
      }
    }
    jobs.push(kit.place('roof-point', cx, cz, { scale: U * 2, y: 2 * U, collide: false }));
  };
  house(44.5, -8);
  house(59.5, -8);
  jobs.push(kit.place('wall-wood-door', 52, -9.5, { rotY: Math.PI / 2 })); // 두 집 사이 창고 벽 한 장 (장식)

  // --- 가로등 (밤에 켜진다) ---
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
    const x = C.x + dx * U, z = C.z + dz * U;
    jobs.push(kit.place('lantern', x, z, { collide: false }));
    const l = new THREE.PointLight(0xffc070, 0, 14, 2);
    l.position.set(x, 3.2, z);
    group.add(l);
    lights.push(l);
  }

  // --- 나무·울타리 장식 ---
  for (const [x, z] of [[41, -2], [41, 6], [63.5, -2], [63.5, 6], [42, 15], [62.5, 16]]) jobs.push(kit.place('tree-high', x, z, { footprint: [0.8, 0.8] }));
  for (let i = 0; i < 4; i++) jobs.push(kit.place('hedge', 65.5, -5 + i * U, { rotY: 0, collide: false }));
  for (let i = 0; i < 4; i++) jobs.push(kit.place('hedge', 65.5, 3 + i * U, { rotY: 0, collide: false }));

  // 상인: Quaternius 얼티밋 모듈러 의상을 입힌 NPC. 제자리에서 Idle 만 재생한다
  async function makeNpc(v) {
    const qc = new UMCharacter();
    const params = { ...UM_DEFAULT, gender: v.gender, head: v.outfit, body: v.outfit, legs: v.outfit, feet: v.outfit };
    const [, clips] = await Promise.all([qc.apply(params), UMCharacter.loadClips(v.gender)]);
    const root = qc.root;
    root.updateMatrixWorld(true);
    const arm = qc.bone('UpperArmL');
    root.rotation.y = arm && arm.getWorldPosition(new THREE.Vector3()).x >= 0 ? 0 : Math.PI; // +Z 를 보게 (player.installQChar 와 같은 판정)
    const g = new THREE.Group();
    g.add(root);
    g.position.set(v.x, 0, v.z + 1.15); // 노점 뒤
    g.rotation.y = Math.PI;             // 광장(-z) 쪽을 본다
    group.add(g);
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(clips.idle).play();
    v.npc = { group: g, mixer, qc };
  }

  const update = (dt) => { for (const v of vendors) v.npc?.mixer.update(dt); };
  return { ready: Promise.all(jobs), vendors, lights, update };
}
