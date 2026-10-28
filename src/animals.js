import * as THREE from 'three';
import { asset } from './paths.js';
import { createKit } from './furniture.js';
import { ANIMAL_ZONE } from './outdoor.js';
import { ITEMS, rollDrops } from './items.js';

// 울타리 밖 들판의 동물. Kenney Cube Pets (CC0, 애니메이션 idle/walk/run/eat 포함).
// 돌아다니다가(wander) 플레이어가 가까이 오면 달아나고(flee), 맞아서 HP 가 0 이 되면 쓰러진 뒤 고기를 떨어뜨린다.
// 큰 동물은 맞으면 반격한다(attack, 32단계): 플레이어를 쫓아와 dmg 만큼 체력을 깎는다. dmg 0 인 작은 동물은 도망만 간다.

export const SPECIES = [
  { id: 'cow', name: '소', scale: 0.8, hp: 3, speed: 1.0, run: 3.0, meat: 3, dmg: 15 },
  { id: 'pig', name: '돼지', scale: 0.6, hp: 2, speed: 1.1, run: 3.2, meat: 2, dmg: 8 },
  { id: 'deer', name: '사슴', scale: 0.8, hp: 2, speed: 1.4, run: 5.0, meat: 2, dmg: 10 },
  { id: 'hog', name: '멧돼지', scale: 0.65, hp: 3, speed: 1.2, run: 4.0, meat: 2, dmg: 14 },
  { id: 'bunny', name: '토끼', scale: 0.3, hp: 1, speed: 1.6, run: 5.0, meat: 1, dmg: 0 },
  { id: 'fox', name: '여우', scale: 0.45, hp: 1, speed: 1.6, run: 5.0, meat: 1, dmg: 6 },
  { id: 'chick', name: '병아리', scale: 0.25, hp: 1, speed: 0.8, run: 2.5, meat: 1, dmg: 0 },
];
const COUNT = 12;          // 동시에 있는 동물 수
const RESPAWN = 25;        // 죽은 뒤 새 동물이 나오기까지(초)
const FLEE_DIST = 7;       // 이 거리 안에 플레이어가 오면 달아난다
const CALM_DIST = 14;      // 이만큼 멀어지면 다시 어슬렁거린다
const PICK_DIST = 1.6;     // 고기 줍는 거리
const ATTACK_DIST = 1.5;   // 이 거리 안에서 들이받는다
const ATTACK_COOL = 1.3;   // 공격 간격(초)
const GIVE_UP = 14;        // 이만큼 쫓다가 포기한다(초)
const LOSE_DIST = 30;      // 이만큼 멀어지면 포기
// 쫓아올 때는 들판보다 넓게 움직일 수 있다 (울타리 바로 바깥까지. 마당 안으로는 못 들어온다)
const AGGRO_ZONE = { minX: ANIMAL_ZONE.minX - 10, maxX: ANIMAL_ZONE.maxX + 10, minZ: 24, maxZ: ANIMAL_ZONE.maxZ + 6 };

const _v = new THREE.Vector3();

class Animal {
  constructor(species, obj, clips, x, z, hooks = {}) {
    this.species = species;
    this.obj = obj;
    this.hooks = hooks;      // { onAttack(animal) }
    this.hp = species.hp;
    this.state = 'idle';     // idle | walk | flee | attack | dead
    this.timer = 1 + Math.random() * 3;
    this.atkCool = 0;
    this.target = new THREE.Vector3();
    this.dead = false;
    this.fallT = 0;
    this.flash = 0;
    this.heading = Math.random() * Math.PI * 2;
    obj.position.set(x, 0, z);
    obj.rotation.y = this.heading;
    // 맞았을 때 빨갛게 번쩍이려면 재질이 동물마다 따로 있어야 한다 (clone 은 재질을 공유하므로 여기서 복제)
    this.mats = [];
    obj.traverse((m) => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      m.userData.animal = this; // 총알 레이캐스트가 맞춘 메시에서 동물을 찾는 고리
      this.mats.push(m.material);
    });
    // 애니메이션: 클립은 노드 이름으로 바인딩되므로 clone 한 모델에도 그대로 붙는다
    this.mixer = new THREE.AnimationMixer(obj);
    this.actions = {};
    for (const name of ['idle', 'walk', 'run', 'eat']) {
      const clip = clips.find((c) => c.name === name);
      if (clip) this.actions[name] = this.mixer.clipAction(clip);
    }
    this.current = null;
    this.play('idle');
  }

  play(name) {
    const a = this.actions[name] || this.actions.idle;
    if (!a || a === this.current) return;
    a.reset().fadeIn(0.2).play();
    this.current?.fadeOut(0.2);
    this.current = a;
  }

  // 들판 안의 임의의 점을 다음 목적지로
  pickTarget() {
    const Z = ANIMAL_ZONE;
    this.target.set(Z.minX + Math.random() * (Z.maxX - Z.minX), 0, Z.minZ + Math.random() * (Z.maxZ - Z.minZ));
  }

  update(dt, playerPos, playerSafe = false) {
    const p = this.obj.position;
    if (this.dead) {
      // 옆으로 쓰러진다 (0.5초), 그 뒤는 animals.update 가 치운다
      this.fallT = Math.min(1, this.fallT + dt * 2);
      const e = 1 - (1 - this.fallT) ** 3;
      this.obj.rotation.z = (Math.PI / 2) * e;
      this.mixer.update(dt);
      return;
    }
    if (this.flash > 0) {
      this.flash -= dt;
      const k = Math.max(0, this.flash / 0.15);
      for (const m of this.mats) m.emissive.setRGB(k, 0, 0);
    }
    const dPlayer = Math.hypot(playerPos.x - p.x, playerPos.z - p.z);
    if (this.state !== 'flee' && this.state !== 'attack' && dPlayer < FLEE_DIST) {
      this.state = 'flee';
      this.timer = 2;
    }
    let speed = 0;
    if (this.state === 'attack') {
      // 반격: 플레이어를 향해 달리고, 닿으면 일정 간격으로 들이받는다. 너무 오래/멀리/실내면 포기하고 달아난다
      this.timer -= dt;
      if (playerSafe || this.timer <= 0 || dPlayer > LOSE_DIST) { this.state = 'flee'; this.timer = 2.5; }
      _v.set(playerPos.x - p.x, 0, playerPos.z - p.z).normalize();
      this.heading = Math.atan2(_v.x, _v.z);
      this.atkCool -= dt;
      if (dPlayer > ATTACK_DIST) { speed = this.species.run; this.play('run'); }
      else {
        this.play('eat'); // 머리를 숙이는 동작을 들이받기로 쓴다
        if (this.atkCool <= 0) { this.atkCool = ATTACK_COOL; this.hooks.onAttack?.(this); }
      }
    } else if (this.state === 'flee') {
      // 플레이어 반대쪽으로. 들판 가장자리에 몰리면 비스듬히 튼다
      _v.set(p.x - playerPos.x, 0, p.z - playerPos.z).normalize();
      const Z = ANIMAL_ZONE, M = 2;
      if ((p.x < Z.minX + M && _v.x < 0) || (p.x > Z.maxX - M && _v.x > 0)) _v.x = -_v.x;
      if ((p.z < Z.minZ + M && _v.z < 0) || (p.z > Z.maxZ - M && _v.z > 0)) _v.z = -_v.z;
      this.heading = Math.atan2(_v.x, _v.z);
      speed = this.species.run;
      this.play('run');
      this.timer -= dt;
      if (this.timer <= 0 && dPlayer > CALM_DIST) { this.state = 'idle'; this.timer = 1 + Math.random() * 2; }
    } else if (this.state === 'walk') {
      _v.subVectors(this.target, p);
      _v.y = 0;
      const d = _v.length();
      if (d < 0.3) { this.state = 'idle'; this.timer = 1.5 + Math.random() * 3; }
      else { this.heading = Math.atan2(_v.x, _v.z); speed = this.species.speed; this.play('walk'); }
    } else {
      this.play(this.timer > 2 ? 'eat' : 'idle');
      this.timer -= dt;
      if (this.timer <= 0) { this.state = 'walk'; this.pickTarget(); }
    }
    if (speed > 0) {
      p.x += Math.sin(this.heading) * speed * dt;
      p.z += Math.cos(this.heading) * speed * dt;
      const Z = this.state === 'attack' ? AGGRO_ZONE : ANIMAL_ZONE;
      p.x = THREE.MathUtils.clamp(p.x, Z.minX, Z.maxX);
      p.z = THREE.MathUtils.clamp(p.z, Z.minZ, Z.maxZ);
    }
    // 부드럽게 방향 전환 (플레이어와 같은 방식)
    let diff = this.heading - this.obj.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.obj.rotation.y += diff * Math.min(1, 8 * dt);
    this.mixer.update(dt);
  }
}

/** 떨어진 아이템 모양 (주워서 인벤토리에 넣는다). 종류별로 간단한 도형 */
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
function makeItemMesh(id) {
  const g = new THREE.Group();
  const tags = ITEMS[id]?.tags || [];
  if (id === 'bone') {
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.36, 8), std(0xf2eee4));
    bone.rotation.z = Math.PI / 2;
    const k1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), std(0xf2eee4)); k1.position.x = -0.18;
    const k2 = k1.clone(); k2.position.x = 0.18;
    g.add(bone, k1, k2);
  } else if (id === 'fat') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.18), std(0xf4e2b0)); g.add(m);
  } else if (id === 'egg') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), std(0xfaf3e0, { roughness: 0.4 })); m.scale.set(1, 1.3, 1); g.add(m);
  } else {
    // 고기: 종마다 색만 다르게
    const colors = { beef: 0xc8484e, pork: 0xe8a0a8, boar: 0x9a3a3a, venison: 0x8a3a2a, rabbit: 0xe0b0a8, foxmeat: 0xd07060, chicken: 0xf0c8a0 };
    const meat = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), std(colors[id] || 0xc8484e));
    meat.scale.set(1.3, 0.7, 1);
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), std(0xf2eee4));
    bone.rotation.z = Math.PI / 2;
    bone.position.set(0.22, 0, 0);
    g.add(meat, bone);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/**
 * @param {object} ctx
 * @param {THREE.Group} ctx.group
 * @param {THREE.Object3D[]} ctx.shootables
 */
export function createAnimals({ group, shootables }) {
  const kit = createKit({ base: asset('models/pets/'), scale: 1, group, shootables: [] }); // 피격 목록은 동물 단위로 직접 관리
  const animals = [];
  const items = [];      // 바닥에 떨어진 고기
  const respawnQueue = []; // 남은 시간(초)
  const api = { animals, items, onKill: null, onHit: null, onAttack: null, ready: null };
  const hooks = { onAttack: (a) => api.onAttack?.(a) };

  async function spawn(species = SPECIES[Math.floor(Math.random() * SPECIES.length)]) {
    const Z = ANIMAL_ZONE;
    const x = Z.minX + 2 + Math.random() * (Z.maxX - Z.minX - 4), z = Z.minZ + 2 + Math.random() * (Z.maxZ - Z.minZ - 4);
    const { obj, clips } = await kit.place('animal-' + species.id, x, z, { scale: species.scale, collide: false });
    const a = new Animal(species, obj, clips, x, z, hooks);
    obj.traverse((m) => { if (m.isMesh) shootables.push(m); });
    animals.push(a);
    return a;
  }

  // 총알/칼이 맞췄을 때. 죽였으면 true
  api.hit = (animal, dmg, point) => {
    if (animal.dead) return false;
    animal.hp -= dmg;
    animal.flash = 0.15;
    api.onHit?.(animal, point);
    if (animal.hp > 0) {
      // 살아남았으면: 큰 동물은 반격, 작은 동물은 도망
      if (animal.species.dmg > 0) { animal.state = 'attack'; animal.timer = GIVE_UP; animal.atkCool = 0.5; }
      else { animal.state = 'flee'; animal.timer = 3; }
      return false;
    }
    animal.dead = true;
    animal.timer = 1.4; // 쓰러져 있다가 사라지는 시간
    // 더 이상 맞지 않게 피격 목록에서 뺀다
    animal.obj.traverse((m) => { if (m.isMesh) { const i = shootables.indexOf(m); if (i >= 0) shootables.splice(i, 1); } });
    api.onKill?.(animal);
    return true;
  };

  // 플레이어가 죽어 침대에서 깨어날 때: 쫓던 동물을 전부 진정시킨다
  api.calmAll = () => { for (const a of animals) if (a.state === 'attack') { a.state = 'idle'; a.timer = 2; } };

  api.pickup = (item) => {
    const i = items.indexOf(item);
    if (i < 0) return 0;
    items.splice(i, 1);
    group.remove(item.group);
    return 1;
  };

  /** 플레이어 근처의 고기 (없으면 null) */
  api.nearestItem = (pos) => {
    let best = null, bd = PICK_DIST;
    for (const it of items) {
      const d = Math.hypot(it.group.position.x - pos.x, it.group.position.z - pos.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  };

  let t = 0;
  api.update = (dt, playerPos, playerSafe = false) => {
    t += dt;
    for (let i = animals.length - 1; i >= 0; i--) {
      const a = animals[i];
      a.update(dt, playerPos, playerSafe);
      if (a.dead) {
        a.timer -= dt;
        if (a.timer <= 0) {
          // 치우고 고기를 떨어뜨린다
          group.remove(a.obj);
          animals.splice(i, 1);
          // 종별 드롭 표(items.js DROPS)를 굴려 떨어뜨린다
          for (const id of rollDrops(a.species.id)) {
            const g = makeItemMesh(id);
            g.position.set(a.obj.position.x + (Math.random() - 0.5) * 1.0, 0.15, a.obj.position.z + (Math.random() - 0.5) * 1.0);
            g.userData.phase = Math.random() * 6.28;
            group.add(g);
            items.push({ group: g, id, label: ITEMS[id].name });
          }
          respawnQueue.push(RESPAWN);
        }
      }
    }
    for (const it of items) {
      it.group.position.y = 0.15 + Math.sin(t * 3 + it.group.userData.phase) * 0.04;
      it.group.rotation.y += dt;
    }
    for (let i = respawnQueue.length - 1; i >= 0; i--) {
      respawnQueue[i] -= dt;
      if (respawnQueue[i] <= 0) { respawnQueue.splice(i, 1); spawn(); }
    }
  };

  api.ready = Promise.all(Array.from({ length: COUNT }, (_, i) => spawn(SPECIES[i % SPECIES.length])));
  return api;
}
