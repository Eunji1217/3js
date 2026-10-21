import * as THREE from 'three';
import { buildWeaponModel, WEAPONS } from './weapons.js';
import { playDing } from './audio.js';

// 실내 사격장 방. 거실(x 5~15) 오른쪽에 붙는다. 사대는 x≈18.6, 표적은 x≈25.6 (약 7m 거리)
export const RANGE_ROOM = { id: 'range', name: '사격장', minX: 15, maxX: 27, minZ: -5, maxZ: 5, floor: 0x8f8f8c, wall: 0xd6d6cf };

const LANES = [-3, 0, 3];
const TARGET_X = 25.6;
const TARGET_R = 0.3;   // 표적판 반지름 (0.6m 판)
const DOWN_TIME = 1.4;  // 맞은 뒤 넘어져 있는 시간

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// 10점 과녁: 바깥 6개 링은 흰 바탕, 안쪽 4개 링은 검은 바탕, 중심은 빨강
function ringTexture() {
  return canvasTexture(512, 512, (ctx, w) => {
    const c = w / 2, step = c / 10;
    ctx.fillStyle = '#f4f2ea';
    ctx.fillRect(0, 0, w, w);
    for (let k = 10; k >= 1; k--) {
      ctx.beginPath();
      ctx.arc(c, c, step * k, 0, Math.PI * 2);
      ctx.fillStyle = k === 1 ? '#d23c3c' : k <= 4 ? '#161616' : '#f4f2ea';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = k <= 4 ? '#ddd' : '#222';
      ctx.stroke();
      if (k >= 5 && k < 10) {
        ctx.fillStyle = '#222';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(11 - k), c, c - step * k + step / 2);
      }
    }
  });
}

function textTexture(text, { bg = '#1c1c1c', fg = '#ffd25a', font = 'bold 110px sans-serif' } = {}, w = 1024, h = 256) {
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 6);
  });
}

/**
 * @param {object} ctx createWorld 가 넘기는 헬퍼들
 * @param {THREE.Group} ctx.group
 * @param {Function} ctx.std 표준 재질 생성
 * @param {Function} ctx.box 가구 상자 생성 (충돌/피격 목록 등록 포함)
 * @param {THREE.Object3D[]} ctx.shootables 총알이 맞을 수 있는 메시 목록
 */
export function buildRange({ group, std, box, shootables }) {
  const R = RANGE_ROOM;
  const targets = [];

  // --- 사선 (노란 줄) ---
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, R.maxZ - R.minZ - 0.4), std(0xe6c23a, { roughness: 1 }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(19.0, 0.006, 0);
  group.add(line);

  // --- 사대 (카운터) + 레인 칸막이 ---
  for (const z of LANES) {
    box(0.7, 0.98, 1.1, 18.6, z, 0x4c4c4c, { roughness: 0.8 });                    // 카운터
    box(0.14, 0.08, 0.1, 18.75, z + 0.35, 0x3c6b3c, { y: 1.02, collide: false });  // 탄약 상자
    box(0.2, 0.06, 0.16, 18.5, z - 0.35, 0xd9d9d0, { y: 1.01, collide: false });   // 귀마개
  }
  for (const z of [-1.5, 1.5]) box(2.2, 2.0, 0.06, 18.4, z, 0x7d7d76, { roughness: 1 }); // 칸막이

  // --- 표적 (레인마다 하나) ---
  const ringTex = ringTexture();
  const boardGeo = new THREE.PlaneGeometry(TARGET_R * 2, TARGET_R * 2);
  const boardMat = new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.9, side: THREE.DoubleSide });
  const poleMat = std(0x333333, { metalness: 0.5, roughness: 0.5 });
  const backMat = std(0xe8e4d8, { roughness: 1 });
  LANES.forEach((z, i) => {
    const pivot = new THREE.Group(); // 바닥에 회전축을 두어 맞으면 뒤로 넘어가게 한다
    pivot.position.set(TARGET_X, 0, z);
    group.add(pivot);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 10), poleMat);
    pole.position.y = 0.5;
    pole.castShadow = true;
    pivot.add(pole);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.3), poleMat);
    base.position.y = 0.02;
    pivot.add(base);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.7, 0.7), backMat);
    back.position.set(0.015, 1.3, 0);
    back.castShadow = true;
    back.receiveShadow = true;
    pivot.add(back);
    shootables.push(back);

    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 1.3, 0);
    board.rotation.y = -Math.PI / 2; // 앞면(+Z 법선)이 사수 쪽(-X)을 본다
    pivot.add(board);
    shootables.push(board);

    const target = { lane: i + 1, pivot, board, down: false, timer: 0 };
    board.userData.target = target;
    back.userData.target = null;
    targets.push(target);
  });

  // --- 탄 흡수벽 (뒤쪽 검은 고무벽) + 레인 번호 + 간판 ---
  box(0.12, 2.4, R.maxZ - R.minZ - 0.4, 26.9, 0, 0x2b2b2b, { roughness: 1 });
  LANES.forEach((z, i) => {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: textTexture(String(i + 1), { bg: '#1c1c1c', fg: '#fff', font: 'bold 180px sans-serif' }, 256, 256) }));
    sign.position.set(26.83, 2.05, z);
    sign.rotation.y = -Math.PI / 2;
    group.add(sign);
  });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.5), new THREE.MeshBasicMaterial({ map: textTexture('실내 사격장  ·  INDOOR RANGE', { font: 'bold 80px sans-serif' }, 1536, 240) }));
  banner.position.set(R.maxX - 0.09, 2.7, 0);
  banner.rotation.y = -Math.PI / 2;
  group.add(banner);
  const warn = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.4), new THREE.MeshBasicMaterial({ map: textTexture('사선 앞으로 나가지 마시오', { bg: '#b8341f', fg: '#fff', font: 'bold 72px sans-serif' }, 1024, 170) }));
  warn.position.set(21, 2.6, R.minZ + 0.09);
  group.add(warn);

  // --- 천장 형광등 (발광 상자) + 보조 조명 ---
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 });
  for (const x of [18, 21.5, 25]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 8), lampMat);
    lamp.position.set(x, 2.96, 0);
    group.add(lamp);
    const pl = new THREE.PointLight(0xffffff, 3, 8, 2);
    pl.position.set(x, 2.6, 0);
    group.add(pl);
  }

  // --- 무기 선반 (북쪽 벽 앞 테이블 + 걸이판). E 키로 무기 선택 패널을 연다 ---
  const rackX = 16.7, rackZ = R.minZ + 0.6;
  box(2.1, 0.9, 0.6, rackX, rackZ, 0x5a4636, { roughness: 0.8 });
  box(2.1, 1.0, 0.03, rackX, R.minZ + 0.1, 0x8a7a66, { y: 1.55, collide: false });
  const rackSign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.25), new THREE.MeshBasicMaterial({ map: textTexture('무기 선반  (E)', { font: 'bold 90px sans-serif' }, 1024, 210) }));
  rackSign.position.set(rackX, 2.2, R.minZ + 0.09);
  group.add(rackSign);
  WEAPONS.forEach((w, i) => {
    const holder = new THREE.Group();
    holder.position.set(rackX - 0.84 + i * 0.42, 0.93, rackZ);
    holder.rotation.y = Math.PI / 2; // 총열이 -X 를 향하게
    const model = buildWeaponModel(w.id);
    model.rotation.z = Math.PI / 2;   // 옆으로 눕힘
    if (w.id === 'knife') model.position.y = -0.01;
    holder.add(model);
    group.add(holder);
  });
  const rack = { center: new THREE.Vector3(rackX, 1, rackZ + 0.45), label: '무기 선반' };

  // 표적 피격: 링 점수(10점 만점) 반환. 근접 공격은 meleeScore 를 그대로 준다. 넘어져 있는 동안은 0
  function hit(target, point, meleeScore = 0) {
    if (target.down) return 0;
    const local = target.board.worldToLocal(point.clone());
    const r = Math.hypot(local.x, local.y);
    if (r > TARGET_R) return 0;
    const score = meleeScore || Math.max(1, 10 - Math.floor(r / (TARGET_R / 10)));
    target.down = true;
    target.timer = DOWN_TIME;
    playDing();
    return score;
  }

  function update(dt) {
    for (const t of targets) {
      if (t.down) {
        t.timer -= dt;
        if (t.timer <= 0) t.down = false;
      }
      const goal = t.down ? -1.45 : 0; // z 축 음의 회전 = 사수 반대쪽(+X)으로 넘어감
      const k = Math.min(1, dt * (t.down ? 14 : 6));
      t.pivot.rotation.z += (goal - t.pivot.rotation.z) * k;
    }
  }

  return { targets, rack, hit, update };
}
