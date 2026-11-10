import * as THREE from 'three';
import { UMCharacter, UM_DEFAULT } from './umchar.js';
import { QuaterniusCharacter } from './qchar.js';
import { buildWeaponModel } from './weapons.js';

// 다른 플레이어 (35·37단계): 서버가 10Hz 로 보내는 위치·방향·동작을 60fps 로 부드럽게 보간해서 그린다.
// 모델은 내 캐릭터와 같은 조립 코드(26단계)를 쓴다. 파일·링크 스킨은 받을 수 없으므로 기본 의상으로 보인다.
// 37단계: 손에 든 무기, 머리 위 체력 바, 총알이 맞을 수 있는 보이지 않는 캡슐(hitMesh) 추가.

// 이름에서 고정된 색을 뽑는다 (같은 사람은 지도 점·이름표가 늘 같은 색). 밝은 파스텔 계열
export function playerColor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360}, 85%, 65%)`;
}

const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false }); // 보이지 않지만 Raycaster 에는 맞는다

export class RemotePlayer {
  /**
   * @param {THREE.Scene} scene
   * @param {{ id: number, name: string, skin?: object, state?: object }} info
   * @param {THREE.Object3D[]} [shootables] 총알 판정 목록 (world.shootables). 주면 피격 캡슐을 넣는다
   */
  constructor(scene, info, shootables = null) {
    this.scene = scene;
    this.id = info.id;
    this.name = info.name;
    this.color = playerColor(info.name);
    this.group = new THREE.Group(); // +Z 가 정면 (player.js 와 같은 규칙)
    this.target = { p: new THREE.Vector3(), h: 0, a: 'idle' };
    this.heading = 0;
    this.model = null;
    this.qc = null;
    this.mixer = null;
    this.actions = {};
    this.cur = null;
    this.version = 0;
    this.hp = 100;
    this.weaponId = null;
    this.held = null;
    this.tag = makeNameTag(info.name, this.color, this.hp);
    this.tag.position.y = 1.92;
    this.group.add(this.tag);
    // 피격 캡슐: 발밑~머리 위까지 (반지름 0.32, 전체 높이 약 1.95). 눈높이(1.65)로 쏴도 넉넉히 맞게. userData.remote 로 누가 맞았는지 안다
    this.hitMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.3, 2, 8), HIT_MAT);
    this.hitMesh.position.y = 0.97;
    this.hitMesh.userData.remote = this;
    this.group.add(this.hitMesh);
    this.shootables = shootables;
    if (shootables) shootables.push(this.hitMesh);
    scene.add(this.group);
    if (info.state) this.setState(info.state, true);
    this.setSkin(info.skin);
  }

  async setSkin(skin) {
    const v = ++this.version;
    const params = skin?.format === 'qchar' && skin.params ? skin.params : { ...UM_DEFAULT };
    const Cls = params.family === 'um' ? UMCharacter : QuaterniusCharacter;
    const qc = new Cls();
    let clips;
    try {
      [, clips] = await Promise.all([qc.apply(params), Cls.loadClips(params.gender)]);
    } catch (err) {
      console.warn('다른 플레이어 스킨 로드 실패:', err);
      return;
    }
    if (v !== this.version) { qc.dispose?.(); return; } // 그 사이 다른 스킨이 왔거나 나갔다
    if (this.model) { this.group.remove(this.model); this.qc?.dispose?.(); }
    const root = qc.root;
    root.updateMatrixWorld(true);
    const arm = qc.bone(qc.leftArm || 'upperarm_l');
    root.rotation.y = arm && arm.getWorldPosition(new THREE.Vector3()).x >= 0 ? 0 : Math.PI; // +Z 를 보게 (player.installQChar 와 같은 판정)
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.group.add(root);
    this.model = root;
    this.qc = qc;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = { idle: this.mixer.clipAction(clips.idle), walk: this.mixer.clipAction(clips.walk), run: this.mixer.clipAction(clips.run) };
    this.cur = null;
    this.play('idle');
    const w = this.weaponId; this.weaponId = null; this.setWeapon(w); // 새 모델의 손에 다시 붙인다
  }

  // 손에 든 무기 (37단계): 상태의 w 가 바뀌면 12단계 buildWeaponModel 을 오른손 뼈에 붙인다 (weapons.attachToPlayer 와 같은 방법)
  setWeapon(id) {
    if (id === this.weaponId) return;
    this.weaponId = id;
    this.held?.removeFromParent();
    this.held = null;
    if (!id || !this.qc) return;
    const um = this.qc instanceof UMCharacter;
    const hand = this.qc.bone(um ? 'WristR' : 'hand_r');
    if (!hand || !hand.parent) return;
    let model;
    try { model = buildWeaponModel(id, { shadows: false }); } catch { return; }
    hand.updateWorldMatrix(true, false);
    const s = hand.getWorldScale(new THREE.Vector3()).x || 1;
    model.scale.setScalar(1 / s);
    const hp = hand.getWorldPosition(new THREE.Vector3());
    const fp = hand.parent.getWorldPosition(new THREE.Vector3());
    const dirLocal = hp.sub(fp).normalize().transformDirection(new THREE.Matrix4().copy(hand.matrixWorld).invert()).normalize();
    model.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dirLocal);
    model.position.copy(dirLocal).multiplyScalar(0.07 / s);
    hand.add(model);
    this.held = model;
  }

  // 이름 바꾸기: 이름표와 색(지도 점도 같이)을 새로 만든다
  setName(name) {
    this.name = name;
    this.color = playerColor(name);
    this.redrawTag();
  }

  setHp(hp) {
    if (!Number.isFinite(hp) || hp === this.hp) return;
    this.hp = hp;
    this.redrawTag();
  }

  redrawTag() {
    this.group.remove(this.tag);
    this.tag.material.map?.dispose();
    this.tag.material.dispose();
    this.tag = makeNameTag(this.name, this.color, this.hp);
    this.tag.position.y = 1.92;
    this.group.add(this.tag);
  }

  play(name) {
    const a = this.actions[name] || this.actions.idle;
    if (!a || a === this.cur) return;
    a.reset().play();
    if (this.cur) this.cur.crossFadeTo(a, 0.2, false);
    this.cur = a;
  }

  setState(s, snap = false) {
    this.target.p.set(s.p[0], s.p[1], s.p[2]);
    this.target.h = s.h || 0;
    this.target.a = s.a || 'idle';
    if (snap) { this.group.position.copy(this.target.p); this.heading = this.target.h; }
    if (s.w !== undefined) this.setWeapon(s.w || null);
    if (s.hp !== undefined) this.setHp(s.hp);
  }

  update(dt) {
    // 10Hz 목표값을 향해 매 프레임 다가간다 (프레임 독립). 각도는 -π~π 로 감아서 짧은 쪽으로
    const k = 1 - Math.exp(-dt * 10);
    this.group.position.lerp(this.target.p, k);
    let d = this.target.h - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += d * k;
    this.group.rotation.y = this.heading;
    this.play(this.target.a);
    this.mixer?.update(dt);
  }

  dispose() {
    this.version++;
    this.scene.remove(this.group);
    if (this.shootables) { const i = this.shootables.indexOf(this.hitMesh); if (i >= 0) this.shootables.splice(i, 1); }
    this.hitMesh.geometry.dispose();
    this.qc?.dispose?.();
    this.tag.material.map?.dispose();
    this.tag.material.dispose();
  }
}

// 머리 위 이름표: 캔버스에 글자를 써서 항상 카메라를 보는 Sprite 로. hp 를 주면(다른 플레이어) 아래에 체력 바
export function makeNameTag(name, color = '#fff', hp = null) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(8, 8, 240, 48, 12); else ctx.rect(8, 8, 240, 48); // 구형 사파리에는 roundRect 가 없다
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(name).slice(0, 16), 128, hp === null ? 33 : 28);
  if (hp !== null) {
    const w = 200, x = 28, y = 46, h = 6;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = hp > 50 ? '#6fdc6f' : hp > 25 ? '#ffc94d' : '#ff5a5a';
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, hp / 100)), h);
  }
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(0.6, 0.15, 1); // 머리 위에 작게 (글자 높이 약 8cm)
  sprite.renderOrder = 10;
  return sprite;
}
