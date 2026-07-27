/*
 * Cloud data storage + live sync for the IHSAS Portal.
 * The page UI is untouched: this only replaces the browser-only storage
 * with a shared cloud record, reached through the app's own server API
 * (the database itself is no longer exposed to the public internet).
 */
(function () {
  var ENDPOINT = "/api/public/portal-state";
  var POLL_MS = 2000;

  var KEYS = [
    "ihsas_portal_official_events_clean_v8",
    "ihsas_portal_official_circulars_clean_v8",
    "ihsas_portal_official_resets_v8",
    "ihsas_portal_official_grievances_v8",
    "ihsas_portal_official_bookings_v8",
    "ihsas_portal_official_allocations_v8",
    "ihsas_portal_official_portal_logo_v8",
  ];

  var CLIENT_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var applyingRemote = false;
  var pushTimer = null;
  var lastSeen = "";

  function collect() {
    var out = {};
    KEYS.forEach(function (k) {
      var v = localStorage.getItem(k);
      if (typeof v === "string") out[k] = v;
    });
    return out;
  }

  function applyRemote(data) {
    if (!data || typeof data !== "object") return false;
    var touched = false;
    KEYS.forEach(function (k) {
      if (typeof data[k] === "string" && localStorage.getItem(k) !== data[k]) {
        localStorage.setItem(k, data[k]);
        touched = true;
      }
    });
    return touched;
  }

  function pushNow() {
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID, data: collect() }),
    }).catch(function () {
      /* offline: keep local copy, retry on next save */
    });
  }

  var originalSave = window.saveStateToLocalStorage;
  window.saveStateToLocalStorage = function () {
    if (typeof originalSave === "function") originalSave.apply(this, arguments);
    if (applyingRemote) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 250);
  };

  function safe(fn) {
    try {
      if (typeof fn === "function") fn();
    } catch (e) {
      /* ignore per-section render issues */
    }
  }

  function rerenderAll() {
    safe(window.loadStateFromLocalStorage);
    safe(window.renderPortalLogo);
    safe(window.renderUserNavBarProfile);
    safe(window.renderPublicFeed);
    safe(window.renderLeaderboard);
    safe(window.renderCirculars);
    safe(window.renderExplorerMenus);
    safe(window.renderBatchVisualsGrid);
    safe(window.renderGrievances);
    safe(window.renderBookings);
    if (window.state && window.state.currentUser) {
      safe(window.renderWorkspace);
      safe(window.renderVerificationDesk);
    }
    safe(window.updateLiveStats);
    safe(window.updateCharts);
    safe(function () {
      window.lucide.createIcons();
    });
  }

  function pull(initial) {
    return fetch(ENDPOINT, { headers: { accept: "application/json" } })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (body) {
        if (!body) return;
        if (body.clientId === CLIENT_ID && !initial) return;
        var stamp = String(body.updatedAt || "");
        if (!initial && stamp && stamp === lastSeen) return;
        lastSeen = stamp;
        applyingRemote = true;
        var changed = applyRemote(body.data);
        applyingRemote = false;
        if (changed && !initial) rerenderAll();
      })
      .catch(function () {
        /* transient network issue */
      });
  }

  var originalOnload = window.onload;

  window.onload = function () {
    var run = function () {
      if (typeof originalOnload === "function") originalOnload();
      setInterval(function () {
        pull(false);
      }, POLL_MS);
    };
    pull(true).then(run, run);
  };
})();
