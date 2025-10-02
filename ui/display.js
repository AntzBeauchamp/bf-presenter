const img = document.getElementById('img');
const video = document.getElementById('video');
const audio = document.getElementById('audio');
const blackout = document.getElementById('blackout');

function hideAll() {
  img.classList.add('hidden');
  video.classList.add('hidden');
  audio.classList.add('hidden');
  video.pause(); audio.pause();
}

function showItem(item) {
  hideAll();
  if (item.type === 'image') {
    img.src = `file://${item.path}`;
    img.classList.remove('hidden');
  } else if (item.type === 'audio') {
    audio.src = `file://${item.path}`;
    audio.classList.remove('hidden');
    audio.play().catch(()=>{});
  } else if (item.type === 'video') {
    video.src = `file://${item.path}`;
    video.classList.remove('hidden');
    video.play().catch(()=>{});
  }
}

window.presenterAPI.onProgramEvent('display:show-item', (item) => showItem(item));
window.presenterAPI.onProgramEvent('display:black', () => blackout.classList.remove('hidden'));
window.presenterAPI.onProgramEvent('display:unblack', () => blackout.classList.add('hidden'));
window.presenterAPI.onProgramEvent('display:pause', () => { video.pause(); audio.pause(); });
window.presenterAPI.onProgramEvent('display:play', () => {
  if (!video.classList.contains('hidden')) video.play().catch(()=>{});
  if (!audio.classList.contains('hidden')) audio.play().catch(()=>{});
});
