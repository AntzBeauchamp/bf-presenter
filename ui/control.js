const btnAdd = document.getElementById('btnAdd');
const btnPush = document.getElementById('btnPush');
const btnClearPreview = document.getElementById('btnClearPreview');
const btnPlay = document.getElementById('btnPlay');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnRepeatToggle = document.getElementById('btnRepeatToggle');
const btnBlankToggle = document.getElementById('btnBlankToggle');
const btnBackground = document.getElementById('btnBackground');
const btnAutoPlay = document.getElementById('btnAutoPlay');
const btnStop = document.getElementById('btnStop');
const btnViewToggle = document.getElementById('btnViewToggle');
const btnClearNext = document.getElementById('btnClearNext');
const btnSetImage = document.getElementById('btnSetImage');
const btnStageMoreToggle = document.getElementById('btnStageMoreToggle');
const displayScrubber = document.getElementById('displayScrubber');
const displayTimeLabel = document.getElementById('displayTimeLabel');

const grid = document.getElementById('thumbGrid');
const previewArea = document.getElementById('previewArea');
const nextUpArea = document.getElementById('nextUpArea');
const leftPanel = document.querySelector('.left-panel');

const loggerBody = document.getElementById('loggerBody');
const loggerCard = document.getElementById('loggerCard');
const loggerCountEl = document.getElementById('loggerCount');
const btnLogClear = document.getElementById('btnLogClear');
const btnLogDownload = document.getElementById('btnLogDownload');
const btnLogToggle = document.getElementById('btnLogToggle');
const chkAutoscroll = document.getElementById('chkAutoscroll');

const logAPI = window.presenterAPI?.log ?? null;

const NEXTUP_PLACEHOLDER = '<div class="nextup-placeholder">Click a thumbnail to stage it here.</div>';
const LOG_BUFFER_MAX = 1000;

let media = [];
let previewId = null;
let programId = null;
let nextUpId = null;
let index = -1;
const logBuffer = [];
const selectedMediaIds = new Set();

let draggingId = null;

function indexById(arr, id) {
  return arr.findIndex((m) => m.id === id);
}

function moveInArray(arr, fromIdx, toIdx) {
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return arr;
  const copy = arr.slice();
  const [item] = copy.splice(fromIdx, 1);
  copy.splice(toIdx, 0, item);
  return copy;
}

let isProgramBlanked = false;
let isProgramPlaying = false;
let isRepeatEnabled = false;
let autoPlayEnabled = false;
let displayCurrentTime = 0;
let displayDuration = 0;
let isDisplayScrubbing = false;
let stageMoreEnabled = false;
let stageMoreOrder = [];
let stageMoreCursor = 0;
let isListView = false;

function updatePlayToggleUI(playing) {
  isProgramPlaying = !!playing;
  if (!btnPlay) return;
  const label = isProgramPlaying ? 'Pause' : 'Play';
  btnPlay.textContent = isProgramPlaying ? '⏸' : '▶';
  btnPlay.setAttribute('aria-label', label);
  btnPlay.setAttribute('title', label);
}

function updateRepeatButton() {
  if (!btnRepeatToggle) return;
  btnRepeatToggle.textContent = isRepeatEnabled ? 'Repeat: On' : 'Repeat: Off';
  btnRepeatToggle.setAttribute('aria-pressed', String(isRepeatEnabled));
  btnRepeatToggle.title = isRepeatEnabled ? 'Repeat on' : 'Repeat off';
  if (isRepeatEnabled) {
    btnRepeatToggle.classList.add('repeat-active');
  } else {
    btnRepeatToggle.classList.remove('repeat-active');
  }
}

btnRepeatToggle.onclick = () => {
  isRepeatEnabled = !isRepeatEnabled;
  updateRepeatButton();
  window.presenterAPI.setRepeat(isRepeatEnabled);
};

function updateAutoPlayUI() {
  if (!btnAutoPlay) return;
  if (autoPlayEnabled) {
    btnAutoPlay.textContent = 'Auto-Play On';
    btnAutoPlay.classList.add('auto-play-active');
  } else {
    btnAutoPlay.textContent = 'Auto-Play Off';
    btnAutoPlay.classList.remove('auto-play-active');
  }
}

if (btnAutoPlay) {
  btnAutoPlay.onclick = () => {
    autoPlayEnabled = !autoPlayEnabled;
    updateAutoPlayUI();
    console.log('CONTROL: Auto-play toggled to', autoPlayEnabled ? 'ON' : 'OFF');
  };
}

updatePlayToggleUI(false);
updateRepeatButton();
updateAutoPlayUI();
initStageMoreState();
initViewMode();

function updateBackgroundButtonUI(absPath) {
  if (!btnStop) return;
  if (absPath) {
    try {
      const url = fileUrl(absPath);
      btnStop.style.backgroundImage = `url(${JSON.stringify(url).slice(1,-1)})`;
      btnStop.classList.add('background-has-image');
      btnStop.title = 'Background (image set)';
    } catch {
      btnStop.style.backgroundImage = '';
      btnStop.classList.remove('background-has-image');
      btnStop.title = 'Background (no image set)';
    }
  } else {
    btnStop.style.backgroundImage = '';
    btnStop.classList.remove('background-has-image');
    btnStop.title = 'Background (no image set)';
  }
}

function saveStageMoreState() {
  try {
    localStorage.setItem('stageMoreEnabled', stageMoreEnabled ? '1' : '0');
    localStorage.setItem('stageMoreOrder', JSON.stringify(stageMoreOrder));
    localStorage.setItem('stageMoreCursor', String(stageMoreCursor));
  } catch {}
}

function initStageMoreState() {
  try {
    stageMoreEnabled = false; // Always start with Stage More OFF
    stageMoreOrder = []; // Always reset order on app start
    stageMoreCursor = 0; // Always reset counter on app start
  } catch {}
  applyStageMoreUI();
}

function applyStageMoreUI() {
  if (grid) grid.classList.toggle('stagemore-mode', stageMoreEnabled);
  if (btnStageMoreToggle) {
    btnStageMoreToggle.setAttribute('aria-pressed', String(stageMoreEnabled));
    btnStageMoreToggle.textContent = stageMoreEnabled ? 'Stage more: On' : 'Stage more…';
  }
  renderMediaGrid();
}

function stageMoreIncluded(id) {
  return stageMoreOrder.includes(id);
}

function stageMoreIndexOf(id) {
  return stageMoreOrder.indexOf(id);
}

function addToStageMore(id) {
  if (!stageMoreOrder.includes(id)) {
    stageMoreOrder.push(id);
    saveStageMoreState();
  }
}

function removeFromStageMore(id) {
  const idx = stageMoreOrder.indexOf(id);
  if (idx !== -1) {
    stageMoreOrder.splice(idx, 1);
    if (stageMoreCursor > idx) stageMoreCursor -= 1;
    stageMoreCursor = Math.max(0, Math.min(stageMoreCursor, stageMoreOrder.length));
    saveStageMoreState();
  }
}

function nextStageMoreId() {
  if (!stageMoreEnabled || !stageMoreOrder.length) return null;
  let attempts = 0;
  while (attempts < stageMoreOrder.length) {
    const id = stageMoreOrder[stageMoreCursor % stageMoreOrder.length];
    stageMoreCursor = (stageMoreCursor + 1) % stageMoreOrder.length;
    attempts++;
    const item = media.find(m => m.id === id);
    if (!item) continue;
    if (id === previewId || id === programId || id === nextUpId) continue;
    saveStageMoreState();
    return id;
  }
  return null;
}

function backfillNextUpFromStageMore() {
  if (!stageMoreEnabled) return false;
  if (nextUpId) return false;
  const id = nextStageMoreId();
  if (!id) return false;
  const item = media.find(m => m.id === id);
  if (!item) return false;
  nextUpId = id;
  renderNextUp(item);
  renderMediaGrid();
  console.log('CONTROL: Stage more backfilled Next Up with', item.name);
  return true;
}

function updateViewToggleUI() {
  if (!btnViewToggle) return;
  const label = isListView ? 'Grid View' : 'List View';
  btnViewToggle.textContent = label;
  btnViewToggle.title = `Switch to ${label}`;
}

function applyViewMode() {
  if (grid) {
    grid.classList.toggle('list-view', isListView);
  }
  updateViewToggleUI();
}

function initViewMode() {
  try {
    const saved = localStorage.getItem('viewMode');
    isListView = saved === 'list';
  } catch {}
  applyViewMode();
}

function fileUrl(p) {
  try {
    if (window.presenterAPI && typeof window.presenterAPI.toFileURL === 'function') {
      return window.presenterAPI.toFileURL(p);
    }
  } catch (err) {
    console.warn('presenterAPI.toFileURL failed, falling back to file://', err);
  }
  // Fallback: normalize Windows path to file:///C:/...
  try {
    const normalized = p.replace(/\\/g, '/');
    if (!normalized.startsWith('/')) return `file:///${normalized}`;
    return `file://${normalized}`;
  } catch (err) {
    return `file://${p}`;
  }
}

function pad2(n) {
  return n.toString().padStart(2, '0');
}

function tsString(ts) {
  const d = new Date(ts);
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${ms}`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateDisplayUI() {
  if (!displayScrubber || !displayTimeLabel) return;

  const duration = displayDuration > 0 ? displayDuration : 0;
  const current = Math.max(0, Math.min(displayCurrentTime, duration || displayCurrentTime || 0));
  const ratio = duration > 0 ? current / duration : 0;
  const percent = Math.max(0, Math.min(ratio, 1)) * 100;

  displayScrubber.value = String(percent);
  displayTimeLabel.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
}

function appendLog(entry) {
  if (!entry || !loggerBody) return;

  const { ts, level, source, msg, data } = entry;
  const row = document.createElement('div');
  row.className = `log-row log-level-${level}`;

  const timeEl = document.createElement('div');
  timeEl.className = 'log-time';
  timeEl.textContent = tsString(ts);
  row.appendChild(timeEl);

  const levelEl = document.createElement('div');
  levelEl.textContent = level;
  row.appendChild(levelEl);

  const sourceEl = document.createElement('div');
  sourceEl.className = 'log-source';
  sourceEl.textContent = source;
  row.appendChild(sourceEl);

  const messageEl = document.createElement('div');
  messageEl.className = 'log-msg';
  const baseMsg = typeof msg === 'string' ? msg : (() => { try { return JSON.stringify(msg); } catch { return String(msg); } })();
  const extra = data != null ? (() => { try { return ` ${JSON.stringify(data)}`; } catch { return ` ${String(data)}`; } })() : '';
  messageEl.textContent = `${baseMsg}${extra}`;
  row.appendChild(messageEl);

  loggerBody.appendChild(row);
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_MAX) {
    logBuffer.shift();
    if (loggerBody.firstChild) {
      loggerBody.removeChild(loggerBody.firstChild);
    }
  }

  if (!chkAutoscroll || chkAutoscroll.checked) {
    loggerBody.scrollTop = loggerBody.scrollHeight;
  }

  if (loggerCountEl) {
    loggerCountEl.textContent = `${logBuffer.length} entries`;
  }
}

if (logAPI && typeof logAPI.onAppend === 'function') {
  logAPI.onAppend((payload) => appendLog(payload));
}

btnLogClear?.addEventListener('click', () => {
  if (!loggerBody) return;
  loggerBody.innerHTML = '';
  logBuffer.length = 0;
  if (loggerCountEl) {
    loggerCountEl.textContent = '0 entries';
  }
});

btnLogDownload?.addEventListener('click', () => {
  if (!logBuffer.length) return;
  const lines = logBuffer.map((entry) => {
    const { ts, source, level, msg, data } = entry;
    const baseMsg = typeof msg === 'string' ? msg : (() => { try { return JSON.stringify(msg); } catch { return String(msg); } })();
    const extra = data != null ? (() => { try { return ` ${JSON.stringify(data)}`; } catch { return ` ${String(data)}`; } })() : '';
    return `${new Date(ts).toISOString()} [${source}/${level}] ${baseMsg}${extra}`;
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `bf-presenter-log-${Date.now()}.log`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
});

chkAutoscroll?.addEventListener('change', () => {
  if (chkAutoscroll.checked && loggerBody) {
    loggerBody.scrollTop = loggerBody.scrollHeight;
  }
});

btnLogToggle?.addEventListener('click', () => {
  if (!loggerCard) return;
  const collapsed = loggerCard.classList.toggle('collapsed');
  btnLogToggle.textContent = collapsed ? 'Expand' : 'Collapse';
});

function classify(path) {
  const ext = path.split('.').pop().toLowerCase();
  if (['mp4', 'mov', 'webm'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image';
  return 'unknown';
}

function createId() {
  return `media-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function addPathsToMedia(paths = []) {
  const items = paths
    .filter(Boolean)
    .map((path) => ({
      id: createId(),
      path,
      type: classify(path),
      name: path.split(/[\\/]/).pop() || path,
      displayImage: null
    }))
    .filter((item) => item.type !== 'unknown');

  if (!items.length) return;

  media = media.concat(items);
  renderMediaGrid();
}

function getThumbSrcForItem(item) {
  if (!item) return '';
  if (item.displayImage && item.type === 'audio') {
    return fileUrl(item.displayImage);
  }
  if (item.type === 'image') {
    return fileUrl(item.path);
  }
  if (item.type === 'video') {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="6" fill="#191919"/><rect x="8" y="16" width="24" height="16" rx="2" fill="#6ec1ff"/><path d="M32 20l8-4v16l-8-4z" fill="#9be7ff"/><circle cx="14" cy="21" r="1.5" fill="#191919"/><circle cx="19" cy="21" r="1.5" fill="#191919"/></svg>');
  }
  if (item.type === 'audio') {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="6" fill="#191919"/><path d="M30 10v2c3.3 0 6 2.7 6 6s-2.7 6-6 6v2c4.4 0 8-3.6 8-8s-3.6-8-8-8z" fill="#9be7ff"/><path d="M30 16v2c1.1 0 2 0.9 2 2s-0.9 2-2 2v2c2.2 0 4-1.8 4-4s-1.8-4-4-4z" fill="#9be7ff"/><path d="M26 14v20l-8-6h-6v-8h6z" fill="#6ec1ff"/></svg>');
  }
  return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="6" fill="#191919"/><circle cx="16" cy="16" r="6" fill="#9be7ff"/><path d="M8 38l10-12 8 9 6-8 8 11H8z" fill="#6ec1ff"/></svg>');
}

function updateThumbnailWithDisplayImage(item) {
  if (!item) return;
  const thumb = grid?.querySelector(`[data-id="${item.id}"] img`);
  if (thumb) {
    thumb.src = getThumbSrcForItem(item);
  }
}

function buildThumb(item, { interactive = true } = {}) {
  const container = document.createElement('div');
  const classes = ['thumb'];
  container.className = classes.join(' ');
  container.dataset.id = item.id;

  if (interactive) {
    container.draggable = true;
    container.classList.add('media-thumb');
  }

  const img = document.createElement('img');
  img.src = getThumbSrcForItem(item);
  container.appendChild(img);

  // Stage more overlay
  const overlay = document.createElement('div');
  overlay.className = 'stage-overlay';
  const stageChk = document.createElement('input');
  stageChk.type = 'checkbox';
  stageChk.checked = stageMoreIncluded(item.id);
  const indexPill = document.createElement('span');
  indexPill.className = 'stage-index';
  const pos = stageMoreIndexOf(item.id);
  indexPill.textContent = pos === -1 ? '-' : String(pos + 1);
  overlay.appendChild(stageChk);
  overlay.appendChild(indexPill);
  container.appendChild(overlay);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = item.name;
  const badge = document.createElement('span');
  badge.className = `badge ${item.type}`;
  badge.textContent = item.type.toUpperCase();
  meta.appendChild(name);
  meta.appendChild(badge);
  container.appendChild(meta);

  if (interactive && selectedMediaIds.has(item.id)) {
    container.classList.add('selected');
  }

  if (item.id === previewId) {
    container.classList.add('previewing');
  }
  if (item.id === nextUpId) {
    container.classList.add('staged');
  }
  if (item.id === programId) {
    container.classList.add('program');
  }

  if (interactive) {
    // Handle Stage more checkbox
    stageChk.addEventListener('change', () => {
      if (stageChk.checked) {
        addToStageMore(item.id);
      } else {
        removeFromStageMore(item.id);
      }
      renderMediaGrid();
    });

    container.addEventListener('click', (event) => {
      const multi = event.ctrlKey || event.metaKey;
      let shouldSelect = true;
      if (!multi) {
        document.querySelectorAll('.media-thumb.selected').forEach((el) => {
          if (el !== container) {
            el.classList.remove('selected');
          }
        });
        if (selectedMediaIds.has(item.id)) {
          shouldSelect = false;
        }
        selectedMediaIds.clear();
      }

      if (multi && selectedMediaIds.has(item.id)) {
        selectedMediaIds.delete(item.id);
        container.classList.remove('selected');
      } else if (shouldSelect) {
        selectedMediaIds.add(item.id);
        container.classList.add('selected');
      } else {
        container.classList.remove('selected');
      }

      // stageNext(item.id);
    });

    container.addEventListener('dblclick', () => {
      selectedMediaIds.clear();
      selectedMediaIds.add(item.id);
      // previewItem(item.id);
    });

    container.addEventListener('dragstart', (e) => {
      draggingId = item.id;
      container.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try {
        e.dataTransfer.setData('application/x-bfp-id', item.id);
      } catch {}
      e.dataTransfer.setData('text/plain', `id:${item.id}`);
    });

    container.addEventListener('dragend', () => {
      draggingId = null;
      container.classList.remove('dragging', 'drop-before', 'drop-after');
    });

    container.addEventListener('dragover', (e) => {
      if (!draggingId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const rect = container.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const isBefore = e.clientX < midX;

      container.classList.toggle('drop-before', isBefore);
      container.classList.toggle('drop-after', !isBefore);
    });

    container.addEventListener('dragleave', () => {
      container.classList.remove('drop-before', 'drop-after');
    });

    container.addEventListener('drop', (e) => {
      if (!draggingId) return;
      e.preventDefault();

      const targetId = item.id;
      if (targetId === draggingId) {
        container.classList.remove('drop-before', 'drop-after');
        return;
      }

      const rect = container.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const dropBefore = e.clientX < midX;

      const fromIdx = indexById(media, draggingId);
      const targetIdx = indexById(media, targetId);
      if (fromIdx === -1 || targetIdx === -1) {
        container.classList.remove('drop-before', 'drop-after');
        return;
      }

      let toIdx = dropBefore ? targetIdx : targetIdx + 1;

      if (fromIdx < targetIdx) {
        toIdx -= 1;
      }

      toIdx = Math.max(0, toIdx);

      media = moveInArray(media, fromIdx, toIdx);

      renderMediaGrid();
    });
  } else {
    container.classList.add('readonly');
  }

  return container;
}

function getDraggedMediaIdFromEvent(e) {
  let id = null;
  try {
    id = e.dataTransfer.getData('application/x-bfp-id');
  } catch {}
  if (!id) {
    const t = e.dataTransfer.getData('text/plain') || '';
    if (t.startsWith('id:')) id = t.slice(3);
  }
  return id || null;
}

function renderMediaGrid() {
  if (!grid) return;
  grid.innerHTML = '';

  if (!media.length) {
    selectedMediaIds.clear();
    const empty = document.createElement('div');
    empty.className = 'nextup-placeholder';
    empty.style.gridColumn = '1 / -1';
    empty.textContent = 'Drop files here or use Add Media to build your playlist.';
    grid.appendChild(empty);
    return;
  }

  media.forEach((item) => {
    const thumb = buildThumb(item);
    grid.appendChild(thumb);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Delete') {
    const selectedEls = document.querySelectorAll('.media-thumb.selected');
    if (!selectedEls.length) return;

    let removedAny = false;
    selectedEls.forEach((el) => {
      const id = el.dataset.id;
      if (!id) return;
      const idx = media.findIndex((m) => m.id === id);
      if (idx !== -1) {
        if (previewId === id) {
          previewId = null;
          renderPreview(null);
        }
        if (nextUpId === id) {
          nextUpId = null;
          renderNextUp(null);
        }
        selectedMediaIds.delete(id);
        media.splice(idx, 1);
        removedAny = true;
      }
    });

    if (removedAny) {
      renderMediaGrid();
      console.log('CONTROL: deleted media items via keyboard');
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    clearPreview();
  }
});

function renderNextUp(item) {
  if (!nextUpArea) return;
  nextUpArea.innerHTML = '';

  if (!item) {
    nextUpArea.innerHTML = NEXTUP_PLACEHOLDER;
    if (btnSetImage) {
      btnSetImage.style.display = 'none';
    }
    return;
  }

  const thumb = buildThumb(item, { interactive: false });
  nextUpArea.appendChild(thumb);
  if (btnSetImage) {
    btnSetImage.style.display = item.type === 'audio' ? 'inline-flex' : 'none';
  }
}

function renderPreview(item) {
  if (!previewArea) return;
  previewArea.innerHTML = '';
  if (!item) return;

  if (item.type === 'image') {
    const img = document.createElement('img');
    img.className = 'visual preview-media';
    img.src = fileUrl(item.path);
    previewArea.appendChild(img);
  } else if (item.type === 'audio') {
    if (item.displayImage) {
      const img = document.createElement('img');
      img.className = 'visual preview-media';
      img.src = fileUrl(item.displayImage);
      previewArea.appendChild(img);
    }
    const audio = document.createElement('audio');
    audio.className = 'preview-audio';
    audio.controls = true;
    audio.src = fileUrl(item.path);
    audio.muted = true;
    audio.volume = 0;
    audio.setAttribute('muted', '');
    audio.addEventListener('loadedmetadata', () => {
      audio.muted = true;
      audio.volume = 0;
    });
    previewArea.appendChild(audio);
  } else {
    const video = document.createElement('video');
    video.className = 'visual preview-media';
    video.controls = true;
    video.playsInline = true;
    video.src = fileUrl(item.path);
    video.muted = true;
    video.volume = 0;
    video.setAttribute('muted', '');
    video.addEventListener('loadedmetadata', () => {
      video.muted = true;
      video.volume = 0;
    });
    previewArea.appendChild(video);
  }
}

function clearPreview() {
  previewId = null;
  renderPreview(null);
  renderMediaGrid();
  console.log('CONTROL: preview cleared');
}

function stageNext(id) {
  const item = media.find((entry) => entry.id === id) ?? null;
  nextUpId = item ? item.id : null;
  renderNextUp(item);
  renderMediaGrid();
}

function previewItem(id) {
  if (!id) {
    previewId = null;
    renderPreview(null);
    renderMediaGrid();
    return;
  }
  const idx = media.findIndex((entry) => entry.id === id);
  if (idx < 0) return;
  previewId = id;
  renderPreview(media[idx]);
  renderMediaGrid();
}

function pushToProgram(item) {
  if (!item) return false;
  if (!window.presenterAPI?.showOnProgram) return false;

  programId = item.id;
  index = media.findIndex((entry) => entry.id === item.id);
  window.presenterAPI.showOnProgram({
    path: item.path,
    type: item.type,
    displayImage: item.displayImage || null
  });
  window.presenterAPI.play?.();
  updatePlayToggleUI(true);
  renderMediaGrid();
  return true;
}

function pushAtomicFromPreviewAndBackfill() {
  let didPush = false;
  let gridDirty = false;

  if (previewId) {
    const item = media.find((m) => m.id === previewId) ?? null;
    if (item) {
      didPush = pushToProgram(item);
      if (didPush) {
        console.log('CONTROL: Auto-pushed Preview to Program', item.name);
      }
    }
    previewId = null;
    renderPreview(null);
    gridDirty = true;
  } else if (nextUpId) {
    const item = media.find((m) => m.id === nextUpId) ?? null;
    if (item) {
      didPush = pushToProgram(item);
      if (didPush) {
        console.log('CONTROL: Promoted Next Up directly to Program', item.name);
      }
    }
    nextUpId = null;
    renderNextUp(null);
    gridDirty = true;
  }

  if (!previewId && nextUpId) {
    const nextItem = media.find((m) => m.id === nextUpId) ?? null;
    if (nextItem) {
      previewId = nextUpId;
      renderPreview(nextItem);
      nextUpId = null;
      renderNextUp(null);
      gridDirty = true;
      console.log('CONTROL: Auto-pulled Next Up into Preview', nextItem.name);
    }
  }

  if (gridDirty) {
    renderMediaGrid();
  }

  return didPush;
}

if (btnPush) {
  btnPush.onclick = () => {
    const pushed = pushAtomicFromPreviewAndBackfill();
    if (pushed) {
      backfillNextUpFromStageMore();
    }
  };
}

if (btnSetImage) {
  btnSetImage.onclick = async () => {
    if (!nextUpId) return;
    const item = media.find((m) => m.id === nextUpId);
    if (!item || item.type !== 'audio') return;
    if (typeof window.presenterAPI?.pickImage !== 'function') return;

    try {
      const imgPath = await window.presenterAPI.pickImage();
      if (!imgPath) return;

      item.displayImage = imgPath;
      updateThumbnailWithDisplayImage(item);
      renderNextUp(item);
      if (previewId === item.id) {
        renderPreview(item);
      }
      console.log('Attached display image', imgPath, 'to', item.name);
    } catch (err) {
      console.error('Set Display Image failed:', err);
    }
  };
}


btnClearNext?.addEventListener('click', () => {
  nextUpId = null;
  renderNextUp(null);
  renderMediaGrid();
  backfillNextUpFromStageMore();
});

btnClearPreview?.addEventListener('click', clearPreview);

btnBlankToggle.onclick = () => {
  if (isProgramBlanked) {
    window.presenterAPI.unblack();
    isProgramBlanked = false;
    btnBlankToggle.textContent = 'Blank';
  } else {
    window.presenterAPI.black();
    isProgramBlanked = true;
    btnBlankToggle.textContent = 'Unblank';
  }
};

btnBackground.onclick = async () => {
  try {
    const imgPath = await window.presenterAPI.pickImage();
    if (!imgPath) return; // user cancelled
    window.presenterAPI.setBackground(imgPath);
    updateBackgroundButtonUI(imgPath);
  } catch (e) {
    console.error('Background picker failed', e);
  }
};

btnPlay?.addEventListener('click', () => {
  if (!window.presenterAPI) return;
  if (isProgramPlaying) {
    window.presenterAPI.pause?.();
    updatePlayToggleUI(false);
  } else {
    window.presenterAPI.play?.();
    updatePlayToggleUI(true);
  }
});

if (btnStop) {
  btnStop.onclick = () => {
    window.presenterAPI.pause?.();
    window.presenterAPI.unblack?.();
    isProgramBlanked = false;
    if (btnBlankToggle) {
      btnBlankToggle.textContent = 'Blank';
    }
    window.presenterAPI.showBackground?.();
    updatePlayToggleUI(false);
    programId = null;
    index = -1;
    renderMediaGrid();
    console.log('CONTROL: Background button invoked — paused and faded to background/black');
  };
}

btnNext?.addEventListener('click', () => window.presenterAPI?.next?.());
btnPrev?.addEventListener('click', () => window.presenterAPI?.prev?.());

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.multiple = true;
fileInput.accept = '.mp4,.mov,.webm,.mp3,.wav,.m4a,.jpg,.jpeg,.png';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);
fileInput.addEventListener('change', () => {
  const paths = Array.from(fileInput.files || []).map((file) => file.path).filter(Boolean);
  addPathsToMedia(paths);
  fileInput.value = '';
});

if (btnAdd) {
  btnAdd.onclick = async () => {
    if (window.presenterAPI?.pickMedia) {
      try {
        const files = await window.presenterAPI.pickMedia();
        if (files?.length) {
          addPathsToMedia(files);
          return;
        }
      } catch (err) {
        console.error('pickMedia failed', err);
      }
    }
    fileInput.click();
  };
}

btnStageMoreToggle?.addEventListener('click', () => {
  stageMoreEnabled = !stageMoreEnabled;
  stageMoreOrder = []; // Reset order when toggling stage mode
  stageMoreCursor = 0; // Reset counter when toggling stage mode
  saveStageMoreState();
  applyStageMoreUI();
});

btnViewToggle?.addEventListener('click', () => {
  isListView = !isListView;
  try { localStorage.setItem('viewMode', isListView ? 'list' : 'grid'); } catch {}
  applyViewMode();
});

grid?.addEventListener('click', () => {
  // absorb stray clicks so the grid keeps focus when empty
});

function setupDisplayScrubber() {
  if (!displayScrubber) return;

  const updateFromPercent = () => {
    const percent = parseFloat(displayScrubber.value) || 0;
    const ratio = Math.max(0, Math.min(percent / 100, 1));
    if (displayDuration > 0) {
      displayCurrentTime = displayDuration * ratio;
    }
    updateDisplayUI();
  };

  displayScrubber.addEventListener('input', () => {
    isDisplayScrubbing = true;
    updateFromPercent();
  });

  displayScrubber.addEventListener('change', () => {
    updateFromPercent();
    isDisplayScrubbing = false;

    if (window.presenterAPI?.send) {
      console.log('[CONTROL] display:seek sending time', displayCurrentTime, 'duration', displayDuration);
      window.presenterAPI.send('display:seek', { time: displayCurrentTime });
    }
  });
}

function setupDropTarget(target, onDrop) {
  if (!target) return;

  target.addEventListener('dragover', (event) => {
    event.preventDefault();
    target.classList.add('droppable');
  });

  target.addEventListener('dragleave', () => {
    target.classList.remove('droppable');
  });

  target.addEventListener('drop', (event) => {
    event.preventDefault();
    target.classList.remove('droppable');
    const paths = Array.from(event.dataTransfer?.files || []).map((file) => file.path).filter(Boolean);
    if (!paths.length) return;
    onDrop(paths);
  });
}

setupDropTarget(grid, (paths) => {
  addPathsToMedia(paths);
});

setupDropTarget(leftPanel, (paths) => {
  addPathsToMedia(paths);
});

setupDisplayScrubber();
updateDisplayUI();

if (previewArea) {
  previewArea.addEventListener('dragover', (e) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    previewArea.classList.add('droptarget');
  });

  previewArea.addEventListener('dragleave', () => {
    previewArea.classList.remove('droptarget');
  });

  previewArea.addEventListener('drop', (e) => {
    e.preventDefault();
    previewArea.classList.remove('droptarget');

    const draggedId = getDraggedMediaIdFromEvent(e);
    if (draggedId) {
      const item = media.find((m) => m.id === draggedId);
      if (item) {
        previewId = draggedId;
        renderPreview(item);
        renderMediaGrid();
      }
      return;
    }

    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) {
      const paths = files.map((file) => file.path).filter(Boolean);
      if (!paths.length) return;
      const before = media.length;
      addPathsToMedia(paths);
      const firstNew = media[before];
      if (firstNew) {
        previewId = firstNew.id;
        renderPreview(firstNew);
        renderMediaGrid();
      }
    }
  });
}

if (nextUpArea) {
  nextUpArea.addEventListener('dragover', (e) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    nextUpArea.classList.add('droptarget');
  });

  nextUpArea.addEventListener('dragleave', () => {
    nextUpArea.classList.remove('droptarget');
  });

  nextUpArea.addEventListener('drop', (e) => {
    e.preventDefault();
    nextUpArea.classList.remove('droptarget');

    const draggedId = getDraggedMediaIdFromEvent(e);
    if (draggedId) {
      const item = media.find((m) => m.id === draggedId);
      if (item) {
        nextUpId = draggedId;
        renderNextUp(item);
        renderMediaGrid();
      }
      return;
    }

    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) {
      const paths = files.map((file) => file.path).filter(Boolean);
      if (!paths.length) return;
      const before = media.length;
      addPathsToMedia(paths);
      const firstNew = media[before];
      if (firstNew) {
        nextUpId = firstNew.id;
        renderNextUp(firstNew);
        renderMediaGrid();
      }
    }
  });
}

window.presenterAPI?.onProgramEvent?.('display:playback-progress', (payload) => {
  if (!payload || typeof payload.currentTime !== 'number' || typeof payload.duration !== 'number') return;

  const dur = Math.max(0, payload.duration);
  if (dur > 0) {
    displayDuration = dur;
  }

  if (!isDisplayScrubbing) {
    displayCurrentTime = Math.max(0, payload.currentTime);
    updateDisplayUI();
  }

  console.log('[CONTROL] playback-progress', payload, 'scrubbing?', isDisplayScrubbing);
});

window.presenterAPI?.onProgramEvent?.('display:ended', () => {
  console.log('CONTROL: Display finished playback');
  displayCurrentTime = 0;
  displayDuration = 0;
  updateDisplayUI();

  if (autoPlayEnabled) {
    console.log('CONTROL: Auto-play enabled, advancing media');
    const pushed = pushAtomicFromPreviewAndBackfill();
    
    if (pushed) {
      backfillNextUpFromStageMore();
    }

    if (!pushed) {
      updatePlayToggleUI(false);
      programId = null;
      index = -1;
      renderMediaGrid();
    }

    if (!previewId && !nextUpId) {
      console.log('CONTROL: No Preview or Next Up — show fallback background');
    }
  } else {
    console.log('CONTROL: Auto-play disabled, reverting to background');
    updatePlayToggleUI(false);
    programId = null;
    index = -1;
    renderMediaGrid();
  }
});

// Keep the control UI in sync with the current background image
window.presenterAPI?.onProgramEvent?.('display:set-background', (absPath) => {
  updateBackgroundButtonUI(absPath || null);
});

// Request current background on load so the button shows the preview
try { window.presenterAPI?.send?.('display:get-background'); } catch {}

renderNextUp(null);
renderMediaGrid();
