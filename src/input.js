// 키보드 / 마우스 입력을 한곳에서 관리한다.
const isTyping = (e) => {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};

export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.justPressed = new Set(); // 이번 프레임에 눌린 키 (consume 시 비움)
    this.mouseDX = 0; // 이번 프레임 누적 마우스 이동량
    this.mouseDY = 0;
    this.wheel = 0;
    this.dragging = false;
    this.pointerLocked = false;
    this.onToggleView = null;  // V 키 콜백
    this.onToggleSkins = null; // Tab 키 콜백

    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (e.code === 'Tab') e.preventDefault();
      if (e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
      if (e.code === 'KeyV' && this.onToggleView) this.onToggleView();
      if (e.code === 'Tab' && this.onToggleSkins) this.onToggleSkins();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.dragging = true;
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked || this.dragging) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    domElement.addEventListener('wheel', (e) => {
      this.wheel += e.deltaY;
      e.preventDefault();
    }, { passive: false });
    domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === domElement;
    });
  }

  requestPointerLock() {
    if (this.dom.requestPointerLock) this.dom.requestPointerLock();
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  // 이번 프레임에 새로 눌렸는지
  pressed(code) {
    return this.justPressed.has(code);
  }

  // 이동 입력을 -1~1 벡터로 반환 (x: 오른쪽, z: 앞)
  moveAxis() {
    let x = 0, z = 0;
    if (this.isDown('KeyW', 'ArrowUp')) z += 1;
    if (this.isDown('KeyS', 'ArrowDown')) z -= 1;
    if (this.isDown('KeyD', 'ArrowRight')) x += 1;
    if (this.isDown('KeyA', 'ArrowLeft')) x -= 1;
    const len = Math.hypot(x, z);
    return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
  }

  get running() {
    return this.isDown('ShiftLeft', 'ShiftRight');
  }

  // 프레임 끝에 호출해 누적값 초기화
  consume() {
    const r = { dx: this.mouseDX, dy: this.mouseDY, wheel: this.wheel };
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.justPressed.clear();
    return r;
  }
}
