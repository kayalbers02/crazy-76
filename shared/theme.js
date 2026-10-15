/* Crazy 76: thema Glas of Nitro (gedeeld door teamapp en dashboard). Alles hier is alleen uiterlijk.
   C76.theme.get()      -> 'glas' | 'nitro'
   C76.theme.set(naam)  -> zet <html data-theme>, bewaart in localStorage 'c76-thema',
                           werkt <meta name="theme-color"> bij en zet knoppen [data-set-theme] goed.
   Knoppen <button data-set-theme="glas|nitro" aria-pressed> werken vanzelf (klik = set).
   Letters zoals Vat Nein: Glas laadt Inter (alleen gebruikt buiten Apple-apparaten), Nitro Bodoni Moda.
   Het stylesheet wordt niet-blokkerend ingevoegd; bestaat de link al, dan gebeurt er niets.
   Verder (Vat Nein-uiterlijk, geen gedrag):
   - .aurora: het levende licht van Glas (vier lichtvlekken als kleine bitmaps) + korrel (--grain);
   - span.glass-rim in nav.tabbar: de spiegelende rand van het glas;
   - gloed onder de vinger: zet --px/--py op de ingedrukte knop en de klasse .is-pressed
     (gedelegeerd, passief; werkt ook voor knoppen die later met innerHTML ontstaan);
   - een lege passieve touchstart-luisteraar, zodat iOS :active toont. */
(function () {
  'use strict';
  var C76 = window.C76 = window.C76 || {};
  var KEY = 'c76-thema';
  var NAMES = ['glas', 'nitro'];
  var COLORS = { glas: '#04170f', nitro: '#0a0706' };   // terugval; de echte waarde is het token --theme-color
  var FONTS = {
    glas: 'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&display=swap',
    nitro: 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&display=swap'
  };
  var FAMILY = { glas: 'family=Inter', nitro: 'family=Bodoni+Moda' };
  var root = document.documentElement;

  function valid(name) { return NAMES.indexOf(name) !== -1; }

  function get() {
    var t = root.getAttribute('data-theme');
    return valid(t) ? t : 'glas';
  }

  function syncButtons(name) {
    var btns = document.querySelectorAll('[data-set-theme]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', String(btns[i].getAttribute('data-set-theme') === name));
    }
  }

  function token(name) {
    try { return getComputedStyle(root).getPropertyValue(name).trim(); } catch (e) { return ''; }
  }

  function syncMeta(name) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.setAttribute('content', token('--theme-color') || COLORS[name]);
  }

  // Een door script ingevoegd stylesheet blokkeert de eerste weergave niet.
  function ensureFont(name) {
    if (!FONTS[name] || document.querySelector('link[href*="' + FAMILY[name] + '"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = FONTS[name];
    (document.head || root).appendChild(l);
  }

  // ---------- Levend licht (Glas): Vat Nein .aurora ----------
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rgba(str) {   // 'rgba(28, 176, 104, .52)' -> [28, 176, 104, 0.52]
    var m = /rgba?\(([^)]+)\)/.exec(str || '');
    if (!m) return null;
    var p = m[1].split(',');
    if (p.length < 3) return null;
    var a = p.length > 3 ? parseFloat(p[3]) : 1;
    return [parseFloat(p[0]), parseFloat(p[1]), parseFloat(p[2]), isNaN(a) ? 1 : a];
  }
  var blobsDone = false;
  function blobBitmaps() {
    // De verlopen op de <i> blijven de terugval; als bitmap rekt de GPU een plaatje van 256px op.
    if (blobsDone || get() !== 'glas') return;
    var a = document.querySelector('.aurora');
    if (!a) return;
    try {
      var els = a.querySelectorAll('i.blob');
      for (var i = 0; i < els.length; i++) {
        var b = rgba(token('--aurora-' + (i + 1)));
        if (!b || !b[3]) return;   // tokens nog niet beschikbaar: later opnieuw
        var c = canvas(256, 256), g = c.getContext('2d');
        var rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        rg.addColorStop(0, 'rgba(' + b[0] + ',' + b[1] + ',' + b[2] + ',' + b[3] + ')');
        rg.addColorStop(1, 'rgba(' + b[0] + ',' + b[1] + ',' + b[2] + ',0)');
        g.fillStyle = rg;
        g.fillRect(0, 0, 256, 256);
        var im = new Image();
        im.alt = '';
        im.className = els[i].className;
        im.src = c.toDataURL();
        els[i].parentNode.replaceChild(im, els[i]);
      }
      blobsDone = true;
    } catch (e) { /* geen canvas: de CSS-verlopen blijven */ }
  }
  function ensureAurora() {
    if (!document.body || document.querySelector('.aurora')) return;
    var a = document.createElement('div');
    a.className = 'aurora';
    a.setAttribute('aria-hidden', 'true');
    a.innerHTML = '<i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><i class="blob b4"></i>';
    document.body.insertBefore(a, document.body.firstChild);
    try {   // fijne korrel tegen banding in het achtergrondlicht (Vat Nein)
      var n = canvas(128, 128), ng = n.getContext('2d'), img = ng.createImageData(128, 128), d = img.data;
      for (var p = 0; p < d.length; p += 4) {
        var v = Math.random() < 0.5 ? 0 : 255;
        d[p] = d[p + 1] = d[p + 2] = v;
        d[p + 3] = (6 + Math.random() * 10) * 0.6;   // dekking van de korrel zit al in het plaatje
      }
      ng.putImageData(img, 0, 0);
      root.style.setProperty('--grain', 'url(' + n.toDataURL() + ')');
    } catch (e) { /* geen korrel */ }
    blobBitmaps();
  }

  // ---------- Spiegelende rand op de tabbalk (de ::before/::after van de balk zijn al bezet) ----------
  function ensureRims() {
    var bars = document.querySelectorAll('nav.tabbar');
    for (var i = 0; i < bars.length; i++) {
      var has = false, kids = bars[i].children;
      for (var k = 0; k < kids.length; k++) if (kids[k].classList.contains('glass-rim')) has = true;
      if (has) continue;
      var r = document.createElement('span');
      r.className = 'glass-rim';
      r.setAttribute('aria-hidden', 'true');
      bars[i].appendChild(r);
    }
  }

  function set(name) {
    if (!valid(name)) return get();
    try { localStorage.setItem(KEY, name); } catch (e) { /* privé-venster of geblokkeerd: alleen deze sessie */ }
    if (root.getAttribute('data-theme') !== name) {
      // Geen 76 kaarten die tegelijk van kleur overgaan: overgangen even uit.
      root.classList.add('c76-theme-switching');
      root.setAttribute('data-theme', name);
      var done = function () { root.classList.remove('c76-theme-switching'); };
      if (window.requestAnimationFrame) requestAnimationFrame(function () { requestAnimationFrame(done); });
      else setTimeout(done, 50);
    }
    ensureFont(name);
    blobBitmaps();
    syncMeta(name);
    syncButtons(name);
    return name;
  }

  C76.theme = { get: get, set: set, names: NAMES.slice() };

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-set-theme]') : null;
    if (!el) return;
    set(el.getAttribute('data-set-theme'));
    // Na een muis- of vingertik geen focus laten staan (e.detail = aantal klikken; 0 bij toetsenbord),
    // anders slaat een scherm dat 'niet bijwerken zolang er focus in zit' zijn updates over.
    if (e.detail && el.blur) el.blur();
  });
  document.addEventListener('touchstart', function () {}, { passive: true });

  // ---------- Indrukken: gloed onder de vinger (Vat Nein pressable), gedelegeerd ----------
  // Alleen uiterlijk: zet --px/--py en .is-pressed; de schaal komt uit CSS (:active).
  var PRESS = '.btn, .icon-btn, .chips > button, .toast button, .tabbar > button, .seg, .team-btn, .team-pick, button.timer, .glass';
  var held = null;
  var opts = { capture: true, passive: true };
  function unpress() { if (held) { held.classList.remove('is-pressed'); held = null; } }
  document.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return;
    var el = e.target && e.target.closest ? e.target.closest(PRESS) : null;
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    var r = el.getBoundingClientRect();
    el.style.setProperty('--px', (e.clientX - r.left) + 'px');
    el.style.setProperty('--py', (e.clientY - r.top) + 'px');
    unpress();
    held = el;
    el.classList.add('is-pressed');
  }, opts);
  ['pointerup', 'pointercancel', 'dragstart'].forEach(function (t) { document.addEventListener(t, unpress, opts); });
  document.addEventListener('pointerout', function (e) { if (held && !held.contains(e.relatedTarget)) unpress(); }, opts);
  window.addEventListener('blur', unpress);

  function init() {
    var t = get();
    ensureFont(t);
    ensureAurora();
    ensureRims();
    syncButtons(t);
    syncMeta(t);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
