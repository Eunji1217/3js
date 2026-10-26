import { schemaFor, DEFAULT_PARAMS, PRESETS, randomParams, sanitize } from './qchar.js';
import { extractPalette, paletteToParams } from './palette.js';
import { ITEMS, TAGS, RECIPES, missing } from './items.js';

const HOTBAR_SLOTS = 9;

const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp)$/i;

// 로더가 던진 영어 오류를 어떻게 해야 하는지까지 포함한 한국어 안내로 바꾼다
function friendlyLoadError(err) {
  const msg = String(err?.message || err);
  if (/FBX version not supported/i.test(msg)) {
    const ver = msg.match(/FileVersion:\s*(\d+)/)?.[1];
    return `FBX 파일 버전이 너무 낮아요${ver ? ` (${ver})` : ''}. FBX 6.4 이상(보통 7.4)이 필요해요. Mixamo 에서 Format 을 "FBX Binary(.fbx)" 로 골라 다시 받아 주세요 (FBX 6.11 은 안 돼요).`;
  }
  if (/Unknown format/i.test(msg)) return 'FBX 파일이 아니거나 깨진 파일이에요. 다시 받아 보세요.';
  return msg;
}

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
      const files = [...e.dataTransfer.files];
      // 커스터마이저가 열려 있을 때 이미지를 떨어뜨리면 사진 색 맞추기, 아니면 스킨 파일 추가
      const image = files.find((f) => f.type.startsWith('image/') || IMAGE_RE.test(f.name));
      if (image && this.charPanelOpen) this.applyPhoto(image);
      else if (image) this.toast('사진은 "내 캐릭터 만들기" 창을 연 상태에서 넣어 주세요', 4000);
      this.addFiles(files.filter((f) => f !== image));
    });

    // 링크로 추가
    this.$('skinUrlAdd').addEventListener('click', () => this.addUrl());
    this.$('skinUrl').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.addUrl();
    });

    // 캐릭터 커스터마이저
    this.charPanel = this.$('charPanel');
    this.charForm = this.$('charForm');
    this.charParams = null;   // 편집 중인 값
    this.charEditing = null;  // 기존 캐릭터를 고치는 중이면 그 스킨
    this.charPrevId = null;   // 취소 시 되돌릴 스킨
    this.onCustomChange = null; // (params) => 부품 다시 조립
    this.onPanelsChanged = null; // 패널이 열리고 닫힐 때 (포인터락 동기화용)
    this.onCustomizerOpen = null; // 커스터마이저가 열릴 때 (카메라를 정면으로)
    this.$('charNew').addEventListener('click', () => this.openCustomizer(null));
    this.$('charClose').addEventListener('click', () => this.cancelCustomizer());
    this.$('charCancel').addEventListener('click', () => this.cancelCustomizer());
    this.$('charSave').addEventListener('click', () => this.saveCustomizer());
    this.$('charRandom').addEventListener('click', () => this.setCharParams(randomParams(this.charParams?.family)));
    // 사진으로 색 맞추기 (jpg/png → 상의·하의·소매·신발·머리색)
    this.charPhoto = null; // 편집 중인 캐릭터의 사진 썸네일 (dataURL). 저장 시 스킨에 같이 들어간다
    const photoInput = this.$('charPhoto');
    this.$('charPhotoBtn').addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', () => { if (photoInput.files[0]) this.applyPhoto(photoInput.files[0]); photoInput.value = ''; });
    this.$('charPhotoClear').addEventListener('click', () => this.setPhoto(null));
    for (const btn of this.charPanel.querySelectorAll('[data-preset]')) {
      btn.addEventListener('click', () => this.setCharParams({ ...this.charParams, ...PRESETS[btn.dataset.preset] }));
    }

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

    // 연습 게임
    this.gameHud = this.$('gameHud');
    this.gameCount = this.$('gameCount');
    this.gamePanel = this.$('gamePanel');
    this.onGameToggle = null;  // 시작/중지 버튼·G 키
    this.onGameDismiss = null; // 결과 창 닫기
    this._game = { state: null, text: null, count: null, show: null };
    this.$('gameStart').addEventListener('click', () => this.onGameToggle?.());
    this.$('gameAgain').addEventListener('click', () => this.onGameToggle?.());
    this.$('gameClose').addEventListener('click', () => this.toggleGamePanel(false));
    this.$('gameDismiss').addEventListener('click', () => this.toggleGamePanel(false));

    // 조작법 도움말 접기 (상태는 localStorage 에 기억)
    const hud = this.$('hud');
    const setCollapsed = (c) => { hud.classList.toggle('collapsed', c); this.$('hudToggle').textContent = c ? '도움말 펼치기' : '도움말 접기'; };
    try { setCollapsed(localStorage.getItem('roomsim.hudCollapsed') === '1'); } catch {}
    this.$('hudToggle').addEventListener('click', () => {
      const c = !hud.classList.contains('collapsed');
      setCollapsed(c);
      try { localStorage.setItem('roomsim.hudCollapsed', c ? '1' : '0'); } catch {}
    });

    // 인벤토리 / 요리 도감 (E 또는 I)
    this.invPanel = this.$('invPanel');
    this.hotbar = this.$('hotbar');
    this.hotbarPage = 0;
    this.invTab = 'items';
    this.invData = null;      // Inventory (main.js 가 setInventory 로 넘김)
    this.nearStove = false;   // 가스레인지 옆이면 도감의 "요리" 버튼이 켜진다
    this.onCook = null;       // (recipe) => void
    this.$('invClose').addEventListener('click', () => this.toggleInvPanel(false));
    this.$('invOpen').addEventListener('click', () => this.toggleInvPanel());
    for (const b of this.invPanel.querySelectorAll('.tabs button')) b.addEventListener('click', () => { this.invTab = b.dataset.tab; this.renderInventory(); });

    this.refresh();
  }

  // --- 인벤토리 / 요리 도감 ---
  get invPanelOpen() {
    return !this.invPanel.classList.contains('hidden');
  }

  toggleInvPanel(force, tab) {
    const open = force === undefined ? !this.invPanelOpen : force;
    if (tab) this.invTab = tab;
    this.invPanel.classList.toggle('hidden', !open);
    if (open) { this.panel.classList.add('hidden'); this.weaponPanel.classList.add('hidden'); this.charPanel.classList.add('hidden'); this.renderInventory(); }
    this.onPanelsChanged?.();
  }

  // 인벤토리가 바뀔 때마다 (줍기·요리·복원) 핫바와 열린 패널을 다시 그린다
  setInventory(inv) {
    this.invData = inv;
    this.renderHotbar();
    if (this.invPanelOpen) this.renderInventory();
  }

  setNearStove(near) {
    if (this.nearStove === near) return;
    this.nearStove = near;
    if (this.invPanelOpen && this.invTab === 'recipes') this.renderInventory();
  }

  hotbarScroll(dir) {
    const pages = Math.max(1, Math.ceil((this.invData?.list().length || 0) / HOTBAR_SLOTS));
    this.hotbarPage = ((this.hotbarPage + dir) % pages + pages) % pages;
    this.renderHotbar();
  }

  // 마인크래프트식 한 줄 핫바: 가진 것 9칸씩, Shift+휠로 다음 줄
  renderHotbar() {
    const list = this.invData?.list() || [];
    const pages = Math.max(1, Math.ceil(list.length / HOTBAR_SLOTS));
    if (this.hotbarPage >= pages) this.hotbarPage = pages - 1;
    const slots = this.$('hotbarSlots');
    slots.innerHTML = '';
    const start = this.hotbarPage * HOTBAR_SLOTS;
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const it = list[start + i];
      const d = document.createElement('div');
      d.className = 'slot' + (it ? '' : ' empty');
      if (it) { d.innerHTML = `<span class="ic">${it.icon}</span><b>${it.n}</b>`; d.title = `${it.name} ×${it.n} — ${it.desc}`; }
      slots.appendChild(d);
    }
    this.$('hotbarPage').textContent = pages > 1 ? `${this.hotbarPage + 1} / ${pages}  (Shift+휠)` : '';
    this.hotbar.classList.toggle('hidden', list.length === 0);
  }

  renderInventory() {
    const inv = this.invData;
    for (const b of this.invPanel.querySelectorAll('.tabs button')) b.classList.toggle('active', b.dataset.tab === this.invTab);
    const box = this.$('invBody');
    box.innerHTML = '';
    if (!inv) return;
    if (this.invTab === 'items') {
      const list = inv.list();
      if (!list.length) { box.innerHTML = '<div class="empty">아직 아무것도 없어요. 현관문으로 나가 들판의 동물을 사냥하거나 텃밭의 호박·숲의 버섯을 따 보세요.</div>'; return; }
      for (const group of [['재료', (it) => !it.tags.includes('dish')], ['요리', (it) => it.tags.includes('dish')]]) {
        const items = list.filter(group[1]);
        if (!items.length) continue;
        const h = document.createElement('h4'); h.textContent = group[0]; box.appendChild(h);
        const grid = document.createElement('div'); grid.className = 'grid';
        for (const it of items) {
          const d = document.createElement('div'); d.className = 'item';
          d.innerHTML = `<span class="ic">${it.icon}</span><div><div class="nm">${it.name} <b>×${it.n}</b>${it.sate ? ` <small>포만감 ${it.sate}</small>` : ''}</div><div class="ds">${it.desc}</div></div>`;
          grid.appendChild(d);
        }
        box.appendChild(grid);
      }
    } else {
      const hint = document.createElement('div'); hint.className = 'hint';
      hint.textContent = this.nearStove ? '가스레인지 앞입니다. 재료가 있는 요리는 "요리" 버튼이 켜져요.' : '요리는 주방 가스레인지 앞에서 E 를 눌러 이 창을 열면 만들 수 있어요.';
      box.appendChild(hint);
      for (const r of RECIPES) {
        const miss = missing(inv, r);
        const ok = miss.length === 0;
        const row = document.createElement('div'); row.className = 'recipe' + (ok ? ' ok' : '');
        const res = ITEMS[r.result];
        const ing = r.ingredients.map((s) => {
          const info = s.id ? ITEMS[s.id] : TAGS[s.tag];
          const have = s.id ? inv.count(s.id) : inv.tagCount(s.tag);
          return `<span class="${have >= s.n ? 'have' : 'lack'}">${info.icon} ${info.name} ${Math.min(have, s.n)}/${s.n}</span>`;
        }).join(' + ');
        row.innerHTML = `<span class="ic">${res.icon}</span><div><div class="nm">${r.name}${res.sate ? ` <small>포만감 ${res.sate} · ${r.time}초</small>` : ''}</div><div class="ds">${ing}</div></div>`;
        const btn = document.createElement('button');
        btn.textContent = '요리';
        btn.disabled = !(ok && this.nearStove);
        btn.title = !this.nearStove ? '가스레인지 앞에서만' : ok ? '' : '재료 부족';
        btn.addEventListener('click', () => this.onCook?.(r));
        row.appendChild(btn);
        box.appendChild(row);
      }
    }
  }

  get gamePanelOpen() {
    return !this.gamePanel.classList.contains('hidden');
  }

  toggleGamePanel(force) {
    const open = force === undefined ? !this.gamePanelOpen : force;
    if (open === this.gamePanelOpen) return;
    this.gamePanel.classList.toggle('hidden', !open);
    if (!open) this.onGameDismiss?.();
    this.onPanelsChanged?.();
  }

  // 매 프레임 호출: 게임 상태에 따라 상단 타이머·카운트다운·결과 창을 갱신한다
  setGame(game) {
    const g = this._game;
    const { state } = game;
    // 카운트다운 숫자 (화면 중앙)
    const count = state === 'countdown' ? String(Math.ceil(game.time)) : state === 'running' && game.time > game.total - 0.8 ? '시작!' : null;
    if (g.count !== count) {
      g.count = count;
      this.gameCount.classList.toggle('hidden', !count);
      if (count) this.gameCount.textContent = count;
    }
    // 상단 타이머
    const show = state === 'countdown' || state === 'running';
    this.gameHud.classList.toggle('hidden', !show);
    if (show) {
      const t = state === 'running' ? game.time : game.total;
      const text = `${t.toFixed(1)}|${game.score}|${game.hits}|${game.shots}`;
      if (g.text !== text) { // 바뀐 프레임에만 DOM 을 건드린다
        g.text = text;
        this.$('gameTime').textContent = t.toFixed(1);
        this.$('gameScore').textContent = `점수 ${game.score} · 명중 ${game.hits} / ${game.shots}`;
      }
      this.gameHud.classList.toggle('urgent', state === 'running' && game.time < 10);
    }
    if (g.show !== show) {
      g.show = show;
      this.$('gameStart').textContent = show ? '연습 게임 중지 (G)' : '연습 게임 시작 (G)';
    }
    // 끝나면 결과 창 한 번 열기
    if (state !== g.state) {
      g.state = state;
      if (state === 'over') {
        const acc = game.shots ? Math.round((game.hits / game.shots) * 100) : 0;
        this.$('gameResult').innerHTML =
          `<div class="big">${game.score}<small>점</small></div>` +
          `<div>명중 ${game.hits} / ${game.shots} (${acc}%)</div>` +
          `<div>최고 기록 ${game.best}점${game.isBest ? ' <b>🏆 신기록!</b>' : ''}</div>`;
        this.toggleGamePanel(true);
      } else if (state === 'countdown') {
        this.toggleGamePanel(false);
      }
    }
  }

  get panelOpen() {
    return !this.panel.classList.contains('hidden');
  }

  get weaponPanelOpen() {
    return !this.weaponPanel.classList.contains('hidden');
  }

  get charPanelOpen() {
    return !this.charPanel.classList.contains('hidden');
  }

  get anyPanelOpen() {
    return this.panelOpen || this.weaponPanelOpen || this.charPanelOpen || this.gamePanelOpen || this.invPanelOpen;
  }

  togglePanel(force) {
    const open = force === undefined ? !this.panelOpen : force;
    this.panel.classList.toggle('hidden', !open);
    if (open) { this.weaponPanel.classList.add('hidden'); this.charPanel.classList.add('hidden'); this.invPanel.classList.add('hidden'); }
    this.onPanelsChanged?.();
  }

  toggleWeaponPanel(force) {
    const open = force === undefined ? !this.weaponPanelOpen : force;
    this.weaponPanel.classList.toggle('hidden', !open);
    if (open) { this.panel.classList.add('hidden'); this.charPanel.classList.add('hidden'); this.invPanel.classList.add('hidden'); }
    this.onPanelsChanged?.();
  }

  // --- 캐릭터 커스터마이저 ---
  async openCustomizer(skin) {
    if (this.busy) return;
    this.charEditing = skin;
    this.charPrevId = this.skins.selectedId;
    this.$('charName').value = skin ? skin.name : '';
    this.panel.classList.add('hidden');
    this.weaponPanel.classList.add('hidden');
    this.charPanel.classList.remove('hidden');
    this.onPanelsChanged?.();
    this.onCustomizerOpen?.(); // 카메라를 얼굴 쪽으로
    // 미리보기: 저장 전까지는 임시 스킨으로 보여 준다
    const params = sanitize(skin?.params);
    this.busy = true;
    try {
      await this.onSelectSkin({ id: 'preview', name: '미리보기', format: 'qchar', params });
    } catch (err) {
      console.error(err);
      this.toast('캐릭터를 만들지 못했어요: ' + friendlyLoadError(err), 6000);
    }
    this.busy = false;
    this.setCharParams(params);
    this.setPhoto(skin?.photo || null, skin?.palette || null);
  }

  // 사진 → 색 뽑기 → 캐릭터 색에 적용. 썸네일과 색 견본을 패널에 보여 준다
  async applyPhoto(file) {
    if (file.size > 20 * 1024 * 1024) { this.toast('사진이 너무 커요 (20MB 이하)', 4000); return; }
    try {
      const { colors, thumb } = await extractPalette(file);
      const hexes = colors.map((c) => c.hex);
      this.setPhoto(thumb, hexes);
      this.setCharParams({ ...this.charParams, ...paletteToParams(colors) });
      this.toast('사진 색을 옷·머리에 입혔어요. 마음에 안 드는 부분은 아래 색상 칸에서 바꾸세요', 3500);
    } catch (err) {
      console.error(err);
      this.toast(err.message || '사진을 읽지 못했어요', 4000);
    }
  }

  // 패널의 사진 썸네일·색 견본 표시 (photo 가 null 이면 지움)
  setPhoto(photo, palette = null) {
    this.charPhoto = photo;
    this.charPalette = palette;
    const img = this.$('charPhotoThumb');
    img.src = photo || '';
    img.classList.toggle('hidden', !photo);
    this.$('charPhotoClear').classList.toggle('hidden', !photo);
    const sw = this.$('charSwatches');
    sw.innerHTML = '';
    for (const hex of palette || []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = hex;
      b.title = `${hex} · 클릭: 상의 색으로`;
      b.addEventListener('click', () => this.setCharParams({ ...this.charParams, topColor: hex }));
      sw.appendChild(b);
    }
  }

  // 값 전체를 바꾸고 폼과 캐릭터를 갱신한다
  setCharParams(params) {
    this.charParams = sanitize(params);
    this.renderCharForm();
    this.pushCharParams();
  }

  // 부품 로드가 비동기라 호출이 겹칠 수 있다. 마지막 요청만 반영되게 직렬화한다
  pushCharParams() {
    const P = { ...this.charParams };
    this._charQueue = (this._charQueue || Promise.resolve()).then(() => this.onCustomChange?.(P)).catch((err) => {
      console.error(err);
      this.toast('부품을 불러오지 못했어요: ' + friendlyLoadError(err), 5000);
    });
  }

  renderCharForm() {
    const P = this.charParams;
    this.charForm.innerHTML = '';
    for (const group of schemaFor(P)) {
      const det = document.createElement('details');
      det.open = group.group === '기본' || group.group === '얼굴';
      const sum = document.createElement('summary');
      sum.textContent = group.group;
      det.appendChild(sum);
      for (const f of group.fields) {
        const row = document.createElement('div');
        row.className = 'field';
        const label = document.createElement('label');
        label.textContent = f.label;
        row.appendChild(label);
        let input;
        if (f.type === 'select') {
          input = document.createElement('select');
          for (const [v, text] of Object.entries(f.options)) {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = text;
            input.appendChild(opt);
          }
          input.value = P[f.key];
        } else {
          input = document.createElement('input');
          input.type = f.type;
          if (f.type === 'range') { input.min = f.min; input.max = f.max; input.step = f.step; }
          input.value = P[f.key];
        }
        const apply = () => {
          P[f.key] = f.type === 'range' ? Number(input.value) : input.value;
          // 팩·성별이 바뀌면 선택지 자체가 달라지므로 값을 정리하고 폼을 다시 그린다
          if (f.key === 'family' || f.key === 'gender') this.setCharParams(P);
          else this.pushCharParams();
        };
        input.addEventListener('input', apply);
        input.addEventListener('change', apply);
        row.appendChild(input);
        det.appendChild(row);
      }
      this.charForm.appendChild(det);
    }
  }

  async saveCustomizer() {
    const name = this.$('charName').value;
    const extra = { photo: this.charPhoto, palette: this.charPalette }; // 사진 썸네일·색 견본도 스킨에 같이 저장
    // 기본 제공 스킨(예: "여성 · 캐주얼")을 고친 경우는 원본을 두고 새 스킨으로 저장한다
    const saved = this.charEditing && !this.charEditing.builtin
      ? this.skins.updateCustom(this.charEditing.id, this.charParams, name, extra)
      : this.skins.addCustom(name || (this.charEditing ? this.charEditing.name + ' (수정)' : ''), this.charParams, extra);
    this.charPanel.classList.add('hidden');
    this.charEditing = null;
    this.refresh();
    await this.select(saved); // 저장본으로 다시 불러와 선택 상태를 맞춘다
    this.onPanelsChanged?.();
  }

  async cancelCustomizer() {
    this.charPanel.classList.add('hidden');
    this.charEditing = null;
    const prev = this.skins.get(this.charPrevId);
    this.refresh();
    await this.select(prev);
    this.onPanelsChanged?.();
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
      if (skin.format === 'qchar' || skin.format === 'custom') {
        const cust = document.createElement('button');
        cust.className = 'edit';
        cust.title = '외모 고치기';
        cust.textContent = '👤';
        cust.addEventListener('click', () => this.openCustomizer(skin));
        row.appendChild(cust);
      }
      const edit = document.createElement('button');
      edit.className = 'edit';
      edit.title = '이름 바꾸기';
      edit.textContent = '✎';
      edit.addEventListener('click', () => this.startRename(row, btn, skin));
      row.appendChild(edit);
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

  // 이름 버튼을 입력창으로 바꾼다. Enter 로 저장, Esc 로 취소, 비우면 원래 이름
  startRename(row, btn, skin) {
    const input = document.createElement('input');
    input.className = 'rename';
    input.value = skin.name;
    input.placeholder = '비우면 원래 이름';
    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      if (save) {
        const updated = await this.skins.rename(skin.id, input.value);
        this.toast('이름을 "' + updated.name + '" 으로 바꿨어요');
      }
      this.refresh();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    row.replaceChild(input, btn);
    input.focus();
    input.select();
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
      this.toast('스킨 로드 실패: ' + friendlyLoadError(err), 7000);
    }
    this.busy = false;
    this.refresh();
  }

  // 추가할 때 붙일 이름 (입력칸). 읽고 나면 비운다
  takeName() {
    const el = this.$('skinName');
    const name = el.value;
    el.value = '';
    return name;
  }

  async addFiles(files) {
    // 이름은 파일을 하나만 넣을 때 쓴다 (여러 개면 각자 파일 이름)
    const name = files.length === 1 ? this.takeName() : '';
    let last = null;
    for (const file of files) {
      try {
        last = await this.skins.addFile(file, name);
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
      const skin = this.skins.addUrl(this.takeName(), url);
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
    el.textContent = typeof score === 'number' ? `+${score}` : score; // 숫자면 점수, 문자열이면 그대로 (동물 명중)
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
