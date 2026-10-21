import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { CameraRig } from './cameraRig.js';
import { SkinStore, DEFAULT_SKINS } from './skins.js';
import { UI } from './ui.js';
import { WeaponSystem, WEAPONS } from './weapons.js';

const INTERACT_DIST = 1.6; // 문/선반과 상호작용할 수 있는 거리

// --- 렌더러 ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

// --- 씬 (참고 예제처럼 흰 배경 + 안개) ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
scene.fog = new THREE.FogExp2(0xffffff, 0.04);

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
function selectWeapon(id) {
  weapons.select(id);
  ui.toggleWeaponPanel(false);
  refreshModeText();
  syncPointerLock();
}

// 무기 선택: 숫자키 / 패널 / T 휠 / 스킨 교체 시 다시 손에 붙이기
ui.setWeapons(WEAPONS, selectWeapon);
ui.onResetScore = () => weapons.resetStats();
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

  // 상호작용 대상 (문 / 무기 선반) — 높이는 무시하고 바닥 평면 거리로 판단
  let near = null, nearDist = Infinity;
  const consider = (obj, center) => {
    const d = Math.hypot(center.x - player.position.x, center.z - player.position.z);
    if (d < INTERACT_DIST && d < nearDist) { near = obj; nearDist = d; }
  };
  for (const door of world.doors) consider(door, door.center);
  consider(world.range.rack, world.range.rack.center);
  if (near === world.range.rack) {
    ui.setPrompt('E  무기 선택');
    if (input.pressed('KeyE')) {
      ui.toggleWeaponPanel();
      syncPointerLock();
    }
  } else {
    ui.setPrompt(near ? `E  ${near.label} ${near.open ? '닫기' : '열기'}` : null);
    if (near && input.pressed('KeyE')) near.toggle();
  }
  for (const door of world.doors) door.update(dt);

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
  world.range.update(dt);

  ui.setRoom('현재: ' + world.roomAt(player.position.x, player.position.z).name);

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
  renderer.setAnimationLoop(frame); // 모니터 주사율에 맞춰 실행 (보통 60fps)
}

start().catch((err) => {
  console.error(err);
  ui.showError('로드 실패: ' + err.message);
});

// 디버그/테스트용
window.__game = { renderer, scene, camera, player, world, rig, skins, ui, input, weapons, setMode };
