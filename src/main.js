import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { CameraRig } from './cameraRig.js';
import { SkinStore, DEFAULT_SKINS } from './skins.js';
import { UI } from './ui.js';
import { WeaponSystem, WEAPONS } from './weapons.js';
import { loadSave, clearSave, createAutoSave } from './save.js';
import { Inventory, ITEMS, consume } from './items.js';
import { DayNight } from './daynight.js';
import { WorldMap } from './map.js';
import { Vitals } from './vitals.js';
import { priceOf, VENDOR_DIST } from './town.js';
import { playHitThud } from './audio.js';

const INTERACT_DIST = 1.6; // 선반/고기/가스레인지와 상호작용할 수 있는 거리
const DOOR_DIST = 2.5;     // 문은 더 멀리서도 열린다 (3인칭에서는 가까워 보여도 실제로는 멀어서 E 가 인벤토리로 새던 문제)
const PANEL_W = 312;       // 스킨 패널 폭 + 오른쪽 여백. 쇼케이스 때 캐릭터를 패널 왼쪽 영역 가운데에 둔다
// 방에 처음 들어갈 때 한 번 띄우는 안내 (세션마다)
const ROOM_HINTS = {
  kitchen: '🍳 주방이에요. 가스레인지 앞에서 E 를 누르면 요리 도감이 열려요',
  range: '🎯 사격장이에요. 선반에서 E 로 무기를 고르고, G 로 연습 게임을 시작해요',
  yard: '🌳 마당이에요. 텃밭 호박은 E 로 딸 수 있어요',
  wild: '🐗 울타리 밖 들판. 동물을 쏘면 종류별 재료를 떨어뜨려요. 큰 동물은 반격하니 조심!',
  town: '🏪 광장이에요. 노점 앞에서 E 를 누르면 사고팔 수 있어요',
};
// 쇼케이스 동안 플레이어에게 주는 "아무 입력 없음" (이동·점프만 멈추고 애니메이션은 계속)
const NO_INPUT = { moveAxis: () => ({ x: 0, z: 0 }), running: false, pressed: () => false, isDown: () => false };

// 하늘·안개: 실내는 흰 배경 + 짙은 안개(참고 예제 느낌), 밖은 하늘색 + 옅은 안개. 방을 오가면 부드럽게 섞는다 (22단계)
const SKY = { indoor: { color: new THREE.Color(0xffffff), fog: 0.04 }, outdoor: { color: new THREE.Color(0xa9d4f5), fog: 0.009 } };

// --- 렌더러 ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

// --- 씬 (참고 예제처럼 흰 배경 + 안개. 밖에 나가면 SKY.outdoor 로 바뀐다) ---
const scene = new THREE.Scene();
scene.background = SKY.indoor.color.clone();
scene.fog = new THREE.FogExp2(SKY.indoor.color.getHex(), SKY.indoor.fog);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.03, 100); // near 가 작아야 조준 시 총이 잘리지 않는다
scene.add(camera); // 1인칭 무기 모델을 카메라에 붙여 렌더링하기 위해

const world = createWorld();
scene.add(world.group);

const player = new Player();
scene.add(player.group);

const input = new Input(renderer.domElement);
const rig = new CameraRig(camera, world);
const skins = new SkinStore();
const ui = new UI(skins, { onSelectSkin: (skin) => player.setSkin(skin) });
ui.onCustomChange = (params) => player.applyCustomParams(params); // 커스터마이저 슬라이더 → 부품 다시 조립
const weapons = new WeaponSystem({ scene, camera, player, world, rig, ui });
// 생존 (31단계): 체력·배고픔·돈. 낮밤 (30단계): 해·하늘·등불
const vitals = new Vitals();
const daynight = new DayNight(world.lights);
const fadeEl = document.getElementById('fade'), hurtEl = document.getElementById('hurt');
let seq = null; // 잠자기 / 쓰러지기 연출 { kind, t, done }. 진행 중에는 입력을 받지 않는다
let tempScope = false; // 3인칭에서 우클릭 조준 때문에 잠시 1인칭 스코프 시점으로 들어가 있는 중
function startSleep() {
  if (seq) return;
  seq = { kind: 'sleep', t: 0, done: false };
}
function startDeath() {
  if (seq?.kind === 'death') return;
  seq = { kind: 'death', t: 0, done: false };
  ui.toast('쓰러졌어요... 침대에서 깨어납니다', 3000);
}
function updateSeq(dt) {
  if (!seq) { fadeEl.style.opacity = 0; return; }
  seq.t += dt;
  const dur = seq.kind === 'sleep' ? 1.0 : 1.6; // 암전되는 시간. 다 어두워진 순간에 상태를 바꾼다
  if (!seq.done && seq.t >= dur) {
    seq.done = true;
    daynight.skipToMorning();
    if (seq.kind === 'sleep') {
      vitals.revive({ health: 100, hunger: Math.max(10, vitals.hunger - 15) }); // 자는 동안도 배는 고파진다
      ui.toast(`잘 잤어요. ${daynight.day}일차 아침, 체력 회복!`, 3000);
    } else {
      vitals.revive({ health: 100, hunger: 60 });
      player.position.set(2.2, 0, 2.4); player.heading = Math.PI; player.group.rotation.y = Math.PI; // 침대 옆
      world.animals.calmAll();
      ui.toast(`${daynight.day}일차 아침, 침대에서 깨어났어요. 가방은 그대로예요`, 3500);
    }
  }
  const hold = dur + 0.4, end = dur + 1.4;
  const o = seq.t < dur ? seq.t / dur : seq.t < hold ? 1 : 1 - (seq.t - hold) / (end - hold);
  fadeEl.style.opacity = Math.max(0, Math.min(1, o));
  if (seq.t >= end) seq = null;
}
vitals.onDeath = startDeath;
vitals.onDamage = () => { rig.kick(0.05); playHitThud(); };
world.animals.onAttack = (a) => { if (!seq) vitals.damage(a.species.dmg, a); };
// 먹기: 요리(sate 가 있는 것)만. F 는 가장 포만감 높은 것부터
function eat(id) {
  const it = ITEMS[id];
  if (!it?.sate || !inv.remove(id, 1)) return;
  vitals.eat(it);
  ui.setInventory(inv);
  ui.toast(`${it.icon} ${it.name} 먹음 · 배고픔 +${it.sate * 8}, 체력 +${it.sate * 2}`, 1800);
}
function eatBest() {
  const list = inv.list().filter((i) => i.sate).sort((a, b) => b.sate - a.sate);
  if (!list.length) { ui.toast('먹을 요리가 없어요. 주방 가스레인지에서 요리해 보세요', 2500); return; }
  eat(list[0].id);
}
ui.onEat = eat;
// 상점 (33단계): 팔면 돈이 들어오고, 사면 예비 탄약이나 재료가 들어온다
ui.onSell = (id, n) => {
  const take = Math.min(n, inv.count(id));
  if (take <= 0) return;
  inv.remove(id, take);
  vitals.money += priceOf(id) * take;
  ui.setInventory(inv);
  ui.renderShop();
};
ui.onBuy = (entry) => {
  if (vitals.money < entry.price) { ui.toast('돈이 모자라요'); return; }
  vitals.money -= entry.price;
  if (entry.ammo) { weapons.addAmmo(entry.ammo, entry.n); ui.toast(`${entry.name} ${entry.n}발 구매`); }
  else { inv.add(entry.item, 1); ui.toast(`${ITEMS[entry.item].icon} ${ITEMS[entry.item].name} 구매`); }
  ui.setInventory(inv);
  ui.renderShop();
};

// 마우스 잠금 정책: 1인칭이거나 무기를 들고 있으면 잠근다
// (드래그 없이 시점이 돌아가고, 좌클릭은 사격 전용이 된다). 패널/휠이 열려 있으면 푼다.
const wantsLock = () => !ui.anyPanelOpen && !ui.wheelOpen; // 맨손도 주먹을 쓰므로 항상 잠근다 (ESC 로 풀면 드래그 회전으로 대체)
function syncPointerLock() {
  if (wantsLock()) input.requestPointerLock();
  else input.exitPointerLock();
}
function refreshModeText() {
  if (rig.mode === 'first') ui.setMode('모드: 1인칭 (ESC로 마우스 해제, 클릭으로 다시 잠금)');
  else ui.setMode('모드: 3인칭 (ESC로 마우스 해제, 클릭으로 다시 잠금)');
}
ui.onPanelsChanged = () => { syncPointerLock(); syncShowcase(); }; // 패널이 열리면 마우스를 풀고, 다 닫히면 다시 잠근다
// 쇼케이스 (29단계): 스킨 선택·커스터마이저가 열려 있는 동안 캐릭터를 가운데 두고 돌려 보고, 주변은 흐리게
const focusEl = document.getElementById('focus');
function syncShowcase() {
  const on = ui.panelOpen || ui.charPanelOpen;
  if (on && !rig.showcase) {
    rig.enterShowcase(player, PANEL_W);
    if (rig.mode === 'first') setMode('third'); // 1인칭이면 몸이 안 보이므로 3인칭으로
  } else if (!on && rig.showcase) {
    const mode = rig.exitShowcase();
    if (mode && mode !== rig.mode) setMode(mode);
  }
  focusEl.classList.toggle('hidden', !on);
  document.body.classList.toggle('showcase', on); // HUD·핫바 숨김 (index.html 의 body.showcase)
  // 흐림 마스크의 선명한 구멍을 캐릭터가 있는 곳(패널 왼쪽 영역의 가운데)에 맞춘다
  const w = window.innerWidth;
  focusEl.style.setProperty('--fx', (w >= PANEL_W * 2.2 ? (w - PANEL_W) / 2 : w / 2) + 'px');
}
ui.onCustomizerOpen = () => rig.focusFace(player); // 커스터마이저는 얼굴 가까이에서 시작
function selectWeapon(id) {
  weapons.select(id);
  ui.toggleWeaponPanel(false);
  refreshModeText();
  syncPointerLock();
}

// 무기 선택: 숫자키 / 패널 / T 휠 / 스킨 교체 시 다시 손에 붙이기
ui.setWeapons(WEAPONS, selectWeapon);
ui.onResetScore = () => weapons.resetStats();

// 연습 게임 (G 키 / HUD 버튼 / 결과 창의 "다시 시작"): 사격장 안에서만 시작, 진행 중이면 중지
function toggleGame() {
  const g = world.range.game;
  if (g.state === 'running' || g.state === 'countdown') {
    world.range.stopGame();
    ui.toast('연습 게임 중지');
  } else if (world.roomAt(player.position.x, player.position.z).id === 'range') {
    world.range.startGame();
    ui.toggleGamePanel(false);
    syncPointerLock();
  } else {
    ui.toast('연습 게임은 사격장 안에서 시작할 수 있어요 (거실 오른쪽 문)');
  }
}
ui.onGameToggle = toggleGame;

// 인벤토리 (사냥·채집 재료, 만든 요리) — items.js 의 Inventory. 핫바와 인벤토리 창은 ui.setInventory 가 그린다
const inv = new Inventory();
ui.setInventory(inv);
let cooking = null; // { recipe, t } 요리 중이면 남은 시간
world.animals.onKill = (a) => ui.toast(`${a.species.name} 사냥 성공! 재료를 떨어뜨렸어요`, 2500);
ui.onCook = (recipe) => {
  if (cooking || !consume(inv, recipe)) return;
  cooking = { recipe, t: recipe.time };
  ui.setInventory(inv);
  ui.toggleInvPanel(false);
  syncPointerLock();
};
input.onToggleInventory = () => { ui.toggleInvPanel(); syncPointerLock(); };
input.onHotbarScroll = (dir) => ui.hotbarScroll(dir);
input.onEat = () => { if (!seq) eatBest(); };
// 지도 (34단계): 미니맵은 항상, 전체 지도는 M
const worldMap = new WorldMap(world, document.getElementById('minimap'), document.getElementById('mapBig'));
input.onToggleMap = () => { ui.toggleMap(); syncPointerLock(); };
document.getElementById('mapClose').addEventListener('click', () => { ui.toggleMap(false); syncPointerLock(); });
Promise.all([world.outdoor.ready, world.town.ready]).then(() => worldMap.drawStatic()); // 나무 위치는 배치가 끝나야 안다
world.animals.onHit = () => ui.flashHit('명중');

// --- 진행 저장 (25단계): 2초마다 localStorage 에 스냅샷. 시작할 때 restore 로 되돌린다 ---
const snapshot = () => ({
  pos: [player.position.x, player.position.y, player.position.z],
  heading: player.heading,
  cam: { mode: rig.mode, yaw: rig.yaw, pitch: rig.pitch, distance: rig.distance },
  weapon: weapons.current?.id ?? null,
  ammo: { ...weapons.ammo },
  stats: { ...weapons.stats },
  inv: { ...inv.counts },
  doors: world.doors.map((d) => d.open),
  vitals: vitals.snapshot(),
  reserve: { ...weapons.reserve },
  time: daynight.snapshot(),
});
const autoSave = createAutoSave(snapshot);
function restore(s) {
  if (!s) return false;
  if (s.pos) { player.position.set(s.pos[0], 0, s.pos[2]); player.heading = s.heading ?? 0; player.group.rotation.y = player.heading; }
  if (s.cam) { rig.yaw = s.cam.yaw ?? 0; rig.pitch = s.cam.pitch ?? 0.35; rig.distance = s.cam.distance ?? 3.5; setMode(s.cam.mode === 'first' ? 'first' : 'third'); }
  if (s.ammo) for (const k of Object.keys(weapons.ammo)) if (typeof s.ammo[k] === 'number') weapons.ammo[k] = s.ammo[k];
  if (s.stats) weapons.stats = { score: 0, shots: 0, hits: 0, ...s.stats };
  if (s.inv) { inv.load(s.inv); ui.setInventory(inv); }
  vitals.load(s.vitals);
  if (s.reserve) for (const k of Object.keys(weapons.reserve)) if (typeof s.reserve[k] === 'number') weapons.reserve[k] = s.reserve[k];
  daynight.load(s.time);
  if (Array.isArray(s.doors)) world.doors.forEach((d, i) => { if (typeof s.doors[i] === 'boolean') d.setOpen(s.doors[i], true); });
  if (s.weapon && WEAPONS.some((w) => w.id === s.weapon)) selectWeapon(s.weapon);
  return true;
}
document.getElementById('saveReset').addEventListener('click', () => {
  if (!confirm('저장된 진행 상황(위치·탄약·가방·돈·체력·날짜·점수)을 지우고 처음부터 시작할까요? 스킨은 남습니다.')) return;
  autoSave.stop(); // beforeunload / visibilitychange / 다음 프레임의 자동 저장을 모두 막는다
  clearSave();
  location.reload();
});
ui.onGameDismiss = () => world.range.dismissGame();
input.onSelectWeapon = (i) => selectWeapon(i === null ? null : WEAPONS[i]?.id ?? null);
player.onModelChanged = () => weapons.attachToPlayer();
input.onWheelKey = (down) => {
  if (down) {
    if (!ui.wheelOpen && !ui.anyPanelOpen) ui.openWheel(WEAPONS, weapons.current?.id ?? null, weapons.ammo);
  } else if (ui.wheelOpen) {
    selectWeapon(ui.closeWheel());
  }
};
input.onMove = (dx, dy) => ui.moveWheel(dx, dy);

// 좌상단 FPS 표시
const stats = new Stats();
document.body.appendChild(stats.dom);

function setMode(mode) {
  rig.setMode(mode);
  const first = mode === 'first';
  player.setVisible(!first);
  refreshModeText();
  syncPointerLock();
}
input.onToggleView = () => setMode(rig.mode === 'first' ? 'third' : 'first');
input.onToggleSkins = () => {
  ui.togglePanel();
  syncPointerLock();
};

// ESC 로 포인터락이 풀렸으면 캔버스 클릭으로 다시 잠근다
renderer.domElement.addEventListener('click', () => {
  if (wantsLock() && !input.pointerLocked) input.requestPointerLock();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 메인 루프 ---
const clock = new THREE.Clock();
const SCROLL_STEP = 40; // 휠 한 칸(보통 100) 보다 작게 잡아 트랙패드도 반응하게
let scrollAcc = 0, scrollCool = 0, scrollIdle = 0;
let lastRoomId = null;
const hintedRooms = new Set();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); // 탭 전환 등으로 튀는 값 방지
  // 조준경은 1인칭에서만 그려지므로, 3인칭에서 배율 총(소총·저격총)으로 우클릭 조준하면 그동안만 1인칭 스코프 시점으로 들어간다 (PUBG 식).
  // 3인칭 pitch(+ = 위에서 내려다봄)와 1인칭 pitch(+ = 위를 봄)는 부호가 반대라 전환할 때 뒤집는다
  const wantScope = !!weapons.current?.zoom && input.mouseDown(2) && !ui.anyPanelOpen && !ui.wheelOpen && input.pointerLocked && !seq && !rig.showcase;
  if (wantScope && rig.mode === 'third') { tempScope = true; rig.pitch = -rig.pitch; setMode('first'); }
  else if (!wantScope && tempScope) { tempScope = false; if (rig.mode === 'first') { rig.pitch = -rig.pitch; setMode('third'); } }
  const first = rig.mode === 'first';

  // 상호작용 대상 (문 / 무기 선반 / 떨어진 고기 / 가스레인지) — 높이는 무시하고 바닥 평면 거리로 가장 가까운 것 하나
  let near = null, nearDist = Infinity, nearKind = null;
  const consider = (obj, center, kind, maxDist = INTERACT_DIST) => {
    const d = Math.hypot(center.x - player.position.x, center.z - player.position.z);
    if (d < maxDist && d < nearDist) { near = obj; nearDist = d; nearKind = kind; }
  };
  for (const door of world.doors) consider(door, door.center, 'door', DOOR_DIST);
  consider(world.range.rack, world.range.rack.center, 'rack');
  for (const it of world.animals.items) consider(it, it.group.position, 'meat');
  for (const p of world.outdoor.pickups) if (p.obj.visible) consider(p, p.center, 'pickup');
  consider(world.stove, world.stove.center, 'stove');
  consider(world.bedSpot, world.bedSpot.center, 'bed', 2.0);
  for (const v of world.town.vendors) consider(v, v.center, 'vendor', VENDOR_DIST);
  ui.setNearStove(nearKind === 'stove');
  // 채집물 다시 자라기
  for (const p of world.outdoor.pickups) if (!p.obj.visible && (p.timer -= dt) <= 0) p.obj.visible = true;
  const pressE = input.pressed('KeyE') && !ui.anyPanelOpen && !seq;
  if (cooking) {
    cooking.t -= dt;
    ui.setPrompt(`${cooking.recipe.name} 요리 중... ${Math.max(0, cooking.t).toFixed(1)}초`);
    if (cooking.t <= 0) {
      inv.add(cooking.recipe.result, 1);
      ui.setInventory(inv);
      ui.toast(`${ITEMS[cooking.recipe.result].icon} ${cooking.recipe.name} 완성!`);
      cooking = null;
    }
  } else if (nearKind === 'rack') {
    ui.setPrompt('E  무기 선택');
    if (pressE) { ui.toggleWeaponPanel(); syncPointerLock(); }
  } else if (nearKind === 'meat') {
    ui.setPrompt(`E  ${near.label} 줍기`);
    if (pressE) { world.animals.pickup(near); inv.add(near.id, 1); ui.setInventory(inv); ui.toast(`${ITEMS[near.id].icon} ${near.label} 획득 (${inv.count(near.id)}개)`); }
  } else if (nearKind === 'pickup') {
    ui.setPrompt(`E  ${near.label} 따기`);
    if (pressE) { near.obj.visible = false; near.timer = near.respawn; inv.add(near.id, 1); ui.setInventory(inv); ui.toast(`${ITEMS[near.id].icon} ${near.label} 획득 (${inv.count(near.id)}개)`); }
  } else if (nearKind === 'stove') {
    ui.setPrompt('E  요리하기 (배합법 보기)');
    if (pressE) { ui.toggleInvPanel(true, 'recipes'); syncPointerLock(); }
  } else if (nearKind === 'bed') {
    ui.setPrompt(`E  잠자기 (${daynight.night ? '아침까지' : '다음 날 아침까지'} · 체력 회복)`);
    if (pressE) startSleep();
  } else if (nearKind === 'vendor') {
    ui.setPrompt(`E  ${near.name} — ${near.greet}`);
    if (pressE) { ui.openShop(near, { inv, vitals, priceOf }); syncPointerLock(); }
  } else if (nearKind === 'door') {
    ui.setPrompt(`E  ${near.label} ${near.open ? '닫기' : '열기'}`);
    if (pressE) near.toggle();
  } else {
    ui.setPrompt(null); // 상호작용할 게 없으면 E 는 아무 일도 하지 않는다 (인벤토리는 I 키로만. 갑자기 창이 뜨던 문제)
  }
  for (const door of world.doors) door.update(dt);
  if (input.pressed('KeyG') && !ui.wheelOpen) toggleGame();

  // 무기: 패널/휠이 닫혀 있고 마우스가 잠겨 있을 때만 사격 (잠금 전 클릭은 잠그기용)
  const canFire = !ui.anyPanelOpen && !ui.wheelOpen && input.pointerLocked && !seq;
  weapons.update(dt, input, first, canFire);

  if (rig.showcase && input.pressed('Mouse0')) rig.stopAutoSpin(); // 화면을 누르면 자동 회전 멈춤 (캔버스 mousedown 만 잡히므로 패널 클릭은 무관)
  // 쇼케이스 중에는 이동·점프를 받지 않는다 (카메라를 돌리는 드래그가 이동으로 새지 않게)
  player.update(dt, rig.showcase || seq ? NO_INPUT : input, rig.yaw, world, !rig.showcase && (first || weapons.aiming || weapons.swinging));
  weapons.poseArms(dt, first); // 3인칭 조준 자세 / 칼 휘두르기 (애니메이션 위에 덮어쓰기)
  const mouse = input.consume();
  if (ui.wheelOpen) { mouse.dx = 0; mouse.dy = 0; } // 휠을 고르는 동안은 시점을 돌리지 않는다
  // 스크롤 = 무기 넘기기 (맨손 포함). 트랙패드처럼 작은 값이 이어져도 한 번에 한 칸만 넘어가게 누적 + 쿨다운
  scrollCool = Math.max(0, scrollCool - dt);
  if (mouse.wheel !== 0 && !ui.anyPanelOpen && !ui.wheelOpen) {
    if (scrollCool <= 0) scrollAcc += mouse.wheel; // 전환 직후 잠깐 들어오는 꼬리 입력은 버린다
    scrollIdle = 0;
    if (Math.abs(scrollAcc) >= SCROLL_STEP && scrollCool <= 0) {
      selectWeapon(weapons.cycle(scrollAcc));
      scrollAcc = 0;
      scrollCool = 0.18;
    }
  } else if ((scrollIdle += dt) > 0.25) {
    scrollAcc = 0; // 한동안 입력이 없으면 누적 초기화 (작은 값이 띄엄띄엄 와도 합산되게 바로 지우지는 않는다)
  }
  // 3인칭 카메라 거리는 - / = 키 (휠은 무기 전환에 쓰므로). 쇼케이스에서는 휠이 그대로 확대/축소
  if (!rig.showcase) mouse.wheel = ((input.isDown('Minus') ? 1 : 0) - (input.isDown('Equal') ? 1 : 0)) * dt * 2500;
  rig.update(dt, player, mouse, weapons.aiming ? weapons.aimFov : null, weapons.aiming ? weapons.sensFov : null);
  world.range.update(dt); // 표적 넘어짐·왕복 + 연습 게임 타이머
  const room = world.roomAt(player.position.x, player.position.z);
  world.update(dt, player.position, !room.outdoor); // 동물·고기·상인. 실내에 있으면 동물이 쫓아오길 포기한다
  // 시간·생존 (30~31단계)
  daynight.update(dt, player.position);
  if (!seq) vitals.update(dt);
  updateSeq(dt);
  hurtEl.style.opacity = vitals.hurtT > 0 ? Math.min(1, vitals.hurtT / 0.4) * 0.7 : vitals.health < 25 ? 0.25 + 0.15 * Math.sin(performance.now() / 150) : 0;
  ui.setVitals(vitals, daynight.timeText());
  worldMap.update(player, rig.yaw, ui.mapPanelOpen);
  autoSave.update(dt);
  ui.setGame(world.range.game);

  ui.setRoom('현재: ' + room.name);
  // 방이 바뀌면 (처음 한 번) 그 방에서 할 수 있는 일을 알려 준다
  if (room.id !== lastRoomId) {
    lastRoomId = room.id;
    if (ROOM_HINTS[room.id] && !hintedRooms.has(room.id)) { hintedRooms.add(room.id); ui.toast(ROOM_HINTS[room.id], 4500); }
  }
  // 하늘·안개 전환 (실내 ↔ 실외, 낮 ↔ 밤). 프레임 독립 보간
  const sky = daynight.skyFor(room.outdoor);
  const k = 1 - Math.exp(-dt * 3);
  scene.background.lerp(sky.color, k);
  scene.fog.color.copy(scene.background);
  scene.fog.density += (sky.fog - scene.fog.density) * k;

  weapons.renderScope(renderer, scene); // 조준경 렌즈 안 확대 화면
  renderer.render(scene, camera);
  stats.update();
}

async function start() {
  await Promise.all([player.loadSource(), skins.init()]);
  ui.refresh();
  try {
    await player.setSkin(skins.selected);
  } catch (err) {
    console.error('저장된 스킨 로드 실패, 기본 스킨 사용:', err);
    skins.select(DEFAULT_SKINS[0].id);
    await player.setSkin(DEFAULT_SKINS[0]);
  }
  ui.refresh();
  ui.hideLoading();
  setMode('third');
  if (restore(loadSave())) ui.toast('이전 진행 상황을 불러왔어요 (HUD 의 "진행 초기화"로 처음부터)', 3000);
  renderer.setAnimationLoop(frame); // 모니터 주사율에 맞춰 실행 (보통 60fps)
}

start().catch((err) => {
  console.error(err);
  ui.showError('로드 실패: ' + err.message);
});

// 디버그/테스트용
window.__game = { renderer, scene, camera, player, world, rig, skins, ui, input, weapons, setMode, THREE, inv, snapshot, restore, autoSave, vitals, daynight, eat, startSleep };
