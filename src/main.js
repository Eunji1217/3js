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

const INTERACT_DIST = 1.6; // 문/선반/고기/가스레인지와 상호작용할 수 있는 거리
const COOK_TIME = 2.5;     // 고기 한 덩이 굽는 시간(초)
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
ui.onPanelsChanged = syncPointerLock; // 패널이 열리면 마우스를 풀고, 다 닫히면 다시 잠근다
ui.onCustomizerOpen = () => {
  // 3인칭으로 바꾸고 캐릭터 정면에서 가까이 본다 (yaw 가 heading 과 같으면 카메라가 얼굴 쪽에 선다)
  if (rig.mode === 'first') setMode('third');
  rig.yaw = player.heading;
  rig.pitch = 0.05;
  rig.distance = 2.4;
};
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

// 인벤토리 (사냥한 고기 / 주방에서 구운 고기)
const inv = { raw: 0, cooked: 0 };
let cooking = 0; // 남은 요리 시간. 0 이면 요리 중이 아님
world.animals.onKill = (a) => ui.toast(`${a.species.name} 사냥 성공! 고기 ${a.species.meat}개를 떨어뜨렸어요`, 2500);
world.animals.onHit = () => ui.flashHit('명중');

// --- 진행 저장 (25단계): 2초마다 localStorage 에 스냅샷. 시작할 때 restore 로 되돌린다 ---
const snapshot = () => ({
  pos: [player.position.x, player.position.y, player.position.z],
  heading: player.heading,
  cam: { mode: rig.mode, yaw: rig.yaw, pitch: rig.pitch, distance: rig.distance },
  weapon: weapons.current?.id ?? null,
  ammo: { ...weapons.ammo },
  stats: { ...weapons.stats },
  inv: { ...inv },
  doors: world.doors.map((d) => d.open),
});
const autoSave = createAutoSave(snapshot);
function restore(s) {
  if (!s) return false;
  if (s.pos) { player.position.set(s.pos[0], 0, s.pos[2]); player.heading = s.heading ?? 0; player.group.rotation.y = player.heading; }
  if (s.cam) { rig.yaw = s.cam.yaw ?? 0; rig.pitch = s.cam.pitch ?? 0.35; rig.distance = s.cam.distance ?? 3.5; setMode(s.cam.mode === 'first' ? 'first' : 'third'); }
  if (s.ammo) for (const k of Object.keys(weapons.ammo)) if (typeof s.ammo[k] === 'number') weapons.ammo[k] = s.ammo[k];
  if (s.stats) weapons.stats = { score: 0, shots: 0, hits: 0, ...s.stats };
  if (s.inv) { inv.raw = s.inv.raw | 0; inv.cooked = s.inv.cooked | 0; ui.setInventory(inv); }
  if (Array.isArray(s.doors)) world.doors.forEach((d, i) => { if (typeof s.doors[i] === 'boolean') d.setOpen(s.doors[i], true); });
  if (s.weapon && WEAPONS.some((w) => w.id === s.weapon)) selectWeapon(s.weapon);
  return true;
}
document.getElementById('saveReset').addEventListener('click', () => {
  if (!confirm('저장된 진행 상황(위치·탄약·고기·점수)을 지우고 처음부터 시작할까요? 스킨은 남습니다.')) return;
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
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); // 탭 전환 등으로 튀는 값 방지
  const first = rig.mode === 'first';

  // 상호작용 대상 (문 / 무기 선반 / 떨어진 고기 / 가스레인지) — 높이는 무시하고 바닥 평면 거리로 가장 가까운 것 하나
  let near = null, nearDist = Infinity, nearKind = null;
  const consider = (obj, center, kind) => {
    const d = Math.hypot(center.x - player.position.x, center.z - player.position.z);
    if (d < INTERACT_DIST && d < nearDist) { near = obj; nearDist = d; nearKind = kind; }
  };
  for (const door of world.doors) consider(door, door.center, 'door');
  consider(world.range.rack, world.range.rack.center, 'rack');
  for (const it of world.animals.items) consider(it, it.group.position, 'meat');
  consider(world.stove, world.stove.center, 'stove');
  const pressE = input.pressed('KeyE');
  if (cooking > 0) {
    cooking -= dt;
    ui.setPrompt(`요리 중... ${cooking.toFixed(1)}초`);
    if (cooking <= 0) { cooking = 0; inv.cooked++; ui.setInventory(inv); ui.toast('고기를 구웠어요! (익힌 고기 +1)'); }
  } else if (nearKind === 'rack') {
    ui.setPrompt('E  무기 선택');
    if (pressE) { ui.toggleWeaponPanel(); syncPointerLock(); }
  } else if (nearKind === 'meat') {
    ui.setPrompt(`E  ${near.label} 줍기`);
    if (pressE) { inv.raw += world.animals.pickup(near); ui.setInventory(inv); ui.toast(`${near.label} 획득 (생고기 ${inv.raw})`); }
  } else if (nearKind === 'stove') {
    ui.setPrompt(inv.raw > 0 ? `E  요리하기 (생고기 ${inv.raw} → 익힌 고기)` : '가스레인지: 생고기가 있어야 요리할 수 있어요 (들판에서 사냥)');
    if (pressE && inv.raw > 0) { inv.raw--; cooking = COOK_TIME; ui.setInventory(inv); }
  } else if (nearKind === 'door') {
    ui.setPrompt(`E  ${near.label} ${near.open ? '닫기' : '열기'}`);
    if (pressE) near.toggle();
  } else {
    ui.setPrompt(null);
  }
  for (const door of world.doors) door.update(dt);
  if (input.pressed('KeyG') && !ui.wheelOpen) toggleGame();

  // 무기: 패널/휠이 닫혀 있고 마우스가 잠겨 있을 때만 사격 (잠금 전 클릭은 잠그기용)
  const canFire = !ui.anyPanelOpen && !ui.wheelOpen && input.pointerLocked;
  weapons.update(dt, input, first, canFire);

  player.update(dt, input, rig.yaw, world, first || weapons.aiming || weapons.swinging);
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
  // 3인칭 카메라 거리는 - / = 키 (휠은 무기 전환에 쓰므로)
  mouse.wheel = ((input.isDown('Minus') ? 1 : 0) - (input.isDown('Equal') ? 1 : 0)) * dt * 2500;
  rig.update(dt, player, mouse, weapons.aiming ? weapons.aimFov : null, weapons.aiming ? weapons.sensFov : null);
  world.range.update(dt); // 표적 넘어짐·왕복 + 연습 게임 타이머
  world.update(dt, player.position); // 동물·고기, 해 따라가기
  autoSave.update(dt);
  ui.setGame(world.range.game);

  const room = world.roomAt(player.position.x, player.position.z);
  ui.setRoom('현재: ' + room.name);
  // 하늘·안개 전환 (실내 ↔ 실외). 프레임 독립 보간
  const sky = room.outdoor ? SKY.outdoor : SKY.indoor;
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
window.__game = { renderer, scene, camera, player, world, rig, skins, ui, input, weapons, setMode, THREE, inv, snapshot, restore, autoSave };
