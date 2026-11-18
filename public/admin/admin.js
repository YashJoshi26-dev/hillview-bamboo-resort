(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  var SLOTS = [
    ['hero', 'Homepage banner', 'Large image at the top of the homepage'],
    ['stayA', 'Resort intro (1)', 'About section, first image'],
    ['stayB', 'Resort intro (2)', 'About section, second image'],
    ['roomOne', 'One cottage', 'Rates section'],
    ['roomThree', 'All three cottages', 'Rates section'],
    ['roomWhole', 'Whole property', 'Rates section'],
    ['party', 'Party hall & lawn', 'Party section']
  ];

  var inr = function (n) { return '\u20B9' + Number(n).toLocaleString('en-IN'); };
  var state = { saved: null, draft: null };
  var toastTimer;

  /* ---------- api ---------- */
  function api(method, url, body, isForm) {
    var opts = { method: method, headers: { 'X-Requested-With': 'admin' }, credentials: 'same-origin' };
    if (body && !isForm) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    if (isForm) opts.body = body;
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && url !== '/api/admin/login') { showLogin(); throw new Error('Your session has expired. Please sign in again.'); }
        if (!r.ok) throw new Error(j.error || 'Request failed');
        return j;
      });
    });
  }

  function toast(msg, bad) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast on' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 3200);
  }
  var fail = function (e) { toast(e.message, true); };

  function el(tag, props, children) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'class') n.className = props[k];
      else if (k === 'text') n.textContent = props[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), props[k]);
      else n.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  /* ---------- auth ---------- */
  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#pw').focus(); }
  function showApp() { $('#login').hidden = true; $('#app').hidden = false; }

  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    $('#login-err').textContent = '';
    api('POST', '/api/admin/login', { password: $('#pw').value })
      .then(function () { $('#pw').value = ''; boot(); })
      .catch(function (err) { $('#login-err').textContent = err.message; });
  });
  $('#pw-show').addEventListener('click', function () {
    var p = $('#pw'), show = p.type === 'password';
    p.type = show ? 'text' : 'password'; this.textContent = show ? 'Hide' : 'Show';
  });
  $('#logout').addEventListener('click', function () {
    api('POST', '/api/admin/logout').finally(showLogin);
  });

  /* ---------- tabs ---------- */
  $$('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('.tabs button').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
      $$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== b.dataset.tab; });
    });
  });

  /* ---------- dirty tracking ---------- */
  function isDirty() { return JSON.stringify(state.draft) !== JSON.stringify(state.saved); }
  function refreshBar() { $('#savebar').hidden = !isDirty(); }
  window.addEventListener('beforeunload', function (e) { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- prices ---------- */
  ['one', 'three', 'whole'].forEach(function (k) {
    $('#p-' + k).addEventListener('input', function (e) {
      state.draft.prices[k] = e.target.value === '' ? '' : Number(e.target.value);
      renderShown(); refreshBar();
    });
  });
  function renderShown() {
    ['one', 'three', 'whole'].forEach(function (k) {
      var v = state.draft.prices[k];
      $('[data-shown="' + k + '"]').textContent = v ? 'Displayed on website: ' + inr(v) : '';
    });
  }
  function renderPrices() {
    ['one', 'three', 'whole'].forEach(function (k) { $('#p-' + k).value = state.draft.prices[k]; });
    renderShown();
  }

  /* ---------- uploads ---------- */
  var MAX_SIDE = 1920;
  /* Phone photos are often 5-12 MB. Resize + re-encode in the browser so uploads are fast and the site stays quick. */
  function compress(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || !window.createImageBitmap) return Promise.resolve(file);
    return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (bmp) {
      var scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      var w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          if (!blob || (scale === 1 && blob.size >= file.size)) return resolve(file);
          resolve(new File([blob], 'photo.webp', { type: 'image/webp' }));
        }, 'image/webp', 0.86);
      });
    }).catch(function () { return file; });
  }
  function uploadFile(file) {
    return compress(file).then(function (f) {
      if (f.size > 4 * 1024 * 1024) throw new Error('This image exceeds 4 MB. Please choose a smaller image.');
      var fd = new FormData();
      fd.append('file', f);
      return api('POST', '/api/admin/upload', fd, true).then(function (j) { return j.url; });
    });
  }
  function pickFile(multiple, cb) {
    var inp = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
    inp.multiple = !!multiple;
    inp.addEventListener('change', function () { cb([].slice.call(inp.files)); });
    inp.click();
  }

  /* ---------- main pictures ---------- */
  function renderSlots() {
    var wrap = $('#slots');
    wrap.replaceChildren.apply(wrap, SLOTS.map(function (s) {
      var img = el('img', { src: state.draft.images[s[0]], alt: s[1], loading: 'lazy' });
      var btn = el('button', { class: 'btn ghost sm', type: 'button', text: 'Replace' });
      btn.addEventListener('click', function () {
        pickFile(false, function (files) {
          if (!files[0]) return;
          btn.disabled = true; btn.textContent = 'Uploading…';
          uploadFile(files[0]).then(function (url) {
            state.draft.images[s[0]] = url; renderSlots(); refreshBar();
          }).catch(function (e) { fail(e); btn.disabled = false; btn.textContent = 'Replace'; });
        });
      });
      return el('div', { class: 'slot' }, [img, el('div', { class: 'meta' }, [el('span', { text: s[1] }), btn]), el('div', { class: 'where', text: s[2] })]);
    }));
  }

  /* ---------- gallery ---------- */
  function move(i, d) {
    var g = state.draft.gallery, j = i + d;
    if (j < 0 || j >= g.length) return;
    var t = g[i]; g[i] = g[j]; g[j] = t;
    renderGallery(); refreshBar();
  }
  function renderGallery() {
    var ul = $('#gallery');
    var g = state.draft.gallery;
    if (!g.length) { ul.replaceChildren(el('li', { class: 'empty', text: 'No photos yet. Use "Add photos" above.' })); return; }
    ul.replaceChildren.apply(ul, g.map(function (item, i) {
      var alt = el('input', { type: 'text', maxlength: '140', value: item.alt, 'aria-label': 'Photo caption', placeholder: 'Photo caption' });
      alt.addEventListener('input', function () { item.alt = alt.value; refreshBar(); });
      var size = el('select', { 'aria-label': 'Size' }, [
        el('option', { value: '', text: 'Normal size' }),
        el('option', { value: 'tall', text: 'Tall' }),
        el('option', { value: 'wide', text: 'Wide' })
      ]);
      size.value = item.size || '';
      size.addEventListener('change', function () { item.size = size.value; refreshBar(); });
      var left = el('button', { type: 'button', text: '←', title: 'Move earlier', onclick: function () { move(i, -1); } });
      var right = el('button', { type: 'button', text: '→', title: 'Move later', onclick: function () { move(i, 1); } });
      left.disabled = i === 0; right.disabled = i === g.length - 1;
      var del = el('button', { type: 'button', class: 'del', text: 'Remove', onclick: function () {
        if (!confirm('Remove this photo from the gallery?')) return;
        g.splice(i, 1); renderGallery(); refreshBar();
      } });
      return el('li', { class: 'g-item' }, [
        el('img', { src: item.src, alt: item.alt, loading: 'lazy' }),
        el('div', { class: 'g-body' }, [alt, size, el('div', { class: 'g-actions' }, [left, right, del])])
      ]);
    }));
  }
  function addToGallery(files) {
    files = files.filter(function (f) { return /^image\//.test(f.type); });
    if (!files.length) return toast('Only JPG, PNG or WebP images are supported', true);
    if (state.draft.gallery.length + files.length > 40) return toast('The gallery can hold up to 40 photos', true);
    toast('Uploading ' + files.length + (files.length > 1 ? ' photos…' : ' photo…'));
    files.reduce(function (p, f) {
      return p.then(function () {
        return uploadFile(f).then(function (url) {
          state.draft.gallery.push({ id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            src: url, alt: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 100) || 'Hill View Bamboo Resort', size: '' });
        });
      });
    }, Promise.resolve()).then(function () { renderGallery(); refreshBar(); toast('Upload complete. Click "Save changes" to publish.'); }).catch(fail);
  }
  $('#gallery-add').addEventListener('change', function (e) {
    var files = [].slice.call(e.target.files); e.target.value = ''; addToGallery(files);
  });
  var drop = $('#drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { addToGallery([].slice.call(e.dataTransfer.files)); });

  /* ---------- save / discard ---------- */
  $('#save').addEventListener('click', function () {
    var btn = $('#save'); btn.disabled = true;
    api('PUT', '/api/admin/content', state.draft).then(function (c) {
      state.saved = c; state.draft = JSON.parse(JSON.stringify(c));
      renderAll(); toast('Changes saved. The website is updated.');
    }).catch(fail).finally(function () { btn.disabled = false; });
  });
  $('#discard').addEventListener('click', function () {
    if (!confirm('Discard all unsaved changes?')) return;
    state.draft = JSON.parse(JSON.stringify(state.saved)); renderAll();
  });

  /* ---------- personal links ---------- */
  var fmtDate = function (iso) { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };
  var NAMES = { one: 'One cottage', three: 'All three', whole: 'Whole property' };
  var freshSlug = null;

  function offerPayload(o, patch) {
    return Object.assign({ guestName: o.guestName, message: o.message, prices: o.prices, expiresAt: o.expiresAt, active: o.active }, patch);
  }

  function renderOffers(list) {
    var wrap = $('#offers');
    if (!list.length) { wrap.replaceChildren(el('p', { class: 'empty', text: 'No guest links yet.' })); return; }
    wrap.replaceChildren.apply(wrap, list.map(function (o) {
      var special = Object.keys(o.prices).map(function (k) { return NAMES[k] + ' ' + inr(o.prices[k]); }).join(' · ');
      var copy = el('button', { class: 'btn sm', type: 'button', text: 'Copy link', onclick: function () {
        navigator.clipboard.writeText(o.url).then(function () { toast('Link copied'); }, function () { toast('Could not copy. Please select the link and copy it manually.', true); });
      } });
      var wa = el('a', { class: 'btn ghost sm', target: '_blank', rel: 'noopener',
        href: 'https://wa.me/?text=' + encodeURIComponent('Hello ' + o.guestName + ', here is your personal link for Hill View Bamboo Resort: ' + o.url),
        text: 'Share on WhatsApp' });
      var toggle = el('button', { class: 'btn ghost sm', type: 'button', text: o.active ? 'Pause' : 'Activate', onclick: function () {
        api('PUT', '/api/admin/offers/' + o.slug, offerPayload(o, { active: !o.active })).then(loadOffers).catch(fail);
      } });
      var del = el('button', { class: 'btn danger sm', type: 'button', text: 'Delete', onclick: function () {
        if (!confirm('Delete the link for ' + o.guestName + '? It will stop working immediately.')) return;
        api('DELETE', '/api/admin/offers/' + o.slug).then(loadOffers).catch(fail);
      } });
      return el('div', { class: 'offer' + (o.slug === freshSlug ? ' fresh' : '') }, [
        el('div', { class: 'offer-head' }, [el('b', { text: o.guestName }), el('span', { class: 'pill ' + o.state, text: { live: 'Active', paused: 'Paused', expired: 'Expired' }[o.state] })]),
        el('div', { class: 'url', text: o.url }),
        el('div', { class: 'info', text: [
          special ? 'Special rates: ' + special : 'Standard rates',
          o.expiresAt ? 'Valid until ' + fmtDate(o.expiresAt) : 'No expiry',
          (o.views || 0) + (o.views === 1 ? ' view' : ' views')
        ].join('  ·  ') }),
        el('div', { class: 'acts' }, [copy, wa, toggle, del])
      ]);
    }));
  }
  function loadOffers() { return api('GET', '/api/admin/offers').then(renderOffers).catch(fail); }

  $('#offer-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var prices = {};
    ['one', 'three', 'whole'].forEach(function (k) { var v = $('#o-' + k).value; if (v !== '') prices[k] = Number(v); });
    var exp = $('#o-exp').value;
    var payload = {
      guestName: $('#o-name').value, message: $('#o-msg').value, prices: prices,
      expiresAt: exp ? exp + 'T23:59:59' : null, active: true
    };
    api('POST', '/api/admin/offers', payload).then(function (o) {
      e.target.reset(); freshSlug = o.slug; toast('Link created');
      return navigator.clipboard.writeText(o.url).then(function () { toast('Link created and copied to clipboard'); }, function () {});
    }).then(loadOffers).catch(fail);
  });

  /* ---------- boot ---------- */
  function renderAll() { renderPrices(); renderSlots(); renderGallery(); refreshBar(); }

  function boot() {
    api('GET', '/api/admin/content').then(function (c) {
      state.saved = c; state.draft = JSON.parse(JSON.stringify(c));
      showApp(); renderAll(); loadOffers();
    }).catch(function () { showLogin(); });
  }

  api('GET', '/api/admin/me').then(function (j) { j.authed ? boot() : showLogin(); }).catch(showLogin);
})();
