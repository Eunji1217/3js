// HUD, 상호작용 안내, 스킨 선택 패널, 무기 HUD/패널
export class UI {
  constructor(skins, { onSelectSkin }) {
    this.skins = skins;
    this.onSelectSkin = onSelectSkin;
    this.$ = (id) => document.getElementById(id);
    this.panel = this.$('skinPanel');
    this.list = this.$('skinList');
    this.prompt = this.$('prompt');
    this.toastEl = this.$('toast');
    this.busy = false;

    this.$('skinOpen').addEventListener('click', () => this.togglePanel());
    this.$('skinClose').addEventListener('click', () => this.togglePanel(false));

    // 파일로 추가
    const fileInput = this.$('skinFile');
    this.$('skinFileBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      this.addFiles(fileInput.files);
      fileInput.value = '';
    });
    // 끌어다 놓기 (화면 아무 곳이나)
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      document.body.classList.add('dragging');
    });
    window.addEventListener('dragleave', (e) => {
      if (!e.relatedTarget) document.body.classList.remove('dragging');
    });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      document.body.classList.remove('dragging');
      this.addFiles(e.dataTransfer.files);
    });

    // 링크로 추가
    this.$('skinUrlAdd').addEventListener('click', () => this.addUrl());
    this.$('skinUrl').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.addUrl();
    });

    // 무기
    this.weaponPanel = this.$('weaponPanel');
    this.weaponList = this.$('weaponList');
    this.crosshair = this.$('crosshair');
    this.scope = this.$('scope');
    this.hitPop = this.$('hitPop');
    this.weaponHud = this.$('weaponHud');
    this.scoreHud = this.$('scoreHud');
    this.activeWeapon = null;
    this.onSelectWeapon = null;
    this.onResetScore = null;
    this._hud = { name: null, ammo: null, status: null, score: null, gap: null };
    this.wheel = this.$('wheel');
    this.wheelSvg = this.$('wheelSvg');
    this.wheelItems = [];
    this.wheelPick = null;
    this.wheelCur = { x: 0, y: 0 };
    this.$('weaponOpen').addEventListener('click', () => this.toggleWeaponPanel());
    this.$('weaponClose').addEventListener('click', () => this.toggleWeaponPanel(false));
    this.$('scoreReset').addEventListener('click', () => this.onResetScore?.());

    this.refresh();
  }

  get panelOpen() {
    return !this.panel.classList.contains('hidden');
  }

  get weaponPanelOpen() {
    return !this.weaponPanel.classList.contains('hidden');
  }

  get anyPanelOpen() {
    return this.panelOpen || this.weaponPanelOpen;
  }

  togglePanel(force) {
    const open = force === undefined ? !this.panelOpen : force;
    this.panel.classList.toggle('hidden', !open);
    if (open) this.weaponPanel.classList.add('hidden');
  }

  toggleWeaponPanel(force) {
    const open = force === undefined ? !this.weaponPanelOpen : force;
    this.weaponPanel.classList.toggle('hidden', !open);
    if (open) this.panel.classList.add('hidden');
  }

  refresh() {
    this.list.innerHTML = '';
    for (const skin of this.skins.list()) {
      const row = document.createElement('div');
      row.className = 'skin' + (skin.id === this.skins.selectedId ? ' active' : '');
      const btn = document.createElement('button');
      btn.textContent = skin.name;
      btn.disabled = this.busy;
      btn.addEventListener('click', () => this.select(skin));
      row.appendChild(btn);
      if (!skin.builtin) {
        const del = document.createElement('button');
        del.className = 'del';
        del.title = '삭제';
        del.textContent = '×';
        del.addEventListener('click', async () => {
          const wasSelected = skin.id === this.skins.selectedId;
          await this.skins.remove(skin.id);
          this.refresh();
          if (wasSelected) this.select(this.skins.selected);
        });
        row.appendChild(del);
      }
      this.list.appendChild(row);
    }
  }

  async select(skin) {
    if (this.busy) return;
    this.busy = true;
    this.refresh();
    this.toast(skin.name + ' 불러오는 중...', 0);
    try {
      await this.onSelectSkin(skin);
      this.skins.select(skin.id);
      this.toast(skin.name + ' 적용됨');
    } catch (err) {
      console.error(err);
      this.toast('스킨 로드 실패: ' + (err.message || err), 5000);
    }
    this.busy = false;
    this.refresh();
  }

  async addFiles(files) {
    let last = null;
    for (const file of files) {
      try {
        last = await this.skins.addFile(file);
      } catch (err) {
        this.toast(file.name + ': ' + err.message, 4000);
      }
    }
    if (!last) return;
    this.togglePanel(true);
    this.refresh();
    this.select(last);
  }

  addUrl() {
    const url = this.$('skinUrl').value;
    try {
      const skin = this.skins.addUrl('', url);
      this.$('skinUrl').value = '';
      this.refresh();
      this.select(skin);
    } catch (err) {
      this.toast(err.message, 4000);
    }
  }

  // --- 무기 패널 / HUD ---
  setWeapons(weapons, onSelect) {
    this.weapons = weapons;
    this.onSelectWeapon = onSelect;
    this.weaponList.innerHTML = '';
    const entries = weapons.map((w) => ({ id: w.id, label: `${w.key}  ${w.name}`, desc: w.type === 'melee' ? `근접 ${w.reach}m` : `탄창 ${w.mag}발${w.auto ? ' · 연사' : ''}${w.scope ? ' · 스코프' : ''}` }));
    entries.push({ id: null, label: 'X  맨손', desc: '무기 넣기' });
    for (const e of entries) {
      const row = document.createElement('div');
      row.className = 'skin weapon';
      row.dataset.id = e.id || '';
      const btn = document.createElement('button');
      btn.innerHTML = `<span>${e.label}</span><small>${e.desc}</small>`;
      btn.addEventListener('click', () => onSelect(e.id));
      row.appendChild(btn);
      this.weaponList.appendChild(row);
    }
    this.setActiveWeapon(this.activeWeapon);
  }

  setActiveWeapon(id) {
    this.activeWeapon = id;
    for (const row of this.weaponList.children) row.classList.toggle('active', row.dataset.id === (id || ''));
  }

  setWeaponHud(name, ammo = '', status = '') {
    const h = this._hud;
    this.weaponHud.classList.toggle('hidden', !name);
    if (!name) return;
    if (h.name !== name) { h.name = name; this.$('wName').textContent = name; }
    if (h.ammo !== ammo) { h.ammo = ammo; this.$('wAmmo').textContent = ammo; }
    if (h.status !== status) { h.status = status; this.$('wStatus').textContent = status; }
  }

  setCrosshair(visible, gap = 6) {
    this.crosshair.classList.toggle('hidden', !visible);
    const g = Math.round(gap);
    if (visible && this._hud.gap !== g) {
      this._hud.gap = g;
      this.crosshair.style.setProperty('--gap', g + 'px');
    }
  }

  setScope(on) {
    this.scope.classList.toggle('hidden', !on);
  }

  // 명중 표시: 조준선 빨강 깜빡임 + 점수 팝업
  flashHit(score) {
    this.crosshair.classList.add('hit');
    clearTimeout(this._hitTimer);
    this._hitTimer = setTimeout(() => this.crosshair.classList.remove('hit'), 120);
    const el = this.hitPop;
    el.textContent = `+${score}`;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth; // 애니메이션 재시작
    el.style.animation = '';
    clearTimeout(this._popTimer);
    this._popTimer = setTimeout(() => el.classList.add('hidden'), 650);
  }

  setScore({ score, shots, hits }) {
    const text = `점수 ${score} · 명중 ${hits} / ${shots}`;
    if (this._hud.score !== text) {
      this._hud.score = text;
      this.scoreHud.textContent = text;
    }
    this.scoreHud.classList.toggle('hidden', shots === 0);
  }

  // --- 무기 휠 (T 누르는 동안). 마우스 이동량으로 가상 커서를 움직여 조각을 고른다 ---
  openWheel(weapons, currentId, ammo) {
    const items = weapons.map((w) => ({ id: w.id, name: w.name, sub: w.mag ? `${ammo[w.id]} / ∞` : (w.type === 'melee' ? '근접' : '') }));
    items.push({ id: null, name: '맨손', sub: '' });
    this.wheelItems = items;
    this.wheelPick = currentId;
    this.wheelCur = { x: 0, y: 0 };
    const n = items.length, step = 360 / n, R = 140, r = 56, cx = 150, cy = 150;
    const pt = (a, rad) => [cx + Math.cos(a * Math.PI / 180) * rad, cy + Math.sin(a * Math.PI / 180) * rad];
    let svg = '';
    items.forEach((it, i) => {
      const c = -90 + i * step, a0 = c - step / 2 + 1, a1 = c + step / 2 - 1;
      const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R), [x2, y2] = pt(a1, r), [x3, y3] = pt(a0, r);
      svg += `<path data-i="${i}" d="M${x0},${y0} A${R},${R} 0 0,1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 0,0 ${x3},${y3} Z"/>`;
      const [tx, ty] = pt(c, (R + r) / 2);
      svg += `<text x="${tx}" y="${ty - (it.sub ? 4 : 0)}" class="name">${it.name}</text>`;
      if (it.sub) svg += `<text x="${tx}" y="${ty + 14}" class="sub">${it.sub}</text>`;
    });
    svg += `<circle class="dot" cx="${cx}" cy="${cy}" r="5"/>`;
    this.wheelSvg.innerHTML = svg;
    this.wheel.classList.remove('hidden');
    this.updateWheel();
  }

  get wheelOpen() {
    return !this.wheel.classList.contains('hidden');
  }

  moveWheel(dx, dy) {
    if (!this.wheelOpen) return;
    const c = this.wheelCur;
    c.x += dx; c.y += dy;
    const len = Math.hypot(c.x, c.y);
    if (len > 130) { c.x *= 130 / len; c.y *= 130 / len; }
    if (len > 25) {
      const n = this.wheelItems.length, step = 360 / n;
      const ang = Math.atan2(c.y, c.x) * 180 / Math.PI; // 위쪽이 -90도
      const i = ((Math.round((ang + 90) / step) % n) + n) % n;
      this.wheelPick = this.wheelItems[i].id;
    }
    this.updateWheel();
  }

  updateWheel() {
    const idx = this.wheelItems.findIndex((it) => it.id === this.wheelPick);
    for (const p of this.wheelSvg.querySelectorAll('path')) p.classList.toggle('active', Number(p.dataset.i) === idx);
    const dot = this.wheelSvg.querySelector('.dot');
    if (dot) { dot.setAttribute('cx', 150 + this.wheelCur.x); dot.setAttribute('cy', 150 + this.wheelCur.y); }
    const it = this.wheelItems[idx];
    this.$('wheelLabel').textContent = it ? it.name : '';
  }

  // 휠을 닫고 고른 무기 id 를 돌려준다 (맨손은 null)
  closeWheel() {
    this.wheel.classList.add('hidden');
    return this.wheelPick;
  }

  setPrompt(text) {
    if (!text) {
      this.prompt.classList.add('hidden');
      return;
    }
    this.prompt.textContent = text;
    this.prompt.classList.remove('hidden');
  }

  setMode(text) {
    this.$('mode').textContent = text;
  }

  setRoom(name) {
    const el = this.$('room');
    if (el.textContent !== name) el.textContent = name;
  }

  toast(text, ms = 2000) {
    clearTimeout(this._toastTimer);
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    if (ms > 0) this._toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }

  hideLoading() {
    this.$('loading').classList.add('hidden');
  }

  showError(text) {
    this.$('loading').textContent = text;
  }
}
