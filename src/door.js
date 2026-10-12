import * as THREE from 'three';

const OPEN_ANGLE = Math.PI / 2; // 90도 열림
const SWING_SPEED = 6;

// 경첩을 기준으로 회전하는 문. E 키로 열고 닫는다.
export class Door {
  /**
   * @param {object} o
   * @param {number} o.x 경첩 x (벽 위치)
   * @param {number} o.z 경첩 z
   * @param {number} o.width 문 폭 (경첩에서 +z 방향으로 뻗음)
   * @param {number} o.height 문 높이
   * @param {string} o.label 안내 문구에 쓸 이름
   */
  constructor({ x, z, width = 1.0, height = 2.1, color = 0x8a5a3c, label = '문' }) {
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.width = width;
    this.label = label;
    this.open = false;
    this.angle = 0;
    this.target = 0;

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, height, width),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
    );
    panel.position.set(0, height / 2, width / 2);
    panel.castShadow = true;
    panel.receiveShadow = true;
    this.panel = panel;
    this.group.add(panel);

    // 손잡이 (양쪽)
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 });
    for (const side of [-1, 1]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), knobMat);
      knob.position.set(side * 0.05, 1.0, width - 0.12);
      this.group.add(knob);
    }

    // 상호작용 기준점 (문 중앙, 가슴 높이)
    this.center = new THREE.Vector3(x, 1, z + width / 2);
    this.collider = new THREE.Box3();
    this.updateCollider();
  }

  toggle() {
    this.open = !this.open;
    this.target = this.open ? OPEN_ANGLE : 0;
  }

  update(dt) {
    const diff = this.target - this.angle;
    if (Math.abs(diff) < 1e-3) {
      if (this.angle !== this.target) {
        this.angle = this.target;
        this.group.rotation.y = this.angle;
        this.updateCollider();
      }
      return;
    }
    this.angle += diff * Math.min(1, dt * SWING_SPEED);
    this.group.rotation.y = this.angle;
    this.updateCollider();
  }

  updateCollider() {
    this.group.updateMatrixWorld(true);
    this.collider.setFromObject(this.panel);
  }
}
