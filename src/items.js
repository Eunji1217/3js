// 식재료·요리·배합법 (27단계). 데이터만 있는 모듈: 동물(animals.js)이 떨어뜨리는 것, 밖에서 따는 것, 가스레인지에서 만드는 것.

// 아이템 사전. tag 로 묶으면 레시피에서 "아무 고기 1개"처럼 쓸 수 있다
export const ITEMS = {
  // 사냥 재료
  beef:     { name: '소고기',     icon: '🥩', tags: ['meat'], desc: '소에서 2개. 스테이크·꼬치의 재료' },
  pork:     { name: '돼지고기',   icon: '🥓', tags: ['meat'], desc: '돼지에서 2개. 삼겹살 구이' },
  boar:     { name: '멧돼지고기', icon: '🍖', tags: ['meat'], desc: '멧돼지에서 2개. 스튜에 어울린다' },
  venison:  { name: '사슴고기',   icon: '🦌', tags: ['meat'], desc: '사슴에서 2개. 담백해서 스튜·꼬치' },
  rabbit:   { name: '토끼고기',   icon: '🐇', tags: ['meat'], desc: '토끼에서 1개. 조림' },
  foxmeat:  { name: '여우고기',   icon: '🦊', tags: ['meat'], desc: '여우에서 1개. 구이' },
  chicken:  { name: '닭고기',     icon: '🍗', tags: ['meat'], desc: '병아리에서 1개. 수프' },
  egg:      { name: '달걀',       icon: '🥚', tags: [], desc: '병아리가 가끔 떨어뜨린다. 프라이·오믈렛' },
  bone:     { name: '뼈',         icon: '🦴', tags: [], desc: '소·멧돼지·사슴에서. 사골 국물' },
  fat:      { name: '비계',       icon: '🧈', tags: [], desc: '돼지·멧돼지에서. 스테이크에 풍미를' },
  // 채집 재료 (마당 뒤 텃밭 호박, 숲의 버섯)
  pumpkin:  { name: '호박',       icon: '🎃', tags: [], desc: '주방 뒤 텃밭. 90초 뒤 다시 자란다' },
  mushroom: { name: '버섯',       icon: '🍄', tags: [], desc: '울타리 밖 숲 바닥. 2분 뒤 다시 자란다' },
  // 요리
  roast:        { name: '구운 고기',   icon: '🍖', tags: ['dish'], sate: 2, desc: '아무 고기나 구운 것' },
  skewer:       { name: '꼬치구이',   icon: '🍢', tags: ['dish'], sate: 4, desc: '고기와 버섯을 꿰어 구웠다' },
  steak:        { name: '스테이크',   icon: '🥩', tags: ['dish'], sate: 5, desc: '소고기를 비계로 구운 것' },
  porkbelly:    { name: '삼겹살 구이', icon: '🥓', tags: ['dish'], sate: 4, desc: '돼지고기 두 덩이' },
  boarstew:     { name: '멧돼지 스튜', icon: '🍲', tags: ['dish'], sate: 6, desc: '멧돼지고기·호박·버섯' },
  venisonstew:  { name: '사슴 스튜',   icon: '🍲', tags: ['dish'], sate: 5, desc: '사슴고기와 버섯' },
  rabbitbraise: { name: '토끼 조림',   icon: '🥘', tags: ['dish'], sate: 4, desc: '토끼고기와 호박' },
  chickensoup:  { name: '닭고기 수프', icon: '🍜', tags: ['dish'], sate: 6, desc: '닭고기·달걀·뼈' },
  bonebroth:    { name: '사골 국물',   icon: '🍵', tags: ['dish'], sate: 3, desc: '뼈 두 개를 오래 끓인 것' },
  pumpkinsoup:  { name: '호박죽',     icon: '🥣', tags: ['dish'], sate: 3, desc: '호박 두 개' },
  mushroomfry:  { name: '버섯 볶음',   icon: '🍄', tags: ['dish'], sate: 3, desc: '버섯 세 개' },
  friedegg:     { name: '달걀 프라이', icon: '🍳', tags: ['dish'], sate: 2, desc: '달걀 하나' },
  omelet:       { name: '호박 오믈렛', icon: '🍳', tags: ['dish'], sate: 5, desc: '달걀 두 개와 호박' },
};
export const TAGS = { meat: { name: '아무 고기', icon: '🥩' }, dish: { name: '요리', icon: '🍽️' } };

// 배합법. ingredients 의 각 항목은 { id, n } 또는 { tag, n }. time 은 초
export const RECIPES = [
  { id: 'roast',        name: '구운 고기',   time: 2.5, ingredients: [{ tag: 'meat', n: 1 }], result: 'roast' },
  { id: 'friedegg',     name: '달걀 프라이', time: 2,   ingredients: [{ id: 'egg', n: 1 }], result: 'friedegg' },
  { id: 'skewer',       name: '꼬치구이',   time: 3,   ingredients: [{ tag: 'meat', n: 2 }, { id: 'mushroom', n: 1 }], result: 'skewer' },
  { id: 'steak',        name: '스테이크',   time: 4,   ingredients: [{ id: 'beef', n: 1 }, { id: 'fat', n: 1 }], result: 'steak' },
  { id: 'porkbelly',    name: '삼겹살 구이', time: 3.5, ingredients: [{ id: 'pork', n: 2 }], result: 'porkbelly' },
  { id: 'mushroomfry',  name: '버섯 볶음',   time: 2.5, ingredients: [{ id: 'mushroom', n: 3 }], result: 'mushroomfry' },
  { id: 'pumpkinsoup',  name: '호박죽',     time: 4,   ingredients: [{ id: 'pumpkin', n: 2 }], result: 'pumpkinsoup' },
  { id: 'omelet',       name: '호박 오믈렛', time: 3.5, ingredients: [{ id: 'egg', n: 2 }, { id: 'pumpkin', n: 1 }], result: 'omelet' },
  { id: 'bonebroth',    name: '사골 국물',   time: 6,   ingredients: [{ id: 'bone', n: 2 }], result: 'bonebroth' },
  { id: 'rabbitbraise', name: '토끼 조림',   time: 4,   ingredients: [{ id: 'rabbit', n: 1 }, { id: 'pumpkin', n: 1 }], result: 'rabbitbraise' },
  { id: 'venisonstew',  name: '사슴 스튜',   time: 5,   ingredients: [{ id: 'venison', n: 1 }, { id: 'mushroom', n: 2 }], result: 'venisonstew' },
  { id: 'boarstew',     name: '멧돼지 스튜', time: 6,   ingredients: [{ id: 'boar', n: 1 }, { id: 'pumpkin', n: 1 }, { id: 'mushroom', n: 1 }], result: 'boarstew' },
  { id: 'chickensoup',  name: '닭고기 수프', time: 5,   ingredients: [{ id: 'chicken', n: 1 }, { id: 'egg', n: 1 }, { id: 'bone', n: 1 }], result: 'chickensoup' },
];

// 동물별 드롭. p 는 확률 (없으면 항상)
export const DROPS = {
  cow:   [{ id: 'beef', n: 2 }, { id: 'bone', n: 1 }],
  pig:   [{ id: 'pork', n: 2 }, { id: 'fat', n: 1 }],
  hog:   [{ id: 'boar', n: 2 }, { id: 'fat', n: 1, p: 0.6 }, { id: 'bone', n: 1, p: 0.5 }],
  deer:  [{ id: 'venison', n: 2 }, { id: 'bone', n: 1, p: 0.6 }],
  bunny: [{ id: 'rabbit', n: 1 }],
  fox:   [{ id: 'foxmeat', n: 1 }],
  chick: [{ id: 'chicken', n: 1 }, { id: 'egg', n: 1, p: 0.5 }],
};

const ORDER = Object.keys(ITEMS);
export const hasTag = (id, tag) => (ITEMS[id]?.tags || []).includes(tag);

/** 개수만 들고 있는 단순 인벤토리. 저장은 counts 객체를 그대로 JSON 으로 */
export class Inventory {
  constructor() { this.counts = {}; }
  count(id) { return this.counts[id] || 0; }
  add(id, n = 1) { if (!ITEMS[id]) return; this.counts[id] = this.count(id) + n; }
  remove(id, n = 1) {
    if (this.count(id) < n) return false;
    this.counts[id] -= n;
    if (this.counts[id] <= 0) delete this.counts[id];
    return true;
  }
  tagCount(tag) { return Object.entries(this.counts).reduce((s, [id, n]) => s + (hasTag(id, tag) ? n : 0), 0); }
  /** 가진 것 목록 (사전 순서대로). 핫바·인벤토리 창이 쓴다 */
  list() { return ORDER.filter((id) => this.count(id) > 0).map((id) => ({ id, n: this.count(id), ...ITEMS[id] })); }
  total() { return Object.values(this.counts).reduce((a, b) => a + b, 0); }
  load(obj) { this.counts = {}; for (const [id, n] of Object.entries(obj || {})) if (ITEMS[id] && n > 0) this.counts[id] = n | 0; }
}

/** 레시피 재료 중 모자란 것. 비어 있으면 만들 수 있다 */
export function missing(inv, recipe) {
  return recipe.ingredients
    .map((s) => ({ ...s, have: s.tag ? inv.tagCount(s.tag) : inv.count(s.id) }))
    .filter((s) => s.have < s.n);
}
export const canCook = (inv, recipe) => missing(inv, recipe).length === 0;

/** 재료를 빼고 true. tag 재료는 가장 많이 가진 것부터 쓴다 */
export function consume(inv, recipe) {
  if (!canCook(inv, recipe)) return false;
  for (const s of recipe.ingredients) {
    if (s.id) { inv.remove(s.id, s.n); continue; }
    let left = s.n;
    const pool = Object.keys(inv.counts).filter((id) => hasTag(id, s.tag)).sort((a, b) => inv.count(b) - inv.count(a));
    for (const id of pool) { const take = Math.min(left, inv.count(id)); inv.remove(id, take); left -= take; if (!left) break; }
  }
  return true;
}

/** 드롭 표를 굴려 실제로 떨어뜨릴 목록을 만든다 */
export function rollDrops(speciesId) {
  const out = [];
  for (const d of DROPS[speciesId] || []) if (d.p === undefined || Math.random() < d.p) for (let k = 0; k < d.n; k++) out.push(d.id);
  return out;
}
