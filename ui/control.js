const btnAdd = document.getElementById('btnAdd');
const btnPlay = document.getElementById('btnPlay');
const btnPause = document.getElementById('btnPause');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnBlack = document.getElementById('btnBlack');
const btnUnblack = document.getElementById('btnUnblack');
const list = document.getElementById('playlist');
const previewArea = document.getElementById('previewArea');

let playlist = [];   // [{ path, type: 'video'|'audio'|'image', name }]
let index = -1;

function classify(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  if (['mp4','mov','webm'].includes(ext)) return 'video';
  if (['mp3','wav','m4a'].includes(ext)) return 'audio';
  if (['jpg','jpeg','png'].includes(ext)) return 'image';
  return 'unknown';
}

function renderList() {
  list.innerHTML = '';
  playlist.forEach((item, i) => {
    const li = document.createElement('li');
    li.textContent = `${i === index ? '▶ ' : ''}${item.name}`;
    li.onclick = () => { index = i; cue(index); };
    list.appendChild(li);
  });
}

function cue(i) {
  const item = playlist[i];
  if (!item) return;
  // Preview on control screen
  previewArea.innerHTML = '';
  if (item.type === 'image') {
    const img = document.createElement('img');
    img.src = `file://${item.path}`;
    previewArea.appendChild(img);
  } else if (item.type === 'audio') {
    const a = document.createElement('audio'); a.src = `file://${item.path}`; a.controls = true;
    previewArea.appendChild(a);
  } else {
    const v = document.createElement('video'); v.src = `file://${item.path}`; v.controls = true;
    previewArea.appendChild(v);
  }
  // Send to Program screen (paused/cued)
  window.presenterAPI.showOnProgram({ path: item.path, type: item.type });
  renderList();
}

function play() { window.presenterAPI.play(); }
function pause() { window.presenterAPI.pause(); }
function next() { if (index < playlist.length - 1) { index++; cue(index); play(); } }
function prev() { if (index > 0) { index--; cue(index); play(); } }

btnAdd.onclick = async () => {
  const files = await window.presenterAPI.pickMedia();
  const items = files.map(p => ({ path: p, type: classify(p), name: p.split(/[\\/]/).pop() }))
                     .filter(it => it.type !== 'unknown');
  playlist = playlist.concat(items);
  if (index === -1 && playlist.length) { index = 0; cue(index); }
  renderList();
};

btnPlay.onclick = play;
btnPause.onclick = pause;
btnNext.onclick = next;
btnPrev.onclick = prev;
btnBlack.onclick = () => window.presenterAPI.black();
btnUnblack.onclick = () => window.presenterAPI.unblack();

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); play(); }
  if (e.code === 'ArrowRight') next();
  if (e.code === 'ArrowLeft') prev();
  if (e.key && e.key.toLowerCase() === 'b') window.presenterAPI.black();
  if (e.key && e.key.toLowerCase() === 'u') window.presenterAPI.unblack();
});
