// 터치 조작 (36단계): 폰·태블릿에서는 키보드·마우스 대신 화면 위 조이스틱과 버튼으로 논다.
// Input 의 keys / mouse / mouseDX 를 그대로 채워 넣기 때문에 게임 코드는 어떤 장치로 조작하는지 몰라도 된다.
//   왼쪽 아래 조이스틱 = 이동 (끝까지 밀면 달리기)
//   오른쪽 빈 화면 드래그 = 시점 회전
//   버튼 = 점프·공격(누르고 있는 동안)·조준·E·재장전·무기 넘기기·인벤토리·지도·시점 전환·채팅

export const IS_TOUCH = (() => {
  try {
    const q = new URLSearchParams(location.search).get('touch');
    if (q === '1') return true;
    if (q === '0') return false;
    return window.matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window;
  } catch { return false; }
})();

const LOOK_SENS = 2.2;      // 손가락 1px 당 마우스 몇 px 로 칠지 (폰 화면이 작아서 조금 크게)
const STICK_R = 52;         // 조이스틱 반지름 (px). 이 거리까지 밀면 최대 속도
const RUN_AT = 0.92;        // 이만큼 이상 밀면 달리기

// 버튼 정의: [id, 글자, 어떤 입력으로 칠지] — key 는 keydown/keyup 처럼, mouse 는 mousedown/mouseup 처럼, tap 은 한 번 누름만
const BUTTONS = [
  // 순서가 곧 자리: 1줄 점프·조준·공격(크게), 2줄 E·R·무기
  { id: 'tJump', label: '⤒', title: '점프', key: 'Space' },
  { id: 'tAim', label: '⌖', title: '조준', mouse: 2 },
  { id: 'tFire', label: '◎', title: '공격', mouse: 0 },
  { id: 'tUse', label: 'E', title: '상호작용', key: 'KeyE' },
  { id: 'tReload', label: 'R', title: '재장전', key: 'KeyR' },
  { id: 'tWeapon', label: '⇄', title: '무기 넘기기', action: 'weapon' },
  { id: 'tInv', label: '▦', title: '인벤토리', action: 'inventory', bar: 'top' },
  { id: 'tMap', label: '🗺', title: '지도', action: 'map', bar: 'top' },
  { id: 'tView', label: '👁', title: '시점', action: 'view', bar: 'top' },
  { id: 'tChat', label: '💬', title: '채팅', action: 'chat', bar: 'top' },
  { id: 'tMenu', label: '☰', title: '메뉴', action: 'menu', bar: 'top' },
];

export class TouchControls {
  /**
   * @param {import('./input.js').Input} input
   * @param {{ onCycleWeapon?: () => void, onInventory?: () => void, onMap?: () => void, onView?: () => void, onChat?: () => void, onMenu?: () => void }} actions
   */
  constructor(input, actions = {}) {
    this.input = input;
    this.actions = actions;
    this.axis = { x: 0, z: 0 };
    this.running = false;
    this.stickId = null; // 조이스틱을 잡고 있는 손가락
    this.lookId = null;  // 시점을 돌리는 손가락
    this.lookLast = { x: 0, y: 0 };
    document.body.classList.add('touch');
    this.build();
  }

  build() {
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div id="tStick"><div id="tKnob"></div></div>
      <div id="tButtons"></div>
      <div id="tTop"></div>
      <div id="tLook"></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.stick = root.querySelector('#tStick');
    this.knob = root.querySelector('#tKnob');
    const bars = { action: root.querySelector('#tButtons'), top: root.querySelector('#tTop') };
    for (const b of BUTTONS) {
      const el = document.createElement('button');
      el.id = b.id; el.textContent = b.label; el.title = b.title; el.dataset.title = b.title;
      el.type = 'button';
      bars[b.bar || 'action'].appendChild(el);
      this.bindButton(el, b);
    }
    // 조이스틱: 처음 닿은 위치를 중심으로 쓰고, 손가락을 떼면 원래 자리로
    this.stick.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      this.stick.setPointerCapture(e.pointerId);
      this.stickCenter = { x: e.clientX, y: e.clientY };
      this.moveStick(e);
      e.preventDefault();
    });
    this.stick.addEventListener('pointermove', (e) => { if (e.pointerId === this.stickId) this.moveStick(e); });
    const endStick = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.axis = { x: 0, z: 0 };
      this.running = false;
      this.knob.style.transform = '';
    };
    this.stick.addEventListener('pointerup', endStick);
    this.stick.addEventListener('pointercancel', endStick);
    // 시점 회전: 오른쪽 영역(버튼 사이 빈 곳)을 드래그
    const look = root.querySelector('#tLook');
    look.addEventListener('pointerdown', (e) => {
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      look.setPointerCapture(e.pointerId);
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.input.justPressed.add('Mouse0'); // 쇼케이스 자동 회전 멈춤 등 "화면을 눌렀다" 신호
      e.preventDefault();
    });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      const dx = (e.clientX - this.lookLast.x) * LOOK_SENS, dy = (e.clientY - this.lookLast.y) * LOOK_SENS;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.input.mouseDX += dx;
      this.input.mouseDY += dy;
      this.input.onMove?.(dx, dy);
    });
    const endLook = (e) => { if (e.pointerId === this.lookId) this.lookId = null; };
    look.addEventListener('pointerup', endLook);
    look.addEventListener('pointercancel', endLook);
  }

  moveStick(e) {
    let dx = e.clientX - this.stickCenter.x, dy = e.clientY - this.stickCenter.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) { dx *= STICK_R / len; dy *= STICK_R / len; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const mag = Math.min(1, len / STICK_R);
    // 화면 위 = 앞(+z), 오른쪽 = +x. 작게 밀면 천천히 걷는다
    this.axis = mag < 0.12 ? { x: 0, z: 0 } : { x: (dx / STICK_R) , z: (-dy / STICK_R) };
    this.running = mag >= RUN_AT;
  }

  bindButton(el, b) {
    const input = this.input;
    const down = (e) => {
      e.preventDefault();
      el.classList.add('on');
      if (b.key) { input.keys.add(b.key); input.justPressed.add(b.key); }
      if (b.mouse !== undefined) { input.mouse.add(b.mouse); input.justPressed.add('Mouse' + b.mouse); }
      if (b.action) this.fire(b.action);
    };
    const up = () => {
      el.classList.remove('on');
      if (b.key) input.keys.delete(b.key);
      if (b.mouse !== undefined) input.mouse.delete(b.mouse);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  fire(action) {
    const a = this.actions;
    if (action === 'weapon') a.onCycleWeapon?.();
    else if (action === 'inventory') a.onInventory?.();
    else if (action === 'map') a.onMap?.();
    else if (action === 'view') a.onView?.();
    else if (action === 'chat') a.onChat?.();
    else if (action === 'menu') a.onMenu?.();
  }

  // 패널이 열려 있으면 조작판을 숨긴다 (패널 뒤에서 조이스틱이 눌리지 않게)
  setHidden(hidden) {
    this.root.classList.toggle('hidden', hidden);
    if (hidden) { this.axis = { x: 0, z: 0 }; this.running = false; this.stickId = null; this.lookId = null; this.knob.style.transform = ''; }
  }
}
