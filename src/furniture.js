import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Kenney 의 CC0 키트(Furniture Kit, Nature Kit, Cube Pets)를 불러와 월드에 놓는 공용 도우미.
// 파일은 public/models/<kit>/ 에 있다. 키트마다 단위가 달라 scale 을 따로 준다.

export const KENNEY_SCALE = 2.2; // Furniture Kit: 의자 높이 0.61, 더블 침대 폭 0.96 → 2.2 배면 캐릭터(약 1.8m)와 맞는다
export const NATURE_SCALE = 2.5; // Nature Kit: 울타리 한 칸이 1 단위(→ 2.5m), 나무 1.7 단위(→ 4.3m)

const loader = new GLTFLoader();
const cache = new Map(); // 같은 파일을 여러 번 쓰면 한 번만 내려받고 clone 한다

/** glTF 를 불러온다 (캐시). 애니메이션이 있는 모델은 gltf.animations 를 같이 쓴다 */
export function loadGltf(url) {
  if (!cache.has(url)) {
    cache.set(url, loader.loadAsync(url).then((gltf) => {
      // Nature Kit 은 모든 재질이 metallicFactor=1 로 내보내져 있다. 금속은 주변 반사(환경맵)가 없으면 검게 보이므로 비금속으로 되돌린다
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m.metalness !== undefined) { m.metalness = 0; m.roughness = Math.max(m.roughness, 0.8); }
        }
      });
      return gltf;
    }));
  }
  return cache.get(url);
}

/**
 * 키트 하나에 묶인 배치 도우미를 만든다.
 * @param {object} ctx
 * @param {string} ctx.base 모델 폴더 (예: '/models/kenney/')
 * @param {number} ctx.scale 기본 배율
 * @param {THREE.Object3D} ctx.group 모델을 넣을 그룹
 * @param {THREE.Box3[]} [ctx.colliders] 플레이어가 부딪히는 상자 목록 (place 가 여기에 추가)
 * @param {THREE.Object3D[]} [ctx.shootables] 총알이 맞는 메시 목록 (place 가 여기에 추가)
 */
export function createKit({ base, scale: kitScale, group, colliders = [], shootables = [] }) {
  const load = (name) => loadGltf(base + name + '.glb');

  /**
   * 모델을 불러와 바닥 중심이 (x, y, z) 가 되게 놓는다.
   * 키트 모델은 원점이 제각각(모서리이거나 중심이거나)이라, 일단 넣고 바운딩 박스를 잰 뒤 옮긴다.
   * @param {object} [o]
   * @param {number} [o.rotY] y 축 회전
   * @param {number} [o.scale] 배율 (기본은 키트 배율)
   * @param {number} [o.y] 바닥 높이 (위에 올릴 땐 아래 물체의 box.max.y)
   * @param {boolean} [o.collide] 충돌 상자 등록
   * @param {[number, number]} [o.footprint] 충돌 상자를 모델 전체 대신 이 크기(가로, 세로)로 잡는다 (나무는 줄기만 막게)
   * @param {boolean} [o.shoot] 피격 목록 등록 (풀처럼 많은 장식은 끄면 레이캐스트가 가벼워진다)
   * @param {boolean} [o.shadow] 그림자 드리우기
   * @returns {Promise<{obj: THREE.Object3D, box: THREE.Box3, clips: THREE.AnimationClip[]}>} box 는 월드 좌표의 바운딩 박스
   */
  async function place(name, x, z, { rotY = 0, scale = kitScale, y = 0, collide = true, footprint = null, shoot = true, shadow = true } = {}) {
    const gltf = await load(name);
    const obj = gltf.scene.clone(true); // 지오메트리·재질은 공유, 노드 트리만 복제
    obj.scale.setScalar(scale);
    obj.rotation.y = rotY;
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = shadow;
      o.receiveShadow = true;
      if (shoot) shootables.push(o); // Raycaster 는 recursive=false 로 쓰므로 그룹이 아니라 메시를 넣는다
    });
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    obj.position.set(x - c.x, y - box.min.y, z - c.z);
    group.add(obj);
    obj.updateMatrixWorld(true);
    box.setFromObject(obj);
    if (collide) {
      if (footprint) {
        const [w, d] = footprint;
        colliders.push(new THREE.Box3(new THREE.Vector3(x - w / 2, box.min.y, z - d / 2), new THREE.Vector3(x + w / 2, box.max.y, z + d / 2)));
      } else {
        colliders.push(box.clone());
      }
    }
    return { obj, box, clips: gltf.animations };
  }

  /**
   * 같은 모델을 아주 많이 놓을 때 (풀, 꽃): 메시마다 InstancedMesh 하나로 묶어 드로우 콜을 1개로 줄인다.
   * 모델 안의 메시(줄기, 꽃잎 …)마다 InstancedMesh 를 만들고, 인스턴스 행렬 = 배치 행렬 × 메시의 로컬 행렬.
   * @param {{x:number, z:number, rotY?:number, scale?:number}[]} spots
   */
  async function scatter(name, spots, { scale = kitScale, y = 0, shadow = false } = {}) {
    const gltf = await load(name);
    const src = gltf.scene;
    src.updateMatrixWorld(true);
    // 모델 바닥이 y 에 오도록 기준 상자를 한 번 잰다
    const box = new THREE.Box3().setFromObject(src);
    const m = new THREE.Matrix4(), place = new THREE.Matrix4();
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    const made = [];
    src.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, spots.length);
      inst.castShadow = shadow;
      inst.receiveShadow = true;
      spots.forEach((s, i) => {
        const k = s.scale ?? scale;
        pos.set(s.x, y - box.min.y * k, s.z);
        quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.rotY ?? 0);
        scl.setScalar(k);
        place.compose(pos, quat, scl);
        m.multiplyMatrices(place, mesh.matrixWorld); // 배치 × 모델 안에서의 위치
        inst.setMatrixAt(i, m);
      });
      inst.instanceMatrix.needsUpdate = true;
      group.add(inst);
      made.push(inst);
    });
    return made;
  }

  return { place, scatter, load };
}
