const btnAdd = document.getElementById('btnAdd');
const btnPush = document.getElementById('btnPush');
const btnPlay = document.getElementById('btnPlay');
const btnPause = document.getElementById('btnPause');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnBlack = document.getElementById('btnBlack');
const btnUnblack = document.getElementById('btnUnblack');
const btnPlayNext = document.getElementById('btnPlayNext');
const btnClearNext = document.getElementById('btnClearNext');
const btnSetImage = document.getElementById('btnSetImage');

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
let nextUpId = null;
let index = -1;
const logBuffer = [];

function fileUrl(p) {
  return window.presenterAPI && typeof window.presenterAPI.toFileURL === 'function'
    ? window.presenterAPI.toFileURL(p)
    : `file://${p}`;
}

function pad2(n) {
  return n.toString().padStart(2, '0');
}

function tsString(ts) {
  const d = new Date(ts);
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${ms}`;
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

  if (!nextUpId && media.length) {
    stageNext(media[0].id);
  }
}

function buildThumb(item, { interactive = true } = {}) {
  const container = document.createElement('div');
  container.className = 'thumb';
  container.dataset.id = item.id;

  const img = document.createElement('img');
  if (item.type === 'image') {
    img.src = fileUrl(item.path);
  } else if (item.type === 'audio' && item.displayImage) {
    img.src = fileUrl(item.displayImage);
  } else if (item.type === 'video') {
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="6" fill="#191919"/><polygon points="20,16 34,24 20,32" fill="#6ec1ff"/></svg>');
  } else {
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="6" fill="#191919"/><circle cx="16" cy="16" r="6" fill="#9be7ff"/><path d="M8 38l10-12 8 9 6-8 8 11H8z" fill="#6ec1ff"/></svg>');
  }
  container.appendChild(img);

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

  if (item.id === previewId) {
    container.classList.add('previewing');
  }
  if (item.id === nextUpId) {
    container.classList.add('staged');
  }

  if (interactive) {
    container.addEventListener('click', () => {
      stageNext(item.id);
    });

    container.addEventListener('dblclick', () => {
      previewItem(item.id);
      pushToProgram();
    });
  } else {
    container.classList.add('readonly');
  }

  return container;
}

function renderMediaGrid() {
  if (!grid) return;
  grid.innerHTML = '';

  if (!media.length) {
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
    img.src = fileUrl(item.path);
    previewArea.appendChild(img);
  } else if (item.type === 'audio') {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = fileUrl(item.path);
    previewArea.appendChild(audio);
  } else {
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.src = fileUrl(item.path);
    previewArea.appendChild(video);
  }
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

function pushToProgram() {
  if (!previewId) return;
  const item = media.find((entry) => entry.id === previewId);
  if (!item) return;
  index = media.findIndex((entry) => entry.id === previewId);
  window.presenterAPI.showOnProgram({
    path: item.path,
    type: item.type,
    displayImage: item.displayImage || null
  });
  window.presenterAPI.play();
}

btnPush?.addEventListener('click', () => {
  pushToProgram();
});

btnPlayNext?.addEventListener('click', () => {
  if (!nextUpId) return;
  previewItem(nextUpId);
  pushToProgram();
});

btnClearNext?.addEventListener('click', () => {
  nextUpId = null;
  renderNextUp(null);
  renderMediaGrid();
});

btnPlay?.addEventListener('click', () => window.presenterAPI?.play?.());
btnPause?.addEventListener('click', () => window.presenterAPI?.pause?.());
btnNext?.addEventListener('click', () => window.presenterAPI?.next?.());
btnPrev?.addEventListener('click', () => window.presenterAPI?.prev?.());
btnBlack?.addEventListener('click', () => window.presenterAPI?.black?.());
btnUnblack?.addEventListener('click', () => window.presenterAPI?.unblack?.());

btnSetImage?.addEventListener('click', async () => {
  if (!nextUpId) return;
  const target = media.find((entry) => entry.id === nextUpId);
  if (!target) return;
  if (!window.presenterAPI?.pickImage) return;
  try {
    const result = await window.presenterAPI.pickImage();
    if (result) {
      target.displayImage = result;
      renderNextUp(target);
      renderMediaGrid();
    }
  } catch (err) {
    console.error('Failed to pick display image', err);
  }
});

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

grid?.addEventListener('click', () => {
  // absorb stray clicks so the grid keeps focus when empty
});

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

setupDropTarget(previewArea, (paths) => {
  const before = media.length;
  addPathsToMedia(paths);
  const first = media[before];
  if (first) {
    previewItem(first.id);
  }
});

setupDropTarget(nextUpArea, (paths) => {
  const before = media.length;
  addPathsToMedia(paths);
  const first = media[before];
  if (first) {
    stageNext(first.id);
  }
});

window.presenterAPI?.onProgramEvent?.('display:ended', () => {
  if (!media.length) return;
  const currentIndex = media.findIndex((item) => item.id === previewId);
  if (currentIndex >= 0 && currentIndex + 1 < media.length) {
    const nextItem = media[currentIndex + 1];
    stageNext(nextItem.id);
    previewItem(nextItem.id);
  }
});

renderNextUp(null);
renderMediaGrid();
