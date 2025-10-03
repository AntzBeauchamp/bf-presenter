const img = document.getElementById('img');
const video = document.getElementById('video');
const audio = document.getElementById('audio');
const blackout = document.getElementById('blackout');
const errorBanner = document.getElementById('errorBanner');

let currentItem = null;

function fileURL(path) {
  try {
    return window.presenterAPI.toFileURL(path);
  } catch (err) {
    console.error('Failed to convert path to URL', err);
    return encodeURI(`file://${path}`);
  }
}

function hideAll() {
  [img, video, audio].forEach((el) => {
    if (!el) return;
    el.onerror = null;
    if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
      try { el.pause(); } catch (err) { console.warn('Pause failed', err); }
      el.removeAttribute('src');
      if (typeof el.load === 'function') {
        try { el.load(); } catch (err) { console.warn('Load reset failed', err); }
      }
    }
    if (el.tagName === 'IMG') {
      el.removeAttribute('src');
    }
    el.classList.add('hidden');
  });
}

function clearError() {
  if (errorBanner) {
    errorBanner.textContent = '';
    errorBanner.classList.add('hidden');
  }
}

function notifyError(message, err) {
  console.error(message, err);
  hideAll();
  blackout?.classList.remove('hidden');
  if (errorBanner) {
    errorBanner.textContent = message;
    errorBanner.classList.remove('hidden');
  }
  window.presenterAPI.send('display:error', { message, item: currentItem });
}

function showItem(item) {
  currentItem = item || null;
  clearError();
  hideAll();

  if (!item) {
    blackout?.classList.remove('hidden');
    return;
  }

  blackout?.classList.add('hidden');

  const url = fileURL(item.path);

  if (item.type === 'image') {
    img.onerror = (e) => notifyError('Unable to load image.', e);
    img.src = url;
    img.classList.remove('hidden');
  } else if (item.type === 'audio') {
    audio.onerror = (e) => notifyError('Unable to load audio.', e);
    audio.src = url;
    audio.classList.remove('hidden');
  } else if (item.type === 'video') {
    video.onerror = (e) => notifyError('Unable to load video.', e);
    video.src = url;
    video.setAttribute('playsinline', '');
    video.classList.remove('hidden');
  } else {
    notifyError('Unsupported media type.', new Error(item.type));
  }
}

function pauseMedia() {
  try { video.pause(); } catch (err) { console.warn('Video pause failed', err); }
  try { audio.pause(); } catch (err) { console.warn('Audio pause failed', err); }
}

function tryPlay(el, label) {
  if (el.classList.contains('hidden')) return;
  el.play().catch((err) => {
    notifyError(`Unable to play ${label}.`, err);
  });
}

video.addEventListener('ended', () => {
  window.presenterAPI.send('display:ended');
});

audio.addEventListener('ended', () => {
  window.presenterAPI.send('display:ended');
});

window.presenterAPI.onProgramEvent('display:show-item', (item) => showItem(item));
window.presenterAPI.onProgramEvent('display:black', () => {
  pauseMedia();
  blackout?.classList.remove('hidden');
});
window.presenterAPI.onProgramEvent('display:unblack', () => {
  blackout?.classList.add('hidden');
});
window.presenterAPI.onProgramEvent('display:pause', () => {
  pauseMedia();
});
window.presenterAPI.onProgramEvent('display:play', () => {
  if (!video.classList.contains('hidden')) {
    tryPlay(video, 'video');
  }
  if (!audio.classList.contains('hidden')) {
    tryPlay(audio, 'audio');
  }
});
