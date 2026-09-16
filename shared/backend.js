// Crazy 76: de koppeling tussen de apps en Firebase.
// Met ?mock=1 in het adres draait alles lokaal in de browser (handig om te oefenen zonder Firebase).
const FB = 'https://www.gstatic.com/firebasejs/12.6.0/';
const TEAMS = ['A', 'B'];

const C76 = () => window.C76;
const nowMs = () => Date.now();

// ---------- Media voorbereiden (op de telefoon van het team) ----------
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Afbeelding kan niet worden gelezen')); };
    img.src = url;
  });
}
function canvasBlob(canvas, quality) {
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', quality));
}
async function compressImage(file, maxDim = 1600, quality = 0.82) {
  const img = await loadImage(file);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const blob = await canvasBlob(canvas, quality);
  if (!blob) throw new Error('Foto kan niet worden verkleind');
  return { blob, w, h };
}
function videoMeta(file) {
  // Duur en een stilstaand beeld voor in de inbox. Lukt dat niet, dan zonder.
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    let done = false;
    const finish = (meta) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(meta); };
    const timer = setTimeout(() => finish({}), 6000);
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.onerror = () => { clearTimeout(timer); finish({}); };
    v.onloadedmetadata = () => {
      const meta = { duration: isFinite(v.duration) ? v.duration : null, w: v.videoWidth || null, h: v.videoHeight || null };
      const grab = async () => {
        try {
          const scale = Math.min(1, 480 / Math.max(v.videoWidth || 480, v.videoHeight || 480));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round((v.videoWidth || 480) * scale); canvas.height = Math.round((v.videoHeight || 270) * scale);
          canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
          meta.thumbBlob = await canvasBlob(canvas, 0.7);
        } catch (e) {}
        clearTimeout(timer); finish(meta);
      };
      v.onseeked = grab;
      try { v.currentTime = Math.min(0.6, (v.duration || 1) / 2); } catch (e) { grab(); }
    };
    v.src = url;
  });
}
function extOf(file, fallback) {
  const m = /\.([a-z0-9]+)$/i.exec(file.name || '');
  return m ? m[1].toLowerCase() : fallback;
}

export async function prepareMedia(files) {
  const R = C76().RULES;
  const out = [];
  for (const file of files) {
    const type = file.type || '';
    if (type.startsWith('image/')) {
      if (file.size > R.maxImageMB * 1048576) throw { code: 'too-large', message: `Foto is groter dan ${R.maxImageMB} MB` };
      const { blob, w, h } = await compressImage(file);
      out.push({ blob, type: 'image', contentType: 'image/jpeg', ext: 'jpg', name: file.name, size: blob.size, w, h });
    } else if (type.startsWith('video/')) {
      if (file.size > R.maxVideoMB * 1048576) throw { code: 'too-large', message: `Video is groter dan ${R.maxVideoMB} MB. Film korter of in lagere kwaliteit.` };
      const meta = await videoMeta(file);
      out.push({ blob: file, type: 'video', contentType: type, ext: extOf(file, 'mp4'), name: file.name, size: file.size,
        w: meta.w, h: meta.h, duration: meta.duration, thumbBlob: meta.thumbBlob });
    } else if (type.startsWith('audio/')) {
      if (file.size > R.maxVideoMB * 1048576) throw { code: 'too-large', message: `Geluidsopname is groter dan ${R.maxVideoMB} MB` };
      out.push({ blob: file, type: 'audio', contentType: type, ext: extOf(file, 'm4a'), name: file.name, size: file.size });
    } else {
      throw { code: 'unsupported', message: `“${file.name}” is geen foto, video of geluidsopname` };
    }
  }
  return out;
}

const strip = item => ({ type: item.type, name: item.name || '', size: item.size || 0, w: item.w || null, h: item.h || null, duration: item.duration || null });

// ---------- Firebase ----------
async function createFirebase(config) {
  const [{ initializeApp }, fs, st] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-firestore.js'), import(FB + 'firebase-storage.js'),
  ]);
  const app = initializeApp(config);
  let db;
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch (e) {
    db = fs.getFirestore(app);
  }
  const storage = st.getStorage(app);
  // Bij een kapotte verbinding liever na een minuut een foutmelding dan tien minuten een draaiend balkje.
  storage.maxUploadRetryTime = 60000;
  storage.maxOperationRetryTime = 30000;
  const stateRef = fs.doc(db, 'game', 'state');
  const teamRef = id => fs.doc(db, 'teams', id);
  const subRef = id => fs.doc(db, 'submissions', id);
  const D = () => C76().DEFAULTS;

  async function uploadOne(blob, path, contentType, onProgress) {
    const r = st.ref(storage, path);
    await new Promise((resolve, reject) => {
      const task = st.uploadBytesResumable(r, blob, { contentType });
      task.on('state_changed', snap => onProgress && onProgress(snap.bytesTransferred / Math.max(1, snap.totalBytes)), reject, resolve);
    });
    return { url: await st.getDownloadURL(r), path };
  }

  return {
    mode: 'firebase',
    async ensureDefaults() {
      await fs.runTransaction(db, async tx => {
        const s = await tx.get(stateRef);
        const t = await Promise.all(TEAMS.map(id => tx.get(teamRef(id))));
        if (!s.exists()) tx.set(stateRef, { ...D().state, createdAt: nowMs() });
        TEAMS.forEach((id, i) => { if (!t[i].exists()) tx.set(teamRef(id), { ...D().teams[id] }); });
      });
    },
    subscribe({ onState, onTeams, onSubmissions, onLog, onError }) {
      const err = e => onError && onError(e);
      const unsubs = [
        fs.onSnapshot(stateRef, snap => onState(snap.exists() ? snap.data() : null), err),
        fs.onSnapshot(fs.collection(db, 'teams'), snap => { const t = {}; snap.forEach(d => { t[d.id] = d.data(); }); onTeams(t); }, err),
        fs.onSnapshot(fs.collection(db, 'submissions'), snap => onSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err),
      ];
      if (onLog) unsubs.push(fs.onSnapshot(fs.query(fs.collection(db, 'log'), fs.orderBy('at', 'desc'), fs.limit(80)),
        snap => onLog(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err));
      return () => unsubs.forEach(u => u());
    },
    setState: patch => fs.setDoc(stateRef, patch, { merge: true }),
    setTeam: (id, patch) => fs.setDoc(teamRef(id), patch, { merge: true }),
    log: entry => fs.addDoc(fs.collection(db, 'log'), { at: nowMs(), ...entry }).catch(() => {}),
    async upload(items, folder, onProgress) {
      const total = items.reduce((a, it) => a + it.size, 0) || 1;
      let doneBytes = 0;
      const media = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const base = `${folder}/${nowMs()}-${i}`;
        const main = await uploadOne(it.blob, `${base}.${it.ext}`, it.contentType, p => onProgress && onProgress((doneBytes + p * it.size) / total));
        doneBytes += it.size;
        let thumbUrl = null;
        if (it.thumbBlob) { try { thumbUrl = (await uploadOne(it.thumbBlob, `${base}-thumb.jpg`, 'image/jpeg')).url; } catch (e) {} }
        media.push({ ...strip(it), url: main.url, path: main.path, thumbUrl });
      }
      onProgress && onProgress(1);
      return media;
    },
    async createSubmission({ team, nr, note, media, by }) {
      const id = `${team}-${nr}`;
      await fs.runTransaction(db, async tx => {
        const existing = await tx.get(subRef(id));
        if (existing.exists()) throw { code: 'exists', message: 'Deze opdracht is al ingestuurd' };
        tx.set(subRef(id), { team, nr, status: 'pending', note: note || '', media, by: by || '', createdAt: nowMs(),
          reviewedAt: null, reviewedBy: null, reviewNote: '', points: null });
      });
      return id;
    },
    addMedia: (id, media) => fs.updateDoc(subRef(id), { media: fs.arrayUnion(...media), updatedAt: nowMs() }),
    review: (id, patch) => fs.updateDoc(subRef(id), patch),
    remove: id => fs.deleteDoc(subRef(id)),
    async resetGame() {
      for (const col of ['submissions', 'log']) {
        const snap = await fs.getDocs(fs.collection(db, col));
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const batch = fs.writeBatch(db);
          docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }
      await Promise.all(TEAMS.map(id => fs.setDoc(teamRef(id), { dubbel: null, dubbelAt: null, finishAt: null, jury: 0, darts: false, penalties: [] }, { merge: true })));
      await fs.setDoc(stateRef, { startAt: null, finishedAt: null }, { merge: true });
    },
  };
}

// ---------- Demo zonder Firebase: alles in deze browser, gedeeld tussen tabbladen ----------
function createMock() {
  const KEY = 'c76-mock';
  const chan = 'BroadcastChannel' in window ? new BroadcastChannel(KEY) : null;
  const D = () => C76().DEFAULTS;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const write = data => { localStorage.setItem(KEY, JSON.stringify(data)); notify(); };
  const listeners = new Set();
  const notify = () => listeners.forEach(fn => fn());
  if (chan) chan.onmessage = () => listeners.forEach(fn => fn());
  window.addEventListener('storage', e => { if (e.key === KEY) listeners.forEach(fn => fn()); });
  const broadcast = () => { if (chan) chan.postMessage('x'); };
  const commit = data => { write(data); broadcast(); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const toDataUrl = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });

  return {
    mode: 'mock',
    async ensureDefaults() {
      const d = read();
      let changed = false;
      if (!d.state) { d.state = { ...D().state, createdAt: nowMs() }; changed = true; }
      if (!d.teams) { d.teams = {}; changed = true; }
      TEAMS.forEach(id => { if (!d.teams[id]) { d.teams[id] = { ...D().teams[id] }; changed = true; } });
      if (!d.subs) { d.subs = {}; changed = true; }
      if (!d.log) { d.log = []; changed = true; }
      if (changed) commit(d);
    },
    subscribe({ onState, onTeams, onSubmissions, onLog }) {
      const emit = () => {
        const d = read();
        onState(d.state || null); onTeams(d.teams || {});
        onSubmissions(Object.entries(d.subs || {}).map(([id, s]) => ({ id, ...s })));
        if (onLog) onLog((d.log || []).slice().sort((a, b) => b.at - a.at).slice(0, 80));
      };
      listeners.add(emit);
      setTimeout(emit, 0);
      return () => listeners.delete(emit);
    },
    async setState(patch) { const d = read(); d.state = { ...(d.state || {}), ...patch }; commit(d); },
    async setTeam(id, patch) { const d = read(); d.teams = d.teams || {}; d.teams[id] = { ...(d.teams[id] || D().teams[id]), ...patch }; commit(d); },
    async log(entry) { const d = read(); d.log = [...(d.log || []), { id: String(nowMs()) + Math.random(), at: nowMs(), ...entry }].slice(-120); commit(d); },
    async upload(items, folder, onProgress) {
      const media = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.size > 8 * 1048576) throw { code: 'too-large', message: 'In de demo kunnen bestanden tot 8 MB' };
        for (let p = 1; p <= 4; p++) { await wait(120); onProgress && onProgress((i + p / 4) / items.length); }
        media.push({ ...strip(it), url: await toDataUrl(it.blob), path: `${folder}/${nowMs()}-${i}`, thumbUrl: it.thumbBlob ? await toDataUrl(it.thumbBlob) : null });
      }
      return media;
    },
    async createSubmission({ team, nr, note, media, by }) {
      const d = read(); d.subs = d.subs || {};
      const id = `${team}-${nr}`;
      if (d.subs[id]) throw { code: 'exists', message: 'Deze opdracht is al ingestuurd' };
      d.subs[id] = { team, nr, status: 'pending', note: note || '', media, by: by || '', createdAt: nowMs(), reviewedAt: null, reviewedBy: null, reviewNote: '', points: null };
      commit(d);
      return id;
    },
    async addMedia(id, media) { const d = read(); if (d.subs && d.subs[id]) { d.subs[id].media = [...(d.subs[id].media || []), ...media]; d.subs[id].updatedAt = nowMs(); commit(d); } },
    async review(id, patch) { const d = read(); if (d.subs && d.subs[id]) { Object.assign(d.subs[id], patch); commit(d); } },
    async remove(id) { const d = read(); if (d.subs) delete d.subs[id]; commit(d); },
    async resetGame() {
      const d = read();
      d.subs = {}; d.log = [];
      TEAMS.forEach(id => { d.teams[id] = { ...d.teams[id], dubbel: null, dubbelAt: null, finishAt: null, jury: 0, darts: false, penalties: [] }; });
      d.state = { ...d.state, startAt: null, finishedAt: null };
      commit(d);
    },
  };
}

export async function createBackend(config) {
  const params = new URLSearchParams(location.search);
  if (params.has('mock')) return createMock();
  if (!config || !config.projectId) throw { code: 'unconfigured', message: 'Firebase is nog niet ingesteld' };
  return createFirebase(config);
}
