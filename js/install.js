// install.js — "App laden": service worker for offline use + install to home screen
const $ = (id) => document.getElementById(id);
const btn = $('installBtn');
const dialog = $('installDialog');
const go = $('installGo');
const offline = $('offlineStatus');
const steps = { ios: $('stepsIos'), android: $('stepsAndroid'), desktop: $('stepsDesktop') };

const standalone = matchMedia('(display-mode: standalone)').matches
  || matchMedia('(display-mode: fullscreen)').matches
  || navigator.standalone === true;
const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
let deferredPrompt = null;

$('installUrl').textContent = location.origin + location.pathname;

function setOffline(state, text) {
  offline.dataset.state = state;
  offline.textContent = text;
}

function renderSteps() {
  go.hidden = !deferredPrompt;
  steps.ios.hidden = !isIOS;
  steps.android.hidden = !isAndroid || !!deferredPrompt;
  steps.desktop.hidden = isIOS || isAndroid;
}

/* ---------- service worker ---------- */
const swSupported = 'serviceWorker' in navigator && window.isSecureContext;
if (swSupported) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg?.type !== 'status') return;
    if (msg.cached >= msg.total) {
      const mb = msg.bytes ? ` (${(msg.bytes / 1e6).toFixed(1).replace('.', ',')} MB)` : '';
      setOffline('ready', `✓ Offline verfügbar${mb}`);
    } else {
      setOffline('loading', `Offline-Paket wird geladen … ${msg.cached} von ${msg.total}`);
      setTimeout(requestStatus, 1500);
    }
  });
  const failed = () => setOffline('error', 'Offline-Paket konnte nicht geladen werden – bitte mit Internet neu laden.');
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    // addAll() is all-or-nothing: a dropped connection makes the installing worker redundant
    const watch = (worker) => worker?.addEventListener('statechange', () => {
      if (worker.state === 'redundant' && !reg.active) failed();
    });
    watch(reg.installing);
    reg.addEventListener('updatefound', () => watch(reg.installing));
  }).catch((err) => {
    console.warn('Service worker registration failed', err);
    setOffline('error', 'Offline-Modus nicht verfügbar – die App braucht dann Internet.');
  });
} else {
  setOffline('error', 'Offline-Modus wird von diesem Browser nicht unterstützt.');
}

async function requestStatus() {
  if (!swSupported) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  if (reg.active) reg.active.postMessage({ type: 'status' });
  else if (reg.installing || reg.waiting) setTimeout(requestStatus, 1000);   // still downloading
  else setOffline('error', 'Offline-Paket konnte nicht geladen werden – bitte mit Internet neu laden.');
}

/* ---------- install prompt ---------- */
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  renderSteps();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  btn.hidden = true;
  if (dialog.open) dialog.close();
});

go.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === 'accepted') dialog.close();
  renderSteps();
});

if (!standalone) {
  btn.hidden = false;
  btn.addEventListener('click', () => {
    renderSteps();
    dialog.showModal();
    requestStatus();
  });
  // keep game shortcuts (1/2/3, Esc) from reaching the show while the dialog is open
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
}
