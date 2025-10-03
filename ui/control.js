const btnAdd = document.getElementById('btnAdd');
const btnPlay = document.getElementById('btnPlay');
const btnPause = document.getElementById('btnPause');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnBlack = document.getElementById('btnBlack');
const btnUnblack = document.getElementById('btnUnblack');
const list = document.getElementById('playlist');
const previewArea = document.getElementById('previewArea');
const status = document.getElementById('status');
const mainEl = document.querySelector('main');

let playlist = []; // [{ path, type: 'video'|'audio'|'image', name }]
let index = -1;

function setStatus(message, isError = false) {
  if (!status) return;
  status.textContent = message || '';
  status.classList.toggle('error', Boolean(isError));
  if (message) {
    const logger = isError ? console.error : console.log;
    logger(`[status] ${message}`);
  }
}

function classify(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  if (['mp4', 'mov', 'webm'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image';
  return 'unknown';
}

function buildItem(filePath) {
  const type = classify(filePath);
  if (type === 'unknown') return null;
  const name = filePath.split(/[\\/]/).pop() || filePath;
  return { path: filePath, type, name };
}

function renderList() {
  list.innerHTML = '';
  playlist.forEach((item, i) => {
    const li = document.createElement('li');
    li.textContent = `${i === index ? '▶ ' : ''}${item.name}`;
    li.addEventListener('click', () => {
      index = i;
      cue(index);
    });
    li.addEventListener('dblclick', () => {
      index = i;
      cue(index);
      play();
    });
    list.appendChild(li);
  });
}

function addPreviewElement(el, item) {
  el.addEventListener('error', () => {
    setStatus(`Failed to preview ${item.name}`, true);
  });
  previewArea.innerHTML = '';
  previewArea.appendChild(el);
}

function cue(i) {
  const item = playlist[i];
  if (!item) return;

  try {
    const url = window.presenterAPI.toFileURL(item.path);
    let element;
    if (item.type === 'image') {
      element = new Image();
      element.src = url;
    } else if (item.type === 'audio') {
      element = document.createElement('audio');
      element.src = url;
      element.controls = true;
      element.preload = 'metadata';
    } else if (item.type === 'video') {
      element = document.createElement('video');
      element.src = url;
      element.controls = true;
      element.preload = 'metadata';
      element.playsInline = true;
      element.addEventListener('loadeddata', () => {
        try { element.pause(); element.currentTime = 0; } catch (err) { console.warn('Preview pause failed', err); }
      });
    }

    if (element) addPreviewElement(element, item);
    setStatus(`Cued ${item.name}`);
    window.presenterAPI.showOnProgram({ path: item.path, type: item.type, name: item.name });
    renderList();
  } catch (err) {
    console.error('Cue failed', err);
    setStatus(`Failed to cue ${item?.name || 'item'}`, true);
  }
}

function ensureCurrent() {
  if (index === -1 && playlist.length) {
    index = 0;
    cue(index);
  }
}

function addPathsToPlaylist(paths) {
  const items = paths
    .map(buildItem)
    .filter(Boolean);

  if (!items.length) {
    setStatus('No supported media files found.', true);
    return;
  }

  playlist = playlist.concat(items);
  ensureCurrent();
  renderList();
  setStatus(`Added ${items.length} item${items.length === 1 ? '' : 's'} to playlist.`);
}

function play() {
  if (index < 0 || !playlist[index]) {
    setStatus('Nothing cued to play.', true);
    return;
  }
  window.presenterAPI.play();
}

function pause() {
  window.presenterAPI.pause();
}

function next(auto = false) {
  if (index < playlist.length - 1) {
    index += 1;
    cue(index);
    play();
  } else if (!auto) {
    setStatus('Reached end of playlist.', true);
  }
}

function prev() {
  if (index > 0) {
    index -= 1;
    cue(index);
    play();
  }
}

btnAdd.addEventListener('click', async () => {
  try {
    const files = await window.presenterAPI.pickMedia();
    if (!files || !files.length) {
      setStatus('No files selected.');
      return;
    }
    addPathsToPlaylist(files);
  } catch (err) {
    console.error('Add media failed', err);
    setStatus('Unable to add media.', true);
  }
});

btnPlay.addEventListener('click', () => play());
btnPause.addEventListener('click', () => pause());
btnNext.addEventListener('click', () => next());
btnPrev.addEventListener('click', () => prev());
btnBlack.addEventListener('click', () => window.presenterAPI.black());
btnUnblack.addEventListener('click', () => window.presenterAPI.unblack());

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); play(); }
  if (e.code === 'ArrowRight') next();
  if (e.code === 'ArrowLeft') prev();
  if (e.key && e.key.toLowerCase() === 'b') window.presenterAPI.black();
  if (e.key && e.key.toLowerCase() === 'u') window.presenterAPI.unblack();
});

const droppableAreas = [mainEl, list].filter(Boolean);
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
    if (!files.length) {
      setStatus('No files detected from drop.', true);
      return;
    }
    addPathsToPlaylist(files);
  });
});

window.presenterAPI.onProgramEvent('display:ended', () => {
  next(true);
});

window.presenterAPI.onProgramEvent('display:error', (payload = {}) => {
  const { message, item } = payload;
  const label = item?.name ? `: ${item.name}` : '';
  setStatus(`Program error${label ? label : ''}${message ? ` – ${message}` : ''}`, true);
});

setStatus('Drop files or use Add Media to build your playlist.');
