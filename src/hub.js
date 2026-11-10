// 로비 입장 계약 (docs/game-entry-contract.md, v3) — 38단계
// 로비는 게임 URL 에 hub_return(복귀 URL), hub_name(이름), hub_room(방 코드)를 붙여 연다.
// 게임은 hub_return 을 읽어 두었다가 나갈 때 그 값으로 그대로 이동한다. 이름·방은 힌트일 뿐이라 서버가 다시 검사한다.
// 이 파일은 로비 코드를 import 하지 않는다 (계약 MUST 4). 쿼리 셋을 읽는 것이 전부다.
const KEY = 'roomsim.hubReturn'; // 게임 안에서 새로 고침해도 복귀 URL 을 잃지 않게 sessionStorage 에 둔다 (계약이 권하는 방법)

function readHub() {
  const q = new URLSearchParams(location.search);
  let back = q.get('hub_return');
  if (back && !/^https?:\/\//i.test(back)) back = null; // javascript: 같은 값은 무시 (계약 MAY 마지막 항목)
  try {
    if (back) sessionStorage.setItem(KEY, back);
    else back = sessionStorage.getItem(KEY);
  } catch {}
  const name = (q.get('hub_name') || '').trim().slice(0, 16) || null; // 표시용 힌트. 화면에는 textContent/value 로만 넣는다
  const room = (q.get('hub_room') || '').trim() || null;                 // 서버 방 이름 힌트. 형식은 서버가 다시 검사한다
  return { back, name, room };
}

export const HUB = readHub();

// 「로비로」: 복귀 URL 을 해석하거나 고치지 않고 그대로 이동한다 (계약 MUST 2·3)
export function goLobby() {
  if (!HUB.back) return false;
  location.assign(HUB.back);
  return true;
}
