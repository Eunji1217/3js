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
    this.mouse = new Set();    // 눌려 있는 마우스 버튼 (0 왼쪽, 2 오른쪽)
    this.onToggleView = null;  // V 키 콜백
    this.onToggleSkins = null; // Tab 키 콜백
    this.onSelectWeapon = null; // 숫자키(0부터 시작하는 인덱스) / X 키(null) 콜백
    this.onWheelKey = null;     // T 키 누름(true)/뗌(false) 콜백 — 무기 휠
    this.onMove = null;         // 마우스 이동 원시 콜백 (dx, dy) — 잠김/드래그와 무관하게 항상 호출
    this.onToggleInventory = null; // I 키 콜백 (인벤토리·요리 도감)
    this.onHotbarScroll = null;    // Shift+휠 또는 핫바 위에서 휠: 핫바 다음/이전 줄 (+1/-1)

    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (e.code === 'Tab') e.preventDefault();
      if (e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
      if (e.code === 'KeyV' && this.onToggleView) this.onToggleView();
      if (e.code === 'Tab' && this.onToggleSkins) this.onToggleSkins();
      if (e.code === 'KeyI' && this.onToggleInventory) this.onToggleInventory();
      if (e.code === 'KeyT' && this.onWheelKey) this.onWheelKey(true);
      if (this.onSelectWeapon) {
        if (/^Digit[1-9]$/.test(e.code)) this.onSelectWeapon(Number(e.code[5]) - 1);
        if (e.code === 'KeyX') this.onSelectWeapon(null);
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyT' && this.onWheelKey) this.onWheelKey(false);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.clear(); });

    // 마우스 버튼은 'Mouse0', 'Mouse2' 이름으로 pressed() 에서도 조회할 수 있다
    domElement.addEventListener('mousedown', (e) => {
      this.mouse.add(e.button);
      this.justPressed.add('Mouse' + e.button);
      if (e.button === 0) this.dragging = true;
    });
    window.addEventListener('mouseup', (e) => {
      this.mouse.delete(e.button);
      if (e.button === 0) this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.onMove) this.onMove(e.movementX, e.movementY);
      if (this.pointerLocked || this.dragging) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    // 휠은 창 전체에서 받는다 (HUD 위에 커서가 있어도 무기 전환이 되게). 패널 안 스크롤은 제외
    window.addEventListener('wheel', (e) => {
      if (e.target instanceof Element && e.target.closest('.panel')) return;
      e.preventDefault();
      // Shift+휠 (또는 핫바 위에서 휠) 은 핫바 줄 넘기기, 그냥 휠은 무기 전환
      if ((e.shiftKey || (e.target instanceof Element && e.target.closest('#hotbar'))) && this.onHotbarScroll) { this.onHotbarScroll(Math.sign(e.deltaY)); return; }
      this.wheel += e.deltaY;
    }, { passive: false });
    domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === domElement;
    });
  }

  requestPointerLock() {
    if (!this.dom.requestPointerLock) return;
    const p = this.dom.requestPointerLock();
    if (p && p.catch) p.catch(() => {}); // 사용자 동작 없이 호출되면 거부되는데, 그때는 클릭으로 다시 잠근다
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

  mouseDown(button) {
    return this.mouse.has(button);
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
