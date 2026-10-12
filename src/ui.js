// HUD, 상호작용 안내, 스킨 선택 패널
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
    this.refresh();
  }

  get panelOpen() {
    return !this.panel.classList.contains('hidden');
  }

  togglePanel(force) {
    const open = force === undefined ? !this.panelOpen : force;
    this.panel.classList.toggle('hidden', !open);
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
