import * as THREE from 'three';
import { asset } from './paths.js';
import { createKit, NATURE_SCALE } from './furniture.js';
import { TOWN } from './town.js';

// 집 밖: 잔디 땅, 울타리(마당), 나무·바위·풀. Kenney Nature Kit (CC0) 사용.
// 좌표는 집(침실 x -5~5, 거실 5~15, 사격장 15~27, 주방 z -13~-5)을 둘러싸게 잡는다.

export const GROUND = { minX: -90, maxX: 110, minZ: -90, maxZ: 110 };            // 땅 전체 (플레이어 이동 한계)
export const YARD = { id: 'yard', name: '마당', outdoor: true, minX: -10, maxX: 32.5, minZ: -17.5, maxZ: 22.5 }; // 울타리 안
export const WILD = { id: 'wild', name: '들판 (울타리 밖)', outdoor: true, ...GROUND };
export const GATE = { minX: 12.5, maxX: 15 };          // +z 쪽 울타리의 빈 칸 (문 x 12.5~13.5 와 같은 줄)
export const GATE_E = { minZ: 0, maxZ: 2.5 };          // +x 쪽 울타리의 빈 칸: 광장으로 가는 길 (33단계)
export const ANIMAL_ZONE = { minX: -6, maxX: 34, minZ: 26, maxZ: 52 }; // 동물이 돌아다니는 들판 (울타리 북쪽)

const FENCE_SEG = NATURE_SCALE;           // 울타리 한 칸 = 1 단위 × 배율 = 2.5m
const SINK = -0.05 * NATURE_SCALE + 0.003; // Nature Kit 모델은 바닥판이 y=-0.05 까지 내려가 있어 그만큼 땅에 묻는다

// 결정적 난수 (새로고침해도 같은 풍경). mulberry32
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {object} ctx
 * @param {THREE.Group} ctx.group
 * @param {THREE.Box3[]} ctx.colliders
 * @param {THREE.Object3D[]} ctx.shootables
 * @param {THREE.Object3D[]} ctx.wallMeshes 카메라가 뚫지 않을 메시 (땅)
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} ctx.house 집 전체 바닥 영역 (나무를 심지 않을 곳)
 */
export function buildOutdoor({ group, colliders, shootables, wallMeshes, house }) {
  const kit = createKit({ base: asset('models/nature/'), scale: NATURE_SCALE, group, colliders, shootables });

  // --- 땅 ---
  const gw = GROUND.maxX - GROUND.minX, gd = GROUND.maxZ - GROUND.minZ;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), new THREE.MeshStandardMaterial({ color: 0x7fb15a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((GROUND.minX + GROUND.maxX) / 2, -0.01, (GROUND.minZ + GROUND.maxZ) / 2); // 실내 바닥(0)보다 살짝 아래
  ground.receiveShadow = true;
  group.add(ground);
  wallMeshes.push(ground);
  shootables.push(ground);

  // --- 울타리: 네 변을 2.5m 칸으로 채우고, +z 변의 GATE 구간은 비운다. 충돌은 변마다 긴 상자 하나로 ---
  const Y = YARD, T = 0.3;
  const fenceBox = (x1, z1, x2, z2) => colliders.push(new THREE.Box3(new THREE.Vector3(Math.min(x1, x2) - T / 2, 0, Math.min(z1, z2) - T / 2), new THREE.Vector3(Math.max(x1, x2) + T / 2, 1.2, Math.max(z1, z2) + T / 2)));
  fenceBox(Y.minX, Y.minZ, Y.maxX, Y.minZ);
  fenceBox(Y.minX, Y.maxZ, GATE.minX, Y.maxZ);
  fenceBox(GATE.maxX, Y.maxZ, Y.maxX, Y.maxZ);
  fenceBox(Y.minX, Y.minZ, Y.minX, Y.maxZ);
  fenceBox(Y.maxX, Y.minZ, Y.maxX, GATE_E.minZ);
  fenceBox(Y.maxX, GATE_E.maxZ, Y.maxX, Y.maxZ);
  const fencePieces = [];
  const nx = Math.round((Y.maxX - Y.minX) / FENCE_SEG), nz = Math.round((Y.maxZ - Y.minZ) / FENCE_SEG);
  for (let i = 0; i < nx; i++) {
    const x = Y.minX + FENCE_SEG * (i + 0.5);
    fencePieces.push({ x, z: Y.minZ, rotY: 0 });
    if (x < GATE.minX || x > GATE.maxX) fencePieces.push({ x, z: Y.maxZ, rotY: 0 });
  }
  for (let j = 0; j < nz; j++) {
    const z = Y.minZ + FENCE_SEG * (j + 0.5);
    fencePieces.push({ x: Y.minX, z, rotY: Math.PI / 2 });
    if (z < GATE_E.minZ || z > GATE_E.maxZ) fencePieces.push({ x: Y.maxX, z, rotY: Math.PI / 2 });
  }
  // 울타리는 인스턴싱으로 한 번에 그린다 (충돌 상자는 위에서 따로 만들었다)
  const fenceReady = kit.scatter('fence_simple', fencePieces, { y: SINK, shadow: true }).then((meshes) => {
    for (const m of meshes) shootables.push(m); // InstancedMesh 도 Raycaster 가 지원한다
  });
  // 출입구 양쪽 기둥 역할로 울타리 모서리 조각을 세운다
  const postsReady = Promise.all([
    kit.place('fence_corner', GATE.minX - 0.05, Y.maxZ, { y: SINK, collide: false, rotY: 0 }),
    kit.place('fence_corner', GATE.maxX + 0.05, Y.maxZ, { y: SINK, collide: false, rotY: -Math.PI / 2 }),
    kit.place('fence_corner', Y.maxX, GATE_E.minZ - 0.05, { y: SINK, collide: false, rotY: Math.PI / 2 }),
    kit.place('fence_corner', Y.maxX, GATE_E.maxZ + 0.05, { y: SINK, collide: false, rotY: Math.PI }),
  ]);

  // --- 현관에서 출입구까지 돌길 ---
  const pathReady = kit.scatter('path_stone', [
    ...Array.from({ length: 7 }, (_, i) => ({ x: 13.4, z: 6.4 + i * 2.5, rotY: Math.PI / 2 })),
    ...Array.from({ length: 5 }, (_, i) => ({ x: Y.maxX + 1.25 + i * 2.5, z: (GATE_E.minZ + GATE_E.maxZ) / 2, rotY: 0 })), // 동쪽 문 → 광장
  ], { y: SINK + 0.004 });

  // --- 나무·바위·풀 흩뿌리기 (결정적 난수) ---
  const R = rng(20261023);
  const rnd = (a, b) => a + (b - a) * R();
  const inRect = (p, r, pad = 0) => p.x > r.minX - pad && p.x < r.maxX + pad && p.z > r.minZ - pad && p.z < r.maxZ + pad;
  const pathStrip = { minX: 11.5, maxX: 15.5, minZ: 5, maxZ: 26 };
  const taken = []; // 나무·바위끼리 겹치지 않게
  const decor = []; // 지도에 찍을 정적 장식 { x, z, kind } (34단계)
  const free = (p, minGap) => taken.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > minGap);
  // 영역 안에서 조건을 만족하는 점을 뽑는다 (실패하면 null)
  const pick = (area, { avoidHouse = true, gap = 2.5, tries = 30, keepOut = [] } = {}) => {
    for (let i = 0; i < tries; i++) {
      const p = { x: rnd(area.minX, area.maxX), z: rnd(area.minZ, area.maxZ) };
      if (avoidHouse && inRect(p, house, 1.5)) continue;
      if (inRect(p, pathStrip)) continue;
      if (keepOut.some((r) => inRect(p, r, 1))) continue;
      if (Math.abs(p.x - Y.minX) < 1 || Math.abs(p.x - Y.maxX) < 1 || Math.abs(p.z - Y.minZ) < 1 || Math.abs(p.z - Y.maxZ) < 1) continue; // 울타리 줄
      if (!free(p, gap)) continue;
      taken.push(p);
      return p;
    }
    return null;
  };

  const TREES = ['tree_default', 'tree_oak', 'tree_pineTallA', 'tree_pineRoundA', 'tree_detailed', 'tree_fat', 'tree_small', 'tree_default_fall'];
  const ROCKS = ['rock_largeA', 'rock_smallA', 'rock_tallB'];
  const jobs = [];
  const tree = (p, big = true) => decor.push({ x: p.x, z: p.z, kind: 'tree' }) && jobs.push(kit.place(TREES[Math.floor(R() * TREES.length)], p.x, p.z, {
    y: SINK, rotY: R() * Math.PI * 2, scale: NATURE_SCALE * rnd(big ? 0.9 : 0.7, big ? 1.3 : 1.0), footprint: [0.8, 0.8],
  }));
  const rock = (p) => decor.push({ x: p.x, z: p.z, kind: 'rock' }) && jobs.push(kit.place(ROCKS[Math.floor(R() * ROCKS.length)], p.x, p.z, { y: SINK, rotY: R() * Math.PI * 2, scale: NATURE_SCALE * rnd(0.8, 1.4) }));

  // 마당 안: 나무 조금, 바위 조금
  for (let i = 0; i < 7; i++) { const p = pick(Y, { gap: 4 }); if (p) tree(p, false); }
  for (let i = 0; i < 4; i++) { const p = pick(Y, { gap: 2 }); if (p) rock(p); }
  // 울타리 밖: 동물 들판은 듬성듬성, 나머지는 숲처럼
  const outer = { minX: GROUND.minX + 8, maxX: GROUND.maxX - 8, minZ: GROUND.minZ + 8, maxZ: GROUND.maxZ - 8 };
  const keep = [Y, TOWN]; // 마당과 광장(33단계)에는 숲을 심지 않는다
  for (let i = 0; i < 110; i++) { const p = pick(outer, { gap: 3.5, keepOut: [...keep, ANIMAL_ZONE] }); if (p) tree(p); }
  for (let i = 0; i < 8; i++) { const p = pick(ANIMAL_ZONE, { gap: 6 }); if (p) tree(p); }
  for (let i = 0; i < 18; i++) { const p = pick(outer, { gap: 2, keepOut: keep }); if (p) rock(p); }
  // 그루터기·통나무·버섯 (작은 장식, 충돌 없음)
  for (let i = 0; i < 6; i++) { const p = pick(outer, { gap: 1.5, keepOut: keep }); if (p) jobs.push(kit.place(i % 2 ? 'log' : 'stump_round', p.x, p.z, { y: SINK, rotY: R() * 6.28, collide: false })); }
  // 채집물: E 로 따면 숨겼다가 respawn 초 뒤 다시 보인다 (main.js 가 처리)
  const pickups = [];
  const pickup = (name, id, label, x, z, respawn, extra = {}) =>
    kit.place(name, x, z, { y: SINK, rotY: R() * 6.28, collide: false, shoot: false, ...extra })
      .then(({ obj }) => pickups.push({ obj, id, label, center: new THREE.Vector3(x, 1, z), respawn, timer: 0 }));
  for (let i = 0; i < 14; i++) { const p = pick(outer, { gap: 1, keepOut: keep, avoidHouse: true }); if (p) jobs.push(pickup('mushroom_red', 'mushroom', '버섯', p.x, p.z, 120)); }
  for (let i = 0; i < 4; i++) { const p = pick(ANIMAL_ZONE, { gap: 2 }); if (p) jobs.push(pickup('mushroom_red', 'mushroom', '버섯', p.x, p.z, 120)); }
  // 주방 뒤 텃밭 (호박)
  for (let i = 0; i < 4; i++) jobs.push(pickup('crop_pumpkin', 'pumpkin', '호박', 6.5 + i * 1.3, -15.2, 90, { scale: NATURE_SCALE * 0.8 }));
  // 마당 모닥불
  jobs.push(kit.place('campfire_logs', 2, 12, { y: SINK, collide: false }));

  // 풀·꽃은 인스턴싱: 수백 개라도 드로우 콜은 모델당 1개
  const spots = (n, area, keepOut) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = { x: rnd(area.minX, area.maxX), z: rnd(area.minZ, area.maxZ) };
      if (inRect(p, house, 0.5) || inRect(p, pathStrip) || keepOut.some((r) => inRect(p, r))) continue;
      out.push({ ...p, rotY: R() * Math.PI * 2, scale: NATURE_SCALE * rnd(0.7, 1.3) });
    }
    return out;
  };
  const near = { minX: -40, maxX: 62, minZ: -40, maxZ: 70 }; // 풀은 집 주변에만 (멀리는 어차피 안개에 가린다)
  jobs.push(kit.scatter('grass', spots(260, near, [TOWN]), { y: SINK }));
  jobs.push(kit.scatter('grass_large', spots(140, near, [TOWN]), { y: SINK }));
  jobs.push(kit.scatter('flower_redA', spots(60, near, [TOWN]), { y: SINK }));
  jobs.push(kit.scatter('flower_yellowA', spots(60, near, [TOWN]), { y: SINK }));
  jobs.push(kit.scatter('flower_purpleA', spots(50, near, [TOWN]), { y: SINK }));
  jobs.push(kit.scatter('plant_bush', spots(40, near, [Y, TOWN]), { y: SINK }));

  const ready = Promise.all([fenceReady, postsReady, pathReady, ...jobs]);
  return { ground, ready, pickups, decor };
}
