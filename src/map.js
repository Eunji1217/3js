import { ROOMS } from './world.js';
import { GROUND, YARD, GATE, GATE_E, ANIMAL_ZONE } from './outdoor.js';
import { TOWN, TOWN_LAYOUT } from './town.js';

// 지도 (34단계): 3D 를 다시 그리지 않고 "아는 좌표" 로 2D 캔버스에 그린다 (마인크래프트 지도처럼).
// 정적인 것(방·울타리·길·광장·나무)은 시작할 때 한 번 큰 캔버스에 그려 두고, 매 프레임은 그 그림을 복사한 뒤 점만 찍는다.
// 좌표: 화면 위 = +z (이 프로젝트에서 "북쪽" = 동물 들판 방향), 화면 오른쪽 = -x. 플레이어가 +z 를 볼 때 카메라의 오른쪽이 -x 이기 때문.
const S = 4;                 // 정적 지도 해상도: 1m = 4px (땅 200m → 800px)
const MINI_RANGE = 34;       // 미니맵이 보여 주는 반지름(m)

export class WorldMap {
  /**
   * @param {object} world createWorld() 결과
   * @param {HTMLCanvasElement} mini 모서리 미니맵
   * @param {HTMLCanvasElement} big M 키 전체 지도
   */
  constructor(world, mini, big) {
    this.world = world;
    this.mini = mini;
    this.big = big;
    this.staticCanvas = document.createElement('canvas');
    this.staticCanvas.width = (GROUND.maxX - GROUND.minX) * S;
    this.staticCanvas.height = (GROUND.maxZ - GROUND.minZ) * S;
    this.staticDone = false;
  }

  // 월드 → 정적 캔버스 픽셀
  toMap(x, z) { return [(GROUND.maxX - x) * S, (GROUND.maxZ - z) * S]; }
  rect(ctx, a, pad = 0) {
    const [x1, y1] = this.toMap(a.maxX + pad, a.maxZ + pad), [x2, y2] = this.toMap(a.minX - pad, a.minZ - pad);
    return [x1, y1, x2 - x1, y2 - y1];
  }

  // 정적 지형. 나무·바위 위치(outdoor.decor)는 배치가 끝난 뒤에 알 수 있어 ready 뒤에 부른다
  drawStatic() {
    const ctx = this.staticCanvas.getContext('2d');
    const W = this.staticCanvas.width, H = this.staticCanvas.height;
    ctx.fillStyle = '#6f9c4e'; ctx.fillRect(0, 0, W, H);                                  // 들판
    ctx.fillStyle = '#84b45e'; ctx.fillRect(...this.rect(ctx, YARD));                      // 마당
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
    ctx.strokeRect(...this.rect(ctx, ANIMAL_ZONE)); ctx.setLineDash([]);                   // 동물 들판 (점선)
    // 나무·바위·채집물
    for (const d of this.world.outdoor.decor || []) {
      const [x, y] = this.toMap(d.x, d.z);
      ctx.fillStyle = d.kind === 'tree' ? '#2f6b2a' : d.kind === 'rock' ? '#8d8d86' : '#c9a24a';
      ctx.beginPath(); ctx.arc(x, y, d.kind === 'tree' ? 3 : 2, 0, Math.PI * 2); ctx.fill();
    }
    // 돌길: 현관 → 남쪽 문, 동쪽 문 → 광장
    ctx.fillStyle = '#b9b2a4';
    ctx.fillRect(...this.rect(ctx, { minX: 12.6, maxX: 14.2, minZ: 5, maxZ: YARD.maxZ + 1 }));
    ctx.fillRect(...this.rect(ctx, { minX: YARD.maxX, maxX: TOWN_LAYOUT.square.minX, minZ: 0.5, maxZ: 2.0 }));
    // 울타리 (문 자리는 비움)
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 3;
    const line = (x1, z1, x2, z2) => { ctx.beginPath(); ctx.moveTo(...this.toMap(x1, z1)); ctx.lineTo(...this.toMap(x2, z2)); ctx.stroke(); };
    line(YARD.minX, YARD.minZ, YARD.maxX, YARD.minZ);
    line(YARD.minX, YARD.maxZ, GATE.minX, YARD.maxZ); line(GATE.maxX, YARD.maxZ, YARD.maxX, YARD.maxZ);
    line(YARD.minX, YARD.minZ, YARD.minX, YARD.maxZ);
    line(YARD.maxX, YARD.minZ, YARD.maxX, GATE_E.minZ); line(YARD.maxX, GATE_E.maxZ, YARD.maxX, YARD.maxZ);
    // 광장: 돌바닥, 분수, 노점, 집
    const L = TOWN_LAYOUT;
    ctx.fillStyle = '#a79f93'; ctx.fillRect(...this.rect(ctx, L.square));
    ctx.fillStyle = '#5aa0d8'; const [fx, fy] = this.toMap(L.fountain.x, L.fountain.z); ctx.beginPath(); ctx.arc(fx, fy, L.fountain.r * S, 0, Math.PI * 2); ctx.fill();
    for (const st of L.stalls) { ctx.fillStyle = st.color; ctx.fillRect(...this.rect(ctx, { minX: st.x - 1.2, maxX: st.x + 1.2, minZ: st.z - 1.2, maxZ: st.z + 1.2 })); }
    for (const h of L.houses) { ctx.fillStyle = '#8c6a4a'; ctx.fillRect(...this.rect(ctx, { minX: h.x - h.half, maxX: h.x + h.half, minZ: h.z - h.half, maxZ: h.z + h.half })); ctx.strokeStyle = '#4e3a28'; ctx.lineWidth = 2; ctx.strokeRect(...this.rect(ctx, { minX: h.x - h.half, maxX: h.x + h.half, minZ: h.z - h.half, maxZ: h.z + h.half })); }
    // 집 안 방들: 바닥색 + 벽 테두리
    for (const r of ROOMS) {
      ctx.fillStyle = '#' + r.floor.toString(16).padStart(6, '0');
      ctx.fillRect(...this.rect(ctx, r));
      ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 3; ctx.strokeRect(...this.rect(ctx, r));
    }
    // 문 (주황 점)
    ctx.fillStyle = '#ff9a3c';
    for (const d of this.world.doors) { const [x, y] = this.toMap(d.center.x, d.center.z); ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
    // 이름표
    ctx.fillStyle = '#222'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = (text, x, z) => { const [px, py] = this.toMap(x, z); ctx.fillStyle = 'rgba(255,255,255,0.7)'; const w = ctx.measureText(text).width + 8; ctx.fillRect(px - w / 2, py - 8, w, 16); ctx.fillStyle = '#222'; ctx.fillText(text, px, py); };
    for (const r of ROOMS) label(r.name, (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2);
    label('마당', (YARD.minX + YARD.maxX) / 2, YARD.minZ + 4);
    label('광장', L.fountain.x, L.square.minZ - 2.5);
    label('동물 들판', (ANIMAL_ZONE.minX + ANIMAL_ZONE.maxX) / 2, ANIMAL_ZONE.maxZ - 2);
    this.staticDone = true;
  }

  // 움직이는 것들: 동물(빨강, 쫓아오면 주황), 떨어진 재료(노랑), 채집물(초록), 상인(파랑), 플레이어(흰 화살표)
  drawMarkers(ctx, scale, heading) {
    const w = this.world;
    const dot = (x, z, color, r) => { const [px, py] = this.toMap(x, z); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, r / scale, 0, Math.PI * 2); ctx.fill(); };
    for (const p of w.outdoor.pickups) if (p.obj.visible) dot(p.center.x, p.center.z, '#5ee36b', 3);
    for (const it of w.animals.items) dot(it.group.position.x, it.group.position.z, '#ffe34d', 3.5);
    for (const a of w.animals.animals) if (!a.dead) dot(a.obj.position.x, a.obj.position.z, a.state === 'attack' ? '#ff8a1f' : '#ff3b3b', a.species.scale > 0.5 ? 4.5 : 3.5);
    for (const v of w.town.vendors) dot(v.center.x, v.center.z, '#3b7bff', 4);
    // 플레이어 화살표. 정면 (sin h, cos h) → 지도에서는 (-sin h, -cos h)
    const p = this.player;
    const [px, py] = this.toMap(p.x, p.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(-Math.cos(heading), -Math.sin(heading)) + Math.PI / 2);
    const k = 7 / scale;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5 / scale;
    ctx.beginPath(); ctx.moveTo(0, -k * 1.4); ctx.lineTo(k, k); ctx.lineTo(0, k * 0.4); ctx.lineTo(-k, k); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /** 매 프레임: 미니맵 (카메라가 보는 쪽이 위). bigOpen 이면 전체 지도도 (북쪽 = +z 가 위) */
  update(player, camYaw, bigOpen) {
    if (!this.staticDone) return;
    this.player = player.position;
    const heading = player.heading;
    // --- 미니맵 ---
    const m = this.mini, mc = m.getContext('2d'), R = m.width / 2;
    const scale = R / (MINI_RANGE * S); // 정적 픽셀 → 미니맵 픽셀
    mc.clearRect(0, 0, m.width, m.height);
    mc.save();
    mc.beginPath(); mc.arc(R, R, R - 2, 0, Math.PI * 2); mc.clip();
    mc.fillStyle = '#4b6b3a'; mc.fillRect(0, 0, m.width, m.height);
    mc.translate(R, R);
    // 카메라 정면 (-sin yaw, -cos yaw) → 지도 벡터 (sin yaw, cos yaw) 가 위(-y)를 가리키게 돌린다
    mc.rotate(-Math.PI / 2 - Math.atan2(Math.cos(camYaw), Math.sin(camYaw)));
    mc.scale(scale, scale);
    const [px, py] = this.toMap(this.player.x, this.player.z);
    mc.translate(-px, -py);
    mc.drawImage(this.staticCanvas, 0, 0);
    this.drawMarkers(mc, scale, heading);
    mc.restore();
    // 테두리와 북쪽 표시
    mc.strokeStyle = 'rgba(255,255,255,0.8)'; mc.lineWidth = 3; mc.beginPath(); mc.arc(R, R, R - 2, 0, Math.PI * 2); mc.stroke();
    const na = -Math.PI / 2 - Math.atan2(Math.cos(camYaw), Math.sin(camYaw)) - Math.PI / 2; // 북쪽(+z = 지도 위) 방향
    mc.fillStyle = '#ffd34d'; mc.font = 'bold 12px sans-serif'; mc.textAlign = 'center'; mc.textBaseline = 'middle';
    mc.fillText('N', R + Math.cos(na) * (R - 12), R + Math.sin(na) * (R - 12));
    // --- 전체 지도 ---
    if (!bigOpen) return;
    const b = this.big, bc = b.getContext('2d');
    const sc = Math.min(b.width / this.staticCanvas.width, b.height / this.staticCanvas.height);
    bc.clearRect(0, 0, b.width, b.height);
    bc.save();
    bc.translate((b.width - this.staticCanvas.width * sc) / 2, (b.height - this.staticCanvas.height * sc) / 2);
    bc.scale(sc, sc);
    bc.drawImage(this.staticCanvas, 0, 0);
    this.drawMarkers(bc, sc, heading);
    bc.restore();
  }
}
