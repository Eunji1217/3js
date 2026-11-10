// 멀티플레이 서버 (35·37·38단계): 방(room) 여러 개, 위치 동기화 + 채팅 + PvP 기록 + 방마다 공유 시계 + 잠자기 투표.
// 접속한 사람의 최신 상태를 모아 두었다가 초당 10번 같은 방 전부에게 뿌린다.
// PvP 는 "쏜 사람이 판정, 서버가 검증·기록" 방식: 맞았다는 보고를 받으면 무기별 피해와 연사 간격만 검사해 맞은 사람에게 전달한다.
// 방 이름은 hello 의 room 으로 받는다 (로비의 hub_room 이 그대로 온다). 형식이 이상하면 기본 방 'main'.
// 실행: cd server && npm install && npm start   (기본 포트 8787, Render 는 PORT 환경변수를 준다)
import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8787;
const TICK_MS = 100;          // 상태 브로드캐스트 간격 (10Hz)
const MAX_PLAYERS = 128;      // 서버 전체
const MAX_ROOM = 32;          // 방 하나
const DEFAULT_ROOM = 'main';
const ROOM_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/; // 방 이름: 영문 소문자·숫자·-·_ 1~24자 (로비의 6자 코드도 통과)
const ANIMS = new Set(['idle', 'walk', 'run']);
const DAY_LENGTH = 480;       // 게임 하루 (초). 클라이언트 daynight.js 와 같아야 한다
const TIME_MS = 2000;         // 시계 동기화 간격
const SLEEP_RATIO = 0.5;      // 방 접속자의 이만큼이 자면 아침 (마인크래프트의 sleep percentage)
// PvP 피해 (체력 100 기준). 산탄총은 맞은 탄알 수(n, 최대 8)만큼 곱한다
const PVP_DMG = { pistol: 20, rifle: 14, shotgun: 9, sniper: 70, knife: 15, stab: 30, punch: 5 };
// 같은 무기로 다시 맞힐 수 있는 최소 간격 (ms). 클라이언트의 연사 속도보다 조금 느슨하게
const HIT_COOL = { pistol: 150, rifle: 70, shotgun: 600, sniper: 1200, knife: 400, stab: 700, punch: 300 };
const SHOT_MIN_MS = 50;       // 사격 효과 중계 최소 간격

const players = new Map(); // id → { id, ws, room, name, skin, state, alive, lastChat, ready, sleeping, lastHit, lastShot }
const rooms = new Map();   // name → { name, players: Map, dayT, day }
let nextId = 1;
let lastTick = Date.now();

function getRoom(name) {
  let r = rooms.get(name);
  if (!r) { r = { name, players: new Map(), dayT: 0, day: 1 }; rooms.set(name, r); }
  return r;
}
function roomName(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return ROOM_RE.test(s) ? s : DEFAULT_ROOM;
}

// Render 의 상태 확인용 HTTP 응답 (브라우저로 열면 방별 접속자 수가 보인다)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  const lines = [...rooms.values()].filter((r) => r.players.size).map((r) => `  방 ${r.name}: ${r.players.size}명 · ${r.day}일차`);
  res.end(`room-sim server · ${players.size}명 접속 중 · 방 ${lines.length}개\n${lines.join('\n')}`);
});
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, n).trim();
const pub = (p) => ({ id: p.id, name: p.name, skin: p.skin, state: p.state });
const send = (ws, msg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
// 같은 방에만 뿌린다
function broadcast(room, msg, except = null) {
  const s = JSON.stringify(msg);
  for (const p of room.players.values()) if (p.ws !== except && p.ws.readyState === p.ws.OPEN) p.ws.send(s);
}
const readyIn = (room) => [...room.players.values()].filter((p) => p.ready);
const nameTaken = (room, me, name) => readyIn(room).some((p) => p !== me && p.name.toLowerCase() === name.toLowerCase());
const vec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
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

// 잠자기 투표 (방 단위): 접속자의 SLEEP_RATIO 이상이 자면 그 방 모두 아침. 자는 사람 수가 바뀔 때마다 알린다
function checkSleep(room) {
  const ready = readyIn(room);
  if (!ready.length) return;
  const n = ready.filter((p) => p.sleeping).length;
  const need = Math.max(1, Math.ceil(ready.length * SLEEP_RATIO));
  broadcast(room, { t: 'sleepers', n, need });
  if (n > 0 && n >= need) {
    room.dayT = 0; room.day += 1;
    for (const p of ready) p.sleeping = false;
    broadcast(room, { t: 'morning', day: room.day, tm: 0 });
  }
}

wss.on('connection', (ws) => {
  if (players.size >= MAX_PLAYERS) { send(ws, { t: 'full' }); ws.close(); return; }
  const id = nextId++;
  const me = { id, ws, room: null, name: `손님${id}`, skin: null, state: null, alive: true, lastChat: 0, ready: false, sleeping: false, lastHit: {}, lastShot: 0 }; // ready: hello 를 받은 뒤부터 남들에게 보인다
  players.set(id, me);
  ws.on('pong', () => { me.alive = true; });
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const room = me.room;
    switch (m.t) {
      case 'hello': {
        if (me.ready) break;
        const r = getRoom(roomName(m.room));
        if (r.players.size >= MAX_ROOM) { send(ws, { t: 'full' }); ws.close(); break; }
        const name = clean(m.name, 16) || me.name;
        // 닉네임 중복 거절 (같은 방 안에서): 알려 주고 끊는다. 클라이언트는 시작 화면으로 돌아간다
        if (nameTaken(r, me, name)) {
          send(ws, { t: 'nameTaken', name });
          ws.close(4001, 'name taken');
          break;
        }
        me.room = r;
        r.players.set(id, me);
        me.name = name;
        me.skin = sanitizeSkin(m.skin);
        me.ready = true;
        send(ws, { t: 'welcome', id, name: me.name, room: r.name, tm: r.dayT, day: r.day, players: readyIn(r).filter((p) => p !== me).map(pub) });
        broadcast(r, { t: 'join', ...pub(me) }, ws);
        checkSleep(r); // 사람이 늘면 필요한 수도 늘어난다
        break;
      }
      case 'state':
        if (vec3(m.p)) {
          me.state = { p: m.p.map((v) => Math.round(v * 100) / 100), h: Number.isFinite(m.h) ? m.h : 0, a: ANIMS.has(m.a) ? m.a : 'idle', w: typeof m.w === 'string' ? m.w.slice(0, 12) : null, hp: Number.isFinite(m.hp) ? Math.max(0, Math.min(100, Math.round(m.hp))) : 100 };
        }
        break;
      case 'chat': {
        if (!room) break;
        const now = Date.now();
        if (now - me.lastChat < 400) return; // 도배 방지
        const text = clean(m.text, 200);
        if (!text) return;
        me.lastChat = now;
        broadcast(room, { t: 'chat', id, name: me.name, text, ts: now });
        break;
      }
      case 'rename': {
        // 게임 중 이름 바꾸기: 중복이면 본인에게만 실패를, 아니면 방 모두에게(본인 포함) 새 이름을 알린다
        if (!room) break;
        const name = clean(m.name, 16);
        if (!name || name === me.name) break;
        if (nameTaken(room, me, name)) { send(ws, { t: 'renameFail', name }); break; }
        const old = me.name;
        me.name = name;
        broadcast(room, { t: 'rename', id, name, old });
        break;
      }
      case 'skin':
        if (!room) break;
        me.skin = sanitizeSkin(m.skin);
        broadcast(room, { t: 'skin', id, skin: me.skin }, ws);
        break;
      // --- PvP (37단계) ---
      case 'hit': {
        // 쏜 사람의 보고: 무기 종류·연사 간격만 검사하고 맞은 사람에게 전달한다 (맞은 사람의 체력은 그 사람 화면이 깎는다)
        if (!room) break;
        const target = room.players.get(m.target);
        const weapon = typeof m.weapon === 'string' ? m.weapon : '';
        if (!target || !target.ready || target === me || !(weapon in PVP_DMG)) break;
        const now = Date.now();
        if (now - (me.lastHit[weapon] || 0) < HIT_COOL[weapon]) break;
        me.lastHit[weapon] = now;
        const n = weapon === 'shotgun' ? Math.max(1, Math.min(8, m.n | 0)) : 1;
        send(target.ws, { t: 'hit', from: id, name: me.name, weapon, dmg: PVP_DMG[weapon] * n });
        break;
      }
      case 'shot': {
        // 사격 효과 중계 (총구 위치, 방향, 무기): 같은 방 남들 화면에 궤적·불꽃·소리
        if (!room || !vec3(m.o) || !vec3(m.d)) break;
        const now = Date.now();
        if (now - me.lastShot < SHOT_MIN_MS) break;
        me.lastShot = now;
        broadcast(room, { t: 'shot', id, o: m.o.map((v) => Math.round(v * 100) / 100), d: m.d.map((v) => Math.round(v * 1000) / 1000), w: typeof m.w === 'string' ? m.w.slice(0, 12) : null }, ws);
        break;
      }
      case 'died': {
        // 쓰러진 사람의 보고 → 킬 로그
        if (!room) break;
        const killer = room.players.get(m.by);
        me.sleeping = false;
        broadcast(room, { t: 'kill', victim: id, vname: me.name, killer: killer ? killer.id : null, kname: killer ? killer.name : null });
        checkSleep(room);
        break;
      }
      // --- 잠자기 투표 ---
      case 'sleep':
        if (!room) break;
        me.sleeping = !!m.on;
        checkSleep(room);
        break;
    }
  });
  ws.on('close', () => {
    players.delete(id);
    const room = me.room;
    if (room) {
      room.players.delete(id);
      if (me.ready) { broadcast(room, { t: 'leave', id }); checkSleep(room); }
      if (!room.players.size && room.name !== DEFAULT_ROOM) rooms.delete(room.name); // 빈 방은 지운다 (시계도 초기화)
    }
  });
  ws.on('error', () => {});
});

// 10Hz 로 방마다 모두의 최신 상태를 한 메시지에 담아 보낸다
setInterval(() => {
  for (const room of rooms.values()) {
    const list = [];
    for (const p of room.players.values()) if (p.ready && p.state) list.push([p.id, p.state.p, p.state.h, p.state.a, p.state.w, p.state.hp]);
    if (list.length) broadcast(room, { t: 'states', list });
  }
}, TICK_MS);
// 공유 시계: 방마다 하루를 돌리고 2초마다 알린다 (클라이언트는 그 사이를 스스로 진행)
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  for (const room of rooms.values()) {
    room.dayT += dt;
    if (room.dayT >= DAY_LENGTH) { room.dayT -= DAY_LENGTH; room.day += 1; }
    if (room.players.size) broadcast(room, { t: 'time', tm: Math.round(room.dayT * 10) / 10, day: room.day });
  }
}, TIME_MS);
// 끊긴 연결 정리 (30초마다 ping)
setInterval(() => {
  for (const p of players.values()) {
    if (!p.alive) { p.ws.terminate(); continue; }
    p.alive = false;
    p.ws.ping();
  }
}, 30000);

server.listen(PORT, () => console.log(`room-sim server listening on ${PORT}`));
