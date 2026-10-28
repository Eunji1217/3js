# Room Sim 으로 배우는 three.js

이 프로젝트는 three.js 로 만든 "집(침실·거실·주방·사격장)과 마당, 그리고 울타리 밖 들판에서 동물을 사냥하는 3인칭/1인칭 시뮬레이션"입니다.
코드가 4,500줄 정도로 작아서 three.js 입문 교재로 쓰기 좋습니다.
이 문서는 **기본 개념 → 실습 → 다음 단계** 순서로 따라가는 튜토리얼입니다.

**온라인에서 바로 해 보기**: https://eunji1217.github.io/3js/ (main 에 푸시하면 GitHub Actions 가 자동으로 다시 배포합니다. 28단계)

- **1부 (1~9단계)**: 방·문·캐릭터·카메라를 만드는 three.js 기본 (약 1,300줄)
- **2부 (10~20단계)**: 1부 개념을 조합해 무기·사격장·조준경·효과음·캐릭터 커스텀·칼 모션·연습 게임·사진 색 추출을 만드는 응용 (약 2,000줄)
- **3부 (21~34단계)**: 공개 에셋(Kenney·Quaternius CC0 키트)으로 집을 꾸미고, 집 밖 세상(땅·울타리·숲)과 동물·사냥·채집, 재료·배합법·요리 도감, 진행 저장, 남/여 의상 조립 캐릭터, 스킨 쇼케이스 카메라, 낮과 밤, 체력·배고픔·수면, 동물의 반격, 광장의 상인과 탄약 경제, 미니맵을 만들고 GitHub Pages 에 배포하는 확장 (약 2,300줄)

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
| `src/range.js` (2부) | 사격장 방, 과녁, 넘어지는 표적, 무기 선반, 60초 연습 게임 | CanvasTexture, Group 회전축, worldToLocal, PointLight, emissive, 상태 기계·사인파 왕복 |
| `src/weapons.js` (2부) | 무기 모델, 사격, 조준, 조준경, 칼 베기·찌르기 모션, 3인칭 팔 자세, 탄흔/예광 | Raycaster, Object3D 부모 바꾸기, userData, Quaternion, RenderTarget, Sprite, Line, 구간 함수 모션 |
| `src/audio.js` (2부) | 효과음 합성 | three.js 와 무관 (WebAudio) |
| `src/qchar.js` (2부) | 모듈형 캐릭터 (Quaternius CC0 부품 조립·커스텀) | 같은 뼈대에 SkinnedMesh 다시 묶기(bind), 스킨 가중치로 지오메트리 잘라내기, 텍스처 교체·색 곱하기, 애니메이션 라이브러리 공유 |
| `src/palette.js` (2부) | 사진에서 주요 색 뽑아 캐릭터 색에 배정 | three.js 와 무관 (Canvas getImageData, 미디언 컷, k-평균) |

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
- **스킨 저장소** `skins.js`: three.js 와 무관. 파일은 IndexedDB 에 Blob 으로, 링크는 localStorage 에 저장합니다. `URL.createObjectURL(blob)` 로 로컬 파일을 로더가 읽을 수 있는 URL 로 바꿉니다. 이름 바꾸기(`rename`)는 저장 위치에 따라 세 갈래입니다: 파일 스킨은 IndexedDB 레코드, 링크 스킨은 localStorage 목록, 기본/폴더 스킨은 별명 맵(`roomsim.skinNames`)에 저장합니다.
- **Mixamo 뼈 이름**: `mixamorig:Hips` 가 보통이지만 가끔 `mixamorig6:Hips` 처럼 숫자가 붙어 나옵니다. FBXLoader 가 `:` 을 지우므로 `player.js` 의 `getBoneName` 은 `^mixamorig\d*:?` 를 떼고 비교합니다. 이걸 놓치면 리타게팅 트랙이 거의 비어 캐릭터가 굳어 보입니다.
- **뼈대가 두 벌인 FBX**: 어떤 캐릭터는 같은 이름의 뼈대가 두 벌 들어 있고 몸과 신발이 서로 다른 쪽에 묶여 있습니다. 애니메이션 트랙은 이름으로 뼈를 찾으므로 한 벌만 움직이고 나머지 메시는 찌그러집니다. `player.js` 의 `unifySkeletons` 가 가장 큰 메시의 뼈대를 기준으로 다른 메시를 다시 묶고(`bind`), 남는 중복 뼈는 이름을 바꿔 트랙이 붙지 않게 합니다.
- **뼈 목록 순서**: `retargetClip` 은 `skeleton.bones` 순서대로 뼈의 월드 행렬을 갱신하므로 **부모가 자식보다 먼저** 와야 합니다. FBX 는 이 순서를 보장하지 않아서(어떤 캐릭터는 Head 가 0번, Neck 이 37번) 다리·엉덩이가 뒤틀린 채 나옵니다. 그래서 `retargetClips` 는 `model.traverse` 순서(항상 부모→자식)로 뼈를 다시 모은 Skeleton 을 만들어 넘깁니다. 스킨 메시의 뼈 목록에 빠진 뼈(손가락 끝 등)도 이때 같이 들어갑니다.
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

조작: **좌클릭** 사격 / 칼 베기 · **우클릭** 조준 / 칼 찌르기 · **우클릭 두 번** 배율 전환 · **R** 재장전 · **1~5 / 휠 / T** 무기 선택 · **X** 맨손 · **G** 연습 게임 (사격장 안, 60초)

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
4. 명중했으면 통계·HUD, 총구 섬광, 소리, 반동(13단계). 통계(`countShot`/`countHit`)는 `world.roomAt()` 으로 현재 방을 확인해 **사격장 안에서만** 기록합니다

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

**재질 교체**: 같은 렌즈 메시가 상황에 따라 세 가지 재질을 씁니다. 평소는 어두운 유리, 홀로 단계는 반투명 유리 + 빨갛게 빛나는 링·점 텍스처, 배율 단계는 RenderTarget 텍스처. `mesh.material = ...` 한 줄이면 됩니다 (`animateView`).

**레티클 그림은 외부 에셋 (추가)**: 처음엔 캔버스에 선을 그어 십자선을 만들었는데(`drawnReticleTex`), 지금은 **Kenney Crosshair Pack**(CC0, 200종, `public/models/crosshair/`)의 SVG 두 장을 씁니다. 소총의 홀로그램 조준기는 링 + 점(`crosshair-087`), 저격 스코프는 십자선 + 탄도 낙차 눈금(`crosshair-067`). `svgTex` 가 SVG 를 `<img>` 로 읽어 캔버스에 그리고, `globalCompositeOperation = 'source-in'` 으로 **알파만 남기고 색을 통째로 바꿉니다** (흰 그림 → 빨강/검정). 홀로는 `shadowBlur` 로 번지는 빛을 더했습니다. SVG 라서 512px 로 그려도 선이 깨지지 않습니다. 저격 스코프 접안렌즈는 반지름 0.03, 눈 거리 0.11 로 키워 화면 높이의 3/4 를 채웁니다 (각도 = `2·atan(반지름/눈거리)`). 렌즈 안 확대는 1인칭 모델에만 있으므로, **3인칭에서 배율 총으로 우클릭하면 누르고 있는 동안만 1인칭으로 들어갔다 나옵니다** (`main.js` 의 `tempScope`). 3인칭 pitch 와 1인칭 pitch 는 부호가 반대라(7단계) 전환할 때 뒤집어 시선이 튀지 않게 합니다. 실제 홀로그램 조준기는 레티클이 "무한 원점"에 맺혀 눈이 움직여도 표적에서 안 벗어나는데(시차 없음), 이 게임은 조준 중 총이 카메라 정중앙에 고정되므로 렌즈 위에 그려도 같은 효과가 납니다.

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

**블렌딩 가중치**: `poseW` 를 0↔1 로 부드럽게 바꿔 조준을 시작/해제할 때 팔이 튀지 않게 합니다. 칼 공격은 진행도 `prog`(0→1)에 따라 가중치를 사다리꼴 모양(0→1→…→0)으로 올렸다 내려서 시작과 끝이 애니메이션과 섞이게 합니다.

**칼 궤적** (`poseArms` 의 `swinging` 분기): 팔이 향할 **목표점** 하나만 정하면 `aimBone` 이 나머지를 해 줍니다.
- 베기: 어깨에서 "앞 0.75 + 오른쪽 0.9" 방향(준비)에서 "앞 0.75 + 왼쪽 1.0" 방향(타격)으로 `right` 성분만 바꿔 호를 그립니다. 벡터 두 개를 섞는 것만으로 가로 베기가 됩니다.
- 찌르기: 목표점을 "허리 옆·뒤의 한 점"(준비)에서 "조준점"(타격)으로 `lerp` 합니다. 조준점은 11단계의 Raycaster 로 구한 실제 맞을 자리라서 팔이 정확히 그쪽으로 뻗습니다.
- 진행도를 구간 함수로 나누는 방법은 18단계에서 자세히 다룹니다.

### 실습

1. `this.poseW += ... * Math.min(1, dt * 10)` 의 `10` 을 `1` 로 줄이면 조준 자세가 천천히 잡힙니다.
2. 칼 가중치 `w = Math.min(1, prog / 0.1, (1 - prog) / 0.15)` 을 `w = 1` 로 바꾸면 시작·끝이 뚝 끊깁니다.
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

**누르고 있음 vs 방금 누름**: `input.pressed('Mouse0')` 은 연사(소총), `input.pressed('Mouse0')` 은 단발(권총)입니다. 5단계의 `isDown`/`pressed` 와 같은 구분입니다.

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

## 17단계. 모듈형 캐릭터 조립과 커스터마이저 (`src/qchar.js`)

### 개념

스킨 패널의 **"내 캐릭터 만들기"** 는 Quaternius 가 CC0(퍼블릭 도메인)로 공개한 모듈형 캐릭터 팩을 조립합니다. 파일은 `public/models/q/` 에 있습니다.

| 폴더 | 내용 |
|---|---|
| `body/` | 기본 몸 2종 (남/여). 몸·눈·눈썹이 각각 SkinnedMesh |
| `hair/` | 머리 스타일 5종, 수염, 눈썹 2종 |
| `parts/` | 의상 부위별 부품 (농부/레인저 × 상의·소매·하의·신발 + 후드·어깨 보호대) |
| `anim/` | 애니메이션 43개가 든 GLB (Idle_Loop, Walk_Loop, Jog_Fwd_Loop, Jump_*, Pistol_*, Punch_* …) |
| `tex/` | 텍스처. 원본 2048 을 웹용으로 1024/512 로 줄였음 |

이 방식이 되는 이유는 하나입니다. **모든 파일이 똑같은 65개 뼈(root, pelvis, spine_01 … hand_r)를 씁니다.** 같은 뼈대라서 부품을 기본 몸의 Skeleton 에 "다시 묶기"만 하면 되고, 애니메이션도 리타게팅(8단계) 없이 그대로 재생됩니다. 공개 아바타 제작기인 CharacterStudio 도 같은 원리로 부품을 통째로 갈아 끼웁니다.

**SkinnedMesh 다시 묶기** (`attach`): 부품 glTF 를 불러오면 부품도 자기 뼈대(Armature)를 들고 옵니다. 그 뼈대는 버리고 메시만 떼어 기본 몸 옆에 넣은 뒤 `bind()` 로 기본 몸의 Skeleton 을 가리키게 합니다.

```js
m.removeFromParent();
this.bodyMesh.parent.add(m);        // 기본 몸의 Armature 아래로
m.bind(this.skeleton, m.bindMatrix); // 이제 기본 몸의 뼈가 움직이면 부품도 움직인다
```

뼈 **순서**가 다를 수 있어서 `skinIndex` 속성의 번호를 이름 기준으로 바꿔 끼우는 코드가 함께 있습니다. (GLTFLoader 는 glTF 의 `JOINTS_0` 을 `skinIndex`, `WEIGHTS_0` 을 `skinWeight` 로 이름을 바꿔 넣습니다.)

**옷 밖으로 삐져나오는 살 잘라내기** (`cutGeometry`): 기본 몸은 한 덩어리라 옷을 입히면 어깨·허벅지가 옷을 뚫고 나옵니다. 그래서 의상 부위가 덮는 뼈(예: 하의는 `thigh_*`, `calf_*`)에 가장 큰 가중치로 묶인 정점을 가진 삼각형을 **인덱스 버퍼에서 빼서** 새 지오메트리를 만듭니다. 정점 데이터는 그대로 두고 삼각형 목록만 줄이는 것이라 빠릅니다.

```js
for (let k = 0; k < 4; k++) {                 // 정점마다 뼈 4개 중 가중치가 제일 큰 뼈
  const w = weights.getComponent(i, k);
  if (w > bw) { bw = w; best = joints.getComponent(i, k); }
}
if (removeRes.some((re) => re.test(boneNames[best]))) bad[i] = 1;
// 세 정점 중 하나라도 bad 면 그 삼각형은 버린다
```

**텍스처 교체와 색 곱하기**: 피부는 밝은/어두운 텍스처 두 장 중 하나를 `material.map` 에 넣고 `material.color` 를 곱해 톤을 만듭니다. 머리·의상 색도 `color` 곱하기입니다. 직접 불러온 텍스처는 `flipY = false`, `colorSpace = SRGBColorSpace` 로 맞춰야 glTF 텍스처와 같은 방향·색으로 나옵니다.

**뼈 이름 별명** (`BONE_ALIAS`): 무기(12단계)와 조준 자세(14단계)는 Mixamo 이름(`RightHand`)으로 뼈를 찾습니다. 이 리그는 `hand_r` 이라서 `player.getBone` 이 못 찾으면 별명 표로 한 번 더 찾습니다. 코드 한 줄로 두 리그가 공존합니다.

**비동기 조립**: 부품은 네트워크에서 오므로 슬라이더를 빨리 움직이면 요청이 겹칩니다. `version` 번호로 늦게 끝난 요청을 버리고(`qchar.js`), UI 쪽은 Promise 체인으로 직렬화합니다(`ui.js` 의 `pushCharParams`).

### 코드

`apply(params)` 의 흐름:

1. 성별이 바뀌었으면 기본 몸을 새로 불러와 복제 (`loadBody`)
2. 부위(slot)마다 원하는 파일을 정하고, 이미 붙어 있으면 색만, 아니면 떼고 새로 붙임 (`attach` / `detach`)
3. 피부 텍스처·색, 눈 색, 기본 눈썹 숨김
4. 의상이 덮는 뼈 그룹으로 기본 몸 잘라내기 (결과는 `cutKey` 로 캐시)
5. 키는 루트 `scale`

`player.js` 쪽은 `setCustom` 이 기본 몸과 애니메이션을 함께 불러와 `installModel` 로 끼우고, 성별이 바뀌어 모델이 새로 만들어지면 `installQChar` 로 믹서를 다시 만듭니다.

### 실습

1. **새 애니메이션 쓰기**: `QuaterniusCharacter.loadClips` 에서 `run` 을 `Sprint_Loop` 으로 바꿔 보세요. 43개 이름은 `__game.player.qClips.all.map(c => c.name)` 으로 볼 수 있습니다.
2. `cutGeometry` 호출을 주석 처리하고 레인저 옷을 입혀 보세요. 어깨와 허벅지가 옷을 뚫고 나옵니다.
3. `COVER.legs` 정규식에서 `calf` 를 빼면 종아리 살이 바지 안에 남습니다. 꽉 끼는 바지에서 어떻게 보이는지 확인하세요.
4. `loadTex` 의 `flipY = false` 를 지우면 피부 텍스처가 위아래로 뒤집혀 얼굴이 엉뚱해집니다.
5. 피부 프리셋 `SKINS` 에 `{ tex: 'light', tint: '#c7d8ff' }` 같은 푸른 피부를 추가해 보세요. `SCHEMA` 는 `SKINS` 에서 자동으로 만들어집니다.
6. `tint()` 에서 `MI_Regular_*` 재질을 제외하는 줄을 지우면 소매 색을 바꿀 때 맨손까지 같이 칠해집니다. 왜 제외했는지 보입니다.
7. `attach` 에서 `m.bind(...)` 줄을 주석 처리해 보세요. 부품이 T 자 자세로 굳습니다.

### 확인

- 부품 glTF 마다 들어 있는 Armature 를 왜 버려도 되나요?
- `cutGeometry` 가 정점을 지우지 않고 인덱스만 줄이는데도 메시가 작아 보이는 이유는?
- Mixamo 캐릭터(8단계)는 리타게팅이 필요했는데 이 캐릭터는 왜 필요 없나요?

---

## 18단계. 키프레임 없이 만드는 공격 모션: 구간 함수와 지연 판정 (`animateKnife`, `startAttack`)

### 개념

**애니메이션 파일 없이 모션 만들기.** 칼 베기·찌르기는 Mixamo 클립이 아니라 **진행도(0→1)를 받아 위치·회전을 돌려주는 함수**입니다. 매 프레임 `prog = 1 - swingT / dur` 를 구해 `animateKnife(prog)` 에 넣으면 그 순간의 자세가 나옵니다. 8단계의 AnimationMixer 가 "파일에 적힌 키프레임을 보간"한다면, 이건 "수식으로 키프레임을 대신"하는 것입니다. 짧고 단순한 동작(반동, 휘두르기, 흔들림)은 이 방식이 훨씬 가볍습니다.

**구간 함수 `seg`** (`weapons.js` 상단):

```js
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);  // p 가 a~b 를 지나는 동안 0→1
const easeOut = (t) => 1 - (1 - t) ** 3;                   // 빠르게 시작해 천천히 멈춤
const easeInOut = (t) => t * t * (3 - 2 * t);              // 양끝이 부드러움
```

한 동작을 **준비 → 타격 → 유지 → 복귀** 구간으로 나누고, 구간마다 `seg` 로 0→1 값을 하나씩 뽑습니다. 찌르기라면:

```js
const back = easeInOut(seg(prog, 0, 0.3));     // 0~30%: 뒤로 당김 (0→1 로 올라가서 1 유지)
const out = easeOut(seg(prog, 0.3, 0.46));     // 30~46%: 앞으로 뻗음 (빠르게)
const hold = 1 - easeInOut(seg(prog, 0.62, 1)); // 62% 까지 1, 그 뒤 0 으로 (복귀)
const dz = (0.09 * back - 0.44 * out) * hold;  // 뒤로 9cm 갔다가 앞으로 44cm, 마지막에 0 으로
view.position.z = rest.z + dz;
```

`back` 은 구간이 끝나도 1 로 남아 있다는 점이 핵심입니다. 그래서 "당긴 자세를 유지한 채로" 다음 구간 `out` 이 덧붙고, 마지막에 `hold` 가 0 이 되면 전부 제자리로 돌아옵니다. 변수 몇 개를 곱하고 더하는 것만으로 복합 동작이 나옵니다.

**베기 vs 찌르기 (서든어택식)**: 좌클릭 베기는 0.3초, 오른쪽에서 왼쪽으로 가로지르며 `rotation.z = -1.4` 로 칼날을 눕힙니다. 우클릭 찌르기는 0.62초, 뒤로 당겼다가 화면 중앙으로 깊게 뻗고(사거리 2.3m, 10점) 쿨다운이 깁니다. 무기 정의의 `stab: { cool, reach, score }` 가 그 수치입니다.

**판정은 "닿는 순간"에**: 예전 코드는 클릭 즉시 `meleeHit` 을 불렀습니다. 그러면 칼이 아직 뒤에 있는데 점수가 들어가서 때리는 느낌이 안 납니다. 지금은 `startAttack` 이 `pendingHit = { at: dur * (1 - hitAt), ... }` 만 적어 두고, `update` 에서 `swingT <= at` 이 되는 프레임에 판정합니다 (`ATTACKS[kind].hitAt` 이 0.42/0.46 = 칼이 가장 앞에 있는 순간). 맞으면 `rig.kick` 으로 화면을 살짝 튕기고 `playHitThud` 로 '턱' 소리를 내서 타격감을 더합니다 (13단계 반동과 같은 장치).

**1인칭·3인칭이 같은 타이머를 공유**: `swingT`/`attack` 은 하나인데, 1인칭은 `animateKnife` 가 카메라에 붙은 모델을, 3인칭은 `poseArms` 가 팔 뼈를 움직입니다 (14단계). 시점을 바꿔도 동작 타이밍이 어긋나지 않습니다.

### 실습

1. `ATTACKS.stab.dur` 을 `1.2` 로 늘려 느린 동작으로 구간이 어떻게 이어지는지 관찰하세요.
2. `hitAt` 을 `0` 으로 바꾸면 클릭 즉시 판정됩니다. 표적 바로 앞에서 찔러 보고 차이를 느껴 보세요.
3. 베기의 `rotation.z = -1.4 * flat` 을 `0` 으로 바꾸면 칼날이 세로로 선 채 움직입니다. 왜 눕혀야 "베는" 느낌이 날까요?
4. 찌르기에 `view.rotation.z` 대신 `rotation.y` 를 조금 더해 칼이 비틀리며 들어가게 해 보세요.
5. 콘솔에서 자세를 고정해 보세요 (스크린샷용으로 쓴 방법입니다):
   ```js
   const w = __game.weapons; w.attack = 'stab'; w.swingT = 100;
   Object.defineProperty(w, 'attackProgress', { configurable: true, get: () => 0.5 });
   // 되돌리기: delete w.attackProgress; w.swingT = 0; w.attack = null;
   ```
6. 주먹(`punch`)도 같은 구조입니다. `ATTACKS.punch.hitAt` 을 바꿔 보세요.

### 확인

- `back` 이 구간이 끝난 뒤 0 으로 돌아간다면 찌르기 동작이 어떻게 보일까요?
- 판정을 미루는 대신 "동작 시작 때 판정하고 효과만 늦게" 보여 주면 무엇이 달라질까요? (움직이는 표적을 생각해 보세요)
- `hold` 를 곱하지 않으면 동작 끝에 칼이 어디에 있을까요?

---

## 19단계. 연습 게임: 상태 기계, 타이머, 움직이는 표적 (`src/range.js` 의 `game`, `update`)

### 개념

**상태 기계(state machine)**: 게임은 `idle → countdown → running → over → idle` 네 상태를 돕니다. 상태마다 할 일이 다르고(카운트다운은 숫자만 세고, running 만 표적을 움직이고 점수를 받고), 전이는 정해진 곳에서만 일어납니다(`startGame`, `stopGame`, `dismissGame`, `update` 의 시간 만료). "지금 게임 중인가?"를 불리언 여러 개로 관리하면 금방 꼬이는데, 상태 하나로 모으면 UI 도 `game.state` 만 보면 됩니다.

**타이머는 dt 누적**: `game.time -= dt` 가 전부입니다. 1단계 `Clock` 의 `dt` 는 프레임마다 다르므로 "프레임 수를 센다"가 아니라 "경과 시간을 뺀다"가 옳습니다. 카운트다운 소리는 `Math.ceil(time)` 이 바뀌는 프레임에만 울립니다 (`lastBeep` 으로 중복 방지).

**사인파 왕복** (`update`):

```js
t.phase += dt * speed / MOVE_AMP;                 // 위상 속도 = 선속도 ÷ 진폭
t.pivot.position.z = t.homeZ + MOVE_AMP * Math.sin(t.phase);
```

위치를 시간의 함수로 직접 쓰지 않고 **위상을 누적**하는 이유는 속도를 도중에 바꿔도(뒤로 갈수록 1.6배까지 빨라짐) 표적이 튀지 않게 하기 위해서입니다. `z = sin(speed * elapsed)` 로 쓰면 `speed` 가 바뀌는 순간 위치가 점프합니다. 레인마다 `phase` 초깃값과 속도를 다르게 줘서 세 표적이 제각각 움직입니다. 게임이 끝나면 `homeZ` 로 보간해 돌아옵니다 (7단계 패턴).

**모듈 사이의 연결**: 점수는 `weapons.countHit` 이 알고, 게임 상태는 `range` 가 압니다. `weapons` 가 `range.onHit(score)` 를 호출하고 `range` 는 `running` 일 때만 더합니다. 전체 누적 점수(`weapons.stats`)와 이번 판 점수(`game.score`)를 분리한 덕에 게임이 끝나도 연습 기록은 남습니다. `main.js` 는 G 키·버튼·결과 창 "다시 시작"을 전부 `toggleGame` 하나로 받습니다 (16단계 입력 우선순위의 연장).

**UI 는 매 프레임 상태를 읽기만**: `ui.setGame(game)` 이 매 프레임 불리지만 DOM 은 문자열이 바뀐 프레임에만 건드립니다. 결과 창은 `state` 가 `over` 로 **바뀌는 순간** 한 번만 엽니다 (이전 상태를 `_game.state` 에 기억). 최고 기록은 `localStorage` 에 저장합니다 (9단계 skins 와 같은 저장소).

### 실습

1. `GAME_TIME` 을 `30` 으로, `COUNTDOWN` 을 `1` 로 바꿔 짧은 게임을 만들어 보세요.
2. `MOVE_SPEED` 를 전부 `3` 으로 올리고 저격총으로 맞춰 보세요. 움직이는 표적에는 어떤 무기가 유리한가요?
3. 속도 증가 `1 + 0.6 * (...)` 을 `1 + 2 * (...)` 로 바꿔 막판을 어렵게 해 보세요.
4. 위상 누적 대신 `z = homeZ + AMP * Math.sin(elapsed * speed)` 로 바꾸고 속도 증가가 켜진 상태에서 표적이 떨리는지 관찰하세요.
5. 표적이 앞뒤(x)로도 움직이게 `pivot.position.x` 에 작은 사인파를 더해 보세요. 점수 판정(`worldToLocal`)이 그대로 맞는 이유는 10단계에 있습니다.
6. `GAME_DOWN_TIME` 을 `0.2` 로 줄여 연사 무기로 점수를 쓸어 담아 보세요.
7. 상태를 하나 추가해 보세요: `paused`. P 키로 `running ↔ paused` 를 오가며 `update` 에서 시간이 멈추게.

### 확인

- `onHit` 이 `running` 을 확인하지 않으면 카운트다운 중에 쏜 점수는 어떻게 될까요?
- `stopGame` 이 `countdown` 상태에서도 호출되는 이유는?
- 결과 창을 `state === 'over'` 인 동안 매 프레임 `toggleGamePanel(true)` 로 열면 무슨 문제가 생길까요? (`onPanelsChanged` 가 하는 일을 떠올리세요)

---

## 20단계. 사진에서 색 뽑아 캐릭터에 입히기 (`src/palette.js`, Canvas 픽셀 처리)

### 개념

three.js 코드는 아니지만 게임에서 자주 쓰는 **이미지 → 데이터** 처리입니다. 커스터마이저의 "📷 사진으로 색 맞추기"는 jpg/png 를 읽어 주요 색 6개를 뽑고 상의·하의·소매·신발·머리색에 배정합니다.

**픽셀 읽기** (`extractPalette`): `<img>` 로 파일을 열고 `<canvas>` 에 48×48 로 **축소해서** 그린 뒤 `getImageData` 로 RGBA 배열을 받습니다. 원본 크기로 읽으면 수백만 픽셀을 돌아야 하지만 48×48 이면 2,304개면 충분합니다. 10단계 CanvasTexture 가 "캔버스에 그려서 텍스처로" 였다면 이건 "캔버스에 그려서 숫자로" 입니다. 투명 픽셀(alpha < 128)은 png 배경이므로 뺍니다.

**미디언 컷(median cut)**: 색 수를 줄이는 고전 알고리즘입니다. 모든 픽셀을 상자 하나에 넣고, "R/G/B 중 범위가 가장 넓은 채널"의 중앙값에서 반으로 쪼개기를 상자가 6개가 될 때까지 반복합니다. 상자마다 평균을 내면 대표색이 됩니다. 쪼갤 상자를 "픽셀이 많은 것"으로 고르면 단색 큰 영역이 둘로 갈라지므로 "색 범위가 넓은 것"으로 고릅니다.

**k-평균 다듬기(`refine`)**: 미디언 컷은 경계가 거칠어서(파랑과 흰색이 한 상자에 섞이면 연보라가 나옴) 그 결과를 시작점으로 "픽셀을 가장 가까운 대표색에 배정 → 평균 다시 계산"을 4번 돌립니다. 그리고 거리 28 미만인 비슷한 색은 합칩니다(`dedupe`).

**색 배정 규칙** (`paletteToParams`): HSL 의 밝기(l)와 채도(s)로 역할을 정합니다. 너무 밝거나(l > 0.92, 흰 배경) 어두운(l < 0.12) 색은 옷 후보에서 빼고, `개수 × (0.4 + 채도)` 점수가 높은 색이 상의, 상의와 RGB 거리가 가장 먼 색이 하의, 가까운 색이 소매, 가장 어두운 색이 신발·머리입니다. 17단계의 색 **곱하기** 방식 때문에 아주 어두운 색은 옷 무늬가 사라지므로 `lift` 로 밝기 하한을 둡니다.

**저장**: 썸네일(96px JPEG dataURL, 약 3KB)과 색 견본을 스킨 기록에 같이 넣어 localStorage 에 저장합니다. 다시 열면 썸네일과 견본이 복원되고, 견본을 클릭하면 상의 색으로 바로 씁니다. 드래그앤드롭은 16단계의 창 전체 drop 핸들러를 재사용하되, 커스터마이저가 열려 있고 이미지면 사진 처리로, 아니면 기존 .glb/.fbx 추가로 보냅니다.

### 실습

1. `SAMPLE` 을 `8` 로 줄여 보세요. 색이 뭉개집니다. `256` 으로 올리면 결과는 비슷한데 느려지나요?
2. `COLORS` 를 `3` 과 `12` 로 바꿔 견본이 어떻게 달라지는지 보세요.
3. `refine` 호출을 빼고(`dedupe(medianCut(...))`) 파랑+흰 배경 사진을 넣어 연보라가 나오는지 확인하세요.
4. 눈 색도 자동으로 정해 보세요. 채도가 낮고 어두운 색을 `eyeColor` 로.
5. 콘솔에서 직접 써 보세요: `import('/src/palette.js').then(m => m.extractPalette('/models/q/tex/T_Superhero_Male_Light.png').then(console.log))`
6. 가장 많이 쓰인 색을 **배경**으로 간주해 빼는 규칙을 추가해 보세요 (인물 사진은 배경이 제일 넓습니다).

### 확인

- 평균색을 낼 때 RGB 를 그냥 평균하면 왜 빨강+파랑이 보라가 아니라 칙칙한 회보라가 될까요? (감마와 선형 색 공간, 10단계 `colorSpace` 와 같은 주제)
- `dedupe` 를 k-평균 **앞**에 두면 무슨 문제가 생길까요?
- 상의 색을 "가장 많이 쓰인 색"으로만 정하면 인물 사진에서 무엇이 뽑힐까요?

---


# 3부. 공개 에셋으로 세상 넓히기

## 21단계. 외부 glTF 에셋 불러와 배치하기 (`src/furniture.js`, `world.js` 의 가구)

### 개념

2단계에서 박스로 만들던 가구를 **Kenney Furniture Kit**(CC0, https://kenney.nl/assets/furniture-kit) 의 glTF 모델로 바꿨습니다. 파일은 `public/models/kenney/` 에 있고, 주방 가구(싱크대·가스레인지·냉장고·상부장·전자레인지 등)도 같은 키트입니다. 8단계에서 캐릭터 한 개를 불러왔다면, 이번엔 **작은 모델 수십 개를 좌표에 맞춰 놓는** 일입니다. 세 가지 문제를 풀어야 합니다.

**1. 단위가 다르다.** 키트는 미터가 아닙니다 (의자 높이 0.61, 더블 침대 폭 0.96). 캐릭터(약 1.8m)와 비율이 맞도록 `KENNEY_SCALE = 2.2` 를 곱합니다. Nature Kit 은 울타리 한 칸이 1 단위라 2.5 를 씁니다. 처음 보는 키트는 바운딩 박스부터 재 보세요 (실습 1).

**2. 원점이 제각각이다.** 어떤 모델은 바닥 모서리가 원점이고(책상: x 0~0.73, z -0.38~0), 어떤 모델은 중심이 원점입니다(TV: x -0.34~0.34). 그래서 `place()` 는 "원하는 좌표에 바로 놓기"가 아니라 **"일단 넣고 → `Box3.setFromObject` 로 재고 → 바닥 중심이 (x, y, z) 가 되게 옮기기"** 를 합니다.

```js
obj.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(obj);
const c = box.getCenter(new THREE.Vector3());
obj.position.set(x - c.x, y - box.min.y, z - c.z); // 바닥(min.y)이 y 에, 중심이 (x, z) 에
```

반환값의 `box` 는 월드 좌표의 바운딩 박스라 **위에 뭔가 올릴 때** 그대로 씁니다: `P('laptop', x, z, { y: desk.box.max.y })`. 침대 매트리스처럼 "상자 꼭대기"가 아닌 높이는 모델 안쪽 값이라 따로 잽니다 (`mattress = bed.box.min.y + 0.25 * KENNEY_SCALE`).

**3. 비동기다.** 모델은 네트워크에서 오므로 `createWorld()` 가 끝난 뒤에 도착합니다. 그래서 `place()` 는 `colliders` / `shootables` 배열에 **도착하는 대로 push** 하고, 플레이어(`world.allColliders()`)와 총알(`world.shootables`)은 매 프레임 배열을 다시 읽으므로 늦게 추가돼도 그 순간부터 막히고 맞습니다. 순서가 중요한 것(책상 위 노트북)은 `await` 로 잇고, 전체 완료는 `world.furnitureReady` 프로미스로 알 수 있습니다.

**clone 과 재질 공유**: 같은 파일을 여러 번 쓰면 `loadAsync` 는 한 번만 하고(`cache`) `gltf.scene.clone(true)` 로 복제합니다. `clone` 은 노드 트리만 복제하고 **지오메트리·재질은 공유**합니다. 메모리에 좋지만, 한 개만 색을 바꾸려면 재질을 `clone()` 해야 합니다 (23단계의 동물 피격 번쩍임이 그 예).

**metalness 함정**: Nature Kit 의 glTF 는 모든 재질이 `metallicFactor: 1` 로 내보내져 있습니다. 금속은 **주변을 반사해서** 보이는 재질이라 환경맵이 없는 이 씬에서는 **검게** 나옵니다 (실제로 처음 넣었을 때 나무가 전부 검었습니다). `loadGltf` 에서 `metalness = 0` 으로 되돌립니다. 모델이 검게 나오면 제일 먼저 의심할 것.

**모델 방향**: 이 키트는 `rotY = 0` 일 때 앞면이 +z 를 봅니다 (TV 장의 문, 소파의 앉는 면). 벽에 붙일 땐 등이 벽을 보게 돌리세요: -z 벽은 0, +z 벽은 π, +x 벽은 -π/2. 의자만 예외로 -z 를 보니, 확신이 없으면 스크린샷으로 확인하는 게 빠릅니다.

### 실습

1. 새 모델의 크기 재기: 콘솔에서 `await __game.world.furnitureReady; __game.world.colliders.at(-1)` 이 마지막에 놓인 가구의 충돌 상자(Box3)입니다. `min`/`max` 를 빼면 크기가 나옵니다.
2. `public/models/kenney/` 에 키트의 다른 모델(예: `lampRoundTable.glb`, 원본 zip 의 `Models/GLTF format/`)을 넣고 사이드 테이블 위에 올려 보세요. `y: side.box.max.y`.
3. `KENNEY_SCALE` 을 1.5 와 3 으로 바꿔 캐릭터와 비교해 보세요. 문(2.1m)과 침대의 비율이 어색해지는 지점을 찾아보세요.
4. `loadGltf` 의 metalness 되돌리는 줄을 주석 처리하고 밖에 나가 보세요. 나무가 검게 변합니다. `scene.environment` 에 `RoomEnvironment` 를 넣으면 금속도 보이는지 확인해 보세요 (9단계 심화).
5. 책상 `rotY` 를 π 로 바꿔 서랍이 벽을 보게 해 보세요. "앞면이 +z" 규칙이 몸에 익습니다.

### 확인

- `place()` 가 `group.add(obj)` **전에** `updateMatrixWorld(true)` 를 부르는 이유는? (힌트: `Box3.setFromObject` 는 월드 행렬을 읽는다)
- 가구가 도착하기 전에 플레이어가 그 자리에 서 있으면 무슨 일이 생길까요? 6단계 `resolve` 를 떠올려 보세요.
- `clone(true)` 한 두 모델 중 하나의 `material.color` 를 바꾸면 왜 둘 다 바뀔까요?

---

## 22단계. 집 밖 세상: 큰 땅, 울타리, 인스턴싱, 하늘 전환 (`src/outdoor.js`, `main.js` 의 SKY)

### 개념

거실 +z 벽에 **현관문**을 내고(`doorwayX`, 4단계 Door 에 `along: 'x'` 옵션을 추가해 z=일정한 벽에도 달 수 있게 했습니다) 밖으로 나가면 200m × 200m 잔디(`GROUND`), 집을 둘러싼 울타리(`YARD`), 그 밖의 숲과 들판이 있습니다. Kenney Nature Kit (CC0, https://kenney.nl/assets/nature-kit) 을 씁니다.

**방 판정의 확장**: `roomAt` 은 실내 방 → 마당 → 들판 순으로 찾습니다. 마당 사각형이 집을 포함하므로 **실내를 먼저** 보는 순서가 중요합니다. 방 객체에 `outdoor: true` 를 달아 두면 카메라 천장 높이(`ceilingAt`: 실내 3m, 밖 60m)와 하늘 색을 이것으로 정할 수 있습니다.

**결정적 난수**: 나무 120그루, 풀 400포기를 `Math.random` 으로 뿌리면 새로고침마다 숲이 바뀝니다. `rng(seed)` (mulberry32) 로 **같은 씨앗 → 같은 숲**을 만듭니다. "집 안·돌길·울타리 줄 피하기, 서로 2.5m 이상 떨어지기" 같은 조건은 `pick()` 이 30번까지 다시 뽑아 해결합니다.

**충돌 상자는 모양대로가 아니라 쓰임대로**: 나무의 바운딩 박스는 잎까지 포함해 2m 가 넘습니다. 그대로 막으면 나무 근처에 못 갑니다. `footprint: [0.8, 0.8]` 로 **줄기만** 막습니다. 울타리는 칸마다 상자를 두지 않고 **변마다 긴 상자 하나**(출입구 `GATE` 구간은 둘로 쪼갬)로 5개만 둡니다. 6단계 `resolve` 가 매 프레임 모든 상자를 도는 걸 기억하세요.

**InstancedMesh**: 풀 400개를 `clone` 으로 놓으면 드로우 콜 400개입니다. 같은 지오메트리·재질을 쓰는 물체는 `InstancedMesh(geometry, material, count)` 하나로 묶고, 인스턴스마다 `setMatrixAt(i, matrix)` 로 위치·회전·크기만 다르게 줍니다. 드로우 콜이 **모델당 1개**가 됩니다. 모델 안에 메시가 여럿(꽃은 줄기+꽃잎)이면 메시마다 InstancedMesh 를 만들고, 인스턴스 행렬 = 배치 행렬 × 메시의 로컬 행렬입니다.

```js
place.compose(pos, quat, scl);                 // 어디에, 어떻게 돌려서, 얼마나 크게
m.multiplyMatrices(place, mesh.matrixWorld);   // 모델 안에서 이 메시가 있던 자리까지 포함
inst.setMatrixAt(i, m);
inst.instanceMatrix.needsUpdate = true;        // 안 하면 GPU 에 안 올라간다
```

울타리도 인스턴싱입니다 (`fence_simple` 100여 칸 → 메시 2개). Raycaster 는 InstancedMesh 도 맞춰 주므로(`hit.instanceId`) 총알이 울타리에 막힙니다.

**그림자 카메라 따라가기**: 3단계의 DirectionalLight 그림자는 직교 카메라 한 장(`shadow.camera` ±22m, 2048²)으로 찍습니다. 200m 땅을 다 덮으면 해상도가 10배 떨어집니다. 대신 `world.update()` 에서 매 프레임 `sun.position` 과 `sun.target.position` 을 플레이어 기준으로 옮겨 **플레이어 주변만** 선명하게 찍습니다. 멀리는 어차피 안개에 가립니다.

**하늘·안개 전환**: 실내는 흰 배경 + 짙은 안개(`FogExp2` 0.04), 밖은 하늘색 + 옅은 안개(0.009) 입니다. 문턱에서 갑자기 바뀌면 어색하니 `main.js` 가 매 프레임 `scene.background.lerp(목표, k)`, `fog.density += (목표 - 현재) * k` 로 섞습니다. `k = 1 - exp(-dt * 3)` 은 5단계의 프레임 독립 보간입니다. 안개 색은 항상 배경색과 같게 맞춰야 지평선이 자연스럽습니다.

**지붕**: 천장은 `BackSide` 라 밖에서 위를 보면 비어 보입니다. 방마다 얇은 박스 지붕을 얹었습니다. 문이 많아지니 `doorwayZ` / `doorwayX` 두 도우미로 정리했습니다.

### 실습

1. `rng(20261023)` 의 씨앗을 바꿔 다른 숲을 만들어 보세요. 마음에 드는 씨앗을 찾으면 그게 "맵" 입니다.
2. `footprint` 를 지우고 나무 사이를 걸어 보세요. 잎 밑으로 못 들어갑니다.
3. `kit.scatter('grass', ...)` 를 `for` + `kit.place` 로 바꾸고 좌상단 FPS 와 `__game.renderer.info.render.calls` 를 비교해 보세요.
4. `sun.shadow.camera.left/right/top/bottom` 을 ±100 으로 늘리고 그림자 가장자리를 보세요. 그리고 `update` 의 해 따라가기를 빼면 밖에서 그림자가 사라지는 걸 확인하세요.
5. `SKY.outdoor.fog` 를 0.03 으로 올려 안개 낀 아침을 만들어 보세요. 밤도 만들어 보세요 (배경 어둡게 + HemisphereLight 약하게).
6. 출입구(`GATE`)에 `fence_gate` 모델로 여닫는 문을 달아 보세요. 4단계 Door 를 상속하거나 비슷하게 만들면 됩니다.

### 확인

- 울타리 충돌 상자를 칸마다 두면 상자 수가 몇 개가 될까요? 변마다 하나로 줄여도 플레이 감각이 같은 이유는?
- InstancedMesh 인스턴스 하나만 색을 바꾸려면? (힌트: `setColorAt`, 재질의 `vertexColors` 가 아니라 `instanceColor`)
- 안개 색과 배경색이 다르면 어떤 모습이 될까요? 실제로 바꿔 보세요.

---

## 23단계. 돌아다니는 동물: 상태 기계, 애니메이션 클립, 피격과 드롭 (`src/animals.js`, `weapons.js` 의 `userData.animal`)

### 개념

울타리 밖 `ANIMAL_ZONE` 에 **Kenney Cube Pets** (CC0, https://kenney.nl/assets/cube-pets) 동물 12마리가 삽니다. 이 키트는 glTF 안에 `idle / walk / run / eat` 등 애니메이션 클립이 들어 있어서 8단계의 Mixamo 와 같은 방식(`AnimationMixer` + `clipAction`)으로 재생합니다. 뼈(Skeleton) 없이 **노드 자체를 움직이는** 클립이라 `clone(true)` 한 모델에도 이름으로 그대로 붙습니다.

**상태 기계** (19단계 연습 게임과 같은 패턴): `idle` (서서 풀 뜯기, 1~4초) → `walk` (들판 안 임의의 점으로) → 도착하면 다시 `idle`. 플레이어가 7m 안에 오면 `flee` 로 전환해 **플레이어 반대 방향**(`p - playerPos` 를 정규화)으로 `run` 클립과 함께 달아나고, 14m 이상 멀어지면 진정합니다. 들판 가장자리에 몰리면 성분 부호를 뒤집어 비스듬히 튑니다. 방향 전환은 플레이어와 같은 "각도 차이를 -π~π 로 접어 보간" 입니다 (5단계).

**피격 고리**: 11단계 Raycaster 는 "맞은 메시"만 알려 줍니다. 그 메시가 어느 동물인지 알려면 메시에 표식을 남겨야 합니다. 표적이 `userData.target` 을 쓴 것처럼 동물은 생성 시 모든 메시에 `userData.animal = this` 를 넣고, `weapons.js` 의 `shoot` / `meleeHit` 가 `hit.object.userData.animal` 을 보면 점수 대신 `world.animals.hit(animal, dmg)` 를 부릅니다. 무기마다 `dmg` (권총·소총·산탄 1, 저격 3, 찌르기 2) 를 두고 동물마다 `hp` (병아리 1 ~ 소 3) 를 둡니다.

**번쩍임과 재질 복제**: 맞으면 0.15초 동안 `material.emissive` 를 빨갛게 올립니다. 21단계에서 말한 대로 `clone` 은 재질을 공유하므로 동물 하나가 번쩍이면 **같은 종 전부** 번쩍입니다. 그래서 생성 시 `m.material = m.material.clone()` 으로 동물마다 재질을 따로 둡니다.

**죽음 → 드롭 → 리스폰**: HP 가 0 이면 `dead` 상태에서 `rotation.z` 를 0 → π/2 로 ease-out 보간해 옆으로 쓰러지고, 1.4초 뒤 모델을 치우며 종에 따라 1~3개의 고기(`makeMeat`: 구 + 원기둥)를 흩뿌립니다. 죽는 순간 **피격 목록에서 메시를 빼서**(`shootables.splice`) 시체에 총알이 박히지 않게 합니다. 25초 뒤 `respawnQueue` 가 새 동물을 만듭니다. 고기는 `sin` 으로 둥실거리며 돌고, `nearestItem` 으로 1.6m 안의 것을 찾습니다.

**상호작용 통합** (`main.js`): 문·무기 선반·고기·가스레인지를 한 루프에서 **가장 가까운 것 하나**로 고르고 종류(`nearKind`)에 따라 안내 문구와 E 키 동작을 분기합니다. 대상이 늘어도 `consider()` 한 줄만 추가하면 됩니다.

### 실습

1. `FLEE_DIST` 를 2 로 줄이면 몰래 다가갈 수 있습니다. 반대로 `CALM_DIST` 를 50 으로 올리면 한 번 놀란 동물은 영원히 뜁니다.
2. 멧돼지(`hog`)를 **공격형**으로 만들어 보세요: flee 대신 플레이어 쪽으로 달려오게 (`_v` 부호 반대), 닿으면 `ui.toast('받혔다!')`.
3. `a.play('dance')` 처럼 클립 이름을 바꿔 보세요. 클립 목록은 `place()` 가 돌려주는 `clips.map(c => c.name)` 입니다.
4. 재질 복제 줄(`m.material = m.material.clone()`)을 지우고 소 한 마리를 쏴 보세요. 소 전부가 번쩍입니다.
5. 산탄총으로 가까이서 쏘면 소(HP 3)가 한 방에 죽는 이유를 코드에서 찾아보세요 (`pellets`).
6. 동물끼리 겹치지 않게 해 보세요: `update` 에서 다른 동물과 1m 안이면 밀어내기 (6단계 원-원 충돌).

### 확인

- `userData` 에 객체 참조를 넣는 방식의 장점과, 대신 `Map<Mesh, Animal>` 을 쓰는 방식의 차이는?
- 죽은 동물을 `shootables` 에서 빼지 않으면 어떤 일이 생길까요? 고기를 집을 때는 왜 문제가 없나요?
- `flee` 방향을 "플레이어 반대"가 아니라 "가장 가까운 나무 뒤"로 바꾸려면 무엇이 더 필요할까요?

---

## 24단계. 주방과 요리: 인벤토리와 시간이 걸리는 상호작용 (`main.js` 의 `inv`, `cooking`)

> 이 단계의 "생고기 → 익힌 고기" 한 가지 요리는 27단계에서 재료 12종·배합법 13개 체계로 확장됩니다. 구조(타이머, 인벤토리 객체, 가스레인지 기준점)는 그대로입니다.

### 개념

거실 -z 벽에 **주방 문**을 내고 8m × 8m 주방을 붙였습니다. 싱크대 줄은 `row` 배열을 돌며 `x = 5.6 + i * 0.43 * K` 로 **모듈 폭만큼 띄워** 놓습니다 (키트의 주방 모듈은 전부 폭 0.43 이라 이렇게 줄 세울 수 있습니다). 상부장·후드는 `y: 1.5` 로 벽에 띄우고 `collide: false`, 조리대 소품은 `y: counterTop` (21단계의 "위에 올리기").

**인벤토리는 그냥 객체**: `inv = { raw, cooked }`. 고기를 주우면 `raw++`, HUD 는 `ui.setInventory(inv)` 가 문자열이 바뀔 때만 DOM 을 고칩니다 (12단계 HUD 와 같은 "값이 바뀔 때만 갱신" 습관).

**시간이 걸리는 상호작용**: 지금까지 E 는 즉시 끝났습니다(문, 줍기). 요리는 `cooking = COOK_TIME` 을 세팅하고 **매 프레임 `dt` 만큼 줄이는** 타이머입니다. 요리 중에는 다른 상호작용 안내를 덮어쓰고, 0 이 되면 `cooked++`. 19단계 카운트다운과 같은 구조입니다. 가스레인지의 기준점(`world.stove.center`)은 가구가 도착한 뒤 실제 위치로 갱신됩니다.

### 실습

1. 요리에 연출을 붙여 보세요: 요리 중 가스레인지 위에 작은 주황 PointLight 를 켜고(3단계) 끝나면 끕니다.
2. 익힌 고기를 먹는 동작(E 로 `cooked--`, 토스트 "냠")과 **배고픔 게이지**를 만들어 보세요. 시간이 지나면 줄고, 먹으면 찹니다.
3. 냉장고에 E 로 고기를 넣고 꺼내는 **보관함**을 만들어 보세요. `inv` 와 같은 객체를 하나 더 두면 됩니다.
4. 요리 중에 멀어지면 취소되게 해 보세요 (`nearKind !== 'stove'` 면 `cooking = 0`).
5. 식탁 의자 4개의 `rotY` 를 모두 0 으로 바꿔 어느 의자가 등을 돌리는지 보고, "의자는 -z 를 본다"를 확인하세요.

### 확인

- `cooking` 을 `setTimeout` 으로 만들면 무엇이 달라질까요? (탭을 숨겼을 때, 게임을 일시정지했을 때)
- `stove.center` 를 가구 도착 **전**에 고정 좌표로 두면 어떤 문제가 있을까요? 지금 코드는 어떻게 피했나요?

---


## 25단계. 진행 상황 저장: localStorage 스냅샷 (`src/save.js`, `main.js` 의 `snapshot` / `restore`)

### 개념

새로고침하면 고기·위치·탄약이 모두 초기화됩니다. 서버가 없어도 브라우저의 **localStorage** (도메인당 약 5MB 의 문자열 저장소)에 남기면 됩니다. 이미 스킨(IndexedDB, 16단계)과 사격장 최고 점수(`range.best`)가 이런 식으로 저장되고 있었고, 이번엔 "게임 진행" 전체를 한 덩어리로 저장합니다.

**스냅샷 = 평범한 객체**: 저장은 `JSON.stringify` 라서 `Vector3` 나 `Door` 객체를 그대로 넣을 수 없습니다. `snapshot()` 이 **숫자·문자열·배열만으로** 상태를 다시 적습니다: 위치 `[x, y, z]`, 시점 `yaw/pitch/distance/mode`, 무기 id 와 `ammo`, `stats`, `inv`, 문마다 `open` 여부 배열. **무엇을 저장하지 않는지**도 결정입니다. 동물·떨어진 고기·연습 게임 진행은 저장하지 않습니다 (리스폰되는 것, 짧은 것).

**복원은 "세터"를 거쳐서**: 불러올 때 `player.position.set(...)` 처럼 값을 꽂되, 파생 상태가 있는 것은 그 경로로 갑니다. 무기는 `selectWeapon(id)` (HUD·포인터락까지 갱신), 시점 모드는 `setMode`, 문은 `door.setOpen(open, true)` (애니메이션 없이 즉시 + 충돌 상자 갱신). 값만 바꾸고 파생 상태를 잊으면 "문은 열려 있는데 막히는" 버그가 납니다.

**언제 저장하나**: 매 프레임 쓰면 60번/초 디스크 쓰기라 낭비입니다. `createAutoSave` 는 2초마다 한 번, 그리고 `beforeunload` (탭 닫기·새로고침) 와 `visibilitychange` (다른 탭으로) 때 즉시 씁니다. 모바일은 `beforeunload` 가 안 올 때가 있어서 `visibilitychange` 가 보험입니다.

**버전 번호**: 저장 형식에 `v: 1` 을 넣고, 읽을 때 맞지 않으면 버립니다. 나중에 필드를 바꿔도 옛 저장 때문에 깨지지 않습니다. HUD 의 "진행 초기화" 버튼은 `clearSave()` 후 새로고침합니다.

### 실습

1. 개발자 도구 → Application → Local Storage 에서 `roomsim.save.v1` 을 열어 보세요. 값을 직접 고치고(예: `inv.raw` 를 99) 새로고침하면 반영됩니다.
2. 떨어진 고기도 저장해 보세요: `world.animals.items` 의 좌표·라벨을 배열로 넣고, 복원 때 `makeMeat` 로 다시 만듭니다.
3. `INTERVAL` 을 0.016 으로 바꾸고 Performance 탭에서 `setItem` 비용을 보세요.
4. 저장 슬롯 3개를 만들어 보세요 (`KEY + ':' + slot`).
5. `v` 를 2 로 올려 보세요. 옛 저장이 무시되고 처음부터 시작합니다. 대신 **마이그레이션**(v1 → v2 변환 함수)을 써 보세요.

### 확인

- localStorage 대신 쿠키나 IndexedDB 를 쓰면 무엇이 달라질까요? 스킨 파일은 왜 IndexedDB 였나요?
- 저장 직후 탭을 강제 종료하면 어디까지 남을까요? `beforeunload` 가 보장하는 것과 못 하는 것은?
- 동물 위치까지 저장하면 어떤 장단점이 있을까요?

---


## 26단계. 두 번째 조립 캐릭터 팩: 같은 뼈대의 부위 섞어 입기 (`src/umchar.js`, `furniture.js` 의 `loadGltf`)

### 개념

기본 스킨 **"일반인 (기본)"** 이 이 팩의 **여성 · 캐주얼** 입니다. 나머지 **"여성 · 모험가", "남성 · SWAT"** 같은 20벌은 스킨 패널의 **"스킨 목록" 드롭다운**에 들어 있습니다 (군인과 예전 기본이던 readyplayer.me 아바타는 맨 아래 "기타"). 골라서 "추가" 를 누르면 목록에 들어오고, × 로 빼면 드롭다운으로 돌아갑니다. 처음엔 전부 목록에 깔았는데 패널이 화면을 넘쳐서, 항상 보이는 건 기본 하나뿐이고 나머지는 `skins.js` 의 `CATALOG` 에서 고른 id 만 localStorage(`roomsim.addedSkins`)에 저장하는 방식으로 바꿨습니다. Quaternius 의 Ultimate Modular Women / Men 팩(CC0)입니다. 17단계의 유니버설 팩과 **다른 뼈대**(62개, `Hips / UpperArm.L / Wrist.R …`)를 쓰므로 섞어 쓸 수는 없고, 커스터마이저 맨 위 **"캐릭터 팩"** 셀렉트로 둘 중 하나를 고릅니다. 같은 커스터마이저가 두 팩을 다루게 만든 과정이 이 단계의 내용입니다.

**에셋 준비 (um-prep)**: 원본은 의상마다 3MB 짜리 .gltf (버퍼가 base64 로 안에 박힘) 이고 24개 애니메이션이 **모든 파일에 중복**으로 들어 있습니다. 그대로 쓰면 21벌 × 3MB. 그래서 스크립트로 (1) 메시만 남긴 .glb 와 (2) 뼈대+애니메이션만 남긴 `anim.glb` (성별당 1개) 로 나눴습니다. glTF 의 `accessor` 는 `bufferView` 참조를 지우면 "0 으로 채워진 것"으로 취급되는 규격을 이용해, 안 쓰는 애니메이션 데이터는 버퍼에서 빼고 accessor 목록만 남겼습니다. 21MB 로 줄었습니다.

**부위 찾기와 GLTFLoader 의 이름 규칙**: 의상 파일 하나에 `Casual_Head / Casual_Body / Casual_Legs / Casual_Feet` (+`Backpack` 같은 덤) 노드가 있습니다. 그런데 재질이 여러 개인 부위는 GLTFLoader 가 **그룹 아래 메시 여러 개**(`Cube037`, `Cube037_1` …)로 쪼개 놓습니다. 그래서 메시 이름이 아니라 **"Armature 바로 아래 조상 노드"** 의 이름으로 슬롯을 정합니다 (`partNodes`). 또 GLTFLoader 는 노드 이름의 `.` 을 지웁니다(`sanitizeNodeName`): 파일 속 `Wrist.R` 이 코드에서는 `WristR` 입니다. 처음엔 이걸 몰라 무기가 손에 안 붙었습니다.

**조립**: 첫 의상 파일을 복제해 부위를 전부 떼고 **뼈대만** 남긴 뒤(`loadBase`), 슬롯마다 원하는 의상 파일에서 그 부위 노드만 떼어 와 `bind(this.skeleton, bindMatrix)` 로 묶습니다(`attach`). 17단계와 같은 원리인데, 기본 몸이 없고 모든 슬롯이 부품이라는 점이 다릅니다. 덤(가방·망토)은 상의 의상의 것을 따라갑니다.

**색**: 이 팩은 텍스처 없이 **단색 재질**(`Skin`, `Hair_Brown`, `Green` …) 입니다. 피부·머리는 재질 이름으로 찾아 색을 통째로 바꾸고(원본 선택 시 `userData.orig` 로 되돌림), 옷은 `원본색 × 곱하기 색` 입니다. 곱하기라 흰색이면 그대로, 어둡게는 되지만 밝게는 안 됩니다. 재질을 `clone` 해 두는 이유는 23단계와 같습니다.

**한 커스터마이저, 두 팩**: `qchar.js` 의 `sanitize / schemaFor / randomParams` 가 `params.family` 를 보고 `umchar.js` 로 넘깁니다. 폼은 `schemaFor(P)` 로 **값에 따라 다시 만들어지고**(성별이 바뀌면 의상 목록도 바뀜), 플레이어는 `family` 가 바뀌면 캐릭터 객체를 통째로 새로 만듭니다(`applyCustomParams`). 무기·조준 코드가 쓰는 Mixamo 식 뼈 이름은 `BONE_ALIAS_UM` 표를 하나 더 두어 `getBone` 이 순서대로 찾습니다. 기본 제공 스킨을 👤 로 고쳐 저장하면 원본은 두고 새 스킨으로 들어갑니다.

### 실습

1. 콘솔에서 섞어 입기: `__game.player.setSkin({ format: 'qchar', params: { family: 'um', gender: 'male', head: 'King', body: 'Swat', legs: 'Beach', feet: 'Farmer', hair: 'blonde' } })`
2. `anim.glb` 에는 Idle/Walk/Run 말고도 `Gun_Shoot`, `Punch_Left`, `Sword_Slash`, `Death` 가 있습니다. `__game.player.qClips.all.map(c => c.name)` 로 보고, 12단계 사격 때 `Gun_Shoot` 을 한 번 재생해 보세요.
3. `partNodes` 대신 예전처럼 메시 이름으로 슬롯을 찾게 바꿔 보세요. "머리만 바꾸기"가 왜 안 되는지 보입니다.
4. 옷 색을 곱하기 대신 통째로 바꾸기(`set`)로 해 보세요. 단추·주머니 같은 세부 색이 사라집니다.
5. 여성 뼈대에 남성 의상을 붙여 보세요 (`attach` 에서 성별 경로를 바꿔). 뼈 이름은 같아도 비율이 달라 어떻게 찌그러지는지 확인하세요.
6. 원본 .gltf 와 정리된 .glb 를 `https://gltf.report` 같은 뷰어에 넣어 accessor/bufferView 수를 비교해 보세요.

### 확인

- 유니버설 팩 부품을 이 뼈대에 붙이면 왜 안 될까요? 뼈 이름이 같다면 될까요, 뼈 수가 같다면 될까요?
- `sanitizeNodeName` 이 이름을 바꾸는데 애니메이션은 왜 그대로 재생될까요?
- 21벌이 전부 같은 `anim.glb` 를 쓰는데도 메모리가 늘지 않는 이유는? (`loadGltf` 의 캐시, `clone` 과 공유)

---


## 27단계. 재료·배합법·요리 도감: 데이터 주도 설계와 핫바 (`src/items.js`, `ui.js` 의 `renderInventory` / `renderHotbar`)

### 개념

24단계의 "생고기 → 익힌 고기"가 **재료 12종, 요리 13종, 배합법 13개**로 늘었습니다. 핵심은 이것들이 전부 **코드가 아니라 데이터**(`items.js` 의 `ITEMS`, `RECIPES`, `DROPS`)라는 점입니다. 요리를 하나 더 만들려면 표에 한 줄 추가하면 끝이고, 동물·UI·저장 코드는 건드리지 않습니다.

**아이템 사전과 태그**: `ITEMS` 는 `id → { name, icon, tags, desc }`. `tags: ['meat']` 처럼 묶어 두면 배합법에서 `{ tag: 'meat', n: 1 }` = "아무 고기 1개"로 쓸 수 있습니다. 구운 고기·꼬치구이가 이 방식입니다. `consume()` 은 태그 재료를 **가장 많이 가진 것부터** 씁니다.

**드롭 표**: `DROPS[species]` 는 `{ id, n, p }` 목록. `p` 가 있으면 확률(병아리의 달걀 50%). 23단계의 `meat: 3` 숫자 하나가 표로 바뀌었고, `rollDrops()` 가 굴린 결과를 `animals.js` 가 바닥에 떨어뜨립니다. 아이템 모양(`makeItemMesh`)도 id 로 고릅니다.

**채집물**: 호박(텃밭)·버섯(숲)은 22단계에서 장식으로 놓던 모델에 `{ obj, id, center, respawn, timer }` 를 붙여 `outdoor.pickups` 로 내보냅니다. E 로 따면 `obj.visible = false` 로 숨기고 타이머가 끝나면 다시 보입니다. "없애지 않고 숨기기"가 리스폰을 가장 싸게 만드는 방법입니다.

**인벤토리는 개수표**: `Inventory` 는 `counts = { beef: 2, bone: 1 }` 하나입니다. `list()` 가 사전 순서대로 정렬해 돌려주고, 저장은 `counts` 를 그대로 JSON 으로 (25단계 저장 형식이 바뀌어 **v2**). `missing(inv, recipe)` 가 모자란 재료를 돌려주므로 도감은 "만들 수 있음/없음"과 `1/2` 같은 수량을 같은 함수로 그립니다.

**핫바 (마인크래프트식 한 줄)**: 화면 아래 9칸. 가진 것이 9개를 넘으면 **Shift+휠**(또는 핫바 위에서 휠)로 다음 줄. 그냥 휠은 16단계대로 무기 전환이라, `input.js` 의 휠 핸들러가 `shiftKey` 와 `e.target.closest('#hotbar')` 로 둘을 가릅니다. 페이지 번호는 `hotbarPage` 하나이고 `renderHotbar` 가 `list().slice(page*9, …)` 로 자릅니다.

**인벤토리 창 = 요리 도감**: 창은 **I 키로만** 열립니다 (처음엔 "근처에 상호작용할 게 없으면 E 로도" 열리게 했는데, 문에서 조금 떨어져 E 를 누르면 창이 갑자기 뜨는 것처럼 느껴져서 뺐습니다). 가방 탭은 마인크래프트처럼 **9칸 × 4줄 = 36칸**이고, 아래 한 줄이 화면의 핫바(Shift+휠로 고른 줄), 위 27칸이 나머지 세 줄입니다. 가진 것이 사전 순서대로 칸을 채우고, 칸에 마우스를 올리면 설명이 보입니다. 배합법은 창 안의 **"배합법 (도감)" 버튼**을 눌러야 보입니다. 가스레인지 앞에서 E 를 누르면 같은 창이 **배합법 탭**으로 열리고, 그 순간에만 "요리" 버튼이 켜집니다(`ui.setNearStove`). 요리 버튼 → `consume` → `cooking = { recipe, t }` 타이머(24단계) → 완성품 `inv.add`. 패널이 열려 있는 동안은 E 가 게임에 전달되지 않도록 `pressE` 에 `!ui.anyPanelOpen` 을 걸었습니다.

### 실습

1. 배합법 추가: `RECIPES` 에 `{ id: 'bbq', name: '모둠 바비큐', time: 8, ingredients: [{ tag: 'meat', n: 4 }, { id: 'mushroom', n: 2 }], result: 'bbq' }` 와 `ITEMS.bbq` 를 넣어 보세요. 다른 파일은 안 고쳐도 도감·요리·핫바에 나옵니다.
2. 새 드롭: 사슴에 `{ id: 'antler', n: 1, p: 0.3 }` (사슴뿔, 요리 아님)을 넣고 `makeItemMesh` 에 모양을 추가해 보세요.
3. 핫바 `HOTBAR_SLOTS` 를 5 로 줄이고 Shift+휠 페이지가 어떻게 바뀌는지 보세요.
4. "먹기"를 만들어 보세요: 인벤토리 창의 요리 항목에 버튼을 달아 `inv.remove` 하고 `sate` 만큼 **배고픔 게이지**를 채우기 (24단계 실습 2).
5. 요리 중에 가스레인지에서 멀어지면 취소되고 재료가 돌아오게 해 보세요.
6. 채집물 리스폰을 숨기기 대신 `group.remove` + 다시 `place` 로 바꿔 보고 왜 숨기기가 더 싼지 생각해 보세요 (네트워크 캐시, 지오메트리 공유).

### 확인

- `consume` 이 태그 재료를 "가장 많은 것부터" 쓰는 이유는? 반대로 "가장 적은 것부터" 쓰면 어떤 불편이 생길까요?
- 저장 버전을 올리지 않고 `inv` 형식만 바꾸면 무슨 일이 생기나요? (25단계)
- 도감의 "요리" 버튼을 가스레인지 밖에서도 켜려면 어떤 규칙을 바꿔야 하고, 게임 디자인상 왜 막았을까요?

---


## 28단계. 온라인 배포: GitHub Pages + Actions, 그리고 base 경로 (`vite.config.js`, `src/paths.js`, `.github/workflows/deploy.yml`)

### 개념

이 프로젝트는 서버 코드가 없는 **정적 사이트**입니다 (HTML + JS + 모델 파일). 그래서 파일을 올려 주는 곳이면 어디든 됩니다. GitHub Pages 는 저장소가 이미 GitHub 에 있고 무료라서 골랐습니다. 주소는 `https://<계정>.github.io/<저장소>/` 입니다.

**빌드**: `npm run build` (= `vite build`) 가 `dist/` 에 번들을 만듭니다. three.js 와 우리 코드가 파일 몇 개로 합쳐지고 `public/` 은 그대로 복사됩니다. 개발 서버(`vite`)는 소스를 그때그때 변환해 주지만, 배포는 미리 만들어 둔 `dist/` 를 올리는 것입니다.

**base 경로 문제**: 로컬에서는 사이트가 `/` 에 있지만 Pages 에서는 `/3js/` 아래에 있습니다. 코드에 `'/models/kenney/'` 처럼 **절대 경로**를 적어 두면 배포 후 `https://eunji1217.github.io/models/...` 를 찾다가 404 가 납니다. 해결은 두 줄입니다.

```js
// vite.config.js — 빌드할 때만 '/3js/'
base: command === 'build' ? '/3js/' : '/',
// src/paths.js — 코드에서는 항상 이걸 거친다. Vite 가 base 를 import.meta.env.BASE_URL 로 넣어 준다
export const asset = (path) => import.meta.env.BASE_URL + path.replace(/^\//, '');
```

`index.html` 의 `<script src="/src/main.js">` 는 Vite 가 빌드하며 알아서 고치지만, **JS 안의 문자열 경로**는 Vite 가 모르므로 직접 `asset()` 으로 바꿨습니다 (`createKit` 의 `base`, `SOLDIER_URL`, `qchar.js`/`umchar.js` 의 `BASE`).

**자동 배포 (GitHub Actions)**: `.github/workflows/deploy.yml` 은 "main 에 푸시되면 → Node 설치 → `npm ci` → `npm run build` → `dist/` 를 Pages 에 올리기" 입니다. 저장소 설정의 Pages Source 가 **GitHub Actions** 여야 합니다 (여기서는 `gh api -X POST repos/<계정>/<저장소>/pages -f build_type=workflow` 로 켰습니다). 배포 상태는 저장소의 Actions 탭에서 봅니다. 모델 파일이 55MB 쯤 되는데 Pages 한도(사이트 1GB)에는 여유가 있습니다.

**온라인에서 달라지는 것**: 저장(25단계)은 브라우저 localStorage 라 **사람마다, 기기마다 따로** 입니다. 파일로 넣은 스킨(IndexedDB)도 마찬가지입니다. 여러 사람이 **같은 세계**에서 만나려면 서버(WebSocket)와 상태 동기화가 필요한데, 그건 별도 단계입니다("다음에 추가해 볼 것" 19).

### 실습

1. `npm run build && npx vite preview` 로 로컬에서 배포본을 열어 보세요 (`http://localhost:4173/3js/`). 개발 서버와 어떤 점이 다른가요? (주소, 속도, 콘솔의 경고)
2. `src/paths.js` 의 `asset` 을 쓰지 않고 `'/models/q/'` 로 되돌린 뒤 빌드해서 preview 로 열어 보세요. 커스터마이저가 404 로 깨집니다.
3. 저장소 이름을 바꾸면 `vite.config.js` 의 base 도 바꿔야 합니다. 환경 변수(`process.env.BASE`)로 받게 바꿔 보세요.
4. Actions 탭에서 빌드 로그를 읽어 보세요. `npm ci` 가 `npm install` 과 다른 점은?
5. 배포본은 HTTPS 입니다. 포인터락·IndexedDB·사진 드롭이 `file://` 로 열었을 때와 어떻게 다른지 비교해 보세요.

### 확인

- `import.meta.env.BASE_URL` 은 언제 결정되나요? (빌드 시점 vs 실행 시점)
- `public/` 의 파일과 `src/` 에서 `import` 한 파일은 빌드 결과에서 어떻게 다르게 다뤄지나요? (`src/skins/*.glb` 의 `import.meta.glob` 과 비교)
- 저장을 서버에 두면 무엇이 좋아지고 무엇이 어려워질까요?

---

## 29단계. 쇼케이스 카메라: 뷰 오프셋, 흐림 마스크, 자동 회전, 방 안내 (`cameraRig.js` 의 `updateShowcase`, `main.js` 의 `syncShowcase`)

### 개념

스킨 선택(Tab)이나 커스터마이저를 열면 **캐릭터가 화면 가운데(패널 왼쪽 영역)에 오고, 주변은 흐려지고, 가만히 두면 천천히 한 바퀴 돕니다**. 드래그로 돌리고 휠로 당길 수 있습니다. 세 가지 작은 기법이 합쳐진 것입니다.

**1. 카메라 리그의 두 번째 상태**: `CameraRig` 에 `showcase` 가 있으면 `update` 는 평소 3인칭/1인칭 코드 대신 `updateShowcase` 로 갑니다. 들어갈 때 지금 `yaw/pitch/distance/mode` 를 저장해 두고(`enterShowcase`), 나올 때 되돌립니다(`exitShowcase`). 쇼케이스 전용 각도는 `scYaw/scPitch/scDist` 로 따로 두어 평소 시점을 건드리지 않습니다. 벽에 막히면 당기기·경계 안에 가두기·부드럽게 따라가기는 평소와 같은 코드라서 `orbit` / `follow` 메서드로 뽑아 두 상태가 같이 씁니다. 플레이어에게는 `NO_INPUT` (이동 0, 점프 없음) 을 넘겨 드래그가 이동으로 새지 않게 합니다. 애니메이션(Idle)은 계속 돕니다.

**2. 뷰 오프셋 (`camera.setViewOffset`)**: 오른쪽에 300px 패널이 있으므로 캐릭터를 화면 정중앙에 두면 패널 쪽으로 치우쳐 보입니다. `setViewOffset(w + 패널폭, h, 패널폭, 0, w, h)` 는 "패널 폭만큼 더 넓은 가상 화면 중 왼쪽 w×h 만 그린다"는 뜻이라, 가상 화면의 중심(=lookAt 대상)이 실제 화면의 `(w - 패널폭) / 2` 에 옵니다. 원래 멀티 모니터 렌더링용 API 인데 투영 중심을 옆으로 미는 데 쓸 수 있습니다. 창 크기가 바뀌면 다시 설정해야 해서 매 프레임 값이 달라졌는지 확인합니다. 닫을 때는 `clearViewOffset`.

**3. 흐림은 three.js 가 아니라 CSS**: 캐릭터와 배경은 같은 캔버스에 그려지므로 "배경만" 흐리려면 보통 후처리(DOF)가 필요합니다. 대신 캔버스 위에 `#focus` 라는 투명한 div 를 덮고 `backdrop-filter: blur()` 로 뒤를 흐린 뒤, `mask-image: radial-gradient(...)` 로 캐릭터 자리만 **구멍**을 냅니다 (마스크가 투명한 곳은 div 가 안 그려져 흐림도 없음). 구멍 위치는 CSS 변수 `--fx` 로 2번의 중심과 맞춥니다. GPU 한 번 더 쓰지만 셰이더 없이 끝납니다. `pointer-events: none` 이라 드래그는 캔버스로 갑니다.

**자동 회전**: 마우스 입력이 없는 시간을 `scIdle` 로 재서 1.5초가 지나면 `scYaw += dt * 0.35`. 드래그하면 0 으로 돌아갑니다. 화면을 클릭하면 `stopAutoSpin` 으로 아예 꺼지고, 패널을 다시 열어야 다시 돕니다 (`input.pressed('Mouse0')` 은 캔버스에서 누른 것만 잡으므로 패널 버튼 클릭은 영향 없음). "입력이 없으면 자동" 패턴은 데모 모드·대기 화면에 그대로 씁니다.

**방 안내 토스트**: `roomAt` 으로 매 프레임 방을 알아내고 있었으므로, id 가 바뀌는 순간을 잡아 `ROOM_HINTS` 를 한 번씩 띄웁니다 (`hintedRooms` Set). 문을 여는 것과 상관없이 **공간에 들어가면** 뜹니다. 또 문은 `DOOR_DIST = 2.5` 로 다른 상호작용(1.6)보다 멀리서 열립니다. 3인칭 카메라에서는 문이 가까워 보여도 실제 거리가 멀어, E 가 "근처에 아무것도 없음 → 인벤토리" 로 새던 문제의 해결입니다.

### 실습

1. `SC_AUTO_SPIN` 을 음수로 바꿔 반대로 돌게, `SC_IDLE` 을 0 으로 해 드래그 중에도 돌게 해 보세요.
2. `#focus` 의 `mask-image` 를 지우면 캐릭터까지 흐려집니다. 타원 크기(240px 400px)를 캐릭터 키에 맞춰 조절해 보세요.
3. `setViewOffset` 의 세 번째 인자(x)를 0 으로 바꾸면 캐릭터가 어디로 가는지 보세요. `PANEL_W` 를 음수로 주면?
4. 쇼케이스에서 `target.y` 를 `eyeHeight` 로 바꾸면 얼굴 중심으로 돕니다. 커스터마이저에는 그게 더 맞을 수 있어요 (`focusFace`).
5. `ROOM_HINTS` 에 침실을 넣고, 세션당 한 번이 아니라 "들어갈 때마다" 뜨게 바꿔 보세요 (`hintedRooms` 를 안 쓰면 됩니다).

### 확인

- 쇼케이스 중에도 `player.update` 를 호출하는 이유는? (애니메이션 믹서와 중력)
- `backdrop-filter` 대신 three.js 로 같은 효과를 내려면 무엇이 필요할까요? (RenderTarget → 블러 패스 → 깊이로 섞기)
- `setViewOffset` 후 `camera.aspect` 는 바꾸지 않았는데 화면이 안 찌그러지는 이유는?

---

## 30단계. 낮과 밤: 게임 시계, 해 궤도, 하늘 색 보간 (`src/daynight.js`)

### 개념

게임에 **시간**이 생겼습니다. 하루는 실제 8분(`DAY_LENGTH = 480`)이고, `t` 가 0에서 1로 가는 동안 06:00 → 다음 날 06:00 이 됩니다. 시간은 다른 규칙들의 토대입니다: 배고픔은 시간이 지나야 줄고, 잠은 시간을 아침으로 넘기고, 등불은 밤에만 켜집니다.

**해 높이 하나로 전부 결정**: `elevation = sin(t·2π)` 는 06:00 에 0, 정오에 1, 18:00 에 0, 자정에 -1 입니다. 이 숫자 하나에서 `smoothstep` 으로 **밝기 `light`(0~1)** 를 만들고, 조명 세기·하늘 색·안개 밀도·등불을 전부 `light` 의 함수로 씁니다. 상태를 여러 변수에 흩어 두지 않고 "시각 → 파생값" 으로 계산만 하면 저장할 것도 `t` 와 `day` 둘뿐입니다.

**해의 궤도**: 22단계에서 해(DirectionalLight)는 플레이어를 따라다니는 고정 오프셋이었습니다. 이제 오프셋이 `(cos a · 16, sin a · 18, 6)` 으로 돌아 동쪽(+x)에서 떠 서쪽으로 집니다. 그림자가 아침엔 길게 서쪽으로, 저녁엔 동쪽으로 눕습니다. 해가 지평선 아래면 위에서 내려오는 희미한 "달빛" 으로 바꿔 완전히 캄캄해지지는 않게 했습니다. 해 색은 낮게 뜰수록 붉게(`setRGB(1, 0.72+…, 0.55+…)`).

**하늘은 세 색의 보간**: 밤(짙은 남색) → 노을(주황) → 낮(하늘색) 을 `elevation` 구간별로 `Color.lerp` 합니다. `main.js` 는 이미 실내/실외 하늘을 매 프레임 `lerp` 로 섞고 있었으므로(22단계), 목표 색을 `daynight.skyFor(outdoor)` 에서 받아 오게만 바꿨습니다. 실내는 흰 배경을 `light` 만큼 어둡게 합니다.

**등불**: 광장 가로등 네 개에 `PointLight` 를 두고 `intensity = (1 - light) × 7`. 낮엔 0 이라 비용도 거의 없습니다.

### 실습

1. `DAY_LENGTH` 를 60 으로 바꿔 1분짜리 하루를 보세요. 콘솔 `__game.daynight.t = 0.55` 로 저녁을 바로 볼 수도 있습니다.
2. 해 오프셋의 `6`(z) 을 0 으로 하면 정오에 해가 정확히 머리 위에 와서 그림자가 사라집니다. 왜 조금 기울여 두는지 느껴 보세요.
3. 밤 하늘에 별을 띄워 보세요: `Points` 에 임의의 점 2,000개, `material.opacity = 1 - light`.
4. 달도 궤도에 올려 보세요 (해와 반대편, 색은 푸르게).

### 확인

- `smoothstep(e, -0.12, 0.3)` 에서 왜 0 이 아니라 -0.12 부터 어두워지게 했을까요? (해가 지평선에 걸친 뒤에도 잠시 밝은 "박명")
- 시각을 `Date.now()` 로 재지 않고 `dt` 를 누적하는 이유는? (탭을 숨기면 멈춰야 하고, 잠자기로 건너뛸 수 있어야 한다)

---

## 31단계. 생존: 체력·배고픔·먹기·잠자기·쓰러지기 (`src/vitals.js`, `main.js` 의 `seq`)

### 개념

**상태는 숫자 셋**: `Vitals` 는 `health / hunger / money` 와 규칙 몇 줄입니다. 배고픔은 12분에 100 → 0 으로 줄고, 0 이면 체력이 초당 1.5 씩 닳고, 60 이상이면 체력이 초당 0.8 씩 찹니다. **먹기**는 요리(`sate` 가 있는 아이템)만: 포만감 1당 배고픔 8, 체력 2. 그리기(`ui.setVitals`)는 값이 바뀐 프레임에만 DOM 을 고치는 12단계 습관 그대로입니다.

**입력 세 갈래가 한 함수로**: F 키(가장 포만감 높은 것), 인벤토리 창의 요리 칸 클릭, 핫바 칸 클릭이 모두 `main.js` 의 `eat(id)` 로 모입니다. UI 는 "무엇을 먹을지" 만 알리고(`ui.onEat`), 재고 확인·상태 변경·알림은 한 곳에서 합니다.

**연출은 작은 상태 기계 `seq`**: 잠자기와 쓰러지기는 "화면이 어두워진다 → 다 어두워진 순간 상태를 바꾼다 → 잠깐 머문다 → 밝아진다" 가 같습니다. `seq = { kind, t, done }` 하나로 두 연출을 처리하고, `fadeEl.style.opacity` 를 `t` 로 계산합니다. 19단계 연습 게임의 상태 기계와 같은 발상이고, 진행 중에는 `NO_INPUT` 을 넘겨 플레이어가 못 움직이게 합니다 (29단계 쇼케이스와 같은 수법).

- **잠자기**: 침대 앞 E → 1초 암전 → `daynight.skipToMorning()`, 체력 100, 배고픔 -15 → 밝아짐.
- **쓰러지기**: `vitals.onDeath` → 1.6초 암전 → 다음 날 아침, 침대 옆으로 이동, 체력 100 · 배고픔 60, 쫓던 동물 진정(`animals.calmAll`). 가방은 그대로입니다.

**맞았을 때**: `vitals.damage` → `onDamage` 로 카메라를 살짝 들고(`rig.kick`) 효과음. `hurtT` 가 0.4초 동안 줄며 화면 가장자리가 붉어집니다(`#hurt` 오버레이의 `opacity`). 체력 25 미만이면 `sin` 으로 천천히 깜빡입니다.

### 실습

1. 달리기(`input.running`)를 할 때 배고픔이 1.5배 빨리 줄게 해 보세요 (`vitals.update(dt, running)`).
2. 생고기도 먹을 수 있게 하되 포만감은 1, 체력은 -3 이 되게 (익히지 않은 벌칙).
3. 잠은 밤(`daynight.night`)에만 잘 수 있게 막고, 낮에는 "아직 졸리지 않아요" 토스트.
4. 쓰러지면 가방의 절반을 잃게 바꿔 보세요 (`inv.counts` 를 순회하며 `Math.floor(n/2)`).

### 확인

- `seq` 가 있는 동안 `vitals.update` 를 멈추는 이유는? (암전 중에 굶어 죽어 연출이 두 번 겹치는 것을 막는다)
- 체력 회복 조건을 "배고픔 > 60" 으로 둔 이유를 게임 디자인 관점에서 설명해 보세요 (먹는 행동에 보상을 준다).

---

## 32단계. 동물의 반격: 상태 하나 추가, 영역 둘, 포기 조건 (`src/animals.js` 의 `attack`)

### 개념

23단계의 동물 상태 기계(`idle → walk → flee → dead`)에 **`attack`** 을 하나 더 넣었습니다. 종마다 `dmg` 가 있고, 0 보다 크면 맞았을 때 도망 대신 반격합니다 (소 15, 멧돼지 14, 사슴 10, 돼지 8, 여우 6. 토끼·병아리는 0 이라 도망). 피해는 크기 순입니다.

**attack 상태의 세 가지**: (1) 플레이어 쪽으로 `run`, (2) 1.5m 안이면 멈춰서 1.3초마다 `onAttack` (머리를 숙이는 `eat` 클립을 들이받기로 재활용), (3) **포기 조건** — 14초가 지나거나, 30m 넘게 멀어지거나, 플레이어가 **실내**면 `flee` 로 바꿔 달아납니다. 포기 조건이 없으면 영원히 쫓아와 게임이 되지 않습니다. 실내 여부는 `world.update(dt, pos, playerSafe)` 로 `roomAt` 결과를 넘겨 줍니다.

**영역 둘**: 평소엔 `ANIMAL_ZONE` 안에만 있지만, 쫓을 때는 더 넓은 `AGGRO_ZONE` 을 씁니다. 다만 `minZ = 24` 로 두어 울타리(z 22.5) **바로 바깥**까지만 옵니다. 동물은 충돌 처리를 안 하므로 울타리를 통과해 버릴 텐데, 영역으로 막은 것입니다. 플레이어는 마당 안이나 집으로 도망치면 안전합니다.

**피격 → 반응 분기**: `api.hit` 에서 "살아남았으면 종에 따라 attack 또는 flee" 로 갈라집니다. 동물 객체가 `main.js` 를 모르게 `hooks.onAttack` 콜백만 받습니다 (23단계의 `onKill/onHit` 과 같은 방식).

### 실습

1. 여우를 무리로 만들어 보세요: 한 마리가 맞으면 10m 안의 같은 종도 `attack` 으로.
2. 들이받을 때 플레이어를 밀쳐 보세요 (`player.position` 을 동물 반대 방향으로 0.5m).
3. 체력이 적은 동물(`hp <= 1`)은 반격 대신 도망가게 바꿔 보세요 (겁먹은 동물).
4. 밤에는 `GIVE_UP` 을 두 배로 (30단계 연동).

### 확인

- `flee` 로 전환할 때 `FLEE_DIST` 검사에 `state !== 'attack'` 을 넣은 이유는? (반격 중인 동물이 가까이 왔다는 이유로 다시 도망 상태가 되면 안 된다)
- 동물이 `AGGRO_ZONE` 경계에서 "벽에 붙어 서서" 공격하지 못하는 상황을 어떻게 피했나요? (경계는 울타리 밖이고, 그 안의 플레이어는 1.5m 밖이라 공격이 안 된다 → 결국 포기한다)

---

## 33단계. 광장: 키트로 마을 세우기, 상인 NPC, 상점과 탄약 경제 (`src/town.js`, `ui.js` 의 `renderShop`, `weapons.js` 의 `reserve`)

### 개념

**지금 쓰는 Kenney 키트**: Furniture Kit(집 안), Nature Kit(마당·숲·텃밭), Cube Pets(동물), Crosshair Pack(조준선), 그리고 이 단계의 **Fantasy Town Kit**(건물·돌길·분수·노점·가로등)과 **Food Kit**(노점에 진열한 음식). 모두 CC0 이고 `public/models/<kit>/` 에 쓰는 모델만 복사했습니다 (`LICENSE.txt` 동봉). 두 키트는 glb 안에 텍스처가 없고 `Textures/colormap.png` 를 참조하므로 그 폴더도 같이 둡니다 (Cube Pets 와 같음).

**단위와 배율**: 키트의 벽 한 장은 1×1 (0.1 두께). 캐릭터 1.8m 에 맞춰 `TOWN_SCALE = 2.4` 로 벽 높이 2.4m 입니다. 모든 좌표를 `U = 2.4` 의 배수로 두면 벽·지붕·돌길이 격자에 맞습니다. `place()` 는 바운딩 박스 중심을 (x, z) 에 맞추므로(21단계) 벽 슬래브를 **칸의 모서리 중점**에 놓고 방향만 돌리면 됩니다: z 방향 벽은 `rotY 0`, x 방향 벽은 `rotY π/2`.

**집 한 채 = 2×2 칸, 2층, 피라미드 지붕 하나**: 지붕을 칸마다 올리면 텐트가 줄지어 선 것처럼 보여서, `roof-point` 하나를 `scale: U × 2` 로 키워 집 전체를 덮었습니다. 같은 모델을 다른 배율로 쓰는 것도 키트 활용법입니다. 1층 앞쪽 왼쪽 칸만 `wall-door`, 2층은 창문.

**노점 세 곳과 상인**: 상인은 26단계의 `UMCharacter` 로 조립합니다 (`qc.apply(params)` + `loadClips`). 플레이어와 달리 Idle 만 재생하고 노점 뒤에 세웁니다. 정면 판정(왼팔 x 부호)은 `player.installQChar` 와 같습니다. 상인 데이터는 `VENDORS` 표 하나입니다: 위치, 노점 모델, 의상, `buys(id)` 함수(무엇을 사는지), `sells` 배열(무엇을 파는지), `display`(진열할 Food Kit 모델). 데이터만 추가하면 네 번째 노점이 생깁니다.

**가격 = 규칙**: 재료는 표(`SELL_PRICE`), 요리는 `포만감 × 5 + 5`. 요리할수록 값이 오르므로 사냥 → 요리 → 판매가 순환합니다. 사는 값은 파는 값의 약 2배.

**상점 창**: 왼쪽 "팔기" 는 `inv.list().filter(v.buys)`, 오른쪽 "사기" 는 `v.sells`. UI 는 `onSell(id, n)` / `onBuy(entry)` 만 올리고, 돈·재고·탄약 변경은 `main.js` 가 하고 `renderShop()` 을 다시 부릅니다 (27단계 도감과 같은 "UI 는 데이터를 그리기만" 원칙).

**탄약은 이제 유한**: `weapons.reserve` 가 생겼고 재장전은 "모자란 만큼만 예비에서" 가져옵니다 (`take = min(mag - ammo, reserve)`). HUD 의 `∞` 가 예비 탄약 수로 바뀌고, 다 떨어지면 "광장 잡화점에서 구매" 안내. 예비 탄약도 저장됩니다 (저장 형식 v3: v2 저장도 읽고 빈 칸은 기본값).

**길**: 마당 동쪽 울타리에 빈 칸(`GATE_E`)을 내고(충돌 상자를 둘로 쪼갬) 돌길을 광장까지 이었습니다. 숲·바위·풀은 `keepOut` 에 `TOWN` 을 넣어 광장을 비워 둡니다. `roomAt` 이 `TOWN` 을 알아보므로 들어가면 안내 토스트가 뜹니다.

### 실습

1. 네 번째 노점: `VENDORS` 에 `{ id: 'tailor', … buys: 가죽, sells: [{ outfit: 'King' }] }` 를 넣어 보세요 (18번 과제).
2. 집을 3×2 칸으로 키워 보세요. 피라미드 지붕이 안 맞을 테니 `roof-gable` 로 박공지붕을 만들어 보세요 (ridge 방향을 찾는 것이 과제).
3. 상인이 플레이어를 바라보게: `npc.group.rotation.y` 를 매 프레임 `atan2` 로 (14단계 뼈 대신 그룹 회전).
4. 밤에는 상점이 닫히게 (`daynight.night` 면 프롬프트에 "영업 끝").
5. Food Kit 로 인벤토리 이모지를 3D 아이콘으로 바꿔 보세요: 작은 RenderTarget 에 모델을 한 번 그려 `<img>` 로 (13단계 RenderTarget 응용).

### 확인

- `place()` 가 바운딩 박스 중심을 맞추는데, 벽을 "칸의 모서리" 에 놓으려면 좌표를 어떻게 계산했나요?
- 상인 NPC 를 `Player` 클래스로 만들지 않고 `UMCharacter` 를 직접 쓴 이유는? (이동·카메라·무기 부착이 필요 없다)
- 예비 탄약을 `weapons` 안에 둔 것과 `vitals`(돈) 안에 둔 것의 경계를 설명해 보세요.

---

## 34단계. 지도: 2D 캔버스 미니맵과 전체 지도 (`src/map.js`)

### 개념

"다음에 추가해 볼 것" 13번의 미니맵은 두 번째 카메라로 장면을 **다시 그리는** 방법이었습니다. 여기서는 더 싸고 읽기 쉬운 방법을 골랐습니다: 마인크래프트 지도처럼 **아는 좌표로 2D 캔버스에 그리기**. 방·울타리·길·광장·나무는 전부 코드가 놓은 것이라 좌표를 이미 알고 있고, 동물·재료·상인은 매 프레임 위치만 읽으면 됩니다. 3D 를 또 렌더링하지 않으니 비용이 거의 없습니다.

**정적 층과 동적 층**: 시작할 때 800×800 오프스크린 캔버스에 지형을 한 번 그려 둡니다(`drawStatic`, 1m = 4px). 매 프레임은 그 그림을 `drawImage` 로 복사하고 점만 찍습니다(`drawMarkers`). "안 바뀌는 건 한 번만" 은 12단계 HUD 와 같은 원칙입니다. 나무·바위 위치는 `outdoor.decor` 에 모아 두었고, 광장 윤곽은 `TOWN_LAYOUT` 으로 3D 배치와 같은 숫자를 씁니다.

**좌표 변환 하나로 전부**: `toMap(x, z) = ((maxX - x)·S, (maxZ - z)·S)`. 위쪽이 +z(이 프로젝트의 "북쪽", 동물 들판), 오른쪽이 -x 입니다. 왜 -x 냐면 플레이어가 +z 를 볼 때 카메라 오른쪽 벡터가 `(cos yaw, 0, -sin yaw)` = -x 이기 때문입니다 (7단계). 지도 방향이 화면과 어긋나면 쓸 수 없으니 이 한 줄이 핵심입니다.

**미니맵은 회전, 전체 지도는 고정**: 미니맵은 `translate → rotate → scale → translate(-플레이어)` 순서로 캔버스 변환을 쌓아 **보는 방향이 위**가 되게 합니다. 카메라 정면 `(-sin yaw, -cos yaw)` 는 지도 좌표로 `(sin yaw, cos yaw)` 이고, 이 벡터가 위(-y)를 가리키도록 `-π/2 - atan2(cos yaw, sin yaw)` 만큼 돌립니다. `clip()` 으로 원형. 전체 지도(M)는 북쪽 고정이고 플레이어 화살표가 `heading` 으로 돕니다. 변환 행렬을 쌓는 순서는 4단계 부모-자식 좌표계와 같은 이야기입니다.

### 실습

1. 미니맵을 북쪽 고정으로, 화살표만 돌게 바꿔 보세요 (`rotate` 한 줄을 빼고 화살표에 `camYaw` 를 넣기).
2. 전체 지도에서 클릭한 곳의 월드 좌표를 콘솔에 찍어 보세요 (`toMap` 의 역함수).
3. 미니맵 반지름 `MINI_RANGE` 를 휠로 바꾸는 줌을 넣어 보세요.
4. 13번 과제처럼 두 번째 `OrthographicCamera` + `setScissor` 로 "진짜" 미니맵을 만들어 둘을 비교해 보세요. 어느 쪽이 읽기 쉬운가요?

### 확인

- 정적 캔버스를 매 프레임 `drawImage` 하는 비용과, 3D 장면을 다시 그리는 비용을 비교해 보세요.
- 미니맵 회전 각도 식에서 `atan2(cos yaw, sin yaw)` 의 인자 순서가 바뀌면 어떻게 될까요?

---

## 다음에 추가해 볼 것 (난이도 순)

기본 단계를 마쳤으면 기능을 하나씩 추가하면서 배우는 게 가장 빠릅니다.

1. **창문**: 벽에 구멍을 내고 `MeshStandardMaterial({ transparent: true, opacity: 0.3 })` 유리 끼우기 (2단계 응용)
2. **조명 스위치**: E 키로 방의 PointLight `intensity` 를 0/5 로 토글 (3단계 + 5단계 응용)
3. **텍스처 파일**: `TextureLoader` 로 나무 이미지를 읽어 바닥 `map` 에 입히기 (10단계의 CanvasTexture 를 파일로 바꾼 것)
4. **클릭으로 물체 선택**: 마우스 좌표를 `Raycaster.setFromCamera` 로 쏴서 맞은 가구 색 바꾸기 (11단계 응용, 포인터락 해제 상태에서)
5. **회전하는 선풍기**: 매 프레임 `rotation.y += dt * 10` (1단계 + 4단계)
6. **콤보 보너스**: 연습 게임에서 연속 명중 시 점수 배율 증가, 빗나가면 초기화 (19단계)
7. **탄약 상자 줍기**: 사대 위 탄약 상자에 E 로 상호작용하면 모든 무기 탄약 보충 (5단계 + 12단계)
8. **계단과 2층**: 충돌 상자에 높이 개념을 추가해 올라갈 수 있게 (6단계 확장)
9. **점프 애니메이션**: Mixamo 에서 Jump 클립을 받아 공중에서 재생 (8단계 응용)
10. **문 자동 열림**: 문 근처에 오면 자동으로 열리고 멀어지면 닫히기 (4단계 + 5단계)
11. **머리가 조준점을 따라가기**: `poseArms` 에 Head 뼈 추가 (14단계)
11-1. **찌르기 모션에 카메라 전진**: 찌르는 순간 `camera` 를 앞으로 10cm 밀었다 되돌려 돌진감 주기 (18단계 + 13단계 반동)
12. **3D 사운드**: `AudioListener` + `PositionalAudio` 로 표적 명중음이 거리에 따라 작아지게 (15단계)
13. **3D 미니맵**: 34단계의 2D 지도 대신 두 번째 카메라(`OrthographicCamera`)를 위에서 내려다보게 두고 화면 구석에 렌더링 (`renderer.setViewport`, `setScissor`). 13단계 RenderTarget 과 비교해 보세요
14. **탄도 낙차**: 광선 대신 작은 구체를 중력 받으며 날려 멀리 쏠수록 아래에 맞게 (11단계를 물체 방식으로 바꾸기)
15. **물리 엔진 도입**: cannon-es 또는 rapier 로 직접 만든 충돌을 교체
16. **밤에는 동물이 잠들게**: 30단계의 `daynight.night` 를 보고 동물 상태 기계에 `sleep` 을 추가 (23단계 + 30단계)
17. **울타리 밖 지형 높낮이**: 땅을 `PlaneGeometry` 분할 + 정점 y 노이즈로 언덕 만들기, 플레이어 y 를 땅 높이에 맞추기 (22단계 확장)
18. **가죽·털 아이템과 옷 가게**: 드롭 표에 가죽을 더하고, 광장에 네 번째 노점을 세워 가죽으로 의상 부위를 사게 (23단계 + 33단계 + 26단계)
19. **멀티플레이**: 작은 WebSocket 서버(예: Node + ws, 또는 Colyseus/PartyKit)로 위치·방향·애니메이션 상태를 초당 10~20번 주고받아 다른 플레이어를 같은 방에 그리기. 정적 Pages 만으로는 안 되고 서버를 어딘가에 띄워야 한다 (28단계 다음)

---

## 참고 자료

- three.js 공식 매뉴얼 (Fundamentals 장이 1~3단계와 거의 같음): https://threejs.org/manual/
- three.js API 문서: https://threejs.org/docs/
- three.js 예제 모음 (코드 포함): https://threejs.org/examples/
- Discover three.js (무료 온라인 책): https://discoverthreejs.com/
- Mixamo (무료 캐릭터, 애니메이션): https://www.mixamo.com/
- Kenney (CC0 3D 키트: Furniture / Nature / Cube Pets 등): https://kenney.nl/assets
- Quaternius (CC0 모듈형 캐릭터): https://quaternius.com/
