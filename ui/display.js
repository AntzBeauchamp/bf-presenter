const layerA = document.getElementById('layerA');
const layerB = document.getElementById('layerB');
const imgA = document.getElementById('imgA');
const imgB = document.getElementById('imgB');
const videoA = document.getElementById('videoA');
const videoB = document.getElementById('videoB');
const audioEl = document.getElementById('audioEl');
const blackout = document.getElementById('blackout');
const errorBanner = document.getElementById('errorBanner');

let activeLayerKey = 'A';
let currentItem = null;
let currentType = null;
let currentMediaEl = null;
let swapTimer = null;
let fallbackTimer = null;
let playbackToken = 0;

let backgroundImagePath = null;
let isBlanked = false;
let repeatEnabled = false;

const logAPI = window.presenterAPI?.log;

function logDisplay(level, msg, data = null) {
  if (!logAPI?.append) return;
  const safeMsg = typeof msg === 'undefined' ? '' : msg;
  logAPI.append(level, 'DISPLAY', safeMsg, data);
}

console.log('Display ready');
window.presenterAPI.send('display:get-background');

function sendPlaybackProgressFrom(el, from = 'unknown') {
  if (!el) return;
  if (!currentMediaEl || el !== currentMediaEl) return;

  const currentTime = Number.isFinite(el.currentTime) ? el.currentTime : 0;
  const duration = Number.isFinite(el.duration) ? el.duration : 0;

  console.log('[DISPLAY] playback-progress from', from, 'currentTime', currentTime, 'duration', duration, 'active?', el === currentMediaEl);
  window.presenterAPI.send('display:playback-progress', { currentTime, duration });
}

[videoA, videoB, audioEl].forEach((el) => {
  if (!el) return;
  el.addEventListener('timeupdate', () => sendPlaybackProgressFrom(el, 'timeupdate'));
  el.addEventListener('loadedmetadata', () => sendPlaybackProgressFrom(el, 'loadedmetadata'));
  el.addEventListener('durationchange', () => sendPlaybackProgressFrom(el, 'durationchange'));
});

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

function getLayerElements(key) {
  return key === 'A'
    ? { layer: layerA, img: imgA, video: videoA }
    : { layer: layerB, img: imgB, video: videoB };
}

function getActiveLayer() {
  return getLayerElements(activeLayerKey);
}

function getInactiveLayer() {
  const inactiveKey = activeLayerKey === 'A' ? 'B' : 'A';
  return getLayerElements(inactiveKey);
}

function resetVisualClass(el) {
  if (!el) return;
  el.className = 'visual';
}

function showVisual(el) {
  if (!el) return;
  resetVisualClass(el);
  el.classList.add('show');
}

function resetSwapTimer() {
  if (swapTimer) {
    clearTimeout(swapTimer);
    swapTimer = null;
  }
}

function stopLayerPlayback(layer) {
  if (!layer) return;
  try { layer.video.pause(); } catch (err) { console.warn('Pause failed', err); }
}

function clearLayerContent(layer) {
  if (!layer) return;
  if (layer.video) {
    layer.video.onerror = null;
    try { layer.video.pause(); } catch {}
    layer.video.removeAttribute('src');
    try { layer.video.load(); } catch (err) { console.warn('Video load reset failed', err); }
    resetVisualClass(layer.video);
  }
  if (layer.img) {
    layer.img.onerror = null;
    layer.img.removeAttribute('src');
    resetVisualClass(layer.img);
  }
}

function hideAllVisuals() {
  clearLayerContent(getLayerElements('A'));
  clearLayerContent(getLayerElements('B'));
  layerA?.classList.remove('visible');
  layerB?.classList.remove('visible');
}

function hasActiveVisual() {
  const { img, video } = getActiveLayer();
  const visibleImg = img?.classList.contains('show') && img.src;
  const visibleVideo = video?.classList.contains('show') && video.src;
  return !!(visibleImg || visibleVideo);
}

function showFallbackAfterEnd(expectedToken) {
  if (expectedToken !== playbackToken || isBlanked) return;

  const outgoing = getActiveLayer();
  const incoming = getInactiveLayer();

  if (backgroundImagePath) {
    console.log('DISPLAY: showing background after end');
    clearLayerContent(incoming);

    if (incoming?.img) {
      incoming.img.src = fileUrl(backgroundImagePath);
      showVisual(incoming.img);
    }
    blackout.classList.add('hidden');
    incoming.layer?.classList.add('visible');
    outgoing.layer?.classList.remove('visible');

    setTimeout(() => {
      activeLayerKey = (activeLayerKey === 'A') ? 'B' : 'A';
      clearLayerContent(outgoing);
    }, 1000);
  } else {
    console.log('DISPLAY: no background — reverting to black');
    blackout.classList.remove('hidden');
    outgoing.layer?.classList.remove('visible');
    setTimeout(() => {
      clearLayerContent(outgoing);
    }, 1000);
  }
}

function showBackgroundFallback() {
  const outgoing = getActiveLayer();
  const incomingKey = activeLayerKey === 'A' ? 'B' : 'A';
  const incoming = getLayerElements(incomingKey);

  resetSwapTimer();
  clearLayerContent(incoming);

  if (backgroundImagePath) {
    if (incoming?.img) {
      incoming.img.src = fileUrl(backgroundImagePath);
      showVisual(incoming.img);
    }
    blackout?.classList.add('hidden');
    incoming.layer?.classList.add('visible');
    outgoing.layer?.classList.remove('visible');
    swapTimer = window.setTimeout(() => {
      clearLayerContent(outgoing);
      swapTimer = null;
    }, 1000);
    activeLayerKey = incomingKey;
  } else {
    incoming.layer?.classList.remove('visible');
    outgoing.layer?.classList.remove('visible');
    blackout?.classList.remove('hidden');
    clearLayerContent(outgoing);
    clearLayerContent(incoming);
  }
}

function stopAudio() {
  if (!audioEl) return;
  audioEl.onerror = null;
  try { audioEl.pause(); } catch (err) { console.warn('Audio pause failed', err); }
  audioEl.removeAttribute('src');
  try { audioEl.load(); } catch (err) { console.warn('Audio load reset failed', err); }
}

function hideAll() {
  resetSwapTimer();
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  hideAllVisuals();
  stopAudio();
  currentItem = null;
  currentType = null;
  currentMediaEl = null;

  console.log('[DISPLAY] hideAll – resetting progress to 0');
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
  const reportedItem = currentItem;
  hideAll();
  blackout?.classList.remove('hidden');
  if (errorBanner) {
    errorBanner.textContent = message;
    errorBanner.classList.remove('hidden');
  }
  window.presenterAPI.send('display:error', { message, item: reportedItem });
}

function fileUrl(p) {
  if (!p) return '';
  if (typeof p === 'string' && /^https?:\/\//i.test(p)) return p;
  if (window.presenterAPI?.toFileURL) return window.presenterAPI.toFileURL(p);
  return 'file:///' + String(p).replace(/\\/g, '/').replace(/^\/+/, '');
}

function prepareImage(layer, item) {
  if (!layer?.img || !item) return false;
  const src = item.url ? item.url : (item.path ? fileUrl(item.path) : null);
  if (!src) return false;
  layer.img.onerror = (e) => notifyError('Unable to load image.', e);
  layer.img.src = src;
  showVisual(layer.img);
  return true;
}

function prepareVideo(layer, item) {
  if (!layer?.video || !item) return false;
  const src = item.url ? item.url : (item.path ? fileUrl(item.path) : null);
  if (!src) return false;
  layer.video.onerror = (e) => notifyError('Unable to load video.', e);
  layer.video.src = src;
  layer.video.preload = 'auto';
  layer.video.loop = repeatEnabled;
  layer.video.setAttribute('playsinline', '');
  const ensureAudible = () => {
    layer.video.muted = false;
    layer.video.volume = 1;
    layer.video.removeAttribute('muted');
  };
  ensureAudible();
  layer.video.addEventListener('loadedmetadata', ensureAudible, { once: true });
  showVisual(layer.video);
  return true;
}

function showItem(item) {
  playbackToken += 1;
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  console.log('Display received item', item);
  currentItem = item || null;
  currentType = item?.type || null;
  currentMediaEl = null;
  clearError();
  resetSwapTimer();

  if (!item) {
    hideAll();
    if (!isBlanked && backgroundImagePath) {
      showBackgroundFallback();
    } else {
      blackout?.classList.remove('hidden');
    }
    window.presenterAPI.send('display:playback-progress', { currentTime: 0, duration: 0 });
    return;
  }

  const outgoingKey = activeLayerKey;
  const outgoing = getLayerElements(outgoingKey);
  const incomingKey = outgoingKey === 'A' ? 'B' : 'A';
  const incoming = getLayerElements(incomingKey);

  stopLayerPlayback(outgoing);
  stopAudio();
  clearLayerContent(incoming);

  let willShowVisual = false;

  if (item.type === 'image') {
    willShowVisual = prepareImage(incoming, item);
    blackout?.classList.add('hidden');
    window.presenterAPI.send('display:playback-progress', { currentTime: 0, duration: 0 });
  } else if (item.type === 'video') {
    willShowVisual = prepareVideo(incoming, item);
    currentMediaEl = incoming.video;
    blackout?.classList.add('hidden');
  } else if (item.type === 'audio') {
    currentMediaEl = audioEl;
    const audioSrc = item.url ? item.url : (item.path ? fileUrl(item.path) : null);
    if (audioSrc) {
      audioEl.onerror = (e) => notifyError('Unable to load audio.', e);
      audioEl.src = audioSrc;
      audioEl.loop = repeatEnabled;
      const ensureAudible = () => {
        audioEl.muted = false;
        audioEl.volume = 1;
        audioEl.removeAttribute('muted');
      };
      ensureAudible();
      audioEl.addEventListener('loadedmetadata', ensureAudible, { once: true });
      try { audioEl.load(); } catch (err) { console.warn('Audio load failed', err); }
    }

    if (item.displayImage && incoming?.img) {
      // Show the item-specific image
      incoming.img.onerror = (e) => notifyError('Unable to load image.', e);
      incoming.img.src = fileUrl(item.displayImage);
      showVisual(incoming.img);
      willShowVisual = true;
      blackout?.classList.add('hidden');
    } else {
      // No per-track image: show global background if set, else black
      willShowVisual = false;
    }
  } else {
    notifyError('Unsupported media type.', new Error(item.type));
    return;
  }

  activeLayerKey = incomingKey;

  if (willShowVisual) {
    incoming.layer.classList.add('visible');
    outgoing.layer.classList.remove('visible');

    swapTimer = window.setTimeout(() => {
      clearLayerContent(outgoing);
      swapTimer = null;
    }, 1000);
  } else {
    if (backgroundImagePath && !isBlanked) {
      clearLayerContent(incoming);
      if (incoming?.img) {
        incoming.img.src = fileUrl(backgroundImagePath);
        showVisual(incoming.img);
      }
      blackout?.classList.add('hidden');
      incoming.layer?.classList.add('visible');
      outgoing.layer?.classList.remove('visible');
      swapTimer = window.setTimeout(() => {
        clearLayerContent(outgoing);
        swapTimer = null;
      }, 1000);
    } else {
      incoming.layer?.classList.remove('visible');
      outgoing.layer?.classList.remove('visible');
      blackout?.classList.remove('hidden'); // pure black
      clearLayerContent(outgoing);
      clearLayerContent(incoming);
    }
  }
}

function playCurrent() {
  const { video } = getActiveLayer();
  if (currentType === 'video' && video.classList.contains('show')) {
    video.play().catch((err) => {
      notifyError('Unable to play video.', err);
    });
  } else if (currentType === 'audio' && audioEl.src) {
    audioEl.play().catch((err) => {
      notifyError('Unable to play audio.', err);
    });
  }
}

function pauseCurrent() {
  const { video } = getLayerElements('A');
  const { video: videoBEl } = getLayerElements('B');
  [video, videoBEl].forEach((vid) => {
    try { vid.pause(); } catch (err) { console.warn('Video pause failed', err); }
  });
  try { audioEl.pause(); } catch (err) { console.warn('Audio pause failed', err); }
}

function onEnded(ev) {
  if (repeatEnabled && (currentType === 'video' || currentType === 'audio')) {
    try {
      const el = ev?.target || (currentType === 'video' ? getActiveLayer().video : audioEl);
      if (el) {
        el.currentTime = 0;
        el.play().catch(() => {});
      }
    } catch {}
    return;
  }

  console.log('DISPLAY: media ended → notifying Control');
  window.presenterAPI.send('display:ended');

  const tokenAtEnd = playbackToken;
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
  }
  fallbackTimer = window.setTimeout(() => {
    fallbackTimer = null;
    showFallbackAfterEnd(tokenAtEnd);
  }, 1000);
}

videoA.onended = onEnded;
videoB.onended = onEnded;
audioEl.onended = onEnded;

window.presenterAPI.onProgramEvent('display:show-item', (item) => {
  showItem(item);
});

window.presenterAPI.onProgramEvent('display:set-repeat', (enabled) => {
  repeatEnabled = !!enabled;
  const { video } = getActiveLayer();
  if (audioEl) {
    audioEl.loop = repeatEnabled;
  }
  if (video) {
    video.loop = repeatEnabled;
  }
});

window.presenterAPI.onProgramEvent('display:play', () => {
  playCurrent();
});

window.presenterAPI.onProgramEvent('display:pause', () => {
  pauseCurrent();
});

window.presenterAPI.onProgramEvent('display:black', () => {
  pauseCurrent();
  isBlanked = true;
  blackout?.classList.remove('hidden');
});

window.presenterAPI.onProgramEvent('display:unblack', () => {
  isBlanked = false;
  if (!hasActiveVisual()) {
    showBackgroundFallback();
  } else {
    blackout?.classList.add('hidden');
  }
});

window.presenterAPI.onProgramEvent('display:set-background', (absPath) => {
  backgroundImagePath = absPath || null;
  console.log('DISPLAY: background set to', backgroundImagePath || 'none');

  if (!hasActiveVisual() && !isBlanked) {
    showBackgroundFallback();
  }
});

window.presenterAPI.onProgramEvent('display:seek', (payload) => {
  if (!payload || typeof payload.time !== 'number' || !Number.isFinite(payload.time)) {
    return;
  }

  console.log('[DISPLAY] display:seek payload', payload, 'currentMediaEl?', !!currentMediaEl);
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
