const img = document.getElementById('img');
const video = document.getElementById('video');
const audio = document.getElementById('audio');
const blackout = document.getElementById('blackout');
const errorBanner = document.getElementById('errorBanner');

let currentItem = null;

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
  console.log('Display got item:', item);
  currentItem = item || null;
  clearError();
  hideAll();

  if (!item) {
    blackout.classList.remove('hidden');
    return;
  }

  if (item.type === 'image') {
    img.onerror = (e) => notifyError('Unable to load image.', e);
    img.src = fileURL(item.path);
    img.classList.remove('hidden');
    blackout.classList.add('hidden');

  } else if (item.type === 'audio') {
    audio.onerror = (e) => notifyError('Unable to load audio.', e);
    audio.src = fileURL(item.path);
    audio.classList.remove('hidden');

    if (item.displayImage) {
      img.onerror = (e) => notifyError('Unable to load display image.', e);
      img.src = fileURL(item.displayImage);
      img.classList.remove('hidden');
      blackout.classList.add('hidden');
    } else {
      blackout.classList.remove('hidden');
    }

  } else if (item.type === 'video') {
    video.onerror = (e) => notifyError('Unable to load video.', e);
    video.src = fileURL(item.path);
    video.setAttribute('playsinline', '');
    video.classList.remove('hidden');
    blackout.classList.add('hidden');
  } else {
    notifyError('Unsupported media type.', new Error(item.type));
  }
}

// --- LISTEN FOR PUSHED ITEMS FROM MAIN ---
window.presenterAPI.onProgramEvent('display:show-item', (item) => {
  console.log('Display received item:', item);
  showItem(item);
});

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

video.onended = () => window.presenterAPI.send('display:ended');
audio.onended = () => window.presenterAPI.send('display:ended');
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
