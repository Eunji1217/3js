// WebAudio 로 합성한 효과음 (파일 없이 동작). 첫 사용자 클릭 이후에 재생된다.
let ctx = null;
let noiseBuf = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noise(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// 총소리: 노이즈 버스트(로우패스 내려감) + 낮은 '쿵'
const SHOTS = {
  pistol: { dur: 0.12, f: 1800, g: 0.5 },
  rifle: { dur: 0.1, f: 1400, g: 0.45 },
  shotgun: { dur: 0.28, f: 900, g: 0.75 },
  sniper: { dur: 0.4, f: 700, g: 0.85 },
};
export function playShot(kind) {
  const c = ac();
  if (!c) return;
  const P = SHOTS[kind] || SHOTS.pistol;
  const t = c.currentTime;

  const src = c.createBufferSource();
  src.buffer = noise(c);
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(P.f * 3, t);
  filt.frequency.exponentialRampToValueAtTime(P.f * 0.2, t + P.dur);
  const gain = c.createGain();
  gain.gain.setValueAtTime(P.g, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + P.dur);
  src.connect(filt).connect(gain).connect(c.destination);
  src.start(t);
  src.stop(t + P.dur + 0.05);

  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + P.dur);
  const g2 = c.createGain();
  g2.gain.setValueAtTime(P.g * 0.8, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + P.dur);
  osc.connect(g2).connect(c.destination);
  osc.start(t);
  osc.stop(t + P.dur + 0.05);
}

// 칼 휘두르는 소리: 밴드패스 노이즈 스윕
export function playSwing() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const filt = c.createBiquadFilter();
  filt.type = 'bandpass';
  filt.Q.value = 1.5;
  filt.frequency.setValueAtTime(400, t);
  filt.frequency.exponentialRampToValueAtTime(2500, t + 0.15);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.3, t + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  src.connect(filt).connect(gain).connect(c.destination);
  src.start(t);
  src.stop(t + 0.25);
}

// 주먹: 낮은 '퍽'
export function playPunch() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(50, t + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.6, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.16);
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 500;
  const g2 = c.createGain();
  g2.gain.setValueAtTime(0.35, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  src.connect(filt).connect(g2).connect(c.destination);
  src.start(t);
  src.stop(t + 0.1);
}

// 표적 명중: 금속 '팅'
export function playDing() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  for (const [f, g] of [[2200, 0.25], [3300, 0.12]]) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const gain = c.createGain();
    gain.gain.setValueAtTime(g, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }
}

// 짧은 '딸깍' (빈 탄창 / 재장전)
export function playClick(when = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + when;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const filt = c.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = 2000;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  src.connect(filt).connect(gain).connect(c.destination);
  src.start(t);
  src.stop(t + 0.05);
}

export function playReload(duration) {
  playClick(0.1);
  playClick(Math.max(0.3, duration - 0.3));
}
