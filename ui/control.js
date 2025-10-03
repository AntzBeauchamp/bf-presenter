const btnAdd = document.getElementById('btnAdd');
const btnPlay = document.getElementById('btnPlay');
const btnPause = document.getElementById('btnPause');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnBlack = document.getElementById('btnBlack');
const btnUnblack = document.getElementById('btnUnblack');
const btnPlayNext = document.getElementById('btnPlayNext');
const btnClearNext = document.getElementById('btnClearNext');
const btnPush = document.getElementById('btnPush');
const btnSetImage = document.getElementById('btnSetImage');

const grid = document.getElementById('thumbGrid');
const previewArea = document.getElementById('previewArea');
const nextUpArea = document.getElementById('nextUpArea');
const leftPanel = document.querySelector('.left-panel');

let media = [];
let index = -1;
let previewId = null;
let nextUpId = null;

const NEXTUP_PLACEHOLDER_HTML = '<div class="nextup-placeholder">Click a thumbnail to stage it here.</div>';

function classify(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  if (['mp4', 'mov', 'webm'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image';
  return 'unknown';
}

function toFileURL(p) {
  try {
    return window.presenterAPI?.toFileURL(p) ?? `file://${p}`;
  } catch (err) {
    console.warn('Failed to convert to file URL', err);
    return `file://${p}`;
  }
}

function iconDataURI(kind) {
  const svgs = {
    video: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" fill="#000"/><polygon points="18,14 36,24 18,34" fill="#9bd"/></svg>',
    audio: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" fill="#000"/><path d="M22 14v20a6 6 0 1 1-4-5.66V14h4zM30 19v10a4 4 0 1 0 4 0V19h-4z" fill="#e9b"/></svg>',
    image: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" fill="#000"/><circle cx="14" cy="16" r="4" fill="#9f9"/><path d="M6 36l10-12 8 9 6-7 12 10H6z" fill="#9f9"/></svg>'
  };
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svgs[kind] || svgs.image);
}

function buildThumb(item, { interactive = true } = {}) {
  const div = document.createElement('div');
  div.className = 'thumb';
  div.dataset.id = item.id;

  const img = document.createElement('img');
  if (item.type === 'image') {
    img.src = toFileURL(item.path);
  } else if (item.type === 'audio' && item.displayImage) {
    img.src = toFileURL(item.displayImage);
  } else if (item.type === 'video') {
    img.src = iconDataURI('video');
  } else if (item.type === 'audio') {
    img.src = iconDataURI('audio');
  } else {
    img.src = iconDataURI('image');
  }
  div.appendChild(img);

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
  div.appendChild(meta);

  if (interactive) {
    div.addEventListener('click', (event) => {
      event.preventDefault();
      stageNext(item.id);
    });
    div.addEventListener('dblclick', (event) => {
      event.preventDefault();
      const i = media.findIndex((m) => m.id === item.id);
      if (i >= 0) {
        cue(i);
        pushToProgram();
      }
    });
  } else {
    div.classList.add('readonly');
  }

  return div;
}

function renderGrid() {
  if (!grid) return;
  grid.innerHTML = '';

  if (!media.length) {
    const empty = document.createElement('div');
    empty.className = 'nextup-placeholder';
    empty.textContent = 'Drop files here or use Add Media to build your playlist.';
    empty.style.gridColumn = '1 / -1';
    grid.appendChild(empty);
    return;
  }

  media.forEach((item) => {
    const thumb = buildThumb(item);
    if (item.id === nextUpId) {
      thumb.classList.add('staged');
    }
    if (previewId === item.id) {
      thumb.classList.add('previewing');
    }
    if (index >= 0 && media[index] && media[index].id === item.id) {
      thumb.classList.add('selected');
    }
    grid.appendChild(thumb);
  });
}

function renderPreview(item) {
  if (!previewArea) return;
  previewArea.innerHTML = '';
  if (!item) return;

  if (item.type === 'image') {
    const img = document.createElement('img');
    img.src = toFileURL(item.path);
    previewArea.appendChild(img);
  } else if (item.type === 'audio') {
    const audio = document.createElement('audio');
    audio.src = toFileURL(item.path);
    audio.controls = true;
    previewArea.appendChild(audio);
  } else {
    const video = document.createElement('video');
    video.src = toFileURL(item.path);
    video.controls = true;
    video.playsInline = true;
    previewArea.appendChild(video);
  }
}

function setNextUpPlaceholder() {
  if (!nextUpArea) return;
  nextUpArea.innerHTML = NEXTUP_PLACEHOLDER_HTML;
  if (btnSetImage) {
    btnSetImage.style.display = 'none';
  }
}

function clearNextUp() {
  nextUpId = null;
  setNextUpPlaceholder();
  renderGrid();
}

function stageNext(id) {
  const item = media.find((m) => m.id === id);
  if (!item) {
    clearNextUp();
    return;
  }
  nextUpId = id;
  if (nextUpArea) {
    nextUpArea.innerHTML = '';
    const thumb = buildThumb(item, { interactive: false });
    thumb.classList.add('selected', 'staged');
    nextUpArea.appendChild(thumb);
  }
  if (btnSetImage) {
    btnSetImage.style.display = item.type === 'audio' ? 'inline-flex' : 'none';
  }
  renderGrid();
}

function cue(i) {
  const item = media[i];
  if (!item) return;

  if (nextUpId === item.id) {
    nextUpId = null;
    setNextUpPlaceholder();
  }

  previewId = item.id;
  renderPreview(item);
  renderGrid();
}

function pushToProgram() {
  if (!previewId) return;
  const item = media.find((m) => m.id === previewId);
  if (!item) return;
  index = media.findIndex((m) => m.id === previewId);
  if (index < 0) return;

  window.presenterAPI?.showOnProgram({
    path: item.path,
    type: item.type,
    displayImage: item.displayImage || null
  });

  if (nextUpId === item.id) {
    nextUpId = null;
    setNextUpPlaceholder();
  }

  play();
  renderGrid();
}

function play() {
  if (index < 0 || !media[index]) return;
  window.presenterAPI?.play();
}

function pause() {
  window.presenterAPI?.pause();
}

function next() {
  const targetIndex = index + 1;
  if (targetIndex < media.length) {
    cue(targetIndex);
    pushToProgram();
  }
}

function prev() {
  const targetIndex = index - 1;
  if (targetIndex >= 0) {
    cue(targetIndex);
    pushToProgram();
  }
}

btnPlayNext?.addEventListener('click', () => {
  if (!nextUpId) return;
  const i = media.findIndex((m) => m.id === nextUpId);
  if (i >= 0) {
    cue(i);
    pushToProgram();
  }
});

btnClearNext?.addEventListener('click', () => {
  clearNextUp();
});

btnPush?.addEventListener('click', () => {
  pushToProgram();
});

btnSetImage?.addEventListener('click', async () => {
  if (!nextUpId) return;
  const item = media.find((m) => m.id === nextUpId);
  if (!item || item.type !== 'audio') return;

  let imagePath = null;
  try {
    if (window.presenterAPI?.pickMedia) {
      const files = await window.presenterAPI.pickMedia({ imagesOnly: true });
      if (files && files.length) {
        [imagePath] = files;
      }
    }
  } catch (err) {
    console.error('Image picker failed, using fallback', err);
  }

  if (!imagePath) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.jpg,.jpeg,.png';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const selected = input.files && input.files[0];
      if (selected?.path) {
        item.displayImage = selected.path;
        stageNext(item.id);
      }
      input.remove();
    }, { once: true });
    input.addEventListener('cancel', () => {
      input.remove();
    }, { once: true });
    document.body.appendChild(input);
    input.click();
    return;
  }

  item.displayImage = imagePath;
  stageNext(item.id);
});

btnAdd?.addEventListener('click', async () => {
  try {
    if (window.presenterAPI?.pickMedia) {
      const files = await window.presenterAPI.pickMedia();
      if (files && files.length) {
        addPathsToMedia(files);
        return;
      }
    }
  } catch (err) {
    console.error('Add Media via IPC failed, using fallback:', err);
  }
  openFileFallback();
});

function openFileFallback() {
  fileInput.click();
}

btnPlay?.addEventListener('click', () => play());
btnPause?.addEventListener('click', () => pause());
btnNext?.addEventListener('click', () => next());
btnPrev?.addEventListener('click', () => prev());
btnBlack?.addEventListener('click', () => window.presenterAPI?.black());
btnUnblack?.addEventListener('click', () => window.presenterAPI?.unblack());

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); play(); }
  if (e.code === 'ArrowRight') next();
  if (e.code === 'ArrowLeft') prev();
  if (e.key && e.key.toLowerCase() === 'b') window.presenterAPI?.black();
  if (e.key && e.key.toLowerCase() === 'u') window.presenterAPI?.unblack();
});

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.multiple = true;
fileInput.accept = '.mp4,.mov,.webm,.mp3,.wav,.m4a,.jpg,.jpeg,.png';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);
fileInput.addEventListener('change', () => {
  const paths = [...fileInput.files].map((f) => f.path);
  addPathsToMedia(paths);
  fileInput.value = '';
});

function addPathsToMedia(paths = []) {
  const items = paths
    .map((p) => ({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      path: p,
      type: classify(p),
      name: p.split(/[\\/]/).pop() || p,
      displayImage: null
    }))
    .filter((item) => item.type !== 'unknown');

  if (!items.length) return;

  const hadPreview = Boolean(previewId);
  media = media.concat(items);

  if (!hadPreview && media.length) {
    cue(0);
  } else {
    renderGrid();
  }
}

const droppableAreas = [grid, previewArea, nextUpArea, leftPanel].filter(Boolean);
droppableAreas.forEach((el) => {
  el.addEventListener('dragover', (event) => {
    event.preventDefault();
  });
  el.addEventListener('dragenter', (event) => {
    event.preventDefault();
    el.classList.add('droppable');
  });
  el.addEventListener('dragleave', () => {
    el.classList.remove('droppable');
  });
  el.addEventListener('drop', (event) => {
    event.preventDefault();
    el.classList.remove('droppable');
    const files = [...event.dataTransfer.files].map((f) => f.path).filter(Boolean);
    if (!files.length) return;
    addPathsToMedia(files);
  });
});

window.presenterAPI?.onProgramEvent('display:ended', () => {
  next();
});

window.presenterAPI?.onProgramEvent('display:error', (payload = {}) => {
  const { message, item } = payload;
  console.error('Program error', message, item);
});

setNextUpPlaceholder();
renderGrid();
