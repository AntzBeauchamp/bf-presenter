// Wire up to the actual elements in display.html
const img = document.getElementById('imgA');       // was 'img'
const video = document.getElementById('videoA');   // was 'video'
const audio = document.getElementById('audioEl');  // was 'audio'
const blackout = document.getElementById('blackout');
const errorBanner = document.getElementById('errorBanner');

let currentItem = null;
let currentType = null;      // 'image' | 'audio' | 'video' | null
let currentMediaEl = null;   // <video> or <audio> when active, else null

const logAPI = window.presenterAPI?.log;

function logDisplay(level, msg, data = null) {
  if (!logAPI?.append) return;
  const safeMsg = typeof msg === 'undefined' ? '' : msg;
  logAPI.append(level, 'DISPLAY', safeMsg, data);
}

console.log('Display ready (single-layer, imgA / videoA / audioEl)');

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

// --- Helpers ---

function fileURL(path) {
  try {
    return window.presenterAPI.toFileURL(path);
  } catch (err) {
    console.error('Failed to convert path to URL', err);
    return encodeURI(`file://${path}`);
  }
}

function sendPlaybackProgressFrom(el, from = 'unknown') {
  if (!el) return;
  if (!currentMediaEl || el !== currentMediaEl) return;

  const currentTime = Number.isFinite(el.currentTime) ? el.currentTime : 0;
  const duration = Number.isFinite(el.duration) ? el.duration : 0;

  window.presenterAPI.send('display:playback-progress', { currentTime, duration });
}

[video, audio].forEach((el) => {
  if (!el) return;
  el.addEventListener('timeupdate', () => sendPlaybackProgressFrom(el, 'timeupdate'));
  el.addEventListener('loadedmetadata', () => sendPlaybackProgressFrom(el, 'loadedmetadata'));
  el.addEventListener('durationchange', () => sendPlaybackProgressFrom(el, 'durationchange'));
});

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
    el.classList.remove('fade-in', 'fade-out');
  });

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
  hideAll();
  blackout?.classList.remove('hidden');
  if (errorBanner) {
    errorBanner.textContent = message;
    errorBanner.classList.remove('hidden');
  }
  window.presenterAPI.send('display:error', { message, item: currentItem });
}

function pauseMedia() {
  try { video && video.pause(); } catch (err) { console.warn('Video pause failed', err); }
  try { audio && audio.pause(); } catch (err) { console.warn('Audio pause failed', err); }
}

function tryPlay(el, label) {
  if (!el || el.classList.contains('hidden')) return;
  el.play().catch((err) => {
    notifyError(`Unable to play ${label}.`, err);
  });
}

// --- Show item / crossfade ---

function showItem(item) {
  console.log('Display got item:', item);
  currentItem = item || null;
  clearError();

  // Stop any currently playing media
  pauseMedia();

  const elements = [img, video, audio];

  // Crossfade out any currently visible elements
  elements.forEach((el) => {
    if (!el || el.classList.contains('hidden')) return;

    el.classList.remove('fade-in');
    el.classList.add('fade-out');

    el.addEventListener('transitionend', () => {
      el.classList.add('hidden');
      el.classList.remove('fade-out');

      // Clear media source to stop playback
      if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
        el.onerror = null;
        el.removeAttribute('src');
        if (typeof el.load === 'function') {
          try { el.load(); } catch (err) { console.warn('Load reset failed', err); }
        }
        if (el === currentMediaEl) {
          currentMediaEl = null;
        }
      }

      if (el.tagName === 'IMG') {
        el.removeAttribute('src');
      }
    }, { once: true });
  });

  if (!item) {
    blackout?.classList.remove('hidden');
    currentType = null;
    currentMediaEl = null;
    window.presenterAPI.send('display:playback-progress', { currentTime: 0, duration: 0 });
    return;
  }

  // Small delay to allow fade-out to complete
  setTimeout(() => {
    currentType = item.type || null;
    currentMediaEl = null;

    elements.forEach((el) => {
      if (!el) return;
      el.classList.remove('fade-in', 'fade-out');
    });

    if (item.type === 'image') {
      if (!img) {
        notifyError('No image element available for display.', new Error('Missing imgA'));
        return;
      }
      img.onerror = (e) => notifyError('Unable to load image.', e);
      img.src = fileURL(item.path);
      img.classList.remove('hidden');
      img.classList.add('fade-in');
      blackout?.classList.add('hidden');

      currentMediaEl = null;
      window.presenterAPI.send('display:playback-progress', { currentTime: 0, duration: 0 });
    } else if (item.type === 'audio') {
      if (!audio) {
        notifyError('No audio element available for playback.', new Error('Missing audioEl'));
        return;
      }
      audio.onerror = (e) => notifyError('Unable to load audio.', e);
      audio.src = fileURL(item.path);
      audio.classList.remove('hidden');
      audio.classList.add('fade-in');
      currentMediaEl = audio;

      audio.play().catch((err) => console.error('Failed to autoplay audio:', err));

      if (item.displayImage && img) {
        img.onerror = (e) => notifyError('Unable to load display image.', e);
        img.src = fileURL(item.displayImage);
        img.classList.remove('hidden');
        img.classList.add('fade-in');
        blackout?.classList.add('hidden');
      } else {
        // No image: keep screen black behind the audio
        blackout?.classList.remove('hidden');
      }
    } else if (item.type === 'video') {
      if (!video) {
        notifyError('No video element available for playback.', new Error('Missing videoA'));
        return;
      }
      const videoPath = fileURL(item.path);
      console.log('Resolved video path:', videoPath);

      video.onerror = (e) => {
        console.error(`Unable to load video at ${videoPath}.`, e);
        notifyError(`Unable to load video at ${videoPath}. Error: ${e.message || e}`);
      };

      video.src = videoPath;
      video.setAttribute('playsinline', '');
      video.classList.remove('hidden');
      video.classList.add('fade-in');
      blackout?.classList.add('hidden');

      currentMediaEl = video;

      video.play().catch((err) => console.error('Failed to autoplay video:', err));
    } else {
      notifyError('Unsupported media type.', new Error(item.type));
    }
  }, 300);
}

// --- Event wiring ---
// Progress + ended
if (video) {
  video.onended = () => {
    window.presenterAPI.send('display:ended');
  };
}
if (audio) {
  audio.onended = () => {
    window.presenterAPI.send('display:ended');
  };
}

// From Main/Control
window.presenterAPI.onProgramEvent('display:show-item', (item) => {
  console.log('Display received item:', item);
  showItem(item);
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
  if (video && !video.classList.contains('hidden')) {
    tryPlay(video, 'video');
  }
  if (audio && !audio.classList.contains('hidden')) {
    tryPlay(audio, 'audio');
  }
});

// Handle seek from Control
window.presenterAPI.onProgramEvent('display:seek', (payload) => {
  if (!payload || typeof payload.time !== 'number' || !Number.isFinite(payload.time)) {
    return;
  }

  const target = Math.max(0, payload.time);
  const el = currentMediaEl;

  if (!el) {
    console.warn('[DISPLAY] display:seek received but no active media element');
    return;
  }

  const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
  const clamped = dur ? Math.min(target, dur) : target;

  console.log('[DISPLAY] display:seek received time', target, '→ clamped to', clamped);

  try {
    el.currentTime = clamped;
  } catch (err) {
    console.warn('Seek failed on media element', err);
  }
});
