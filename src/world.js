import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Door } from './door.js';

export const WALL_H = 3;     // 천장 높이
const T = 0.16;              // 벽 두께

// 방 정의. 같은 x=5 벽을 공유하고, 그 벽의 z=-0.5~0.5 에 문이 있다.
export const ROOMS = [
  { id: 'bedroom', name: '침실', minX: -5, maxX: 5, minZ: -5, maxZ: 5, floor: 0xd9d2c5, wall: 0xf2f0ea },
  { id: 'living', name: '거실', minX: 5, maxX: 15, minZ: -5, maxZ: 5, floor: 0xc9b99a, wall: 0xeae6dc },
];

export function createWorld() {
  const group = new THREE.Group();
  const colliders = [];  // 정적 충돌 상자 (Box3)
  const wallMeshes = []; // 카메라가 통과하면 안 되는 메시
  const doors = [];

  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });

  // --- 바닥 / 천장 ---
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
    wallMeshes.push(floor, ceil);
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
    if (collide) colliders.push(new THREE.Box3().setFromObject(m));
    return m;
  };
  const [bed, liv] = ROOMS;
  // 침실
  wall(bed.minX, bed.minZ, bed.maxX, bed.minZ, bed.wall);
  wall(bed.minX, bed.maxZ, bed.maxX, bed.maxZ, bed.wall);
  wall(bed.minX, bed.minZ, bed.minX, bed.maxZ, bed.wall);
  // 거실
  wall(liv.minX, liv.minZ, liv.maxX, liv.minZ, liv.wall);
  wall(liv.minX, liv.maxZ, liv.maxX, liv.maxZ, liv.wall);
  wall(liv.maxX, liv.minZ, liv.maxX, liv.maxZ, liv.wall);
  // 공유 벽 (x=5) — 문 자리 z=-0.5~0.5 를 비워 둔다
  const DOOR_W = 1.0, DOOR_H = 2.1, DOOR_Z = -0.5;
  wall(5, bed.minZ, 5, DOOR_Z, 0xeeeae2);
  wall(5, DOOR_Z + DOOR_W, 5, bed.maxZ, 0xeeeae2);
  wall(5, DOOR_Z, 5, DOOR_Z + DOOR_W, 0xeeeae2, { y0: DOOR_H, collide: false }); // 문 위 상인방
  // 문틀
  const frameMat = std(0x5a4030, { roughness: 0.7 });
  for (const z of [DOOR_Z - 0.04, DOOR_Z + DOOR_W + 0.04]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(T + 0.04, DOOR_H + 0.04, 0.08), frameMat);
    post.position.set(5, (DOOR_H + 0.04) / 2, z);
    group.add(post);
  }

  // --- 문 ---
  const door = new Door({ x: 5, z: DOOR_Z, width: DOOR_W, height: DOOR_H, label: '거실 문' });
  group.add(door.group);
  doors.push(door);
  wallMeshes.push(door.panel);

  // --- 가구 ---
  const box = (sx, sy, sz, x, z, color, { y = sy / 2, collide = true, roughness = 0.7 } = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), std(color, { roughness }));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    if (collide) colliders.push(new THREE.Box3().setFromObject(m));
    return m;
  };

  // 침실
  box(2.0, 0.75, 1.0, -2.5, -3.0, 0x8b6b4a);  // 책상
  box(0.5, 0.45, 0.5, -2.5, -1.9, 0x5f7f9f);  // 의자
  box(1.6, 0.5, 2.2, 3.5, 2.5, 0x9fb7c9);     // 침대
  box(1.4, 0.25, 0.7, 3.5, 1.9, 0xf4f1ea, { y: 0.6, collide: false }); // 베개
  box(0.4, 1.8, 1.6, 4.7, -2.5, 0x7a5c3f);    // 책장
  box(0.6, 0.6, 0.6, 0.0, 3.5, 0xb55d5d);     // 상자

  // 거실
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), std(0xa65b5b, { roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(10, 0.004, 0.5);
  rug.receiveShadow = true;
  group.add(rug);
  box(2.4, 0.45, 0.9, 10, 2.2, 0x6b7f93);                     // 소파 좌석
  box(2.4, 0.5, 0.25, 10, 2.55, 0x5d7085, { y: 0.7, collide: false }); // 소파 등받이
  box(0.25, 0.3, 0.9, 8.68, 2.2, 0x5d7085, { y: 0.6, collide: false }); // 팔걸이
  box(0.25, 0.3, 0.9, 11.32, 2.2, 0x5d7085, { y: 0.6, collide: false });
  box(1.2, 0.4, 0.6, 10, 0.5, 0x8b6b4a);                      // 커피 테이블
  box(1.8, 0.5, 0.45, 10, -4.5, 0x3b3b3b);                    // TV 장
  box(1.6, 0.9, 0.06, 10, -4.5, 0x111111, { y: 0.95, collide: false, roughness: 0.3 }); // TV
  box(0.5, 0.5, 0.5, 13.5, -3.5, 0x7a5c3f);                   // 사이드 테이블
  box(0.12, 1.5, 0.12, 13.5, -3.5, 0x444444, { y: 1.25, collide: false }); // 스탠드 기둥
  box(0.5, 0.35, 0.5, 13.5, -3.5, 0xf6e7c1, { y: 2.1, collide: false });   // 스탠드 갓
  box(0.8, 1.6, 0.4, 13.0, 4.6, 0x4f6b4f);                    // 화분/장식장

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
  group.add(new THREE.HemisphereLight(0xffffff, 0xcfc8bb, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(8, 6, 2);
  sun.target.position.set(5, 0, 0);
  group.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 25;
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.bias = -0.0005;
  group.add(sun);
  for (const r of ROOMS) {
    const lamp = new THREE.PointLight(0xfff1dd, 5, 9, 2);
    lamp.position.set((r.minX + r.maxX) / 2, WALL_H - 0.3, (r.minZ + r.maxZ) / 2);
    group.add(lamp);
  }

  // 전체 영역 (카메라 안전 범위)
  const bounds = {
    minX: Math.min(...ROOMS.map((r) => r.minX)),
    maxX: Math.max(...ROOMS.map((r) => r.maxX)),
    minZ: Math.min(...ROOMS.map((r) => r.minZ)),
    maxZ: Math.max(...ROOMS.map((r) => r.maxZ)),
  };

  const roomAt = (x, z) =>
    ROOMS.find((r) => x >= r.minX && x < r.maxX && z >= r.minZ && z <= r.maxZ) || ROOMS[0];

  // 정적 + 문 충돌 상자
  const allColliders = () => colliders.concat(doors.map((d) => d.collider));

  return { group, colliders, allColliders, wallMeshes, doors, rooms: ROOMS, bounds, height: WALL_H, roomAt, mirror };
}
