import * as THREE from 'three';
import { playShot, playSwing, playPunch, playClick, playReload } from './audio.js';

// 무기 정의. 총은 분당 발사수(rpm)·탄창(mag)·퍼짐(spread, rad)·반동(recoil, rad)·조준 FOV 로 성격을 나눈다.
// zoom: 조준경 배율 단계 (1인칭에서 우클릭 더블클릭으로 다음 단계). mag > 1 이면 렌즈 안에 확대 화면(PIP)을 그린다.
export const WEAPONS = [
  { id: 'pistol', name: '권총', key: '1', type: 'gun', auto: false, rpm: 320, mag: 12, reload: 1.3, pellets: 1, spread: 0.012, aimSpread: 0.003, recoil: 0.018, aimFov: 50, sound: 'pistol' },
  { id: 'rifle', name: '소총', key: '2', type: 'gun', auto: true, rpm: 650, mag: 30, reload: 2.0, pellets: 1, spread: 0.02, aimSpread: 0.006, recoil: 0.01, aimFov: 45, zoom: [{ label: '도트', mag: 1 }, { label: '2.5x', mag: 2.5 }], sound: 'rifle' },
  { id: 'shotgun', name: '산탄총', key: '3', type: 'gun', auto: false, rpm: 70, mag: 6, reload: 2.4, pellets: 8, spread: 0.05, aimSpread: 0.035, recoil: 0.05, aimFov: 55, sound: 'shotgun' },
  { id: 'sniper', name: '저격총', key: '4', type: 'gun', auto: false, rpm: 40, mag: 5, reload: 2.6, pellets: 1, spread: 0.04, aimSpread: 0, recoil: 0.06, aimFov: 40, zoom: [{ label: '4x', mag: 4 }, { label: '8x', mag: 8 }], sound: 'sniper' },
  { id: 'knife', name: '칼', key: '5', type: 'melee', rpm: 110, reach: 1.8 },
];
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
// 스크롤로 넘기는 순서 (마지막은 맨손)
export const CYCLE = [...WEAPONS.map((w) => w.id), null];

const BASE_FOV = 60;
const SCOPE_MAIN_FOV = 40; // 렌즈 안을 들여다볼 때 바깥 화면 FOV (살짝만 당겨진다)
const MAX_RANGE = 80;
const IRON_EYE = 0.3;      // 가늠쇠 조준 시 눈~가늠쇠 거리
const SWING_T = 0.38;      // 칼 휘두르기 시간(초)

// --- 무기 모델 (박스/원기둥 조합). 규칙: 총열은 -Z, 손잡이는 -Y 방향.
// userData: muzzle(총구), sight(조준 시 화면 중앙에 올 점), eyeDist(눈~sight 거리), lens/reticle(조준경 렌즈) ---
const mat = (color, metalness, roughness) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
const MATS = {
  steel: () => mat(0x4a4e55, 0.85, 0.35),
  dark: () => mat(0x1e1f23, 0.4, 0.6),
  wood: () => mat(0x6b4a2b, 0.0, 0.7),
  blade: () => mat(0xd6dbe0, 1.0, 0.2),
  glass: () => new THREE.MeshStandardMaterial({ color: 0x0b1a2a, metalness: 1, roughness: 0.1 }),
};

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _reticleTex = null, _dotTex = null;
// 십자선 + 눈금 (렌즈 위에 겹치는 투명 텍스처)
function reticleTex() {
  return _reticleTex ||= canvasTex(512, (ctx, s) => {
    const c = s / 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, c); ctx.lineTo(s, c); ctx.moveTo(c, 0); ctx.lineTo(c, s);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, c); ctx.lineTo(c - 60, c); ctx.moveTo(c + 60, c); ctx.lineTo(s, c);
    ctx.moveTo(c, 0); ctx.lineTo(c, c - 60); ctx.moveTo(c, c + 60); ctx.lineTo(c, s);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let k = 1; k <= 4; k++) {
      const d = k * 28;
      ctx.beginPath();
      ctx.moveTo(c + d, c - 8); ctx.lineTo(c + d, c + 8); ctx.moveTo(c - d, c - 8); ctx.lineTo(c - d, c + 8);
      ctx.moveTo(c - 8, c + d); ctx.lineTo(c + 8, c + d);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(200,0,0,0.9)';
    ctx.beginPath(); ctx.arc(c, c, 3, 0, Math.PI * 2); ctx.fill();
  });
}
// 도트 사이트 점
function dotTex() {
  return _dotTex ||= canvasTex(256, (ctx, s) => {
    const c = s / 2;
    ctx.fillStyle = 'rgba(255,40,40,0.95)';
    ctx.beginPath(); ctx.arc(c, c, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,40,40,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(c, c, 26, 0, Math.PI * 2); ctx.stroke();
  });
}

export function buildWeaponModel(id, { shadows = true } = {}) {
  const g = new THREE.Group();
  const m = { steel: MATS.steel(), dark: MATS.dark(), wood: MATS.wood(), blade: MATS.blade() };
  const add = (geo, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = shadows;
    g.add(mesh);
    return mesh;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const tube = (r, len) => new THREE.CylinderGeometry(r, r, len, 24); // rx = PI/2 로 눕혀 Z 방향 총열로 쓴다
  const X = Math.PI / 2;
  // 조준경: 렌즈(뒤쪽, +Z 를 보는 원판)와 십자선 레이어. sight 는 렌즈 중심
  const optic = (r, len, y, zc, lensR) => {
    // 경통은 양 끝이 뚫린 원통(안쪽 면도 그림) → 도트 사이트처럼 통과해서 볼 수 있다
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0x1e1f23, metalness: 0.4, roughness: 0.6, side: THREE.DoubleSide });
    add(new THREE.CylinderGeometry(r, r, len, 32, 1, true), tubeMat, 0, y, zc, X);
    add(new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.02, 32, 1, true), tubeMat, 0, y, zc + len / 2 - 0.01, X); // 접안부 테두리
    const zBack = zc + len / 2 + 0.001;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(lensR, 32), MATS.glass());
    lens.userData.glass = lens.material; // 조준을 풀면 되돌릴 기본 유리 재질
    lens.position.set(0, y, zBack);
    g.add(lens);
    const reticle = new THREE.Mesh(new THREE.CircleGeometry(lensR, 32), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    reticle.position.set(0, y, zBack + 0.0005);
    reticle.visible = false;
    g.add(reticle);
    g.userData.lens = lens;
    g.userData.reticle = reticle;
    g.userData.lensRadius = lensR;
    g.userData.sight = new THREE.Vector3(0, y, zBack);
  };
  let muzzle = [0, 0, -0.2];

  switch (id) {
    case 'pistol':
      add(box(0.03, 0.035, 0.18), m.steel, 0, 0.025, -0.07);     // 슬라이드
      add(box(0.03, 0.02, 0.12), m.dark, 0, -0.002, -0.05);      // 프레임
      add(tube(0.006, 0.03), m.steel, 0, 0.028, -0.17, X);       // 총열
      add(box(0.028, 0.1, 0.04), m.dark, 0, -0.055, 0.0, -0.3);  // 손잡이
      add(box(0.02, 0.005, 0.04), m.dark, 0, -0.022, -0.04);     // 방아쇠울
      add(box(0.006, 0.012, 0.01), m.dark, 0, 0.048, -0.15);     // 가늠쇠
      add(box(0.02, 0.012, 0.01), m.dark, 0, 0.048, 0.01);       // 가늠자
      muzzle = [0, 0.028, -0.19];
      g.userData.sight = new THREE.Vector3(0, 0.052, -0.06);
      g.userData.eyeDist = IRON_EYE;
      break;
    case 'rifle':
      add(box(0.04, 0.06, 0.3), m.dark, 0, 0, -0.05);            // 몸통
      add(box(0.035, 0.045, 0.25), m.dark, 0, 0, -0.32);         // 총열덮개
      add(tube(0.008, 0.25), m.steel, 0, 0.005, -0.56, X);       // 총열
      add(box(0.035, 0.07, 0.24), m.dark, 0, -0.015, 0.22);      // 개머리판
      add(box(0.03, 0.09, 0.035), m.dark, 0, -0.07, 0.05, -0.3); // 손잡이
      add(box(0.03, 0.15, 0.07), m.steel, 0, -0.1, -0.1, 0.2);   // 탄창
      add(box(0.02, 0.025, 0.08), m.dark, 0, 0.04, -0.1);        // 조준경 마운트
      optic(0.02, 0.1, 0.075, -0.12, 0.017);                     // 가변 배율 조준경 (도트 / 2.5x)
      muzzle = [0, 0.005, -0.69];
      g.userData.eyeDist = 0.18;
      break;
    case 'shotgun':
      add(tube(0.012, 0.6), m.steel, 0, 0.02, -0.4, X);          // 총열
      add(tube(0.01, 0.5), m.steel, 0, -0.008, -0.35, X);        // 탄창 튜브
      add(box(0.045, 0.06, 0.22), m.steel, 0, 0, -0.05);         // 몸통
      add(box(0.04, 0.045, 0.14), m.wood, 0, -0.01, -0.35);      // 펌프
      add(box(0.04, 0.08, 0.28), m.wood, 0, -0.02, 0.2);         // 개머리판
      add(box(0.006, 0.01, 0.01), m.steel, 0, 0.037, -0.68);     // 구슬 가늠쇠
      muzzle = [0, 0.02, -0.7];
      g.userData.sight = new THREE.Vector3(0, 0.04, -0.1);
      g.userData.eyeDist = IRON_EYE;
      break;
    case 'sniper':
      add(tube(0.009, 0.55), m.steel, 0, 0.01, -0.5, X);         // 총열
      add(box(0.04, 0.06, 0.32), m.dark, 0, 0, -0.1);            // 몸통
      add(box(0.015, 0.03, 0.02), m.dark, 0, 0.04, -0.16);       // 스코프 마운트
      add(box(0.015, 0.03, 0.02), m.dark, 0, 0.04, -0.04);
      add(tube(0.018, 0.2), m.dark, 0, 0.065, -0.1, X);          // 스코프 몸통
      add(tube(0.022, 0.05), m.dark, 0, 0.065, -0.2, X);         // 대물렌즈 쪽
      optic(0.024, 0.06, 0.065, 0.02, 0.021);                    // 접안렌즈 (4x / 8x)
      add(box(0.04, 0.09, 0.3), m.wood, 0, -0.02, 0.2);          // 개머리판
      add(box(0.03, 0.09, 0.035), m.dark, 0, -0.07, 0.05, -0.3); // 손잡이
      add(box(0.03, 0.08, 0.06), m.steel, 0, -0.065, -0.1);      // 탄창
      muzzle = [0, 0.01, -0.78];
      g.userData.eyeDist = 0.16;
      break;
    case 'fists': {
      // 맨손: 양쪽 주먹 + 소매. userData.left/right 로 각각 움직인다
      const skin = mat(0xd8a98a, 0, 0.8), sleeve = mat(0x3b3b4a, 0, 0.9);
      for (const side of [-1, 1]) {
        const f = new THREE.Group();
        f.position.set(side * 0.16, 0, 0);
        const fist = new THREE.Mesh(box(0.08, 0.07, 0.09), skin);
        fist.position.set(0, 0, -0.04);
        f.add(fist);
        const fore = new THREE.Mesh(box(0.07, 0.065, 0.22), sleeve);
        fore.position.set(0, -0.01, 0.12);
        f.add(fore);
        g.add(f);
        g.userData[side < 0 ? 'left' : 'right'] = f;
      }
      muzzle = [0, 0, -0.1];
      break;
    }
    case 'knife':
      add(box(0.004, 0.03, 0.18), m.blade, 0, 0, -0.14);         // 칼날
      add(box(0.035, 0.05, 0.01), m.steel, 0, 0, -0.045);        // 날밑
      add(box(0.022, 0.03, 0.1), m.dark, 0, 0, 0.01);            // 손잡이
      muzzle = [0, 0, -0.23];
      break;
  }
  const mz = new THREE.Object3D();
  mz.position.set(...muzzle);
  g.add(mz);
  g.userData.muzzle = mz;
  return g;
}

// --- 탄흔 / 예광 / 총구 섬광 ---
class Effects {
  constructor(scene) {
    this.scene = scene;
    this.holes = [];
    this.holeI = 0;
    this.holeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.holeGeo = new THREE.CircleGeometry(0.022, 10);
    this.tracers = [];
    this.tracerI = 0;
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85 });
    this.flashLight = new THREE.PointLight(0xffc27a, 0, 5, 2);
    scene.add(this.flashLight);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash.scale.setScalar(0.18);
    this.flash.visible = false;
    scene.add(this.flash);
    this.flashT = 0;
    this._v = new THREE.Vector3();
  }

  // parent 를 주면(표적판) 그 로컬 좌표계에 붙어서 같이 움직인다
  hole(point, normal, parent = null) {
    let h = this.holes[this.holeI];
    if (!h) { h = new THREE.Mesh(this.holeGeo, this.holeMat); this.holes[this.holeI] = h; }
    this.holeI = (this.holeI + 1) % 120;
    h.removeFromParent();
    if (parent) {
      parent.add(h);
      h.position.copy(parent.worldToLocal(point.clone()));
      h.position.z = 0.003;
      h.quaternion.identity();
    } else {
      this.scene.add(h);
      h.position.copy(point).addScaledVector(normal, 0.004);
      h.lookAt(this._v.copy(point).add(normal));
    }
  }

  tracer(from, to) {
    let t = this.tracers[this.tracerI];
    if (!t) {
      t = { line: new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), this.tracerMat), life: 0 };
      this.scene.add(t.line);
      this.tracers[this.tracerI] = t;
    }
    this.tracerI = (this.tracerI + 1) % 16;
    t.line.geometry.setFromPoints([from, to]);
    t.line.visible = true;
    t.life = 0.05;
  }

  muzzleFlash(pos) {
    this.flash.position.copy(pos);
    this.flash.visible = true;
    this.flash.material.rotation = Math.random() * Math.PI;
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 8;
    this.flashT = 0.04;
  }

  update(dt) {
    for (const t of this.tracers) {
      if (!t || !t.line.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.line.visible = false;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; }
    }
  }
}

// --- 무기 시스템: 선택 / 조준 / 사격 / 재장전 / 모델 부착 / 조준경 PIP / 3인칭 조준 자세 ---
export class WeaponSystem {
  constructor({ scene, camera, player, world, rig, ui }) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.world = world;
    this.rig = rig;
    this.ui = ui;
    this.fx = new Effects(scene);
    this.current = null;
    this.ammo = Object.fromEntries(WEAPONS.filter((w) => w.mag).map((w) => [w.id, w.mag]));
    this.cool = 0;
    this.reloadT = 0;
    this.aiming = false;
    this.heat = 0;        // 연사 중 퍼짐 증가
    this.zoomLevel = {};  // 무기별 현재 배율 단계 (zoom 배열 인덱스)
    this.lastAimPress = -Infinity; // 우클릭 더블클릭 판정용
    this.swingT = 0;      // 칼 휘두르기 / 주먹 진행 시간
    this.punchSide = 1;   // 다음 주먹: 1 오른손, -1 왼손 (번갈아)
    this.kickZ = 0;       // 1인칭 모델 반동
    this.stats = { score: 0, shots: 0, hits: 0 };
    this.view = null;     // 1인칭(카메라 부착) 모델
    this.held = null;     // 3인칭(손 뼈 부착) 모델
    this.firstPerson = false;
    this.poseW = 0;       // 3인칭 조준 자세 블렌딩 가중치
    this.armBones = null; // 조준 자세용 팔 뼈 캐시
    this.ray = new THREE.Raycaster();
    this._o = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._m = new THREE.Vector3();
    this._hip = new THREE.Vector3(0.2, -0.17, -0.42);
    this._knifePos = new THREE.Vector3(0.18, -0.16, -0.3);
    this._ads = new THREE.Vector3();

    // 조준경 PIP: 좁은 FOV 카메라로 장면을 렌더타깃에 그려 렌즈에 붙인다
    this.scopeRT = new THREE.WebGLRenderTarget(1024, 1024);
    this.scopeCam = new THREE.PerspectiveCamera(5, 1, 0.05, 100);
    this.scopeMat = new THREE.MeshBasicMaterial({ map: this.scopeRT.texture, toneMapped: false }); // 이미 톤매핑된 화면이라 다시 하지 않는다
    this.dotGlassMat = new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.12, depthWrite: false });
    this.scopeFov = 5;
    this.pip = false;
    this._fistsPos = new THREE.Vector3(0, -0.2, -0.38);
    this.buildView();
  }

  // 1인칭(카메라 부착) 모델을 현재 무기에 맞게 만든다. 맨손이면 주먹
  buildView() {
    this.view?.removeFromParent();
    const w = this.current;
    this.view = buildWeaponModel(w ? w.id : 'fists', { shadows: false });
    this.view.position.copy(!w ? this._fistsPos : w.type === 'melee' ? this._knifePos : this._hip);
    this.view.traverse((o) => { if (o.isMesh) o.renderOrder = 10; }); // 벽에 파묻혀도 위에 그린다
    this.camera.add(this.view);
  }

  select(id) {
    const w = id ? WEAPON_BY_ID[id] : null;
    if (w === this.current) return;
    this.current = w || null;
    this.reloadT = 0;
    this.swingT = 0;
    this.heat = 0;
    this.cool = 0.25; // 교체 시간
    this.buildView();
    this.attachToPlayer();
    this.ui.setActiveWeapon(w ? w.id : null);
    if (w) this.ui.toast(w.name + ' 장착');
  }

  // 스크롤: dir > 0 다음, < 0 이전 (맨손 포함 순환)
  cycle(dir) {
    const i = CYCLE.indexOf(this.current ? this.current.id : null);
    const n = CYCLE.length;
    return CYCLE[(i + (dir > 0 ? 1 : -1) + n) % n];
  }

  // 3인칭 모델을 플레이어의 오른손 뼈에 붙인다 (스킨이 바뀌어도 다시 호출)
  attachToPlayer() {
    this.held?.removeFromParent();
    this.held = null;
    this.armBones = null;
    if (!this.player.model) return;
    // 조준 자세·주먹용 팔 뼈 (무기와 상관없이 모델이 있으면 캐시)
    const hand = this.player.getBone('RightHand');
    const b = (n) => this.player.getBone(n);
    const bones = { rArm: b('RightArm'), rFore: b('RightForeArm'), rHand: hand, lArm: b('LeftArm'), lFore: b('LeftForeArm'), lHand: b('LeftHand') };
    if (Object.values(bones).every(Boolean)) this.armBones = bones;
    const w = this.current;
    if (!w) return;
    const model = buildWeaponModel(w.id);
    if (!hand || !hand.parent) {
      model.position.set(0.25, 0.9, 0.15); // 손 뼈가 없으면 허리 옆
      this.player.group.add(model);
      this.held = model;
      return;
    }
    hand.updateWorldMatrix(true, false);
    const s = hand.getWorldScale(new THREE.Vector3()).x || 1;
    model.scale.setScalar(1 / s); // cm 단위 리그 보정
    // 팔뚝→손 방향을 손 로컬 좌표로 구해 총열(-Z)이 그쪽을 향하게 한다
    const hp = hand.getWorldPosition(new THREE.Vector3());
    const fp = hand.parent.getWorldPosition(new THREE.Vector3());
    const dirLocal = hp.sub(fp).normalize().transformDirection(new THREE.Matrix4().copy(hand.matrixWorld).invert()).normalize();
    model.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dirLocal);
    model.position.copy(dirLocal).multiplyScalar(0.07 / s);
    hand.add(model);
    this.held = model;
  }

  get magSize() { return this.current?.mag || 0; }
  get currentAmmo() { return this.current?.mag ? this.ammo[this.current.id] : 0; }

  // 현재 배율 단계 (zoom 이 없는 무기는 null)
  get zoomStep() {
    const w = this.current;
    return w?.zoom ? w.zoom[this.zoomLevel[w.id] || 0] : null;
  }
  // 1인칭에서 광학 조준경(도트 포함)으로 조준 중인지 — HUD 조준선 대신 렌즈 안 십자선을 쓴다
  get opticAim() {
    return !!this.current?.zoom && this.aiming && this.firstPerson;
  }
  // 조준 시 메인 카메라 FOV. PIP 중에는 바깥 화면은 조금만 당기고 확대는 렌즈 안에서 한다
  get aimFov() {
    const w = this.current;
    if (!w) return null;
    return this.pip ? SCOPE_MAIN_FOV : w.aimFov;
  }
  // 마우스 감도 기준 FOV (배율이 높을수록 느리게)
  get sensFov() {
    return this.pip ? this.scopeFov : this.aimFov;
  }

  reload() {
    const w = this.current;
    if (!w || !w.mag || this.reloadT > 0 || this.ammo[w.id] >= w.mag) return;
    this.reloadT = w.reload;
    playReload(w.reload);
  }

  resetStats() {
    this.stats = { score: 0, shots: 0, hits: 0 };
  }

  /**
   * @param {number} dt
   * @param {import('./input.js').Input} input
   * @param {boolean} first 1인칭 여부
   * @param {boolean} canFire 패널이 닫혀 있고 마우스가 잠겨 있어 사격 가능한지
   */
  update(dt, input, first, canFire) {
    this.firstPerson = first;
    this.cool = Math.max(0, this.cool - dt);
    this.heat = Math.max(0, this.heat - dt * 2);
    const w = this.current;

    this.aiming = !!w && w.type === 'gun' && canFire && input.mouseDown(2);

    // 우클릭 더블클릭(0.35초 안에 두 번) → 배율 다음 단계 (1인칭, zoom 있는 총만)
    if (w && canFire && input.pressed('Mouse2')) {
      const now = performance.now();
      if (first && w.zoom && now - this.lastAimPress < 350) {
        this.zoomLevel[w.id] = ((this.zoomLevel[w.id] || 0) + 1) % w.zoom.length;
        this.ui.toast(`배율 ${w.zoom[this.zoomLevel[w.id]].label}`, 1200);
        this.lastAimPress = -Infinity;
      } else {
        this.lastAimPress = now;
      }
    }

    // PIP 여부와 렌즈 안 FOV: 렌즈가 화면에서 차지하는 각도 ÷ 배율
    const step = this.zoomStep;
    this.pip = !!(w && first && this.aiming && step && step.mag > 1 && this.view?.userData.lens);
    if (this.pip) {
      const ud = this.view.userData;
      const lensDeg = THREE.MathUtils.radToDeg(2 * Math.atan(ud.lensRadius / ud.eyeDist)) * (BASE_FOV / SCOPE_MAIN_FOV);
      this.scopeFov = lensDeg / step.mag;
    }

    if (w) {
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) { this.reloadT = 0; this.ammo[w.id] = w.mag; }
      }
      const wantFire = w.auto ? input.mouseDown(0) : input.pressed('Mouse0');
      if (canFire && wantFire && this.cool <= 0 && this.reloadT <= 0) {
        if (w.type === 'melee') this.swing(first);
        else if (this.ammo[w.id] > 0) this.shoot(first);
        else { playClick(); this.cool = 0.3; this.reload(); }
      }
      if (canFire && input.pressed('KeyR')) this.reload();
    } else if (canFire && input.pressed('Mouse0') && this.cool <= 0) {
      this.punch(first); // 맨손: 주먹
    }

    this.animateView(dt, first);
    if (this.swingT > 0) this.swingT -= dt; // 칼 휘두르기 타이머 (1인칭 모델과 3인칭 팔 동작이 같이 쓴다)
    this.fx.update(dt);

    // HUD
    if (w) {
      let status = '';
      if (this.reloadT > 0) status = '재장전 중...';
      else if (w.mag && this.ammo[w.id] === 0) status = 'R 재장전';
      else if (w.zoom) status = `배율 ${step.label}${first ? ' · 우클릭 더블클릭 전환' : ''}`;
      this.ui.setWeaponHud(w.name, w.mag ? `${this.ammo[w.id]} / ∞` : '—', status);
      const spread = w.type === 'gun' ? (this.aiming ? w.aimSpread : w.spread) + this.heat * 0.01 : 0;
      this.ui.setCrosshair(!this.opticAim, 6 + spread * 900);
    } else {
      this.ui.setWeaponHud(null);
      this.ui.setCrosshair(canFire, 4); // 맨손도 주먹이 나가는 곳을 알 수 있게 작은 조준점
    }
    this.ui.setScore(this.stats);
  }

  // 1인칭 모델 위치: 허리 → 조준 위치(가늠쇠/렌즈가 화면 중앙) 보간, 반동, 칼 휘두르기, 렌즈 재질
  animateView(dt, first) {
    if (!this.view) return;
    const w = this.current;
    const ud = this.view.userData;
    this.view.visible = first;
    if (!first) return;
    const prog = this.swingT > 0 ? 1 - this.swingT / SWING_T : -1; // 공격 진행도 (없으면 -1)
    if (!w) {
      // 주먹: 공격 중인 쪽 주먹이 가운데로 모이며 앞으로 뻗었다 돌아온다
      this.view.position.lerp(this._fistsPos, Math.min(1, dt * 12));
      const p = prog >= 0 ? Math.sin(prog * Math.PI) : 0;
      for (const side of [-1, 1]) {
        const f = ud[side < 0 ? 'left' : 'right'];
        const active = side === -this.punchSide; // punchSide 는 이미 다음 손으로 바뀌어 있으므로 반대쪽이 지금 치는 손
        const k = active ? p : 0;
        f.position.set(side * (0.16 - 0.1 * k), 0.03 * k, -0.3 * k);
        f.rotation.set(0.15 * k, -side * 0.3 * k, 0);
      }
      return;
    }
    let target = this._hip;
    if (w.type === 'melee') target = this._knifePos;
    else if (this.aiming && ud.sight) target = this._ads.set(-ud.sight.x, -ud.sight.y, -ud.eyeDist - ud.sight.z);
    this.view.position.lerp(target, Math.min(1, dt * 12));
    this.kickZ *= Math.exp(-dt * 14);
    this.view.position.z += this.kickZ;
    if (w.type === 'melee') {
      // 0.3초 동안 내려찍듯 회전
      const p = this.swingT > 0 ? Math.sin(Math.min(1, this.swingT / SWING_T) * Math.PI) : 0;
      this.view.rotation.set(-1.1 * p, 0.3 * p, 0.4 * p);
      this.view.position.z = target.z - 0.15 * p;
    } else {
      this.view.rotation.set(0.25 * this.kickZ / 0.04, 0, 0);
    }

    // 렌즈: PIP 면 확대 화면 + 십자선, 도트 단계면 투명 유리 + 빨간 점, 조준 안 하면 어두운 유리
    if (ud.lens) {
      const step = this.zoomStep;
      if (this.pip) {
        ud.lens.material = this.scopeMat;
        ud.reticle.material.map = reticleTex();
        ud.reticle.material.needsUpdate = true;
        ud.reticle.visible = true;
      } else if (this.aiming && step && step.mag === 1) {
        ud.lens.material = this.dotGlassMat;
        ud.reticle.material.map = dotTex();
        ud.reticle.material.needsUpdate = true;
        ud.reticle.visible = true;
      } else {
        ud.lens.material = ud.lens.userData.glass;
        ud.reticle.visible = false;
      }
    }
  }

  // 메인 렌더 전에 호출: 렌즈 안에 보일 확대 장면을 그린다
  renderScope(renderer, scene) {
    if (!this.pip) return;
    this.scopeCam.position.copy(this.camera.position);
    this.scopeCam.quaternion.copy(this.camera.quaternion);
    this.scopeCam.fov = this.scopeFov;
    this.scopeCam.updateProjectionMatrix();
    this.view.visible = false; // 자기 총은 렌즈 안에 안 보이게
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.scopeRT);
    renderer.render(scene, this.scopeCam);
    renderer.setRenderTarget(prev);
    this.view.visible = true;
  }

  get swinging() {
    return this.swingT > 0;
  }

  // 3인칭 팔 동작: 애니메이션 위에 팔 뼈를 덮어쓴다 (player.update 뒤에 호출)
  //  - 총 조준: 양팔을 조준점 쪽으로 뻗는다
  //  - 칼 공격: 오른팔을 위로 들었다가 앞으로 내려친다
  poseArms(dt, first) {
    const b = this.armBones;
    const cur = this.current;
    const swinging = !first && (!cur || cur.type === 'melee') && this.swingT > 0 && b;
    const want = !first && this.aiming && cur?.type === 'gun' && b;
    this.poseW += ((want ? 1 : 0) - this.poseW) * Math.min(1, dt * 10);
    if (!b || (this.poseW < 0.01 && !swinging)) return;
    this.player.group.updateMatrixWorld(true);
    const p = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Quaternion(), bw = new THREE.Quaternion(), pw = new THREE.Quaternion();
    let w = this.poseW;
    // bone→child 방향이 target 을 향하도록 bone 의 월드 회전을 돌리고, 로컬로 바꿔 블렌딩한다
    const aimBone = (bone, child, target) => {
      bone.getWorldPosition(p);
      child.getWorldPosition(c);
      const d0 = c.sub(p).normalize();
      const d1 = target.clone().sub(p).normalize();
      q.setFromUnitVectors(d0, d1);
      bone.getWorldQuaternion(bw);
      bw.premultiply(q);
      bone.parent.getWorldQuaternion(pw);
      bw.premultiply(pw.invert());
      bone.quaternion.slerp(bw, w);
      bone.updateMatrixWorld(true);
    };

    if (swinging && !cur) {
      // 주먹: 치는 쪽 팔을 조준점 쪽으로 곧게 뻗었다가 거둔다 (가중치가 0→1→0 으로 뻗는 모양을 만든다)
      const prog = 1 - this.swingT / SWING_T;
      const { origin, dir, near } = this.aimRay(false);
      this.ray.set(origin, dir);
      this.ray.near = near;
      this.ray.far = 60;
      const hit = this.ray.intersectObjects(this.world.shootables, false)[0];
      const aimPoint = origin.clone().addScaledVector(dir, hit ? hit.distance : 30);
      w = Math.sin(Math.min(1, prog) * Math.PI);
      const right = this.punchSide < 0; // punchSide 는 다음 손이므로 지금 치는 손은 반대
      aimBone(right ? b.rArm : b.lArm, right ? b.rFore : b.lFore, aimPoint);
      aimBone(right ? b.rFore : b.lFore, right ? b.rHand : b.lHand, aimPoint);
      return;
    }
    if (swinging) {
      // 진행도 0→1. 앞 25% 는 팔을 위·뒤로 드는 구간, 나머지는 가속하며 앞·아래로 내려치는 구간
      const prog = 1 - this.swingT / SWING_T;
      const t = prog < 0.2 ? 0 : (prog - 0.2) / 0.8;
      const e = Math.pow(t, 1.6);
      const fwd = new THREE.Vector3(-Math.sin(this.rig.yaw), 0, -Math.cos(this.rig.yaw)); // 카메라가 보는 방향
      // 뒤·위 약 60도 (팔 들어 올림) → 앞·아래 약 30도 (내려침) 로 호를 그린다
      const dir = fwd.clone().multiplyScalar(-0.5 + 1.5 * e).addScaledVector(THREE.Object3D.DEFAULT_UP, 0.85 - 1.35 * e).normalize();
      const shoulder = b.rArm.getWorldPosition(new THREE.Vector3());
      const target = shoulder.addScaledVector(dir, 1);
      // 시작·끝에서 애니메이션과 부드럽게 섞이도록 가중치를 올렸다 내린다
      w = Math.min(1, prog / 0.1, (1 - prog) / 0.1);
      aimBone(b.rArm, b.rFore, target);
      aimBone(b.rFore, b.rHand, target);
      return;
    }

    const { origin, dir, near } = this.aimRay(false);
    this.ray.set(origin, dir);
    this.ray.near = near;
    this.ray.far = 60;
    const hit = this.ray.intersectObjects(this.world.shootables, false)[0];
    const aimPoint = origin.clone().addScaledVector(dir, hit ? hit.distance : 30);
    aimBone(b.rArm, b.rFore, aimPoint);
    aimBone(b.rFore, b.rHand, aimPoint);
    // 왼손은 총 앞쪽(오른손에서 30cm 앞)을 받친다
    const grip = b.rHand.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 0.3);
    aimBone(b.lArm, b.lFore, grip);
    aimBone(b.lFore, b.lHand, grip);
  }

  // 조준선 기준 사격 원점/방향. 3인칭은 카메라에서 플레이어 앞까지의 구간은 무시한다
  aimRay(first) {
    this.camera.getWorldPosition(this._o);
    this.camera.getWorldDirection(this._d);
    let near = 0;
    if (!first) {
      const eye = this.player.position.clone();
      eye.y += this.player.eyeHeight;
      near = Math.max(0, this._o.distanceTo(eye) - 0.35);
    }
    return { origin: this._o, dir: this._d, near };
  }

  muzzleWorld(first, origin, dir) {
    const src = first ? (this.view?.visible ? this.view : null) : this.held;
    if (src) return src.userData.muzzle.getWorldPosition(this._m);
    return this._m.copy(origin).addScaledVector(dir, 0.3);
  }

  shoot(first) {
    const w = this.current;
    this.ammo[w.id]--;
    this.cool = 60 / w.rpm;
    this.stats.shots++;
    const { origin, dir, near } = this.aimRay(first);
    const muzzle = this.muzzleWorld(first, origin, dir).clone();
    const base = (this.aiming ? w.aimSpread : w.spread) + this.heat * 0.01;
    if (w.auto) this.heat = Math.min(1, this.heat + 0.15);

    let best = 0, hitTarget = false;
    const d = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3();
    side.crossVectors(dir, THREE.Object3D.DEFAULT_UP).normalize();
    up.crossVectors(side, dir).normalize();
    for (let i = 0; i < w.pellets; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * base;
      d.copy(dir).addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      this.ray.set(origin, d);
      this.ray.near = near;
      this.ray.far = MAX_RANGE;
      const hit = this.ray.intersectObjects(this.world.shootables, false)[0];
      let end;
      if (hit) {
        end = hit.point;
        const target = hit.object.userData.target;
        const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : d.clone().negate();
        if (n.dot(d) > 0) n.negate(); // 뒷면을 맞춘 경우
        if (target) {
          const score = this.world.range.hit(target, hit.point, 0);
          if (score > 0) { hitTarget = true; best = Math.max(best, score); }
          this.fx.hole(hit.point, n, target.board);
        } else {
          this.fx.hole(hit.point, n);
        }
      } else {
        end = origin.clone().addScaledVector(d, MAX_RANGE);
      }
      this.fx.tracer(muzzle, end);
    }
    if (hitTarget) {
      this.stats.hits++;
      this.stats.score += best;
      this.ui.flashHit(best);
    }
    this.fx.muzzleFlash(muzzle);
    playShot(w.sound);
    this.rig.kick(w.recoil * (this.aiming ? 0.6 : 1) * (this.pip ? 0.5 : 1));
    this.kickZ = 0.04;
  }

  // 칼 휘두르기
  swing(first) {
    const w = this.current;
    this.cool = 60 / w.rpm;
    this.swingT = SWING_T;
    this.stats.shots++;
    playSwing();
    this.meleeHit(first, w.reach, 5, true);
  }

  // 주먹 (맨손). 왼손/오른손 번갈아
  punch(first) {
    this.cool = 0.45;
    this.swingT = SWING_T;
    this.punchSide = -this.punchSide;
    this.stats.shots++;
    playPunch();
    this.meleeHit(first, 1.3, 3, false);
  }

  // 근접 판정: 조준선 방향 reach 안의 첫 물체. 표적이면 점수, mark 면 자국을 남긴다
  meleeHit(first, reach, score, mark) {
    const { origin, dir, near } = this.aimRay(first);
    this.ray.set(origin, dir);
    this.ray.near = near;
    this.ray.far = near + reach;
    const hit = this.ray.intersectObjects(this.world.shootables, false)[0];
    if (!hit) return;
    const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : dir.clone().negate();
    if (n.dot(dir) > 0) n.negate();
    const target = hit.object.userData.target;
    if (target) {
      const got = this.world.range.hit(target, hit.point, score);
      if (got > 0) { this.stats.hits++; this.stats.score += got; this.ui.flashHit(got); }
      if (mark) this.fx.hole(hit.point, n, target.board);
    } else if (mark) {
      this.fx.hole(hit.point, n);
    }
  }
}
