// 체력·배고픔·돈 (31단계). 숫자 세 개와 규칙 몇 줄이 전부인 "상태" 모듈. 그리기는 ui.setVitals, 사건 처리는 main.js
export const MAX = 100;
const HUNGER_RATE = MAX / 720; // 배부른 상태에서 빈속까지 12분
const STARVE = 1.5;            // 배고픔 0 일 때 초당 잃는 체력
const REGEN = 0.8;             // 배고픔 60 이상일 때 초당 회복하는 체력
const HURT_FLASH = 0.4;        // 맞은 뒤 화면이 붉어지는 시간(초)

export class Vitals {
  constructor() {
    this.health = MAX;
    this.hunger = MAX;
    this.money = 0;
    this.dead = false;
    this.hurtT = 0;
    this.onDeath = null;   // 체력 0 → main 이 "침대에서 깨어나기" 연출
    this.onDamage = null;  // (amount, source) 맞을 때 (카메라 흔들림·효과음)
  }

  update(dt) {
    if (this.dead) return;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.hunger = Math.max(0, this.hunger - dt * HUNGER_RATE);
    if (this.hunger <= 0) this.health -= dt * STARVE;                    // 굶으면 체력이 줄고
    else if (this.hunger > 60 && this.health < MAX) this.health = Math.min(MAX, this.health + dt * REGEN); // 배부르면 천천히 회복
    if (this.health <= 0) this.die();
  }

  damage(amount, source = null) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.hurtT = HURT_FLASH;
    this.onDamage?.(amount, source);
    if (this.health <= 0) this.die();
  }

  die() {
    this.health = 0;
    this.dead = true;
    this.onDeath?.();
  }

  /** 요리 먹기: 포만감(sate) 1당 배고픔 8, 체력 2 */
  eat(item) {
    const sate = item.sate || 0;
    this.hunger = Math.min(MAX, this.hunger + sate * 8);
    this.health = Math.min(MAX, this.health + sate * 2);
  }

  revive({ health = MAX, hunger = 60 } = {}) {
    this.dead = false;
    this.health = health;
    this.hunger = hunger;
    this.hurtT = 0;
  }

  snapshot() { return { health: this.health, hunger: this.hunger, money: this.money }; }
  load(s) {
    if (!s) return;
    for (const k of ['health', 'hunger', 'money']) if (typeof s[k] === 'number') this[k] = Math.max(0, s[k]);
    if (this.health <= 0) this.revive(); // 죽은 채로 저장됐으면 깨워서 시작
  }
}
