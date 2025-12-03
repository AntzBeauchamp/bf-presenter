const layerA = {
  name: 'A',
  img: document.getElementById('imgA'),
  video: document.getElementById('videoA')
};

const layerB = {
  name: 'B',
  img: document.getElementById('imgB'),
  video: document.getElementById('videoB')
};

const layers = [layerA, layerB];

const audio = document.getElementById('audioEl');
const blackout = document.getElementById('blackout');
const errorBanner = document.getElementById('errorBanner');

let currentItem = null;
let currentType = null;      // 'image' | 'audio' | 'video' | null
let currentMediaEl = null;   // <video> or <audio> when active, else null
let activeLayer = null;      // whichever layer (A/B) is currently visible

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

// --- Helpers ---

function fileURL(path) {
  try {
    return window.presenterAPI.toFileURL(path);
  } catch (err) {
    console.error('Failed to convert path to URL', err);
    return encodeURI(`file://${path}`);
  }
}

// Only publish playback progress from the currently active media element so
// inactive layers can't report stale zeros and snap the scrubber back.
function sendPlaybackProgressFrom(el, from = 'unknown') {
  if (!el) return;
  if (!currentMediaEl || el !== currentMediaEl) return;

  const currentTime = Number.isFinite(el.currentTime) ? el.currentTime : 0;
  const duration = Number.isFinite(el.duration) ? el.duration : 0;

  console.log('[DISPLAY] playback-progress', { from, currentTime, duration });
  window.presenterAPI.send('display:playback-progress', { currentTime, duration });
}

[...layers.flatMap((l) => [l.video, l.img]), audio].forEach((el) => {
  if (!el) return;
  if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
    el.addEventListener('timeupdate', () => sendPlaybackProgressFrom(el, 'timeupdate'));
    el.addEventListener('loadedmetadata', () => sendPlaybackProgressFrom(el, 'loadedmetadata'));
    el.addEventListener('durationchange', () => sendPlaybackProgressFrom(el, 'durationchange'));
  }
});

function resetMediaElement(el) {
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
}

function hideAll() {
  layers.forEach((layer) => {
    resetMediaElement(layer.img);
    resetMediaElement(layer.video);
  });
  resetMediaElement(audio);

  currentItem = null;
  currentType = null;
  currentMediaEl = null;
  activeLayer = null;

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
  layers.forEach((layer) => {
    try { layer.video && layer.video.pause(); } catch (err) { console.warn('Video pause failed', err); }
  });
  try { audio && audio.pause(); } catch (err) { console.warn('Audio pause failed', err); }
}

function tryPlay(el, label) {
  if (!el || el.classList.contains('hidden')) return;
  el.play().catch((err) => {
    notifyError(`Unable to play ${label}.`, err);
  });
}

function chooseIncomingLayer() {
  // simple A/B toggle for visuals
  if (!activeLayer || activeLayer === layerB) return layerA;
  return layerB;
}

function fadeOutLayer(layer) {
  if (!layer) return;
  [layer.img, layer.video].forEach((el) => {
    if (!el || el.classList.contains('hidden')) return;

    el.classList.remove('fade-in');
    el.classList.add('fade-out');

    el.addEventListener('transitionend', () => {
      resetMediaElement(el);
      if (el === currentMediaEl) {
        currentMediaEl = null;
      }
    }, { once: true });
  });
}

function showItem(item) {
  console.log('Display got item:', item);
  currentItem = item || null;
  clearError();

  // Stop any currently playing media
  pauseMedia();

  // Crossfade out currently visible visuals/audio
  fadeOutLayer(activeLayer);
  if (audio && !audio.classList.contains('hidden')) {
    audio.classList.remove('fade-in');
    audio.classList.add('fade-out');
    audio.addEventListener('transitionend', () => {
      resetMediaElement(audio);
      if (audio === currentMediaEl) {
        currentMediaEl = null;
      }
    }, { once: true });
  }

  if (!item) {
    blackout?.classList.remove('hidden');
    currentType = null;
    currentMediaEl = null;
    activeLayer = null;
    window.presenterAPI.send('display:playback-progress', { currentTime: 0, duration: 0 });
    return;
  }

  // Small delay to allow fade-out to complete
  setTimeout(() => {
    currentType = item.type || null;
    currentMediaEl = null;

    layers.forEach((layer) => {
      [layer.img, layer.video].forEach((el) => el?.classList.remove('fade-in', 'fade-out'));
    });
    audio?.classList.remove('fade-in', 'fade-out');

    const incomingLayer = chooseIncomingLayer();

    if (item.type === 'image') {
      if (incomingLayer?.img) {
        incomingLayer.img.onerror = (e) => notifyError('Unable to load image.', e);
        incomingLayer.img.src = fileURL(item.path);
        incomingLayer.img.classList.remove('hidden');
        incomingLayer.img.classList.add('fade-in');
        incomingLayer.video?.classList.add('hidden');
      }

      blackout?.classList.add('hidden');
      currentMediaEl = null;
      activeLayer = incomingLayer;
      window.presenterAPI.send('display:playback-progress', { currentTime: 0, duration: 0 });
    } else if (item.type === 'audio') {
      if (audio) {
        audio.onerror = (e) => notifyError('Unable to load audio.', e);
        audio.src = fileURL(item.path);
        audio.classList.remove('hidden');
        audio.classList.add('fade-in');
        currentMediaEl = audio;
        audio.play().catch((err) => console.error('Failed to autoplay audio:', err));
      }

      if (item.displayImage && incomingLayer?.img) {
        incomingLayer.img.onerror = (e) => notifyError('Unable to load display image.', e);
        incomingLayer.img.src = fileURL(item.displayImage);
        incomingLayer.img.classList.remove('hidden');
        incomingLayer.img.classList.add('fade-in');
        incomingLayer.video?.classList.add('hidden');
        blackout?.classList.add('hidden');
        activeLayer = incomingLayer;
      } else {
        blackout?.classList.remove('hidden');
        activeLayer = null;
      }
    } else if (item.type === 'video') {
      const videoPath = fileURL(item.path);
      console.log('Resolved video path:', videoPath);

      if (incomingLayer?.video) {
        incomingLayer.video.onerror = (e) => {
          console.error(`Unable to load video at ${videoPath}.`, e);
          notifyError(`Unable to load video at ${videoPath}. Error: ${e.message || e}`);
        };

        incomingLayer.video.src = videoPath;
        incomingLayer.video.setAttribute('playsinline', '');
        incomingLayer.video.classList.remove('hidden');
        incomingLayer.video.classList.add('fade-in');
        incomingLayer.img?.classList.add('hidden');
        blackout?.classList.add('hidden');

        currentMediaEl = incomingLayer.video;
        activeLayer = incomingLayer;

        incomingLayer.video.play().catch((err) => console.error('Failed to autoplay video:', err));
      } else {
        notifyError('Unable to load video: no video element available.', new Error('missing video element'));
      }
    } else {
      notifyError('Unsupported media type.', new Error(item.type));
    }
  }, 300);
}

// --- Event wiring ---

// Progress + ended (guarded for null elements)
layers.forEach((layer) => {
  if (layer.video) {
    layer.video.onended = () => {
      window.presenterAPI.send('display:ended');
    };
  } else {
    console.warn(`[DISPLAY] No <video id="video${layer.name}"> element found for onended`);
  }
});

if (audio) {
  audio.onended = () => {
    window.presenterAPI.send('display:ended');
  };
} else {
  console.warn('[DISPLAY] No <audio id="audioEl"> element found for onended');
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
  const activeVideo = activeLayer?.video;
  if (activeVideo && !activeVideo.classList.contains('hidden')) {
    tryPlay(activeVideo, 'video');
  }
  if (audio && !audio.classList.contains('hidden')) {
    tryPlay(audio, 'audio');
  }
});

// Robust seek handling for Control scrubber -> Main -> Display
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

  // Helpful diagnostics to track which element handled the seek and why.
  console.log('[DISPLAY] display:seek received', payload, '→ using element', !!el, 'duration', dur);

  try {
    el.currentTime = clamped;
  } catch (err) {
    console.warn('Seek failed on media element', err);
  }
});
