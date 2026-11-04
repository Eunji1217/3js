import * as THREE from 'three';
import { UMCharacter, UM_DEFAULT } from './umchar.js';
import { QuaterniusCharacter } from './qchar.js';

// 다른 플레이어 (35단계): 서버가 10Hz 로 보내는 위치·방향·동작을 60fps 로 부드럽게 보간해서 그린다.
// 모델은 내 캐릭터와 같은 조립 코드(26단계)를 쓴다. 파일·링크 스킨은 받을 수 없으므로 기본 의상으로 보인다.

// 이름에서 고정된 색을 뽑는다 (같은 사람은 지도 점·이름표가 늘 같은 색). 밝은 파스텔 계열
export function playerColor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360}, 85%, 65%)`;
}

export class RemotePlayer {
  constructor(scene, info) {
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
    this.tag = makeNameTag(info.name, this.color);
    this.tag.position.y = 2.05;
    this.group.add(this.tag);
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
    this.qc?.dispose?.();
    this.tag.material.map?.dispose();
    this.tag.material.dispose();
  }
}

// 머리 위 이름표: 캔버스에 글자를 써서 항상 카메라를 보는 Sprite 로
export function makeNameTag(name, color = '#fff') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.roundRect(8, 8, 240, 48, 12); ctx.fill();
  ctx.fillStyle = color;
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(name).slice(0, 16), 128, 33);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(1.2, 0.3, 1);
  sprite.renderOrder = 10;
  return sprite;
}
