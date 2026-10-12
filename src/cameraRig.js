import * as THREE from 'three';

const SENS = 0.0025;
const WALL_MARGIN = 0.15;

// 3인칭 추적 카메라 + 1인칭 카메라를 한 객체로 관리한다.
export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.mode = 'third'; // 'third' | 'first'
    this.yaw = 0;
    this.pitch = 0.35;
    this.distance = 3.5;
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

  update(dt, player, mouse) {
    this.yaw -= mouse.dx * SENS;

    if (this.mode === 'first') {
      // 마우스를 위로 올리면 위를 본다
      this.pitch = THREE.MathUtils.clamp(this.pitch - mouse.dy * SENS, -1.4, 1.4);
      this.camera.position.copy(player.position);
      this.camera.position.y += player.eyeHeight;
      this.camera.rotation.set(this.pitch, this.yaw, 0);
      return;
    }

    // 3인칭: 플레이어 주위를 도는 구면 좌표
    this.pitch = THREE.MathUtils.clamp(this.pitch + mouse.dy * SENS, -0.2, 1.2);
    this.distance = THREE.MathUtils.clamp(this.distance + mouse.wheel * 0.002, 1.5, 6);

    // 높이는 천천히 따라가서 점프가 화면에 보이게 한다
    const ty = player.position.y + 1.4;
    if (this.targetY === undefined) this.targetY = ty;
    this.targetY += (ty - this.targetY) * Math.min(1, dt * 3);
    this.target.set(player.position.x, this.targetY, player.position.z);
    const cp = Math.cos(this.pitch);
    this.desired.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );

    // 벽/문/천장에 가려지면 카메라를 앞으로 당긴다 (문을 지나갈 때도 자연스럽게)
    this.dir.subVectors(this.desired, this.target);
    const len = this.dir.length();
    this.dir.normalize();
    this.ray.set(this.target, this.dir);
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

    // 부드러운 추적 (프레임 독립)
    const t = 1 - Math.exp(-dt * 12);
    this.camera.position.lerp(this.desired, t);
    this.camera.lookAt(this.target);
  }
}
