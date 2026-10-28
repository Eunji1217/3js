import * as THREE from 'three';
import { asset } from './paths.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Door } from './door.js';
import { RANGE_ROOM, buildRange } from './range.js';
import { createKit, KENNEY_SCALE } from './furniture.js';
import { buildOutdoor, YARD, WILD, GROUND } from './outdoor.js';
import { createAnimals } from './animals.js';
import { buildTown, TOWN } from './town.js';

export const WALL_H = 3;     // 천장 높이
const T = 0.16;              // 벽 두께

// 실내 방 정의. 침실-거실은 x=5 벽, 거실-사격장은 x=15 벽을 공유하고 각 벽의 z=-0.5~0.5 에 문이 있다.
// 주방은 거실 아래(-z)에 붙고 z=-5 벽의 x=6~7 에 문, 현관문은 거실 z=5 벽의 x=12.5~13.5 에 있다.
export const ROOMS = [
  { id: 'bedroom', name: '침실', minX: -5, maxX: 5, minZ: -5, maxZ: 5, floor: 0xd9d2c5, wall: 0xf2f0ea },
  { id: 'living', name: '거실', minX: 5, maxX: 15, minZ: -5, maxZ: 5, floor: 0xc9b99a, wall: 0xeae6dc },
  { id: 'kitchen', name: '주방', minX: 5, maxX: 13, minZ: -13, maxZ: -5, floor: 0xd8dcd2, wall: 0xeef0e8 },
  RANGE_ROOM,
];
// 집 전체 바닥 영역 (밖에 나무를 심지 않을 곳)
const HOUSE = {
  minX: Math.min(...ROOMS.map((r) => r.minX)), maxX: Math.max(...ROOMS.map((r) => r.maxX)),
  minZ: Math.min(...ROOMS.map((r) => r.minZ)), maxZ: Math.max(...ROOMS.map((r) => r.maxZ)),
};

export function createWorld() {
  const group = new THREE.Group();
  const colliders = [];  // 정적 충돌 상자 (Box3)
  const wallMeshes = []; // 카메라가 통과하면 안 되는 메시
  const shootables = []; // 총알이 맞을 수 있는 메시 (벽, 가구, 표적, 나무, 동물)
  const doors = [];

  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });

  // --- 바닥 / 천장 / 지붕 ---
  const roofMat = std(0x8c5a4a, { roughness: 0.8 });
  for (const r of ROOMS) {
    const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
    const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), std(r.floor));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    group.add(floor);

    const grid = new THREE.GridHelper(w, w, 0xbbb3a6, 0xcfc8bb);
    grid.position.set(cx, 0.002, cz);
    group.add(grid);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), std(0xffffff, { side: THREE.BackSide }));
    ceil.rotation.x = -Math.PI / 2;
    ceil.position.set(cx, WALL_H, cz);
    group.add(ceil);
    // 밖에서 보일 지붕 (천장은 BackSide 라 위에서는 안 보인다)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.25, d + 0.4), roofMat);
    roof.position.set(cx, WALL_H + 0.03 + 0.125, cz); // 아랫면을 천장(y=3)보다 3cm 위에: 같은 높이면 z-fighting 으로 천장이 깜빡인다
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
    wallMeshes.push(floor, ceil);
    shootables.push(floor, ceil, roof);
  }

  // --- 벽 (축 정렬 선분을 두께 T 의 박스로) ---
  const wall = (x1, z1, x2, z2, color, { y0 = 0, y1 = WALL_H, collide = true } = {}) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const alongX = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? len : T, y1 - y0, alongX ? T : len),
      std(color, { roughness: 1 }),
    );
    m.position.set((x1 + x2) / 2, (y0 + y1) / 2, (z1 + z2) / 2);
    m.receiveShadow = true;
    m.castShadow = true;
    group.add(m);
    wallMeshes.push(m);
    shootables.push(m);
    if (collide) colliders.push(new THREE.Box3().setFromObject(m));
    return m;
  };
  const [bed, liv, kit, rng] = ROOMS;
  // 침실
  wall(bed.minX, bed.minZ, bed.maxX, bed.minZ, bed.wall);
  wall(bed.minX, bed.maxZ, bed.maxX, bed.maxZ, bed.wall);
  wall(bed.minX, bed.minZ, bed.minX, bed.maxZ, bed.wall);
  // 주방 (거실과 z=-5 벽을 공유)
  wall(kit.minX, kit.minZ, kit.maxX, kit.minZ, kit.wall);
  wall(kit.minX, kit.minZ, kit.minX, kit.maxZ, kit.wall);
  wall(kit.maxX, kit.minZ, kit.maxX, kit.maxZ, kit.wall);
  // 사격장
  wall(rng.minX, rng.minZ, rng.maxX, rng.minZ, rng.wall);
  wall(rng.minX, rng.maxZ, rng.maxX, rng.maxZ, rng.wall);
  wall(rng.maxX, rng.minZ, rng.maxX, rng.maxZ, rng.wall);

  // 벽에 문을 낸다: 문 폭만큼 비우고 상인방·문틀·문을 세운다
  const DOOR_W = 1.0, DOOR_H = 2.1;
  const frameMat = std(0x5a4030, { roughness: 0.7 });
  const post = (x, z, alongX) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.08 : T + 0.04, DOOR_H + 0.04, alongX ? T + 0.04 : 0.08), frameMat);
    p.position.set(x, (DOOR_H + 0.04) / 2, z);
    group.add(p);
  };
  const registerDoor = (door) => {
    group.add(door.group);
    doors.push(door);
    wallMeshes.push(door.panel);
    shootables.push(door.panel);
    return door;
  };
  // x=일정한 벽 (z 방향으로 뻗음)
  const doorwayZ = (x, minZ, maxZ, doorZ, color, label) => {
    wall(x, minZ, x, doorZ, color);
    wall(x, doorZ + DOOR_W, x, maxZ, color);
    wall(x, doorZ, x, doorZ + DOOR_W, color, { y0: DOOR_H, collide: false }); // 문 위 상인방
    post(x, doorZ - 0.04, false);
    post(x, doorZ + DOOR_W + 0.04, false);
    return registerDoor(new Door({ x, z: doorZ, width: DOOR_W, height: DOOR_H, label }));
  };
  // z=일정한 벽 (x 방향으로 뻗음)
  const doorwayX = (z, minX, maxX, doorX, color, label) => {
    wall(minX, z, doorX, z, color);
    wall(doorX + DOOR_W, z, maxX, z, color);
    wall(doorX, z, doorX + DOOR_W, z, color, { y0: DOOR_H, collide: false });
    post(doorX - 0.04, z, true);
    post(doorX + DOOR_W + 0.04, z, true);
    return registerDoor(new Door({ x: doorX, z, width: DOOR_W, height: DOOR_H, label, along: 'x' }));
  };
  doorwayZ(5, bed.minZ, bed.maxZ, -0.5, 0xeeeae2, '거실 문');
  doorwayZ(15, liv.minZ, liv.maxZ, -0.5, 0xdcdcd4, '사격장 문');
  doorwayX(-5, liv.minX, liv.maxX, 6, 0xeae6dc, '주방 문');   // 거실 아래 벽 (x 13~15 구간은 바깥 벽)
  const frontDoor = doorwayX(5, liv.minX, liv.maxX, 12.5, 0xeae6dc, '현관문'); // 거실 위 벽 → 마당

  // --- 가구 ---
  const box = (sx, sy, sz, x, z, color, { y = sy / 2, collide = true, roughness = 0.7 } = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), std(color, { roughness }));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    shootables.push(m);
    if (collide) colliders.push(new THREE.Box3().setFromObject(m));
    return m;
  };

  // 침실·거실·주방 가구: Kenney Furniture Kit 모델 (21단계). 네트워크에서 오므로 비동기로 놓고,
  // 충돌 상자·피격 메시는 place() 가 도착하는 대로 colliders / shootables 에 밀어 넣는다
  // (둘 다 매 프레임 배열을 다시 읽으므로 늦게 추가돼도 바로 반영된다).
  const furniture = createKit({ base: asset('models/kenney/'), scale: KENNEY_SCALE, group, colliders, shootables });
  const stove = { center: new THREE.Vector3(9.2, 1, -12.0), label: '가스레인지' }; // 요리 상호작용 기준점
  const furnitureReady = (async () => {
    const P = furniture.place;
    const H = Math.PI / 2;
    // 침실 (모델은 rotY=0 일 때 앞면이 +z 를 본다)
    const desk = await P('desk', -2.5, -3.6);                                 // 책상 (등이 -z 벽)
    await P('laptop', -2.5, -3.6, { y: desk.box.max.y, rotY: 0.15, collide: false });
    await P('chairDesk', -2.5, -2.5);                                        // 의자 (책상을 향해 -z 를 봄)
    await P('books', -1.9, -3.7, { y: desk.box.max.y, rotY: 0.4, collide: false });
    const bed = await P('bedDouble', 3.5, 3.6, { rotY: Math.PI });           // 침대 (머리판이 +z 벽)
    const mattress = bed.box.min.y + 0.25 * KENNEY_SCALE;                    // 매트리스 윗면 (프레임보다 낮다)
    await P('pillow', 3.2, bed.box.max.z - 0.35, { y: mattress, collide: false });
    await P('pillow', 3.8, bed.box.max.z - 0.35, { y: mattress, collide: false });
    await P('bookcaseOpen', 4.64, -2.5, { rotY: -H });                       // 책장 (등이 +x 벽)
    await P('cardboardBoxClosed', 0.0, 3.5, { rotY: 0.3 });                  // 상자
    // 거실
    await P('rugRectangle', 10, 0.8, { y: 0.004, collide: false });          // 러그
    await P('loungeSofa', 10, 2.4, { rotY: Math.PI });                       // 소파 (TV 쪽 -z 를 봄)
    await P('tableCoffee', 10, 0.6);                                         // 커피 테이블
    const tv = await P('cabinetTelevision', 10, -4.64);                      // TV 장 (등이 -z 벽)
    await P('televisionModern', 10, -4.64, { y: tv.box.max.y, collide: false });
    await P('sideTable', 13.5, -4.6, { rotY: Math.PI });                     // 사이드 테이블
    await P('lampRoundFloor', 14.5, -3.6);                                   // 스탠드
    await P('pottedPlant', 8.0, 4.6);                                        // 화분 (현관문 옆)
    // 주방: 아래 벽(z=-13)을 따라 싱크대, 오른쪽 벽(x=13)에 수납장. 주방 모듈은 2.0 배 (한 칸 0.86m)
    const K = 2.0, cz = kit.minZ + T / 2 + 0.45 * K / 2; // 벽에 붙인 모듈의 중심 z
    const row = ['kitchenFridge', 'kitchenCabinet', 'kitchenSink', 'kitchenCabinetDrawer', 'kitchenStove', 'kitchenCabinet', 'kitchenCabinet'];
    let counterTop = 0.9;
    for (let i = 0; i < row.length; i++) {
      const x = 5.6 + i * 0.43 * K;
      const r = await P(row[i], x, row[i] === 'kitchenFridge' ? kit.minZ + T / 2 + 0.29 * K / 2 : cz, { scale: K });
      if (row[i] === 'kitchenCabinet') counterTop = r.box.max.y;
      if (row[i] === 'kitchenStove') stove.center.set(x, 1, cz + 0.6);
    }
    const stoveX = 5.6 + 4 * 0.43 * K;
    // 상부장·후드 (벽에 띄워서)
    const upperZ = kit.minZ + T / 2 + 0.22 * K / 2;
    await P('kitchenCabinetUpper', 5.6 + 1 * 0.43 * K, upperZ, { scale: K, y: 1.5, collide: false });
    await P('kitchenCabinetUpperDouble', 5.6 + 2.5 * 0.43 * K, upperZ, { scale: K, y: 1.5, collide: false });
    await P('hoodModern', stoveX, kit.minZ + T / 2 + 0.28 * K / 2, { scale: K, y: 1.55, collide: false });
    await P('kitchenCabinetUpper', 5.6 + 6 * 0.43 * K, upperZ, { scale: K, y: 1.5, collide: false });
    // 조리대 위 소품
    await P('kitchenBlender', 5.6 + 1 * 0.43 * K, cz, { scale: K, y: counterTop, collide: false });
    await P('toaster', 5.6 + 3 * 0.43 * K, cz, { scale: K, y: counterTop, collide: false });
    await P('kitchenCoffeeMachine', 5.6 + 5 * 0.43 * K, cz, { scale: K, y: counterTop, collide: false });
    await P('kitchenMicrowave', 5.6 + 6 * 0.43 * K, cz, { scale: K, y: counterTop, collide: false });
    // 오른쪽 벽 수납장 (앞면이 -x 를 보게)
    for (let i = 0; i < 2; i++) await P('kitchenCabinet', kit.maxX - T / 2 - 0.45 * K / 2, -11.6 + i * 0.43 * K, { scale: K, rotY: -H });
    await P('trashcan', kit.maxX - 0.4, -6.0, { scale: K });
    // 식탁 + 의자 4개 (의자는 rotY=0 일 때 -z 를 본다)
    const table = await P('tableCross', 8.6, -8.3);
    await P('chairCushion', 8.0, table.box.max.z + 0.35, { rotY: 0 });
    await P('chairCushion', 9.2, table.box.max.z + 0.35, { rotY: 0 });
    await P('chairCushion', 8.0, table.box.min.z - 0.35, { rotY: Math.PI });
    await P('chairCushion', 9.2, table.box.min.z - 0.35, { rotY: Math.PI });
  })();

  // 사격장 (표적, 사대, 무기 선반 등)
  const range = buildRange({ group, std, box, shootables });

  // --- 집 밖: 땅, 울타리, 나무 (22단계) / 동물 (23단계) ---
  const outdoor = buildOutdoor({ group, colliders, shootables, wallMeshes, house: HOUSE });
  const animals = createAnimals({ group, shootables });
  const town = buildTown({ group, colliders, shootables }); // 광장 (33단계)
  const bedSpot = { center: new THREE.Vector3(3.5, 1, 3.6), label: '침대' }; // 잠자기 상호작용 기준점 (31단계)

  // --- 거울 (침실 왼쪽 벽) ---
  const mirror = new Reflector(new THREE.PlaneGeometry(1.6, 2.2), {
    clipBias: 0.003,
    textureWidth: window.innerWidth * window.devicePixelRatio,
    textureHeight: window.innerHeight * window.devicePixelRatio,
    color: 0xc1cbd7,
    multisample: 0, // 일부 환경에서 MSAA 렌더타깃이 검게 나오는 문제 방지
  });
  // 테두리(두께 0.04)를 벽 안쪽 면에 붙이고, 거울은 테두리 앞면보다 살짝 앞에 둔다 (테두리가 거울을 가리지 않게)
  const innerX = bed.minX + T / 2;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.3, 1.7), std(0x333333));
  frame.position.set(innerX + 0.02, 1.3, 2.0);
  group.add(frame);
  mirror.position.set(innerX + 0.045, 1.3, 2.0);
  mirror.rotation.y = Math.PI / 2;
  group.add(mirror);

  // --- 조명 ---
  const hemi = new THREE.HemisphereLight(0xffffff, 0xcfc8bb, 1.1);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(14, 6, 2);
  sun.target.position.set(11, 0, 0);
  group.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 60;
  // 그림자 카메라는 플레이어 주변 ±22m 만 덮고, 매 프레임 플레이어를 따라간다 (update). 밖이 넓어도 해상도가 유지된다
  sun.shadow.camera.left = -22;
  sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.bias = -0.0005;
  group.add(sun);
  for (const r of ROOMS) {
    const lamp = new THREE.PointLight(0xfff1dd, 5, 9, 2);
    lamp.position.set((r.minX + r.maxX) / 2, WALL_H - 0.3, (r.minZ + r.maxZ) / 2);
    group.add(lamp);
  }

  // 전체 영역 (플레이어·카메라 안전 범위) = 땅 전체
  const bounds = { ...GROUND };

  // 실내 방 → 마당 → 들판 순으로 찾는다 (마당 영역이 집을 포함하므로 실내를 먼저 본다)
  const inArea = (a, x, z) => x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ;
  const roomAt = (x, z) =>
    ROOMS.find((r) => x >= r.minX && x < r.maxX && z >= r.minZ && z <= r.maxZ) ||
    (inArea(YARD, x, z) ? YARD : inArea(TOWN, x, z) ? TOWN : WILD);
  const ceilingAt = (x, z) => (roomAt(x, z).outdoor ? 60 : WALL_H);

  // 정적 + 문 충돌 상자
  const allColliders = () => colliders.concat(doors.map((d) => d.collider));

  // 매 프레임: 동물·고기 움직임, 상인 애니메이션. 해(그림자 카메라)는 daynight.js 가 플레이어를 따라 옮긴다 (30단계)
  // playerSafe: 플레이어가 실내에 있으면 쫓아오던 동물이 포기한다
  const update = (dt, playerPos, playerSafe = false) => {
    animals.update(dt, playerPos, playerSafe);
    town.update(dt);
  };

  return {
    group, colliders, allColliders, wallMeshes, shootables, doors, frontDoor, rooms: ROOMS, bounds, height: WALL_H,
    roomAt, ceilingAt, mirror, range, furnitureReady, outdoor, animals, stove, bedSpot, town, update,
    lights: { sun, hemi, lamps: town.lights },
  };
}
