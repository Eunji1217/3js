import * as THREE from 'three';

const SENS = 0.0025;
const WALL_MARGIN = 0.15;
const BASE_FOV = 60;
const AIM_DIST = 1.9;      // 3인칭 조준 시 카메라 거리
const SHOULDER = 0.65;     // 3인칭 조준 시 어깨 너머 오프셋
const SC_AUTO_SPIN = 0.35; // 쇼케이스 자동 회전 속도 (rad/s). 한 바퀴에 약 18초
const SC_IDLE = 1.5;       // 드래그를 멈추고 이만큼 지나면 다시 자동 회전

// 3인칭 추적 카메라 + 1인칭 카메라를 한 객체로 관리한다. 조준 중이면 FOV 를 줄이고(1인칭) 어깨 너머로 당긴다(3인칭).
// 쇼케이스 모드(스킨 선택·커스터마이저)에서는 캐릭터 몸 중심을 가운데 두고 빙 돌며 본다 (29단계).
export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.mode = 'third'; // 'third' | 'first'
    this.yaw = 0;
    this.pitch = 0.35;
    this.distance = 3.5;
    this.shoulder = 0;
    this.target = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.ray = new THREE.Raycaster();
    this.camera.rotation.order = 'YXZ';
    this.showcase = null; // 쇼케이스 중이면 { mode, yaw, pitch, distance } (끝날 때 되돌릴 값)
    this.panelWidth = 0;  // 쇼케이스 때 오른쪽 패널 폭만큼 화면 중심을 왼쪽으로 민다
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'first') this.pitch = THREE.MathUtils.clamp(this.pitch, -1.4, 1.4);
    else this.pitch = THREE.MathUtils.clamp(this.pitch, -0.2, 1.2);
  }

  // 반동: 총구가 들리듯 위를 보게 한다 (모드마다 pitch 부호가 반대)
  kick(amount) {
    if (this.mode === 'first') this.pitch += amount;
    else this.pitch -= amount;
  }

  // --- 쇼케이스 (스킨 선택 / 커스터마이저) ---
  // 지금 시점을 저장해 두고 캐릭터 정면에서 시작한다. 모드는 main 이 3인칭으로 바꿔 준다.
  enterShowcase(player, panelWidth = 0) {
    if (!this.showcase) this.showcase = { mode: this.mode, yaw: this.yaw, pitch: this.pitch, distance: this.distance };
    this.panelWidth = panelWidth;
    this.scYaw = player.heading;     // yaw 가 heading 과 같으면 카메라가 얼굴 쪽에 선다
    this.scPitch = 0.08;
    this.scDist = 2.6;
    this.scIdle = SC_IDLE;           // 처음부터 천천히 돈다
    this.scSpin = true;              // 자동 회전. 화면을 클릭하면 꺼진다 (다시 열 때까지)
  }

  // 화면을 누르면 자동 회전을 멈춘다
  stopAutoSpin() {
    this.scSpin = false;
  }

  // 얼굴 가까이 (커스터마이저)
  focusFace(player) {
    if (!this.showcase) return;
    this.scYaw = player.heading;
    this.scPitch = 0.05;
    this.scDist = 2.2;
    this.scIdle = SC_IDLE;
  }

  // 시점을 쇼케이스 전으로 되돌린다. 되돌릴 모드를 반환한다 (main 이 setMode 로 반영)
  exitShowcase() {
    const s = this.showcase;
    if (!s) return null;
    this.showcase = null;
    this.yaw = s.yaw; this.pitch = s.pitch; this.distance = s.distance;
    this.camera.clearViewOffset();
    return s.mode;
  }

  // 패널이 가리지 않는 영역의 가운데에 캐릭터가 오게 투영 중심을 민다.
  // setViewOffset: (패널 폭만큼 더 넓은 가상 화면)에서 왼쪽 w×h 부분만 그리는 셈 → 가상 화면 중심이 실제 화면의 (w-패널)/2 에 온다
  applyViewOffset() {
    const w = window.innerWidth, h = window.innerHeight, pw = this.panelWidth;
    const v = this.camera.view;
    if (pw <= 0 || w < pw * 2.2) { if (v && v.enabled) this.camera.clearViewOffset(); return; }
    if (v && v.enabled && v.fullWidth === w + pw && v.fullHeight === h) return;
    this.camera.setViewOffset(w + pw, h, pw, 0, w, h);
  }

  /**
   * @param {number} dt
   * @param {import('./player.js').Player} player
   * @param {{dx:number, dy:number, wheel:number}} mouse
   * @param {number|null} aimFov 조준 중이면 목표 FOV(도), 아니면 null
   * @param {number|null} sensFov 마우스 감도 기준 FOV (조준경 PIP 처럼 화면 FOV 와 실제 배율이 다를 때). 없으면 화면 FOV
   */
  update(dt, player, mouse, aimFov = null, sensFov = null) {
    if (this.showcase) return this.updateShowcase(dt, player, mouse);
    const aim = aimFov !== null && aimFov !== undefined;
    // 줌 배율만큼 감도를 낮춘다
    const fovT = aim ? (this.mode === 'first' ? aimFov : Math.max(aimFov, 40)) : BASE_FOV;
    const sens = SENS * ((aim && sensFov ? Math.min(sensFov, fovT) : fovT) / BASE_FOV);
    this.lerpFov(fovT, dt);
    this.yaw -= mouse.dx * sens;

    if (this.mode === 'first') {
      // 마우스를 위로 올리면 위를 본다
      this.pitch = THREE.MathUtils.clamp(this.pitch - mouse.dy * sens, -1.4, 1.4);
      this.camera.position.copy(player.position);
      this.camera.position.y += player.eyeHeight;
      this.camera.rotation.set(this.pitch, this.yaw, 0);
      return;
    }

    // 3인칭: 플레이어 주위를 도는 구면 좌표
    this.pitch = THREE.MathUtils.clamp(this.pitch + mouse.dy * sens, aim ? -1.0 : -0.2, 1.2);
    if (!aim) this.distance = THREE.MathUtils.clamp(this.distance + mouse.wheel * 0.002, 1.5, 6);
    const dist = aim ? AIM_DIST : this.distance;
    this.shoulder += ((aim ? SHOULDER : 0) - this.shoulder) * Math.min(1, dt * 10);

    // 높이는 천천히 따라가서 점프가 화면에 보이게 한다
    const ty = player.position.y + (aim ? 1.5 : 1.4);
    if (this.targetY === undefined) this.targetY = ty;
    this.targetY += (ty - this.targetY) * Math.min(1, dt * 3);
    // 조준 중에는 시선 기준점을 오른쪽 어깨 쪽으로 비켜 둔다
    this.target.set(
      player.position.x + Math.cos(this.yaw) * this.shoulder,
      this.targetY,
      player.position.z - Math.sin(this.yaw) * this.shoulder,
    );
    this.orbit(this.yaw, this.pitch, dist);
    this.follow(dt, aim ? 20 : 12);
  }

  // 쇼케이스: 드래그로 돌리고 휠로 당기고, 가만히 두면 천천히 자동 회전
  updateShowcase(dt, player, mouse) {
    this.applyViewOffset();
    this.lerpFov(BASE_FOV, dt);
    if (mouse.dx !== 0 || mouse.dy !== 0) this.scIdle = 0;
    else this.scIdle += dt;
    this.scYaw -= mouse.dx * SENS;
    if (this.scSpin && this.scIdle >= SC_IDLE) this.scYaw += dt * SC_AUTO_SPIN;
    this.scPitch = THREE.MathUtils.clamp(this.scPitch + mouse.dy * SENS, -0.3, 0.9);
    this.scDist = THREE.MathUtils.clamp(this.scDist + mouse.wheel * 0.002, 1.3, 4.5);
    // 몸 중심 (키의 절반 조금 위)
    this.target.set(player.position.x, player.position.y + player.eyeHeight * 0.58, player.position.z);
    this.orbit(this.scYaw, this.scPitch, this.scDist);
    this.follow(dt, 10);
  }

  lerpFov(fovT, dt) {
    if (Math.abs(this.camera.fov - fovT) > 0.01) {
      this.camera.fov += (fovT - this.camera.fov) * Math.min(1, dt * 14);
      this.camera.updateProjectionMatrix();
    }
  }

  // target 을 중심으로 한 구면 좌표 → desired
  orbit(yaw, pitch, dist) {
    const cp = Math.cos(pitch);
    this.desired.set(
      this.target.x + Math.sin(yaw) * cp * dist,
      this.target.y + Math.sin(pitch) * dist,
      this.target.z + Math.cos(yaw) * cp * dist,
    );
  }

  // 벽/천장/경계에 막히면 당기고, 부드럽게 따라가 target 을 본다
  follow(dt, rate) {
    // 벽/문/천장에 가려지면 카메라를 앞으로 당긴다 (문을 지나갈 때도 자연스럽게)
    this.dir.subVectors(this.desired, this.target);
    const len = this.dir.length();
    this.dir.normalize();
    this.ray.set(this.target, this.dir);
    this.ray.near = 0;
    this.ray.far = len;
    const hits = this.ray.intersectObjects(this.world.wallMeshes, false);
    if (hits.length) {
      const d = Math.max(0.5, hits[0].distance - WALL_MARGIN);
      this.desired.copy(this.target).addScaledVector(this.dir, d);
    }

    // 안전 범위
    const b = this.world.bounds, m = 0.2;
    this.desired.x = THREE.MathUtils.clamp(this.desired.x, b.minX + m, b.maxX - m);
    this.desired.z = THREE.MathUtils.clamp(this.desired.z, b.minZ + m, b.maxZ - m);
    const ceil = this.world.ceilingAt ? this.world.ceilingAt(this.desired.x, this.desired.z) : this.world.height; // 실내는 천장, 밖은 하늘
    this.desired.y = THREE.MathUtils.clamp(this.desired.y, 0.3, ceil - m);

    // 부드러운 추적 (프레임 독립). 조준 중에는 빠르게 붙는다
    const t = 1 - Math.exp(-dt * rate);
    this.camera.position.lerp(this.desired, t);
    this.camera.lookAt(this.target);
  }
}
