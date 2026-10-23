// 진행 상황 저장 (25단계): 위치·시점·무기·탄약·점수·인벤토리·문 상태를 localStorage 에 스냅샷으로 남긴다.
// 2초마다 + 탭을 닫거나 숨길 때 저장하고, 시작할 때 불러온다. 스킨(IndexedDB)과 사격장 최고 점수(range.best)는 각자 따로 저장한다.

const KEY = 'roomsim.save.v1';
const INTERVAL = 2; // 초

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.v === 1 ? s : null; // 형식이 바뀌면 v 를 올리고 옛 저장은 버린다
  } catch {
    return null;
  }
}

export function clearSave() {
  localStorage.removeItem(KEY);
}

/**
 * @param {() => object} snapshot 현재 상태를 평범한 객체로 만드는 함수 (JSON 으로 저장되므로 Vector3 같은 건 숫자로 풀어서)
 */
export function createAutoSave(snapshot) {
  let t = 0, stopped = false;
  const write = () => {
    if (stopped) return; // 초기화 중: 새로고침 직전에 다시 저장되지 않게
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, savedAt: Date.now(), ...snapshot() }));
    } catch (err) {
      console.warn('저장 실패:', err); // 용량 초과·프라이빗 모드 등. 게임은 계속 돈다
    }
  };
  // 탭을 닫거나 다른 탭으로 갈 때는 바로 저장 (2초 간격 사이의 변화를 잃지 않게)
  window.addEventListener('beforeunload', write);
  document.addEventListener('visibilitychange', () => { if (document.hidden) write(); });
  return {
    update(dt) {
      t += dt;
      if (t >= INTERVAL) { t = 0; write(); }
    },
    write,
    stop() { stopped = true; },
  };
}
