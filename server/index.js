// 멀티플레이 1단계 서버 (35단계): 방 하나, 위치 동기화 + 채팅.
// 접속한 사람의 최신 상태를 모아 두었다가 초당 10번 전부에게 뿌린다. 판정(사격·동물)은 아직 각자 로컬.
// 실행: cd server && npm install && npm start   (기본 포트 8787, Render 는 PORT 환경변수를 준다)
import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8787;
const TICK_MS = 100;          // 상태 브로드캐스트 간격 (10Hz)
const MAX_PLAYERS = 32;
const ANIMS = new Set(['idle', 'walk', 'run']);

const players = new Map(); // id → { id, ws, name, skin, state, alive, lastChat }
let nextId = 1;

// Render 의 상태 확인용 HTTP 응답 (브라우저로 열면 접속자 수가 보인다)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(`room-sim server · ${players.size}명 접속 중`);
});
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, n).trim();
const pub = (p) => ({ id: p.id, name: p.name, skin: p.skin, state: p.state });
const send = (ws, msg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
function broadcast(msg, except = null) {
  const s = JSON.stringify(msg);
  for (const p of players.values()) if (p.ws !== except && p.ws.readyState === p.ws.OPEN) p.ws.send(s);
}
// 스킨은 조립형(qchar) 파라미터만 받는다 (파일·링크 스킨은 남의 컴퓨터에서 열 수 없으므로 기본 스킨으로 보인다)
function sanitizeSkin(s) {
  if (!s || typeof s !== 'object' || s.format !== 'qchar' || !s.params || typeof s.params !== 'object') return null;
  const params = {};
  for (const [k, v] of Object.entries(s.params)) {
    if (k.length > 24) continue;
    if ((typeof v === 'string' && v.length <= 32) || (typeof v === 'number' && Number.isFinite(v))) params[k] = v;
  }
  return { format: 'qchar', params };
}

wss.on('connection', (ws) => {
  if (players.size >= MAX_PLAYERS) { send(ws, { t: 'full' }); ws.close(); return; }
  const id = nextId++;
  const me = { id, ws, name: `손님${id}`, skin: null, state: null, alive: true, lastChat: 0, ready: false }; // ready: hello 를 받은 뒤부터 남들에게 보인다
  players.set(id, me);
  ws.on('pong', () => { me.alive = true; });
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello':
        me.name = clean(m.name, 16) || me.name;
        me.skin = sanitizeSkin(m.skin);
        me.ready = true;
        send(ws, { t: 'welcome', id, name: me.name, players: [...players.values()].filter((p) => p !== me && p.ready).map(pub) });
        broadcast({ t: 'join', ...pub(me) }, ws);
        break;
      case 'state':
        if (Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite)) {
          me.state = { p: m.p.map((v) => Math.round(v * 100) / 100), h: Number.isFinite(m.h) ? m.h : 0, a: ANIMS.has(m.a) ? m.a : 'idle', w: typeof m.w === 'string' ? m.w.slice(0, 12) : null };
        }
        break;
      case 'chat': {
        const now = Date.now();
        if (now - me.lastChat < 400) return; // 도배 방지
        const text = clean(m.text, 200);
        if (!text) return;
        me.lastChat = now;
        broadcast({ t: 'chat', id, name: me.name, text, ts: now });
        break;
      }
      case 'skin':
        me.skin = sanitizeSkin(m.skin);
        broadcast({ t: 'skin', id, skin: me.skin }, ws);
        break;
    }
  });
  ws.on('close', () => { players.delete(id); if (me.ready) broadcast({ t: 'leave', id }); });
  ws.on('error', () => {});
});

// 10Hz 로 모두의 최신 상태를 한 메시지에 담아 보낸다
setInterval(() => {
  const list = [];
  for (const p of players.values()) if (p.ready && p.state) list.push([p.id, p.state.p, p.state.h, p.state.a, p.state.w]);
  if (list.length) broadcast({ t: 'states', list });
}, TICK_MS);
// 끊긴 연결 정리 (30초마다 ping)
setInterval(() => {
  for (const p of players.values()) {
    if (!p.alive) { p.ws.terminate(); continue; }
    p.alive = false;
    p.ws.ping();
  }
}, 30000);

server.listen(PORT, () => console.log(`room-sim server listening on ${PORT}`));
