(function () {
  'use strict';

  var match = location.pathname.match(/^\/o\/([a-z0-9]{6,20})\/?$/);
  var url = '/api/content' + (match ? '?offer=' + encodeURIComponent(match[1]) : '');

  function inr(n) { return '\u20B9' + Number(n).toLocaleString('en-IN'); }

  function applyPrices(prices) {
    document.querySelectorAll('[data-price]').forEach(function (el) {
      var v = prices[el.getAttribute('data-price')];
      if (v != null) el.textContent = inr(v);
    });
  }

  function applyImages(images) {
    document.querySelectorAll('img[data-img]').forEach(function (el) {
      var src = images[el.getAttribute('data-img')];
      if (src && el.getAttribute('src') !== src) el.setAttribute('src', src);
    });
  }

  function applyGallery(items) {
    var grid = document.getElementById('grid');
    if (!grid || !items || !items.length) return;
    var frag = document.createDocumentFragment();
    items.forEach(function (g) {
      var btn = document.createElement('button');
      btn.type = 'button';
      if (g.size) btn.className = g.size;
      var img = document.createElement('img');
      img.loading = 'lazy';
      img.src = g.src;
      img.alt = g.alt || '';
      btn.appendChild(img);
      frag.appendChild(btn);
    });
    grid.replaceChildren(frag);
  }

  function applyOffer(offer) {
    if (!offer) return;
    window.__offer = offer;
    var bar = document.getElementById('offer-bar');
    if (bar) {
      var name = document.createElement('b');
      name.textContent = offer.guestName;
      bar.replaceChildren(document.createTextNode('Welcome, '), name,
        document.createTextNode(offer.message ? ' \u2014 ' + offer.message : ' \u2014 these rates are set aside for you.'));
      bar.hidden = false;
    }
    var field = document.getElementById('f-name');
    if (field && !field.value) field.value = offer.guestName;
  }

  fetch(url, { headers: { Accept: 'application/json' } })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (c) {
      applyPrices(c.prices || {});
      applyImages(c.images || {});
      applyGallery(c.gallery);
      applyOffer(c.offer);
    })
    .catch(function () { /* static defaults in the HTML stay in place */ });
})();
