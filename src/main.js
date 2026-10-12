import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { CameraRig } from './cameraRig.js';
import { SkinStore, DEFAULT_SKINS } from './skins.js';
import { UI } from './ui.js';

const INTERACT_DIST = 1.6; // 문과 상호작용할 수 있는 거리

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

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 100);

const world = createWorld();
scene.add(world.group);

const player = new Player();
scene.add(player.group);

const input = new Input(renderer.domElement);
const rig = new CameraRig(camera, world);
const skins = new SkinStore();
const ui = new UI(skins, { onSelectSkin: (skin) => player.setSkin(skin) });

// 좌상단 FPS 표시
const stats = new Stats();
document.body.appendChild(stats.dom);

function setMode(mode) {
  rig.setMode(mode);
  const first = mode === 'first';
  player.setVisible(!first);
  ui.setMode(first ? '모드: 1인칭 (ESC로 마우스 해제)' : '모드: 3인칭');
  if (first) input.requestPointerLock();
  else input.exitPointerLock();
}
input.onToggleView = () => setMode(rig.mode === 'first' ? 'third' : 'first');
input.onToggleSkins = () => {
  ui.togglePanel();
  if (ui.panelOpen) input.exitPointerLock();
};

// 1인칭에서 ESC 로 포인터락이 풀리면 캔버스 클릭으로 다시 잠근다
renderer.domElement.addEventListener('click', () => {
  if (rig.mode === 'first' && !input.pointerLocked && !ui.panelOpen) input.requestPointerLock();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 메인 루프 ---
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); // 탭 전환 등으로 튀는 값 방지
  const first = rig.mode === 'first';

  // 문 상호작용
  let nearDoor = null, nearDist = Infinity;
  for (const door of world.doors) {
    // 높이는 무시하고 바닥 평면 거리로 판단
    const d = Math.hypot(door.center.x - player.position.x, door.center.z - player.position.z);
    if (d < INTERACT_DIST && d < nearDist) { nearDoor = door; nearDist = d; }
  }
  ui.setPrompt(nearDoor ? `E  ${nearDoor.label} ${nearDoor.open ? '닫기' : '열기'}` : null);
  if (nearDoor && input.pressed('KeyE')) nearDoor.toggle();
  for (const door of world.doors) door.update(dt);

  player.update(dt, input, rig.yaw, world, first);
  const mouse = input.consume();
  rig.update(dt, player, mouse);

  ui.setRoom('현재: ' + world.roomAt(player.position.x, player.position.z).name);

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
window.__game = { renderer, scene, player, world, rig, skins, ui, setMode };
