// 사진(jpg/png)에서 주요 색을 뽑아 캐릭터 색 값으로 바꾼다. three.js 와 무관한 Canvas 2D 코드.
// 흐름: 이미지 → 작은 캔버스에 축소 → 픽셀 읽기(getImageData) → 미디언 컷으로 색 6개 → 역할(상의·하의…)에 배정

const SAMPLE = 48;   // 축소 크기 (48×48 = 2,304 픽셀이면 충분하다)
const COLORS = 6;    // 뽑을 색 개수
const THUMB = 96;    // 스킨에 함께 저장할 썸네일 크기

function loadImage(fileOrUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);
    img.onload = () => { if (url !== fileOrUrl) URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { if (url !== fileOrUrl) URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했어요 (jpg/png 만 돼요)')); };
    img.src = url;
  });
}

// 이미지를 size 안에 비율 유지로 그린 캔버스
function drawScaled(img, size) {
  const s = Math.min(1, size / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * s));
  c.height = Math.max(1, Math.round(img.height * s));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// --- 미디언 컷: 색이 가장 넓게 퍼진 상자를 그 채널의 중앙값에서 반으로 쪼개기를 반복해 n 개 상자를 만든다 ---
// "픽셀이 많은 상자"가 아니라 "색 범위가 넓은 상자"를 쪼개야 한 가지 색의 큰 영역이 둘로 갈라지지 않는다
function medianCut(pixels, n) {
  const boxes = [pixels];
  while (boxes.length < n) {
    let bi = -1, bch = 0, bspan = -1;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let k = 0; k < 3; k++) {
        let lo = 255, hi = 0;
        for (const p of box) { if (p[k] < lo) lo = p[k]; if (p[k] > hi) hi = p[k]; }
        if (hi - lo > bspan) { bspan = hi - lo; bi = i; bch = k; }
      }
    });
    if (bi < 0 || bspan < 12) break; // 더 쪼갤 만큼 색 차이가 없으면 그만
    const box = boxes.splice(bi, 1)[0];
    box.sort((a, b) => a[bch] - b[bch]);
    const mid = box.length >> 1;
    boxes.push(box.slice(0, mid), box.slice(mid));
  }
  return boxes.map(average);
}
function average(box) {
  const sum = [0, 0, 0];
  for (const p of box) { sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; }
  return sum.map((v) => Math.round(v / box.length));
}

// --- k-평균 다듬기: 미디언 컷의 평균색을 시작점으로 "픽셀을 가장 가까운 색에 배정 → 평균 다시 계산"을 몇 번 돌려 경계를 또렷하게 한다 ---
function refine(pixels, centers, iters = 4) {
  for (let it = 0; it < iters; it++) {
    const groups = centers.map(() => []);
    for (const p of pixels) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < centers.length; i++) {
        const c = centers[i];
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bd) { bd = d; bi = i; }
      }
      groups[bi].push(p);
    }
    centers = groups.map((g, i) => (g.length ? average(g) : centers[i]));
    if (it === iters - 1) return groups.map((g, i) => ({ rgb: centers[i], count: g.length })).filter((c) => c.count > 0);
  }
  return [];
}

// 비슷한 색(거리 < 28)은 하나로 합쳐 견본이 중복되지 않게 한다. 많이 쓰인 순서로 돌려준다
function dedupe(entries) {
  const out = [];
  for (const e of [...entries].sort((a, b) => b.count - a.count)) {
    const near = out.find((o) => Math.hypot(o.rgb[0] - e.rgb[0], o.rgb[1] - e.rgb[1], o.rgb[2] - e.rgb[2]) < 28);
    if (near) {
      const t = near.count + e.count;
      near.rgb = near.rgb.map((v, k) => Math.round((v * near.count + e.rgb[k] * e.count) / t));
      near.count = t;
    } else out.push({ rgb: [...e.rgb], count: e.count });
  }
  return out.map((e) => ({ ...e, hex: toHex(e.rgb), ...hsl(e.rgb) }));
}

const toHex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}
const dist = (a, b) => Math.hypot(a.rgb[0] - b.rgb[0], a.rgb[1] - b.rgb[1], a.rgb[2] - b.rgb[2]);

/**
 * 이미지에서 색을 뽑는다.
 * @returns {Promise<{ colors: {hex:string,count:number,s:number,l:number}[], thumb: string }>} colors 는 많이 쓰인 순서, thumb 은 저장용 작은 JPEG dataURL
 */
export async function extractPalette(fileOrUrl) {
  const img = await loadImage(fileOrUrl);
  const c = drawScaled(img, SAMPLE);
  const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // 투명 픽셀(png 배경)은 뺀다
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (!pixels.length) throw new Error('이미지가 전부 투명해요');
  const colors = dedupe(refine(pixels, medianCut(pixels, COLORS)));
  const thumb = drawScaled(img, THUMB).toDataURL('image/jpeg', 0.8);
  return { colors, thumb };
}

/**
 * 뽑은 색을 캐릭터 색 값에 배정한다. 규칙:
 *  - 상의: 가장 많이 쓰인 "옷 같은" 색 (너무 밝거나 어둡지 않은 것 우선)
 *  - 하의: 상의와 가장 다른 색
 *  - 소매: 상의와 비슷한 계열이 있으면 그것, 없으면 상의와 같게
 *  - 신발·머리: 가장 어두운 색 (머리는 너무 검으면 살짝 띄운다)
 * 텍스처에 색을 곱하는 방식이라 아주 어두운 색은 옷 무늬가 안 보이게 되므로 밝기 하한을 둔다
 */
export function paletteToParams(colors) {
  if (!colors?.length) return {};
  const lift = (c, minL) => {
    if (c.l >= minL) return c.hex;
    const k = minL / Math.max(c.l, 0.02); // 밝기를 minL 까지 끌어올림
    return toHex(c.rgb.map((v) => Math.min(255, Math.round(v * k))));
  };
  const wearable = colors.filter((c) => c.l > 0.12 && c.l < 0.92);
  const pool = wearable.length ? wearable : colors;
  // 옷 색 점수: 많이 쓰일수록, 채도가 있을수록 좋다
  const scored = [...pool].sort((a, b) => (b.count * (0.4 + b.s)) - (a.count * (0.4 + a.s)));
  const top = scored[0];
  const rest = scored.slice(1);
  const legs = rest.length ? rest.reduce((best, c) => (dist(c, top) > dist(best, top) ? c : best), rest[0]) : top;
  const arms = rest.find((c) => c !== legs && dist(c, top) < 90) || top;
  const darkest = [...colors].sort((a, b) => a.l - b.l)[0];
  return {
    topColor: lift(top, 0.18),
    legsColor: lift(legs, 0.18),
    armsColor: lift(arms, 0.18),
    feetColor: lift(darkest, 0.1),
    hairColor: lift(darkest, 0.08),
  };
}
