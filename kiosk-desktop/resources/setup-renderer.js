// Plain script for resources/setup.html -- intentionally not TypeScript/
// bundled, since this is a single tiny local page shipped as-is (not part
// of the reused kiosk React app). Talks only to the narrow
// `window.hdspKioskAdmin` API exposed by src/preload/index.ts.
(function () {
  var form = document.getElementById('setupForm');
  var serverAddressInput = document.getElementById('serverAddress');
  var codeInput = document.getElementById('activationCode');
  var errorEl = document.getElementById('error');
  var statusEl = document.getElementById('status');
  var submitBtn = document.getElementById('submitBtn');

  if (window.hdspKioskAdmin && window.hdspKioskAdmin.getState) {
    window.hdspKioskAdmin.getState().then(function (state) {
      if (state && state.serverAddress) {
        serverAddressInput.value = state.serverAddress;
        statusEl.textContent = 'This till was previously activated against ' + state.serverAddress + '. Activating again will replace that registration.';
      }
    });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Activating...';

    window.hdspKioskAdmin
      .activate({
        serverAddress: serverAddressInput.value.trim(),
        activationCode: codeInput.value.trim(),
      })
      .then(function (result) {
        if (!result || !result.ok) {
          errorEl.textContent = (result && result.error) || 'Could not activate this kiosk.';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Activate Kiosk';
        }
        // On success, the main process switches this window over to the
        // real kiosk URL itself -- see main/index.ts's handleActivated.
      })
      .catch(function (err) {
        errorEl.textContent = String((err && err.message) || err);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Activate Kiosk';
      });
  });
})();
