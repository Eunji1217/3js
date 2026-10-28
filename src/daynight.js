import * as THREE from 'three';

// 낮과 밤 (30단계). 게임 하루 = DAY_LENGTH 초. t 는 0~1 로 하루 진행도 (0 = 06:00 해 뜸, 0.5 = 18:00 해 짐).
// 해(DirectionalLight)를 동쪽에서 띄워 서쪽으로 내리고, 하늘·안개 색과 조명 세기를 해 높이에 맞춘다.
export const DAY_LENGTH = 480; // 8분

const DAY = new THREE.Color(0xa9d4f5);
const DUSK = new THREE.Color(0xf0a070);
const NIGHT = new THREE.Color(0x0d1326);
const INDOOR = new THREE.Color(0xffffff);

export class DayNight {
  /**
   * @param {{sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight, lamps?: THREE.Light[]}} lights
   *   lamps: 밤에만 켜지는 바깥 등불 (광장 가로등)
   */
  constructor({ sun, hemi, lamps = [] }) {
    this.sun = sun;
    this.hemi = hemi;
    this.lamps = lamps;
    this.sunBase = sun.intensity;
    this.hemiBase = hemi.intensity;
    this.t = 0;
    this.day = 1;
    this.light = 1;      // 0 (밤) ~ 1 (낮)
    this.sky = new THREE.Color();
    this.offset = new THREE.Vector3();
  }

  get hour() { return (6 + this.t * 24) % 24; }
  get night() { const h = this.hour; return h >= 20 || h < 5; }
  // 해 높이: 06:00 에 0 (지평선), 12:00 에 1 (머리 위), 18:00 에 0, 00:00 에 -1
  get elevation() { return Math.sin(this.t * Math.PI * 2); }

  timeText() {
    const h = this.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    const icon = this.night ? '🌙' : this.elevation > 0.45 ? '☀️' : '🌅';
    return `${icon} ${this.day}일차 ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  // 잠자기: 다음 날 06:00 으로
  skipToMorning() { this.t = 0; this.day += 1; }

  snapshot() { return { t: this.t, day: this.day }; }
  load(s) {
    if (!s) return;
    if (typeof s.t === 'number') this.t = THREE.MathUtils.clamp(s.t, 0, 0.9999);
    if (typeof s.day === 'number') this.day = Math.max(1, s.day | 0);
  }

  update(dt, playerPos) {
    this.t += dt / DAY_LENGTH;
    if (this.t >= 1) { this.t -= 1; this.day += 1; }
    const e = this.elevation;
    const light = THREE.MathUtils.smoothstep(e, -0.12, 0.3); // 해가 지평선 아래로 조금 내려가면 어두워진다
    this.light = light;
    // 해는 동쪽(+x)에서 떠서 머리 위를 지나 서쪽(-x)으로 진다. 밤에는 달빛처럼 위에서 희미하게
    const a = this.t * Math.PI * 2;
    if (e > -0.05) this.offset.set(Math.cos(a) * 16, Math.max(2, Math.sin(a) * 18), 6);
    else this.offset.set(0, 16, 6);
    this.sun.position.copy(playerPos).add(this.offset); // 그림자 카메라가 플레이어를 따라간다 (22단계)
    this.sun.target.position.copy(playerPos);
    this.sun.intensity = 0.3 + this.sunBase * light; // 밤에도 달빛처럼 조금은 보이게
    this.sun.color.setRGB(1, 0.72 + 0.28 * light, 0.55 + 0.45 * light); // 낮게 뜰수록 붉게
    this.hemi.intensity = 0.35 + this.hemiBase * light;
    for (const l of this.lamps) l.intensity = (1 - light) * 7; // 어두울수록 등불이 켜진다
  }

  /** 지금 시각에 맞는 하늘(배경)색과 안개 밀도. 실내는 흰 배경을 어둡게만 한다 */
  skyFor(outdoor) {
    if (!outdoor) {
      this.sky.copy(INDOOR).multiplyScalar(0.35 + 0.65 * this.light);
      return { color: this.sky, fog: 0.04 };
    }
    const e = this.elevation;
    this.sky.copy(NIGHT).lerp(DUSK, THREE.MathUtils.smoothstep(e, -0.2, 0.05)).lerp(DAY, THREE.MathUtils.smoothstep(e, 0.05, 0.4));
    return { color: this.sky, fog: 0.009 + 0.006 * (1 - this.light) };
  }
}
