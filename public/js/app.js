(function () {
  'use strict';

  // ---- Live clock driven by the SERVER time (device clock only used to tick) ----
  var clock = document.querySelector('.clock[data-server-now]');
  if (clock) {
    var offset = Number(clock.getAttribute('data-server-now')) - Date.now();
    var tz = clock.getAttribute('data-tz');
    var timeEl = document.getElementById('clock-time');
    var dateEl = document.getElementById('clock-date');
    var timeFmt, dateFmt;
    try {
      timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    } catch (e) { /* very old browser: keep server-rendered text */ }

    var tick = function () {
      if (!timeFmt) return;
      var now = new Date(Date.now() + offset);
      timeEl.textContent = timeFmt.format(now).toUpperCase();
      dateEl.textContent = dateFmt.format(now);
    };
    tick();
    setInterval(tick, 1000);

    // If the page sits open past midnight, reload so status/today are fresh.
    var loadedDay = dateEl.textContent;
    setInterval(function () {
      if (dateEl.textContent !== loadedDay) location.reload();
    }, 30000);
  }

  // ---- Prevent double submits on action buttons ----
  document.querySelectorAll('form.one-click').forEach(function (form) {
    form.addEventListener('submit', function () {
      var btn = form.querySelector('button[type="submit"]');
      if (btn) {
        setTimeout(function () { btn.disabled = true; btn.textContent = 'Please wait…'; }, 0);
      }
    });
  });

  // ---- Confirmation dialogs: <form data-confirm="Are you sure?"> ----
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!window.confirm(form.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // ---- Mobile menu ----
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // ---- Records filter: switch between "month" and "date range" ----
  var modeSelect = document.getElementById('filter-mode');
  if (modeSelect) {
    var update = function () {
      document.querySelectorAll('[data-mode]').forEach(function (el) {
        var show = el.getAttribute('data-mode') === modeSelect.value;
        el.hidden = !show;
        el.querySelectorAll('input').forEach(function (i) { i.disabled = !show; });
      });
    };
    modeSelect.addEventListener('change', update);
    update();
  }

  // ---- Auto-submit filter selects that ask for it ----
  document.querySelectorAll('[data-autosubmit]').forEach(function (el) {
    el.addEventListener('change', function () { el.form.submit(); });
  });
})();
