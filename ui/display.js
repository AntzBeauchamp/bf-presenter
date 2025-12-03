const img = document.getElementById('img');
const video = document.getElementById('video');
const audio = document.getElementById('audio');
const blackout = document.getElementById('blackout');
const errorBanner = document.getElementById('errorBanner');

let currentItem = null;
let currentType = null; // 'image' | 'audio' | 'video' | null
let currentMediaEl = null; // active <video> or <audio>, else null

const logAPI = window.presenterAPI?.log;

function logDisplay(level, msg, data = null) {
  if (!logAPI?.append) return;
  const safeMsg = typeof msg === 'undefined' ? '' : msg;
  logAPI.append(level, 'DISPLAY', safeMsg, data);
}

console.log('Display ready');

(function tapConsole() {
  if (!logAPI?.append) return;
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };

  function toPayload(args) {
    if (!args.length) return ['', null];
    if (args.length === 1) return [args[0], null];
    const [first, ...rest] = args;
    return [first, rest.length === 1 ? rest[0] : rest];
  }

  console.log = (...args) => {
    original.log(...args);
    const [msg, data] = toPayload(args);
    logDisplay('INFO', msg, data);
  };

  console.warn = (...args) => {
    original.warn(...args);
    const [msg, data] = toPayload(args);
    logDisplay('WARN', msg, data);
  };

  console.error = (...args) => {
    original.error(...args);
    const [msg, data] = toPayload(args);
    logDisplay('ERROR', msg, data);
  };

  window.addEventListener('error', (event) => {
    logDisplay('ERROR', 'window.onerror', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logDisplay('ERROR', 'unhandledrejection', {
      reason: (() => {
        try { return JSON.stringify(event.reason); } catch { return String(event.reason); }
      })()
    });
  });
})();

function resetMediaElement(el) {
  if (!el) return;
  el.onerror = null;

  if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
    try { el.pause(); } catch (err) { console.warn('Pause failed', err); }
    try { el.currentTime = 0; } catch (err) { console.warn('Reset currentTime failed', err); }
    el.removeAttribute('src');
    if (typeof el.load === 'function') {
      try { el.load(); } catch (err) { console.warn('Load reset failed', err); }
    }
  }

  if (el.tagName === 'IMG') {
    el.removeAttribute('src');
  }

  el.classList.add('hidden');
}

function hideAll() {
  resetMediaElement(img);
  resetMediaElement(video);
  resetMediaElement(audio);

  currentItem = null;
  currentType = null;
  currentMediaEl = null;

  // Reset progress on Control when everything is cleared
  window.presenterAPI.send('display:playback-progress', { currentTime: 0, duration: 0 });
}

function clearError() {
  if (errorBanner) {
    errorBanner.textContent = '';
    errorBanner.classList.add('hidden');
  }
}

function notifyError(message, err) {
  console.error(message, err);
  const lastItem = currentItem;
  hideAll();
  currentItem = lastItem;
  blackout?.classList.remove('hidden');
  if (errorBanner) {
    errorBanner.textContent = message;
    errorBanner.classList.remove('hidden');
  }
  window.presenterAPI.send('display:error', { message, item: currentItem });
}

function safeToFileURL(p) {
  try {
    if (window.presenterAPI && typeof window.presenterAPI.toFileURL === 'function') {
      return window.presenterAPI.toFileURL(p);
    }
  } catch (err) {
    console.warn('presenterAPI.toFileURL failed in display, falling back', err);
  }
  try {
    const normalized = p.replace(/\\/g, '/');
    if (!normalized.startsWith('/')) return `file:///${normalized}`;
    return `file://${normalized}`;
  } catch (err) {
    return `file://${p}`;
  }
}

function showItem(item) {
  console.log('DISPLAY: showItem called with', item);
  console.log('Display got item:', item);
  clearError();

  // Stop any existing media aggressively before showing a new item.
  hideAll();

  currentItem = item || null;
  currentType = null;
  currentMediaEl = null;

  if (!item) {
    blackout?.classList.remove('hidden');
    return;
  }

  if (item.type === 'image') {
    currentType = 'image';
    img.onerror = (e) => notifyError('Unable to load image.', e);
    img.src = item.url ? item.url : safeToFileURL(item.path);
    img.classList.remove('hidden');
    blackout?.classList.add('hidden');
    window.presenterAPI.send('display:playback-progress', { currentTime: 0, duration: 0 });

  } else if (item.type === 'audio') {
    currentType = 'audio';
    audio.onerror = (e) => notifyError('Unable to load audio.', e);
    audio.src = item.url ? item.url : safeToFileURL(item.path);
    audio.classList.remove('hidden');
    currentMediaEl = audio;

    if (item.displayImage) {
      img.onerror = (e) => notifyError('Unable to load display image.', e);
      img.src = item.displayImage && item.displayImage.startsWith('http') ? item.displayImage : safeToFileURL(item.displayImage);
      img.classList.remove('hidden');
      blackout?.classList.add('hidden');
    } else {
      blackout?.classList.remove('hidden');
    }

    tryPlay(audio, 'audio');

  } else if (item.type === 'video') {
    currentType = 'video';
    video.onerror = (e) => notifyError('Unable to load video.', e);
    video.src = item.url ? item.url : safeToFileURL(item.path);
    video.setAttribute('playsinline', '');
    video.classList.remove('hidden');
    blackout?.classList.add('hidden');
    currentMediaEl = video;
    tryPlay(video, 'video');
  } else {
    notifyError('Unsupported media type.', new Error(item.type));
  }
}

// --- LISTEN FOR PUSHED ITEMS FROM MAIN ---
window.presenterAPI.onProgramEvent('display:show-item', (item) => {
  console.log('DISPLAY: received item', item);
  console.log('Display received item:', item);
  showItem(item);
});

function pauseMedia() {
  try { video?.pause(); } catch (err) { console.warn('Video pause failed', err); }
  try { audio?.pause(); } catch (err) { console.warn('Audio pause failed', err); }
}

function tryPlay(el, label) {
  if (!el || el.classList.contains('hidden')) return;
  el.play().catch((err) => {
    notifyError(`Unable to play ${label}.`, err);
  });
}

function sendPlaybackProgressFrom(el, from = 'unknown') {
  if (!el || !currentMediaEl || el !== currentMediaEl) return;

  const currentTime = Number.isFinite(el.currentTime) ? el.currentTime : 0;
  const duration = Number.isFinite(el.duration) ? el.duration : 0;

  console.log('[DISPLAY] playback-progress', { from, currentTime, duration });
  window.presenterAPI.send('display:playback-progress', { currentTime, duration });
}

[video, audio].forEach((el) => {
  if (!el) return;
  if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
    el.addEventListener('timeupdate', () => sendPlaybackProgressFrom(el, 'timeupdate'));
    el.addEventListener('loadedmetadata', () => sendPlaybackProgressFrom(el, 'loadedmetadata'));
    el.addEventListener('durationchange', () => sendPlaybackProgressFrom(el, 'durationchange'));
  }
});

video?.addEventListener('ended', () => {
  window.presenterAPI.send('display:ended');
});
audio?.addEventListener('ended', () => {
  window.presenterAPI.send('display:ended');
});
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
  if (!video?.classList.contains('hidden')) {
    tryPlay(video, 'video');
  }
  if (!audio?.classList.contains('hidden')) {
    tryPlay(audio, 'audio');
  }
});

window.presenterAPI.onProgramEvent('display:seek', (payload) => {
  if (!payload || typeof payload.time !== 'number' || !Number.isFinite(payload.time)) return;

  const target = Math.max(0, payload.time);
  const el = currentMediaEl;

  if (!el) {
    console.warn('[DISPLAY] display:seek received but no active media element');
    return;
  }

  const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
  const clamped = dur ? Math.min(target, dur) : target;

  console.log('[DISPLAY] display:seek ->', { target, clamped, duration: dur });

  try {
    el.currentTime = clamped;
  } catch (err) {
    console.warn('Seek failed on media element', err);
  }
});
