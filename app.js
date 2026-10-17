(function () {
  'use strict';

  // Your Apps Script web app URL (read-only backend)
  var API_URL = 'https://script.google.com/macros/s/AKfycbx6Zps8wKcm1euUKbEtiY5FBBzxaBw5-918i0IOl7ghwp7f-mBijSN5mrTRUvnlVwuy/exec';
  var CACHE_KEY = 'mylinks_cache_v1';

  var listEl = document.getElementById('list');
  var emptyEl = document.getElementById('empty');
  var chipsEl = document.getElementById('chips');
  var searchEl = document.getElementById('search');
  var statusEl = document.getElementById('status');
  var refreshBtn = document.getElementById('refresh');

  var items = [];
  var activeCategory = 'All';
  var query = '';

  // ---------- helpers ----------

  function safeUrl(value) {
    try {
      var u = new URL(String(value));
      if (u.protocol === 'http:' || u.protocol === 'https:') return u;
    } catch (e) { /* invalid */ }
    return null;
  }

  function sanitize(data) {
    var out = [];
    if (!data || !Array.isArray(data.items)) return out;
    data.items.forEach(function (it) {
      if (!it) return;
      var u = safeUrl(it.link);
      var name = String(it.name == null ? '' : it.name).trim();
      if (!u || !name) return;
      out.push({
        name: name.slice(0, 120),
        link: u.href,
        host: u.hostname.replace(/^www\./, ''),
        category: String(it.category == null ? '' : it.category).trim().slice(0, 60),
        note: String(it.note == null ? '' : it.note).trim().slice(0, 300)
      });
    });
    return out;
  }

  function saveCache(list) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), items: list }));
    } catch (e) { /* storage full or blocked */ }
  }

  function loadCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (obj && Array.isArray(obj.items)) return obj;
    } catch (e) { /* ignore */ }
    return null;
  }

  function setStatus(text) { statusEl.textContent = text; }

  function timeAgo(t) {
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' h ago';
    return Math.round(h / 24) + ' d ago';
  }

  // ---------- rendering ----------

  function categories() {
    var seen = {};
    var out = ['All'];
    items.forEach(function (it) {
      if (it.category && !seen[it.category]) {
        seen[it.category] = true;
        out.push(it.category);
      }
    });
    return out;
  }

  function renderChips() {
    var cats = categories();
    if (cats.indexOf(activeCategory) === -1) activeCategory = 'All';
    chipsEl.textContent = '';
    cats.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', c === activeCategory ? 'true' : 'false');
      b.textContent = c;
      b.addEventListener('click', function () {
        activeCategory = c;
        renderChips();
        renderList();
      });
      chipsEl.appendChild(b);
    });
  }

  function matches(it) {
    if (activeCategory !== 'All' && it.category !== activeCategory) return false;
    if (!query) return true;
    var hay = (it.name + ' ' + it.note + ' ' + it.category + ' ' + it.host).toLowerCase();
    return query.split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; });
  }

  function renderList() {
    listEl.textContent = '';
    var shown = items.filter(matches);

    shown.forEach(function (it) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.className = 'row';
      a.href = it.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';

      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = it.name;
      a.appendChild(name);

      if (it.note) {
        var note = document.createElement('span');
        note.className = 'note';
        note.textContent = it.note;
        a.appendChild(note);
      }

      var meta = document.createElement('span');
      meta.className = 'meta';
      var host = document.createElement('span');
      host.className = 'host';
      host.textContent = it.host;
      meta.appendChild(host);
      if (it.category) {
        var tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = it.category;
        meta.appendChild(tag);
      }
      a.appendChild(meta);

      li.appendChild(a);
      listEl.appendChild(li);
    });

    if (!items.length) {
      emptyEl.textContent = 'No links yet. Add rows in your Google Sheet.';
      emptyEl.hidden = false;
    } else if (!shown.length) {
      emptyEl.textContent = 'No links match your search.';
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
    }
  }

  function render() {
    renderChips();
    renderList();
  }

  // ---------- loading ----------

  function fetchWithTimeout(url, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; reject(new Error('timeout')); }
      }, ms);
      fetch(url, { method: 'GET', credentials: 'omit', redirect: 'follow', cache: 'no-store' })
        .then(function (r) {
          if (done) return;
          done = true; clearTimeout(timer); resolve(r);
        })
        .catch(function (e) {
          if (done) return;
          done = true; clearTimeout(timer); reject(e);
        });
    });
  }

  function load() {
    refreshBtn.disabled = true;
    setStatus('Updating…');
    return fetchWithTimeout(API_URL, 15000)
      .then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || data.ok !== true) throw new Error('bad response');
        items = sanitize(data);
        saveCache(items);
        render();
        setStatus(items.length + (items.length === 1 ? ' link' : ' links') + ', updated just now');
      })
      .catch(function () {
        var cached = loadCache();
        if (cached) {
          setStatus('Offline or unavailable. Showing saved list from ' + timeAgo(cached.t) + '.');
        } else {
          setStatus('Could not load links. Check your internet and tap Refresh.');
        }
      })
      .then(function () { refreshBtn.disabled = false; });
  }

  // ---------- events ----------

  searchEl.addEventListener('input', function () {
    query = searchEl.value.trim().toLowerCase();
    renderList();
  });

  refreshBtn.addEventListener('click', load);

  // Show saved list instantly, then refresh from the Sheet
  var cached = loadCache();
  if (cached) {
    items = sanitize({ items: cached.items });
    render();
    setStatus(items.length + (items.length === 1 ? ' link' : ' links') + ', saved ' + timeAgo(cached.t));
  } else {
    render();
  }
  load();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline shell optional */ });
    });
  }
})();
