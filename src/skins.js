// 스킨 목록: 기본 스킨 + src/skins 폴더 + 파일로 추가(IndexedDB 저장) + 링크로 추가(localStorage 저장)
const KEY_CUSTOM = 'roomsim.customSkins';
const KEY_SELECTED = 'roomsim.selectedSkin.v2'; // v2: 기본 스킨이 일반인으로 바뀜
const DB_NAME = 'roomsim';
const DB_STORE = 'skinFiles';

export const SOLDIER_URL = '/models/Soldier.glb';
export const ACCEPT_RE = /\.(glb|fbx)$/i;

// 첫 번째 항목이 기본 스킨. 애니메이션이 없는 모델은 Soldier 의 걷기/달리기를 자동으로 옮겨 쓴다.
export const DEFAULT_SKINS = [
  { id: 'casual', name: '일반인 (기본)', url: '/models/readyplayer.me.glb', format: 'glb', builtin: true },
  { id: 'soldier', name: '군인', url: SOLDIER_URL, format: 'glb', builtin: true },
];

// src/skins/ 폴더에 넣은 .glb/.fbx 는 자동 등록된다
const folderSkins = Object.entries(
  import.meta.glob('./skins/*.{glb,fbx,GLB,FBX}', { query: '?url', import: 'default', eager: true }),
).map(([path, url]) => {
  const file = path.split('/').pop();
  return { id: 'folder-' + file, name: file.replace(ACCEPT_RE, ''), url, format: formatOfName(file), builtin: true };
});

export function formatOfName(name) {
  return /\.fbx(\?.*)?$/i.test(name) ? 'fbx' : 'glb';
}

function readJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// --- IndexedDB (파일로 추가한 스킨 보관) ---
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbRun(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, mode);
    const req = fn(tx.objectStore(DB_STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const dbAll = () => dbRun('readonly', (s) => s.getAll());
const dbPut = (rec) => dbRun('readwrite', (s) => s.put(rec));
const dbDelete = (id) => dbRun('readwrite', (s) => s.delete(id));

function toFileSkin(rec) {
  return {
    id: rec.id,
    name: rec.name,
    url: URL.createObjectURL(rec.blob),
    format: formatOfName(rec.fileName || rec.name),
    builtin: false,
  };
}

export class SkinStore {
  constructor() {
    this.custom = readJSON(KEY_CUSTOM, []);
    this.files = [];
    this.selectedId = readJSON(KEY_SELECTED, DEFAULT_SKINS[0].id);
  }

  // 저장된 파일 스킨을 불러온다 (한 번만)
  async init() {
    try {
      const recs = await dbAll();
      this.files = recs.map(toFileSkin);
    } catch (err) {
      console.warn('파일 스킨 저장소(IndexedDB)를 쓸 수 없어요:', err);
    }
  }

  list() {
    return [...DEFAULT_SKINS, ...folderSkins, ...this.files, ...this.custom];
  }

  get(id) {
    return this.list().find((s) => s.id === id) || DEFAULT_SKINS[0];
  }

  get selected() {
    return this.get(this.selectedId);
  }

  select(id) {
    this.selectedId = id;
    writeJSON(KEY_SELECTED, id);
  }

  // 내 컴퓨터의 .glb / .fbx 파일을 스킨으로 추가
  async addFile(file) {
    if (!ACCEPT_RE.test(file.name)) throw new Error('.glb 또는 .fbx 파일만 넣을 수 있어요');
    const rec = {
      id: 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      name: file.name.replace(ACCEPT_RE, ''),
      fileName: file.name,
      blob: file,
    };
    try {
      await dbPut(rec);
    } catch (err) {
      console.warn('파일 스킨을 저장하지 못했어요 (이번 세션에서만 사용):', err);
    }
    const skin = toFileSkin(rec);
    this.files.push(skin);
    return skin;
  }

  // 인터넷에 올라와 있는 .glb / .fbx 링크를 스킨으로 추가
  addUrl(name, url) {
    url = url.trim();
    if (!/^https?:\/\/.+\.(glb|fbx)(\?.*)?$/i.test(url)) {
      throw new Error('.glb 또는 .fbx 로 끝나는 링크를 넣어 주세요');
    }
    const skin = { id: 'url-' + Date.now(), name: name.trim() || url.split('/').pop(), url, format: formatOfName(url), builtin: false };
    this.custom.push(skin);
    writeJSON(KEY_CUSTOM, this.custom);
    return skin;
  }

  async remove(id) {
    const file = this.files.find((s) => s.id === id);
    if (file) {
      this.files = this.files.filter((s) => s.id !== id);
      URL.revokeObjectURL(file.url);
      try { await dbDelete(id); } catch {}
    }
    this.custom = this.custom.filter((s) => s.id !== id);
    writeJSON(KEY_CUSTOM, this.custom);
    if (this.selectedId === id) this.select(DEFAULT_SKINS[0].id);
  }
}
