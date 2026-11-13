async function watchReleaseUpdates() {
  // Update instructions are for the workspace, where a visit can hold a draft.
  if (!document.body.classList.contains('workspace')) return;
  const registration = await navigator.serviceWorker.getRegistration() || await navigator.serviceWorker.register('/sw.js');
  if (!registration) return;

  let noticed, notice;
  function showWaitingRelease() {
    const {active, waiting} = registration;
    if (!active || !waiting || waiting === noticed) return;
    noticed = waiting;
    notice?.remove();
    notice = document.createElement('aside');
    notice.className = 'release-update';
    notice.setAttribute('aria-label', 'NOX update');
    const message = document.createElement('p');
    message.setAttribute('role', 'status');
    message.textContent = 'NOX update ready. Export any guest chat you want to keep, then close all NOX tabs and app windows and reopen NOX.';
    const later = document.createElement('button');
    later.type = 'button';
    later.textContent = 'Later';
    later.addEventListener('click', () => notice.remove());
    notice.append(message, later);
    document.body.append(notice);
  }

  function watchInstallation() {
    registration.installing?.addEventListener('statechange', showWaitingRelease);
  }

  function checkForUpdate() {
    if (registration.active && !registration.installing && document.visibilityState === 'visible' && navigator.onLine) {
      registration.update().then(showWaitingRelease).catch(() => {});
    }
  }

  registration.addEventListener('updatefound', watchInstallation);
  watchInstallation();
  showWaitingRelease();
  checkForUpdate();
  document.addEventListener('visibilitychange', checkForUpdate);
  window.addEventListener('online', checkForUpdate);
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  watchReleaseUpdates().catch(() => {
    const note = document.getElementById('install-note');
    if (note) note.textContent = 'NOX works in this browser. Offline support is unavailable here.';
  });
}
