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
let swapTimer = null;

let backgroundImagePath = null;
let isBlanked = false;

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
    layer.video.classList.remove('show');
  }
  if (layer.img) {
    layer.img.onerror = null;
    layer.img.removeAttribute('src');
    layer.img.classList.remove('show');
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

function showBackgroundFallback() {
  const outgoing = getActiveLayer();
  const incomingKey = activeLayerKey === 'A' ? 'B' : 'A';
  const incoming = getLayerElements(incomingKey);

  resetSwapTimer();
  clearLayerContent(incoming);

  if (backgroundImagePath) {
    if (incoming?.img) {
      incoming.img.src = fileUrl(backgroundImagePath);
      incoming.img.classList.add('show');
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
  hideAllVisuals();
  stopAudio();
  currentItem = null;
  currentType = null;
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
  if (window.presenterAPI?.toFileURL) return window.presenterAPI.toFileURL(p);
  return 'file:///' + String(p).replace(/\\/g, '/').replace(/^\/+/, '');
}

function prepareImage(layer, item) {
  if (!layer?.img || !item) return false;
  const src = item.url ? item.url : (item.path ? fileUrl(item.path) : null);
  if (!src) return false;
  layer.img.onerror = (e) => notifyError('Unable to load image.', e);
  layer.img.src = src;
  layer.img.classList.add('show');
  return true;
}

function prepareVideo(layer, item) {
  if (!layer?.video || !item) return false;
  const src = item.url ? item.url : (item.path ? fileUrl(item.path) : null);
  if (!src) return false;
  layer.video.onerror = (e) => notifyError('Unable to load video.', e);
  layer.video.src = src;
  layer.video.preload = 'auto';
  layer.video.setAttribute('playsinline', '');
  layer.video.classList.add('show');
  return true;
}

function showItem(item) {
  console.log('Display received item', item);
  currentItem = item || null;
  currentType = item?.type || null;
  clearError();
  resetSwapTimer();

  if (!item) {
    hideAll();
    if (!isBlanked && backgroundImagePath) {
      showBackgroundFallback();
    } else {
      blackout?.classList.remove('hidden');
    }
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
  } else if (item.type === 'video') {
    willShowVisual = prepareVideo(incoming, item);
    blackout?.classList.add('hidden');
  } else if (item.type === 'audio') {
    const audioSrc = item.url ? item.url : (item.path ? fileUrl(item.path) : null);
    if (audioSrc) {
      audioEl.onerror = (e) => notifyError('Unable to load audio.', e);
      audioEl.src = audioSrc;
      try { audioEl.load(); } catch (err) { console.warn('Audio load failed', err); }
    }

    if (item.displayImage && incoming?.img) {
      const imageSrc = item.displayImage.startsWith('http') ? item.displayImage : fileUrl(item.displayImage);
      incoming.img.onerror = (e) => notifyError('Unable to load image.', e);
      incoming.img.src = imageSrc;
      incoming.img.classList.add('show');
      willShowVisual = true;
      blackout?.classList.add('hidden');
    } else {
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
        incoming.img.classList.add('show');
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
      blackout?.classList.remove('hidden');
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

function wireEndedHandlers() {
  const onEnded = () => {
    console.log('Display: media finished, notifying Control');
    window.presenterAPI.send('display:ended');
  };
  videoA.onended = onEnded;
  videoB.onended = onEnded;
  audioEl.onended = onEnded;
}
wireEndedHandlers();

window.presenterAPI.onProgramEvent('display:show-item', (item) => {
  showItem(item);
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
  if (!isBlanked && !hasActiveVisual()) {
    showBackgroundFallback();
  }
});
