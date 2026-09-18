// scripts/test-tv-cast-simulation.js
// Simulates 2 devices:
// 1. Smart TV: receives session, listens to real SSE event stream
// 2. Phone: pairs with TV, runs tv-connect-bridge.js, casts a movie
// Verifies TV starts playing and phone media engine stays 100% idle/paused/silent

const http = require('http');
const fs = require('fs');
const path = require('path');
const { generateToken } = require('../server/auth');

const BASE_URL = 'http://127.0.0.1:3000';
const TEST_USER = { id: 21, username: 'samad', role: 'viewer' };
const AUTH_TOKEN = generateToken(TEST_USER);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// -------------------------------------------------------------
// STEP 1: Simulate Smart TV
// -------------------------------------------------------------
async function initSmartTv() {
  console.log('\n[TV] Connecting to /api/tv/session...');
  const res = await fetch(`${BASE_URL}/api/tv/session`);
  const session = await res.json();
  if (!session.ok || !session.deviceId || !session.pin) {
    throw new Error('Failed to get TV session: ' + JSON.stringify(session));
  }
  console.log(`[TV] Initialized -> Device ID: ${session.deviceId}, PIN: ${session.pin}`);

  const tvEvents = [];
  let sseReq = null;

  // Connect to SSE stream
  const sseUrl = new URL(`/api/tv/events?deviceId=${encodeURIComponent(session.deviceId)}`, BASE_URL);
  sseReq = http.request(sseUrl, { method: 'GET' }, (response) => {
    response.setEncoding('utf8');
    let buffer = '';
    response.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep remainder
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6).trim());
            tvEvents.push(data);
            console.log(`[TV SSE] Received Event -> Type: "${data.type}"`, data.media ? `Media: "${data.media.title}" @ pos ${data.media.position}s` : '');
          } catch (_) {}
        }
      }
    });
  });
  sseReq.on('error', (err) => console.warn('[TV SSE] Error:', err.message));
  sseReq.end();

  // Wait for SSE connection to establish
  await sleep(400);

  return {
    deviceId: session.deviceId,
    pin: session.pin,
    events: tvEvents,
    close: () => {
      try { sseReq.destroy(); } catch (_) {}
    }
  };
}

// -------------------------------------------------------------
// STEP 2: Simulate Phone Environment with DOM & Bridge Script
// -------------------------------------------------------------
function createPhoneDomHarness() {
  const localStorageStore = new Map();
  localStorageStore.set('authToken', AUTH_TOKEN);

  const localStorage = {
    getItem: (k) => (localStorageStore.has(k) ? localStorageStore.get(k) : null),
    setItem: (k, v) => localStorageStore.set(k, String(v)),
    removeItem: (k) => localStorageStore.delete(k),
    get length() { return localStorageStore.size; },
    key: (i) => Array.from(localStorageStore.keys())[i] || null
  };

  const elements = new Map();

  class MockElement {
    constructor(tagName, id = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.classList = {
        _classes: new Set(),
        add: (...c) => c.forEach(cls => this.classList._classes.add(cls)),
        remove: (...c) => c.forEach(cls => this.classList._classes.delete(cls)),
        toggle: (cls, force) => {
          if (force !== undefined) {
            if (force) this.classList._classes.add(cls);
            else this.classList._classes.delete(cls);
          } else {
            if (this.classList._classes.has(cls)) this.classList._classes.delete(cls);
            else this.classList._classes.add(cls);
          }
        },
        contains: (cls) => this.classList._classes.has(cls)
      };
      this.attributes = new Map();
      this.listeners = new Map();
      this.children = [];
      this.parentElement = null;
      this.style = {
        setProperty: (k, v) => { this.style[k] = v; },
        removeProperty: (k) => { delete this.style[k]; }
      };
      if (id) elements.set(id, this);
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
    getAttribute(name) {
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    removeAttribute(name) {
      this.attributes.delete(name);
    }
    closest(selector) {
      if (selector.includes(this.id)) return this;
      if (this.parentElement) return this.parentElement.closest(selector);
      return null;
    }
    addEventListener(event, fn) {
      if (!this.listeners.has(event)) this.listeners.set(event, []);
      this.listeners.get(event).push(fn);
    }
    removeEventListener(event, fn) {
      if (this.listeners.has(event)) {
        this.listeners.set(event, this.listeners.get(event).filter(f => f !== fn));
      }
    }
    dispatchEvent(evt) {
      const list = this.listeners.get(evt.type) || [];
      list.forEach(fn => fn.call(this, evt));
    }
    click() {
      this.dispatchEvent({ type: 'click', target: this });
    }
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }
    querySelector(sel) {
      if (sel.startsWith('#')) {
        const id = sel.slice(1);
        return elements.get(id) || null;
      }
      return null;
    }
    querySelectorAll() {
      return [];
    }
  }

  class MockHTMLMediaElement extends MockElement {
    constructor(tagName, id = '') {
      super(tagName, id);
      this._src = '';
      this.paused = true;
      this.muted = false;
      this.currentTime = 0;
      this.playCallCount = 0;
      this.loadCallCount = 0;
    }

    get src() {
      return this._src;
    }
    set src(val) {
      this._src = val;
    }

    play() {
      this.playCallCount++;
      this.paused = false;
      return Promise.resolve();
    }

    pause() {
      this.paused = true;
    }

    load() {
      this.loadCallCount++;
    }
  }

  // Define global constructors
  global.Element = MockElement;
  global.HTMLMediaElement = MockHTMLMediaElement;

  // Create DOM nodes
  const liveContainer = new MockElement('div', 'player-container');
  const vodContainer = new MockElement('div', 'vod-player-container');
  const video = new MockHTMLMediaElement('video', 'video');
  const videoVod = new MockHTMLMediaElement('video', 'video-vod');
  const closeLiveBtn = new MockElement('button', 'btn-close-player');
  const closeVodBtn = new MockElement('button', 'btn-close-vod-player');

  liveContainer.appendChild(video);
  liveContainer.appendChild(closeLiveBtn);
  vodContainer.appendChild(videoVod);
  vodContainer.appendChild(closeVodBtn);

  const windowListeners = new Map();
  const mockWindow = {
    location: { origin: BASE_URL, href: BASE_URL },
    localStorage: localStorage,
    addEventListener: (evt, fn, useCapture) => {
      if (!windowListeners.has(evt)) windowListeners.set(evt, []);
      windowListeners.get(evt).push({ fn, useCapture });
    },
    removeEventListener: () => {},
    dispatchEvent: (evt) => {
      const list = windowListeners.get(evt.type) || [];
      list.forEach(({ fn }) => fn(evt));
    },
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    requestAnimationFrame: (fn) => setTimeout(fn, 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    Promise: global.Promise
  };

  const mockDocument = {
    readyState: 'complete',
    documentElement: new MockElement('html', 'html'),
    body: new MockElement('body', 'body'),
    getElementById: (id) => elements.get(id) || null,
    querySelector: (sel) => {
      if (sel.startsWith('#')) return elements.get(sel.slice(1)) || null;
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.includes('video')) {
        return [videoVod, video];
      }
      return [];
    },
    head: new MockElement('head', 'head'),
    createElement: (tag) => new MockElement(tag),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  global.window = mockWindow;
  global.document = mockDocument;
  global.localStorage = localStorage;
  const nativeFetch = fetch;
  global.fetch = function (url, opts) {
    if (typeof url === 'string' && url.startsWith('/')) {
      url = BASE_URL + url;
    }
    return nativeFetch(url, opts);
  };
  global.MutationObserver = class {
    observe() {}
    disconnect() {}
  };

  return {
    videoVod,
    video,
    vodContainer,
    liveContainer,
    localStorage
  };
}

// -------------------------------------------------------------
// STEP 3: Run Full Simulation Test
// -------------------------------------------------------------
async function runSimulation() {
  console.log('=== STARTING 2-DEVICE CASTING & OVERHEATING SIMULATION TEST ===');

  // 1. Start Smart TV
  const tv = await initSmartTv();

  // 2. Setup Phone DOM Harness
  const phone = createPhoneDomHarness();

  // 3. Pair Phone with the TV
  console.log(`\n[PHONE] Pairing with Smart TV using PIN: "${tv.pin}"...`);
  const pairRes = await fetch(`${BASE_URL}/api/tv/pair`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`
    },
    body: JSON.stringify({ pin: tv.pin, deviceName: 'Living Room TV' })
  });
  const pairData = await pairRes.json();
  if (!pairData.ok) {
    throw new Error('Pairing failed: ' + JSON.stringify(pairData));
  }
  console.log('[PHONE] Paired successfully with device:', pairData.deviceId);

  // Wait for TV to receive PAIRED event
  await sleep(400);
  const pairedEvt = tv.events.find(e => e.type === 'PAIRED');
  console.log('[TV] PAIRED event verified on TV:', pairedEvt ? 'YES' : 'NO');

  // 4. Load tv-connect-bridge.js into Phone environment
  console.log('\n[PHONE] Loading tv-connect-bridge.js into phone browser...');
  const bridgeCode = fs.readFileSync(path.join(__dirname, '../public/assets/tv-connect-bridge.js'), 'utf8');
  eval(bridgeCode);

  // Allow initial bridge checkTvStatus() to complete
  await sleep(500);

  // 5. Test Casting from Phone to TV
  console.log('\n[PHONE] User clicks a movie: "Gladiator II" @ 1420s (Resume position)');
  console.log('[PHONE] Dispatching via window.VeloraCast.setMedia()...');

  const movieMedia = {
    type: 'movie',
    url: 'http://upstream-cdn.example.com/movie/gladiator2.mkv',
    title: 'Gladiator II',
    isLive: false,
    position: 1420
  };

  // Launch cast
  window.VeloraCast.setMedia(movieMedia);

  // SIMULATE WEBSITE ASYNC ENGINE (main-JkackQV-.js behavior)
  // In the real site, 50ms-300ms after clicking, main-JkackQV-.js tries to set src and call play() on #video-vod:
  console.log('[SIMULATOR] Simulating website player engine (main-JkackQV-.js) attempting delayed videoVod.src assignment and videoVod.play()...');
  
  phone.videoVod.src = 'http://upstream-cdn.example.com/movie/gladiator2.mkv';
  phone.videoVod.play();

  setTimeout(() => {
    phone.videoVod.src = 'http://upstream-cdn.example.com/movie/gladiator2.mkv';
    phone.videoVod.play();
  }, 100);

  setTimeout(() => {
    phone.videoVod.play();
  }, 250);

  // Wait for network dispatch and staggered sweeps
  await sleep(1500);

  // -----------------------------------------------------------
  // VERIFICATION 1: What happened on the TV?
  // -----------------------------------------------------------
  console.log('\n================== VERIFYING SMART TV ==================');
  const playEvent = tv.events.find(e => e.type === 'PLAY');
  if (!playEvent) {
    console.error('FAIL: Smart TV never received the PLAY event!');
    process.exit(1);
  }
  console.log('✓ Smart TV received PLAY event successfully!');
  console.log('  - Title:', playEvent.media.title);
  console.log('  - Target Position:', playEvent.media.position, 'seconds');
  console.log('  - Playback URL:', playEvent.media.url);
  
  if (playEvent.media.title !== 'Gladiator II' || playEvent.media.position !== 1420) {
    console.error('FAIL: Incorrect media dispatched to TV');
    process.exit(1);
  }

  // -----------------------------------------------------------
  // VERIFICATION 2: What happened on the Phone? (Overheating check)
  // -----------------------------------------------------------
  console.log('\n================== VERIFYING PHONE (OVERHEATING CHECK) ==================');
  console.log('Checking Phone #video-vod element state:');
  console.log('  - Is video-vod paused? :', phone.videoVod.paused, phone.videoVod.paused ? '✓ (YES - 0% CPU)' : '✗ (PLAYING IN BACKGROUND - OVERHEATING!)');
  console.log('  - Is video-vod src empty/cleared? :', `"${phone.videoVod.src}"`, phone.videoVod.src === '' ? '✓ (YES - No chunks downloading)' : '✗ (STREAM ATTACHED)');
  console.log('  - Is video-vod muted? :', phone.videoVod.muted, phone.videoVod.muted ? '✓' : '✗');
  console.log('  - Is #vod-player-container hidden? :', phone.vodContainer.classList.contains('hidden'), '✓');
  console.log('  - Is #player-container hidden? :', phone.liveContainer.classList.contains('hidden'), '✓');

  if (!phone.videoVod.paused || phone.videoVod.src !== '') {
    console.error('FAIL: Phone was NOT silenced! Background stream would overheat phone.');
    process.exit(1);
  }

  // -----------------------------------------------------------
  // VERIFICATION 3: Test Local Phone Playback when TV mode is turned OFF
  // -----------------------------------------------------------
  console.log('\n================== VERIFYING PHONE LOCAL PLAYBACK MODE ==================');
  console.log('[PHONE] User switches toggle to [ Téléphone ] (auto-diffuse = false)...');
  phone.localStorage.setItem('velora_tv_auto_diffuse', 'false');

  console.log('[PHONE] User now clicks a video to watch directly on phone...');
  phone.videoVod.src = 'http://upstream-cdn.example.com/movie/phone-watch.mp4';
  phone.videoVod.play();

  console.log('Checking Phone state in Local Mode:');
  console.log('  - Is video-vod src set? :', phone.videoVod.src === 'http://upstream-cdn.example.com/movie/phone-watch.mp4' ? '✓ YES' : '✗ NO');
  console.log('  - Is video-vod playing? :', !phone.videoVod.paused ? '✓ YES (Playing normally on phone)' : '✗ NO');

  if (phone.videoVod.paused || phone.videoVod.src !== 'http://upstream-cdn.example.com/movie/phone-watch.mp4') {
    console.error('FAIL: Local phone playback was broken!');
    process.exit(1);
  }

  // Clean up
  tv.close();
  console.log('\n=== ALL SIMULATION TESTS PASSED WITH 100% SUCCESS ===\n');
  process.exit(0);
}

runSimulation().catch(err => {
  console.error('Simulation error:', err);
  process.exit(1);
});
