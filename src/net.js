// 멀티플레이 클라이언트 (35·37단계): 웹소켓 하나로 내 상태를 10Hz 로 보내고, 남들의 상태·입장·퇴장·채팅·사격·피격·시계를 받는다.
// 그리기는 remote.js, 화면은 ui.js, 연결은 여기. 끊기면 1→2→4…15초 간격으로 다시 붙는다.
const SEND_INTERVAL = 0.1; // 초 (10Hz)

export class Net {
  constructor() {
    this.ws = null;
    this.id = null;
    this.name = null;
    this.room = null;   // 서버가 넣어 준 방 이름 (38단계)
    this.url = null;
    this.hello = null;
    this.status = 'offline'; // offline | connecting | online
    this.players = new Map(); // id → { id, name, skin }
    this.wantOpen = false;
    this.retry = 0;
    this.sendT = 0;
    this.lastSent = '';
    // 콜백
    this.onStatus = null; // (status, detail)
    this.onJoin = null;   // ({ id, name, skin, state })
    this.onLeave = null;  // (id)
    this.onState = null;  // (id, { p, h, a, w, hp })
    this.onChat = null;   // ({ id, name, text, ts })
    this.onSkin = null;   // (id, skin)
    this.onNameTaken = null; // (name) 서버가 중복 닉네임이라 거절
    this.onRename = null;     // (id, name, old) 다른 사람이 이름을 바꿈
    this.onRenamed = null;    // (name) 내 이름 바꾸기 성공
    this.onRenameFail = null; // (name) 내 이름 바꾸기 실패 (중복)
    // 37단계: PvP · 공유 시계 · 잠자기
    this.onHit = null;      // ({ from, name, weapon, dmg }) 내가 맞음
    this.onShot = null;     // (id, o, d, w) 남이 쏨 (효과용)
    this.onKill = null;     // ({ victim, vname, killer, kname })
    this.onTime = null;     // (tm, day) 서버 시계
    this.onSleepers = null; // (n, need)
    this.onMorning = null;  // (day)
  }

  get online() { return this.status === 'online'; }
  get count() { return this.players.size + (this.online ? 1 : 0); }

  connect(url, hello) {
    this.disconnect();
    this.url = url;
    this.hello = hello;
    this.wantOpen = true;
    this.retry = 0;
    this.open();
  }

  disconnect() {
    this.wantOpen = false;
    clearTimeout(this._timer);
    if (this.ws) { const ws = this.ws; this.ws = null; try { ws.close(); } catch {} }
    this.clearPlayers();
    this.id = null;
    this.room = null;
    this.setStatus('offline');
  }

  setStatus(s, detail = '') {
    this.status = s;
    this.onStatus?.(s, detail);
  }

  clearPlayers() {
    for (const id of [...this.players.keys()]) { this.players.delete(id); this.onLeave?.(id); }
  }

  open() {
    if (!this.wantOpen) return;
    let ws;
    try { ws = new WebSocket(this.url); } catch (err) { this.setStatus('offline', '주소가 잘못됐어요: ' + err.message); this.wantOpen = false; return; }
    this.ws = ws;
    this.setStatus('connecting');
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify({ t: 'hello', ...this.hello }));
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.handle(m); };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.ws !== ws) return; // disconnect() 로 이미 교체됨
      this.ws = null;
      this.id = null;
      this.clearPlayers();
      if (!this.wantOpen) { this.setStatus('offline'); return; }
      const wait = Math.min(15000, 1000 * 2 ** this.retry++);
      this.setStatus('connecting', `연결이 끊겼어요. ${Math.round(wait / 1000)}초 뒤 다시 시도`);
      this._timer = setTimeout(() => this.open(), wait);
    };
  }

  handle(m) {
    switch (m.t) {
      case 'welcome':
        this.id = m.id;
        this.name = m.name;
        this.room = m.room || null;
        for (const p of m.players || []) { this.players.set(p.id, { id: p.id, name: p.name, skin: p.skin }); this.onJoin?.(p); }
        if (Number.isFinite(m.tm)) this.onTime?.(m.tm, m.day);
        this.setStatus('online');
        break;
      case 'join':
        this.players.set(m.id, { id: m.id, name: m.name, skin: m.skin });
        this.onJoin?.(m);
        break;
      case 'leave':
        if (this.players.delete(m.id)) this.onLeave?.(m.id);
        break;
      case 'states':
        for (const [id, p, h, a, w, hp] of m.list || []) if (id !== this.id && this.players.has(id)) this.onState?.(id, { p, h, a, w, hp });
        break;
      case 'chat':
        this.onChat?.(m);
        break;
      case 'skin': {
        const p = this.players.get(m.id);
        if (p) { p.skin = m.skin; this.onSkin?.(m.id, m.skin); }
        break;
      }
      case 'rename': {
        if (m.id === this.id) { this.name = m.name; if (this.hello) this.hello.name = m.name; this.onRenamed?.(m.name); break; }
        const p = this.players.get(m.id);
        if (p) { p.name = m.name; this.onRename?.(m.id, m.name, m.old); }
        break;
      }
      case 'renameFail':
        this.onRenameFail?.(m.name);
        break;
      case 'nameTaken':
        this.wantOpen = false; // 서버가 끊어도 재접속하지 않는다
        this.setStatus('offline', '이미 쓰는 이름이에요');
        this.onNameTaken?.(m.name);
        break;
      // 37단계
      case 'hit':
        this.onHit?.(m);
        break;
      case 'shot':
        if (m.id !== this.id) this.onShot?.(m.id, m.o, m.d, m.w);
        break;
      case 'kill':
        this.onKill?.(m);
        break;
      case 'time':
        this.onTime?.(m.tm, m.day);
        break;
      case 'sleepers':
        this.onSleepers?.(m.n, m.need);
        break;
      case 'morning':
        this.onMorning?.(m.day);
        break;
      case 'full':
        this.wantOpen = false;
        this.setStatus('offline', '방이 가득 찼어요');
        break;
    }
  }

  /** 매 프레임 호출. 10Hz 로, 바뀌었을 때만 보낸다 */
  update(dt, state) {
    if (!this.online || !this.ws) return;
    this.sendT += dt;
    if (this.sendT < SEND_INTERVAL) return;
    this.sendT = 0;
    const msg = JSON.stringify({ t: 'state', ...state });
    if (msg === this.lastSent) return;
    this.lastSent = msg;
    this.ws.send(msg);
  }

  send(msg) {
    if (this.online && this.ws) this.ws.send(JSON.stringify(msg));
  }

  rename(name) { this.send({ t: 'rename', name }); }
  sendChat(text) { this.send({ t: 'chat', text }); }
  // 37단계
  sendHit(target, weapon, n = 1) { this.send({ t: 'hit', target, weapon, n }); }
  sendShot(o, d, w) { this.send({ t: 'shot', o, d, w }); }
  sendDied(by) { this.send({ t: 'died', by }); }
  sendSleep(on) { this.send({ t: 'sleep', on }); }

  sendSkin(skin) {
    if (this.hello) this.hello.skin = skin; // 재접속 때도 새 스킨으로
    this.send({ t: 'skin', skin });
  }
}
