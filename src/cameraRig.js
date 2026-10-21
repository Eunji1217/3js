import * as THREE from 'three';

const SENS = 0.0025;
const WALL_MARGIN = 0.15;
const BASE_FOV = 60;
const AIM_DIST = 1.9;      // 3인칭 조준 시 카메라 거리
const SHOULDER = 0.65;     // 3인칭 조준 시 어깨 너머 오프셋

// 3인칭 추적 카메라 + 1인칭 카메라를 한 객체로 관리한다. 조준 중이면 FOV 를 줄이고(1인칭) 어깨 너머로 당긴다(3인칭).
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

  /**
   * @param {number} dt
   * @param {import('./player.js').Player} player
   * @param {{dx:number, dy:number, wheel:number}} mouse
   * @param {number|null} aimFov 조준 중이면 목표 FOV(도), 아니면 null
   * @param {number|null} sensFov 마우스 감도 기준 FOV (조준경 PIP 처럼 화면 FOV 와 실제 배율이 다를 때). 없으면 화면 FOV
   */
  update(dt, player, mouse, aimFov = null, sensFov = null) {
    const aim = aimFov !== null && aimFov !== undefined;
    // 줌 배율만큼 감도를 낮춘다
    const fovT = aim ? (this.mode === 'first' ? aimFov : Math.max(aimFov, 40)) : BASE_FOV;
    const sens = SENS * ((aim && sensFov ? Math.min(sensFov, fovT) : fovT) / BASE_FOV);
    if (Math.abs(this.camera.fov - fovT) > 0.01) {
      this.camera.fov += (fovT - this.camera.fov) * Math.min(1, dt * 14);
      this.camera.updateProjectionMatrix();
    }
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
    const cp = Math.cos(this.pitch);
    this.desired.set(
      this.target.x + Math.sin(this.yaw) * cp * dist,
      this.target.y + Math.sin(this.pitch) * dist,
      this.target.z + Math.cos(this.yaw) * cp * dist,
    );

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
    this.desired.y = THREE.MathUtils.clamp(this.desired.y, 0.3, this.world.height - m);

    // 부드러운 추적 (프레임 독립). 조준 중에는 빠르게 붙는다
    const t = 1 - Math.exp(-dt * (aim ? 20 : 12));
    this.camera.position.lerp(this.desired, t);
    this.camera.lookAt(this.target);
  }
}
