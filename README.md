# Room Sim 으로 배우는 three.js

이 프로젝트는 three.js 로 만든 "방 세 개짜리(침실·거실·사격장) 3인칭/1인칭 시뮬레이션"입니다.
코드가 2,500줄 정도로 작아서 three.js 입문 교재로 쓰기 좋습니다.
이 문서는 **기본 개념 → 실습 → 다음 단계** 순서로 따라가는 튜토리얼입니다.

- **1부 (1~9단계)**: 방·문·캐릭터·카메라를 만드는 three.js 기본 (약 1,300줄)
- **2부 (10~16단계)**: 1부 개념을 조합해 무기·사격장·조준경·효과음을 만드는 응용 (약 1,200줄)

각 단계는 다음 구성으로 되어 있습니다.

- **개념**: 알아야 할 three.js 지식
- **코드**: 이 프로젝트에서 그 개념이 쓰인 곳
- **실습**: 직접 바꿔 보면서 확인하는 과제
- **확인**: 이해했는지 스스로 점검하는 질문

---

# 1부. three.js 기본

## 0단계. 준비

```bash
npm install
npm run dev     # http://localhost:5173 이 자동으로 열림
```

코드를 고치고 저장하면 Vite 가 브라우저를 자동으로 새로고침합니다.
브라우저 개발자 도구(F12) 콘솔에서 `__game` 을 치면 renderer, scene, player, world 등에 바로 접근할 수 있습니다.

```js
__game.player.position         // 플레이어 좌표
__game.setMode('first')        // 1인칭으로 전환
__game.world.doors[0].toggle() // 문 열기
```

### 파일 지도

| 파일 | 담당 | 핵심 three.js 개념 |
|---|---|---|
| `src/main.js` | 조립과 메인 루프 | Scene, Camera, Renderer, Clock, setAnimationLoop |
| `src/world.js` | 방, 벽, 가구, 거울, 조명 | Mesh, Geometry, Material, Group, Light, Shadow, Box3 |
| `src/door.js` | 경첩 기준으로 회전하는 문 | Group 의 position/rotation, 부모-자식 좌표계 |
| `src/player.js` | 캐릭터 로드, 이동, 점프, 충돌, 애니메이션 | GLTFLoader, FBXLoader, AnimationMixer, SkeletonUtils |
| `src/cameraRig.js` | 3인칭 추적 카메라와 1인칭 카메라 | 구면 좌표, Raycaster, lerp |
| `src/input.js` | 키보드/마우스 이벤트 모음 | three.js 와 무관한 순수 DOM 코드 |
| `src/skins.js` | 스킨 목록 저장 (localStorage, IndexedDB) | three.js 와 무관 |
| `src/ui.js` | HUD, 토스트, 스킨/무기 패널, 조준선, 무기 휠 | three.js 와 무관 |
| `src/range.js` (2부) | 사격장 방, 과녁, 넘어지는 표적, 무기 선반 | CanvasTexture, Group 회전축, worldToLocal, PointLight, emissive |
| `src/weapons.js` (2부) | 무기 모델, 사격, 조준, 조준경, 3인칭 팔 자세, 탄흔/예광 | Raycaster, Object3D 부모 바꾸기, userData, Quaternion, RenderTarget, Sprite, Line |
| `src/audio.js` (2부) | 효과음 합성 | three.js 와 무관 (WebAudio) |

읽는 순서는 **main → world → door → input/player(이동) → player(충돌) → cameraRig → player(애니메이션)** 을 권장합니다.
2부는 **range → weapons(모델·효과) → weapons(사격) → weapons(부착) → cameraRig/조준경 → poseArms → audio → main/ui** 순서입니다.

---

## 1단계. three.js 의 세 가지 필수 요소 (`src/main.js`)

### 개념

three.js 로 무엇이든 화면에 그리려면 항상 세 가지가 필요합니다.

| 요소 | 비유 | 역할 |
|---|---|---|
| **Scene** | 무대 | 3D 물체, 조명을 담는 컨테이너 |
| **Camera** | 관객의 눈 | 무대를 어디서, 어떤 화각으로 볼지 |
| **Renderer** | 화가 | 카메라가 본 장면을 `<canvas>` 에 실제로 그림 |

그리고 **매 프레임마다** `renderer.render(scene, camera)` 를 호출해야 화면이 갱신됩니다.

### 코드

**렌더러 설정** (`main.js` 14~20행)

```js
const renderer = new THREE.WebGLRenderer({ antialias: true });
```
WebGL 을 쓰는 렌더러를 만듭니다. `antialias: true` 는 물체 가장자리의 계단 현상을 줄입니다.

```js
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```
고해상도 모니터(레티나 등)에서는 CSS 픽셀 1개가 실제 픽셀 2~3개입니다. 이 값을 맞춰 주면 선명해지지만 그릴 픽셀 수가 제곱으로 늘어서 2 로 상한을 둡니다.

```js
renderer.setSize(window.innerWidth, window.innerHeight);
```
캔버스 크기를 브라우저 창 전체로 잡습니다. 창 크기가 바뀌면 `resize` 이벤트에서 다시 호출합니다 (`main.js` 96~100행).

```js
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
```
그림자 기능을 켭니다. 기본은 꺼져 있습니다. `PCFSoftShadowMap` 은 그림자 가장자리를 부드럽게 만드는 방식입니다.

```js
renderer.toneMapping = THREE.ACESFilmicToneMapping;
```
조명 계산 결과는 0~1 범위를 넘을 수 있습니다. 톤매핑은 그 값을 화면에 표시할 수 있는 범위로 눌러 주는 필터이고, ACES 는 영화에서 쓰는 방식이라 색이 자연스럽게 나옵니다.

```js
document.body.appendChild(renderer.domElement);
```
렌더러가 만든 `<canvas>` 를 HTML 에 붙입니다. 이 줄이 없으면 아무것도 안 보입니다.

**씬과 카메라** (`main.js` 23~28행)

```js
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);   // 배경색
scene.fog = new THREE.FogExp2(0xffffff, 0.04);   // 멀수록 배경색에 섞이는 안개

const camera = new THREE.PerspectiveCamera(60, aspect, 0.05, 100);
//                                        시야각  화면비  가까운한계 먼한계
```
`PerspectiveCamera` 는 사람 눈처럼 멀수록 작게 보이는 원근 카메라입니다. near(0.05)보다 가깝거나 far(100)보다 먼 물체는 그리지 않습니다.

**메인 루프** (`main.js` 106~161행)

```js
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); // 지난 프레임 이후 흐른 시간(초)
  // ... 문, 플레이어, 카메라 갱신 ...
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame); // 모니터 주사율에 맞춰 반복 (보통 60fps)
```

`dt` 가 중요합니다. 모든 움직임을 `속도 × dt` 로 계산하면 60fps 든 144fps 든 같은 속도로 움직입니다. 탭을 전환했다 돌아오면 dt 가 수 초가 될 수 있어서 0.05 로 상한을 둡니다.

한 프레임의 순서:

1. `dt` 계산
2. 문 근처인지 판단, E 키면 토글, 문 애니메이션 갱신
3. `player.update(...)` 로 위치, 회전, 애니메이션 갱신
4. `input.consume()` 으로 마우스 이동량을 꺼내 `rig.update(...)` 로 카메라 갱신
5. `renderer.render(scene, camera)`

### 실습

1. `scene.background` 색을 `0x87ceeb`(하늘색) 으로 바꿔 보세요.
2. `FogExp2` 의 두 번째 값을 `0.15` 로 올려 보세요. 안개가 짙어져 거실 끝이 안 보입니다. 그 뒤 `scene.fog = null` 로 꺼 보세요.
3. 카메라 시야각 60 을 `100` 으로 바꿔 보세요. 어안렌즈처럼 됩니다.
4. `renderer.shadowMap.enabled = false` 로 바꿔 그림자가 어떻게 사라지는지 보세요.
5. `renderer.toneMapping = THREE.NoToneMapping` 으로 바꿔 색감 차이를 비교하세요.

### 확인

- `renderer.render` 를 한 번만 호출하면 어떻게 될까요? (정답: 첫 화면은 그려지지만 이후 움직임이 없음)
- `dt` 를 쓰지 않고 `p.x += 0.03` 처럼 고정값으로 움직이면 어떤 문제가 생길까요?

---

## 2단계. 물체 만들기: Mesh = Geometry + Material (`src/world.js`)

### 개념

화면에 보이는 물체는 거의 전부 **Mesh** 입니다. Mesh 는 두 가지의 조합입니다.

- **Geometry** (모양): 정점(꼭짓점) 데이터. `BoxGeometry`, `PlaneGeometry`, `SphereGeometry` 등
- **Material** (재질): 표면이 빛에 어떻게 반응하는지. 색, 거칠기, 금속성 등

```js
const mesh = new THREE.Mesh(geometry, material);
mesh.position.set(x, y, z);  // 위치
mesh.rotation.y = Math.PI;   // 회전 (라디안)
mesh.scale.set(2, 2, 2);     // 크기
scene.add(mesh);             // 씬에 넣어야 보임
```

**좌표계**: Y 가 위, X 가 오른쪽, Z 가 앞뒤입니다. 단위는 미터로 생각하면 됩니다 (천장 높이 3). 각도는 전부 **라디안**이고 `Math.PI` 가 180도입니다.

**MeshStandardMaterial** 은 물리 기반 재질입니다. 주요 속성:

- `color`: 기본 색 (`0xRRGGBB` 16진수)
- `roughness`: 0(거울처럼 매끈) ~ 1(완전 무광)
- `metalness`: 0(비금속) ~ 1(금속)
- `side`: 기본은 앞면만 그림. `THREE.BackSide` 는 뒷면만, `THREE.DoubleSide` 는 양면

### 코드

**바닥** (`world.js` 25~34행)

```js
const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), std(r.floor));
floor.rotation.x = -Math.PI / 2;  // Plane 은 기본이 세로로 서 있어서 90도 눕힘
floor.position.set(cx, 0, cz);
```

**천장** 은 같은 Plane 을 높이 3 에 두고 `side: THREE.BackSide` 로 아래에서 보이게 합니다.

**벽** (`world.js` 48~98행)의 `wall(x1, z1, x2, z2, color)` 헬퍼는 두 점을 잇는 선분을 두께 0.16 의 `BoxGeometry` 로 만듭니다.

**가구** (`world.js` 100~139행)의 `box(sx, sy, sz, x, z, color)` 헬퍼는 전부 색칠한 상자입니다. 책상, 침대, 소파, TV 모두 `BoxGeometry` 입니다. 이 프로젝트의 가구는 "상자를 여러 개 겹쳐 놓은 것"일 뿐입니다.

```js
box(2.0, 0.75, 1.0, -2.5, -3.0, 0x8b6b4a);  // 책상: 가로2 높이0.75 깊이1, 위치 (-2.5, -3)
```

`y` 를 지정하지 않으면 `sy / 2` 가 되어 바닥에 딱 붙습니다.

### 실습

1. 책상 색 `0x8b6b4a` 를 `0xff0000` 으로 바꿔 보세요.
2. 침실에 새 가구를 추가해 보세요.
   ```js
   box(0.8, 0.8, 0.8, 0, 0, 0x44aa88);  // 침실 한가운데 초록 상자
   ```
3. 그 상자 재질을 `{ roughness: 0.1 }` 로 바꾸면 광택이 생깁니다. `box` 의 마지막 인자에 넣을 수 있습니다.
4. `SphereGeometry(0.4, 32, 32)` 로 공을 만들어 침대 위에 올려 보세요. (`box` 헬퍼 대신 직접 `new THREE.Mesh(...)` 를 만들어 `group.add` 해야 합니다.)
5. 천장의 `side: THREE.BackSide` 를 지워 보세요. 천장이 사라집니다. 왜일까요?

### 확인

- `PlaneGeometry` 를 바닥으로 쓸 때 왜 `rotation.x = -Math.PI / 2` 인가요?
- Mesh 를 만들고 `scene.add` 를 안 하면 어떻게 되나요?

---

## 3단계. 조명과 그림자 (`src/world.js` 158~178행)

### 개념

`MeshStandardMaterial` 은 **빛이 없으면 검게** 나옵니다. (빛과 무관하게 색을 내는 `MeshBasicMaterial` 도 있지만 입체감이 없습니다.)

| 조명 | 비유 | 특징 |
|---|---|---|
| `HemisphereLight(하늘색, 바닥색, 세기)` | 흐린 날 전체 조명 | 그림자 없음, 전체를 은은하게 |
| `DirectionalLight(색, 세기)` | 태양 | 한 방향 평행광, 그림자 가능 |
| `PointLight(색, 세기, 거리, 감쇠)` | 전구 | 한 점에서 사방으로, 거리 따라 약해짐 |
| `SpotLight` | 손전등 | 원뿔 모양 (이 프로젝트엔 없음) |

**그림자는 네 군데를 모두 켜야 보입니다.** 하나라도 빠지면 안 나옵니다.

1. 렌더러: `renderer.shadowMap.enabled = true`
2. 빛: `light.castShadow = true`
3. 그림자를 만드는 물체: `mesh.castShadow = true`
4. 그림자를 받는 물체: `mesh.receiveShadow = true`

### 코드

```js
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(8, 6, 2);         // 빛이 오는 위치
sun.target.position.set(5, 0, 0);  // 빛이 향하는 곳 (두 방 경계)
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); // 그림자 해상도 (클수록 선명, 느려짐)
sun.shadow.camera.left = -12;       // 그림자를 계산할 영역 (직교 카메라)
sun.shadow.camera.right = 12;
// ...
sun.shadow.bias = -0.0005;          // 자기 그림자 줄무늬(shadow acne) 방지
```

DirectionalLight 의 그림자는 빛 위치에 "직교 카메라"를 두고 거기서 본 깊이로 계산합니다. 그래서 `shadow.camera.left/right/top/bottom` 으로 영역을 지정해야 하고, 영역 밖 물체는 그림자가 없습니다.

### 실습

1. `HemisphereLight` 줄을 주석 처리해 보세요. 그림자 진 쪽이 완전히 검어집니다.
2. `sun.position` 을 `(-8, 6, 2)` 로 바꿔 그림자 방향이 바뀌는지 보세요.
3. `sun.shadow.mapSize` 를 `256, 256` 으로 줄여 그림자가 얼마나 거칠어지는지 보세요.
4. 방 전구 `PointLight` 색을 `0xff4444` 로 바꿔 보세요.
5. 그림자 카메라 영역을 눈으로 보려면 main.js 에 추가:
   ```js
   // world.js 의 return 에 sun 을 추가한 뒤
   scene.add(new THREE.CameraHelper(world.sun.shadow.camera));
   ```

### 확인

- 새로 추가한 가구에 그림자가 안 생긴다면 어디를 확인해야 하나요?
- PointLight 의 세 번째 인자(거리)를 1 로 줄이면 어떻게 될까요?

---

## 4단계. Group 과 부모-자식 좌표계 (`src/door.js`)

### 개념

`Group` 은 눈에 보이지 않는 빈 컨테이너입니다. 자식을 넣으면 **자식의 position/rotation 은 부모 기준**이 됩니다. 부모를 움직이면 자식이 통째로 따라옵니다.

이게 중요한 이유: 물체는 기본적으로 **자기 중심**을 축으로 회전합니다. 문짝을 그냥 회전시키면 가운데를 축으로 빙글 돕니다. 경첩을 축으로 돌리려면 **경첩 위치에 Group 을 두고, 문짝을 Group 안에서 옆으로 밀어 놓은 뒤, Group 을 회전**시킵니다.

```
Group 원점 (경첩)
   │
   └─ panel: position.z = width / 2  (경첩에서 폭의 절반만큼 떨어진 곳이 문짝 중심)
```

### 코드

```js
this.group = new THREE.Group();
this.group.position.set(x, 0, z);           // Group 을 경첩 위치에

const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, height, width), material);
panel.position.set(0, height / 2, width / 2); // Group 기준으로 옆으로 밀어둠
this.group.add(panel);

// 열고 닫기: Group 만 돌리면 된다
this.group.rotation.y = this.angle;
```

`update(dt)` 는 현재 각도를 목표 각도로 매 프레임 조금씩 가져갑니다 (`diff * dt * SWING_SPEED`). 이런 "목표를 향해 비율만큼 다가가기"는 7단계 카메라에서도 또 나옵니다.

플레이어도 같은 구조입니다. `player.group` 을 움직이고 회전시키며, 로드한 캐릭터 모델은 그 자식입니다.

### 실습

1. `OPEN_ANGLE` 을 `Math.PI / 4`(45도)로 바꿔 보세요.
2. `SWING_SPEED` 를 `1` 로 줄여 천천히 열리게 해 보세요.
3. `panel.position.set(0, height / 2, 0)` 으로 바꿔 보세요. 문이 가운데를 축으로 돌면서 벽을 뚫습니다. 이게 Group 을 쓰는 이유입니다.
4. 손잡이(`knob`) 를 Group 이 아니라 `scene` 에 직접 넣으면 문이 열려도 손잡이는 제자리에 남습니다. 직접 해 보세요.

### 확인

- 부모 Group 을 `scale.set(2, 2, 2)` 하면 자식은 어떻게 되나요?
- `getWorldPosition()` 과 `position` 의 차이는 무엇일까요? (힌트: 부모 기준 vs 씬 기준)

---

## 5단계. 입력과 이동 (`src/input.js`, `src/player.js` 의 `update`)

### 개념

three.js 에는 입력 처리 기능이 없습니다. 브라우저 `keydown`, `mousemove` 이벤트를 직접 받아야 합니다. `Input` 클래스는 이벤트를 받아서 상태로 저장해 두고, 게임 루프는 매 프레임 그 상태를 읽습니다.

- `keys` (Set): 지금 눌려 있는 키. "누르고 있는 동안" 판단용 (이동)
- `justPressed` (Set): 이번 프레임에 새로 눌린 키. "한 번만" 판단용 (점프, 문)
- `mouseDX/DY`: 이번 프레임 누적 마우스 이동량. `consume()` 으로 꺼내면서 0 으로 초기화

**Pointer Lock**: 1인칭에서 마우스 커서를 숨기고 무한히 움직이게 하는 브라우저 API. ESC 로 풀립니다.

### 코드: 카메라 기준 이동

W 를 누르면 "화면 위쪽"이 아니라 "카메라가 보는 방향"으로 가야 합니다. 그래서 카메라의 yaw(좌우 회전각)로 앞/오른쪽 벡터를 만듭니다 (`player.js` 215~224행).

```js
const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);  // 앞 방향 (XZ 평면)
const rx =  Math.cos(camYaw), rz = -Math.sin(camYaw);  // 오른쪽 방향

dx = (fx * axis.z + rx * axis.x) * speed * dt;
dz = (fz * axis.z + rz * axis.x) * speed * dt;
this.heading = Math.atan2(dx, dz);  // 캐릭터가 바라볼 각도
```

`moveAxis()` 는 WASD 를 -1~1 의 (x, z) 로 바꾸고 대각선일 때 길이를 1 로 정규화합니다. 안 그러면 대각선이 1.41배 빠릅니다.

### 코드: 점프와 중력

```js
if (this.grounded && input.pressed('Space')) { this.vy = JUMP_SPEED; this.grounded = false; }
if (!this.grounded) {
  this.vy -= GRAVITY * dt;   // 속도가 매 프레임 줄어듦
  p.y += this.vy * dt;       // 위치에 속도 반영
  if (p.y <= 0) { p.y = 0; this.vy = 0; this.grounded = true; }
}
```

가장 단순한 물리 시뮬레이션입니다. 속도에 중력을 더하고, 위치에 속도를 더합니다.

### 코드: 부드러운 회전

```js
let diff = this.heading - this.group.rotation.y;
diff = Math.atan2(Math.sin(diff), Math.cos(diff));  // -π~π 로 정규화 (350도→10도 를 짧은 쪽으로)
this.group.rotation.y += diff * Math.min(1, TURN_SPEED * dt);
```

### 실습

1. `WALK_SPEED` 와 `RUN_SPEED` 를 바꿔 보세요.
2. `GRAVITY` 를 `5` 로 줄여 달 중력을 체험해 보세요.
3. `JUMP_SPEED` 를 `12` 로 올리면 천장을 뚫습니다. 천장 충돌을 추가해 보세요 (힌트: `p.y` 가 `WALL_H - 1.8` 보다 크면 막기).
4. `TURN_SPEED` 를 `2` 로 줄여 캐릭터가 느리게 도는 것을 보세요.
5. `diff = Math.atan2(...)` 줄을 주석 처리하고 제자리에서 빙 돌아 보세요. 특정 방향에서 반대로 한 바퀴 도는 버그가 생깁니다.
6. 새 키를 추가해 보세요. `input.pressed('KeyF')` 일 때 콘솔에 메시지 출력하기.

### 확인

- `isDown` 과 `pressed` 의 차이는? 점프에 `isDown` 을 쓰면 어떻게 되나요?
- `e.repeat` 를 무시하는 이유는?

---

## 6단계. 충돌 처리 (`src/player.js` 의 `resolve`, `world.js` 의 `colliders`)

### 개념

three.js 에는 물리 엔진이 없습니다. 이 프로젝트는 가장 단순한 방식으로 직접 구현합니다.

- 벽과 가구: **Box3** (축 정렬 경계 상자, AABB). `new THREE.Box3().setFromObject(mesh)` 로 메시를 감싸는 상자를 구함
- 플레이어: 반지름 0.35 의 **원** (위에서 본 XZ 평면)

원과 상자의 충돌 판정: 상자에서 원 중심과 가장 가까운 점을 찾고(`clamp`), 그 점까지 거리가 반지름보다 작으면 겹친 것. 겹쳤으면 그 방향으로 반지름만큼 밀어냅니다.

### 코드

```js
// world.js: 만들 때 상자 저장
if (collide) colliders.push(new THREE.Box3().setFromObject(m));

// player.js: X 로 이동 → 밀어내기 → Z 로 이동 → 밀어내기
p.x += dx; this.resolve(p, world.bounds, colliders);
p.z += dz; this.resolve(p, world.bounds, colliders);
```

축을 **따로** 처리하는 이유: 벽에 비스듬히 부딪혔을 때 X 는 막히고 Z 는 통과해서 벽을 따라 미끄러지듯 움직입니다. 한 번에 처리하면 벽에 닿는 순간 완전히 멈춥니다.

```js
resolve(p, b, colliders) {
  for (const box of colliders) {
    if (box.max.y <= p.y + 0.05) continue;  // 점프 중 낮은 상자는 넘어감
    const cx = clamp(p.x, box.min.x, box.max.x);  // 상자에서 가장 가까운 점
    const cz = clamp(p.z, box.min.z, box.max.z);
    let ox = p.x - cx, oz = p.z - cz;
    const d = Math.hypot(ox, oz);
    if (d < RADIUS) { /* 밀어내기 */ }
  }
}
```

문은 열리면 상자가 바뀌어야 하므로 `door.updateCollider()` 가 매 프레임 `setFromObject(panel)` 을 다시 계산하고, `world.allColliders()` 가 정적 상자 + 문 상자를 합칩니다.

### 실습

1. 2단계에서 추가한 상자에 `{ collide: false }` 를 주고 통과해 보세요.
2. `RADIUS` 를 `1.0` 으로 바꿔 보세요. 문을 못 지나갑니다 (문 폭 1.0).
3. `p.x += dx; p.z += dz; this.resolve(...)` 로 한 번에 처리하도록 바꾸고 벽에 비스듬히 부딪혀 보세요.
4. 충돌 상자를 눈으로 보기:
   ```js
   // main.js 에 추가
   for (const b of world.colliders) scene.add(new THREE.Box3Helper(b, 0xff0000));
   ```
5. 낮은 상자(`box(0.6, 0.3, 0.6, ...)`)를 만들고 점프로 넘어 보세요. `box.max.y <= p.y + 0.05` 조건 덕분입니다.

### 확인

- Box3 는 회전한 물체를 정확히 감쌀 수 있나요? (정답: 아니요, 축 정렬이라 회전하면 더 큰 상자가 됨. 열린 문의 상자가 실제보다 큰 이유)

---

## 7단계. 카메라 리그 (`src/cameraRig.js`)

### 개념

카메라도 `position` 과 `rotation` 이 있는 평범한 Object3D 입니다. 3인칭 카메라는 "플레이어 주변 구면 위의 한 점"으로 위치를 계산합니다.

**구면 좌표**: 중심(target), 거리(distance), 좌우각(yaw), 상하각(pitch) 네 값으로 3D 위치를 구합니다.

```js
x = target.x + sin(yaw) * cos(pitch) * distance
y = target.y + sin(pitch) * distance
z = target.z + cos(yaw) * cos(pitch) * distance
```

**Raycaster**: 한 점에서 한 방향으로 광선을 쏴서 어떤 메시에 맞는지, 거리가 얼마인지 알려 줍니다. 마우스 클릭으로 물체 선택할 때도 씁니다.

**lerp** (선형 보간): `a.lerp(b, t)` 는 a 를 b 쪽으로 t 비율(0~1)만큼 옮깁니다. 매 프레임 호출하면 "부드럽게 따라가기"가 됩니다.

### 코드

**벽 뚫기 방지** (88~98행)

```js
this.ray.set(this.target, this.dir);   // 플레이어에서 카메라 방향으로
this.ray.far = len;                     // 카메라 거리까지만
const hits = this.ray.intersectObjects(this.world.wallMeshes, false);
if (hits.length) {
  const d = Math.max(0.5, hits[0].distance - WALL_MARGIN);  // 맞은 곳보다 살짝 앞
  this.desired.copy(this.target).addScaledVector(this.dir, d);
}
```

**프레임 독립 보간** (107~110행)

```js
const t = 1 - Math.exp(-dt * 12);  // dt 가 커지면 t 도 커져서 프레임 속도와 무관하게 같은 느낌
this.camera.position.lerp(this.desired, t);
this.camera.lookAt(this.target);   // 카메라가 target 을 바라보게 회전
```

**1인칭**은 간단합니다. 카메라를 플레이어 머리 위치에 두고 `rotation.set(pitch, yaw, 0)` 으로 돌립니다. `rotation.order = 'YXZ'` 가 중요한데, Y(좌우)를 먼저 돌리고 X(상하)를 돌려야 고개를 들었을 때 화면이 기울지 않습니다.

### 실습

1. `distance` 범위 `1.5, 6` 을 `1.5, 20` 으로 바꿔 멀리서 집 전체를 보세요.
2. 보간 계수 `12` 를 `2` 로 줄여 카메라가 느릿하게 따라오게 해 보세요. `100` 으로 올리면 딱딱해집니다.
3. Raycaster 블록(88~98행)을 통째로 주석 처리하고 벽에 등을 대고 서 보세요. 카메라가 벽 밖으로 나갑니다.
4. `rotation.order` 줄을 지우고 1인칭에서 고개를 들어 보세요.
5. `pitch` 의 clamp 범위를 `-1.4, 1.4` 로 넓혀 3인칭에서 발밑을 볼 수 있게 해 보세요.

### 확인

- `lookAt` 없이 `position.lerp` 만 하면 어떻게 되나요?
- `1 - Math.exp(-dt * 12)` 대신 그냥 `0.2` 를 쓰면 어떤 문제가 있나요?

---

## 8단계. 모델 로드와 애니메이션 (`src/player.js`)

### 개념

**glTF(.glb)** 는 three.js 의 표준 모델 포맷입니다. 메시, 재질, 뼈대(skeleton), 애니메이션이 한 파일에 들어 있습니다. **FBX** 는 Autodesk 포맷으로 Mixamo 에서 주로 씁니다 (단위가 cm 라서 0.01 배 축소 필요).

```js
const gltf = await new GLTFLoader().loadAsync('/models/Soldier.glb');
gltf.scene       // Object3D 트리 (메시 + 뼈)
gltf.animations  // AnimationClip 배열 (Idle, Walk, Run ...)
```

**SkinnedMesh**: 뼈대에 붙어 있는 메시. 뼈를 움직이면 살이 따라 변형됩니다.

**애니메이션 재생 3단계**:

```js
const mixer = new THREE.AnimationMixer(model);    // 재생기 (모델당 하나)
const action = mixer.clipAction(clip);            // 클립을 재생 가능한 액션으로
action.play();
// 그리고 매 프레임
mixer.update(dt);                                  // 이걸 안 하면 안 움직임
```

**crossFade**: 걷기에서 달리기로 바뀔 때 두 애니메이션을 0.25초 동안 섞어서 뚝 끊기지 않게 합니다.

```js
action.reset().setEffectiveWeight(1).play();
this.current.crossFadeTo(action, 0.25, false);
```

### 코드

`setSkin(skin)` 의 흐름:

1. `loadModel` 로 파일 로드 (한 번 로드한 건 `modelCache` 에 보관)
2. `SkeletonUtils.clone` 으로 복제 (뼈대가 있는 모델은 일반 `clone()` 이 안 됨)
3. `normalizeScale` 로 cm 단위 모델을 m 로
4. 모델에 Idle/Walk/Run 클립이 있으면 그대로, 없으면 Soldier 것을 **리타게팅**
5. 이전 모델 제거, 새 모델 `group.add`
6. `AnimationMixer` 새로 만들고 Idle 재생

`update` 끝부분의 상태 전환:

```js
if (!this.grounded || !moving) this.play(this.idle);
else this.play(running ? this.run : this.walk);
this.mixer.update(dt);
```

`prepareModel` 의 `frustumCulled = false` 는 "카메라 밖이면 안 그린다" 최적화를 끄는 것입니다. SkinnedMesh 는 경계 상자가 애니메이션을 따라가지 않아서 화면에 있는데도 사라지는 버그가 생기기 때문입니다.

**리타게팅** (`retargetClips`)은 한 뼈대의 애니메이션을 다른 뼈대에 옮기는 고급 기능입니다. 처음엔 "Mixamo 뼈 이름이 같으면 옮길 수 있다" 정도만 알고 넘어가도 됩니다.

### 실습

1. `this.play(action, fade = 0.25)` 의 기본값을 `0` 으로 바꿔 전환이 뚝 끊기는 것을 보세요. `1.0` 으로 올리면 미끄러지듯 섞입니다.
2. `this.mixer.update(dt)` 를 주석 처리해 보세요. 캐릭터가 T 자 자세로 굳습니다.
3. `mixer.update(dt * 0.3)` 으로 슬로모션을 만들어 보세요.
4. 콘솔에서 Soldier 의 클립 이름 확인:
   ```js
   __game.player.source.clips.map(c => c.name)
   ```
5. `frustumCulled = false` 줄을 지우고 캐릭터 가까이서 카메라를 돌려 보세요. 가끔 사라집니다.
6. 1인칭(V)에서 `setVisible(false)` 가 호출됩니다. 이걸 막으면 카메라가 캐릭터 머리 안에 들어가 내부가 보입니다. 직접 확인해 보세요.

### 확인

- 왜 모델마다 `AnimationMixer` 를 새로 만드나요?
- `clone()` 대신 `SkeletonUtils.clone()` 을 쓰는 이유는?

---

## 9단계. 고급 주제 (나중에)

이 단계는 three.js 기본을 익힌 뒤 보면 됩니다.

- **Reflector (거울)** `world.js` 141~156행: 매 프레임 카메라를 거울 반대편으로 옮겨 장면을 한 번 더 렌더링합니다. 그래서 비용이 큽니다. `multisample: 0` 은 일부 GPU 에서 검게 나오는 문제 회피입니다.
- **SkeletonUtils.retargetClip**: 뼈 이름 매핑, 스케일, 힙 뼈 지정이 필요합니다. 리타게팅 중 뼈를 직접 움직여서 상태를 저장/복원하는 코드가 있습니다.
- **스킨 저장소** `skins.js`: three.js 와 무관. 파일은 IndexedDB 에 Blob 으로, 링크는 localStorage 에 저장합니다. `URL.createObjectURL(blob)` 로 로컬 파일을 로더가 읽을 수 있는 URL 로 바꿉니다.
- **Vite 의 `import.meta.glob`**: `src/skins/` 폴더의 파일을 빌드 시 자동으로 찾아 URL 로 만듭니다.

---

# 2부. 무기와 사격장으로 배우는 응용

1부에서 배운 Mesh, Group, Raycaster, 애니메이션을 **조합**해서 "총을 쏴 표적을 맞히는" 기능을 만들었습니다.
코드량은 1부와 비슷하지만 완전히 새로운 three.js 개념은 몇 개 안 됩니다 (CanvasTexture, RenderTarget, Sprite, Quaternion 정도).
나머지는 1부 개념을 다른 곳에 다시 쓴 것이니 **"이건 몇 단계의 응용이지?"** 를 의식하며 읽으세요.

먼저 사격장에 가 보세요. 거실 오른쪽 문을 지나면 됩니다. 콘솔로 바로 가려면:

```js
__game.player.position.set(18.6, 0, 0)   // 사대 앞으로 순간이동
__game.weapons.select('rifle')           // 소총 장착 (숫자키 2 와 같음)
__game.setMode('first')                  // 1인칭
__game.weapons.stats                     // { score, shots, hits }
```

조작: **좌클릭** 사격 · **우클릭** 조준 · **우클릭 두 번** 배율 전환 · **R** 재장전 · **1~5 / 휠 / T** 무기 선택 · **X** 맨손

---

## 10단계. 사격장 방과 넘어지는 표적 (`src/range.js`)

### 개념

**방 추가는 데이터 추가입니다.** `ROOMS` 배열에 `RANGE_ROOM` 을 넣고, 벽 4개와 문을 세우면 끝입니다. `world.js` 의 문 생성 코드가 `doorway()` 헬퍼로 묶여서 같은 코드로 두 번째 문을 만들었습니다 (2단계 + 4단계).

**CanvasTexture**: 이미지 파일 없이 2D `<canvas>` 에 그림을 그려 텍스처로 씁니다. 과녁의 동심원, "INDOOR RANGE" 간판, 레인 번호가 전부 이것입니다.

```js
const c = document.createElement('canvas');
c.width = c.height = 512;
draw(c.getContext('2d'));               // 평범한 Canvas 2D API 로 그림
const t = new THREE.CanvasTexture(c);
t.colorSpace = THREE.SRGBColorSpace;    // 이걸 빼면 색이 바랜 듯 어둡게 나온다
new THREE.MeshStandardMaterial({ map: t });
```

**회전축(pivot) Group**: 4단계 문과 같은 원리입니다. 바닥에 빈 Group 을 두고 그 자식으로 기둥·표적판을 올리면, Group 의 `rotation.z` 만 돌려도 표적 전체가 바닥을 축으로 뒤로 넘어갑니다.

**worldToLocal**: 월드 좌표의 점을 어떤 물체의 로컬 좌표로 바꿉니다. 총알이 맞은 월드 좌표를 표적판 기준 좌표로 바꾸면 "중심에서 얼마나 떨어졌나"가 바로 나옵니다. 표적이 기울어져 있어도 맞습니다.

**emissive 와 PointLight**: `emissive` 는 "스스로 빛나 보이는 색"일 뿐 주변을 밝히지 않습니다. 형광등은 `emissive` 로 하얗게 빛나는 상자 + 실제로 주변을 밝히는 `PointLight` 두 개를 같은 자리에 둔 것입니다 (3단계).

**MeshBasicMaterial**: 조명 영향을 안 받는 재질. 간판·레인 번호처럼 "그림 그대로 보여야 하는" 것에 씁니다.

### 코드

**표적 한 개** (93~121행)

```js
const pivot = new THREE.Group();        // 회전축: 바닥
pivot.position.set(TARGET_X, 0, z);
const board = new THREE.Mesh(boardGeo, boardMat);
board.position.set(0, 1.3, 0);           // pivot 기준 1.3m 위
board.rotation.y = -Math.PI / 2;         // PlaneGeometry 의 앞면(+Z)이 사수 쪽(-X)을 보게
pivot.add(board);
shootables.push(board);                  // 총알이 맞을 수 있는 목록에 등록 (11단계)
board.userData.target = target;          // 맞았을 때 "어느 표적인지" 알기 위해
```

**점수 판정** (171~181행)

```js
const local = target.board.worldToLocal(point.clone());   // 월드 → 표적판 로컬
const r = Math.hypot(local.x, local.y);                    // 중심 거리
if (r > TARGET_R) return 0;
const score = Math.max(1, 10 - Math.floor(r / (TARGET_R / 10)));  // 10개 링
```

**넘어지기** (183~193행): 맞으면 `down = true`, 목표 각도 -1.45 rad 로 빠르게(계수 14), 1.4초 뒤 0 으로 천천히(계수 6) 보간합니다. 7단계의 "프레임 독립 보간"과 같은 패턴입니다.

### 실습

1. `LANES` 를 `[-3, -1, 1, 3]` 으로 바꿔 표적을 4개로 늘리세요. 사대·칸막이·번호판도 같이 늘어나는지 확인하세요.
2. `TARGET_X` 를 `22` 로 당겨 보세요. 산탄총이 쓸 만해집니다.
3. `DOWN_TIME` 을 `5` 로 늘려 보세요.
4. `ringTexture` 에서 중심 색 `'#d23c3c'` 를 파란색으로 바꿔 보세요. 과녁이 바뀌는 데 모델 파일은 전혀 안 건드렸습니다.
5. `t.colorSpace = THREE.SRGBColorSpace` 줄을 주석 처리하고 과녁 색이 어떻게 바래는지 보세요.
6. `update` 의 목표 각도 `-1.45` 를 `-Math.PI` 로 바꿔 완전히 뒤집히게 해 보세요. `rotation.z` 대신 `rotation.y` 를 쓰면 어떻게 될까요?
7. 사격장에 가구를 하나 놓아 보세요. `box(...)` 를 쓰면 충돌과 피격이 자동으로 됩니다.

### 확인

- `board` 를 `pivot` 없이 `group` 에 직접 넣고 `rotation.z` 를 돌리면 어디를 축으로 돌까요?
- 점수를 `worldToLocal` 없이 월드 좌표로 계산하면 표적이 넘어지는 중에 무슨 문제가 생길까요?
- `emissive` 만 있고 `PointLight` 가 없으면 사격장이 어떻게 보일까요?

---

## 11단계. Raycaster 로 사격하기 (`src/weapons.js` 의 `aimRay`, `shoot`, `Effects`)

### 개념

**총알은 물체가 아니라 광선입니다.** 7단계에서 카메라가 벽에 가리는지 확인할 때 쓴 `Raycaster` 를 그대로 씁니다. 카메라 위치에서 카메라가 보는 방향으로 쏴서 처음 맞는 메시가 "맞은 곳"입니다.

```js
this.ray.set(origin, dir);
this.ray.near = near;   // 이 거리보다 가까운 건 무시
this.ray.far = 80;      // 사거리
const hit = this.ray.intersectObjects(this.world.shootables, false)[0];
hit.point        // 맞은 월드 좌표
hit.distance     // 거리
hit.object       // 맞은 메시
hit.face.normal  // 맞은 면의 법선 (메시 로컬 좌표)
```

**shootables**: `world.js` 가 만드는 "총알이 맞을 수 있는 메시" 목록입니다. 카메라용 `wallMeshes` 와 별도로 둔 이유는 가구와 표적도 맞아야 하기 때문입니다. 두 번째 인자 `false` 는 "자식까지 뒤지지 말라"는 뜻이라 목록에는 Mesh 를 직접 넣어야 합니다.

**3인칭의 함정**: 카메라가 플레이어 뒤에 있으므로 카메라에서 광선을 쏘면 플레이어 등 뒤의 벽을 먼저 맞힙니다. 그래서 `near` 를 "카메라에서 플레이어 눈까지의 거리"로 둬서 그 구간은 건너뜁니다 (`aimRay`, 638~648행).

**퍼짐(spread)**: 방향 벡터 주변의 작은 원판에서 랜덤한 점을 고릅니다. 원판의 가로·세로 축은 외적으로 만듭니다.

```js
side.crossVectors(dir, UP).normalize();   // dir 과 위쪽에 모두 수직 = 오른쪽
up.crossVectors(side, dir).normalize();   // dir 과 side 에 수직 = 위쪽
const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;  // sqrt 로 원판에 고르게
d.copy(dir).addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r);
```

산탄총은 이 과정을 `pellets`(8)번 반복할 뿐입니다.

**법선을 월드로**: `hit.face.normal` 은 메시 로컬 좌표입니다. 탄흔을 벽 표면에 붙이려면 `transformDirection(hit.object.matrixWorld)` 로 월드 방향으로 바꿔야 합니다.

**오브젝트 풀**: 쏠 때마다 `new Mesh` 를 만들면 메모리가 계속 늘어납니다. 탄흔 120개, 예광 16개를 미리 돌려 쓰고 가장 오래된 것부터 재활용합니다 (`Effects`, 200~272행).

**Sprite**: 항상 카메라를 향하는 사각형. 총구 섬광처럼 "어느 방향에서 봐도 둥근" 것에 씁니다. `AdditiveBlending` 으로 밝게 겹칩니다.

**polygonOffset**: 탄흔 원판을 벽 표면과 정확히 같은 위치에 놓으면 둘 중 뭘 그릴지 GPU 가 헷갈려 깜빡입니다(z-fighting). `polygonOffset` 으로 "이 재질은 조금 앞에 있는 것으로 쳐라"고 알려 줍니다.

### 코드

**한 발 쏘기** (`shoot`, 656~705행)의 흐름:

1. 탄약 감소, 쿨다운 `60 / rpm` 초, 통계 증가
2. `aimRay` 로 원점·방향·near 계산, `muzzleWorld` 로 총구 위치(예광 시작점)
3. 산탄 수만큼: 퍼짐 적용 → 광선 → 맞으면 표적 점수 판정 + 탄흔, 안 맞으면 80m 앞을 끝점으로 → 예광
4. 명중했으면 통계·HUD, 총구 섬광, 소리, 반동(13단계)

**탄흔을 표적에 붙이기** (`Effects.hole`, 221~236행): `parent` 가 있으면 `parent.add(h)` 하고 `worldToLocal` 로 위치를 바꿉니다. 그래서 표적이 넘어가도 탄흔이 같이 넘어갑니다. 4단계 부모-자식의 응용입니다.

### 실습

1. `MAX_RANGE` 를 `3` 으로 줄여 보세요. 가까운 것만 맞습니다.
2. 산탄총의 `pellets: 8` 을 `30`, `spread: 0.05` 를 `0.2` 로 바꿔 보세요.
3. `Effects.hole` 의 `% 120` 을 `% 10` 으로 바꾸면 탄흔이 10개만 남고 재활용됩니다.
4. `tracer` 의 `t.life = 0.05` 를 `1.0` 으로 바꿔 예광이 오래 남게 해 보세요.
5. `shoot` 에서 `this.fx.hole(hit.point, n, target.board)` 의 세 번째 인자를 지우면 표적이 넘어가도 탄흔은 공중에 남습니다.
6. `holeMat` 에서 `polygonOffset` 세 줄을 지우고 벽을 쏴 보세요. 각도에 따라 탄흔이 깜빡입니다.
7. `aimRay` 에서 `near = 0` 으로 고정하고 3인칭으로 벽에 등을 대고 쏴 보세요. 등 뒤 벽에 탄흔이 생깁니다.

### 확인

- `intersectObjects(list, false)` 에서 `list` 에 Group 을 넣으면 왜 아무것도 안 맞을까요?
- `Math.sqrt(Math.random())` 을 그냥 `Math.random()` 으로 바꾸면 탄착군 모양이 어떻게 달라질까요?
- Sprite 대신 `PlaneGeometry` Mesh 로 총구 섬광을 만들면 어떤 문제가 있나요?

---

## 12단계. 무기 모델 만들기와 손에 붙이기 (`buildWeaponModel`, `buildView`, `attachToPlayer`)

### 개념

**모델은 박스와 원기둥 조합입니다** (2단계). `buildWeaponModel(id)` (81~198행)는 `switch` 로 무기마다 상자 몇 개를 Group 에 넣습니다. 규칙은 **총열은 -Z, 손잡이는 -Y** 입니다. three.js 카메라가 -Z 를 보기 때문에, 이 규칙을 지키면 카메라에 붙였을 때 자연스럽게 앞을 향합니다.

**userData**: 모든 Object3D 에 있는 자유 저장소입니다. 총구 위치, 가늠쇠 위치, 렌즈 메시 등 "이 모델에 대한 추가 정보"를 넣습니다. 총구는 빈 `Object3D` 를 자식으로 넣어 두고 `getWorldPosition()` 으로 언제든 월드 좌표를 얻습니다. 총이 손에 들려 돌아가도 총구 위치가 자동으로 따라옵니다.

**1인칭 = 카메라의 자식**:

```js
scene.add(camera);        // main.js 28행. 카메라가 씬에 없으면 그 자식도 안 그려진다
this.camera.add(this.view);   // 카메라가 돌면 총도 같이 돈다
this.view.position.set(0.2, -0.17, -0.42);   // 카메라 기준: 오른쪽, 아래, 앞
```

카메라의 `near` 를 0.05 에서 0.03 으로 줄인 이유도 이것입니다. 총이 카메라 바로 앞 수 cm 에 있어서 near 보다 가까운 부분은 잘립니다. `renderOrder = 10` 은 벽에 바짝 붙었을 때 총이 벽에 파묻히지 않게 나중에 그리라는 뜻입니다.

**3인칭 = 손 뼈의 자식**: 8단계에서 본 뼈(Bone)도 Object3D 라서 `hand.add(model)` 이 됩니다. 두 가지 보정이 필요합니다.

```js
const s = hand.getWorldScale(v).x;         // Mixamo FBX 는 뼈 스케일이 0.01 (cm 단위)
model.scale.setScalar(1 / s);              // 총이 1cm 크기가 되지 않도록 되돌린다
// 팔뚝→손 방향을 손 로컬 좌표로 구해 총열(-Z)이 그쪽을 향하게
model.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dirLocal);
```

`setFromUnitVectors(a, b)` 는 "a 를 b 로 돌리는 회전"을 만듭니다. 손 뼈마다 축 방향이 제각각이라 이렇게 계산합니다.

**스킨을 바꾸면 손도 바뀝니다.** `player.setSkin` 끝에서 `onModelChanged` 콜백이 불리고, `attachToPlayer` 가 새 손 뼈에 다시 붙입니다.

**같은 모델을 세 곳에서**: 1인칭 카메라, 3인칭 손, 사격장 선반이 모두 `buildWeaponModel` 을 호출합니다. 하나의 함수로 모델을 만들면 쓰는 곳마다 따로 만들 필요가 없습니다.

### 실습

1. `main.js` 의 `scene.add(camera)` 를 주석 처리하세요. 1인칭 총이 사라집니다.
2. 카메라 `near` 를 `0.3` 으로 올리면 총의 앞부분만 보입니다.
3. `buildView` 의 `renderOrder = 10` 줄을 지우고 벽에 바짝 붙어 보세요.
4. `this._hip` 의 x 를 `-0.2` 로 바꿔 왼손잡이를 만들어 보세요.
5. **새 무기 추가**: `WEAPONS` 에 `{ id: 'smg', name: '기관단총', key: '6', type: 'gun', auto: true, rpm: 900, mag: 25, reload: 1.5, pellets: 1, spread: 0.03, aimSpread: 0.01, recoil: 0.008, aimFov: 55, sound: 'pistol' }` 을 넣고 `buildWeaponModel` 에 `case 'smg'` 를 만드세요. 선반·패널·휠·숫자키에 자동으로 등장합니다.
6. `attachToPlayer` 에서 `multiplyScalar(0.07 / s)` 를 `0.3 / s` 로 바꾸면 총이 손에서 떨어져 떠 있습니다.
7. 콘솔에서 3인칭 총구의 월드 좌표를 확인해 보세요 (콘솔에는 `THREE` 가 없으니 기존 Vector3 를 복제해 씁니다):
   ```js
   __game.weapons.held.userData.muzzle.getWorldPosition(__game.camera.position.clone())
   ```

### 확인

- `camera.add(view)` 대신 매 프레임 `view.position.copy(camera.position)` 을 하면 회전은 어떻게 되나요?
- 1인칭용 모델과 3인칭용 모델을 하나로 합치지 않고 두 개 만드는 이유는?
- 손 뼈의 스케일이 0.01 인데 보정을 안 하면 총 크기는?

---

## 13단계. 조준, 반동, 조준경 (`cameraRig.js`, `animateView`, `renderScope`)

### 개념

**줌 = FOV 줄이기**. `camera.fov` 를 바꾼 뒤 반드시 `updateProjectionMatrix()` 를 불러야 적용됩니다 (`cameraRig.js` 48~53행). FOV 가 반으로 줄면 화면이 2배 확대된 것처럼 보이므로 마우스 감도도 그만큼 줄여야 체감 속도가 같습니다.

```js
const sens = SENS * (fovT / BASE_FOV);   // 60도 기준으로 비례
```

**조준 위치**: 가늠쇠(`userData.sight`)가 카메라 원점 바로 앞 `eyeDist` 에 오도록 모델을 옮깁니다. 카메라 로컬 좌표에서 카메라는 (0,0,0) 이므로 모델 위치는 `-sight` 에 앞쪽 거리를 더한 값입니다.

```js
target = (-sight.x, -sight.y, -eyeDist - sight.z);
this.view.position.lerp(target, Math.min(1, dt * 12));   // 허리 ↔ 조준 위치를 부드럽게
```

**반동**: 두 가지를 합칩니다. 카메라 pitch 를 위로 튕기는 `rig.kick()` 과, 모델을 뒤로 밀었다가 지수 감쇠로 돌아오는 `kickZ`. 1인칭과 3인칭은 pitch 부호가 반대라서 `kick` 안에서 모드를 봅니다.

**RenderTarget (조준경 안 확대 화면)**: 화면 대신 **텍스처에 렌더링**하는 기능입니다. 9단계 거울(Reflector)이 내부에서 쓰는 것과 같습니다.

```js
this.scopeRT = new THREE.WebGLRenderTarget(1024, 1024);          // 그릴 텍스처
this.scopeCam = new THREE.PerspectiveCamera(5, 1, 0.05, 100);     // 아주 좁은 FOV 의 두 번째 카메라
this.scopeMat = new THREE.MeshBasicMaterial({ map: this.scopeRT.texture });

// 매 프레임, 메인 렌더 전에 (renderScope, 545~557행)
renderer.setRenderTarget(this.scopeRT);
renderer.render(scene, this.scopeCam);     // 장면을 텍스처에 그리고
renderer.setRenderTarget(null);            // 다시 화면으로
```

렌즈 메시의 `material` 을 `scopeMat` 으로 바꾸면 렌즈 안에 확대 화면이 보입니다. 렌즈 안 FOV 는 "렌즈가 화면에서 차지하는 각도 ÷ 배율" 로 계산합니다 (448행). 배율이 2배면 렌즈 안이 2배 확대되어야 하기 때문입니다.

**재질 교체**: 같은 렌즈 메시가 상황에 따라 세 가지 재질을 씁니다. 평소는 어두운 유리, 도트 단계는 반투명 유리 + 빨간 점 텍스처, 배율 단계는 RenderTarget 텍스처. `mesh.material = ...` 한 줄이면 됩니다 (`animateView`, 525~542행).

**어깨 너머 카메라**: 3인칭 조준 중에는 카메라가 보는 기준점을 yaw 기준 오른쪽으로 0.65m 비켜 둡니다 (`cameraRig.js` 69~81행). 캐릭터가 화면 중앙을 가리지 않게 하기 위해서입니다.

### 실습

1. `updateProjectionMatrix()` 줄을 주석 처리하면 `fov` 를 바꿔도 화면이 안 변합니다.
2. 저격총의 `zoom` 에 `{ label: '20x', mag: 20 }` 을 추가해 보세요.
3. `scopeRT` 크기를 `128, 128` 로 줄여 렌즈 안이 픽셀로 깨지는 것을 보세요. 1024 가 비싼 이유입니다.
4. `renderScope` 의 `this.view.visible = false` 를 주석 처리하면 렌즈 안에 자기 총이 보입니다.
5. `rig.kick(...)` 의 값에 `* 5` 를 곱해 보세요.
6. `SHOULDER` 를 `-0.65` 로 바꿔 왼쪽 어깨 너머로.
7. `cameraRig.js` 의 `sens` 계산을 `SENS` 로 고정하면 8배율에서 마우스가 너무 빨라집니다. 직접 느껴 보세요.
8. `SCOPE_MAIN_FOV` 를 `60` 으로 올리면 렌즈 바깥은 그대로이고 렌즈 안만 확대됩니다. 그 대신 렌즈 안 FOV 계산이 바뀌는 이유를 448행에서 찾아보세요.

### 확인

- `renderScope` 를 `renderer.render(scene, camera)` **뒤에** 부르면 어떤 문제가 생길까요?
- 조준경 PIP 는 장면을 두 번 그립니다. 조준 중일 때만 그리게 한 이유는?
- 거울(Reflector)과 조준경이 공유하는 원리는 무엇인가요?

---

## 14단계. 뼈를 코드로 움직이기: 3인칭 조준 자세 (`poseArms`)

### 개념

8단계에서 `mixer.update(dt)` 가 매 프레임 뼈의 회전을 애니메이션 값으로 세팅합니다. **그 뒤에** 뼈를 직접 돌리면 애니메이션 위에 덮어쓸 수 있습니다. 이게 절차적 애니메이션의 기본입니다. 호출 순서가 생명입니다 (`main.js` 134~135행: `player.update` → `weapons.poseArms`).

**뼈 하나를 목표로 향하게** (`aimBone`, 577~589행):

```js
const d0 = child.worldPos - bone.worldPos;   // 지금 뼈가 향하는 방향 (뼈 → 자식 뼈)
const d1 = target - bone.worldPos;           // 향해야 할 방향
q.setFromUnitVectors(d0, d1);                // d0 를 d1 로 돌리는 회전
bw = bone.worldQuaternion; bw.premultiply(q);        // 월드 회전에 적용
bw.premultiply(parent.worldQuaternion.invert());     // 부모 기준 로컬 회전으로 변환
bone.quaternion.slerp(bw, w);                // 애니메이션 값과 w 비율로 섞기
bone.updateMatrixWorld(true);                // 다음 뼈 계산을 위해 월드 행렬 갱신
```

Quaternion 은 회전을 표현하는 4개 숫자입니다. Euler(`rotation`)보다 섞기(`slerp`)와 합성(`multiply`)이 안전해서 뼈 조작에는 거의 항상 Quaternion 을 씁니다.

**2뼈 체인**: 상완(RightArm)을 먼저 돌리고, 바뀐 위치 기준으로 전완(RightForeArm)을 돌립니다. 각 단계 뒤 `updateMatrixWorld` 를 안 하면 전완이 이전 프레임의 상완 위치로 계산되어 떨립니다. 이건 역운동학(IK)이 아니라 뼈 하나씩 목표를 보게 하는 단순한 방법입니다. 그래도 "총을 겨누는" 느낌은 충분히 납니다.

**블렌딩 가중치**: `poseW` 를 0↔1 로 부드럽게 바꿔 조준을 시작/해제할 때 팔이 튀지 않게 합니다. 칼 휘두르기는 진행도 `prog`(0→1)에 따라 가중치를 삼각형 모양(0→1→0)으로 올렸다 내려서 시작과 끝이 애니메이션과 섞이게 합니다.

**칼 궤적** (610~628행): 진행도를 `Math.pow(t, 1.6)` 으로 가속시키고, "뒤·위 60도" 에서 "앞·아래 30도" 로 목표 방향을 보간합니다. 벡터 두 개 사이를 섞는 것만으로 호를 그립니다.

### 실습

1. `this.poseW += ... * Math.min(1, dt * 10)` 의 `10` 을 `1` 로 줄이면 조준 자세가 천천히 잡힙니다.
2. 칼 가중치 `w = Math.min(1, prog / 0.1, (1 - prog) / 0.1)` 을 `w = 1` 로 바꾸면 시작·끝이 뚝 끊깁니다.
3. `aimBone(b.rArm, ...)` 과 `aimBone(b.rFore, ...)` 의 순서를 바꿔 보세요. 팔이 꺾입니다.
4. `bone.updateMatrixWorld(true)` 를 주석 처리하고 조준 중에 돌아보세요. 전완이 떨립니다.
5. 왼손 받침 위치 `addScaledVector(dir, 0.3)` 을 `0.8` 로 바꿔 보세요.
6. 머리도 조준점을 보게 해 보세요. `getBone('Head')` 와 자식 `getBone('HeadTop_End')` 를 쓰면 `aimBone` 을 그대로 쓸 수 있습니다.
7. 콘솔에서 뼈를 직접 돌려 보세요: `__game.player.getBone('Head').rotation.x = 0.8` (다음 프레임에 mixer 가 덮어쓰므로 바로 원래대로 돌아갑니다. 왜 그런지 생각해 보세요.)

### 확인

- `poseArms` 를 `player.update` 앞에서 부르면 어떻게 될까요?
- `premultiply(parentWorld.invert())` 가 없으면 `bone.quaternion` 에 어떤 값이 들어갈까요?
- `slerp` 대신 `copy` 를 쓰면 `poseW` 는 의미가 없어집니다. 왜일까요?

---

## 15단계. 효과음 합성 (`src/audio.js`, three.js 와 무관)

### 개념

소리 파일 없이 **WebAudio API** 로 소리를 만듭니다. 기본 구조는 "소리 원본 → 필터 → 볼륨 → 스피커" 를 노드로 잇는 것입니다.

```js
const src = ctx.createBufferSource(); src.buffer = noise;   // 백색 잡음 1초
const filt = ctx.createBiquadFilter(); filt.type = 'lowpass';
filt.frequency.setValueAtTime(5400, t);
filt.frequency.exponentialRampToValueAtTime(360, t + 0.12);   // 고음이 빠르게 빠지면 '탕'
const gain = ctx.createGain();
gain.gain.setValueAtTime(0.5, t);
gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);      // 볼륨 엔벌로프
src.connect(filt).connect(gain).connect(ctx.destination);
src.start(t); src.stop(t + 0.17);
```

- **총소리** = 잡음 + 로우패스 스윕 + 낮은 사인파 '쿵'. 무기별 차이는 길이·주파수·크기 세 숫자뿐입니다 (`SHOTS`).
- **칼** = 밴드패스 잡음을 저음→고음으로 스윕 ('휙')
- **명중** = 2200Hz + 3300Hz 사인파 ('팅')
- **딸깍** = 하이패스 잡음 30ms

**AudioContext 는 사용자 동작 뒤에만 켜집니다.** 브라우저 자동재생 정책 때문에 페이지 로드 시 만들면 `suspended` 상태입니다. 그래서 첫 호출 때 만들고 `resume()` 합니다 (`ac()`, 5~13행).

three.js 에도 `THREE.AudioListener` 를 카메라에 붙이고 `THREE.PositionalAudio` 를 물체에 붙이는 3D 사운드가 있습니다. 거리에 따라 소리가 작아지고 좌우로 들립니다. 지금은 모든 소리가 거리와 무관하게 나는 단순한 방식입니다.

### 실습

1. `SHOTS.pistol` 의 `f: 1800` 을 `300` 으로 바꾸면 둔탁해집니다. `dur: 0.12` 를 `1.0` 으로 바꾸면 울립니다.
2. `playDing` 의 주파수를 `800, 1200` 으로 바꿔 보세요.
3. `playFootstep()` 을 만들어 `player.js` 에서 걷는 중 일정 간격으로 불러 보세요 (짧은 로우패스 잡음이면 됩니다).
4. 재장전 소리를 `playClick` 두 번 대신 세 번으로 늘려 보세요.
5. (고급) 표적 명중음을 `PositionalAudio` 로 바꿔 멀수록 작게 들리게 해 보세요. `AudioListener` 를 `camera.add` 하는 것부터 시작합니다.

### 확인

- `ctx` 를 모듈 로드 시점에 만들면 어떤 문제가 생기나요?
- `exponentialRampToValueAtTime` 의 목표값으로 `0` 을 주면 안 되는 이유는? (힌트: 지수)

---

## 16단계. 입력 설계: 포인터락, 무기 휠, 우선순위 (`src/main.js`, `src/input.js`, `src/ui.js`)

### 개념

three.js 와 무관하지만 "게임답게" 느껴지는 데 가장 큰 영향을 주는 부분입니다.

**포인터락 정책을 한 곳에**: 1인칭이든 3인칭이든 패널·휠이 닫혀 있으면 잠급니다 (`wantsLock`, `main.js` 44행). 상태가 바뀔 때마다 `syncPointerLock()` 한 번만 부릅니다. 규칙이 여러 곳에 흩어져 있으면 "패널 닫았는데 마우스가 안 잠긴다" 같은 버그가 납니다. `requestPointerLock` 은 클릭 같은 사용자 동작 안에서만 성공하므로 실패는 조용히 무시하고 다음 클릭에서 다시 시도합니다.

**잠그는 클릭과 쏘는 클릭 구분**: `canFire = 패널 닫힘 && 휠 닫힘 && 잠김` (131행). 잠기기 전 클릭은 잠금용이지 사격이 아닙니다.

**누르고 있음 vs 방금 누름**: `input.mouseDown(0)` 은 연사(소총), `input.pressed('Mouse0')` 은 단발(권총)입니다. 5단계의 `isDown`/`pressed` 와 같은 구분입니다.

**스크롤 누적과 쿨다운** (138~149행): 트랙패드는 휠 한 칸이 여러 번의 작은 값으로 들어옵니다. 값을 누적해 임계치(40)를 넘으면 한 칸 넘기고, 0.18초 동안은 꼬리 입력을 버립니다.

**무기 휠의 가상 커서**: 포인터락 중에는 마우스 좌표가 없고 이동량(`movementX/Y`)만 옵니다. 이동량을 누적해 가상 커서를 만들고, 각도로 조각을 고릅니다 (`moveWheel`, `ui.js` 261~272행). 조각은 SVG `<path>` 의 호(arc) 명령으로 그립니다.

**조준선 퍼짐**: CSS 변수 `--gap` 하나로 네 선의 위치를 움직입니다. 퍼짐 값(라디안)에 900 을 곱해 픽셀로 보여 줍니다 (`setCrosshair`).

### 실습

1. `canFire` 에서 `&& input.pointerLocked` 를 지우면 잠그려고 한 첫 클릭에 총이 나갑니다.
2. `SCROLL_STEP` 을 `200` 으로 올리면 휠을 많이 돌려야 넘어갑니다.
3. `openWheel` 의 반지름 `R = 140` 을 `200` 으로 키워 보세요.
4. `setCrosshair(..., 6 + spread * 900)` 의 `900` 을 `3000` 으로 바꿔 퍼짐이 과장되게 보이게 해 보세요.
5. 무기 휠에 "맨손" 조각을 빼 보세요 (`items.push({ id: null, ... })` 삭제). X 키는 여전히 되는지 확인하세요.

### 확인

- 3인칭에서도 항상 포인터를 잠그는 이유는? (힌트: 맨손도 좌클릭이 주먹)
- 포인터락 중 `e.clientX` 는 왜 쓸모가 없나요?

---

## 다음에 추가해 볼 것 (난이도 순)

기본 단계를 마쳤으면 기능을 하나씩 추가하면서 배우는 게 가장 빠릅니다.

1. **창문**: 벽에 구멍을 내고 `MeshStandardMaterial({ transparent: true, opacity: 0.3 })` 유리 끼우기 (2단계 응용)
2. **조명 스위치**: E 키로 방의 PointLight `intensity` 를 0/5 로 토글 (3단계 + 5단계 응용)
3. **텍스처 파일**: `TextureLoader` 로 나무 이미지를 읽어 바닥 `map` 에 입히기 (10단계의 CanvasTexture 를 파일로 바꾼 것)
4. **클릭으로 물체 선택**: 마우스 좌표를 `Raycaster.setFromCamera` 로 쏴서 맞은 가구 색 바꾸기 (11단계 응용, 포인터락 해제 상태에서)
5. **회전하는 선풍기**: 매 프레임 `rotation.y += dt * 10` (1단계 + 4단계)
6. **움직이는 표적**: `range.update` 에서 `pivot.position.z` 를 사인파로 좌우 왕복 (10단계)
7. **탄약 상자 줍기**: 사대 위 탄약 상자에 E 로 상호작용하면 모든 무기 탄약 보충 (5단계 + 12단계)
8. **계단과 2층**: 충돌 상자에 높이 개념을 추가해 올라갈 수 있게 (6단계 확장)
9. **점프 애니메이션**: Mixamo 에서 Jump 클립을 받아 공중에서 재생 (8단계 응용)
10. **문 자동 열림**: 문 근처에 오면 자동으로 열리고 멀어지면 닫히기 (4단계 + 5단계)
11. **머리가 조준점을 따라가기**: `poseArms` 에 Head 뼈 추가 (14단계)
12. **3D 사운드**: `AudioListener` + `PositionalAudio` 로 표적 명중음이 거리에 따라 작아지게 (15단계)
13. **미니맵**: 두 번째 카메라(`OrthographicCamera`)를 위에서 내려다보게 두고 화면 구석에 렌더링 (`renderer.setViewport`, `setScissor`). 13단계 RenderTarget 과 비교해 보세요
14. **탄도 낙차**: 광선 대신 작은 구체를 중력 받으며 날려 멀리 쏠수록 아래에 맞게 (11단계를 물체 방식으로 바꾸기)
15. **물리 엔진 도입**: cannon-es 또는 rapier 로 직접 만든 충돌을 교체

---

## 참고 자료

- three.js 공식 매뉴얼 (Fundamentals 장이 1~3단계와 거의 같음): https://threejs.org/manual/
- three.js API 문서: https://threejs.org/docs/
- three.js 예제 모음 (코드 포함): https://threejs.org/examples/
- Discover three.js (무료 온라인 책): https://discoverthreejs.com/
- Mixamo (무료 캐릭터, 애니메이션): https://www.mixamo.com/
