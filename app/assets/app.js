
(function(){
  try {
    var raw = localStorage.getItem('ct_settings');
    var s = raw ? JSON.parse(raw) : {};
    if (!s || typeof s !== 'object') s = {};
    if (s.theme !== 'light' && s.theme !== 'dark') {
      s.theme = 'dark';
      localStorage.setItem('ct_settings', JSON.stringify(s));
    }
    var dark = s.theme !== 'light';
    document.documentElement.classList.toggle('theme-dark', dark);
    document.documentElement.classList.toggle('theme-light', !dark);
    var scheme = s.colorScheme || 'graphite';
    document.documentElement.setAttribute('data-scheme', scheme);
  } catch (e) {
    document.documentElement.classList.add('theme-dark');
    document.documentElement.setAttribute('data-scheme', 'graphite');
  }
})();

;

(function hydrateNavIcons(){
  /* In the PWA bundle, function icon() is hoisted but var CT_ICONS is still undefined
     until its assignment runs. Calling icon() early throws and aborts the entire app.js
     (killing settings chips, onboarding, Save wiring, home-shell nav sync). */
  function paint(){
    if (typeof icon !== 'function') return false;
    if (typeof CT_ICONS === 'undefined' || !CT_ICONS) return false;
    try {
      document.querySelectorAll('.bnav-ico[data-ico]').forEach(function(el){
        if (el.getAttribute('data-painted')) return;
        el.innerHTML = icon(el.getAttribute('data-ico'));
        el.setAttribute('data-painted','1');
      });
      document.querySelectorAll('[data-ico-inline]').forEach(function(el){
        if (el.getAttribute('data-painted')) return;
        var n = el.getAttribute('data-ico-inline');
        var label = el.getAttribute('data-ico-label');
        el.innerHTML = icon(n, 'sm') + (label ? ' ' + label : '');
        el.setAttribute('data-painted','1');
      });
      return true;
    } catch (e) {
      try { console.warn('hydrateNavIcons', e); } catch (e2) {}
      return false;
    }
  }
  function retry(n){
    if (paint()) return;
    if (n >= 60) return;
    setTimeout(function () { retry(n + 1); }, 50);
  }
  if (!paint()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { retry(0); });
    }
    retry(0);
  }
})();

;


// ============================================================
// BUY / INVENTORY MODAL
// ============================================================
let pendingModalListing = null;
let pendingModalMode = 'buy'; // 'buy' or 'inv'

function openBuyModal(encodedData, mode) {
  // Only works from eBay or inventory tab — switch to inventory if needed
  var currentSection = document.querySelector('.section.active');
  var currentId = currentSection ? currentSection.id : '';
  var allowedSections = ['sec-inventory', 'sec-ebay'];
  if (allowedSections.indexOf(currentId) === -1) {
    switchTab('inventory');
  }
  mode = mode || 'buy';
  pendingModalMode = mode;
  try {
    pendingModalListing = JSON.parse(decodeURIComponent(encodedData));
  } catch(e) {
    console.error('Failed to parse listing data', e);
    return;
  }
  const l = pendingModalListing;
  document.getElementById('modal-title-text').textContent = mode === 'inv' ? 'Add to Inventory' : 'Buy & Add to Inventory';

  // Build listing info summary
  const info = document.getElementById('modal-listing-info');
  const isAuction = l.listing_type === 'auction' || l.bids !== null;
  let timeLeft = '';
  if (isAuction && l.end_time) {
    const diff = (l.end_time * 1000) - Date.now();
    if (diff > 0) {
      timeLeft = diff < 86400000
        ? Math.floor(diff/3600000) + 'h ' + Math.floor((diff%3600000)/60000) + 'm left'
        : Math.floor(diff/86400000) + 'd left';
    } else {
      timeLeft = 'Ended';
    }
  }
  info.innerHTML = `
    <div class="modal-card-preview">
      \${l.thumbnail ? '<img src="'+l.thumbnail+'" class="modal-thumb" alt="card">' : ''}
      <div class="modal-card-details">
        <div class="modal-card-name">\${l.card || l.title || 'Unknown Card'}</div>
        <div class="modal-card-meta">
          <span>USD $ ${l.price || 0}</span>
          ${l.condition ? '<span>'+l.condition+'</span>' : ''}
          ${isAuction ? '<span class="modal-auc-badge">Auction'+(timeLeft ? ' - '+timeLeft : '')+'</span>' : '<span class="modal-bin-badge">BIN</span>'}
        </div>
        <div class="modal-card-meta">
          <span>TCG Market: USD $ ${l.tcg_market || '?'}</span>
          <span>Spread: USD $ ${l.spread || 0}</span>
          ${l.bids !== null ? '<span>'+l.bids+' bids</span>' : ''}
          ${l.shipping !== null ? '<span>USD $ '+l.shipping+' ship</span>' : '<span>Free ship</span>'}
          \${l.location ? '<span>'+l.location+'</span>' : ''}
        </div>
      </div>
    </div>
    <div class="modal-ebay-link"><a href="\${l.url || '#'}" target="_blank" onclick="closeBuyModal()">View on eBay ↗</a></div>
  `;
  document.getElementById('modal-price').value = '';
  document.getElementById('modal-qty').value = '1';
  document.getElementById('modal-notes').value = '';
  document.getElementById('buy-modal').style.display = 'flex';
}

function closeBuyModal() {
  document.getElementById('buy-modal').style.display = 'none';
  pendingModalListing = null;
}

function confirmBuy() {
  if (!pendingModalListing) return;
  const l = pendingModalListing;
  const purchasePrice = parseFloat(document.getElementById('modal-price').value) || 0;
  const qty = parseInt(document.getElementById('modal-qty').value) || 1;
  const notes = document.getElementById('modal-notes').value;

  if (purchasePrice <= 0) {
    alert('Please enter the purchase price.');
    return;
  }

  // Build inventory item - pre-filled from listing, user enters price paid
  const item = {
    card: l.card || l.title || 'Unknown',
    set: '', // user can fill in later if needed
    price_paid: purchasePrice,
    quantity: qty,
    condition: l.condition || '',
    source: 'eBay',
    source_url: l.url || '',
    purchase_date: new Date().toISOString().split('T')[0],
    notes: notes,
    tcg_market: l.tcg_market || 0,
    roi: l.roi || 0,
    listing_price: l.price || 0,
    eBay_price: l.price || 0
  };

  // Save to inventory in localStorage
  const invKey = 'ct_inventory';
  let inventory = JSON.parse(localStorage.getItem(invKey) || '[]');
  inventory.push(item);
  localStorage.setItem(invKey, JSON.stringify(inventory));

  // If mode was 'buy' (not just 'add to inv'), also log it as a sale
  if (pendingModalMode === 'buy') {
    const saleKey = 'ct_sales_log';
    let sales = JSON.parse(localStorage.getItem(saleKey) || '[]');
    sales.push({
      card: item.card,
      price: purchasePrice,
      date: item.purchase_date,
      source: 'eBay',
      url: l.url || ''
    });
    localStorage.setItem(saleKey, JSON.stringify(sales));
  }

  closeBuyModal();
  // Refresh inventory tab if visible
  if (typeof renderInventory === 'function') renderInventory();
  // Show confirmation
  const toast = document.createElement('div');
  toast.className = 'toast-success';
  toast.textContent = qty + '× ' + (l.card || l.title || 'Card') + ' added to inventory!';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// STORAGE -----------------------------------------------
const DB = {
  sales: JSON.parse(localStorage.getItem('ct_sales') || '[]'),
  inventory: JSON.parse(localStorage.getItem('ct_inventory') || '[]'),
  addScanned(s) {
    const inv = this.inventory;
    const row = Object.assign({
      kind: 'raw', condition: 'NM', cost: s.cost || 0, addedAt: (typeof d8 === 'function' ? d8() : new Date().toISOString().slice(0,10)), type: 'single'
    }, s, { qty: s.qty || 1 });
    const exist = inv.find(i => i.sku && i.sku === row.sku && (i.condition || 'NM') === (row.condition || 'NM'));
    if (exist) {
      exist.qty += row.qty || 1;
      if (row.cost) exist.cost = row.cost;
    } else {
      if (!row.id) row.id = Date.now() + Math.floor(Math.random()*999);
      inv.push(row);
    }
    this.inventory = inv;
  },
  saveSales() { localStorage.setItem('ct_sales', JSON.stringify(this.sales)); },
  saveInventory() { localStorage.setItem('ct_inventory', JSON.stringify(this.inventory)); },
};

// HELPERS -----------------------------------------------
function $(id) { return document.getElementById(id); }
function fmt(n) { return '$' + (parseFloat(n) || 0).toFixed(2); }
function fmtN(n) { return (parseFloat(n) || 0).toLocaleString(); }
function pct(a, b) { return b ? ((a / b) * 100).toFixed(1) + '%' : '-'; }
function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 2500);
}
function showToast(msg) { toast(msg); }
function d8(d) {
  if (!d) return new Date().toISOString().slice(0, 10);
  return d instanceof Date ? d.toISOString().slice(0, 10) : d;
}

// SAVE / IMPORT -----------------------------------------
function saveInventory() { DB.saveInventory(); toast('Inventory saved', 'ok'); }
function importInventory() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      if (file.name.endsWith('.json')) {
        DB.inventory = JSON.parse(text);
      } else {
        const lines = text.trim().split('\n');
        DB.inventory = lines.slice(1).map(line => {
          const [sku, name, qty, cost, set, condition, notes] = line.split(',').map(c => c.replace(/^"|"$/g, ''));
          return { sku, name, qty: parseInt(qty)||1, cost: parseFloat(cost)||0, set, condition, notes };
        });
      }
      DB.saveInventory();
      toast(`Imported ${DB.inventory.length} items`, 'ok');
      if (document.querySelector('.section.active')?.id === 'sec-inventory') renderInventory();
    } catch(err) {
      toast('Import failed: ' + err.message, 'err');
    }
  };
  input.click();
}

// TABS --------------------------------------------------
const CT_LAST_TAB_KEY = 'ct_last_tab';
function focusSaleScanField() {
  const show = document.body.classList.contains('show-mode');
  const el = show ? $('fast-sale-q') : ($('log-sku') || $('fast-sale-q'));
  if (!el) return;
  try {
    el.focus({ preventScroll: false });
    if (typeof el.select === 'function' && el.value) el.select();
  } catch (e) {
    try { el.focus(); } catch (e2) {}
  }
}
function switchTab(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const sec = $('sec-' + name);
  if (sec) sec.classList.add('active');
  document.querySelectorAll('.tab[data-tab]').forEach(t => {
    if (t.getAttribute('data-tab') === name) t.classList.add('active');
  });
  try {
    var titles = { home:'Home', log:'Register', orders:'Orders', inventory:'Catalog', customers:'Customers', reports:'Insights', buylist:'Trade-in', shop:'Settings', storefront:'Storefront', prices:'Prices', watchlist:'Watchlist', scan:'Scan', ebay:'eBay', game:'Games' };
    if ($('shop-title')) $('shop-title').textContent = titles[name] || 'CardTrack';
  } catch (e) {}
  try { localStorage.setItem(CT_LAST_TAB_KEY, name); } catch (e) {}
  if (name === 'game') { if (typeof loadGame === 'function') loadGame('memory'); }
  if (name === 'ebay' && typeof loadEbay === 'function') loadEbay();
  if (name === 'log') {
    renderRecentSales();
    if (typeof renderFastSale === 'function') renderFastSale();
    if ($('sale-date')) $('sale-date').value = d8();
    if (typeof refreshCustomerDatalist === 'function') refreshCustomerDatalist();
    setTimeout(focusSaleScanField, 30);
  }
  if (name === 'inventory') renderInventory();
  if (name === 'shop' && typeof refreshPerfHud === 'function') setTimeout(refreshPerfHud, 50);
  if (name === 'home' && typeof renderHomeDashboard === 'function') renderHomeDashboard();
  if (name === 'reports') renderReports();
  if (name === 'watchlist') { renderWatchlistTab(); if (typeof scanArbitrage === 'function') scanArbitrage(); }
  if (name === 'buylist' && typeof renderBuylist === 'function') {
    renderBuylist();
    setTimeout(function () { const n = $('bl-name'); if (n) try { n.focus(); } catch (e) {} }, 30);
  }
  if (name === 'customers' && typeof renderCustomers === 'function') renderCustomers();
  if (name === 'shop' && typeof applyShopChrome === 'function') applyShopChrome();
  document.querySelectorAll('.bnav-item[data-tab]').forEach(function (b) {
    var t = b.getAttribute('data-tab');
    if (t === 'more') {
      b.classList.toggle('active', ['customers','reports','shop','prices','watchlist','scan','ebay','game'].indexOf(name) !== -1);
    } else {
      b.classList.toggle('active', t === name);
    }
  });
  document.body.classList.toggle('meet-active', name === 'log');
  document.body.classList.toggle('home-active', name === 'home');
}

// CAMERA ------------------------------------------------
let cameraStream = null;
function startCamera() {
  const wrap = $('camera-wrap');
  const video = $('camera-video');
  wrap.style.display = 'block';
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(stream => {
    cameraStream = stream;
    video.srcObject = stream;
  }).catch(() => toast('Camera access denied', 'err'));
}
function capturePhoto() {
  const video = $('camera-video');
  const canvas = $('camera-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(blob => {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
    $('camera-wrap').style.display = 'none';
    handleFile(new File([blob], 'capture.jpg', { type: 'image/jpeg' }));
  }, 'image/jpeg', 0.9);
}

// FILE / OCR ---------------------------------------------
function handleFile(file) {
  if (!file) return;
  const zone = $('upload-zone');
  zone.innerHTML = '<div class="icon"></div><div class="label">Processing</div><div class="sub">' + file.name + '</div>';

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => runOCR(img, file.name);
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// OCR - uses Tesseract.js via CDN -----------------------
async function runOCR(img, filename) {
  try {
    // Load Tesseract dynamically
    const Tesseract = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js');
    toast('Running OCR', '');
    const result = await Tesseract.recognize(img, 'eng', {
      logger: m => { if (m.status === 'recognizing text') toast('Reading text ' + Math.round(m.progress * 100) + '%', ''); }
    });

    const text = result.data.text;
    const confidence = result.data.confidence;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    if (scanMode === 'box') {
      // Box label parsing
      const boxData = parseBoxLabel(lines);
      if (!boxData.name && !boxData.sku) {
        $('parse-result').innerHTML = '<div class="card"><div class="empty-state"><div class="icon"></div>Couldn\'t detect box data.<br><br><strong>Confidence:</strong> ' + Math.round(confidence) + '%<br><small style="color:var(--muted)">Try a clearer photo of the box label.</small></div></div>';
        $('upload-zone').innerHTML = '<div class="icon"></div><div class="label">Try again</div><div class="sub">Tap to re-upload</div>';
        return;
      }
      $('bf-name').value = boxData.name || '';
      $('bf-cost').value = boxData.cost || '';
      $('bf-count').value = boxData.count || '30';
      $('bf-sku').value = boxData.sku || '';
      $('box-fill-preview').innerHTML = `Parsed from image - ${Math.round(confidence)}% confidence${boxData.name ? '<br><strong>' + esc(boxData.name) + '</strong>' : ''}${boxData.sku ? '<br>SKU: ' + esc(boxData.sku) : ''}${boxData.cost ? '<br>Cost: $' + boxData.cost : ''}`;
      $('scan-box-fill').style.display = 'block';
      $('upload-zone').style.display = 'none';
      toast('Box label detected', 'ok');
    } else {
      // Receipt mode - existing logic
      const parsed = parseReceiptLines(lines);

      if (parsed.length === 0) {
        $('parse-result').innerHTML = '<div class="card"><div class="empty-state"><div class="icon"></div>Couldn\'t detect card data.<br><br><strong>Confidence:</strong> ' + Math.round(confidence) + '%<br><small style="color:var(--muted)">Try a clearer photo or enter manually.</small></div></div>';
        $('upload-zone').innerHTML = '<div class="icon"></div><div class="label">Upload another</div><div class="sub">JPG, PNG - any size</div>';
        return;
      }

      const total = parsed.reduce((s, i) => s + (i.price || 0), 0);
      $('parse-result').innerHTML = `
        <div class="parse-result">
          <div class="pr-header">
            <span class="pr-title"> Detected ${parsed.length} item${parsed.length !== 1 ? 's' : ''}</span>
            <span class="pr-meta">${Math.round(confidence)}% confidence</span>
          </div>
          ${parsed.map(i => `<div class="parse-row">
            <span class="sku">${i.sku || '?'}</span>
            <span>${i.name || 'Unknown'}</span>
            <span class="profit-pos">${fmt(i.price)}</span>
          </div>`).join('')}
          <div class="parse-row" style="font-weight:700">
            <span>Estimated Total</span>
            <span class="profit-pos">${fmt(total)}</span>
          </div>
        </div>`;

      scannedItems = parsed;
      renderScannedRows();
      $('scan-quick-add').style.display = 'block';
      $('upload-zone').innerHTML = '<div class="icon"></div><div class="label">Upload another</div><div class="sub">JPG, PNG - any size</div>';
      toast('Parsed ' + parsed.length + ' items', 'ok');
    }
  } catch(err) {
    console.error('OCR error:', err);
    toast('OCR failed - try manual entry', 'err');
    $('upload-zone').innerHTML = '<div class="icon"></div><div class="label">Upload or take photo</div><div class="sub">JPG, PNG, HEIC - any size</div>';
  }
}

let scannedItems = [];
let scanMode = 'receipt';

function setScanMode(mode) {
  scanMode = mode;
  const btnReceipt = $('btn-mode-receipt');
  const btnBox = $('btn-mode-box');
  if (mode === 'receipt') {
    btnReceipt.classList.add('active');
    btnBox.classList.remove('active');
    $('scan-card-title').textContent = 'Upload Receipt Photo';
    $('scan-upload-label').textContent = 'Tap to upload or take photo';
    $('scan-upload-sub').textContent = 'JPG, PNG, HEIC - any size';
  } else {
    btnBox.classList.add('active');
    btnReceipt.classList.remove('active');
    $('scan-card-title').textContent = 'Upload Box / Case Label';
    $('scan-upload-label').textContent = 'Tap to photograph the box label';
    $('scan-upload-sub').textContent = 'Scan the barcode, product name, and price';
  }
  $('parse-result').innerHTML = '';
  $('scan-quick-add').style.display = 'none';
  $('scan-box-fill').style.display = 'none';
  document.getElementById('file-input').value = '';
  $('upload-zone').innerHTML = '<div class="icon"></div><div class="label" id="scan-upload-label">' + $('scan-upload-label').textContent + '</div><div class="sub" id="scan-upload-sub">' + $('scan-upload-sub').textContent + '</div>';
}

function renderScannedRows() {
  $('sq-rows').innerHTML = scannedItems.map((item, i) => `<div class="entry-row">
    <input value="${item.sku || ''}" placeholder="SKU" onchange="scannedItems[${i}].sku=this.value">
    <input value="${item.name || ''}" placeholder="Card name" onchange="scannedItems[${i}].name=this.value">
    <input value="${item.price || ''}" placeholder="Sell $" type="number" step="0.01" onchange="scannedItems[${i}].price=parseFloat(this.value)">
    <input value="${item.cost || ''}" placeholder="Cost $" type="number" step="0.01" onchange="scannedItems[${i}].cost=parseFloat(this.value)">
    <div class="del-btn" onclick="scannedItems.splice(${i},1);renderScannedRows()"></div>
  </div>`).join('');
}

function addScannedRow() {
  scannedItems.push({ sku: $('sq-sku').value, name: $('sq-name').value, price: parseFloat($('sq-price').value) || 0, cost: parseFloat($('sq-cost').value) || 0 });
  $('sq-sku').value = ''; $('sq-name').value = ''; $('sq-price').value = ''; $('sq-cost').value = '';
  renderScannedRows();
}

function commitScanned() {
  scannedItems.forEach(s => {
    s.qty = 1;
    DB.addScanned(s);
  });
  DB.saveInventory();
  scannedItems = [];
  $('sq-rows').innerHTML = '';
  $('scan-quick-add').style.display = 'none';
  $('parse-result').innerHTML = '';
  toast('Added to inventory', 'ok');
  switchTab('inventory');
}

// PARSING LOGIC ------------------------------------------
function parseReceiptLines(lines) {
  const items = [];
  // Common patterns:
  // --- UPC codes: 12-13 digits
  // --- Dollar amounts: $X.XX or X.XX at end of line
  // --- Card names: mixed with numbers
  // Strategy: look for lines with price patterns near SKU-like text
  const priceRe = /\$?(\d+\.\d{2})/;
  const upcRe = /\b(\d{8,14})\b/;
  const charRe = /[A-Z][a-z]+/;

  lines.forEach(line => {
    // Skip headers/footers
    const upper = line.toUpperCase();
    if (/^(SUBTOTAL|TAX|TOTAL|CASH|CARD|VISA|MASTERCARD|DISCOVER|DEBIT|CREDIT|CHANGE|THANK|STORE|DATE|Time|Invoice|Receipt|Order)/.test(upper)) return;
    if (/^\d+\.\d{2}$/.test(line.trim())) return; // standalone price

    const priceMatch = line.match(priceRe);
    if (!priceMatch) return;
    const price = parseFloat(priceMatch[1]);
    if (price < 0.10 || price > 10000) return; // sanity filter

    // Try to extract a UPC
    const upcMatch = line.match(upcRe);
    const sku = upcMatch ? upcMatch[1] : (line.split(/\s+/)[0] || '').toUpperCase().slice(0, 14);

    // Try to extract a name - text before the price
    const beforePrice = line.slice(0, line.indexOf(priceMatch[0])).trim();
    // Remove leading SKU-like tokens
    const name = beforePrice.replace(/^[\d\-\s]+/, '').replace(/\s+/g, ' ').trim() || 'Card #' + (items.length + 1);

    items.push({ sku, name: name.slice(0, 40), price });
  });

  return items;
}

// BOX LABEL PARSING --------------------------------------
function parseBoxLabel(lines) {
  // Box label has: product name, UPC/SKU barcode, price, pack count
  const upcRe = /\b(\d{8,14})\b/;
  const priceRe = /\$?(\d+\.\d{2})\b/;
  const countRe = /(\d+)\s*(pack|pk|ct|count|units?)/i;

  let name = '', sku = '', cost = '', count = '30';

  lines.forEach(line => {
    const upper = line.toUpperCase();
    if (/^(TOTAL|SUBTOTAL|TAX|DATE|TIME|CASH|CARD|CHANGE|THANK)/.test(upper)) return;
    if (!isNaN(parseFloat(line.trim())) && /^\$?[\d.]+$/.test(line.trim())) return;

    const upcMatch = line.match(upcRe);
    if (upcMatch && !sku) sku = upcMatch[1];

    const priceMatch = line.match(priceRe);
    if (priceMatch && !cost) {
      const val = parseFloat(priceMatch[1]);
      if (val > 1) cost = priceMatch[1];
    }

    const countMatch = line.match(countRe);
    if (countMatch && !count) count = countMatch[1];

    // Product name: longest alphabetic line with Pokemon/product keywords
    if (line.length > name.length && /[A-Z].*[A-Z]/i.test(line) && line.length > 5) {
      if (/BOoster|Box|Pack|Tin|Collection|Set|Series|Pokemon|Charizard|Pikachu|VSTAR|VMAX|EX |GX |LEGEND|Celebrations|Sword|Shield|SV[ -]| Scarlett |Violet/i.test(line) ||
          (line.split(' ').length >= 2 && /[A-Z][a-z]+/i.test(line))) {
        name = line;
      }
    }
  });

  if (!name) lines.forEach(l => { if (l.length > name.length && /[A-Za-z]{4,}/.test(l)) name = l; });

  return { name, sku, cost, count };
}

function commitBoxFill() {
  const name = $('bf-name').value.trim();
  const cost = $('bf-cost').value;
  const count = parseInt($('bf-count').value) || 30;
  const sku = $('bf-sku').value.trim().toUpperCase();
  const supplier = $('bf-supplier').value;

  if (!name && !sku) { toast('Need a box name or SKU', 'err'); return; }
  if (!cost) { toast('Enter the total box cost', 'err'); return; }

  $('box-name').value = name;
  $('box-cost').value = cost;
  $('box-count').value = count;
  $('box-sku').value = sku;
  $('box-supplier').value = supplier;
  $('box-date').value = d8();

  toast('Form filled - review and tap Receive Box', 'ok');
  resetBoxFill();
  switchTab('inventory');
  document.getElementById('sec-inventory').scrollIntoView();
}

function resetBoxFill() {
  $('scan-box-fill').style.display = 'none';
  $('upload-zone').style.display = 'block';
  $('parse-result').innerHTML = '';
  document.getElementById('file-input').value = '';
  $('upload-zone').innerHTML = '<div class="icon"></div><div class="label" id="scan-upload-label">' + $('scan-upload-label').textContent + '</div><div class="sub" id="scan-upload-sub">' + $('scan-upload-sub').textContent + '</div>';
}

// LIVE PRICES ---------------------------------------------
const PTCG_API = 'https://api.pokemontcg.io/v2';
let lastSearchResults = [];
let currentDetail = null;

async function searchCards() {
  const query = $('price-search').value.trim();
  const setFilter = $('price-set-filter').value;
  if (!query) return;

  const $grid = $('price-results-grid');
  const $meta = $('price-results-meta');
  $grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">Searching</div>';
  $meta.style.display = 'none';
  $('price-detail-card').style.display = 'none';

  try {
    // Build query: name contains search term
    let url = `${PTCG_API}/cards?q=name:*${encodeURIComponent(query)}*&pageSize=30`;
    if (setFilter) url += `&set.id=${encodeURIComponent(setFilter)}`;
    // Sort by relevance (default)
    const res = await ptcgFetch(url);
    const data = await res.json();
    const cards = data.data || [];

    if (cards.length === 0) {
      $grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">No cards found for "' + esc(query) + '"</div>';
      return;
    }

    lastSearchResults = cards;

    // Populate set filter dropdown if not populated
    const sets = [...new Set(cards.map(c => c.set.id))];
    const $sel = $('price-set-filter');
    if ($sel.options.length <= 1) {
      cards.forEach(c => {
        if (![...$sel.options].some(o => o.value === c.set.id)) {
          const opt = document.createElement('option');
          opt.value = c.set.id;
          opt.textContent = c.set.name;
          $sel.appendChild(opt);
        }
      });
    }

    $meta.textContent = `${cards.length} result${cards.length !== 1 ? 's' : ''} for "${esc(query)}"`;
    $meta.style.display = 'block';

    $grid.innerHTML = cards.map(card => {
      const price = card.tcgplayer?.prices?.holofoil || card.tcgplayer?.prices?.normal || {};
      const mkt = price.market || price.mid || price.low || null;
      const cmPrice = card.cardmarket?.prices || {};
      return `<div class="price-card" onclick="showPriceDetail('${card.id}')">
        <img src="${card.images?.small || card.images?.logo || ''}" style="width:100%;aspect-ratio:3/4;object-fit:contain;background:#000;border-radius:6px;margin-bottom:6px" onerror="this.style.display='none'">
        <div style="font-size:11px;font-weight:600;line-height:1.3;min-height:28px">${esc(card.name)}</div>
        <div style="font-size:9px;color:var(--muted);margin-bottom:4px">${esc(card.set.name)}</div>
        ${mkt ? `<div style="font-size:13px;font-weight:700;color:var(--gold)">$${(+mkt).toFixed(2)}</div>` : '<div style="font-size:11px;color:var(--muted)">No price</div>'}
      </div>`;
    }).join('');

  } catch(err) {
    console.error('Price search error:', err);
    $grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--red)">Search failed. Check connection.</div>';
  }
}

function showPriceDetail(cardId) {
  const card = lastSearchResults.find(c => c.id === cardId);
  if (!card) return;
  currentDetail = card;

  $('pd-image').src = card.images?.large || card.images?.small || '';
  $('pd-name').textContent = card.name;
  $('pd-set').textContent = card.set.name + ' (' + card.set.series + ')';
  $('pd-rarity').textContent = card.rarity || '';
  $('pd-number').textContent = '#' + card.number + '  ' + card.id;

  const tcg = card.tcgplayer?.prices || {};
  const holo = tcg.holofoil || {};
  const normal = tcg.normal || {};
  const pricing = Object.keys(tcg).length ? (holo.market || holo.mid || normal.market || normal.mid || {}) : {};

  $('pd-tcg-low').textContent = 'Low: ' + (holo.low ? '$' + holo.low.toFixed(2) : normal.low ? '$' + normal.low.toFixed(2) : '-');
  $('pd-tcg-mid').textContent = 'Mid: ' + (holo.mid ? '$' + holo.mid.toFixed(2) : normal.mid ? '$' + normal.mid.toFixed(2) : '-');
  $('pd-tcg-market').textContent = 'Market: ' + (pricing.market ? '$' + pricing.market.toFixed(2) : pricing.mid ? '$' + pricing.mid.toFixed(2) : '-');
  $('pd-tcg-direct').textContent = 'Direct Low: ' + (holo.directLow ? '$' + holo.directLow.toFixed(2) : normal.directLow ? '$' + normal.directLow.toFixed(2) : '-');

  const cm = card.cardmarket?.prices || {};
  $('pd-cm-avg').textContent = 'Avg: ' + (cm.averageSellPrice ? '$' + (+cm.averageSellPrice).toFixed(2) : '-');
  $('pd-cm-trend').textContent = 'Trend: ' + (cm.trendPrice ? '$' + (+cm.trendPrice).toFixed(2) : '-');
  $('pd-cm-low').textContent = 'Low: ' + (cm.lowPrice ? '$' + (+cm.lowPrice).toFixed(2) : '-');

  $('price-detail-card').style.display = 'block';
  $('price-detail-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hidePriceDetail() {
  $('price-detail-card').style.display = 'none';
  currentDetail = null;
}

function getWatchlist() {
  return JSON.parse(localStorage.getItem('ct_watchlist') || '[]');
}

function saveWatchlist(list) {
  localStorage.setItem('ct_watchlist', JSON.stringify(list));
}

function addToWatchlist() {
  if (!currentDetail) return;
  const card = currentDetail;
  const list = getWatchlist();
  if (list.some(c => c.id === card.id)) {
    toast('Already in watchlist', '');
    return;
  }
  const tcg = card.tcgplayer?.prices || {};
  const holo = tcg.holofoil || tcg.normal || {};
  const price = holo.market || holo.mid || holo.low || null;
  // Find cost from inventory
  const invItem = DB.inventory.find(i => i.name === card.name || i.sku === card.id);
  list.push({
    id: card.id,
    name: card.name,
    set: card.set?.name,
    image: card.images?.small,
    price,
    cost: invItem ? invItem.cost : null,
    addedAt: new Date().toISOString().slice(0, 10),
  });
  saveWatchlist(list);
  loadWatchlist();
  renderWatchlistTab();
  toast('Added to watchlist', 'ok');
}

function loadWatchlist() {
  const list = getWatchlist();
  $('watchlist-count').textContent = list.length + ' card' + (list.length !== 1 ? 's' : '');
  if (!list.length) {
    $('watchlist-empty').style.display = 'block';
    $('watchlist-items').innerHTML = '';
    return;
  }
  $('watchlist-empty').style.display = 'none';
  $('watchlist-items').innerHTML = list.map(card => `<div class="price-card" onclick="showPriceDetail('${card.id}')" style="padding:10px">
    <img src="${card.image || ''}" style="width:48px;height:64px;object-fit:contain;background:#000;border-radius:4px;margin-right:10px;float:left">
    <div style="overflow:hidden">
      <div style="font-size:12px;font-weight:600">${esc(card.name)}</div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:4px">${esc(card.set || '')}</div>
      ${card.price ? `<div style="font-size:13px;font-weight:700;color:var(--gold)">$${(+card.price).toFixed(2)}</div>` : '<div style="font-size:11px;color:var(--muted)">No price</div>'}
    </div>
    <button class="del-btn" onclick="event.stopPropagation();removeFromWatchlist('${card.id}')" style="float:right;margin-top:4px"></button>
  </div>`).join('');
  // Also load into search results so detail works
  if (!lastSearchResults.length) {
    lastSearchResults = list.map(c => ({ id: c.id, name: c.name, set: { name: c.set, id: '' }, images: { small: c.image, large: c.image }, rarity: '', number: '', tcgplayer: { prices: {} }, cardmarket: { prices: {} } }));
  }
}

function removeFromWatchlist(cardId) {
  const list = getWatchlist().filter(c => c.id !== cardId);
  saveWatchlist(list);
  loadWatchlist();
  renderWatchlistTab();
  toast('Removed from watchlist', '');
}

function renderWatchlistTab() {
  const list = getWatchlist();
  $('wl-empty').style.display = list.length ? 'none' : 'block';
  $('wl-grid').innerHTML = '';
  $('wl-summary-card').style.display = list.length ? 'block' : 'none';

  if (!list.length) return;

  $('wl-grid').innerHTML = list.map(card => `
    <div class="price-card" style="position:relative" id="wl-card-${card.id}">
      <button onclick="removeFromWatchlist('${card.id}')" style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.6);border:none;color:#fff;border-radius:50%;width:22px;height:22px;font-size:12px;cursor:pointer;line-height:1;z-index:1"></button>
      <img src="${card.image || ''}" style="width:100%;aspect-ratio:3/4;object-fit:contain;background:#000;border-radius:6px;margin-bottom:6px" onerror="this.style.display='none'">
      <div style="font-size:11px;font-weight:600;line-height:1.3;min-height:28px">${esc(card.name)}</div>
      <div style="font-size:9px;color:var(--muted);margin-bottom:4px">${esc(card.set || '')}</div>
      <div id="wl-price-${card.id}" style="font-size:13px;font-weight:700;color:var(--gold)">
        ${card.price ? '$' + (+card.price).toFixed(2) : '<span style="color:var(--muted);font-size:10px">No price</span>'}
      </div>
      <div style="font-size:9px;color:var(--muted);margin-top:2px" id="wl-status-${card.id}">
        ${card.addedAt ? 'Added ' + card.addedAt : ''}
      </div>
    </div>`).join('');

  updateWatchlistSummary(list);
}

function updateWatchlistSummary(list) {
  let totalValue = 0, totalCost = 0;
  list.forEach(c => {
    if (c.price) totalValue += +c.price;
    if (c.cost) totalCost += +c.cost;
  });
  const gain = totalValue - totalCost;
  $('wl-total-value').textContent = '$' + totalValue.toFixed(2);
  $('wl-total-cost').textContent = '$' + totalCost.toFixed(2);
  $('wl-total-gain').textContent = (gain >= 0 ? '+' : '') + '$' + gain.toFixed(2);
  $('wl-total-gain').className = gain >= 0 ? 'metric green' : 'metric red';
  const fill = totalCost > 0 ? Math.min(100, Math.max(0, (totalValue / totalCost) * 50)) : 50;
  $('wl-gain-fill').style.width = fill + '%';
  $('wl-gain-fill').style.background = gain >= 0 ? 'var(--green)' : 'var(--red)';
}

async function refreshWatchlistPrices() {
  const list = getWatchlist();
  if (!list.length) return;
  const btn = $('wl-refresh-btn');
  btn.textContent = ' Refreshing';
  btn.disabled = true;

  let updated = 0;
  for (const card of list) {
    try {
      const url = `${PTCG_API}/cards?q=name:*${encodeURIComponent(card.name)}*&pageSize=5&select=id,name,set,tcgplayer.prices`;
      const res = await fetch(url);
      const data = await res.json();
      const match = (data.data || []).find(c => c.set.id === (card.set || '').toLowerCase().replace(/\s+/g, '-')) ||
                    (data.data || []).find(c => c.tcgplayer?.prices) ||
                    (data.data || [])[0];
      if (match) {
        const detailRes = await fetch(`${PTCG_API}/cards/${match.id}`);
        const detail = await detailRes.json();
        const tcg = (detail.data || match).tcgplayer?.prices || {};
        const holo = tcg.holofoil || tcg.normal || {};
        const price = holo.market || holo.mid || holo.low;
        if (price) {
          card.price = parseFloat(price.toFixed(2));
          const priceEl = $('wl-price-' + card.id);
          if (priceEl) priceEl.innerHTML = '$' + price.toFixed(2);
          updated++;
        }
      }
    } catch(e) {}
    await new Promise(r => setTimeout(r, 200)); // rate limit
  }

  saveWatchlist(list);
  updateWatchlistSummary(list);
  $('wl-last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
  btn.textContent = ' Refresh All Prices';
  btn.disabled = false;
  toast('Refreshed ' + updated + ' card' + (updated !== 1 ? 's' : ''), 'ok');
}

// EBAY DEALS TAB -----------------------------------------
let ebayOpps = [];
let ebayTypeFilter = 'all';
let ebayConditionFilter = 'all';
let ebaySetFilter = '';
let ebaySortBy = 'roi';
let ebayTimeFilter = 'all';

function loadEbay() {
  const cached = localStorage.getItem('ct_arb_opps');
  const cachedTime = localStorage.getItem('ct_arb_opps_time');
  const now = Date.now();
  const isFresh = cachedTime && (now - parseInt(cachedTime)) < 3600000; // 1 hour

  if (cached) {
    try {
      ebayOpps = JSON.parse(cached);
      updateEbayStats(ebayOpps);
      filterAndRenderEbay();
    } catch (e) {
      ebayOpps = [];
    }
  } else {
    showEbayEmpty();
  }

  // Background refresh from API
  Promise.all([
    fetch('/opportunities').then(r => r.ok ? r.json() : null),
    fetch('/queue_stats').then(r => r.ok ? r.json() : null)
  ]).then(([data, queueData]) => {
      if (!data || !data.all_listings) return;
      const listings = data.all_listings;
      if (!listings.length) return;
      ebayOpps = listings;
      localStorage.setItem('ct_arb_opps', JSON.stringify(listings));
      localStorage.setItem('ct_arb_opps_time', now.toString());
      updateEbayStats(listings, queueData);
      filterAndRenderEbay();
    }).catch(() => {});
}

function scanEbay() {
  const btn = $('ebay-scan-btn');
  const status = $('ebay-status');
  const loading = $('ebay-loading');
  btn.disabled = true;
  btn.textContent = '⏳ Scanning...';
  status.textContent = '';
  loading.style.display = 'flex';
  $('eq-listings').textContent = '—';
  $('eq-deals').textContent = '—';
  $('eq-sets').textContent = '—';
  $('eq-next').textContent = '—';

  fetch('/opportunities')
    .then(r => { if (!r.ok) throw new Error('API error'); return r.json(); })
    .then(data => {
      const listings = data.all_listings || [];
      const now = Date.now();
      localStorage.setItem('ct_arb_opps', JSON.stringify(listings));
      localStorage.setItem('ct_arb_opps_time', now.toString());
      // Also get queue stats
      fetch('/queue_stats')
        .then(r => r.ok ? r.json() : null)
        .then(queueData => {
          updateEbayStats(listings, queueData);
        });
      ebayOpps = listings;
      filterAndRenderEbay();
      btn.disabled = false;
      btn.textContent = 'Scan eBay Now';
      loading.style.display = 'none';
      status.textContent = `Found ${listings.length.toLocaleString()} listings · ${(data.opportunities || []).length} deals`;
      setTimeout(() => { status.textContent = 'Ready'; }, 3000);
    })
    .catch(err => {
      btn.disabled = false;
      btn.textContent = 'Scan eBay Now';
      loading.style.display = 'none';
      status.textContent = 'Scan failed - try again';
      setTimeout(() => { status.textContent = 'Ready'; }, 3000);
    });
}

function updateEbayStats(listings, queueData) {
  if (!listings || !listings.length) return;
  // Count deals: ROI > 20
  const deals = listings.filter(l => l.roi > 20);
  $('eq-listings').textContent = listings.length.toLocaleString();
  $('eq-deals').textContent = deals.length.toLocaleString();

  // Use queue_stats for real sets info
  if (queueData) {
    $('eq-sets').textContent = queueData.sets_done + ' / ' + queueData.sets_total;
    $('eq-next').textContent = queueData.next_set || '—';
  } else {
    // Fallback: count unique sets from listings if no queue_data
    const uniqueSets = new Set(listings.map(l => l.set_name || l.card || ''));
    $('eq-sets').textContent = uniqueSets.size + ' sets';
    $('eq-next').textContent = '—';
  }
}

// Set keywords for matching cards to sets (since API doesn't have a set field)
const SET_KEYWORDS = {
  'obsidian flames': ['obsidian', 'flames'],
  'paldean fates': ['paldean', 'fates'],
  'scarlet violet': ['scarlet', 'violet'],
  'paradise lost': ['paradise', 'lost'],
  'crown zenith': ['crown', 'zenith'],
  'astral radiance': ['astral', 'radiance'],
  'brilliant stars': ['brilliant', 'stars'],
  'fusion strike': ['fusion', 'strike'],
  'evolving skies': ['evolving', 'skies'],
  'battle styles': ['battle', 'styles'],
  'chilling reign': ['chilling', 'reign'],
  'evolving destinies': ['evolving', 'destinies'],
  'darkness ablaze': ['darkness', 'ablaze'],
  'sword shield base': ['sword', 'shield'],
  'cosmic eclipse': ['cosmic', 'eclipse'],
  'unbroken bonds': ['unbroken', 'bonds'],
  'team up': ['team up'],
  'lost thunder': ['lost', 'thunder'],
  'storm blitz': ['storm', 'blitz'],
  'burning shadows': ['burning', 'shadows'],
  'guardians rising': ['guardians', 'rising'],
  'sun moon base': ['sun', 'moon'],
  'ancient origins': ['ancient', 'origins'],
  'breakthrough': ['breakthrough'],
  'fates collide': ['fates', 'collide'],
  'breakpoint': ['breakpoint'],
  'mythical island': ['mythical', 'island'],
};

function filterAndRenderEbay() {
  const search = ($('ebay-search') || {}).value || '';
  const setVal = ($('ebay-set-filter') || {}).value || '';
  const roiMin = parseFloat(($('ebay-roi-min') || {}).value) || 0;
  const priceMin = parseFloat(($('ebay-price-min') || {}).value) || 0;
  const priceMax = parseFloat(($('ebay-price-max') || {}).value) || 0;

  let filtered = ebayOpps;

  // Text search: card name or title
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(l => ((l.card_name || l.card || l.title || '').toLowerCase()).includes(q));
  }

  // Set filter: match by card name keywords
  if (setVal) {
    const keywords = SET_KEYWORDS[setVal] || [setVal];
    filtered = filtered.filter(l => {
      const text = ((l.card_name || l.card || l.title || '').toLowerCase());
      return keywords.some(k => text.includes(k));
    });
  }

  // Condition filter
  if (ebayConditionFilter !== 'all') {
    const cond = ebayConditionFilter;
    filtered = filtered.filter(l => {
      const c = ((l.condition || '').toLowerCase());
      if (cond === 'pre-owned') return c.includes('pre-owned') || c.includes('used') || c.includes('opened') || !c.includes('brand new');
      if (cond === 'brand new') return c.includes('brand new') || c.includes('new');
      return true;
    });
  }

  // ROI filter
  if (roiMin > 0) {
    filtered = filtered.filter(l => (l.roi || 0) >= roiMin);
  }

  // Price range filter (prices are in BRL)
  if (priceMin > 0) {
    filtered = filtered.filter(l => (l.price || 0) >= priceMin);
  }
  if (priceMax > 0) {
    filtered = filtered.filter(l => (l.price || 0) <= priceMax);
  }

  // Type filter
  if (ebayTypeFilter !== 'all') {
    const isBin = ebayTypeFilter === 'bin';
    filtered = filtered.filter(l => {
      return isBin ? (l.bids === null) : (l.bids !== null);
    });
  }

  // Auction time filter
  if (ebayTimeFilter !== 'all') {
    const now = Date.now();
    filtered = filtered.filter(l => {
      const isAuction = l.listing_type === 'auction' || l.bids !== null;
      if (!isAuction) return false;
      if (!l.end_time) return false;
      const diff = (l.end_time * 1000) - now;
      if (diff <= 0) return false;
      if (ebayTimeFilter === 'today') return diff < 86400000;
      if (ebayTimeFilter === 'soon') return diff < 172800000;
      return true;
    });
  }

  // Sort
  filtered = [...filtered].sort((a, b) => {
    if (ebaySortBy === 'price') return (a.price || 0) - (b.price || 0);
    if (ebaySortBy === 'spread') return (b.spread || 0) - (a.spread || 0);
    if (ebaySortBy === 'name') return ((a.card_name || a.card || a.title || '') < (b.card_name || b.card || b.title || '') ? -1 : 1);
    if (ebaySortBy === 'newest') return (b.timestamp || 0) - (a.timestamp || 0);
    return (b.roi || 0) - (a.roi || 0); // default ROI desc
  });

  renderEbayGrid(filtered);
}

function setEbayCondition(cond, btn) {
  ebayConditionFilter = cond;
  document.querySelectorAll('[data-condition]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterAndRenderEbay();
}

function setEbayTypeFilter(type, btn) {
  ebayTypeFilter = type;
  document.querySelectorAll('[data-type]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterAndRenderEbay();
}

function setEbaySort(sort, btn) {
  ebaySortBy = sort;
  document.querySelectorAll('.ebay-sort-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterAndRenderEbay();
}

function setEbayTime(val) {
  ebayTimeFilter = val;
  document.querySelectorAll('.ebay-time-btn').forEach(b => {
    const v = b.getAttribute('data-time');
    b.classList.toggle('active', v === val);
  });
  filterAndRenderEbay();
}

function renderEbayGrid(listings) {
  const grid = $('ebay-grid');
  if (!listings || !listings.length) {
    showEbayEmpty();
    return;
  }
  grid.innerHTML = listings.map(l => {
    const isAuction = l.listing_type === 'auction' || l.bids !== null;
    let timeLeft = '';
    if (isAuction && l.end_time) {
      const diff = (l.end_time * 1000) - Date.now();
      if (diff > 0) {
        timeLeft = diff < 86400000
          ? Math.floor(diff/3600000)+'h '+Math.floor((diff%3600000)/60000)+'m'
          : Math.floor(diff/86400000)+'d '+Math.floor((diff%86400000)/3600000)+'h';
      } else { timeLeft = 'Ended'; }
    }
    const roi = l.roi || 0;
    const roiCls = roi >= 50 ? 'roi-grn' : roi >= 30 ? 'roi-ylw' : 'roi-red';
    const condition = l.condition || '';
    const listingUrl = l.url || '#';
    const listingJson = encodeURIComponent(JSON.stringify(l));
    const typeLabel = isAuction
      ? ('AUCTION' + (timeLeft ? ' '+timeLeft : ''))
      : 'BIN';
    return `<div class="ebay-card">
      ${l.thumbnail ? `<img class="ebay-card-img" src="${l.thumbnail}" onerror="this.style.display='none'">` : ''}
      <div class="ebay-card-title">${l.card || l.card_name || l.title || 'Unknown'}</div>
      <div class="ebay-card-meta" style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
        <span class="ebay-badge ${roiCls}" style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px">ROI ${roi.toFixed(1)}%</span>
        <span class="ebay-badge" style="background:rgba(99,102,241,0.2);color:#818cf8;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px">${typeLabel}</span>
        ${condition ? `<span class="ebay-badge" style="background:rgba(255,255,255,0.1);color:var(--muted);font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px">${condition}</span>` : ''}
        ${l.bids !== null ? `<span class="ebay-badge" style="background:rgba(255,255,255,0.1);color:var(--muted);font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px">${l.bids} bids</span>` : ''}
      </div>
      <div class="ebay-card-prices">
        <span class="ebay-card-buy">USD $${l.price != null ? l.price.toFixed(2) : '?'}</span>
        <span style="color:var(--muted);font-size:12px">market</span>
        <span class="ebay-card-sell">USD $${l.tcg_market != null ? l.tcg_market.toFixed(2) : '?'}</span>
      </div>
      <div class="ebay-card-spread">Spread: USD $${l.spread != null ? l.spread.toFixed(2) : '?'}</div>
      <div class="ebay-card-actions">
        <button class="ebay-card-btn ebay-card-btn-view" onclick="window.open('${listingUrl}','_blank')">View on eBay</button>
        <button class="ebay-card-btn ebay-card-btn-buy" onclick="event.stopPropagation();openBuyModal('${listingJson}')">Buy</button>
        <button class="ebay-card-btn ebay-card-btn-inv" onclick="event.stopPropagation();openBuyModal('${listingJson}','inv')">Add to Inventory</button>
      </div>
    </div>`;
  }).join('');
}

function showEbayEmpty() {
  $('eq-listings').textContent = '—';
  $('eq-deals').textContent = '—';
  $('eq-sets').textContent = '—';
  $('eq-next').textContent = '—';
  const grid = $('ebay-grid');
  grid.innerHTML = `
    <div style="text-align:center;padding:60px 0;color:var(--muted);grid-column:1/-1">
      <div style="font-size:40px;margin-bottom:12px;color:var(--accent)" data-ico-inline="box"></div>
      <div style="font-size:15px;font-weight:600;margin-bottom:6px">No deals yet</div>
      <div style="font-size:13px">Click "Scan eBay Now" to find arbitrage opportunities</div>
    </div>`;
}

// ARBITRAGE SCANNER -------------------------------------
let arbScanCancelled = false;
let arbScanThreshold = 20;
let arbScanController = null;

const POPULAR_SETS = [
  'sv3pt5','sv3','sv2pt5','sv2','sv1pt5','sv1',  // Scarlet & Violet
  'swsh9','swsh8','swsh7','swsh6','swsh5','swsh4','swsh3','swsh2','swsh1', // Sword & Shield
  'sm12','sm11','sm10','sm9','sm8','sm7','sm6','sm5','sm4','sm3', // Sun & Moon
  'xy12','xy11','xy10','xy9', // XY
];

const SET_NAMES = {
  'sv3pt5':'Obsidian Flames','sv3':'Scarlet & Violet','sv2pt5':'Paradise Lost','sv2':'Paldean Fates',
  'sv1pt5':'Mythical Island','sv1':'Scarlet & Violet Base','swsh9pt5':'Crown Zenith','swsh9':'Astral Radiance',
  'swsh8':'Brilliant Stars','swsh7':'Fusion Strike','swsh6':'Evolving Skies','swsh5':'Battle Styles',
  'swsh4':'Chilling Reign','swsh3':'Evolving Destinies','swsh2':'Darkness Ablaze','swsh1':'Sword & Shield Base',
  'sm12':'Cosmic Eclipse','sm11':'Unbroken Bonds','sm10':'Team Up','sm9':'Lost Thunder',
  'sm8':'Storm Blitz','sm7':'Burning Shadows','sm6':'Guardians Rising','sm5':'Sun & Moon Base',
  'xy12':'Ancient Origins','xy11':'Breakthrough','xy10':'Fates Collide','xy9':'Breakpoint',
};

function openArbModal() {
  $('arb-modal').style.display = 'block';
  arbScanCancelled = false;
  // Build set checkboxes
  const container = $('arb-set-checkboxes');
  container.innerHTML = POPULAR_SETS.map(id => `
    <label style="display:flex;align-items:center;gap:4px;font-size:11px;background:var(--surface2);padding:4px 8px;border-radius:6px;cursor:pointer;white-space:nowrap">
      <input type="checkbox" value="${id}" style="accent-color:var(--gold)">
      ${SET_NAMES[id] || id}
    </label>`).join('');

  // Reset state
  $('arb-progress').style.display = 'none';
  $('arb-done-section').style.display = 'none';
  $('arb-live-results').innerHTML = '';
  $('arb-start-btn').style.display = 'block';
  $('arb-start-btn').disabled = false;
  $('arb-start-btn').textContent = ' Start Universe Scan';
}

function cancelArbScan() {
  arbScanCancelled = true;
  if (arbScanController) { arbScanController.abort(); arbScanController = null; }
  $('arb-modal').style.display = 'none';
}

function setArbThreshold(val, btn) {
  arbScanThreshold = val;
  document.querySelectorAll('.arb-threshold-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function startUniverseScan() {
  arbScanCancelled = false;
  const selectedSets = [...document.querySelectorAll('#arb-set-checkboxes input:checked')].map(i => i.value);
  const setsToScan = selectedSets.length ? selectedSets : POPULAR_SETS.slice(0, 10);

  $('arb-start-btn').style.display = 'none';
  $('arb-progress').style.display = 'block';
  $('arb-done-section').style.display = 'none';
  $('arb-live-results').innerHTML = '';

  const allOpportunities = [];
  const totalSets = setsToScan.length;
  let setsDone = 0;

  arbScanController = new AbortController();

  for (const setId of setsToScan) {
    if (arbScanCancelled) break;
    $('arb-status-text').textContent = `Scanning ${SET_NAMES[setId] || setId}`;

    try {
      // Fetch all cards in this set (just IDs and names for speed)
      const url = `${PTCG_API}/cards?q=set.id:${setId}&pageSize=200&select=id,name,set,tcgplayer.prices,cardmarket.prices`;
      const res = await fetch(url, { signal: arbScanController.signal });
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const cards = data.data || [];

      for (const card of cards) {
        if (arbScanCancelled) break;
        if (!card.tcgplayer?.prices || !card.cardmarket?.prices) continue;

        const tcg = card.tcgplayer.prices;
        const cm = card.cardmarket.prices;
        const tcgMarket = tcg.holofoil?.market || tcg.normal?.market || null;
        const cmTrend = cm.trendPrice ? +cm.trendPrice : null;
        const cmLow = cm.lowPrice ? +cm.lowPrice : null;
        if (!tcgMarket || (!cmTrend && !cmLow)) continue;

        const spread = cmTrend && tcgMarket ? ((tcgMarket - cmTrend) / cmTrend * 100) : 0;
        const buyPrice = cmLow || cmTrend || 0;
        const roi = buyPrice > 0 ? ((tcgMarket - buyPrice) / buyPrice * 100) : 0;

        if (Math.abs(spread) >= arbScanThreshold || Math.abs(roi) >= arbScanThreshold) {
          allOpportunities.push({
            name: card.name,
            set: SET_NAMES[setId] || card.set?.name || setId,
            setId,
            image: card.images?.small,
            tcgMarket,
            cmTrend,
            cmLow,
            spread,
            roi,
            buyPlatform: spread > 0 ? 'CardMarket' : 'TCGPlayer',
            sellPlatform: spread > 0 ? 'TCGPlayer' : 'CardMarket',
            profitPer: tcgMarket - buyPrice,
          });
        }
      }
    } catch(e) {
      if (e.name === 'AbortError') break;
      console.error('Set scan error:', setId, e.message);
    }

    setsDone++;
    const pct = Math.round((setsDone / totalSets) * 100);
    $('arb-fill').style.width = pct + '%';
    $('arb-pct').textContent = pct + '%';
    $('arb-card-count').textContent = `Scanned ${setsDone} of ${totalSets} sets  ${allOpportunities.length} opportunities found`;

    await new Promise(r => setTimeout(r, 100)); // small delay between sets
  }

  $('arb-progress').style.display = 'none';
  $('arb-done-section').style.display = 'block';

  if (!allOpportunities.length || arbScanCancelled) {
    $('arb-final-count').textContent = arbScanCancelled ? 'Scan cancelled.' : 'No opportunities found above ' + arbScanThreshold + '% spread.';
    return;
  }

  allOpportunities.sort((a, b) => b.roi - a.roi);
  const top = allOpportunities.slice(0, 30);
  const display = allOpportunities.length > 30 ? allOpportunities.slice(0, 30) : allOpportunities;
  const suffix = allOpportunities.length > 30 ? ` - showing top 30 of ${allOpportunities.length}` : '';

  $('arb-final-count').textContent = ` Found ${allOpportunities.length} opportunity${allOpportunities.length !== 1 ? 'ies' : ''} ${arbScanThreshold}% spread${suffix}`;
  $('arb-top-opps').innerHTML = display.map(o => {
    const color = o.roi > 0 ? 'var(--green)' : 'var(--red)';
    const arrow = o.roi > 0 ? '' : '';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
      <img src="${o.image || ''}" style="width:32px;height:42px;object-fit:contain;background:#000;border-radius:4px;flex-shrink:0" onerror="this.style.display='none'">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(o.name)}</div>
        <div style="font-size:10px;color:var(--muted)">${esc(o.set)}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="color:${color};font-weight:700;font-size:13px">${arrow} ${Math.abs(o.roi).toFixed(1)}%</div>
        <div style="font-size:10px;color:var(--muted)">Buy ${o.buyPlatform} $${(o.cmLow || o.cmTrend)?.toFixed(2)}</div>
        <div style="font-size:10px;color:var(--gold)">Sell $${o.tcgMarket.toFixed(2)}</div>
        <div style="font-size:10px;font-weight:600;color:${color}">+$${o.profitPer.toFixed(2)}/card</div>
      </div>
    </div>`;
  }).join('');

  toast(`Found ${allOpportunities.length} opportunities`, 'ok');
}

// LOG SALE -----------------------------------------------
async function scanArbitrage() {
  const list = $('arb-opps-list');
  const empty = $('arb-empty');
  const loading = $('arb-loading');
  list.innerHTML = '';
  empty.style.display = 'none';
  loading.style.display = 'block';

  // Collect all cards from watchlist + inventory (deduped by name)
  const watchlist = getWatchlist();
  const invCards = DB.inventory.map(i => ({ name: i.name, sku: i.sku, cost: i.cost, qty: i.qty, set: i.set }));
  const allCards = [...watchlist, ...invCards.filter(i => !watchlist.some(w => w.name === i.name))];
  const uniqueCards = [];
  const seen = new Set();
  allCards.forEach(c => { if (!seen.has(c.name)) { seen.add(c.name); uniqueCards.push(c); } });

  const opportunities = [];

  for (const card of uniqueCards.slice(0, 20)) {
    if (!card.name) continue;
    try {
      const url = `${PTCG_API}/cards?q=name:*${encodeURIComponent(card.name)}*&pageSize=5&select=id,name,set,tcgplayer.prices,cardmarket.prices`;
      const res = await fetch(url);
      const data = await res.json();
      const match = (data.data || []).find(c => c.tcgplayer?.prices && c.cardmarket?.prices) || (data.data || [])[0];
      if (!match || !match.tcgplayer?.prices || !match.cardmarket?.prices) continue;

      const tcg = match.tcgplayer.prices;
      const cm = match.cardmarket.prices;
      const tcgMarket = tcg.holofoil?.market || tcg.normal?.market || null;
      const cmTrend = cm.trendPrice ? +cm.trendPrice : null;
      const cmLow = cm.lowPrice ? +cm.lowPrice : null;

      if (!tcgMarket || (!cmTrend && !cmLow)) continue;

      const spread = cmTrend && tcgMarket ? ((tcgMarket - cmTrend) / cmTrend * 100) : 0;
      const buyPrice = cmLow || cmTrend || 0;
      const sellPrice = tcgMarket;
      const profitPer = sellPrice - buyPrice;
      const roi = buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice * 100) : 0;

      // Flag if >15% spread or >20% ROI potential
      if (Math.abs(spread) >= 15 || roi >= 20) {
        opportunities.push({
          name: match.name,
          set: match.set?.name,
          image: match.images?.small,
          tcgMarket,
          cmTrend,
          cmLow,
          spread,
          profitPer,
          roi,
          buyPlatform: spread > 0 ? 'CardMarket' : 'TCGPlayer',
          sellPlatform: spread > 0 ? 'TCGPlayer' : 'CardMarket',
        });
      }
    } catch(e) {}
    await new Promise(r => setTimeout(r, 150));
  }

  loading.style.display = 'none';

  if (!opportunities.length) {
    empty.style.display = 'block';
    return;
  }

  opportunities.sort((a, b) => b.roi - a.roi);

  list.innerHTML = opportunities.map(o => {
    const arrow = o.spread > 0 ? '' : '';
    const color = o.spread > 0 ? 'var(--green)' : 'var(--red)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
      <img src="${o.image || ''}" style="width:36px;height:48px;object-fit:contain;background:#000;border-radius:4px;flex-shrink:0" onerror="this.style.display='none'">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(o.name)}</div>
        <div style="font-size:10px;color:var(--muted)">${esc(o.set || '')}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="color:${color};font-weight:700">${arrow} ${Math.abs(o.roi).toFixed(0)}% ROI</div>
        <div style="font-size:10px;color:var(--muted)">Buy ${o.buyPlatform} ~$${o.cmLow?.toFixed(2) || '-'}</div>
        <div style="font-size:10px;color:var(--gold)">Sell ${o.sellPlatform} $${o.tcgMarket?.toFixed(2)}</div>
        <div style="font-size:10px;font-weight:600;color:${color}">+$${o.profitPer?.toFixed(2)}/card</div>
      </div>
    </div>`;
  }).join('');
}

// LOG SALE -----------------------------------------------
function logSale() {
  const sku = $('log-sku').value.trim().toUpperCase();
  const name = $('log-name').value.trim();
  const price = parseFloat($('log-price').value) || 0;
  let cost = parseFloat($('log-cost').value) || 0;
  const qty = parseInt($('log-qty').value) || 1;
  const location = $('sale-location').value;
  const date = $('sale-date') ? $('sale-date').value : d8();
  const condition = ($('log-condition') && $('log-condition').value) || 'NM';

  if (!price) { toast('Enter a sale price', 'err'); return; }

  const inv = DB.inventory;
  let remaining = qty;
  let kind = 'raw';
  for (let i = 0; i < inv.length && remaining > 0; i++) {
    const sameSku = sku && inv[i].sku === sku;
    const sameName = !sku && name && (inv[i].name || '').toLowerCase() === name.toLowerCase();
    const condOk = !inv[i].condition || inv[i].condition === condition || condition === 'NM';
    if (inv[i].qty > 0 && (sameSku || sameName) && condOk) {
      if (!cost && inv[i].cost) cost = inv[i].cost;
      kind = inv[i].kind || kind;
      const take = Math.min(inv[i].qty, remaining);
      inv[i].qty -= take;
      remaining -= take;
    }
  }
  if (remaining === qty && sku) {
    for (let i = 0; i < inv.length && remaining > 0; i++) {
      if (inv[i].sku === sku && inv[i].qty > 0) {
        if (!cost && inv[i].cost) cost = inv[i].cost;
        kind = inv[i].kind || kind;
        const take = Math.min(inv[i].qty, remaining);
        inv[i].qty -= take;
        remaining -= take;
      }
    }
  }
  DB.inventory = inv.filter(i => i.qty > 0);
  DB.saveInventory();

  const customer = (typeof normalizeCustName === 'function') ? normalizeCustName($('log-customer') && $('log-customer').value) : (($('log-customer') && $('log-customer').value) || '').trim();
  const applyCredit = !!( $('log-apply-credit') && $('log-apply-credit').checked );
  let creditApplied = 0;
  let creditBalance = null;
  const saleTotal = price * qty;
  if (applyCredit && customer) {
    creditApplied = Math.min(num($('log-credit-amt') && $('log-credit-amt').value), saleTotal);
    const cust = (typeof findCustomerByName === 'function') ? findCustomerByName(customer) : null;
    if (!cust) { toast('Customer not found for store credit', 'err'); return; }
    if (creditApplied > cust.balance + 0.001) { toast('Credit exceeds balance', 'err'); return; }
    if (creditApplied > 0) {
      try {
        const updated = redeemCustomerCredit(customer, creditApplied, 'Sale ' + (name || sku || ''), 'sale');
        creditBalance = updated.balance;
      } catch (e) { toast(e.message || 'Credit apply failed', 'err'); return; }
    }
  }
  const cashPaid = Math.round((saleTotal - creditApplied) * 100) / 100;
  const sale = { id: Date.now(), sku, name, price, cost, qty, location, date, condition, kind, profit: (price - cost) * qty, customer: customer || '', creditApplied: creditApplied || 0, cashPaid: cashPaid };
  DB.sales.push(sale);
  DB.saveSales();

  $('log-sku').value = ''; $('log-name').value = ''; $('log-price').value = ''; $('log-cost').value = ''; $('log-qty').value = '1';
  if ($('log-find')) $('log-find').value = '';
  if ($('inv-pick-box')) $('inv-pick-box').innerHTML = '';
  if ($('log-apply-credit')) $('log-apply-credit').checked = false;
  if ($('log-credit-amt')) $('log-credit-amt').value = '0';
  if (typeof onSaleCustomerInput === 'function') onSaleCustomerInput();
  if (typeof refreshCustomerDatalist === 'function') refreshCustomerDatalist();
  if (typeof renderCustomers === 'function') renderCustomers();

  toast('Sale logged — profit ' + fmt(sale.profit) + (creditApplied ? (' · credit ' + fmt(creditApplied)) : ''), sale.profit > 0 ? 'ok' : 'err');
  renderRecentSales();
  if (typeof renderFastSale === 'function') renderFastSale();
  setTimeout(focusSaleScanField, 40);
  // Defer reports redraw — not needed for next scan
  const _deferRep = (typeof requestIdleCallback === 'function')
    ? function (fn) { requestIdleCallback(fn, { timeout: 1200 }); }
    : function (fn) { setTimeout(fn, 200); };
  _deferRep(function () { try { renderReports(); } catch (e) {} });
  if (typeof openPrintableReceipt === 'function') {
    openPrintableReceipt({
      title: 'Sale receipt',
      date: date,
      location: location,
      customer: customer || '',
      lines: [{ name: name, sku: sku, qty: qty, price: price }],
      subtotal: saleTotal,
      creditApplied: creditApplied || 0,
      cashPaid: cashPaid,
      creditBalance: creditBalance,
      notes: creditApplied ? ('Paid with $' + creditApplied.toFixed(2) + ' store credit') : ''
    });
  }
}

function renderRecentSales() {
  const sales = DB.sales.slice(-10).reverse();
  if (!sales.length) {
    $('recent-sales').innerHTML = '<div class="card">' + (typeof emptyStateHtml === 'function' ? emptyStateHtml('receipt', 'No sales yet', 'Search stock by name or SKU, or scan a barcode, then log a sale.', '<button class="btn btn-secondary" type="button" onclick="document.getElementById(\'log-find\').focus()">Find in stock</button>') : '<div class="empty-state">No sales logged yet</div>') + '</div>';
    return;
  }
  $('recent-sales').innerHTML = '<div class="card"><div class="card-title">Recent sales</div></div>' +
    sales.map(s => `<div class="card" style="padding:10px 14px">
      <div class="flex-between">
        <span style="font-weight:600;font-size:13px">${esc(s.name || s.sku || 'Sale')}</span>
        <span class="${s.profit >= 0 ? 'profit-pos' : 'profit-neg'}">${fmt(s.profit)}</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:3px">${esc(s.sku)}  ${esc(s.location)}  ${esc(s.date)}  ${esc(s.condition || 'NM')}</div>
      <div style="font-size:11px;color:var(--muted)">Sold ${s.qty} @ ${fmt(s.price)}  Cost ${fmt(s.cost)}</div>
    </div>`).join('');
}

// INVENTORY -----------------------------------------------
function addInventory() {
  if (typeof addInventoryShop === 'function') return addInventoryShop();
  const sku = $('inv-sku').value.trim().toUpperCase();
  const name = $('inv-name').value.trim();
  const qty = parseInt($('inv-qty').value) || 1;
  const cost = parseFloat($('inv-cost').value) || 0;
  const set = $('inv-set').value.trim();
  const condition = $('inv-condition').value;
  const notes = $('inv-notes').value.trim();
  if (!name && !sku) { toast('Enter a card name or SKU', 'err'); return; }
  const item = { id: Date.now(), sku, name, qty, cost, set, condition, notes, type: 'single', kind: 'raw', addedAt: d8() };
  const existing = sku ? DB.inventory.find(i => i.sku === sku && (i.condition || 'NM') === condition) : null;
  if (existing) { existing.qty += qty; if (cost) existing.cost = cost; }
  else DB.inventory.push(item);
  DB.saveInventory();
  $('inv-sku').value = ''; $('inv-name').value = ''; $('inv-qty').value = '1'; $('inv-cost').value = '';
  $('inv-set').value = ''; $('inv-notes').value = '';
  toast('Added to inventory', 'ok');
  renderInventory();
  renderReports();
}

function receiveBox() {
  const name = $('box-name').value.trim();
  const set = $('box-set').value.trim();
  const totalCost = parseFloat($('box-cost').value) || 0;
  const packsPer = parseInt($('box-count').value) || 1;
  const units = ($('box-qty') && parseInt($('box-qty').value, 10)) || 1;
  const packCount = packsPer * Math.max(units, 1);
  const sku = $('box-sku').value.trim().toUpperCase();
  const supplier = $('box-supplier').value;
  const date = $('box-date').value;

  if (!name && !sku) { toast('Enter a box name or SKU', 'err'); return; }
  if (!totalCost) { toast('Enter the total box cost', 'err'); return; }
  if (packCount < 1) { toast('Enter packs per box (e.g. 36)', 'err'); return; }

  const unitCost = totalCost / packCount;
  const packUnit = Math.floor(unitCost * 100) / 100;
  const remainder = Math.round((unitCost - packUnit) * packCount * 100) / 100;

  // Log the wholesale purchase as a cost entry
  const purchase = {
    id: Date.now(),
    type: 'box',
    sku: sku || name.toUpperCase().replace(/\s+/g, '-').slice(0, 14),
    name,
    set,
    supplier,
    date,
    totalCost,
    packCount,
    unitCost: packUnit,
    status: 'closed',
    profit: -totalCost,
  };
  DB.sales.push(purchase);
  DB.saveSales();

  // Add individual packs to inventory
  const inv = DB.inventory;
  const boxSku = sku || ('BOX-' + Date.now());
  let added = 0;
  for (let i = 0; i < packCount; i++) {
    const packSku = boxSku + '-P' + String(i + 1).padStart(2, '0');
    const cost = i === 0 ? packUnit + remainder : packUnit; // distribute rounding
    inv.push({
      id: Date.now() + i,
      sku: packSku,
      name: name + ' / Pack ' + (i + 1),
      set,
      qty: 1,
      cost,
      condition: 'NM',
      kind: 'pack',
      type: 'pack',
      parentBox: boxSku,
      supplier,
      receivedDate: date,
      addedAt: date || (typeof d8 === 'function' ? d8() : ''),
    });
    added++;
  }
  DB.inventory = inv;
  DB.saveInventory();

  // Clear form
  $('box-name').value = ''; $('box-set').value = ''; $('box-cost').value = '';
  $('box-sku').value = ''; $('box-supplier').value = '';

  toast(`Added ${added} individual packs @ ${fmt(packUnit)} each`, 'ok');
  renderInventory();
  renderReports();
}


var _artBackfillTimer = null;
var _artBackfillRunning = false;
function scheduleInventoryArtBackfill() {
  if (_artBackfillTimer) clearTimeout(_artBackfillTimer);
  _artBackfillTimer = setTimeout(runInventoryArtBackfill, 600);
}
async function runInventoryArtBackfill() {
  if (_artBackfillRunning) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  _artBackfillRunning = true;
  try {
    var list = (DB.inventory || []).filter(function (i) {
      return i && i.name && !i.image && !i.imageLarge && i.kind !== 'sealed';
    }).slice(0, 8);
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      var before = list[i].image;
      await ensureItemCardArt(list[i], false);
      if (list[i].image && list[i].image !== before) changed = true;
    }
    if (changed) {
      try { DB.saveInventory(); } catch (e) {}
      if (typeof renderInventory === 'function') renderInventory();
      if (typeof renderStorefront === 'function') renderStorefront();
      if (typeof renderFastSale === 'function') renderFastSale();
    }
  } finally {
    _artBackfillRunning = false;
  }
}


function _invRowHtml(i, idx) {
  const badge = (typeof kindBadge === 'function') ? kindBadge(i) : '';
  const cond = (typeof condBadge === 'function') ? condBadge(i.condition || 'NM') : esc(i.condition || '');
  const cert = i.cert ? `<div style="font-family:ui-monospace,monospace;font-size:10px;color:var(--purple)">#${esc(i.cert)}</div>` : '';
  const brk = i.kind === 'sealed' ? `<button class="btn btn-secondary" type="button" onclick="startBreak(${idx})">Break</button>` : '';
  const sell = `<button class="btn btn-primary" type="button" onclick="fillFromInventory(${idx});switchTab('log')">Sell</button>`;
  var imgUrl = i.imageLarge || i.image || '';
  if (imgUrl && typeof ctCacheImageUrl === 'function') imgUrl = ctCacheImageUrl(imgUrl);
  const thumb = (typeof cardArtHtml === 'function') ? cardArtHtml(imgUrl, 'card-art-lg', true) : '';
  const priceHint = (i.market || i.sell || i.cost) ? fmt(i.market || i.sell || i.cost) : fmt(i.cost);
  var lpBlock = (typeof ctLivePriceRowHtml === 'function') ? ctLivePriceRowHtml(i) : ('<span class="inv-card-price" id="inv-cost-' + idx + '">' + priceHint + '</span>');
  return `<article class="inv-card" id="inv-row-${idx}" oncontextmenu="event.preventDefault();openItemSheet(${idx});return false;">
        <div class="inv-card-art" onclick="openItemSheet(${idx})">${thumb}</div>
        <div class="inv-card-body">
          <div class="inv-card-name">${esc(i.name||'-')} ${badge}</div>
          <div class="inv-card-meta">${esc(i.set||'')} ${i.number ? '#' + esc(i.number) + ' · ' : ''}${cond}</div>
          <div class="inv-card-meta" style="font-family:ui-monospace,monospace;color:var(--blue)">${esc(i.sku||'—')}</div>
          ${cert}
          <div class="inv-card-row">
            <div class="inv-card-price" id="inv-cost-${idx}">${lpBlock}</div>
            <span class="inv-qty-chip">×${i.qty}</span>
          </div>
          <div class="inv-card-actions">${sell}${brk}</div>
        </div>
      </article>`;
}
var _invVirt = { items: [], rowH: 148, bound: false };
function _invVirtPaint() {
  var host = $('inventory-list');
  if (!host) return;
  var scroller = host.querySelector('.inv-virt');
  if (!scroller) return;
  var items = _invVirt.items;
  var rowH = _invVirt.rowH;
  var cols = (window.matchMedia && window.matchMedia('(min-width:720px)').matches) ? 2 : 1;
  var rows = Math.ceil(items.length / cols);
  var totalH = rows * rowH;
  var spacer = scroller.querySelector('.inv-virt-spacer');
  var win = scroller.querySelector('.inv-virt-window');
  if (spacer) spacer.style.height = totalH + 'px';
  var scrollTop = scroller.scrollTop || 0;
  var viewH = scroller.clientHeight || 600;
  var startRow = Math.max(0, Math.floor(scrollTop / rowH) - 2);
  var endRow = Math.min(rows, Math.ceil((scrollTop + viewH) / rowH) + 2);
  var start = startRow * cols;
  var end = Math.min(items.length, endRow * cols);
  var html = '';
  for (var i = start; i < end; i++) {
    html += items[i].html;
  }
  if (win) {
    win.style.transform = 'translateY(' + (startRow * rowH) + 'px)';
    win.innerHTML = '<div class="inv-magazine">' + html + '</div>';
  }
  // Prefetch next window art
  for (var j = end; j < Math.min(items.length, end + 8); j++) {
    if (items[j].img && typeof ctPrefetchImage === 'function') ctPrefetchImage(items[j].img);
  }
}
function renderInventory() {
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const q = (($('inv-search') && $('inv-search').value) || '').toLowerCase();
  const filter = (typeof currentInvFilter === 'function') ? currentInvFilter() : 'all';
  const inv = DB.inventory.filter(i => {
    const textOk = !q || (i.name||'').toLowerCase().includes(q) || (i.sku||'').toLowerCase().includes(q) || (i.set||'').toLowerCase().includes(q) || (i.cert||'').toLowerCase().includes(q);
    if (!textOk) return false;
    if (filter === 'all') return true;
    const g = (typeof itemKindGroup === 'function') ? itemKindGroup(i) : (i.kind || 'raw');
    return g === filter;
  });

  if (!inv.length) {
    $('inventory-list').innerHTML = (typeof emptyStateHtml === 'function' ? emptyStateHtml('box', 'No matching stock', 'Receive sealed, add a single with SKU, or load the sample shop.', '<button class="btn btn-primary" type="button" onclick="loadSampleShop(true)">Load sample shop</button> <button class="btn btn-secondary" type="button" onclick="document.getElementById(\'inv-search\').value=\'\';renderInventory();">Clear search</button>') : '<div class="empty-state">No matching stock</div>');
    if (typeof CT_PERF !== 'undefined') CT_PERF.invRenderMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0);
    return;
  }

  // Virtualize on mobile / large lists (>50)
  var useVirt = inv.length > 50;
  try { if (window.matchMedia && window.matchMedia('(min-width:900px)').matches && inv.length <= 120) useVirt = false; } catch (e) {}

  if (!useVirt) {
    $('inventory-list').innerHTML = '<div class="inv-magazine">' +
      inv.map((i) => {
        const idx = DB.inventory.indexOf(i);
        return _invRowHtml(i, idx);
      }).join('') + '</div>';
  } else {
    _invVirt.items = inv.map(function (i) {
      var idx = DB.inventory.indexOf(i);
      return { html: _invRowHtml(i, idx), img: i.imageLarge || i.image || '' };
    });
    $('inventory-list').innerHTML = '<div class="inv-virt" id="inv-virt-scroller"><div class="inv-virt-spacer"></div><div class="inv-virt-window"></div></div>';
    var sc = $('inv-virt-scroller');
    if (sc && !sc._virtBound) {
      sc.addEventListener('scroll', function () {
        if (sc._raf) return;
        sc._raf = requestAnimationFrame(function () { sc._raf = 0; _invVirtPaint(); });
      }, { passive: true });
      sc._virtBound = true;
    }
    _invVirtPaint();
  }
  // Prefetch first few images
  inv.slice(0, 6).forEach(function (i) {
    var u = i.imageLarge || i.image;
    if (u && typeof ctPrefetchImage === 'function') ctPrefetchImage(u);
  });
  if (typeof scheduleInventoryArtBackfill === 'function') scheduleInventoryArtBackfill();
  if (typeof CT_PERF !== 'undefined') CT_PERF.invRenderMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0);
  if (typeof refreshPerfHud === 'function') try { refreshPerfHud(); } catch (e) {}
}


// Fetch live TCGPlayer price for inventory item by index
async function fetchLivePrice(idx) {
  const item = DB.inventory[idx];
  if (!item) return;
  const btn = $('inv-btn-' + idx);
  const mktCell = $('inv-mkt-' + idx);
  const costCell = $('inv-cost-' + idx);
  if (!btn || !item.name) return;

  btn.textContent = '';
  btn.disabled = true;
  mktCell.textContent = '';
  mktCell.style.color = 'var(--muted)';

  try {
    // Search by card name
    const url = `${PTCG_API}/cards?q=name:*${encodeURIComponent(item.name)}*&pageSize=5&select=id,name,set,tcgplayer.prices`;
    const res = await fetch(url);
    const data = await res.json();
    const cards = data.data || [];

    // Find best match - prefer same set, else first with price
    let card = cards.find(c => c.set.id === item.set?.toLowerCase().replace(/\s+/g, '-'));
    if (!card) card = cards.find(c => c.tcgplayer?.prices);
    if (!card) card = cards[0];

    if (!card) {
      mktCell.textContent = 'Not found';
      mktCell.style.color = 'var(--red)';
      btn.textContent = '';
      btn.disabled = false;
      return;
    }

    // Fetch full card data for accurate price
    const detailRes = await fetch(`${PTCG_API}/cards/${card.id}`);
    const detail = await detailRes.json();
    const full = detail.data || card;

    const tcg = full.tcgplayer?.prices || {};
    const holo = tcg.holofoil || tcg.normal || {};
    const price = holo.market || holo.mid || holo.low || null;

    if (price) {
      mktCell.textContent = '$' + price.toFixed(2);
      mktCell.style.color = 'var(--gold)';
      mktCell.style.fontWeight = '700';
      // Auto-update cost to market price
      DB.inventory[idx].cost = parseFloat(price.toFixed(2));
      costCell.textContent = fmt(DB.inventory[idx].cost);
      DB.saveInventory();
      btn.textContent = '';
      toast(`Updated ${item.name} cost to $${price.toFixed(2)}`, 'ok');
    } else {
      mktCell.textContent = 'No price';
      mktCell.style.color = 'var(--muted)';
      btn.textContent = '';
    }
  } catch(err) {
    console.error('Price fetch error:', err);
    mktCell.textContent = 'Error';
    mktCell.style.color = 'var(--red)';
    btn.textContent = '';
  } finally {
    if (btn.textContent === '') btn.disabled = false;
    setTimeout(() => {
      const b = $('inv-btn-' + idx);
      if (b) { b.textContent = ''; b.disabled = false; }
    }, 3000);
  }
}

// REPORTS -------------------------------------------------
function renderReports() {
  const rangeVal = ($('r-top-range') && $('r-top-range').value) || '30';
  const days = rangeVal === 'all' ? 0 : (parseInt(rangeVal, 10) || 30);
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const sales = (typeof realSales === 'function' ? realSales() : DB.sales.filter(s => s.type !== 'box')).filter(s => !cutoff || (s.date && new Date(s.date).getTime() >= cutoff));

  const revenue = sales.reduce((sum, s) => sum + (s.price || 0) * (s.qty || 0), 0);
  const profit = sales.reduce((sum, s) => sum + (s.profit || 0), 0);
  const margin = revenue > 0 ? ((profit / revenue) * 100) : 0;
  const sold = sales.reduce((sum, s) => sum + s.qty, 0);
  const stock = DB.inventory.reduce((sum, i) => sum + i.qty, 0);

  $('r-revenue').textContent = fmt(revenue);
  $('r-profit').textContent = fmt(profit);
  $('r-profit').className = 'metric ' + (profit >= 0 ? 'green' : 'red');
  $('r-margin').textContent = margin.toFixed(1) + '%';
  $('r-margin').className = 'metric ' + (margin >= 30 ? 'green' : margin >= 15 ? '' : 'red');
  $('r-sold').textContent = fmtN(sold);
  $('r-stock').textContent = fmtN(stock);

  const invCost = DB.inventory.reduce((sum, i) => sum + (i.cost || 0) * i.qty, 0);
  $('r-inv-cost').textContent = fmt(invCost);

  const wholesalePurchases = DB.sales.filter(s => s.type === 'box');
  const wholesaleSpent = wholesalePurchases.reduce((sum, s) => sum + (s.totalCost || 0), 0);
  const sealedOnHand = DB.inventory.filter(i => i.kind === 'sealed' || i.type === 'sealed').reduce((sum, i) => sum + (i.cost || 0) * (i.qty || 0), 0);
  $('r-wholesale-cost').textContent = fmt(wholesaleSpent + sealedOnHand);

  // Top sellers by quantity
  const topMap = {};
  sales.forEach(s => {
    const key = s.sku || s.name;
    if (!topMap[key]) topMap[key] = { name: s.name, sku: s.sku, qty: 0, revenue: 0, profit: 0 };
    topMap[key].qty += s.qty;
    topMap[key].revenue += s.price * s.qty;
    topMap[key].profit += s.profit;
  });
  const top = Object.values(topMap).sort((a, b) => b.qty - a.qty).slice(0, 8);

  $('r-top-list').innerHTML = top.length === 0 ? '<div style="font-size:12px;color:var(--muted)">No sales in this period</div>' :
    top.map(t => `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">
      <div><div style="font-weight:600">${esc(t.name||t.sku)}</div><div style="font-size:10px;color:var(--muted)">${esc(t.sku)}  ${t.qty} sold</div></div>
      <div style="text-align:right"><div class="${t.profit>=0?'profit-pos':'profit-neg'}">${fmt(t.profit)}</div><div style="font-size:10px;color:var(--muted)">rev ${fmt(t.revenue)}</div></div>
    </div>`).join('');

  if (typeof renderReportsShopExtras === 'function') renderReportsShopExtras();

  // --- Profit Line Chart --------------------------------------
  const periodLabel = $('chart-period-label');
  if (periodLabel) {
    periodLabel.textContent = !days ? 'All time' : ('Last ' + days + ' days');
  }

  const chartSales = DB.sales
    .filter(s => s.type !== 'box' && s.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!window.profitChart) {
    const ctx = $('profit-chart').getContext('2d');
    window.profitChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Cumulative Profit',
          data: [],
          borderColor: '#3fba80',
          backgroundColor: 'rgba(63,186,128,0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => 'Profit: ' + fmt(ctx.parsed.y),
              title: ctx => ctx[0].label,
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(42,47,69,0.5)', drawBorder: false },
            ticks: { color: '#7a8194', maxTicksLimit: 8, font: { size: 10 } },
          },
          y: {
            grid: { color: 'rgba(42,47,69,0.5)', drawBorder: false },
            ticks: { color: '#7a8194', font: { size: 10 }, callback: v => '$' + v.toFixed(0) },
          }
        }
      }
    });
  }

  if (chartSales.length === 0) {
    window.profitChart.data.labels = ['No sales yet'];
    window.profitChart.data.datasets[0].data = [0];
    window.profitChart.data.datasets[0].borderColor = '#7a8194';
    window.profitChart.update();
    return;
  }

  const cutoffDate = cutoff ? new Date(cutoff) : null;
  const filtered = cutoffDate ? chartSales.filter(s => new Date(s.date) >= cutoffDate) : chartSales;

  // Build date  cumulative profit map
  const dateProfit = {};
  filtered.forEach(s => {
    const d = s.date;
    dateProfit[d] = (dateProfit[d] || 0) + (s.profit || 0);
  });

  const uniqueDates = [...new Set(filtered.map(s => s.date))].sort();
  let running = 0;
  const labels = [];
  const data = [];

  uniqueDates.forEach(d => {
    running += dateProfit[d] || 0;
    labels.push(d.slice(5)); // MM-DD format
    data.push(parseFloat(running.toFixed(2)));
  });

  window.profitChart.data.labels = labels;
  window.profitChart.data.datasets[0].data = data;
  window.profitChart.data.datasets[0].borderColor = running >= 0 ? '#3fba80' : '#e05252';
  window.profitChart.data.datasets[0].backgroundColor = running >= 0 ? 'rgba(63,186,128,0.08)' : 'rgba(224,82,82,0.08)';
  window.profitChart.update();
}

// EXPORT --------------------------------------------------
function exportAll() {
  let csv = 'Date,SKU,Card Name,Sale Price,Cost,Qty,Location,Condition,Kind,Profit\n';
  DB.sales.forEach(s => {
    csv += `${s.date||''},"${s.sku||''}","${s.name||''}",${s.price||0},${s.cost||0},${s.qty||0},"${s.location||''}","${s.condition||''}","${s.kind||''}",${s.profit||0}\n`;
  });
  download('cardtrack-sales.csv', csv, 'text/csv');

  let csv2 = 'SKU,Card Name,Quantity,Unit Cost,Set,Condition,Kind,Grade,Cert,SealedType,Notes\n';
  DB.inventory.forEach(i => {
    csv2 += `"${i.sku||''}","${i.name||''}",${i.qty||0},${i.cost||0},"${i.set||''}","${i.condition||''}","${i.kind||''}","${i.gradeCompany||''} ${i.gradeValue||''}","${i.cert||''}","${i.sealedType||''}","${i.notes||''}"\n`;
  });
  download('cardtrack-inventory.csv', csv2, 'text/csv');
  toast('Exported CSVs', 'ok');
}
function download(filename, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
}
function esc(s) { return (s || '').replace(/"/g, '&quot;'); }

// 

// ============================================================
// CardTrack Shop — retail P0 (buylist, sealed, graded, show, backup)
// ============================================================
const CT_SETTINGS_KEY = 'ct_settings';
const CT_BUYLIST_KEY = 'ct_buylist';
const DEFAULT_COND_RATES = { NM: 1, LP: 0.80, MP: 0.55, HP: 0.35, DMG: 0.15 };
const SEALED_DEFAULT_PACKS = { etb: 9, booster_box: 36, upc: 16, tin: 4, collection: 3, other: 1 };
const SEALED_LABELS = { etb: 'ETB', booster_box: 'Booster Box', upc: 'UPC', tin: 'Tin', collection: 'Collection', other: 'Sealed' };
const GRADE_COS = ['PSA', 'BGS', 'CGC'];

function defaultSettings() {
  return {
    theme: 'dark',
    colorScheme: 'graphite',
    advanced: false,
    showMode: false,
    lastBackupAt: null,
    cashRate: 0.60,
    creditRate: 0.80,
    conditionRates: Object.assign({}, DEFAULT_COND_RATES),
    restockQty: 3,
    deadStockDays: 60,
    shopName: '',
    logoUrl: '',
    meetLocation: '',
    onboarded: false,
    compsEnabled: true,
    compsAutoFill: true,
    ptcgApiKey: '',
    sampleLoaded: false,
    p2p: { cashapp: '', venmo: '', zelle: '', paypal: '' },
    promos: [],
    minMarginPct: 15,
    marketFloorPct: 85,
    floorBlock: false,
    pinEnabled: false,
    pinHash: '',
    webauthnCredId: '',
    haptics: true,
    beep: false,
    muteFeedback: false,
    artCacheEnabled: true,
    gridSize: 'L',
    livePrices: true,
    livePriceIntervalSec: 120
  };
}

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(CT_SETTINGS_KEY) || '{}');
    const d = defaultSettings();
    const rates = Object.assign({}, d.conditionRates, raw.conditionRates || {});
    return Object.assign({}, d, raw, { conditionRates: rates });
  } catch (e) {
    return defaultSettings();
  }
}

function saveSettings(s) {
  localStorage.setItem(CT_SETTINGS_KEY, JSON.stringify(s));
}

function getBuylist() {
  try { return JSON.parse(localStorage.getItem(CT_BUYLIST_KEY) || '[]'); }
  catch (e) { return []; }
}
function saveBuylist(list) {
  localStorage.setItem(CT_BUYLIST_KEY, JSON.stringify(list));
}

function num(n, fallback) {
  const v = parseFloat(n);
  return isNaN(v) ? (fallback || 0) : v;
}
function int(n, fallback) {
  const v = parseInt(n, 10);
  return isNaN(v) ? (fallback || 0) : v;
}

function migrateRecords() {
  let invChanged = false;
  DB.inventory = (DB.inventory || []).map(function (i) {
    if (!i || typeof i !== 'object') return i;
    const next = i;
    if (next.qty == null && next.quantity != null) { next.qty = int(next.quantity, 1); invChanged = true; }
    if (next.qty == null) { next.qty = 1; invChanged = true; }
    if (next.cost == null && next.price_paid != null) { next.cost = num(next.price_paid); invChanged = true; }
    if (next.cost == null) { next.cost = 0; invChanged = true; }
    if (!next.name && next.card) { next.name = next.card; invChanged = true; }
    if (!next.condition) { next.condition = 'NM'; invChanged = true; }
    if (next.condition === 'Damaged') { next.condition = 'DMG'; invChanged = true; }
    if (!next.kind) {
      if (next.type === 'pack') next.kind = 'pack';
      else if (next.type === 'box' || next.type === 'sealed') next.kind = 'sealed';
      else if (next.gradeCompany || next.cert) next.kind = 'graded';
      else next.kind = 'raw';
      invChanged = true;
    }
    if (next.gradeCompany == null) { next.gradeCompany = ''; }
    if (next.gradeValue == null) { next.gradeValue = ''; }
    if (next.cert == null) { next.cert = ''; }
    if (next.sealedType == null) { next.sealedType = next.kind === 'sealed' ? 'other' : ''; }
    if (!next.addedAt) {
      next.addedAt = next.receivedDate || next.purchase_date || next.date || d8();
      invChanged = true;
    }
    if (!next.id) { next.id = Date.now() + Math.floor(Math.random() * 999); invChanged = true; }
    if (next.sku == null) { next.sku = ''; invChanged = true; }
    return next;
  });
  let salesChanged = false;
  DB.sales = (DB.sales || []).map(function (s) {
    if (!s || typeof s !== 'object') return s;
    if (s.qty == null) { s.qty = 1; salesChanged = true; }
    if (s.price == null) { s.price = 0; salesChanged = true; }
    if (s.cost == null) { s.cost = 0; salesChanged = true; }
    if (s.profit == null && s.type !== 'box') {
      s.profit = (num(s.price) - num(s.cost)) * int(s.qty, 1);
      salesChanged = true;
    }
    if (!s.condition) { s.condition = 'NM'; salesChanged = true; }
    if (!s.kind) {
      s.kind = s.type === 'box' ? 'sealed' : (s.type === 'buylist' ? 'buylist' : 'sale');
      salesChanged = true;
    }
    return s;
  });
  if (invChanged) DB.saveInventory();
  if (salesChanged) DB.saveSales();
}

function applyShopChrome() {
  const s = loadSettings();
  document.body.classList.toggle('show-mode', !!s.showMode);
  document.body.classList.toggle('advanced', !!s.advanced);
  if (s.showMode) {
    const active = document.querySelector('.section.active');
    const hidden = ['sec-scan','sec-prices','sec-watchlist','sec-ebay','sec-game'];
    if (active && hidden.indexOf(active.id) !== -1 && typeof switchTab === 'function') switchTab('log');
  }
  const pill = $('show-mode-pill');
  if (pill) pill.style.display = s.showMode ? 'inline-block' : 'none';
  const tShow = $('set-show-mode');
  const tAdv = $('set-advanced');
  if (tShow) tShow.checked = !!s.showMode;
  if (tAdv) tAdv.checked = !!s.advanced;
  if ($('set-cash-rate')) $('set-cash-rate').value = Math.round((s.cashRate || 0.6) * 100);
  if ($('set-credit-rate')) $('set-credit-rate').value = Math.round((s.creditRate || 0.8) * 100);
  if ($('set-restock-qty')) $('set-restock-qty').value = s.restockQty || 3;
  if ($('set-dead-days')) $('set-dead-days').value = s.deadStockDays || 60;
  if ($('set-shop-name')) $('set-shop-name').value = s.shopName || '';
  if ($('set-logo-url')) $('set-logo-url').value = s.logoUrl || '';
  if ($('set-meet-location')) $('set-meet-location').value = s.meetLocation || '';
  if ($('set-comps-enabled')) $('set-comps-enabled').checked = s.compsEnabled !== false;
  if ($('set-comps-autofill')) $('set-comps-autofill').checked = s.compsAutoFill !== false;
  if ($('set-ptcg-key')) $('set-ptcg-key').value = s.ptcgApiKey || '';
  if (typeof updateCompsCacheStats === 'function') updateCompsCacheStats();
  if ($('set-min-margin')) $('set-min-margin').value = s.minMarginPct != null ? s.minMarginPct : 15;
  if ($('set-market-floor')) $('set-market-floor').value = s.marketFloorPct != null ? s.marketFloorPct : 85;
  if ($('set-floor-block')) $('set-floor-block').checked = !!s.floorBlock;
  if ($('set-pin-enabled')) $('set-pin-enabled').checked = !!s.pinEnabled;
  if ($('set-haptics')) $('set-haptics').checked = s.haptics !== false;
  if ($('set-beep')) $('set-beep').checked = !!s.beep;
  if ($('set-mute-feedback')) $('set-mute-feedback').checked = !!s.muteFeedback;
  if (typeof ctUpdateOutboxBadge === 'function') ctUpdateOutboxBadge();
  if (typeof ctRefreshArtCacheStats === 'function') ctRefreshArtCacheStats();

  ['NM', 'LP', 'MP', 'HP', 'DMG'].forEach(function (c) {
    const el = $('rate-' + c);
    if (el) el.value = Math.round(((s.conditionRates || {})[c] != null ? s.conditionRates[c] : DEFAULT_COND_RATES[c]) * 100);
  });
  updateBackupLabel();
  const sub = document.querySelector('.header .subtitle');
  if (sub) sub.textContent = (s.shopName ? s.shopName + ' · ' : '') + 'On this device · no account';
}

function setShowMode(on) {
  const s = loadSettings();
  s.showMode = !!on;
  saveSettings(s);
  applyShopChrome();
  toast(on ? 'Show mode on — scan lane ready' : 'Show mode off', 'ok');
  if (on && typeof switchTab === 'function') switchTab('log');
  else setTimeout(focusSaleScanField, 40);
}
function setAdvanced(on) {
  const s = loadSettings();
  s.advanced = !!on;
  saveSettings(s);
  applyShopChrome();
  toast(on ? 'Advanced tools visible' : 'eBay & Games hidden', 'ok');
}

function checkOnline() {
  const b = $('offline-banner');
  if (!b) return;
  const offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
  b.classList.toggle('show', offline);
}
function checkBackupReminder() {
  const b = $('backup-banner');
  if (!b) return;
  const s = loadSettings();
  const last = s.lastBackupAt ? Date.parse(s.lastBackupAt) : 0;
  const stale = !last || (Date.now() - last) > 24 * 3600000;
  const dismissed = s.backupBannerDismissedAt ? Date.parse(s.backupBannerDismissedAt) : 0;
  const dismissFresh = dismissed && (Date.now() - dismissed) < 24 * 3600000;
  b.classList.toggle('show', stale && !dismissFresh);
  updateBackupLabel();
}
function updateBackupLabel() {
  const el = $('backup-last-label');
  if (!el) return;
  const s = loadSettings();
  if (!s.lastBackupAt) { el.textContent = 'Never backed up'; return; }
  const t = new Date(s.lastBackupAt);
  el.textContent = 'Last backup: ' + t.toLocaleString();
}
function markBackupDone() {
  const s = loadSettings();
  s.lastBackupAt = new Date().toISOString();
  saveSettings(s);
  checkBackupReminder();
}

function backupJSON() {
  const payload = {
    app: 'CardTrack Shop',
    version: 5,
    exportedAt: new Date().toISOString(),
    sales: DB.sales,
    inventory: DB.inventory,
    watchlist: (typeof getWatchlist === 'function') ? getWatchlist() : [],
    buylist: getBuylist(),
    customers: (typeof getCustomers === 'function') ? getCustomers() : [],
    settings: loadSettings(),
    comps: (typeof loadCompsStore === 'function') ? loadCompsStore() : null
  };
  download('cardtrack-backup-' + d8() + '.json', JSON.stringify(payload, null, 2), 'application/json');
  markBackupDone();
  toast('Books backed up — save this file off the phone', 'ok');
}

function restoreJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async function (e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || (!data.inventory && !data.sales)) {
        toast('Not a CardTrack backup', 'err');
        return;
      }
      const summary = 'This will REPLACE all shop data on this device:\n' +
        '• Inventory: ' + (Array.isArray(data.inventory) ? data.inventory.length : 0) + ' lines\n' +
        '• Sales: ' + (Array.isArray(data.sales) ? data.sales.length : 0) + ' lines\n' +
        '• Trade-ins: ' + (Array.isArray(data.buylist) ? data.buylist.length : 0) + '\n' +
        '• Customers / credit: ' + (Array.isArray(data.customers) ? data.customers.length : 0) + '\n' +
        '• Comps cache: ' + (data.comps && data.comps.entries ? Object.keys(data.comps.entries).length : 0) + ' keys\n\n' +
        'Current data will be overwritten. Continue?';
      if (!confirm(summary)) return;
      if (!confirm('Final confirm: restore backup and overwrite this device?')) return;
      DB.inventory = Array.isArray(data.inventory) ? data.inventory : [];
      DB.sales = Array.isArray(data.sales) ? data.sales : [];
      DB.saveInventory();
      DB.saveSales();
      if (Array.isArray(data.watchlist) && typeof saveWatchlist === 'function') saveWatchlist(data.watchlist);
      saveBuylist(Array.isArray(data.buylist) ? data.buylist : []);
      if (typeof saveCustomers === 'function') saveCustomers(Array.isArray(data.customers) ? data.customers : []);
      if (data.settings && typeof data.settings === 'object') {
        saveSettings(Object.assign(defaultSettings(), data.settings));
      }
      if (data.comps && typeof saveCompsStore === 'function') {
        saveCompsStore(data.comps);
      }
      migrateRecords();
      applyShopChrome();
      renderInventory();
      renderRecentSales();
      renderReports();
      renderBuylist();
      if (typeof renderCustomers === 'function') renderCustomers();
      if (typeof refreshCustomerDatalist === 'function') refreshCustomerDatalist();
      toast('Backup restored', 'ok');
    } catch (err) {
      toast('Restore failed: ' + err.message, 'err');
    }
  };
  input.click();
}

function kindLabel(item) {
  if (!item) return 'Raw';
  if (item.kind === 'graded') {
    const g = [item.gradeCompany, item.gradeValue].filter(Boolean).join(' ');
    return g || 'Graded';
  }
  if (item.kind === 'sealed') return SEALED_LABELS[item.sealedType] || 'Sealed';
  if (item.kind === 'pack') return 'Pack';
  return 'Raw';
}
function kindBadge(item) {
  if (!item) return '';
  if (item.kind === 'graded') return '<span class="badge badge-purple">' + esc(kindLabel(item)) + '</span>';
  if (item.kind === 'sealed') return '<span class="badge badge-gold">' + esc(kindLabel(item)) + '</span>';
  if (item.kind === 'pack') return '<span class="badge badge-gold">PACK</span>';
  return '<span class="badge badge-blue">RAW</span>';
}
function condBadge(c) {
  const v = c || 'NM';
  return '<span class="badge cond-' + v + '">' + v + '</span>';
}

function fillFromInventory(idx) {
  const item = DB.inventory[idx];
  if (!item) return;
  if ($('log-sku')) $('log-sku').value = item.sku || '';
  if ($('log-name')) $('log-name').value = item.name || '';
  if ($('log-cost')) $('log-cost').value = item.cost != null ? item.cost : '';
  if ($('log-condition')) $('log-condition').value = item.condition || 'NM';
  if ($('log-qty')) $('log-qty').value = '1';
  const last = [...DB.sales].reverse().find(function (s) {
    return s.type !== 'box' && s.kind !== 'buylist' && ((s.sku && s.sku === item.sku) || (s.name && s.name === item.name));
  });
  if ($('log-price')) $('log-price').value = last && last.price ? last.price : '';
  toast('Loaded ' + (item.name || item.sku), 'ok');
  if ($('inv-pick-box')) $('inv-pick-box').innerHTML = '';
  if (typeof refreshCompsPanel === 'function') refreshCompsPanel('sale', false);
  setTimeout(function () {
    const p = $('log-price');
    if (p) { try { p.focus(); if (p.value) p.select(); } catch (e) {} }
  }, 20);
}

function renderInvPicker(q) {
  const box = $('inv-pick-box');
  if (!box) return;
  const query = (q || '').toLowerCase().trim();
  if (!query) { box.innerHTML = ''; return; }
  const hits = DB.inventory.filter(function (i) {
    if (!i.qty) return false;
    return (i.name || '').toLowerCase().includes(query) || (i.sku || '').toLowerCase().includes(query) || (i.cert || '').toLowerCase().includes(query);
  }).slice(0, 8);
  if (!hits.length) { box.innerHTML = '<div class="text-muted" style="font-size:12px;padding:6px 0">No matching stock</div>'; return; }
  box.innerHTML = hits.map(function (i) {
    const idx = DB.inventory.indexOf(i);
    const thumb = (typeof cardArtHtml === 'function') ? cardArtHtml(i.image || i.imageLarge || '', 'card-art-sm', true) : '';
    return '<div class="fast-sale-item" onclick="fillFromInventory(' + idx + ')">' +
      thumb +
      '<div class="fs-body"><div class="fs-name">' + esc(i.name || i.sku) + '</div>' +
      '<div class="fs-meta">' + kindLabel(i) + ' · ' + (i.condition || 'NM') + (i.cert ? ' · #' + esc(i.cert) : '') + ' · ' + i.qty + ' in stock · cost ' + fmt(i.cost) + '</div></div>' +
      '<span class="badge badge-gold">Use</span></div>';
  }).join('');
}

function renderFastSale() {
  const box = $('fast-sale-list');
  if (!box) return;
  const q = (($('fast-sale-q') && $('fast-sale-q').value) || '').toLowerCase();
  const hits = DB.inventory.filter(function (i) {
    if (!i.qty) return false;
    if (!q) return true;
    return (i.name || '').toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q) || (i.cert || '').toLowerCase().includes(q);
  }).slice(0, 20);
  if (!hits.length) {
    box.innerHTML = (typeof emptyStateHtml === 'function' ? emptyStateHtml('box', 'No matching stock', 'Add inventory, or scan a SKU on Meet.', '<button class="btn btn-secondary" type="button" onclick="switchTab(\'inventory\')">Go to Inventory</button>') : '<div class="empty-state">No matching stock</div>');
    return;
  }
  box.innerHTML = hits.map(function (i) {
    const idx = DB.inventory.indexOf(i);
    const thumb = (typeof cardArtHtml === 'function') ? cardArtHtml(i.image || i.imageLarge || '', 'card-art-sm', true) : '';
    return '<div class="fast-sale-item" onclick="fastSell(' + idx + ')">' +
      thumb +
      '<div class="fs-body"><div class="fs-name">' + esc(i.name || i.sku) + '</div>' +
      '<div class="fs-meta">' + kindLabel(i) + ' · ' + (i.condition || 'NM') + ' · qty ' + i.qty + ' · cost ' + fmt(i.cost) + '</div></div>' +
      '<span class="btn btn-primary" style="width:auto;padding:10px 14px;font-size:13px">Sell</span></div>';
  }).join('');
}

function fastSell(idx) {
  const item = DB.inventory[idx];
  if (!item || !item.qty) { toast('Out of stock', 'err'); return; }
  fillFromInventory(idx);
  const last = [...DB.sales].reverse().find(function (s) {
    return s.type !== 'box' && ((s.sku && s.sku === item.sku) || (s.name && s.name === item.name));
  });
  let price = last && last.price ? last.price : 0;
  if (!price) {
    const typed = prompt('Sale price for ' + (item.name || item.sku) + ' (cost ' + fmt(item.cost) + ')', item.cost ? String((num(item.cost) * 1.5).toFixed(2)) : '');
    if (typed == null) return;
    price = num(typed);
  } else {
    const typed = prompt('Sale price for ' + (item.name || item.sku), String(price));
    if (typed == null) return;
    price = num(typed);
  }
  if (!price) { toast('Enter a sale price', 'err'); return; }
  if ($('log-price')) $('log-price').value = price;
  if ($('log-qty')) $('log-qty').value = '1';
  logSale();
  if ($('fast-sale-q')) $('fast-sale-q').value = '';
  renderFastSale();
}

function onKindChange() {
  const kind = ($('inv-kind') && $('inv-kind').value) || 'raw';
  document.querySelectorAll('.kind-fields').forEach(function (el) { el.classList.remove('show'); });
  if (kind === 'graded' && $('fields-graded')) $('fields-graded').classList.add('show');
  if (kind === 'sealed' && $('fields-sealed')) $('fields-sealed').classList.add('show');
}

function onSealedTypeChange() {
  const t = ($('inv-sealed-type') && $('inv-sealed-type').value) || 'other';
  if ($('inv-pack-count')) $('inv-pack-count').value = SEALED_DEFAULT_PACKS[t] || 1;
  if ($('box-sealed-type') && $('box-count') && document.activeElement !== $('box-count')) {
    /* inventory sealed type only */
  }
}
function onBoxSealedType() {
  const t = ($('box-sealed-type') && $('box-sealed-type').value) || 'booster_box';
  if ($('box-count')) $('box-count').value = SEALED_DEFAULT_PACKS[t] || 36;
}

function addInventoryShop() {
  const sku = ($('inv-sku').value || '').trim().toUpperCase();
  const name = ($('inv-name').value || '').trim();
  const qty = int($('inv-qty').value, 1);
  const cost = num($('inv-cost').value);
  const set = ($('inv-set').value || '').trim();
  const condition = ($('inv-condition') && $('inv-condition').value) || 'NM';
  const notes = ($('inv-notes').value || '').trim();
  const kind = ($('inv-kind') && $('inv-kind').value) || 'raw';
  const gradeCompany = ($('inv-grade-co') && $('inv-grade-co').value) || '';
  const gradeValue = ($('inv-grade-val') && $('inv-grade-val').value || '').trim();
  const cert = ($('inv-cert') && $('inv-cert').value || '').trim();
  const sealedType = ($('inv-sealed-type') && $('inv-sealed-type').value) || '';
  const packCount = int($('inv-pack-count') && $('inv-pack-count').value, 0);

  if (!name && !sku) { toast('Enter a card name or SKU', 'err'); return; }
  if (kind === 'graded' && !gradeCompany) { toast('Choose PSA, BGS, or CGC', 'err'); return; }

  const item = {
    id: Date.now(),
    sku: sku || (kind === 'graded' && cert ? (gradeCompany + '-' + cert) : ''),
    name, qty, cost, set, condition, notes, kind,
    gradeCompany: kind === 'graded' ? gradeCompany : '',
    gradeValue: kind === 'graded' ? gradeValue : '',
    cert: kind === 'graded' ? cert : '',
    sealedType: kind === 'sealed' ? sealedType : '',
    packCount: kind === 'sealed' ? packCount : undefined,
    addedAt: d8(),
    type: kind === 'sealed' ? 'sealed' : (kind === 'pack' ? 'pack' : 'single')
  };

  const match = DB.inventory.find(function (i) {
    if (kind === 'graded' && cert) return i.cert === cert && i.gradeCompany === gradeCompany;
    if (sku && i.sku === sku && (i.condition || 'NM') === condition && (i.kind || 'raw') === kind) return true;
    return false;
  });
  if (match && kind !== 'graded') {
    match.qty = int(match.qty, 0) + qty;
    if (cost) match.cost = cost;
  } else {
    DB.inventory.push(item);
  }
  DB.saveInventory();
  var added = match && kind !== 'graded' ? match : DB.inventory[DB.inventory.length - 1];
  if (added && !added.image && typeof ensureItemCardArt === 'function') {
    ensureItemCardArt(added, true).then(function () {
      if (typeof renderInventory === 'function') renderInventory();
      if (typeof renderStorefront === 'function') renderStorefront();
    });
  }
  $('inv-sku').value = ''; $('inv-name').value = ''; $('inv-qty').value = '1'; $('inv-cost').value = '';
  $('inv-set').value = ''; $('inv-notes').value = '';
  if ($('inv-cert')) $('inv-cert').value = '';
  if ($('inv-grade-val')) $('inv-grade-val').value = '';
  toast('Added to inventory', 'ok');
  renderInventory();
  renderReports();
}

function receiveSealed() {
  const name = ($('box-name').value || '').trim();
  const set = ($('box-set').value || '').trim();
  const totalCost = num($('box-cost').value);
  const packCount = int($('box-count').value, 1);
  const sku = ($('box-sku').value || '').trim().toUpperCase();
  const supplier = ($('box-supplier') && $('box-supplier').value) || '';
  const date = ($('box-date') && $('box-date').value) || d8();
  const sealedType = ($('box-sealed-type') && $('box-sealed-type').value) || 'booster_box';
  const qty = int($('box-qty') && $('box-qty').value, 1);
  const action = ($('box-action') && $('box-action').value) || 'keep';

  if (!name && !sku) { toast('Enter a product name or SKU', 'err'); return; }
  if (!totalCost) { toast('Enter the total cost', 'err'); return; }

  if (action === 'packs') {
    receiveBox();
    const lastPacks = DB.inventory.filter(function (i) { return i.type === 'pack' && i.parentBox; }).slice(-packCount);
    lastPacks.forEach(function (p) { p.kind = 'pack'; p.sealedType = sealedType; });
    DB.saveInventory();
    return;
  }

  const unit = totalCost / Math.max(qty, 1);
  DB.inventory.push({
    id: Date.now(),
    sku: sku || (SEALED_LABELS[sealedType] || 'SEALED').replace(/\s+/g, '-').toUpperCase() + '-' + Date.now().toString().slice(-4),
    name, set, qty, cost: Math.round(unit * 100) / 100,
    condition: 'NM',
    kind: 'sealed',
    sealedType, packCount, supplier,
    addedAt: date,
    receivedDate: date,
    type: 'sealed',
    notes: packCount ? (packCount + ' packs typical') : ''
  });
  DB.saveInventory();
  $('box-name').value = ''; $('box-set').value = ''; $('box-cost').value = '';
  $('box-sku').value = '';
  if ($('box-supplier')) $('box-supplier').value = '';
  toast('Sealed product on the shelf — ' + qty + ' × ' + (SEALED_LABELS[sealedType] || 'sealed'), 'ok');
  renderInventory();
  renderReports();
}

function startBreak(idx) {
  const item = DB.inventory[idx];
  if (!item || item.kind !== 'sealed') { toast('Pick a sealed item', 'err'); return; }
  $('break-idx').value = String(idx);
  $('break-title').textContent = 'Break: ' + (item.name || item.sku);
  $('break-meta').textContent = kindLabel(item) + ' · cost ' + fmt(item.cost) + ' · ' + (item.packCount || '?') + ' packs typical';
  $('break-pack-n').value = item.packCount || SEALED_DEFAULT_PACKS[item.sealedType] || 36;
  $('break-rows').innerHTML = '';
  addBreakRow();
  $('break-card').style.display = 'block';
  $('break-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function addBreakRow() {
  const wrap = $('break-rows');
  if (!wrap) return;
  const row = document.createElement('div');
  row.className = 'quote-line break-row';
  row.innerHTML = '<input class="br-name" placeholder="Card / pack name">' +
    '<input class="br-qty" type="number" min="1" value="1" placeholder="Qty">' +
    '<input class="br-val" type="number" step="0.01" placeholder="Est. $">' +
    '<select class="br-cond"><option value="NM">NM</option><option value="LP">LP</option><option value="MP">MP</option><option value="HP">HP</option><option value="DMG">DMG</option></select>' +
    '<div class="del-btn" onclick="this.parentNode.remove()">×</div>';
  wrap.appendChild(row);
}

function commitBreak() {
  const idx = int($('break-idx').value, -1);
  const item = DB.inventory[idx];
  if (!item) { toast('Sealed item missing', 'err'); return; }
  const mode = ($('break-mode') && $('break-mode').value) || 'equal';
  const boxCost = num(item.cost) * 1;
  if (mode === 'equal') {
    const n = int($('break-pack-n').value, 0);
    if (n < 1) { toast('Enter pack count', 'err'); return; }
    const unit = Math.floor((boxCost / n) * 100) / 100;
    const remainder = Math.round((boxCost - unit * n) * 100) / 100;
    const boxSku = item.sku || ('BOX-' + Date.now());
    for (let i = 0; i < n; i++) {
      DB.inventory.push({
        id: Date.now() + i + 1,
        sku: boxSku + '-P' + String(i + 1).padStart(2, '0'),
        name: (item.name || 'Box') + ' / Pack ' + (i + 1),
        set: item.set || '',
        qty: 1,
        cost: i === 0 ? unit + remainder : unit,
        condition: 'NM',
        kind: 'pack',
        type: 'pack',
        parentBox: boxSku,
        addedAt: d8()
      });
    }
  } else {
    const rows = [...document.querySelectorAll('#break-rows .break-row')].map(function (r) {
      return {
        name: (r.querySelector('.br-name').value || '').trim(),
        qty: int(r.querySelector('.br-qty').value, 1),
        value: num(r.querySelector('.br-val').value),
        condition: r.querySelector('.br-cond').value || 'NM'
      };
    }).filter(function (r) { return r.name; });
    if (!rows.length) { toast('Add at least one pull', 'err'); return; }
    const totalVal = rows.reduce(function (s, r) { return s + (r.value || 0) * r.qty; }, 0);
    const boxSku = item.sku || ('BOX-' + Date.now());
    let allocated = 0;
    rows.forEach(function (r, i) {
      const share = totalVal > 0 ? ((r.value * r.qty) / totalVal) * boxCost : boxCost / rows.length;
      const unit = Math.round((share / r.qty) * 100) / 100;
      allocated += unit * r.qty;
      DB.inventory.push({
        id: Date.now() + i + 3,
        sku: boxSku + '-H' + String(i + 1).padStart(2, '0'),
        name: r.name,
        set: item.set || '',
        qty: r.qty,
        cost: unit,
        condition: r.condition,
        kind: 'raw',
        type: 'single',
        parentBox: boxSku,
        notes: 'From box break',
        addedAt: d8()
      });
    });
    const leftover = Math.round((boxCost - allocated) * 100) / 100;
    if (leftover > 0.009) {
      DB.inventory.push({
        id: Date.now() + 99,
        sku: boxSku + '-BULK',
        name: 'Bulk / commons — ' + (item.name || 'box'),
        set: item.set || '',
        qty: 1,
        cost: leftover,
        condition: 'NM',
        kind: 'raw',
        type: 'single',
        parentBox: boxSku,
        notes: 'Unallocated box cost',
        addedAt: d8()
      });
    }
  }
  item.qty = int(item.qty, 1) - 1;
  if (item.qty <= 0) DB.inventory.splice(idx, 1);
  DB.saveInventory();
  $('break-card').style.display = 'none';
  toast('Box broken — cost allocated', 'ok');
  renderInventory();
  renderReports();
}

function currentInvFilter() {
  return window._invKindFilter || 'all';
}
function setInvFilter(kind, btn) {
  window._invKindFilter = kind;
  document.querySelectorAll('.inv-filter-chip').forEach(function (c) { c.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderInventory();
}

function itemKindGroup(i) {
  if (i.kind === 'graded') return 'graded';
  if (i.kind === 'sealed' || i.kind === 'pack' || i.type === 'box' || i.type === 'sealed' || i.type === 'pack') return i.kind === 'pack' || i.type === 'pack' ? 'sealed' : 'sealed';
  return 'raw';
}

// Buylist ------------------------------------------------
let quoteLines = [];

function condRate(cond) {
  const s = loadSettings();
  const r = (s.conditionRates || {})[cond];
  return r != null ? r : (DEFAULT_COND_RATES[cond] || 1);
}
function lineOffers(line) {
  const s = loadSettings();
  const market = num(line.market);
  const qty = int(line.qty, 1);
  const cr = condRate(line.condition || 'NM');
  const nmCash = market * (s.cashRate || 0.6);
  const nmCredit = market * (s.creditRate || 0.8);
  return {
    cash: Math.round(nmCash * cr * qty * 100) / 100,
    credit: Math.round(nmCredit * cr * qty * 100) / 100
  };
}
function addQuoteLine() {
  quoteLines.push({
    name: ($('bl-name') && $('bl-name').value || '').trim(),
    qty: int($('bl-qty') && $('bl-qty').value, 1),
    market: num($('bl-market') && $('bl-market').value),
    condition: ($('bl-condition') && $('bl-condition').value) || 'NM',
    kind: ($('bl-kind') && $('bl-kind').value) || 'raw'
  });
  if ($('bl-name')) $('bl-name').value = '';
  if ($('bl-market')) $('bl-market').value = '';
  if ($('bl-qty')) $('bl-qty').value = '1';
  renderQuote();
  setTimeout(function () {
    const n = $('bl-name');
    if (n) try { n.focus(); } catch (e) {}
  }, 20);
}
function removeQuoteLine(i) {
  quoteLines.splice(i, 1);
  renderQuote();
}
function updateQuoteLine(i, field, val) {
  if (!quoteLines[i]) return;
  if (field === 'qty' || field === 'market') quoteLines[i][field] = num(val);
  else quoteLines[i][field] = val;
  renderQuote();
}
function renderQuote() {
  const box = $('quote-lines');
  if (!box) return;
  if (!quoteLines.length) {
    box.innerHTML = '<div class="text-muted" style="font-size:12px">Add cards to build a trade-in quote.</div>';
  } else {
    box.innerHTML = quoteLines.map(function (l, i) {
      const o = lineOffers(l);
      return '<div class="card" style="padding:10px">' +
        '<div class="flex-between"><strong>' + esc(l.name || 'Untitled') + '</strong>' +
        '<span class="del-btn" style="width:28px;height:28px" onclick="removeQuoteLine(' + i + ')">×</span></div>' +
        '<div style="font-size:11px;color:var(--muted);margin:4px 0">' + (l.kind || 'raw') + ' · ' + (l.condition || 'NM') + ' · qty ' + (l.qty || 1) + ' · NM mkt ' + fmt(l.market) + '</div>' +
        '<div class="flex-between" style="font-size:13px"><span class="text-green">Cash ' + fmt(o.cash) + '</span><span class="text-gold">Credit ' + fmt(o.credit) + '</span></div></div>';
    }).join('');
  }
  const cash = quoteLines.reduce(function (s, l) { return s + lineOffers(l).cash; }, 0);
  const credit = quoteLines.reduce(function (s, l) { return s + lineOffers(l).credit; }, 0);
  if ($('quote-cash')) $('quote-cash').textContent = fmt(cash);
  if ($('quote-credit')) $('quote-credit').textContent = fmt(credit);
  if ($('quote-count')) $('quote-count').textContent = quoteLines.length + ' item' + (quoteLines.length === 1 ? '' : 's');
}
function acceptQuote(payType) {
  if (!quoteLines.length) { toast('Add items to the quote first', 'err'); return; }
  const customer = (typeof normalizeCustName === 'function') ? normalizeCustName($('bl-customer') && $('bl-customer').value) : (($('bl-customer') && $('bl-customer').value) || '').trim();
  if (payType === 'credit' && !customer) { toast('Customer name required for store credit', 'err'); return; }
  const items = quoteLines.map(function (l) {
    const o = lineOffers(l);
    return Object.assign({}, l, o);
  });
  const cashTotal = items.reduce(function (s, l) { return s + l.cash; }, 0);
  const creditTotal = items.reduce(function (s, l) { return s + l.credit; }, 0);
  const paid = payType === 'credit' ? creditTotal : cashTotal;
  const costBasis = cashTotal;
  items.forEach(function (l) {
    DB.inventory.push({
      id: Date.now() + Math.floor(Math.random() * 999),
      sku: '',
      name: l.name,
      qty: int(l.qty, 1),
      cost: Math.round((l.cash / int(l.qty, 1)) * 100) / 100,
      set: '',
      condition: l.condition || 'NM',
      kind: l.kind || 'raw',
      source: 'buylist',
      notes: (payType === 'credit' ? 'Trade-in store credit' : (payType === 'p2p' ? 'Trade-in P2P cash' : 'Trade-in cash')) + (customer ? ' · ' + customer : ''),
      addedAt: d8(),
      type: 'single'
    });
  });
  DB.saveInventory();
  const rec = {
    id: Date.now(),
    date: d8(),
    customer, payType, items, cashTotal, creditTotal, paid, costBasis
  };
  const list = getBuylist();
  list.push(rec);
  saveBuylist(list);
  DB.sales.push({
    id: Date.now() + 1,
    sku: 'BUYLIST',
    name: 'Trade-in ' + (payType === 'credit' ? 'store credit' : (payType === 'p2p' ? 'P2P' : 'cash')) + (customer ? ' · ' + customer : ''),
    price: 0,
    cost: costBasis,
    qty: items.reduce(function (s, l) { return s + int(l.qty, 1); }, 0),
    location: 'Trade-in',
    date: d8(),
    profit: 0,
    kind: 'buylist',
    type: 'buylist',
    condition: 'NM',
    notes: payType === 'credit' ? ('Credit issued ' + creditTotal) : ((payType === 'p2p' ? 'P2P paid ' : 'Cash paid ') + cashTotal)
  });
  DB.saveSales();
  let creditBalance = null;
  if (payType === 'credit' && customer && creditTotal > 0) {
    try {
      const updated = creditCustomer(customer, creditTotal, 'Trade-in store credit', 'buylist:' + rec.id);
      creditBalance = updated.balance;
    } catch (e) {
      toast(e.message || 'Could not post store credit', 'err');
    }
  }
  quoteLines = [];
  if ($('bl-customer')) $('bl-customer').value = '';
  renderQuote();
  renderBuylist();
  renderInventory();
  renderReports();
  if (typeof refreshCustomerDatalist === 'function') refreshCustomerDatalist();
  if (typeof renderCustomers === 'function') renderCustomers();
  toast(payType === 'credit' ? ('Credit quote accepted · ' + fmt(creditTotal)) : (payType === 'p2p' ? ('P2P paid · ' + fmt(cashTotal)) : ('Cash quote accepted · ' + fmt(cashTotal))), 'ok');
  if (payType === 'credit' && customer && typeof offerCustomerQrAfterCredit === 'function') {
    try {
      var custObj = findCustomerByName(customer);
      if (custObj) setTimeout(function () { offerCustomerQrAfterCredit(custObj); }, 350);
    } catch (e) {}
  }
  if (typeof openPrintableReceipt === 'function') {
    openPrintableReceipt({
      title: payType === 'credit' ? 'Trade-in — store credit' : 'Trade-in — cash',
      date: d8(),
      location: 'Trade-in',
      customer: customer || 'Walk-in',
      lines: items.map(function (l) {
        return { name: l.name, sku: '', qty: int(l.qty, 1), price: payType === 'credit' ? l.credit / int(l.qty, 1) : l.cash / int(l.qty, 1) };
      }),
      subtotal: payType === 'credit' ? creditTotal : cashTotal,
      creditIssued: payType === 'credit' ? creditTotal : 0,
      cashPaid: payType === 'cash' ? cashTotal : 0,
      creditBalance: creditBalance,
      notes: payType === 'credit' ? ('Store credit issued ' + fmt(creditTotal)) : ('Cash paid ' + fmt(cashTotal))
    });
  }
}
function renderBuylist() {
  renderQuote();
  const box = $('buylist-history');
  if (!box) return;
  const list = getBuylist().slice().reverse().slice(0, 12);
  if (!list.length) {
    box.innerHTML = (typeof emptyStateHtml === 'function' ? emptyStateHtml('cash', 'No trade-ins yet', 'Build a quote, then Accept cash or Accept store credit (posts to the Credit ledger).', '') : '<div class="empty-state">No trade-ins yet</div>');
    return;
  }
  box.innerHTML = list.map(function (q) {
    return '<div class="card" style="padding:10px 14px">' +
      '<div class="flex-between"><span style="font-weight:700">' + esc(q.customer || 'Walk-in') + '</span>' +
      '<span class="badge ' + (q.payType === 'credit' ? 'badge-gold' : 'badge-green') + '">' + (q.payType === 'credit' ? 'CREDIT' : 'CASH') + '</span></div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:4px">' + esc(q.date) + ' · ' + (q.items || []).length + ' lines · cash ' + fmt(q.cashTotal) + ' · credit ' + fmt(q.creditTotal) + '</div></div>';
  }).join('');
}

function saveShopSettingsFromForm() {
  const s = loadSettings();
  s.shopName = ($('set-shop-name') && $('set-shop-name').value || '').trim();
  if ($('set-logo-url')) s.logoUrl = ($('set-logo-url').value || '').trim();
  if ($('set-meet-location')) s.meetLocation = ($('set-meet-location').value || '').trim();
  s.cashRate = int($('set-cash-rate') && $('set-cash-rate').value, 60) / 100;
  s.creditRate = int($('set-credit-rate') && $('set-credit-rate').value, 80) / 100;
  s.restockQty = int($('set-restock-qty') && $('set-restock-qty').value, 3);
  if ($('set-min-margin')) s.minMarginPct = int($('set-min-margin').value, 15);
  if ($('set-market-floor')) s.marketFloorPct = int($('set-market-floor').value, 85);
  if ($('set-floor-block')) s.floorBlock = !!$('set-floor-block').checked;

  s.deadStockDays = int($('set-dead-days') && $('set-dead-days').value, 60);
  s.compsEnabled = $('set-comps-enabled') ? !!$('set-comps-enabled').checked : true;
  s.ptcgApiKey = ($('set-ptcg-key') && $('set-ptcg-key').value || '').trim();
  s.conditionRates = s.conditionRates || {};
  ['NM', 'LP', 'MP', 'HP', 'DMG'].forEach(function (c) {
    const el = $('rate-' + c);
    if (el) s.conditionRates[c] = int(el.value, Math.round(DEFAULT_COND_RATES[c] * 100)) / 100;
  });
  /* Apply extras onto the SAME object. Do NOT call saveShopExtrasFromForm() then
     Object.assign(s, loadSettings()) — extras saves without profile fields, and
     assign then clobbers the new shopName with the stale value. */
  if ($('set-pay-link')) s.paymentLinkUrl = $('set-pay-link').value.trim();
  if ($('set-inquiry-email')) s.inquiryEmail = $('set-inquiry-email').value.trim();
  if ($('set-theme-dark')) s.theme = $('set-theme-dark').checked ? 'dark' : 'light';
  s.p2p = s.p2p || { cashapp: '', venmo: '', zelle: '', paypal: '' };
  if ($('set-p2p-cashapp')) s.p2p.cashapp = $('set-p2p-cashapp').value.trim();
  if ($('set-p2p-venmo')) s.p2p.venmo = $('set-p2p-venmo').value.trim();
  if ($('set-p2p-zelle')) s.p2p.zelle = $('set-p2p-zelle').value.trim();
  if ($('set-p2p-paypal')) s.p2p.paypal = $('set-p2p-paypal').value.trim();
  if (!Array.isArray(s.promos)) s.promos = [];
  saveSettings(s);
  if (typeof applyTheme === 'function') applyTheme();
  if (typeof renderPromoList === 'function') renderPromoList();
  applyShopChrome();
  renderQuote();
  ['sale-comps', 'bl-comps'].forEach(function (id) {
    const el = $(id);
    if (el) el.style.display = (s.compsEnabled === false) ? 'none' : '';
  });
  toast('Shop settings saved', 'ok');
}

function realSales(list) {
  return (list || DB.sales).filter(function (s) {
    return s && s.type !== 'box' && s.kind !== 'buylist' && s.type !== 'buylist';
  });
}

function renderReportsShopExtras() {
  const s = loadSettings();
  const daysSel = ($('r-top-range') && $('r-top-range').value) || '30';
  const days = daysSel === 'all' ? 0 : int(daysSel, 30);
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const sales = realSales().filter(function (x) {
    return !cutoff || (x.date && new Date(x.date).getTime() >= cutoff);
  });
  const cogs = sales.reduce(function (sum, x) { return sum + num(x.cost) * int(x.qty, 1); }, 0);
  const revenue = sales.reduce(function (sum, x) { return sum + num(x.price) * int(x.qty, 1); }, 0);
  const profit = sales.reduce(function (sum, x) { return sum + num(x.profit); }, 0);
  const soldQty = sales.reduce(function (sum, x) { return sum + int(x.qty, 1); }, 0);
  const periodDays = days || Math.max(1, (function () {
    const ds = sales.map(function (x) { return Date.parse(x.date); }).filter(Boolean);
    if (!ds.length) return 1;
    return Math.max(1, Math.round((Date.now() - Math.min.apply(null, ds)) / 86400000));
  })());
  const velocity = soldQty / (periodDays / 7);

  if ($('r-cogs')) $('r-cogs').textContent = fmt(cogs);
  if ($('r-gross')) $('r-gross').textContent = fmt(profit);
  if ($('r-velocity')) $('r-velocity').textContent = velocity.toFixed(1) + '/wk';

  const lastSaleByKey = {};
  realSales().forEach(function (x) {
    const key = (x.sku || '') + '|' + (x.name || '');
    const t = Date.parse(x.date);
    if (!t) return;
    if (!lastSaleByKey[key] || t > lastSaleByKey[key]) lastSaleByKey[key] = t;
  });
  const deadDays = s.deadStockDays || 60;
  const deadCut = Date.now() - deadDays * 86400000;
  const dead = DB.inventory.filter(function (i) {
    if (!int(i.qty, 0)) return false;
    const key = (i.sku || '') + '|' + (i.name || '');
    const last = lastSaleByKey[key];
    const added = Date.parse(i.addedAt || i.receivedDate || '') || 0;
    if (last) return last < deadCut;
    return !added || added < deadCut;
  });
  if ($('r-dead')) $('r-dead').textContent = String(dead.length);
  const deadBox = $('r-dead-list');
  if (deadBox) {
    deadBox.innerHTML = dead.length === 0
      ? '<div style="font-size:12px;color:var(--muted)">No dead stock in the last ' + deadDays + ' days.</div>'
      : dead.slice(0, 20).map(function (i) {
          const age = i.addedAt || '—';
          return '<div class="dead-row"><div><div style="font-weight:600">' + esc(i.name || i.sku) + '</div>' +
            '<div class="text-muted">' + kindLabel(i) + ' · ' + (i.condition || 'NM') + ' · added ' + esc(String(age)) + '</div></div>' +
            '<div class="td-num">' + i.qty + ' · ' + fmt((i.cost || 0) * i.qty) + '</div></div>';
        }).join('');
  }

  const velMap = {};
  sales.forEach(function (x) {
    const key = x.sku || x.name || 'item';
    if (!velMap[key]) velMap[key] = { name: x.name, sku: x.sku, qty: 0 };
    velMap[key].qty += int(x.qty, 1);
  });
  const velList = Object.values(velMap).map(function (v) {
    v.perWeek = v.qty / (periodDays / 7);
    return v;
  }).sort(function (a, b) { return b.perWeek - a.perWeek; }).slice(0, 10);
  const velBox = $('r-velocity-list');
  if (velBox) {
    velBox.innerHTML = velList.length === 0
      ? '<div style="font-size:12px;color:var(--muted)">No sales in this period.</div>'
      : velList.map(function (v) {
          return '<div class="vel-row"><div><div style="font-weight:600">' + esc(v.name || v.sku) + '</div>' +
            '<div class="text-muted">' + v.qty + ' sold</div></div><div class="text-gold">' + v.perWeek.toFixed(1) + ' / wk</div></div>';
        }).join('');
  }

  const restockN = s.restockQty || 3;
  const low = DB.inventory.filter(function (i) {
    if (int(i.qty, 0) >= restockN) return false;
    const key = i.sku || i.name;
    const moving = velMap[key] || velMap[i.name];
    return true;
  });
  const hotLow = low.filter(function (i) {
    const key = i.sku || i.name;
    return !!(velMap[key] || velMap[i.name]);
  });
  const restockBox = $('r-restock');
  if (restockBox) {
    if (!low.length) {
      restockBox.innerHTML = '<div style="font-size:12px;color:var(--muted)">Stock levels look healthy.</div>';
    } else {
      const show = (hotLow.length ? hotLow : low).slice(0, 16);
      restockBox.innerHTML = show.map(function (i) {
        const key = i.sku || i.name;
        const v = velMap[key] || velMap[i.name];
        const tag = v ? '<span class="badge badge-gold">selling</span>' : '<span class="badge badge-red">' + i.qty + ' left</span>';
        return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;gap:8px">' +
          '<span>' + esc(i.name || i.sku) + ' · ' + kindLabel(i) + '</span>' + tag + '</div>';
      }).join('');
    }
  }
}


// ============================================================
// CardTrack Shop — P1: customers ledger, barcode/SKU, receipts
// ============================================================
const CT_CUSTOMERS_KEY = 'ct_customers';
let _lastReceipt = null;
let _barcodeStream = null;
let _barcodeTimer = null;
let _barcodeTarget = null;
let _barcodeOnDone = null;
let _barcodeDetector = null;

function getCustomers() {
  try { return JSON.parse(localStorage.getItem(CT_CUSTOMERS_KEY) || '[]'); }
  catch (e) { return []; }
}
function saveCustomers(list) {
  localStorage.setItem(CT_CUSTOMERS_KEY, JSON.stringify(list || []));
}
function normalizeCustName(n) {
  return (n || '').trim().replace(/\s+/g, ' ');
}
function findCustomerByName(name) {
  const n = normalizeCustName(name).toLowerCase();
  if (!n) return null;
  return getCustomers().find(function (c) { return (c.name || '').toLowerCase() === n; }) || null;
}
function findOrCreateCustomer(name) {
  const clean = normalizeCustName(name);
  if (!clean) return null;
  const list = getCustomers();
  let c = list.find(function (x) { return (x.name || '').toLowerCase() === clean.toLowerCase(); });
  if (!c) {
    c = { id: Date.now() + Math.floor(Math.random() * 999), name: clean, balance: 0, history: [], createdAt: new Date().toISOString(), qrToken: ctMakeQrToken() };
    list.push(c);
    saveCustomers(list);
  } else if (!c.qrToken && typeof ensureCustomerQrToken === 'function') {
    ensureCustomerQrToken(c);
    saveCustomers(getCustomers());
  }
  return c;
}
function postCustomerLedger(name, amount, type, note, ref) {
  const clean = normalizeCustName(name);
  if (!clean) throw new Error('Customer name required');
  const amt = Math.round(num(amount) * 100) / 100;
  if (!amt) throw new Error('Amount required');
  const list = getCustomers();
  let c = list.find(function (x) { return (x.name || '').toLowerCase() === clean.toLowerCase(); });
  if (!c) {
    c = { id: Date.now() + Math.floor(Math.random() * 999), name: clean, balance: 0, history: [], createdAt: new Date().toISOString(), qrToken: (typeof ctMakeQrToken === 'function' ? ctMakeQrToken() : String(Date.now())) };
    list.push(c);
  } else if (!c.qrToken && typeof ensureCustomerQrToken === 'function') { ensureCustomerQrToken(c); }
  const signed = (type === 'debit' || type === 'sale' || type === 'redeem') ? -Math.abs(amt) : Math.abs(amt);
  c.balance = Math.round((num(c.balance) + signed) * 100) / 100;
  if (c.balance < -0.001) {
    // revert
    c.balance = Math.round((c.balance - signed) * 100) / 100;
    throw new Error('Insufficient store credit');
  }
  if (c.balance < 0) c.balance = 0;
  c.history = c.history || [];
  c.history.unshift({
    id: Date.now(),
    date: d8(),
    ts: new Date().toISOString(),
    type: type || (signed >= 0 ? 'credit' : 'debit'),
    amount: Math.abs(amt),
    signed: signed,
    balanceAfter: c.balance,
    note: note || '',
    ref: ref || ''
  });
  if (c.history.length > 200) c.history = c.history.slice(0, 200);
  saveCustomers(list);
  return c;
}
function creditCustomer(name, amount, note, ref) {
  return postCustomerLedger(name, amount, 'credit', note, ref);
}
function redeemCustomerCredit(name, amount, note, ref) {
  return postCustomerLedger(name, amount, 'redeem', note, ref);
}
function refreshCustomerDatalist() {
  const dl = $('cust-datalist');
  if (!dl) return;
  const list = getCustomers().slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
  dl.innerHTML = list.map(function (c) {
    return '<option value="' + esc(c.name) + '">' + fmt(c.balance) + ' credit</option>';
  }).join('');
}
function upsertCustomerCredit() {
  const name = normalizeCustName($('cust-name') && $('cust-name').value);
  const adj = num($('cust-adj') && $('cust-adj').value);
  const note = (($('cust-note') && $('cust-note').value) || '').trim() || 'Manual adjustment';
  if (!name) { toast('Enter a customer name', 'err'); return; }
  try {
    if (adj) {
      if (adj > 0) creditCustomer(name, adj, note, 'manual');
      else redeemCustomerCredit(name, Math.abs(adj), note, 'manual');
    } else {
      findOrCreateCustomer(name);
    }
    var list = getCustomers();
    var c2 = list.find(function (x) { return (x.name || '').toLowerCase() === name.toLowerCase(); });
    if (c2) {
      if ($('cust-email')) c2.email = $('cust-email').value.trim();
      if ($('cust-phone')) c2.phone = $('cust-phone').value.trim();
      if ($('cust-addr')) c2.address = $('cust-addr').value.trim();
      if ($('cust-city')) c2.city = $('cust-city').value.trim();
      if ($('cust-sz')) {
        var sz = $('cust-sz').value.trim();
        var parts = sz.split(/\s+/);
        if (parts.length >= 2) { c2.state = parts[0]; c2.zip = parts.slice(1).join(' '); }
        else if (sz.length <= 2) c2.state = sz;
        else c2.zip = sz;
      }
      saveCustomers(list);
    }
    if ($('cust-adj')) $('cust-adj').value = '';
    if ($('cust-note')) $('cust-note').value = '';
    renderCustomers();
    refreshCustomerDatalist();
    toast('Customer ledger updated', 'ok');
  } catch (e) {
    toast(e.message || 'Ledger error', 'err');
  }
}

/* ===== CT icon system (Lucide-style 24px, stroke 1.85, currentColor) ===== */
var CT_ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  meet: '<path d="M4 7h16v12H4z"/><path d="M8 7V5h8v2"/><circle cx="12" cy="13" r="2"/>',
  inventory: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.5 8.5L12 13l8.5-4.5"/><path d="M12 13v9"/>',
  stock: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.5 8.5L12 13l8.5-4.5"/><path d="M12 13v9"/>',
  trade: '<path d="M16 3l4 4-4 4"/><path d="M20 7H8a4 4 0 000 8h2"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h12a4 4 0 000-8h-2"/>',
  storefront: '<path d="M3 9l1.5-4.5h15L21 9"/><path d="M3 9h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"/><path d="M9 21v-6h6v6"/>',
  customers: '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
  insights: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 17V10"/><path d="M12 17V7"/><path d="M16 17v-4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  scan: '<path d="M4 8V6a2 2 0 012-2h2"/><path d="M16 4h2a2 2 0 012 2v2"/><path d="M20 16v2a2 2 0 01-2 2h-2"/><path d="M8 20H6a2 2 0 01-2-2v-2"/><path d="M7 12h10"/>',
  pay: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
  backup: '<path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 19h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  command: '<path d="M7 7h.01M17 7h.01M7 17h.01M17 17h.01"/><path d="M9 7a2 2 0 10-2 2h10a2 2 0 10-2-2"/><path d="M9 17a2 2 0 11-2-2h10a2 2 0 11-2 2"/>',
  theme: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  credit: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v6M14 20h3"/>',
  cart: '<path d="M6 6h15l-1.5 9H8L6 6z"/><path d="M6 6L5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>',
  promo: '<path d="M20.6 13.4A2 2 0 0020 12V6a2 2 0 00-2-2H6"/><path d="M4 8v10a2 2 0 002 2h10"/><path d="M8 12h.01M12 8h.01"/><path d="M8.5 15.5l7-7"/>',
  camera: '<path d="M4 8h3l2-2h6l2 2h3v11H4V8z"/><circle cx="12" cy="13" r="3.5"/>',
  watch: '<polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 10-13h-7l0-7z"/>',
  receipt: '<path d="M6 3h12v18l-2-1-2 1-2-1-2 1-2-1-2 1V3z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.5 8.5L12 13l8.5-4.5"/><path d="M12 13v9"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  tag: '<path d="M20.6 13.4L11 3H4v7l9.6 9.6a2 2 0 002.8 0l4.2-4.2a2 2 0 000-2.8z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
  palette: '<path d="M12 3a9 9 0 100 18h1.5a2.5 2.5 0 000-5H12"/><circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7.5" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="7.5" r="1" fill="currentColor" stroke="none"/><circle cx="16.5" cy="11" r="1" fill="currentColor" stroke="none"/>',
  upload: '<path d="M12 16V5"/><path d="M8 9l4-4 4 4"/><path d="M4 19h16"/>',
  download: '<path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 19h16"/>',
  zap: '<path d="M13 2L4 14h7l-1 8 10-13h-7z"/>',
  package: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.5 8.5L12 13l8.5-4.5"/><path d="M12 13v9"/>',
  shop: '<path d="M3 9l1.5-4.5h15L21 9"/><path d="M3 9h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"/><path d="M9 21v-6h6v6"/>',
  chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 17V10"/><path d="M12 17V7"/><path d="M16 17v-4"/>',
  user: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  refresh: '<path d="M21 12a9 9 0 11-2.6-6.2"/><path d="M21 3v6h-6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  gauge: '<path d="M12 15l3.5-3.5"/><path d="M5.5 17.5A8 8 0 1118.5 17.5"/><path d="M12 19v-1"/>'
};
function icon(name, cls) {
  var map = (typeof CT_ICONS !== 'undefined' && CT_ICONS) ? CT_ICONS : null;
  if (!map) return '';
  var body = map[name] || map.bolt || '';
  if (!body) return '';
  var c = 'ct-ico' + (cls ? ' ' + cls : '');
  return '<svg class="' + c + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>';
}
function iconBtnLabel(name, text) {
  return icon(name, 'sm') + ' ' + text;
}
window.icon = icon;
window.CT_ICONS = CT_ICONS;

/* Perf metrics + image URL cache */
var CT_PERF = { compsMs: 0, compsAt: 0, frames: [], lastFrame: 0, invRenderMs: 0 };
var _imgUrlCache = Object.create(null);
var _imgPrefetchSet = Object.create(null);
function ctCacheImageUrl(url) {
  if (!url) return url;
  if (_imgUrlCache[url]) return _imgUrlCache[url];
  _imgUrlCache[url] = url;
  return url;
}
function ctPrefetchImage(url) {
  if (!url || _imgPrefetchSet[url]) return;
  _imgPrefetchSet[url] = 1;
  try {
    var img = new Image();
    img.decoding = 'async';
    img.loading = 'lazy';
    img.src = ctCacheImageUrl(url);
  } catch (e) {}
}
function ctLocalStorageKB() {
  var total = 0;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      var v = localStorage.getItem(k) || '';
      total += (k.length + v.length) * 2;
    }
  } catch (e) {}
  return Math.round(total / 102.4) / 10;
}
function ctTickPerfFrame() {
  var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (CT_PERF.lastFrame) {
    var dt = now - CT_PERF.lastFrame;
    CT_PERF.frames.push(dt);
    if (CT_PERF.frames.length > 40) CT_PERF.frames.shift();
  }
  CT_PERF.lastFrame = now;
  if (document.visibilityState !== 'hidden') {
    requestAnimationFrame(ctTickPerfFrame);
  }
}
if (typeof requestAnimationFrame === 'function') {
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      CT_PERF.lastFrame = 0;
      requestAnimationFrame(ctTickPerfFrame);
    }
  });
  requestAnimationFrame(ctTickPerfFrame);
}
function refreshPerfHud() {
  var box = document.getElementById('perf-hud');
  if (!box) return;
  var inv = (typeof DB !== 'undefined' && DB.inventory) ? DB.inventory.length : 0;
  var sales = (typeof DB !== 'undefined' && DB.sales) ? DB.sales.length : 0;
  var avg = 0;
  if (CT_PERF.frames.length) {
    var sum = 0;
    for (var i = 0; i < CT_PERF.frames.length; i++) sum += CT_PERF.frames[i];
    avg = sum / CT_PERF.frames.length;
  }
  var fps = avg > 0 ? (1000 / avg) : 0;
  box.innerHTML =
    '<div class="row"><span>Inventory rows</span><b>' + inv + '</b></div>' +
    '<div class="row"><span>Sales rows</span><b>' + sales + '</b></div>' +
    '<div class="row"><span>localStorage</span><b>' + ctLocalStorageKB() + ' KB</b></div>' +
    '<div class="row"><span>Last comps latency</span><b>' + (CT_PERF.compsMs ? CT_PERF.compsMs + ' ms' : '—') + '</b></div>' +
    '<div class="row"><span>Inv render</span><b>' + (CT_PERF.invRenderMs ? CT_PERF.invRenderMs + ' ms' : '—') + '</b></div>' +
    '<div class="row"><span>Frame time (avg)</span><b>' + (avg ? avg.toFixed(1) + ' ms ~' + fps.toFixed(0) + ' fps' : '—') + '</b></div>' +
    '<div class="row"><span>Image URL cache</span><b>' + Object.keys(_imgUrlCache).length + ' / prefetch ' + Object.keys(_imgPrefetchSet).length + '</b></div>';
}

/* Bulk barcode / SKU queue → cart */
var _bulkSkuQueue = [];
var _bulkSkuRunning = false;
function processBulkSkuQueue() {
  var status = document.getElementById('bulk-sku-status');
  if (_bulkSkuRunning) return;
  if (!_bulkSkuQueue.length) {
    if (status) status.textContent = 'Done.';
    return;
  }
  _bulkSkuRunning = true;
  var sku = _bulkSkuQueue.shift();
  if (status) status.textContent = 'Processing ' + sku + '… (' + _bulkSkuQueue.length + ' left)';
  try {
    if (typeof lookupSkuForSale === 'function') {
      if ($('log-sku')) $('log-sku').value = sku;
      lookupSkuForSale();
    } else if (typeof DB !== 'undefined') {
      var idx = DB.inventory.findIndex(function (i) {
        return (i.sku || '').toUpperCase() === sku.toUpperCase() || (i.upc || '') === sku;
      });
      if (idx >= 0 && typeof addInventoryToCart === 'function') addInventoryToCart(idx);
      else if (typeof toast === 'function') toast('SKU not found: ' + sku, 'err');
    }
  } catch (e) {
    console.warn('bulk sku', e);
  }
  _bulkSkuRunning = false;
  setTimeout(processBulkSkuQueue, 180);
}
function runBulkSkuQueue() {
  var ta = document.getElementById('bulk-sku-input');
  if (!ta) return;
  var raw = (ta.value || '').split(/[\s,;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  if (!raw.length) { toast('Paste one or more SKUs', 'err'); return; }
  _bulkSkuQueue = raw.slice();
  var st = document.getElementById('bulk-sku-status');
  if (st) st.textContent = 'Queued ' + _bulkSkuQueue.length + '…';
  if (typeof switchTab === 'function') switchTab('log');
  processBulkSkuQueue();
}

/* Analytics CSV export (sales + edges) */
function exportAnalyticsCsv() {
  var sales = (typeof DB !== 'undefined' && DB.sales) ? DB.sales : [];
  var lines = ['date,sku,name,qty,price,cost,revenue,edge,edge_pct,customer,location,paid'];
  sales.forEach(function (s) {
    var qty = Number(s.qty) || 1;
    var price = Number(s.price) || 0;
    var cost = Number(s.cost) || 0;
    var rev = price * qty;
    var edge = (price - cost) * qty;
    var pct = price ? ((price - cost) / price * 100) : 0;
    var row = [
      s.date || s.ts || '',
      s.sku || '',
      '"' + String(s.name || '').replace(/"/g, '""') + '"',
      qty,
      price.toFixed(2),
      cost.toFixed(2),
      rev.toFixed(2),
      edge.toFixed(2),
      pct.toFixed(1),
      '"' + String(s.customer || '').replace(/"/g, '""') + '"',
      s.location || '',
      s.paid === false ? '0' : '1'
    ];
    lines.push(row.join(','));
  });
  var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cardtrack-analytics-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 2000);
  toast('Exported ' + sales.length + ' sales rows', 'ok');
}

/* Service worker lite — cache shell + card art hosts when possible */
function ctRegisterSwLite() {
  if (!('serviceWorker' in navigator)) return;
  try {
    var swCode = [
      "const C='ct-lite-v1';",
      "self.addEventListener('install',e=>{self.skipWaiting();});",
      "self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});",
      "self.addEventListener('fetch',e=>{const u=e.request.url;if(/images\\.pokemontcg\\.io|fonts\\.(gstatic|googleapis)/.test(u)){e.respondWith(caches.open(C).then(async c=>{const hit=await c.match(e.request);if(hit)return hit;try{const r=await fetch(e.request);if(r&&r.ok)c.put(e.request,r.clone());return r;}catch(err){return hit||Response.error();}}));}});",
    ].join('');
    var blob = new Blob([swCode], { type: 'text/javascript' });
    var url = URL.createObjectURL(blob);
    navigator.serviceWorker.register(url).catch(function () {});
  } catch (e) {}
}

function emptyStateHtml(iconName, title, hint, actionsHtml) {
  var icoHtml = iconName || '';
  if (icoHtml && String(icoHtml).indexOf('<') === -1 && typeof window.icon === 'function') {
    icoHtml = window.icon(icoHtml);
  } else if (!icoHtml && typeof window.icon === 'function') {
    icoHtml = window.icon('box');
  }
  return '<div class="empty-state"><div class="icon">' + icoHtml + '</div>' +
    (title ? '<div class="empty-title">' + title + '</div>' : '') +
    (hint ? '<div class="empty-hint">' + hint + '</div>' : '') +
    (actionsHtml ? '<div class="empty-actions">' + actionsHtml + '</div>' : '') +
    '</div>';
}
function renderCustomers() {
  const box = $('customers-list');
  if (!box) return;
  refreshCustomerDatalist();
  const q = (($('cust-search') && $('cust-search').value) || '').toLowerCase().trim();
  let list = getCustomers().slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
  if (q) list = list.filter(function (c) { return (c.name || '').toLowerCase().includes(q); });
  if (!list.length) {
    box.innerHTML = emptyStateHtml('users', 'No store-credit customers yet',
      'Accept a trade-in as store credit, or add a name above with an opening balance.',
      '<button class="btn btn-secondary" type="button" onclick="switchTab(\'buylist\')">Go to Trade-in</button>');
    return;
  }
  box.innerHTML = list.map(function (c) {
    const hist = (c.history || []).slice(0, 6).map(function (h) {
      const sign = h.signed >= 0 ? '+' : '−';
      return '<div>' + esc(h.date) + ' · ' + esc(h.type) + ' · ' + sign + fmt(h.amount) +
        (h.note ? ' · ' + esc(h.note) : '') + ' → ' + fmt(h.balanceAfter) + '</div>';
    }).join('') || '<div>No history yet</div>';
    return '<div class="card cust-row" style="display:block">' +
      '<div class="flex-between"><div><div style="font-weight:800">' + esc(c.name) + '</div>' +
      '<div style="font-size:11px;color:var(--muted)">id ' + esc(String(c.id)).slice(-6) + '</div></div>' +
      '<div class="bal" style="color:var(--gold);font-weight:800;font-size:20px">' + fmt(c.balance) + '</div></div>' +
      '<div class="cust-hist">' + hist + '</div>' +
      '<div class="btn-row mt8">' +
      '<button class="btn btn-secondary" type="button" onclick="useCustomerOnSale(\'' + String(c.id).replace(/'/g, '') + '\')">Use on Sale</button>' +
      '<button class="btn btn-secondary" type="button" onclick="promptAdjustCustomer(\'' + String(c.id).replace(/'/g, '') + '\')">Adjust</button>' +
      '</div></div>';
  }).join('');
}
function useCustomerOnSale(id) {
  const c = getCustomers().find(function (x) { return String(x.id) === String(id); });
  if (!c) return;
  switchTab('log');
  if ($('log-customer')) $('log-customer').value = c.name;
  onSaleCustomerInput();
  toast('Loaded ' + c.name, 'ok');
}
function promptAdjustCustomer(id) {
  const c = getCustomers().find(function (x) { return String(x.id) === String(id); });
  if (!c) return;
  const typed = prompt('Adjust credit for ' + c.name + ' (positive = add, negative = redeem). Balance ' + fmt(c.balance), '10');
  if (typed == null || typed === '') return;
  const adj = num(typed);
  if (!adj) { toast('Enter a non-zero amount', 'err'); return; }
  try {
    if (adj > 0) creditCustomer(c.name, adj, 'Manual adjust', 'manual');
    else redeemCustomerCredit(c.name, Math.abs(adj), 'Manual redeem', 'manual');
    renderCustomers();
    refreshCustomerDatalist();
    onSaleCustomerInput();
    toast('Updated ' + c.name, 'ok');
  } catch (e) { toast(e.message || 'Adjust failed', 'err'); }
}
function onSaleCustomerInput() {
  const box = $('sale-credit-box');
  const name = normalizeCustName($('log-customer') && $('log-customer').value);
  const c = name ? findCustomerByName(name) : null;
  if (!box) return;
  if (!c) {
    box.style.display = 'none';
    if ($('log-apply-credit')) $('log-apply-credit').checked = false;
    updateSaleCreditPreview();
    return;
  }
  box.style.display = 'block';
  if ($('sale-credit-bal')) $('sale-credit-bal').textContent = fmt(c.balance);
  updateSaleCreditPreview();
}
function updateSaleCreditPreview() {
  const price = num($('log-price') && $('log-price').value);
  const qty = int($('log-qty') && $('log-qty').value, 1);
  const total = price * qty;
  const apply = $('log-apply-credit') && $('log-apply-credit').checked;
  const name = normalizeCustName($('log-customer') && $('log-customer').value);
  const c = name ? findCustomerByName(name) : null;
  let creditAmt = num($('log-credit-amt') && $('log-credit-amt').value);
  if (apply && c) {
    const max = Math.min(c.balance, total);
    if (!creditAmt || creditAmt > max) {
      creditAmt = max;
      if ($('log-credit-amt')) $('log-credit-amt').value = creditAmt ? creditAmt.toFixed(2) : '0';
    }
  } else {
    creditAmt = 0;
    if ($('log-credit-amt') && !apply) $('log-credit-amt').value = '0';
  }
  const due = Math.max(0, Math.round((total - (apply ? creditAmt : 0)) * 100) / 100);
  if ($('sale-cash-due')) $('sale-cash-due').textContent = fmt(due);
}

function findInventoryBySku(sku) {
  const s = (sku || '').trim().toUpperCase();
  if (!s) return null;
  return DB.inventory.find(function (i) {
    return i && i.qty > 0 && ((i.sku || '').toUpperCase() === s);
  }) || null;
}
function lookupSkuForSale() {
  const sku = (($('log-sku') && $('log-sku').value) || '').trim().toUpperCase();
  if (!sku) { toast('Enter or scan a SKU', 'err'); return; }
  if ($('log-sku')) $('log-sku').value = sku;
  const item = findInventoryBySku(sku);
  if (!item) {
    // also try soft match
    const soft = DB.inventory.find(function (i) {
      return i && i.qty > 0 && (i.sku || '').toUpperCase().includes(sku);
    });
    if (!soft) { toast('No stock for SKU ' + sku, 'err'); return; }
    fillFromInventory(DB.inventory.indexOf(soft));
    onSaleCustomerInput();
    return;
  }
  fillFromInventory(DB.inventory.indexOf(item));
  onSaleCustomerInput();
}
function lookupSkuShowFloor() {
  const sku = (($('fast-sale-q') && $('fast-sale-q').value) || '').trim().toUpperCase();
  if (!sku) { renderFastSale(); return; }
  const exact = findInventoryBySku(sku);
  if (exact) {
    if ($('fast-sale-q')) $('fast-sale-q').value = sku;
    renderFastSale();
    fastSell(DB.inventory.indexOf(exact));
    return;
  }
  renderFastSale();
  toast('No exact SKU match — showing search', 'err');
}

async function scanBarcodeTo(inputId, onDone) {
  _barcodeTarget = inputId;
  _barcodeOnDone = typeof onDone === 'function' ? onDone : null;
  const hasDetector = (typeof window.BarcodeDetector !== 'undefined');
  if (!hasDetector || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    barcodeManualFallback();
    return;
  }
  try {
    _barcodeDetector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'itf'] });
  } catch (e) {
    barcodeManualFallback();
    return;
  }
  const overlay = $('barcode-overlay');
  const video = $('barcode-video');
  const msg = $('barcode-msg');
  if (msg) msg.textContent = 'Point at a barcode / UPC… (BarcodeDetector)';
  if (overlay) { overlay.classList.add('show'); overlay.setAttribute('aria-hidden', 'false'); }
  try {
    _barcodeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (video) {
      video.srcObject = _barcodeStream;
      await video.play();
    }
    const tick = async function () {
      if (!_barcodeDetector || !video || video.readyState < 2) return;
      try {
        const codes = await _barcodeDetector.detect(video);
        if (codes && codes.length) {
          const raw = (codes[0].rawValue || '').trim();
          if (raw) {
            applyBarcodeValue(raw);
            return;
          }
        }
      } catch (err) { /* keep scanning */ }
    };
    _barcodeTimer = setInterval(tick, 350);
  } catch (err) {
    stopBarcodeScan();
    barcodeManualFallback();
  }
}
function applyBarcodeValue(raw) {
  const val = String(raw || '').trim().toUpperCase();
  stopBarcodeScan();
  if (!val) return;
  const el = _barcodeTarget && $(_barcodeTarget);
  if (el) {
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  toast('SKU ' + val, 'ok');
  const cb = _barcodeOnDone;
  _barcodeOnDone = null;
  if (cb) setTimeout(cb, 30);
}
function barcodeManualFallback() {
  stopBarcodeScan(false);
  const typed = prompt('Enter SKU / UPC (camera barcode not available)', (($(_barcodeTarget) && $(_barcodeTarget).value) || ''));
  if (typed == null) return;
  applyBarcodeValue(typed);
}
function stopBarcodeScan(clearCb) {
  if (_barcodeTimer) { clearInterval(_barcodeTimer); _barcodeTimer = null; }
  if (_barcodeStream) {
    try { _barcodeStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    _barcodeStream = null;
  }
  const video = $('barcode-video');
  if (video) video.srcObject = null;
  const overlay = $('barcode-overlay');
  if (overlay) { overlay.classList.remove('show'); overlay.setAttribute('aria-hidden', 'true'); }
  _barcodeDetector = null;
  if (clearCb !== false) { /* keep onDone for manual */ }
}

function buildReceiptHtml(rec) {
  if (!rec) return '';
  const shop = (loadSettings().shopName || 'CardTrack Shop');
  const lines = (rec.lines || []).map(function (l) {
    return '<tr><td>' + esc(l.name || l.sku || 'Item') +
      (l.sku ? '<br><span style="font-size:11px;color:#555">' + esc(l.sku) + '</span>' : '') +
      '</td><td style="text-align:right">' + (l.qty || 1) + '</td><td style="text-align:right">' + fmt(l.price) + '</td><td style="text-align:right">' + fmt((l.price || 0) * (l.qty || 1)) + '</td></tr>';
  }).join('');
  return '<div style="max-width:420px;margin:0 auto">' +
    '<div style="text-align:center;font-weight:800;font-size:18px;margin-bottom:4px">' + esc(shop) + '</div>' +
    '<div style="text-align:center;font-size:12px;margin-bottom:14px">' + esc(rec.title || 'Receipt') + '<br>' + esc(rec.date || d8()) +
    (rec.location ? ' · ' + esc(rec.location) : '') + '</div>' +
    (rec.customer ? '<div style="margin-bottom:8px">Customer: <strong>' + esc(rec.customer) + '</strong></div>' : '') +
    '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
    '<thead><tr><th style="text-align:left;border-bottom:1px solid #ccc;padding:4px 0">Item</th><th style="text-align:right;border-bottom:1px solid #ccc">Qty</th><th style="text-align:right;border-bottom:1px solid #ccc">Price</th><th style="text-align:right;border-bottom:1px solid #ccc">Total</th></tr></thead>' +
    '<tbody>' + lines + '</tbody></table>' +
    '<div style="margin-top:12px;font-size:13px;border-top:1px dashed #999;padding-top:10px">' +
    (rec.subtotal != null ? '<div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>' + fmt(rec.subtotal) + '</span></div>' : '') +
    (rec.creditApplied ? '<div style="display:flex;justify-content:space-between"><span>Store credit</span><span>−' + fmt(rec.creditApplied) + '</span></div>' : '') +
    (rec.creditIssued ? '<div style="display:flex;justify-content:space-between"><span>Store credit issued</span><span>' + fmt(rec.creditIssued) + '</span></div>' : '') +
    (rec.cashPaid != null ? '<div style="display:flex;justify-content:space-between;font-weight:800;font-size:15px;margin-top:6px"><span>Cash due / paid</span><span>' + fmt(rec.cashPaid) + '</span></div>' : '') +
    (rec.creditBalance != null ? '<div style="display:flex;justify-content:space-between;margin-top:6px"><span>Credit balance</span><span>' + fmt(rec.creditBalance) + '</span></div>' : '') +
    (rec.notes ? '<div style="margin-top:10px;font-size:12px;color:#444">' + esc(rec.notes) + '</div>' : '') +
    '<div style="text-align:center;margin-top:18px;font-size:11px;color:#666">Thank you — powered by CardTrack Shop</div>' +
    '</div></div>';
}
function openPrintableReceipt(rec) {
  _lastReceipt = rec;
  const root = $('receipt-print-root');
  if (!root) return;
  root.innerHTML = buildReceiptHtml(rec);
  setTimeout(function () { window.print(); }, 80);
}
function printLastReceipt() {
  if (!_lastReceipt) { toast('No receipt yet — log a sale or accept a trade-in', 'err'); return; }
  openPrintableReceipt(_lastReceipt);
}



// ============================================================
// Market comps (P2) — Pokémon TCG API + localStorage cache
// ============================================================
const CT_COMPS_KEY = 'ct_comps';
const _compTimers = { sale: null, buylist: null };
const _compState = { sale: null, buylist: null };

function loadCompsStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(CT_COMPS_KEY) || '{}');
    if (!raw || typeof raw !== 'object') return { entries: {}, guide: {} };
    if (raw.entries || raw.guide) {
      return {
        entries: (raw.entries && typeof raw.entries === 'object') ? raw.entries : {},
        guide: (raw.guide && typeof raw.guide === 'object') ? raw.guide : {}
      };
    }
    // legacy flat map → treat as entries
    return { entries: raw, guide: {} };
  } catch (e) {
    return { entries: {}, guide: {} };
  }
}
function saveCompsStore(store) {
  try {
    localStorage.setItem(CT_COMPS_KEY, JSON.stringify(store || { entries: {}, guide: {} }));
  } catch (e) {
    console.warn('comps cache save failed', e);
  }
}
function normalizeCompKey(name, set) {
  const n = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const s = String(set || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return n + (s ? '|' + s : '');
}
function nameOnlyKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function updateCompsCacheStats() {
  const el = $('comps-cache-stats');
  if (!el) return;
  const store = loadCompsStore();
  const n = Object.keys(store.entries || {}).length;
  const g = Object.keys(store.guide || {}).length;
  let newest = 0;
  Object.keys(store.entries || {}).forEach(function (k) {
    const t = Date.parse((store.entries[k] && store.entries[k].updatedAt) || 0);
    if (t > newest) newest = t;
  });
  el.textContent = 'Cache: ' + n + ' live entries · ' + g + ' guide rows' +
    (newest ? ' · newest ' + new Date(newest).toLocaleString() : '');
}
function toggleCompsEnabled(on) {
  const s = loadSettings();
  s.compsEnabled = !!on;
  saveSettings(s);
  const show = !!on;
  ['sale-comps', 'bl-comps'].forEach(function (id) {
    const el = $(id);
    if (el) el.style.display = show ? '' : 'none';
  });
  toast(on ? 'Comps enabled at counter' : 'Comps hidden', 'ok');
}
function clearCompsCache() {
  if (!confirm('Clear live comps cache? Imported price-guide rows stay unless you clear shop data.')) return;
  const store = loadCompsStore();
  store.entries = {};
  saveCompsStore(store);
  updateCompsCacheStats();
  toast('Comps cache cleared', 'ok');
  refreshCompsPanel('sale', false);
  refreshCompsPanel('buylist', false);
}
function ptcgHeaders() {
  const h = { 'Accept': 'application/json' };
  try {
    const key = (loadSettings().ptcgApiKey || '').trim();
    if (key) h['X-Api-Key'] = key;
  } catch (e) {}
  return h;
}
async function ptcgFetch(url) {
  return fetch(url, { headers: ptcgHeaders() });
}
function pickTcgVariant(prices) {
  if (!prices || typeof prices !== 'object') return null;
  const prefer = ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', 'unlimitedHolofoil'];
  for (let i = 0; i < prefer.length; i++) {
    const p = prices[prefer[i]];
    if (p && (p.market != null || p.mid != null || p.low != null || p.high != null)) {
      return { variant: prefer[i], low: p.low != null ? +p.low : null, mid: p.mid != null ? +p.mid : null, high: p.high != null ? +p.high : null, market: p.market != null ? +p.market : null };
    }
  }
  const keys = Object.keys(prices);
  for (let i = 0; i < keys.length; i++) {
    const p = prices[keys[i]];
    if (p && typeof p === 'object') {
      return { variant: keys[i], low: p.low != null ? +p.low : null, mid: p.mid != null ? +p.mid : null, high: p.high != null ? +p.high : null, market: p.market != null ? +p.market : null };
    }
  }
  return null;
}
function fmtCompMoney(n) {
  if (n == null || isNaN(n)) return '—';
  return '$' + (+n).toFixed(2);
}
function setCompsBadge(ctx, kind, label) {
  const el = $(ctx === 'buylist' ? 'bl-comps-badge' : 'sale-comps-badge');
  if (!el) return;
  el.className = 'comps-badge ' + (kind || 'off');
  el.textContent = label || '—';
}

function updateCompsStrip(ctx, comp) {
  if (ctx !== 'sale') return;
  var strip = $('sale-comps-strip');
  var edgeEl = $('sale-comps-edge');
  var bar = $('sale-comps-bar');
  var vals = $('sale-comps-strip-vals');
  if (!strip) return;
  if (!comp || (comp.market == null && comp.mid == null && comp.low == null)) {
    strip.classList.remove('show');
    return;
  }
  strip.classList.add('show');
  var low = num(comp.low), mid = num(comp.mid), mkt = num(comp.market);
  // Prefer real values; fall back
  if (!low && mid) low = mid * 0.85;
  if (!mid && mkt) mid = mkt;
  if (!mkt && mid) mkt = mid;
  var max = Math.max(low, mid, mkt, 0.01);
  if (bar) {
    bar.innerHTML =
      '<span class="seg-low" style="flex:' + Math.max(0.08, low / max) + '"></span>' +
      '<span class="seg-mid" style="flex:' + Math.max(0.08, mid / max) + '"></span>' +
      '<span class="seg-mkt" style="flex:' + Math.max(0.08, mkt / max) + '"></span>';
  }
  if (vals) {
    vals.innerHTML =
      '<span class="cs-val"><b>L</b>' + fmtCompMoney(comp.low) + '</span>' +
      '<span class="cs-val"><b>M</b>' + fmtCompMoney(comp.mid) + '</span>' +
      '<span class="cs-val"><b>Mkt</b>' + fmtCompMoney(comp.market) + '</span>';
  }
  var cost = num($('log-cost') && $('log-cost').value);
  if (edgeEl) {
    if (cost > 0 && mkt > 0) {
      var pct = ((mkt - cost) / cost) * 100;
      edgeEl.className = 'cs-edge' + (pct < 0 ? ' neg' : '');
      edgeEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(0) + '% edge';
    } else {
      edgeEl.className = 'cs-edge na';
      edgeEl.textContent = 'set cost';
    }
  }
}

function renderCompsUI(ctx, comp, statusKind, statusLabel, metaExtra) {
  const pricesEl = $(ctx === 'buylist' ? 'bl-comps-prices' : 'sale-comps-prices');
  const metaEl = $(ctx === 'buylist' ? 'bl-comps-meta' : 'sale-comps-meta');
  const actionsEl = $(ctx === 'buylist' ? 'bl-comps-actions' : 'sale-comps-actions');
  setCompsBadge(ctx, statusKind, statusLabel);
  _compState[ctx] = comp || null;
  if (!comp) {
    if (pricesEl) pricesEl.style.display = 'none';
    if (actionsEl) actionsEl.style.display = 'none';
    if (metaEl) metaEl.textContent = metaExtra || 'No comps yet';
    try { updateCompsStrip(ctx, null); } catch (e) {}
    return;
  }
  if (pricesEl) {
    pricesEl.style.display = 'flex';
    var sellS = (typeof suggestedSell === 'function') ? suggestedSell(comp.market != null ? comp.market : comp.mid, num($('log-cost') && $('log-cost').value)) : null;
    var buyS = (typeof suggestedBuy === 'function') ? suggestedBuy(comp.market != null ? comp.market : comp.mid) : null;
    pricesEl.innerHTML =
      '<div class="cp"><div class="lbl">Market</div><div class="val gold">' + fmtCompMoney(comp.market) + '</div></div>' +
      '<div class="cp"><div class="lbl">Low</div><div class="val">' + fmtCompMoney(comp.low) + '</div></div>' +
      '<div class="cp"><div class="lbl">Mid</div><div class="val">' + fmtCompMoney(comp.mid) + '</div></div>' +
      '<div class="cp"><div class="lbl">High</div><div class="val">' + fmtCompMoney(comp.high) + '</div></div>' +
      (sellS ? '<div class="cp"><div class="lbl">Sell</div><div class="val">' + fmt(sellS) + '</div></div>' : '') +
      (buyS ? '<div class="cp"><div class="lbl">Buy cash</div><div class="val">' + fmt(buyS) + '</div></div>' : '');
  }
  if (actionsEl) actionsEl.style.display = 'flex';
  const when = comp.updatedAt ? new Date(comp.updatedAt).toLocaleString() : '—';
  const setBit = comp.set ? (' · ' + comp.set) : '';
  const varBit = comp.variant ? (' · ' + comp.variant) : '';
  if (metaEl) {
    metaEl.textContent = (comp.name || '') + setBit + varBit + ' · updated ' + when + (metaExtra ? ' · ' + metaExtra : '');
  }
  try { updateCompsStrip(ctx, comp); } catch (e) {}
}
function getCtxName(ctx) {
  if (ctx === 'buylist') return (($('bl-name') && $('bl-name').value) || '').trim();
  return (($('log-name') && $('log-name').value) || '').trim();
}
function onCompNameInput(ctx) {
  if (_compTimers[ctx]) clearTimeout(_compTimers[ctx]);
  _compTimers[ctx] = setTimeout(function () { refreshCompsPanel(ctx, false); }, 700);
}
function lookupCachedComp(name) {
  const store = loadCompsStore();
  const nk = nameOnlyKey(name);
  if (!nk) return null;
  // exact name|set keys first that start with name
  let best = null;
  Object.keys(store.entries || {}).forEach(function (k) {
    const e = store.entries[k];
    if (!e) return;
    if (nameOnlyKey(e.name) === nk || k === nk || k.indexOf(nk + '|') === 0) {
      if (!best || Date.parse(e.updatedAt || 0) > Date.parse(best.updatedAt || 0)) best = e;
    }
  });
  if (best) return Object.assign({ source: best.source || 'cache' }, best);
  const g = store.guide[nk] || store.guide[normalizeCompKey(name, '')];
  if (g) return Object.assign({ source: 'import', name: name, updatedAt: g.updatedAt || null }, g);
  // fuzzy: guide key contains
  const gKeys = Object.keys(store.guide || {});
  for (let i = 0; i < gKeys.length; i++) {
    if (gKeys[i].indexOf(nk) !== -1 || nk.indexOf(gKeys[i]) !== -1) {
      const row = store.guide[gKeys[i]];
      return Object.assign({ source: 'import', name: name, updatedAt: row.updatedAt || null }, row);
    }
  }
  return null;
}
function cacheCompEntry(comp) {
  if (!comp || !comp.name) return;
  const store = loadCompsStore();
  const key = normalizeCompKey(comp.name, comp.set);
  store.entries[key] = {
    name: comp.name,
    set: comp.set || '',
    number: comp.number || '',
    low: comp.low,
    mid: comp.mid,
    high: comp.high,
    market: comp.market,
    variant: comp.variant || '',
    cardId: comp.cardId || '',
    image: comp.image || '',
    imageLarge: comp.imageLarge || '',
    source: 'api',
    updatedAt: comp.updatedAt || new Date().toISOString()
  };
  saveCompsStore(store);
  updateCompsCacheStats();
}

// --- Card art (images.pokemontcg.io) ---
var _cardArtCache = Object.create(null);
function cardImageUrl(item, size) {
  if (!item) return '';
  if (size === 'large') {
    return item.imageLarge || item.image || '';
  }
  return item.image || item.imageLarge || '';
}
function cardArtHtml(url, sizeClass, foil) {
  if (url && typeof ctCacheImageUrl === 'function') url = ctCacheImageUrl(url);
  var cls = 'card-art ' + (sizeClass || 'card-art-sm') + (foil ? ' foil' : '');
  if (!url) {
    return '<div class="' + cls + ' broken" aria-hidden="true"><div class="card-art-ph">'+(typeof icon==='function'?icon('image','sm'):'')+'</div></div>';
  }
  var safe = String(url).replace(/"/g, '&quot;');
  return '<div class="' + cls + '" aria-hidden="true">' +
    '<div class="card-art-ph">'+(typeof icon==='function'?icon('image','sm'):'')+'</div>' +
    '<img loading="lazy" decoding="async" alt="" src="' + safe + '" ' +
    'onload="this.classList.add(\'loaded\');var p=this.previousElementSibling;if(p)p.style.display=\'none\';" ' +
    'onerror="var w=this.parentNode;if(w){w.classList.add(\'broken\');}this.remove();">' +
    '</div>';
}
function mountCardArt(el, url, sizeClass, foil) {
  if (!el) return;
  el.className = 'card-art ' + (sizeClass || 'card-art-md') + (foil ? ' foil' : '');
  el.classList.remove('broken');
  if (!url) {
    el.classList.add('broken');
    el.innerHTML = '<div class="card-art-ph">'+(typeof icon==='function'?icon('image','sm'):'')+'</div>';
    return;
  }
  el.innerHTML = '<div class="card-art-ph">'+(typeof icon==='function'?icon('image','sm'):'')+'</div><img loading="lazy" decoding="async" alt="" src="' +
    String(url).replace(/"/g, '&quot;') +
    '" onload="this.classList.add(\'loaded\');var p=this.previousElementSibling;if(p)p.style.display=\'none\';" ' +
    'onerror="var w=this.parentNode;if(w){w.classList.add(\'broken\');}this.remove();">';
}
function updateMeetCardPreview(item) {
  var box = $('meet-card-preview');
  if (!box) return;
  if (!item || !(item.image || item.imageLarge || item.name)) {
    box.classList.remove('show');
    return;
  }
  box.classList.add('show');
  mountCardArt($('meet-card-art'), cardImageUrl(item, 'large') || cardImageUrl(item, 'small'), 'card-art-lg', true);
  if ($('meet-card-name')) $('meet-card-name').textContent = item.name || item.sku || 'Card';
  var bits = [];
  if (item.set) bits.push(item.set);
  if (item.number) bits.push('#' + item.number);
  if (item.condition) bits.push(item.condition);
  if (item.kind === 'graded' && item.gradeCompany) bits.push(item.gradeCompany + ' ' + (item.gradeValue || ''));
  if ($('meet-card-sub')) $('meet-card-sub').textContent = bits.length ? bits.join(' · ') : 'Pokémon TCG art';
}
function persistItemImage(item, meta) {
  if (!item || !meta) return false;
  var changed = false;
  if (meta.image && item.image !== meta.image) { item.image = meta.image; changed = true; }
  if (meta.imageLarge && item.imageLarge !== meta.imageLarge) { item.imageLarge = meta.imageLarge; changed = true; }
  if (meta.tcgId && item.tcgId !== meta.tcgId) { item.tcgId = meta.tcgId; changed = true; }
  if (meta.cardId && !item.tcgId) { item.tcgId = meta.cardId; changed = true; }
  if (meta.number && item.number !== meta.number) { item.number = meta.number; changed = true; }
  if (meta.set && !item.set) { item.set = meta.set; changed = true; }
  return changed;
}
function attachImageFromComp(ctx, comp) {
  if (!comp) return;
  var meta = {
    image: comp.image || '',
    imageLarge: comp.imageLarge || '',
    tcgId: comp.cardId || comp.tcgId || '',
    number: comp.number || '',
    set: comp.set || ''
  };
  if (!meta.image && !meta.imageLarge && comp.cardId) {
    // Derive CDN URL from tcg id like sv3-223 → images.pokemontcg.io/sv3/223.png
    var parts = String(comp.cardId).split('-');
    if (parts.length >= 2) {
      var setId = parts[0];
      var num = parts.slice(1).join('-');
      meta.image = 'https://images.pokemontcg.io/' + setId + '/' + num + '.png';
      meta.imageLarge = 'https://images.pokemontcg.io/' + setId + '/' + num + '_hires.png';
    }
  }
  if (ctx === 'sale') {
    if (CART_SEL >= 0 && CART[CART_SEL]) {
      persistItemImage(CART[CART_SEL], meta);
      if (CART[CART_SEL].invIdx != null && DB.inventory[CART[CART_SEL].invIdx]) {
        if (persistItemImage(DB.inventory[CART[CART_SEL].invIdx], meta)) {
          try { DB.saveInventory(); } catch (e) {}
        }
      }
      updateMeetCardPreview(CART[CART_SEL]);
      renderCart();
    } else {
      updateMeetCardPreview({ name: getCtxName('sale') || comp.name, set: meta.set, number: meta.number, image: meta.image, imageLarge: meta.imageLarge });
    }
  }
  // Comps panel art
  var artId = ctx === 'buylist' ? 'bl-comps-art' : 'sale-comps-art';
  var rowId = ctx === 'buylist' ? 'bl-comps-art-row' : 'sale-comps-art-row';
  var row = $(rowId);
  var url = meta.image || meta.imageLarge;
  if (row) row.style.display = url ? 'flex' : 'none';
  mountCardArt($(artId), url, 'card-art-md', true);
}
async function lookupCardArt(name, setName, number) {
  var q = (name || '').trim();
  if (!q) return null;
  var cacheKey = (nameOnlyKey(q) || q.toLowerCase()) + '|' + (setName || '') + '|' + (number || '');
  if (_cardArtCache[cacheKey]) return _cardArtCache[cacheKey];
  var clauses = ['name:"' + q.replace(/"/g, '') + '"'];
  if (setName) clauses.push('set.name:"' + String(setName).replace(/"/g, '') + '"');
  if (number) clauses.push('number:' + String(number).replace(/[^\w]/g, ''));
  var url = PTCG_API + '/cards?q=' + encodeURIComponent(clauses.join(' ')) + '&pageSize=6&select=id,name,number,set,images';
  try {
    var res = await ptcgFetch(url);
    if (!res.ok) throw new Error('API ' + res.status);
    var data = await res.json();
    var cards = data.data || [];
    if (!cards.length && setName) {
      // fallback name-only
      url = PTCG_API + '/cards?q=name:*' + encodeURIComponent(q) + '*&pageSize=8&select=id,name,number,set,images';
      res = await ptcgFetch(url);
      if (res.ok) {
        data = await res.json();
        cards = data.data || [];
      }
    }
    if (!cards.length) return null;
    var qn = nameOnlyKey(q);
    cards.sort(function (a, b) {
      var an = nameOnlyKey(a.name) === qn ? 0 : 1;
      var bn = nameOnlyKey(b.name) === qn ? 0 : 1;
      if (an !== bn) return an - bn;
      if (setName) {
        var as = ((a.set && a.set.name) || '').toLowerCase() === String(setName).toLowerCase() ? 0 : 1;
        var bs = ((b.set && b.set.name) || '').toLowerCase() === String(setName).toLowerCase() ? 0 : 1;
        if (as !== bs) return as - bs;
      }
      return 0;
    });
    var card = cards[0];
    var meta = {
      tcgId: card.id,
      cardId: card.id,
      name: card.name,
      set: (card.set && card.set.name) || '',
      number: card.number || '',
      image: (card.images && card.images.small) || '',
      imageLarge: (card.images && card.images.large) || ''
    };
    _cardArtCache[cacheKey] = meta;
    return meta;
  } catch (e) {
    console.warn('card art lookup', e);
    return null;
  }
}
async function ensureItemCardArt(item, save) {
  if (!item || !item.name) return item;
  if (item.image || item.imageLarge) return item;
  if (item.kind === 'sealed' && !item.tcgId) return item;
  try {
    var meta = await lookupCardArt(item.name, item.set, item.number);
    if (meta && persistItemImage(item, meta) && save) {
      try { DB.saveInventory(); } catch (e) {}
    }
  } catch (e) {}
  return item;
}

async function fetchLiveComp(name) {
  const q = name.trim();
  if (!q) return null;
  // Loose contains search (no browser scrape — official Pokémon TCG API only)
  const url2 = PTCG_API + '/cards?q=name:*' + encodeURIComponent(q) + '*&pageSize=8&select=id,name,set,tcgplayer,number,rarity,images';
  let res = await ptcgFetch(url2);
  if (!res.ok) throw new Error('API ' + res.status);
  let data = await res.json();
  let cards = data.data || [];
  if (!cards.length) return null;
  // Prefer card with tcgplayer prices and closest name match
  const qn = nameOnlyKey(q);
  cards.sort(function (a, b) {
    const an = nameOnlyKey(a.name) === qn ? 0 : 1;
    const bn = nameOnlyKey(b.name) === qn ? 0 : 1;
    if (an !== bn) return an - bn;
    const ap = a.tcgplayer && a.tcgplayer.prices ? 0 : 1;
    const bp = b.tcgplayer && b.tcgplayer.prices ? 0 : 1;
    return ap - bp;
  });
  const card = cards[0];
  const picked = pickTcgVariant(card.tcgplayer && card.tcgplayer.prices);
  if (!picked) {
    return {
      name: card.name,
      set: (card.set && card.set.name) || '',
      number: card.number || '',
      low: null, mid: null, high: null, market: null,
      variant: '',
      cardId: card.id,
      image: (card.images && card.images.small) || '',
      imageLarge: (card.images && card.images.large) || '',
      source: 'api',
      updatedAt: new Date().toISOString()
    };
  }
  return {
    name: card.name,
    set: (card.set && card.set.name) || '',
    number: card.number || '',
    low: picked.low,
    mid: picked.mid,
    high: picked.high,
    market: picked.market != null ? picked.market : (picked.mid != null ? picked.mid : picked.low),
    variant: picked.variant,
    cardId: card.id,
    image: (card.images && card.images.small) || '',
    imageLarge: (card.images && card.images.large) || '',
    source: 'api',
    updatedAt: new Date().toISOString()
  };
}

var _compsAbort = { sale: null, buylist: null };
var _origFetchLiveComp = null;
(function patchCompsAbort(){
  function wrap(){
    if (typeof fetchLiveComp !== 'function' || fetchLiveComp._abortPatched) return;
    _origFetchLiveComp = fetchLiveComp;
    fetchLiveComp = async function(name) {
      var ctx = (window._compsActiveCtx) || 'sale';
      try { if (_compsAbort[ctx]) _compsAbort[ctx].abort(); } catch (e) {}
      var ac = new AbortController();
      _compsAbort[ctx] = ac;
      var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      try {
        // ptcgFetch may not take signal — race with abort
        var result = await Promise.race([
          _origFetchLiveComp(name),
          new Promise(function(_, rej){ ac.signal.addEventListener('abort', function(){ rej(Object.assign(new Error('aborted'), {name:'AbortError'})); }); })
        ]);
        if (typeof CT_PERF !== 'undefined') {
          CT_PERF.compsMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0);
          CT_PERF.compsAt = Date.now();
        }
        if (typeof refreshPerfHud === 'function') try { refreshPerfHud(); } catch (e) {}
        return result;
      } catch (err) {
        if (err && err.name === 'AbortError') return null;
        throw err;
      }
    };
    fetchLiveComp._abortPatched = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wrap);
  else setTimeout(wrap, 0);
})();

async function refreshCompsPanel(ctx, forceOnline) {
  window._compsActiveCtx = ctx;
  const panel = $(ctx === 'buylist' ? 'bl-comps' : 'sale-comps');
  if (!panel) return;
  const s = loadSettings();
  if (s.compsEnabled === false) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = '';
  const name = getCtxName(ctx);
  if (!name || name.length < 2) {
    renderCompsUI(ctx, null, 'off', '—', 'Type a card name (2+ characters)');
    return;
  }
  const cached = lookupCachedComp(name);
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;

  // Show cache immediately so counter never waits
  if (cached && (cached.market != null || cached.mid != null || cached.low != null)) {
    const kind = cached.source === 'import' ? 'import' : 'cached';
    const label = cached.source === 'import' ? 'Imported' : 'Cached';
    renderCompsUI(ctx, cached, kind, label, online ? 'checking online…' : 'offline');
  } else {
    renderCompsUI(ctx, null, 'off', '…', online ? 'Looking up…' : 'Offline — no cache for this card');
  }

  if (!online && !forceOnline) {
    if (!cached) renderCompsUI(ctx, null, 'err', 'Offline', 'No cached/imported comps. Import a price guide in Shop, or reconnect.');
    return;
  }

  try {
    const live = await fetchLiveComp(name);
    // Ignore if name changed while fetching
    if (getCtxName(ctx) !== name) return;
    if (live && (live.market != null || live.mid != null || live.low != null)) {
      cacheCompEntry(live);
      renderCompsUI(ctx, live, 'online', 'Online', '');
      return;
    }
    if (cached && (cached.market != null || cached.mid != null || cached.low != null)) {
      const kind = cached.source === 'import' ? 'import' : 'cached';
      renderCompsUI(ctx, cached, kind, cached.source === 'import' ? 'Imported' : 'Cached', 'API had no price — using cache');
      return;
    }
    renderCompsUI(ctx, live || null, 'err', 'No price', 'API found card but no TCGPlayer prices. Use deep links.');
    if (live) {
      _compState[ctx] = live;
      const actionsEl = $(ctx === 'buylist' ? 'bl-comps-actions' : 'sale-comps-actions');
      if (actionsEl) actionsEl.style.display = 'flex';
    }
  } catch (err) {
    if (getCtxName(ctx) !== name) return;
    if (cached && (cached.market != null || cached.mid != null || cached.low != null)) {
      const kind = cached.source === 'import' ? 'import' : 'cached';
      renderCompsUI(ctx, cached, kind, cached.source === 'import' ? 'Imported' : 'Cached', 'Network error — using cache');
    } else {
      renderCompsUI(ctx, null, 'err', 'Error', 'Lookup failed — counter still works. Try deep links or import.');
      const actionsEl = $(ctx === 'buylist' ? 'bl-comps-actions' : 'sale-comps-actions');
      if (actionsEl) {
        actionsEl.style.display = 'flex';
        _compState[ctx] = { name: name, market: null, mid: null, low: null, high: null };
      }
    }
  }
}
function useCompPrice(ctx, which) {
  const comp = _compState[ctx];
  if (!comp) { toast('No comps loaded', 'err'); return; }
  let val = null;
  if (which === 'market') val = comp.market != null ? comp.market : (comp.mid != null ? comp.mid : comp.low);
  else if (which === 'mid') val = comp.mid != null ? comp.mid : (comp.market != null ? comp.market : comp.low);
  else if (which === 'low') val = comp.low;
  else if (which === 'high') val = comp.high;
  if (val == null || isNaN(val)) { toast('That price is not available', 'err'); return; }
  if (ctx === 'buylist') {
    if ($('bl-market')) $('bl-market').value = (+val).toFixed(2);
    toast('Market set to ' + fmtCompMoney(val), 'ok');
    setTimeout(function () {
      const btn = $('btn-add-quote');
      if (btn) try { btn.focus(); } catch (e) {}
    }, 20);
  } else {
    if ($('log-price')) $('log-price').value = (+val).toFixed(2);
    if (typeof updateSaleCreditPreview === 'function') updateSaleCreditPreview();
    toast('Sale price set to ' + fmtCompMoney(val), 'ok');
    setTimeout(function () {
      const btn = $('btn-log-sale');
      if (btn) try { btn.focus(); } catch (e) {
        const p = $('log-price');
        if (p) try { p.focus(); p.select(); } catch (e2) {}
      }
    }, 20);
  }
}
function openCompDeepLink(ctx, kind) {
  const name = getCtxName(ctx) || (_compState[ctx] && _compState[ctx].name) || '';
  if (!name) { toast('Enter a card name first', 'err'); return; }
  const q = encodeURIComponent(name);
  let url = '';
  if (kind === 'tcg') {
    url = 'https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=' + q + '&view=grid';
  } else {
    url = 'https://www.ebay.com/sch/i.html?_nkw=' + q + '+pokemon&LH_Sold=1&LH_Complete=1';
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
function importPriceGuide() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.json,text/csv,application/json';
  input.onchange = async function (e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = [];
      if (/\.json$/i.test(file.name) || text.trim().charAt(0) === '[' || text.trim().charAt(0) === '{') {
        let data = JSON.parse(text);
        if (data && data.guide) data = data.guide;
        if (data && data.entries) {
          // full comps store restore into guide+entries
          const store = loadCompsStore();
          Object.keys(data.entries || {}).forEach(function (k) { store.entries[k] = data.entries[k]; });
          Object.keys(data.guide || {}).forEach(function (k) { store.guide[k] = data.guide[k]; });
          saveCompsStore(store);
          updateCompsCacheStats();
          toast('Imported comps store', 'ok');
          return;
        }
        const arr = Array.isArray(data) ? data : (data.cards || data.prices || []);
        arr.forEach(function (r) {
          if (!r) return;
          rows.push({
            name: r.name || r.card || r.product || '',
            set: r.set || r.setName || r.series || '',
            market: r.market != null ? r.market : r.marketPrice,
            mid: r.mid != null ? r.mid : r.midPrice,
            low: r.low != null ? r.low : r.lowPrice,
            high: r.high != null ? r.high : r.highPrice
          });
        });
      } else {
        const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
        if (!lines.length) throw new Error('Empty CSV');
        const header = lines[0].split(',').map(function (h) { return h.trim().toLowerCase().replace(/['"]/g, ''); });
        const idx = function (names) {
          for (let i = 0; i < names.length; i++) {
            const j = header.indexOf(names[i]);
            if (j >= 0) return j;
          }
          return -1;
        };
        const iName = idx(['name', 'card', 'product', 'card name']);
        const iSet = idx(['set', 'setname', 'set name', 'series']);
        const iMkt = idx(['market', 'marketprice', 'market price', 'tcg market']);
        const iMid = idx(['mid', 'midprice', 'mid price']);
        const iLow = idx(['low', 'lowprice', 'low price']);
        const iHigh = idx(['high', 'highprice', 'high price']);
        if (iName < 0) throw new Error('CSV needs a name column');
        for (let li = 1; li < lines.length; li++) {
          const cols = lines[li].match(/("([^"]|"")*"|[^,]*)/g) || lines[li].split(',');
          const cell = function (i) {
            if (i < 0 || i >= cols.length) return '';
            return String(cols[i] || '').replace(/^"|"$/g, '').replace(/""/g, '"').trim();
          };
          const nm = cell(iName);
          if (!nm) continue;
          rows.push({
            name: nm,
            set: cell(iSet),
            market: parseFloat(cell(iMkt)) || null,
            mid: parseFloat(cell(iMid)) || null,
            low: parseFloat(cell(iLow)) || null,
            high: parseFloat(cell(iHigh)) || null
          });
        }
      }
      const store = loadCompsStore();
      let n = 0;
      const now = new Date().toISOString();
      rows.forEach(function (r) {
        if (!r.name) return;
        const key = nameOnlyKey(r.name);
        if (!key) return;
        store.guide[key] = {
          name: r.name,
          set: r.set || '',
          market: r.market,
          mid: r.mid,
          low: r.low,
          high: r.high,
          source: 'import',
          updatedAt: now
        };
        // also seed entries for name|set
        const ek = normalizeCompKey(r.name, r.set);
        store.entries[ek] = Object.assign({}, store.guide[key], { source: 'import' });
        n++;
      });
      saveCompsStore(store);
      updateCompsCacheStats();
      toast('Imported ' + n + ' price-guide rows', 'ok');
    } catch (err) {
      toast('Import failed: ' + err.message, 'err');
    }
  };
  input.click();
}


function ctInitRetail() {
  // P3 cold start: paint chrome + Sale/last tab first; defer non-critical work
  applyShopChrome();
  checkOnline();

window.addEventListener('online', checkOnline);;
  window.addEventListener('offline', checkOnline);
  if ($('sale-date') && !$('sale-date').value) $('sale-date').value = d8();
  if ($('box-date') && !$('box-date').value) $('box-date').value = d8();

  let startTab = 'home';
  try {
    const saved = localStorage.getItem(CT_LAST_TAB_KEY);
    if (saved && document.getElementById('sec-' + saved)) startTab = saved;
  } catch (e) {}
  const sBoot = loadSettings();
  if (!sBoot.onboarded) startTab = 'home';
  else if (!localStorage.getItem(CT_LAST_TAB_KEY) || startTab === 'log') startTab = 'home';
  if (sBoot.showMode && sBoot.onboarded && startTab === 'home') { /* keep Home as overview */ }
  // Avoid heavy Scan/Prices/Watch on cold open
  if (['scan', 'prices', 'watchlist', 'ebay', 'game'].indexOf(startTab) !== -1) startTab = 'home';
  if (isStorefrontPublic && isStorefrontPublic()) startTab = 'storefront';
  if (typeof switchTab === 'function') switchTab(startTab);
  else setTimeout(focusSaleScanField, 30);

  if (sBoot.compsEnabled === false) {
    ['sale-comps', 'bl-comps'].forEach(function (id) { const el = $(id); if (el) el.style.display = 'none'; });
  }

  // live cash-due preview (cheap)
  ['log-price','log-qty'].forEach(function (id) {
    const el = $(id);
    if (el && !el._ctCreditBound) {
      el.addEventListener('input', function () { if (typeof updateSaleCreditPreview === 'function') updateSaleCreditPreview(); });
      el._ctCreditBound = true;
    }
  });

  const defer = (typeof requestIdleCallback === 'function')
    ? function (fn, ms) { requestIdleCallback(fn, { timeout: ms || 1500 }); }
    : function (fn, ms) { setTimeout(fn, Math.min(ms || 1500, 200)); };

  // Migrate after first paint so Sale scan field is interactive sooner
  requestAnimationFrame(function () {
    try { migrateRecords(); } catch (e) {}
    if ($('inv-kind')) try { onKindChange(); } catch (e) {}
    if (startTab === 'log') {
      try { renderRecentSales(); } catch (e) {}
      if (typeof renderFastSale === 'function') try { renderFastSale(); } catch (e) {}
    }
  });

  defer(function () {
    try { checkBackupReminder(); } catch (e) {}
    try { renderQuote(); } catch (e) {}
    try { renderBuylist(); } catch (e) {}
    if (typeof refreshCustomerDatalist === 'function') try { refreshCustomerDatalist(); } catch (e) {}
    if (typeof renderCustomers === 'function') try { renderCustomers(); } catch (e) {}
    if (typeof updateCompsCacheStats === 'function') try { updateCompsCacheStats(); } catch (e) {}
  }, 1800);
}


/* ===== Tech10 upgrades (offline outbox, lanes, floor, PIN, haptics, comps hist, ID photo, IDB art) ===== */
var CT_OUTBOX_KEY = 'ct_outbox';
var CT_LANES_KEY = 'ct_meet_lanes';
var CT_COMPS_HIST_KEY = 'ct_comps_hist';
var CT_ART_DB = 'ct_art_cache_v1';
var CT_TRANSFER_TTL_MS = 15 * 60 * 1000;
var _ctLane = 'A';
var _ctLanes = { A: [], B: [], C: [] };
var _ctLaneSel = { A: -1, B: -1, C: -1 };
var _ctPinBuf = '';
var _ctPinResolve = null;
var _ctUnlockedUntil = 0;
var _ctTransferPayload = null;
var _ctIdPhotoDataUrl = '';
var _ctArtDbPromise = null;

function ctLoadOutbox() {
  try { return JSON.parse(localStorage.getItem(CT_OUTBOX_KEY) || '[]'); } catch (e) { return []; }
}
function ctSaveOutbox(list) {
  try { localStorage.setItem(CT_OUTBOX_KEY, JSON.stringify(list || [])); } catch (e) {}
  ctUpdateOutboxBadge();
}
function ctUpdateOutboxBadge() {
  var n = ctLoadOutbox().length;
  var el = $('outbox-badge');
  if (!el) return;
  el.textContent = String(n);
  el.classList.toggle('show', n > 0);
  el.title = n ? (n + ' queued offline op' + (n === 1 ? '' : 's')) : 'Outbox empty';
}
function ctEnqueueOutbox(op) {
  var list = ctLoadOutbox();
  list.push(Object.assign({ id: Date.now() + Math.random(), ts: new Date().toISOString() }, op || {}));
  ctSaveOutbox(list);
  toast('Queued offline — will flush when online (' + list.length + ')', 'ok');
}
function ctIsOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}
async function ctFlushOutbox() {
  if (!ctIsOnline()) return;
  var list = ctLoadOutbox();
  if (!list.length) { ctUpdateOutboxBadge(); return; }
  var remaining = [];
  var flushed = 0;
  for (var i = 0; i < list.length; i++) {
    var op = list[i];
    try {
      // Local-first: ops recorded while offline are already applied to Indexed/localStorage.
      // Mark applied:true on enqueue; flush only re-applies pending (applied!==true) ops.
      if (op.applied) { flushed++; continue; }
      if (op.type === 'sale' && Array.isArray(op.sales)) {
        (op.sales || []).forEach(function (s) { DB.sales.push(s); });
        DB.saveSales();
        if (op.inventory) { DB.inventory = op.inventory; DB.saveInventory(); }
        flushed++;
      } else if (op.type === 'tradein' && op.quote) {
        var bl = getBuylist();
        var exists = bl.some(function (q) { return q && op.quote && q.id === op.quote.id; });
        if (!exists) { bl.unshift(op.quote); saveBuylist(bl); }
        flushed++;
      } else if (op.type === 'credit' && op.name && op.amount) {
        // Skip re-apply if already in ledger note
        if (op.creditType === 'redeem') redeemCustomerCredit(op.name, op.amount, op.note || 'Outbox', 'outbox');
        else creditCustomer(op.name, op.amount, op.note || 'Outbox', 'outbox');
        flushed++;
      } else {
        remaining.push(op);
      }
    } catch (e) {
      remaining.push(op);
    }
  }
  ctSaveOutbox(remaining);
  if (flushed) {
    toast('Flushed ' + flushed + ' offline op(s)', 'ok');
    try { if (typeof renderRecentSales === 'function') renderRecentSales(); } catch (e) {}
    try { if (typeof renderBuylist === 'function') renderBuylist(); } catch (e) {}
    try { if (typeof renderCustomers === 'function') renderCustomers(); } catch (e) {}
  }
}

/* Multi-cart lanes */
function ctLoadLanes() {
  try {
    var raw = JSON.parse(localStorage.getItem(CT_LANES_KEY) || '{}');
    _ctLanes = { A: raw.A || [], B: raw.B || [], C: raw.C || [] };
    _ctLaneSel = { A: raw.selA != null ? raw.selA : -1, B: raw.selB != null ? raw.selB : -1, C: raw.selC != null ? raw.selC : -1 };
    _ctLane = raw.active || 'A';
  } catch (e) {
    _ctLanes = { A: [], B: [], C: [] };
    _ctLane = 'A';
  }
}
function ctPersistLanes() {
  try {
    localStorage.setItem(CT_LANES_KEY, JSON.stringify({
      A: _ctLanes.A, B: _ctLanes.B, C: _ctLanes.C,
      selA: _ctLaneSel.A, selB: _ctLaneSel.B, selC: _ctLaneSel.C,
      active: _ctLane
    }));
  } catch (e) {}
  ctUpdateLaneBadges();
}
function ctUpdateLaneBadges() {
  ['A', 'B', 'C'].forEach(function (L) {
    var el = $('lane-n-' + L);
    if (el) el.textContent = (_ctLanes[L] && _ctLanes[L].length) ? ('·' + _ctLanes[L].length) : '';
    var btn = document.querySelector('#lane-switch [data-lane="' + L + '"]');
    if (btn) btn.classList.toggle('active', L === _ctLane);
  });
}
function ctSyncCartFromLane() {
  CART = (_ctLanes[_ctLane] || []).slice();
  CART_SEL = _ctLaneSel[_ctLane] != null ? _ctLaneSel[_ctLane] : -1;
  if (typeof renderCart === 'function') renderCart();
  ctUpdateLaneBadges();
}
function ctSaveCartToLane() {
  _ctLanes[_ctLane] = (CART || []).map(function (l) { return Object.assign({}, l); });
  _ctLaneSel[_ctLane] = CART_SEL;
  ctPersistLanes();
}
function ctSwitchLane(L) {
  if (!L || L === _ctLane) return;
  ctSaveCartToLane();
  _ctLane = L;
  ctSyncCartFromLane();
  toast('Lane ' + L, 'ok');
}

/* Price floor */
function ctFloorCheckLines(lines) {
  var s = loadSettings();
  var minM = (s.minMarginPct != null ? s.minMarginPct : 15) / 100;
  var floorP = (s.marketFloorPct != null ? s.marketFloorPct : 85) / 100;
  var issues = [];
  (lines || []).forEach(function (l, i) {
    var price = num(l.price);
    var cost = num(l.cost);
    var mkt = num(l.market);
    if (cost > 0 && price < cost * (1 + minM) - 0.001) {
      issues.push({ i: i, name: l.name || l.sku, reason: 'below cost+' + Math.round(minM * 100) + '% (min ' + fmt(cost * (1 + minM)) + ')' });
    }
    if (mkt > 0 && price < mkt * floorP - 0.001) {
      issues.push({ i: i, name: l.name || l.sku, reason: 'below market×' + Math.round(floorP * 100) + '% (min ' + fmt(mkt * floorP) + ')' });
    }
  });
  return issues;
}
function ctShowFloorWarn(issues) {
  var el = $('price-floor-warn');
  if (!el) return;
  if (!issues || !issues.length) { el.classList.remove('show'); el.textContent = ''; return; }
  el.classList.add('show');
  el.textContent = 'Undercut guard: ' + issues.slice(0, 3).map(function (x) { return (x.name || 'line') + ' — ' + x.reason; }).join(' · ');
}
function ctGuardCheckout() {
  var lines = CART.length ? CART : [{
    name: ($('log-name') && $('log-name').value) || '',
    sku: ($('log-sku') && $('log-sku').value) || '',
    price: num($('log-price') && $('log-price').value),
    cost: num($('log-cost') && $('log-cost').value),
    market: (_compState && _compState.sale && (_compState.sale.market || _compState.sale.mid)) || null
  }];
  var issues = ctFloorCheckLines(lines);
  ctShowFloorWarn(issues);
  if (!issues.length) return true;
  var s = loadSettings();
  var msg = 'Price floor warning:\n' + issues.map(function (x) { return '• ' + (x.name || 'item') + ': ' + x.reason; }).join('\n');
  if (s.floorBlock) {
    return confirm(msg + '\n\nBlock is ON — override and sell anyway?');
  }
  toast('Undercut guard: review prices', 'err');
  return true;
}

/* Haptics + beep */
function ctFeedback(kind) {
  var s = loadSettings();
  if (s.muteFeedback) return;
  if (s.haptics !== false && navigator.vibrate) {
    try { navigator.vibrate(kind === 'sale' ? [12, 40, 18] : 18); } catch (e) {}
  }
  if (s.beep) {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = ctFeedback._ctx || (ctFeedback._ctx = new Ctx());
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = kind === 'sale' ? 880 : 660;
      g.gain.value = 0.04;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      setTimeout(function () { try { o.stop(); } catch (e) {} }, kind === 'sale' ? 120 : 70);
    } catch (e) {}
  }
}
function ctSaveTech10Toggles() {
  var s = loadSettings();
  if ($('set-haptics')) s.haptics = !!$('set-haptics').checked;
  if ($('set-beep')) s.beep = !!$('set-beep').checked;
  if ($('set-mute-feedback')) s.muteFeedback = !!$('set-mute-feedback').checked;
  saveSettings(s);
  toast('Feedback settings saved', 'ok');
}

/* PIN + WebAuthn */
function ctSimpleHash(str) {
  var h = 2166136261;
  str = String(str || '');
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8) + btoa(unescape(encodeURIComponent(str))).slice(0, 16);
}
function ctPinSessionOk() {
  return Date.now() < _ctUnlockedUntil;
}
function ctRequireUnlock(reason) {
  var s = loadSettings();
  if (!s.pinEnabled || !s.pinHash) return Promise.resolve(true);
  if (ctPinSessionOk()) return Promise.resolve(true);
  return new Promise(function (resolve) {
    _ctPinResolve = resolve;
    _ctPinBuf = '';
    ctRenderPinDots();
    var ov = $('pin-lock-overlay');
    if ($('pin-lock-reason')) $('pin-lock-reason').textContent = reason || 'Enter PIN';
    if (ov) ov.classList.add('open');
  });
}
function ctRenderPinDots() {
  var dots = document.querySelectorAll('#pin-dots span');
  dots.forEach(function (d, i) { d.classList.toggle('on', i < _ctPinBuf.length); });
}
function ctPinDigit(d) {
  if (d === 'back') { _ctPinBuf = _ctPinBuf.slice(0, -1); ctRenderPinDots(); return; }
  if (d === 'ok') { ctSubmitPin(); return; }
  if (_ctPinBuf.length >= 6) return;
  _ctPinBuf += d;
  ctRenderPinDots();
  if (_ctPinBuf.length >= 4) {
    var s = loadSettings();
    if (s.pinHash && ctSimpleHash(_ctPinBuf) === s.pinHash) ctSubmitPin();
  }
}
function ctSubmitPin() {
  var s = loadSettings();
  if (!s.pinHash || ctSimpleHash(_ctPinBuf) !== s.pinHash) {
    toast('Wrong PIN', 'err');
    _ctPinBuf = '';
    ctRenderPinDots();
    return;
  }
  _ctUnlockedUntil = Date.now() + 10 * 60 * 1000;
  var ov = $('pin-lock-overlay');
  if (ov) ov.classList.remove('open');
  var r = _ctPinResolve; _ctPinResolve = null; _ctPinBuf = '';
  if (r) r(true);
  toast('Unlocked', 'ok');
}
function ctTogglePinEnabled(on) {
  var s = loadSettings();
  if (on && !s.pinHash) { toast('Set a PIN first', 'err'); if ($('set-pin-enabled')) $('set-pin-enabled').checked = false; return; }
  s.pinEnabled = !!on;
  saveSettings(s);
  toast(on ? 'PIN lock on' : 'PIN lock off', 'ok');
}
function ctSavePinFromForm() {
  var a = ($('set-pin-new') && $('set-pin-new').value) || '';
  var b = ($('set-pin-confirm') && $('set-pin-confirm').value) || '';
  if (!/^\d{4,6}$/.test(a)) { toast('PIN must be 4–6 digits', 'err'); return; }
  if (a !== b) { toast('PIN confirm mismatch', 'err'); return; }
  var s = loadSettings();
  s.pinHash = ctSimpleHash(a);
  s.pinEnabled = true;
  saveSettings(s);
  if ($('set-pin-enabled')) $('set-pin-enabled').checked = true;
  if ($('set-pin-new')) $('set-pin-new').value = '';
  if ($('set-pin-confirm')) $('set-pin-confirm').value = '';
  toast('PIN saved', 'ok');
}
function ctClearPin() {
  if (!confirm('Clear PIN lock?')) return;
  var s = loadSettings();
  s.pinHash = '';
  s.pinEnabled = false;
  s.webauthnCredId = '';
  saveSettings(s);
  if ($('set-pin-enabled')) $('set-pin-enabled').checked = false;
  toast('PIN cleared', 'ok');
}
async function ctTryWebAuthnRegister() {
  if (!window.PublicKeyCredential) { toast('WebAuthn not available — use PIN', 'err'); return; }
  try {
    var challenge = crypto.getRandomValues(new Uint8Array(32));
    var cred = await navigator.credentials.create({
      publicKey: {
        challenge: challenge,
        rp: { name: 'CardTrack' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'shop', displayName: 'Shop operator' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { userVerification: 'preferred', authenticatorAttachment: 'platform' },
        timeout: 60000
      }
    });
    if (!cred) return;
    var s = loadSettings();
    s.webauthnCredId = btoa(String.fromCharCode.apply(null, new Uint8Array(cred.rawId))).slice(0, 64);
    s.pinEnabled = true;
    saveSettings(s);
    toast('WebAuthn registered', 'ok');
  } catch (e) {
    toast('WebAuthn register failed — use PIN', 'err');
  }
}
async function ctTryWebAuthnUnlock() {
  var s = loadSettings();
  if (!s.webauthnCredId || !window.PublicKeyCredential) { toast('No passkey — use PIN', 'err'); return; }
  try {
    var challenge = crypto.getRandomValues(new Uint8Array(32));
    var idBin = Uint8Array.from(atob(s.webauthnCredId), function (c) { return c.charCodeAt(0); });
    await navigator.credentials.get({
      publicKey: {
        challenge: challenge,
        allowCredentials: [{ type: 'public-key', id: idBin }],
        userVerification: 'preferred',
        timeout: 60000
      }
    });
    _ctUnlockedUntil = Date.now() + 10 * 60 * 1000;
    var ov = $('pin-lock-overlay');
    if (ov) ov.classList.remove('open');
    var r = _ctPinResolve; _ctPinResolve = null;
    if (r) r(true);
    toast('Unlocked via passkey', 'ok');
  } catch (e) {
    toast('Passkey failed — enter PIN', 'err');
  }
}

/* Backup QR transfer */
function ctBuildBackupObject() {
  return {
    app: 'CardTrack Shop',
    version: 6,
    exportedAt: new Date().toISOString(),
    sales: DB.sales,
    inventory: DB.inventory,
    watchlist: (typeof getWatchlist === 'function') ? getWatchlist() : [],
    buylist: getBuylist(),
    customers: (typeof getCustomers === 'function') ? getCustomers() : [],
    settings: loadSettings(),
    comps: (typeof loadCompsStore === 'function') ? loadCompsStore() : null,
    compsHist: ctLoadCompsHist(),
    lanes: { A: _ctLanes.A, B: _ctLanes.B, C: _ctLanes.C, active: _ctLane },
    outbox: ctLoadOutbox()
  };
}
function ctStartBackupTransfer() {
  ctRequireUnlock('Unlock to export transfer').then(function (ok) {
    if (!ok) return;
    var payload = ctBuildBackupObject();
    var json = JSON.stringify(payload);
    var code = (Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6)).toUpperCase();
    var exp = Date.now() + CT_TRANSFER_TTL_MS;
    _ctTransferPayload = { code: code, exp: exp, json: json, bytes: json.length };
    var box = $('qr-transfer-box');
    if (box) box.classList.add('show');
    if ($('qr-transfer-meta')) {
      $('qr-transfer-meta').textContent = 'Code ' + code + ' · expires ' + new Date(exp).toLocaleTimeString() + ' · ' + Math.round(json.length / 1024) + ' KB — QR shows code + size; use Download for full JSON (chunked file).';
    }
    var host = $('qr-transfer-canvas');
    if (host) {
      host.innerHTML = '';
      var qrText = 'CTBACKUP:' + code + ':' + exp + ':' + Math.round(json.length / 1024) + 'KB';
      try {
        if (typeof qrcode === 'function') {
          var qr = qrcode(0, 'M');
          qr.addData(qrText);
          qr.make();
          host.innerHTML = qr.createImgTag(4, 4);
        } else {
          host.textContent = qrText;
        }
      } catch (e) {
        host.textContent = qrText;
      }
    }
    toast('Transfer ready — download chunk or copy link', 'ok');
  });
}
function ctDownloadTransferChunk() {
  if (!_ctTransferPayload) { toast('Generate transfer first', 'err'); return; }
  if (Date.now() > _ctTransferPayload.exp) { toast('Transfer expired — regenerate', 'err'); return; }
  var wrap = {
    app: 'CardTrack Transfer',
    code: _ctTransferPayload.code,
    exp: _ctTransferPayload.exp,
    chunk: 0,
    chunks: 1,
    payload: _ctTransferPayload.json
  };
  download('cardtrack-transfer-' + _ctTransferPayload.code + '.json', JSON.stringify(wrap), 'application/json');
  markBackupDone();
}
function ctCopyTransferLink() {
  if (!_ctTransferPayload) { toast('Generate transfer first', 'err'); return; }
  if (Date.now() > _ctTransferPayload.exp) { toast('Transfer expired', 'err'); return; }
  // Small books only — otherwise instruct download
  if (_ctTransferPayload.json.length > 120000) {
    toast('Books too large for link — use Download chunk file', 'err');
    return;
  }
  var link = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(_ctTransferPayload.json)));
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(function () { toast('Transfer data-URL copied (paste/import on other phone)', 'ok'); }).catch(function () { prompt('Copy', link.slice(0, 200) + '…'); });
  } else {
    prompt('Copy start of transfer (prefer Download)', link.slice(0, 180));
  }
}
function ctImportTransferFile() {
  ctRequireUnlock('Unlock to import transfer').then(function (ok) {
    if (!ok) return;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async function (e) {
      var file = e.target.files[0];
      if (!file) return;
      try {
        var text = await file.text();
        var data = JSON.parse(text);
        if (data && data.payload && data.app === 'CardTrack Transfer') {
          if (data.exp && Date.now() > data.exp) { toast('Transfer code expired', 'err'); return; }
          data = JSON.parse(data.payload);
        }
        if (!data || (!data.inventory && !data.sales)) { toast('Not a CardTrack backup/transfer', 'err'); return; }
        if (!confirm('Import transfer and REPLACE this device books?')) return;
        DB.inventory = Array.isArray(data.inventory) ? data.inventory : [];
        DB.sales = Array.isArray(data.sales) ? data.sales : [];
        DB.saveInventory(); DB.saveSales();
        if (Array.isArray(data.watchlist) && typeof saveWatchlist === 'function') saveWatchlist(data.watchlist);
        saveBuylist(Array.isArray(data.buylist) ? data.buylist : []);
        if (typeof saveCustomers === 'function') saveCustomers(Array.isArray(data.customers) ? data.customers : []);
        if (data.settings) saveSettings(Object.assign(defaultSettings(), data.settings));
        if (data.comps && typeof saveCompsStore === 'function') saveCompsStore(data.comps);
        if (data.compsHist) try { localStorage.setItem(CT_COMPS_HIST_KEY, JSON.stringify(data.compsHist)); } catch (e) {}
        if (data.lanes) {
          _ctLanes = { A: data.lanes.A || [], B: data.lanes.B || [], C: data.lanes.C || [] };
          _ctLane = data.lanes.active || 'A';
          ctPersistLanes(); ctSyncCartFromLane();
        }
        if (data.outbox) ctSaveOutbox(data.outbox);
        migrateRecords(); applyShopChrome();
        toast('Transfer imported', 'ok');
        location.reload();
      } catch (err) {
        toast('Import failed: ' + err.message, 'err');
      }
    };
    input.click();
  });
}

/* Comps history */
function ctLoadCompsHist() {
  try { return JSON.parse(localStorage.getItem(CT_COMPS_HIST_KEY) || '{}'); } catch (e) { return {}; }
}
function ctSaveCompsHist(store) {
  try { localStorage.setItem(CT_COMPS_HIST_KEY, JSON.stringify(store || {})); } catch (e) {}
}
function ctPushCompsHistory(comp) {
  if (!comp || !comp.name) return;
  var key = (typeof nameOnlyKey === 'function' ? nameOnlyKey(comp.name) : String(comp.name).toLowerCase());
  if (!key) return;
  var store = ctLoadCompsHist();
  var arr = store[key] || [];
  var mkt = num(comp.market != null ? comp.market : comp.mid);
  if (!mkt) return;
  var last = arr[arr.length - 1];
  if (last && Math.abs(num(last.v) - mkt) < 0.005 && (Date.now() - Date.parse(last.t || 0)) < 3600000) return;
  arr.push({ t: new Date().toISOString(), v: mkt, mid: num(comp.mid), low: num(comp.low) });
  if (arr.length > 30) arr = arr.slice(-30);
  store[key] = arr;
  ctSaveCompsHist(store);
}
function ctSparkSvg(points, opts) {
  opts = opts || {};
  var series = ctEnsureSparkSeries(points, opts.comp);
  if (!series || series.length < 2) return opts.placeholder || '';
  var vals = series.map(function (p) { return num(p.v); });
  var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  if (max <= min) max = min + 0.01;
  var w = opts.w || 64, h = opts.h || 24, pad = opts.pad != null ? opts.pad : 2;
  var first = vals[0], last = vals[vals.length - 1];
  var dir = last > first + 0.004 ? 'up' : (last < first - 0.004 ? 'down' : 'flat');
  var coords = series.map(function (p, i) {
    var x = pad + (i / (series.length - 1)) * (w - pad * 2);
    var y = h - pad - ((num(p.v) - min) / (max - min)) * (h - pad * 2);
    return [x, y];
  });
  var d = coords.map(function (c, i) { return (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1); }).join(' ');
  var fillD = d + ' L' + coords[coords.length - 1][0].toFixed(1) + ' ' + (h - pad) + ' L' + coords[0][0].toFixed(1) + ' ' + (h - pad) + ' Z';
  var cls = opts.cls || 'lp-spark';
  var title = opts.title || 'Price history';
  return '<span class="' + cls + ' ' + dir + '" title="' + title + '"><svg viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
    (opts.noFill ? '' : '<path class="lp-fill" d="' + fillD + '"></path>') +
    '<path class="lp-line" d="' + d + '"></path></svg></span>';
}
function ctRenderCompsHist(ctx, comp) {
  if (ctx !== 'sale') return;
  var el = $('sale-comps-hist');
  if (!el) return;
  if (!comp || !comp.name) { el.innerHTML = ''; return; }
  var key = (typeof nameOnlyKey === 'function' ? nameOnlyKey(comp.name) : String(comp.name).toLowerCase());
  var arr = (ctLoadCompsHist()[key] || []).slice();
  if (!arr.length) { el.innerHTML = '<span class="text-muted">No comps history yet</span>'; return; }
  var spark = ctSparkSvg(arr, { w: 72, h: 18, cls: 'lp-spark comps-spark', comp: comp });
  var chg = ctPriceChange(arr, comp);
  var chip = ctChangeChipHtml(chg);
  var last3 = arr.slice(-3).map(function (p) {
    return '<span class="ch-pt">' + fmtCompMoney(p.v) + '</span>';
  }).join(' → ');
  el.innerHTML = spark + ' ' + chip + ' <span>Hist</span> ' + last3 + ' <span class="text-muted">(' + arr.length + ')</span>';
}

/* Smart restock */
function ctRenderSmartRestock() {
  var box = $('r-smart-restock');
  if (!box) return;
  var s = loadSettings();
  var deadDays = s.deadStockDays || 60;
  var restockN = s.restockQty || 3;
  var deadCut = Date.now() - deadDays * 86400000;
  var lastSaleByKey = {};
  var velMap = {};
  realSales().forEach(function (x) {
    var key = (x.sku || '') + '|' + (x.name || '');
    var t = Date.parse(x.date);
    if (t && (!lastSaleByKey[key] || t > lastSaleByKey[key])) lastSaleByKey[key] = t;
    var vk = x.sku || x.name || 'item';
    if (!velMap[vk]) velMap[vk] = { name: x.name, sku: x.sku, qty: 0 };
    velMap[vk].qty += int(x.qty, 1);
  });
  var ranked = [];
  (DB.inventory || []).forEach(function (i) {
    var qty = int(i.qty, 0);
    if (!qty && !velMap[i.sku] && !velMap[i.name]) return;
    var key = (i.sku || '') + '|' + (i.name || '');
    var last = lastSaleByKey[key];
    var added = Date.parse(i.addedAt || i.receivedDate || '') || 0;
    var deadScore = 0;
    if (qty > 0) {
      if (last) deadScore = last < deadCut ? Math.min(3, (Date.now() - last) / (deadDays * 86400000)) : 0;
      else deadScore = (!added || added < deadCut) ? 2 : 0.5;
    }
    var v = velMap[i.sku] || velMap[i.name];
    var vel = v ? v.qty : 0;
    var low = qty < restockN ? (restockN - qty) : 0;
    var score = vel * 2 + deadScore + (low ? 1.5 : 0) + (qty === 0 && vel ? 3 : 0);
    if (score < 0.5) return;
    var sug = Math.max(restockN, Math.ceil(vel / 2) + (qty < restockN ? restockN - qty : 0));
    if (qty === 0 && vel) sug = Math.max(sug, Math.ceil(vel));
    ranked.push({ item: i, score: score, vel: vel, deadScore: deadScore, sug: sug, qty: qty });
  });
  ranked.sort(function (a, b) { return b.score - a.score; });
  if (!ranked.length) {
    box.innerHTML = '<div style="font-size:12px;color:var(--muted)">No restock signals yet — need sales velocity or aging stock.</div>';
    return;
  }
  box.innerHTML = ranked.slice(0, 16).map(function (r, idx) {
    var i = r.item;
    return '<div class="sr-row"><div style="display:flex;gap:8px"><span class="sr-rank">#' + (idx + 1) + '</span><div><div style="font-weight:700">' + esc(i.name || i.sku) + '</div>' +
      '<div class="sr-meta">' + esc(i.sku || '') + ' · on hand ' + r.qty + ' · sold ' + r.vel + ' · dead×' + r.deadScore.toFixed(1) + '</div></div></div>' +
      '<div style="text-align:right"><div style="font-weight:800;color:var(--accent)">+' + r.sug + '</div><div class="sr-meta">suggested</div></div></div>';
  }).join('');
}

/* ID from photo */
function ctIdFromPhoto(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    _ctIdPhotoDataUrl = String(reader.result || '');
    var thumb = $('id-photo-thumb');
    if (thumb) { thumb.src = _ctIdPhotoDataUrl; thumb.style.display = 'block'; }
    var btn = $('id-photo-search-btn');
    if (btn) btn.style.display = 'inline-flex';
    if (CART_SEL >= 0 && CART[CART_SEL]) {
      CART[CART_SEL].photoDataUrl = _ctIdPhotoDataUrl;
      ctSaveCartToLane();
    }
    toast('Photo attached — Search by name (no on-device OCR in this build)', 'ok');
  };
  reader.readAsDataURL(file);
}
function ctFocusNameSearchFromPhoto() {
  var el = $('reg-search') || $('log-name') || $('log-find');
  if (el) { el.focus(); try { el.select(); } catch (e) {} }
  toast('Type the card name — photo stays on the line', 'ok');
}

/* IndexedDB art cache */
function ctArtDb() {
  if (_ctArtDbPromise) return _ctArtDbPromise;
  _ctArtDbPromise = new Promise(function (resolve, reject) {
    try {
      var req = indexedDB.open(CT_ART_DB, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    } catch (e) { reject(e); }
  });
  return _ctArtDbPromise;
}
function ctIdbGet(url) {
  return ctArtDb().then(function (db) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction('blobs', 'readonly');
        var g = tx.objectStore('blobs').get(url);
        g.onsuccess = function () { resolve(g.result || null); };
        g.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }).catch(function () { return null; });
}
function ctIdbPut(url, blob) {
  return ctArtDb().then(function (db) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').put({ blob: blob, at: Date.now(), url: url }, url);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }).catch(function () { return false; });
}
function ctClearArtCache() {
  ctArtDb().then(function (db) {
    var tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').clear();
    tx.oncomplete = function () { toast('Art cache cleared', 'ok'); ctRefreshArtCacheStats(); };
  }).catch(function () { toast('Art cache unavailable', 'err'); });
}
function ctRefreshArtCacheStats() {
  var el = $('art-cache-stats');
  if (!el) return;
  ctArtDb().then(function (db) {
    var tx = db.transaction('blobs', 'readonly');
    var store = tx.objectStore('blobs');
    var c = store.count();
    c.onsuccess = function () { el.textContent = (c.result || 0) + ' cached images'; };
  }).catch(function () { el.textContent = 'IDB unavailable'; });
}
function ctResolveArtUrl(url) {
  if (!url) return Promise.resolve(url);
  return ctIdbGet(url).then(function (row) {
    if (row && row.blob) {
      try { return URL.createObjectURL(row.blob); } catch (e) { return url; }
    }
    // fetch & cache in background when online
    if (ctIsOnline()) {
      fetch(url, { mode: 'cors', credentials: 'omit' }).then(function (r) {
        if (!r.ok) return null;
        return r.blob();
      }).then(function (blob) {
        if (blob) ctIdbPut(url, blob).then(ctRefreshArtCacheStats);
      }).catch(function () {});
    }
    return url;
  });
}
// Wrap cardArtHtml usage via mount helper enhancement
var _ctMountCardArtOrig = null;
function ctInstallArtCacheHooks() {
  if (typeof mountCardArt === 'function' && !mountCardArt._tech10) {
    _ctMountCardArtOrig = mountCardArt;
    mountCardArt = function (el, url, sizeClass, foil) {
      if (!el) return;
      if (!url) return _ctMountCardArtOrig(el, url, sizeClass, foil);
      ctResolveArtUrl(url).then(function (resolved) {
        _ctMountCardArtOrig(el, resolved || url, sizeClass, foil);
      });
    };
    mountCardArt._tech10 = true;
  }
  // Also intercept img src assignment in cardArtHtml path: patch after render via Mutation — light touch: prefetch into IDB
  if (typeof ctPrefetchImage === 'function' && !ctPrefetchImage._tech10) {
    var _pf = ctPrefetchImage;
    ctPrefetchImage = function (url) {
      _pf(url);
      if (url) ctResolveArtUrl(url);
    };
    ctPrefetchImage._tech10 = true;
  }
}

/* Wire hooks into existing flows */
function ctInstallCheckoutHooks() {
  if (typeof acceptQuote === 'function' && !acceptQuote._tech10) {
    var _aq = acceptQuote;
    acceptQuote = function (payType) {
      var run = function () {
        var offline = !ctIsOnline();
        _aq(payType);
        ctFeedback('sale');
        if (offline) {
          var bl = getBuylist();
          ctEnqueueOutbox({ type: 'tradein', applied: true, payType: payType, quote: bl && bl[0] ? bl[0] : null });
        }
      };
      if (payType === 'credit' || payType === 'p2p') {
        ctRequireUnlock('Unlock for payout / credit').then(function (ok) { if (ok) run(); });
      } else run();
    };
    acceptQuote._tech10 = true;
  }
  if (typeof postCustomerLedger === 'function' && !postCustomerLedger._tech10) {
    var _pcl = postCustomerLedger;
    postCustomerLedger = function (name, amount, type, note, ref) {
      var offline = !ctIsOnline();
      var r = _pcl(name, amount, type, note, ref);
      if (offline) ctEnqueueOutbox({ type: 'credit', applied: true, name: name, amount: amount, creditType: type, note: note || '' });
      return r;
    };
    postCustomerLedger._tech10 = true;
  }

  if (typeof checkoutCart === 'function' && !checkoutCart._tech10) {
    var _cc = checkoutCart;
    checkoutCart = function () {
      if (!ctGuardCheckout()) return;
      var snapLines = (CART || []).map(function (l) { return Object.assign({}, l); });
      var offline = !ctIsOnline();
      _cc();
      ctFeedback('sale');
      ctSaveCartToLane();
      if (offline && snapLines.length) {
        ctEnqueueOutbox({ type: 'sale', applied: true, note: 'offline meet sale', lines: snapLines, sales: (DB.sales || []).slice(-snapLines.length) });
      }
    };
    checkoutCart._tech10 = true;
  }
  if (typeof addInventoryToCart === 'function' && !addInventoryToCart._tech10) {
    var _add = addInventoryToCart;
    addInventoryToCart = function (idx) {
      _add(idx);
      ctFeedback('scan');
      ctSaveCartToLane();
      try {
        var line = CART[CART_SEL];
        if (line) ctShowFloorWarn(ctFloorCheckLines([line]));
      } catch (e) {}
    };
    addInventoryToCart._tech10 = true;
  }
  if (typeof updateCartLine === 'function' && !updateCartLine._tech10) {
    var _ucl = updateCartLine;
    updateCartLine = function (i, field, val) {
      _ucl(i, field, val);
      ctSaveCartToLane();
      try { ctShowFloorWarn(ctFloorCheckLines(CART)); } catch (e) {}
    };
    updateCartLine._tech10 = true;
  }
  if (typeof clearCart === 'function' && !clearCart._tech10) {
    var _clr = clearCart;
    clearCart = function () {
      _clr();
      ctSaveCartToLane();
      ctShowFloorWarn([]);
    };
    clearCart._tech10 = true;
  }
  if (typeof renderCompsUI === 'function' && !renderCompsUI._tech10hist) {
    var _rc = renderCompsUI;
    renderCompsUI = function (ctx, comp, statusKind, statusLabel, metaExtra) {
      _rc(ctx, comp, statusKind, statusLabel, metaExtra);
      try {
        if (comp) ctPushCompsHistory(comp);
        ctRenderCompsHist(ctx, comp);
      } catch (e) {}
    };
    renderCompsUI._tech10hist = true;
  }
  if (typeof renderReportsShopExtras === 'function' && !renderReportsShopExtras._tech10) {
    var _rr = renderReportsShopExtras;
    renderReportsShopExtras = function () {
      _rr();
      try { ctRenderSmartRestock(); } catch (e) {}
    };
    renderReportsShopExtras._tech10 = true;
  }
  if (typeof checkOnline === 'function' && !checkOnline._tech10) {
    var _co = checkOnline;
    checkOnline = function () {
      _co();
      if (ctIsOnline()) ctFlushOutbox();
      ctUpdateOutboxBadge();
    };
    checkOnline._tech10 = true;
  }
  if (typeof restoreJSON === 'function' && !restoreJSON._tech10) {
    var _rj = restoreJSON;
    restoreJSON = function () {
      ctRequireUnlock('Unlock to restore backup').then(function (ok) {
        if (ok) _rj();
      });
    };
    restoreJSON._tech10 = true;
  }
  if (typeof backupJSON === 'function' && !backupJSON._tech10) {
    var _bj = backupJSON;
    backupJSON = function () {
      // bump version to 6 with lanes/outbox/hist
      var payload = ctBuildBackupObject();
      download('cardtrack-backup-' + d8() + '.json', JSON.stringify(payload, null, 2), 'application/json');
      markBackupDone();
      toast('Books backed up — save this file off the phone', 'ok');
    };
    backupJSON._tech10 = true;
  }
  // Gate Settings tab
  if (typeof switchTab === 'function' && !switchTab._tech10) {
    var _st = switchTab;
    switchTab = function (name, el) {
      if (name === 'shop') {
        ctRequireUnlock('Unlock Settings').then(function (ok) {
          if (ok) _st(name, el);
        });
        return;
      }
      return _st(name, el);
    };
    switchTab._tech10 = true;
  }
}

function ctInitTech10() {
  ctLoadLanes();
  ctSyncCartFromLane();
  ctUpdateOutboxBadge();
  ctInstallArtCacheHooks();
  ctInstallCheckoutHooks();
  ctRefreshArtCacheStats();
  if (ctIsOnline()) setTimeout(ctFlushOutbox, 400);
  window.addEventListener('online', function () { ctFlushOutbox(); });
  // Persist lanes periodically
  setInterval(function () { try { ctSaveCartToLane(); } catch (e) {} }, 4000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { setTimeout(ctInitTech10, 50); });
} else {
  setTimeout(ctInitTech10, 50);
}
window.ctInitTech10 = ctInitTech10;



// MEMORY GAME --------------------------------------------
// Real Pokemon card images on fronts; no generic logos on backs
const MEM_POKEMON = [
  { name: 'Charizard', id: 6 },
  { name: 'Pikachu',   id: 25 },
  { name: 'Mewtwo',    id: 150 },
  { name: 'Eevee',     id: 133 },
  { name: 'Lugia',     id: 249 },
  { name: 'Gengar',    id: 94 },
  { name: 'Rayquaza',  id: 384 },
  { name: 'Giratina',  id: 487 },
  { name: 'Blastoise', id: 9 },
  { name: 'Venusaur',  id: 3 },
  { name: 'Entei',     id: 244 },
  { name: 'Raikou',    id: 243 },
  { name: 'Mew',       id: 151 },
  { name: 'Umbreon',   id: 197 },
  { name: 'Espeon',    id: 196 },
  { name: 'Reshiram',  id: 643 }
];
// Reliable sprite CDN (raw GitHub, CORS-open). Full set only uses 8 for the 4x4 board.
const MEM_CARDS = MEM_POKEMON.map(function(p){
  return {
    name: p.name,
    img: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/' + p.id + '.png',
    fallback: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/' + p.id + '.png'
  };
});
let memFlipped=[], memMatched=[], memMoves=0, memPairs=0, memSeconds=0, memLocked=false, memTimer=null, shuffled=[];

// Global: cleanup handler for the currently-running game. Called before switching games.
window._activeGameCleanup = null;

// Generic touch-button key simulator. Binds pointer events to .touch-btn[data-key].
// Repeatedly sets a key state while pressed so games polling `keys` object keep moving.
function bindTouchControls(containerId) {
  var cont = document.getElementById(containerId);
  if (!cont) return function(){};
  var btns = cont.querySelectorAll('.touch-btn');
  var listeners = [];
  function fireKey(type, key) {
    var ev = new KeyboardEvent(type, { key: key, bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
  }
  btns.forEach(function(btn) {
    var key = btn.getAttribute('data-key');
    if (!key) return;
    var repeat = null;
    function down(e) {
      e.preventDefault();
      btn.classList.add('pressed');
      fireKey('keydown', key);
      // For held movement, re-dispatch keydown every 80ms so game state polling stays active
      if (repeat) clearInterval(repeat);
      repeat = setInterval(function(){ fireKey('keydown', key); }, 80);
    }
    function up(e) {
      if (e) e.preventDefault();
      btn.classList.remove('pressed');
      fireKey('keyup', key);
      if (repeat) { clearInterval(repeat); repeat = null; }
    }
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('touchstart', function(e){ e.preventDefault(); }, { passive: false });
    listeners.push(function(){
      btn.removeEventListener('pointerdown', down);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointercancel', up);
      btn.removeEventListener('pointerleave', up);
      if (repeat) { clearInterval(repeat); repeat = null; }
      btn.classList.remove('pressed');
    });
  });
  return function cleanup() { listeners.forEach(function(fn){ try { fn(); } catch(e){} }); };
}

function loadGame(name) {
  // Run previous game's cleanup (removes key listeners + RAFs) before switching
  try { if (window._activeGameCleanup) window._activeGameCleanup(); } catch(e){}
  window._activeGameCleanup = null;

  // Hide all game containers + deactivate their touch overlays
  var wraps = ['game-memory','pacman-wrap','invaders-wrap','megaman-wrap'];
  wraps.forEach(function(id){ var el=document.getElementById(id); if(el) el.style.display='none'; });
  var touches = ['pacman-touch','invaders-touch','megaman-touch'];
  touches.forEach(function(id){ var el=document.getElementById(id); if(el) el.classList.remove('active'); });

  // Show selected game + activate its touch controls
  if (name === 'memory') {
    document.getElementById('game-memory').style.display = 'block';
    initGame();
  } else if (name === 'pacman') {
    document.getElementById('pacman-wrap').style.display = 'block';
    var t = document.getElementById('pacman-touch'); if (t) t.classList.add('active');
    runPacMan();
  } else if (name === 'invaders') {
    document.getElementById('invaders-wrap').style.display = 'block';
    var t2 = document.getElementById('invaders-touch'); if (t2) t2.classList.add('active');
    runInvaders();
  } else if (name === 'megaman') {
    document.getElementById('megaman-wrap').style.display = 'block';
    var t3 = document.getElementById('megaman-touch'); if (t3) t3.classList.add('active');
    runMegaMan();
  }
}

function initGame() {
  var grid = document.getElementById('memory-grid');
  memFlipped=[]; memMatched=[]; memMoves=0; memPairs=0; memSeconds=0; memLocked=false;
  clearInterval(memTimer);
  document.getElementById('game-moves').textContent = '0';
  document.getElementById('game-pairs').textContent = '0/8';
  document.getElementById('game-time').textContent = '0:00';
  document.getElementById('game-combo').textContent = '';
  shuffled = [...MEM_CARDS, ...MEM_CARDS];
  for (var i=shuffled.length-1; i>0; i--) {
    var j = Math.floor(Math.random()*(i+1));
    var tmp=shuffled[i]; shuffled[i]=shuffled[j]; shuffled[j]=tmp;
  }
  grid.innerHTML = shuffled.map(function(p,i){
    return '<div class="mem-card" data-name="'+p.name+'" onclick="flipCard(this,'+i+')">'+
      '<div class="mem-card-inner">'+
        '<div class="mem-card-front"></div>'+
        '<div class="mem-card-back">'+
          '<img src="'+p.img+'" alt="'+p.name+'" data-fallback="'+(p.fallback||'')+'" loading="eager" onerror="memImgError(this)">'+
          '<div class="mem-name">'+p.name+'</div>'+
        '</div>'+
      '</div></div>';
  }).join('');
  MEM_CARDS.forEach(function(mc){ var im=new Image(); im.src=mc.img; });
  memTimer = setInterval(function(){
    memSeconds++;
    var m = Math.floor(memSeconds/60), s = memSeconds%60;
    document.getElementById('game-time').textContent = m+':'+(s<10?'0':'')+s;
  }, 1000);
}

function memImgError(img) {
  if (img.dataset.fallback && img.src !== img.dataset.fallback) {
    img.src = img.dataset.fallback;
    img.dataset.fallback = '';
    return;
  }
  var parent = img.parentNode;
  var label = document.createElement('div');
  label.style.cssText = 'color:#ffd700;font-size:14px;font-weight:700;text-align:center;padding:4px';
  label.textContent = img.alt || '?';
  parent.replaceChild(label, img);
}

function flipCard(card, idx) {
  if (memLocked || card.classList.contains('flipped') || card.classList.contains('matched')) return;
  card.classList.add('flipped');
  memFlipped.push({card:card, idx:idx});
  if (memFlipped.length === 2) {
    memMoves++;
    document.getElementById('game-moves').textContent = memMoves;
    var a = memFlipped[0], b = memFlipped[1];
    if (a.card.getAttribute('data-name') === b.card.getAttribute('data-name')) {
      a.card.classList.add('matched'); b.card.classList.add('matched');
      memMatched.push(a.idx, b.idx); memPairs++;
      document.getElementById('game-pairs').textContent = memPairs+'/8';
      memFlipped = [];
      var msgs = ['Nice!','Great!','Awesome!','Incredible!','Perfect!'];
      document.getElementById('game-combo').textContent = msgs[Math.min(memPairs-1, msgs.length-1)];
      if (memPairs === 8) {
        clearInterval(memTimer);
        var mm = Math.floor(memSeconds/60), ss = memSeconds%60;
        var winTime = mm+':'+(ss<10?'0':'')+ss;
        document.getElementById('game-combo').textContent = 'YOU WIN! '+memMoves+' moves in '+winTime;
        var winEl = document.getElementById('memory-win-overlay');
        var wsm = document.getElementById('win-stat-moves');
        var wst = document.getElementById('win-stat-time');
        if (wsm) wsm.textContent = memMoves+' moves';
        if (wst) wst.textContent = winTime;
        if (winEl) setTimeout(function(){ winEl.classList.add('show'); }, 400);
      }
    } else {
      memLocked = true;
      setTimeout(function(){
        a.card.classList.remove('flipped');
        b.card.classList.remove('flipped');
        memFlipped = []; memLocked = false;
      }, 700);
    }
  }
}

function dismissWinAndRestart() {
  var winEl = document.getElementById('memory-win-overlay');
  if (winEl) winEl.classList.remove('show');
  initGame();
}

// PAC-MAN ------------------------------------------------
function runPacMan() {
  var canvas = document.getElementById('pacman-c');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var CELL = 20, COLS = 28, ROWS = 31;

  // Classic 28x31 Pac-Man maze (all rows same length!)
  var MAP0 = [
    '############################',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#o####.#####.##.#####.####o#',
    '#.####.#####.##.#####.####.#',
    '#..........................#',
    '#.####.##.########.##.####.#',
    '#.####.##.########.##.####.#',
    '#......##....##....##......#',
    '######.#####.##.#####.######',
    '######.#####.##.#####.######',
    '######.##..........##.######',
    '######.##.###--###.##.######',
    '######.##.#      #.##.######',
    '      ....#      #....      ',
    '######.##.#      #.##.######',
    '######.##.########.##.######',
    '######.##..........##.######',
    '######.##.########.##.######',
    '######.##.########.##.######',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#.####.#####.##.#####.####.#',
    '#o..##................##..o#',
    '###.##.##.########.##.##.###',
    '###.##.##.########.##.##.###',
    '#......##....##....##......#',
    '#.##########.##.##########.#',
    '#.##########.##.##########.#',
    '#..........................#',
    '############################'
  ];
  var map = MAP0.slice();

  var pellets=[], powerPellets=[], totalPellets=0;
  function buildPellets(){
    pellets=[]; powerPellets=[]; totalPellets=0;
    for (var r=0; r<ROWS; r++) {
      for (var c=0; c<COLS; c++) {
        var ch = (map[r]||'')[c]||' ';
        if (ch === '.') { pellets.push({r:r,c:c}); totalPellets++; }
        if (ch === 'o') { powerPellets.push({r:r,c:c}); totalPellets++; }
      }
    }
  }
  buildPellets();

  // Pixel positions for smooth motion
  var pac = {px:14*CELL, py:23*CELL, dir:3, nextDir:3, speed:2.2, mouth:0};
  var ghosts = [
    {px:13*CELL,py:11*CELL,dir:0,speed:1.9,color:'#ff1493',scared:false,respawn:true, home:{r:11,c:13}},
    {px:14*CELL,py:11*CELL,dir:0,speed:1.85,color:'#00ffff',scared:false,respawn:true, home:{r:11,c:14}},
    {px:15*CELL,py:11*CELL,dir:0,speed:1.95,color:'#ffa500',scared:false,respawn:true, home:{r:11,c:15}},
    {px:14*CELL,py:10*CELL,dir:0,speed:1.75,color:'#ff4500',scared:false,respawn:true, home:{r:10,c:14}}
  ];
  var score=0, lives=3, level=1, frame=0, gameOver=false, win=false;
  var invincible=0, powered=0;
  var KEYDIR = {ArrowUp:0,ArrowRight:1,ArrowDown:2,ArrowLeft:3,w:0,W:0,d:1,D:1,s:2,S:2,a:3,A:3};
  var DX=[0,1,0,-1], DY=[-1,0,1,0];
  var DIRANGLE=[-Math.PI/2,0,Math.PI/2,Math.PI];

  function cellAt(r,c){ if (r<0||r>=ROWS||c<0||c>=COLS) return ' '; return (map[r]||'')[c] || ' '; }
  function isWall(r,c){ var ch=cellAt(r,c); return ch==='#' || ch==='-'; }
  function canGoCell(r,c){ return !isWall(r,c); }

  function doInput(dir) { pac.nextDir = dir; }

  function onKey(e) {
    if (KEYDIR[e.key] !== undefined) { pac.nextDir=KEYDIR[e.key]; e.preventDefault(); }
    if ((e.key===' '||e.key==='Enter') && (gameOver||win)) resetAll();
  }
  document.addEventListener('keydown', onKey);

  function resetAll() {
    map = MAP0.slice();
    buildPellets();
    pac = {px:14*CELL, py:23*CELL, dir:3, nextDir:3, speed:2.2, mouth:0};
    ghosts.forEach(function(g,i){
      g.px = g.home.c*CELL; g.py = g.home.r*CELL;
      g.dir = 0; g.scared=false; g.respawn=false; g.speed=1.85;
    });
    invincible=0; powered=0; score=0; lives=3; level=1; frame=0; gameOver=false; win=false;
  }

  function aligned(e){
    // Is this entity on a cell boundary (tolerance 1.5px)?
    var ox = e.px % CELL, oy = e.py % CELL;
    return (ox < 1.5 || ox > CELL-1.5) && (oy < 1.5 || oy > CELL-1.5);
  }
  function snapCell(e){ e.px = Math.round(e.px/CELL)*CELL; e.py = Math.round(e.py/CELL)*CELL; }

  function tryMove(e, dir, speed){
    // Look at cell we're about to enter
    var cx = Math.round(e.px/CELL), cy = Math.round(e.py/CELL);
    var nr = cy+DY[dir], nc = cx+DX[dir];
    if (isWall(nr, nc)) return false;
    e.px += DX[dir]*speed; e.py += DY[dir]*speed;
    // Tunnel wrap
    if (e.py > (ROWS-1)*CELL+1) e.py = 0;
    if (e.py < -1) e.py = (ROWS-1)*CELL;
    if (e.px > (COLS)*CELL) e.px = -CELL;
    if (e.px < -CELL) e.px = COLS*CELL;
    return true;
  }

  function movePac() {
    // Try turn toward nextDir whenever aligned to cell
    if (aligned(pac)) {
      snapCell(pac);
      var cx = Math.round(pac.px/CELL), cy = Math.round(pac.py/CELL);
      if (!isWall(cy+DY[pac.nextDir], cx+DX[pac.nextDir])) {
        pac.dir = pac.nextDir;
      }
      // Eat pellet at current cell
      for (var i=pellets.length-1;i>=0;i--){
        if (pellets[i].r===cy && pellets[i].c===cx){
          pellets.splice(i,1); score+=10;
        }
      }
      for (var i=powerPellets.length-1;i>=0;i--){
        if (powerPellets[i].r===cy && powerPellets[i].c===cx){
          powerPellets.splice(i,1); score+=50; powered=360;
          ghosts.forEach(function(g){ if(!g.respawn){ g.scared=true; g.dir=(g.dir+2)%4; } });
        }
      }
      if (pellets.length===0 && powerPellets.length===0){
        level++; if (level>3){ win=true; } else { map=MAP0.slice(); buildPellets(); pac.px=14*CELL; pac.py=23*CELL; }
      }
    }
    if (!tryMove(pac, pac.dir, pac.speed)) { snapCell(pac); }
    pac.mouth = (pac.mouth + 0.25) % (Math.PI*2);
  }

  function moveGhost(g) {
    var speed = g.scared ? 1.0 : (g.respawn ? 2.2 : 1.85 + level*0.1);
    if (aligned(g)) {
      snapCell(g);
      var cx = Math.round(g.px/CELL), cy = Math.round(g.py/CELL);
      if (g.respawn) {
        if (cy >= 11 && Math.abs(cx-13.5)<2) { g.respawn=false; g.dir=0; }
      }
      var dirs=[];
      for (var d=0;d<4;d++){
        if (d===(g.dir+2)%4) continue;
        if (!isWall(cy+DY[d], cx+DX[d])) dirs.push(d);
      }
      if (dirs.length===0) { g.dir = (g.dir+2)%4; }
      else if (!g.respawn && !g.scared) {
        // Only chase pac when not respawning or scared
        var pcx = Math.round(pac.px/CELL), pcy = Math.round(pac.py/CELL);
        var best = Infinity, bd = dirs[0];
        dirs.forEach(function(d){
          var nr=cy+DY[d], nc=cx+DX[d];
          var dist = (nr-pcy)*(nr-pcy)+(nc-pcx)*(nc-pcx);
          if (dist<best) { best=dist; bd=d; }
        });
        if (Math.random()<0.08 && dirs.length>1) bd = dirs[Math.floor(Math.random()*dirs.length)];
        g.dir = bd;
      } else {
        // Random direction when respawning or scared
        g.dir = dirs[Math.floor(Math.random()*dirs.length)];
      }
    }
    tryMove(g, g.dir, speed);
    // Collision
    var dx = g.px-pac.px, dy = g.py-pac.py;
    if (dx*dx+dy*dy < CELL*CELL*0.6 && !invincible) {
      if (g.scared) {
        score+=200; g.respawn=true; g.scared=false;
        g.px = 13.5*CELL; g.py = 11*CELL;
      } else {
        lives--;
        if (lives<=0) gameOver=true;
        else { invincible=120; pac.px=14*CELL; pac.py=23*CELL; pac.dir=3; }
      }
    }
  }

  function drawMaze() {
    // Gradient background for depth
    var g = ctx.createRadialGradient(W/2, H/2, 50, W/2, H/2, W);
    g.addColorStop(0, '#000814'); g.addColorStop(1, '#000000');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
    // Walls with glow
    for (var r=0;r<ROWS;r++){
      for (var c=0;c<COLS;c++){
        var ch = cellAt(r,c);
        if (ch==='#') {
          // Inner + outer stroke glow
          ctx.fillStyle = '#1a1aff';
          ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
          ctx.fillStyle = '#4444ff';
          ctx.fillRect(c*CELL+2, r*CELL+2, CELL-4, CELL-4);
        } else if (ch==='-') {
          ctx.fillStyle='#ff80ff';
          ctx.fillRect(c*CELL, r*CELL+CELL/2-1, CELL, 2);
        }
      }
    }
    // Pellets
    ctx.fillStyle='#ffcc88';
    pellets.forEach(function(p){ ctx.fillRect(p.c*CELL+CELL/2-1, p.r*CELL+CELL/2-1, 2, 2); });
    // Power pellets
    var pulse = 3 + Math.sin(Date.now()/180)*2;
    powerPellets.forEach(function(p){
      ctx.fillStyle = powered>0 ? '#ffffff' : '#ffaa33';
      ctx.beginPath(); ctx.arc(p.c*CELL+CELL/2, p.r*CELL+CELL/2, pulse, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,200,100,0.3)';
      ctx.beginPath(); ctx.arc(p.c*CELL+CELL/2, p.r*CELL+CELL/2, pulse+3, 0, Math.PI*2); ctx.fill();
    });
  }

  function drawPac() {
    var x = pac.px + CELL/2, y = pac.py + CELL/2;
    var m = 0.05 + 0.35*Math.abs(Math.sin(pac.mouth));
    if (invincible>0 && frame%6<3) return;
    // Glow
    var gg = ctx.createRadialGradient(x,y,0,x,y,CELL);
    gg.addColorStop(0,'rgba(255,255,0,0.4)'); gg.addColorStop(1,'rgba(255,255,0,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x,y,CELL,0,Math.PI*2); ctx.fill();
    // Body
    ctx.fillStyle = '#ffee00';
    ctx.beginPath();
    ctx.arc(x, y, CELL/2-1, DIRANGLE[pac.dir]+Math.PI*m, DIRANGLE[pac.dir]-Math.PI*m);
    ctx.lineTo(x,y); ctx.fill();
    // Eye
    var ex = x + DX[pac.dir]*2 - DY[pac.dir]*3;
    var ey = y + DY[pac.dir]*2 + DX[pac.dir]*3;
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex, ey, 1.5, 0, Math.PI*2); ctx.fill();
  }

  function drawGhost(g) {
    var x = g.px + CELL/2, y = g.py + CELL/2;
    var body = g.scared ? (powered<60 && frame%10<5 ? '#ffffff' : '#2030ff') : g.color;
    if (g.respawn) body = 'rgba(200,200,200,0.4)';
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(x, y+CELL/2-1, CELL/2-2, 2, 0, 0, Math.PI*2); ctx.fill();
    // Body
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y-1, CELL/2-1, Math.PI, 0); // dome
    ctx.lineTo(x+CELL/2-1, y+CELL/2-2);
    // Wavy bottom
    var waves = 4, wy = y+CELL/2-2;
    for (var i=0;i<waves;i++){
      var wx = x+CELL/2-1 - (CELL-2)*(i+0.5)/waves;
      ctx.lineTo(wx, wy + (i%2===0 ? 3 : -1));
    }
    ctx.lineTo(x-CELL/2+1, y+CELL/2-2);
    ctx.closePath(); ctx.fill();
    // Eyes
    var ex1=x-4, ex2=x+4, ey=y-2;
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(ex1,ey,3,0,Math.PI*2); ctx.arc(ex2,ey,3,0,Math.PI*2); ctx.fill();
    if (!g.scared) {
      ctx.fillStyle='#0020aa';
      ctx.beginPath(); ctx.arc(ex1+DX[g.dir],ey+DY[g.dir],1.5,0,Math.PI*2); ctx.arc(ex2+DX[g.dir],ey+DY[g.dir],1.5,0,Math.PI*2); ctx.fill();
    } else {
      ctx.fillStyle='#fff';
      ctx.fillRect(ex1-1,ey-1,2,2); ctx.fillRect(ex2-1,ey-1,2,2);
    }
  }

  function drawHUD() {
    ctx.fillStyle='#fff'; ctx.font='bold 14px monospace';
    ctx.fillText('SCORE '+score, 6, 14);
    ctx.fillText('LEVEL '+level, W/2-28, 14);
    ctx.fillText('LIVES '+lives, W-76, 14);
    if (powered>0) { ctx.fillStyle='#ff80ff'; ctx.fillText('POWER!', W/2-22, H-6); }
    if (gameOver || win) {
      ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';
      ctx.fillStyle = win ? '#00ff88' : '#ff3344'; ctx.font='bold 42px monospace';
      ctx.fillText(win?'VICTORY!':'GAME OVER', W/2, H/2-30);
      ctx.fillStyle='#fff'; ctx.font='20px monospace';
      ctx.fillText('Score: '+score, W/2, H/2+10);
      ctx.fillStyle='#aaa'; ctx.font='14px monospace';
      ctx.fillText('Press SPACE or tap to restart', W/2, H/2+40);
      ctx.textAlign='left';
    }
  }

  function step() {
    frame++;
    if (!gameOver && !win) {
      movePac();
      ghosts.forEach(moveGhost);
      if (invincible>0) invincible--;
      if (powered>0) { powered--; if (powered===0) ghosts.forEach(function(g){ g.scared=false; }); }
    }
    drawMaze();
    ghosts.forEach(drawGhost);
    drawPac();
    drawHUD();
  }

  // Touch controls — direct callbacks (no synthetic keys)
  var touchCleanup = bindGameTouch('pacman-touch', {
    up:    function(on){ if (on) pac.nextDir = 0; },
    down:  function(on){ if (on) pac.nextDir = 2; },
    left:  function(on){ if (on) pac.nextDir = 3; },
    right: function(on){ if (on) pac.nextDir = 1; },
    fire:  function(on){ if (on && (gameOver||win)) resetAll(); }
  });

  // Canvas swipe/tap: swipe to change dir, tap to restart on game over
  var startX=0, startY=0, startT=0;
  function onPointerDown(e){
    var t = e.touches ? e.touches[0] : e;
    var rect = canvas.getBoundingClientRect();
    startX = (t.clientX-rect.left)*(canvas.width/rect.width);
    startY = (t.clientY-rect.top)*(canvas.height/rect.height);
    startT = Date.now();
    if (gameOver||win) resetAll();
    e.preventDefault();
  }
  function onPointerUp(e){
    var t = e.changedTouches ? e.changedTouches[0] : e;
    var rect = canvas.getBoundingClientRect();
    var ex = (t.clientX-rect.left)*(canvas.width/rect.width);
    var ey = (t.clientY-rect.top)*(canvas.height/rect.height);
    var dx = ex-startX, dy = ey-startY;
    if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return; // tap
    if (Math.abs(dx) > Math.abs(dy)) pac.nextDir = dx>0 ? 1 : 3;
    else pac.nextDir = dy>0 ? 2 : 0;
    e.preventDefault();
  }
  canvas.addEventListener('touchstart', onPointerDown, {passive:false});
  canvas.addEventListener('touchend',   onPointerUp,   {passive:false});
  canvas.addEventListener('mousedown',  onPointerDown);
  canvas.addEventListener('mouseup',    onPointerUp);

  var raf;
  window._activeGameCleanup = function(){
    try { if (raf) cancelAnimationFrame(raf); } catch(e){}
    try { document.removeEventListener('keydown', onKey); } catch(e){}
    try { touchCleanup(); } catch(e){}
    try { canvas.removeEventListener('touchstart', onPointerDown); } catch(e){}
    try { canvas.removeEventListener('touchend', onPointerUp); } catch(e){}
    try { canvas.removeEventListener('mousedown', onPointerDown); } catch(e){}
    try { canvas.removeEventListener('mouseup', onPointerUp); } catch(e){}
  };

  function loop(){ step(); raf = requestAnimationFrame(loop); }
  loop();
}

function runInvaders() {
  var canvas = document.getElementById('invaders-c');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;

  var PX = W/2, PY = H - 70;
  var lives = 3, score = 0, wave = 1, frame = 0;
  var enemies = [], bullets = [], eBullets = [], particles = [];
  var gameOver = false, win = false;
  var lastShot = 0;
  var keys = { left: false, right: false, fire: false };
  var touchTargetX = null;

  function spawnWave() {
    enemies = [];
    var rows = Math.min(2 + Math.floor(wave/2) + 1, 5);
    var perRow = Math.min(6 + wave, 10);
    var startX = (W - (perRow-1)*55) / 2;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < perRow; c++) {
        var type = r === 0 ? 'squid' : (r < 2 ? 'crab' : 'octopus');
        var color = type === 'squid' ? '#ff66ff' : type === 'crab' ? '#66ffff' : '#66ff66';
        enemies.push({
          x: startX + c*55, y: 70 + r*45,
          w: 32, h: 22, alive: true, type: type, color: color,
          dir: 1, anim: 0, baseY: 70 + r*45,
          points: type === 'squid' ? 30 : type === 'crab' ? 20 : 10
        });
      }
    }
  }
  spawnWave();

  function burst(x, y, color) {
    for (var i = 0; i < 14; i++) {
      var a = Math.random()*Math.PI*2, s = 1 + Math.random()*5;
      particles.push({
        x: x, y: y, vx: Math.cos(a)*s, vy: Math.sin(a)*s - 1,
        life: 1, color: color, size: 2 + Math.random()*3
      });
    }
  }

  function fire() {
    if (frame - lastShot < 10 || gameOver || win) return;
    bullets.push({ x: PX, y: PY - 16 });
    lastShot = frame;
  }

  // --- Input ---
  function onKey(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keys.left = true; e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keys.right = true; e.preventDefault(); }
    if (e.key === ' ' || e.key === 'z' || e.key === 'Z') { keys.fire = true; fire(); e.preventDefault(); }
    if ((e.key === 'Enter' || e.key === ' ') && (gameOver || win)) { reset(); }
  }
  function offKey(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
    if (e.key === ' ' || e.key === 'z' || e.key === 'Z') keys.fire = false;
  }
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', offKey);

  // Canvas drag-to-move + tap-to-fire (works reliably on iOS and Android)
  function pointerFromEvent(e) {
    var rect = canvas.getBoundingClientRect();
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (W / rect.width),
      y: (clientY - rect.top) * (H / rect.height)
    };
  }
  var touchStartTime = 0, touchStartX = 0;
  function canvasTouchStart(e) {
    e.preventDefault();
    if (gameOver || win) { reset(); return; }
    var p = pointerFromEvent(e);
    touchTargetX = p.x;
    touchStartTime = Date.now();
    touchStartX = p.x;
  }
  function canvasTouchMove(e) {
    e.preventDefault();
    var p = pointerFromEvent(e);
    touchTargetX = p.x;
  }
  function canvasTouchEnd(e) {
    e.preventDefault();
    var dt = Date.now() - touchStartTime;
    // Short tap without much movement = fire
    if (dt < 250 && Math.abs((touchTargetX||0) - touchStartX) < 20) fire();
    touchTargetX = null;
  }
  canvas.addEventListener('touchstart', canvasTouchStart, { passive: false });
  canvas.addEventListener('touchmove', canvasTouchMove, { passive: false });
  canvas.addEventListener('touchend', canvasTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', canvasTouchEnd, { passive: false });
  // Mouse fallback for testing on desktop
  canvas.addEventListener('mousedown', function(e) { canvasTouchStart(e); });
  canvas.addEventListener('mousemove', function(e) { if (touchTargetX !== null) canvasTouchMove(e); });
  canvas.addEventListener('mouseup', canvasTouchEnd);

  // External touch button controls (FIRE + left/right)
  var touchCleanup = bindGameTouch('invaders-touch', {
    left:  function(down) { keys.left = down; },
    right: function(down) { keys.right = down; },
    fire:  function(down) { keys.fire = down; if (down) fire(); }
  });

  function reset() {
    PX = W/2; PY = H - 70; lives = 3; score = 0; wave = 1; frame = 0;
    bullets = []; eBullets = []; particles = [];
    gameOver = false; win = false;
    spawnWave();
  }

  if (window._invadersRaf) { cancelAnimationFrame(window._invadersRaf); window._invadersRaf = null; }

  window._activeGameCleanup = function() {
    if (window._invadersRaf) { cancelAnimationFrame(window._invadersRaf); window._invadersRaf = null; }
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup', offKey);
    canvas.removeEventListener('touchstart', canvasTouchStart);
    canvas.removeEventListener('touchmove', canvasTouchMove);
    canvas.removeEventListener('touchend', canvasTouchEnd);
    canvas.removeEventListener('touchcancel', canvasTouchEnd);
    try { touchCleanup(); } catch(e){}
  };

  function update() {
    if (gameOver || win) return;
    frame++;

    // Player movement
    var moveSpeed = 5.5;
    if (keys.left) PX = Math.max(22, PX - moveSpeed);
    if (keys.right) PX = Math.min(W - 22, PX + moveSpeed);
    if (touchTargetX !== null) {
      var diff = touchTargetX - PX;
      PX += Math.max(-8, Math.min(8, diff * 0.35));
      PX = Math.max(22, Math.min(W - 22, PX));
    }
    if (keys.fire && frame - lastShot > 12) fire();

    // Player bullets
    for (var i = bullets.length - 1; i >= 0; i--) {
      bullets[i].y -= 11;
      if (bullets[i].y < 0) bullets.splice(i, 1);
    }
    // Enemy bullets
    for (var i = eBullets.length - 1; i >= 0; i--) {
      eBullets[i].y += 5.5;
      if (eBullets[i].y > H) eBullets.splice(i, 1);
    }

    // Enemy movement
    var hitEdge = false;
    var speed = 1.1 + wave * 0.25;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e.alive) continue;
      e.x += speed * e.dir;
      e.anim = Math.floor(frame / 15) % 2;
      if (e.x < 20 || e.x > W - 20) hitEdge = true;
      e.y = e.baseY + Math.sin(frame*0.04 + i*0.3) * 4;
    }
    if (hitEdge) {
      for (var i = 0; i < enemies.length; i++) {
        if (!enemies[i].alive) continue;
        enemies[i].dir *= -1;
        enemies[i].baseY += 16;
      }
    }

    // Enemy fire
    var aliveEnemies = enemies.filter(function(e){ return e.alive; });
    if (aliveEnemies.length && Math.random() < 0.018 + wave*0.004) {
      var shooter = aliveEnemies[Math.floor(Math.random()*aliveEnemies.length)];
      eBullets.push({ x: shooter.x, y: shooter.y + shooter.h/2 });
    }

    // Bullet-enemy collisions
    for (var bi = bullets.length - 1; bi >= 0; bi--) {
      var b = bullets[bi];
      for (var ei = 0; ei < enemies.length; ei++) {
        var e = enemies[ei];
        if (!e.alive) continue;
        if (Math.abs(b.x - e.x) < e.w/2 + 4 && Math.abs(b.y - e.y) < e.h/2 + 8) {
          e.alive = false;
          bullets.splice(bi, 1);
          score += e.points;
          burst(e.x, e.y, e.color);
          break;
        }
      }
    }

    // Enemy bullet hits player
    for (var i = eBullets.length - 1; i >= 0; i--) {
      var eb = eBullets[i];
      if (Math.abs(eb.x - PX) < 16 && Math.abs(eb.y - PY) < 16) {
        eBullets.splice(i, 1);
        lives--;
        burst(PX, PY, '#00ccff');
        if (lives <= 0) gameOver = true;
        else PX = W/2;
        break;
      }
    }

    // Enemy reaches bottom = instant loss
    for (var i = 0; i < enemies.length; i++) {
      if (enemies[i].alive && enemies[i].baseY > PY - 30) {
        gameOver = true;
        break;
      }
    }

    // Wave clear
    if (enemies.every(function(e){ return !e.alive; })) {
      wave++;
      bullets = []; eBullets = [];
      spawnWave();
    }

    // Particles
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.15;
      p.life -= 0.025;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawEnemy(e) {
    ctx.fillStyle = e.color;
    if (e.type === 'crab') {
      // 5-row pixel crab, toggles anim frame
      var px = e.x - e.w/2, py = e.y - e.h/2;
      var pattern = e.anim === 0
        ? [[0,0,1,0,0,0,0,1,0,0],[0,0,0,1,0,0,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,0,1,1,0,1,1,0],[1,1,1,1,1,1,1,1,1,1],[1,0,1,0,0,0,0,1,0,1],[0,0,0,1,1,0,1,1,0,0]]
        : [[0,0,1,0,0,0,0,1,0,0],[1,0,0,1,0,0,1,0,0,1],[1,0,1,1,1,1,1,1,0,1],[1,1,1,0,1,1,0,1,1,1],[1,1,1,1,1,1,1,1,1,1],[0,1,1,0,0,0,0,1,1,0],[0,0,1,0,0,0,0,1,0,0]];
      var sx = e.w/10, sy = e.h/7;
      for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < 10; rx++)
        if (pattern[ry][rx]) ctx.fillRect(px + rx*sx, py + ry*sy, sx+0.5, sy+0.5);
    } else if (e.type === 'squid') {
      var px = e.x - e.w/2, py = e.y - e.h/2;
      var pattern = e.anim === 0
        ? [[0,0,0,1,1,1,1,0,0,0],[0,1,1,1,1,1,1,1,1,0],[1,1,0,1,1,1,1,0,1,1],[1,1,1,1,1,1,1,1,1,1],[0,0,1,1,0,0,1,1,0,0],[0,1,1,0,1,1,0,1,1,0]]
        : [[0,0,0,1,1,1,1,0,0,0],[0,1,1,1,1,1,1,1,1,0],[1,1,0,1,1,1,1,0,1,1],[1,1,1,1,1,1,1,1,1,1],[0,1,0,1,1,1,1,0,1,0],[1,0,1,0,0,0,0,1,0,1]];
      var sx = e.w/10, sy = e.h/6;
      for (var ry = 0; ry < 6; ry++) for (var rx = 0; rx < 10; rx++)
        if (pattern[ry][rx]) ctx.fillRect(px + rx*sx, py + ry*sy, sx+0.5, sy+0.5);
    } else {
      // octopus
      var px = e.x - e.w/2, py = e.y - e.h/2;
      var pattern = e.anim === 0
        ? [[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[1,1,1,0,1,1,0,1,1,1],[1,1,1,1,1,1,1,1,1,1],[0,0,1,1,0,0,1,1,0,0],[0,1,1,0,0,0,0,1,1,0]]
        : [[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[1,1,1,0,1,1,0,1,1,1],[1,1,1,1,1,1,1,1,1,1],[0,1,0,1,1,1,1,0,1,0],[0,0,1,0,0,0,0,1,0,0]];
      var sx = e.w/10, sy = e.h/6;
      for (var ry = 0; ry < 6; ry++) for (var rx = 0; rx < 10; rx++)
        if (pattern[ry][rx]) ctx.fillRect(px + rx*sx, py + ry*sy, sx+0.5, sy+0.5);
    }
  }

  function draw() {
    // Starfield background
    ctx.fillStyle = '#000020'; ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < 70; i++) {
      var sx = (i*97) % W;
      var sy = (i*53 + frame*0.5) % H;
      var b = 0.3 + 0.7*Math.abs(Math.sin(i + frame*0.03));
      ctx.fillStyle = 'rgba(255,255,255,' + b + ')';
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Enemies
    enemies.forEach(function(e){ if (e.alive) drawEnemy(e); });

    // Player bullets
    ctx.fillStyle = '#ffff44';
    bullets.forEach(function(b){ ctx.fillRect(b.x - 2, b.y - 10, 4, 14); });

    // Enemy bullets (zigzag rendering)
    ctx.fillStyle = '#ff5555';
    eBullets.forEach(function(b){
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 6);
      ctx.lineTo(b.x + 4, b.y);
      ctx.lineTo(b.x, b.y + 6);
      ctx.lineTo(b.x - 4, b.y);
      ctx.closePath(); ctx.fill();
    });

    // Player ship
    ctx.fillStyle = '#00ddff';
    ctx.beginPath();
    ctx.moveTo(PX, PY - 14);
    ctx.lineTo(PX - 16, PY + 12);
    ctx.lineTo(PX + 16, PY + 12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0099cc';
    ctx.fillRect(PX - 8, PY + 2, 16, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(PX - 1, PY - 10, 2, 6);

    // Particles
    particles.forEach(function(p){
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    });
    ctx.globalAlpha = 1;

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, W, 34);
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00ff44'; ctx.fillText('SCORE ' + score, 10, 22);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffff44'; ctx.fillText('WAVE ' + wave, W/2, 22);
    ctx.textAlign = 'right'; ctx.fillStyle = '#ff4444'; ctx.fillText('LIVES ' + lives, W - 10, 22);

    if (gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ff2222'; ctx.font = 'bold 44px monospace';
      ctx.textAlign = 'center'; ctx.fillText('GAME OVER', W/2, H/2 - 20);
      ctx.fillStyle = '#fff'; ctx.font = '20px monospace';
      ctx.fillText('Score: ' + score + '  Wave: ' + wave, W/2, H/2 + 20);
      ctx.fillStyle = '#aaa'; ctx.font = '14px monospace';
      ctx.fillText('Tap or press Enter to restart', W/2, H/2 + 55);
    }
  }

  function loop() {
    update();
    draw();
    window._invadersRaf = requestAnimationFrame(loop);
  }
  loop();
}

// ============================================================
// MEGA MAN - Side-scrolling platformer mini-game
// Touch: on-screen buttons (left/right/jump/fire/slide) +
//        canvas taps (left half = jump, right half = fire)
// Keyboard: arrows / WASD move, Z or Up jump, X or Space fire (hold = charge),
//           Down slide
// Goal: defeat 3 waves of robot masters, survive the boss in wave 3
// ============================================================
function runMegaMan() {
  var canvas = document.getElementById('megaman-c');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;

  // ---------- Physics constants ----------
  var GROUND_Y = H - 48;
  var GRAVITY = 0.72;
  var MOVE_SPEED = 3.4;
  var JUMP_VEL = -13.2;
  var SLIDE_SPEED = 7.0;

  // ---------- Levels ----------
  // Each level: theme colors, platform layout, enemy schedule, boss
  var LEVELS = [
    { // Level 1 — Industrial
      name: 'CUT FACTORY',
      bg1: '#180028', bg2: '#400060', fg: '#201030',
      platforms: [
        {x:260,y:GROUND_Y-80,w:90,h:12},
        {x:420,y:GROUND_Y-140,w:90,h:12},
        {x:560,y:GROUND_Y-90,w:70,h:12}
      ],
      waves: [
        ['walker','walker','walker','flier'],
        ['walker','flier','turret','walker'],
        ['flier','turret','walker','walker']
      ],
      boss: 'cutman'
    },
    { // Level 2 — Ice
      name: 'ICE CAVERN',
      bg1: '#001830', bg2: '#305080', fg: '#102035',
      platforms: [
        {x:180,y:GROUND_Y-60,w:70,h:12},
        {x:320,y:GROUND_Y-120,w:80,h:12},
        {x:470,y:GROUND_Y-80,w:70,h:12},
        {x:560,y:GROUND_Y-160,w:60,h:12}
      ],
      waves: [
        ['flier','flier','walker','turret'],
        ['jumper','walker','flier','jumper'],
        ['jumper','jumper','flier','turret','walker']
      ],
      boss: 'iceman'
    },
    { // Level 3 — Wily Fortress
      name: 'WILY FORTRESS',
      bg1: '#200010', bg2: '#700018', fg: '#300018',
      platforms: [
        {x:200,y:GROUND_Y-90,w:60,h:12},
        {x:320,y:GROUND_Y-150,w:70,h:12},
        {x:440,y:GROUND_Y-90,w:70,h:12},
        {x:540,y:GROUND_Y-180,w:60,h:12}
      ],
      waves: [
        ['turret','jumper','flier','walker'],
        ['jumper','turret','flier','flier','walker'],
        ['flier','jumper','turret','walker','jumper']
      ],
      boss: 'wily'
    }
  ];

  // ---------- Player ----------
  var player = {
    x: 80, y: GROUND_Y - 40,
    w: 22, h: 34,
    vx: 0, vy: 0,
    onGround: true,
    facing: 1,
    aimUp: false,
    hp: 12, maxHp: 12,
    iframes: 0,
    sliding: false,
    slideTime: 0,
    slideCD: 0,
    charge: 0,
    chargeLevel: 0,
    anim: 0,
    ducking: false
  };

  // ---------- State ----------
  var levelIdx = 0;
  var wave = 0;
  var bullets = [];
  var enemies = [];
  var particles = [];
  var pickups = [];
  var boss = null;
  var platforms = LEVELS[0].platforms;
  var score = 0;
  var gameOver = false, win = false;
  var frame = 0;
  var bannerText = '', bannerTime = 0;
  var cameraX = 0; // scrolling camera — only moves right

  var keys = { left:false, right:false, up:false, jump:false, fire:false, down:false, duck:false };

  function showBanner(t, ms){ bannerText=t; bannerTime = ms||120; }

  // ---------- Spawning ----------
  function spawnWalker(x){
    enemies.push({ type:'walker', x:x, y:GROUND_Y-30, w:26, h:30, vx:-1.3, hp:2, maxHp:2, facing:-1, anim:0, fireCD: 70+Math.random()*60 });
  }
  function spawnFlier(x){
    var y = GROUND_Y - 120 - Math.random()*60;
    enemies.push({ type:'flier', x:x, y:y, w:26, h:22, vx:-2.2, vy:0, baseY:y, phase:Math.random()*6.28, hp:1, maxHp:1, facing:-1, fireCD: 90+Math.random()*40 });
  }
  function spawnTurret(x){
    enemies.push({ type:'turret', x:x, y:GROUND_Y-28, w:30, h:28, vx:0, hp:3, maxHp:3, facing:-1, fireCD: 50+Math.random()*30 });
  }
  function spawnJumper(x){
    enemies.push({ type:'jumper', x:x, y:GROUND_Y-26, w:24, h:26, vx:-1, vy:0, onGround:true, jumpCD:30+Math.random()*40, hp:2, maxHp:2, facing:-1 });
  }
  function spawnByName(name, x){
    if (name==='walker') spawnWalker(x);
    else if (name==='flier') spawnFlier(x);
    else if (name==='turret') spawnTurret(x);
    else if (name==='jumper') spawnJumper(x);
  }
  function spawnBoss(kind){
    if (kind==='cutman') {
      boss = { kind:'cutman', x:W-80, y:GROUND_Y-56, w:36, h:52, vx:-2, vy:0, hp:24, maxHp:24, onGround:true, phase:0, phaseTime:0, facing:-1, jumpCD:60, fireCD:50, color:'#ff2e88' };
    } else if (kind==='iceman') {
      boss = { kind:'iceman', x:W-80, y:GROUND_Y-54, w:34, h:50, vx:-2, vy:0, hp:28, maxHp:28, onGround:true, phase:0, phaseTime:0, facing:-1, jumpCD:80, fireCD:40, color:'#66ddff' };
    } else {
      boss = { kind:'wily', x:W-100, y:GROUND_Y-100, w:72, h:88, vx:-1.5, vy:0, hp:50, maxHp:50, onGround:false, phase:0, phaseTime:0, facing:-1, jumpCD:40, fireCD:30, color:'#ffcc22' };
    }
  }

  function startWave(){
    var L = LEVELS[levelIdx];
    platforms = L.platforms;
    if (wave < L.waves.length) {
      var list = L.waves[wave];
      list.forEach(function(name, i){
        spawnByName(name, cameraX + W + 40 + i*130);
      });
      showBanner('LEVEL '+(levelIdx+1)+' — WAVE '+(wave+1));
    } else {
      // boss
      showBanner('WARNING!  BOSS APPROACHING', 180);
      spawnBoss(L.boss);
    }
  }

  function nextWaveOrLevel(){
    wave++;
    var L = LEVELS[levelIdx];
    if (wave <= L.waves.length) {
      startWave();
    } else {
      // boss handled by boss death
    }
  }

  function advanceLevel(){
    levelIdx++;
    if (levelIdx >= LEVELS.length){ win = true; return; }
    wave = 0; boss = null; enemies = []; bullets = []; pickups = []; particles = [];
    player.x = 80; player.y = GROUND_Y - 40; player.hp = Math.min(player.maxHp, player.hp+4);
    cameraX = 0;
    startWave();
  }

  // ---------- Effects ----------
  function burst(x, y, color, n){
    n = n || 12;
    for (var i=0;i<n;i++){
      var a=Math.random()*6.28, s=1+Math.random()*5;
      particles.push({ x:x, y:y, vx:Math.cos(a)*s, vy:Math.sin(a)*s-1, life:1, color:color, size:1.5+Math.random()*3 });
    }
  }
  function spark(x,y){ burst(x,y,'#ffffaa',8); }

  function fire(){
    if (player.sliding) return;
    var level = player.chargeLevel;
    var speed = 11;
    var colors = ['#ffffff','#00ccff','#ffee33'];
    var sizes  = [5, 9, 14];
    var vx, vy;
    if (player.aimUp) { vx = 0; vy = -speed; }
    else { vx = player.facing*speed; vy = 0; }
    bullets.push({
      x: player.x + (player.aimUp ? 0 : player.facing*12),
      y: player.y - (player.aimUp ? player.h-4 : player.h/2 - 6),
      vx: vx, vy: vy,
      level: level, color: colors[level], size: sizes[level],
      damage: level===0?1 : level===1?2 : 4,
      friendly: true
    });
    burst(player.x + player.facing*14, player.y - player.h/2 + 6, colors[level], 4);
    muzzleFlash = 4;
    player.charge = 0; player.chargeLevel = 0;
  }

  // ---------- Input ----------
  function doJump(){
    if (player.onGround && !player.sliding) {
      player.vy = JUMP_VEL; player.onGround = false;
    }
  }
  function doSlide(){
    if (player.onGround && !player.sliding && player.slideCD<=0) {
      player.sliding = true; player.slideTime = 24; player.slideCD = 45;
      player.vx = player.facing*SLIDE_SPEED;
    }
  }
  function onKey(e){
    if (gameOver || win) {
      if (e.key===' '||e.key==='Enter') reset();
      return;
    }
    if (e.key==='ArrowLeft'||e.key==='a'||e.key==='A'){ keys.left=true; e.preventDefault(); }
    else if (e.key==='ArrowRight'||e.key==='d'||e.key==='D'){ keys.right=true; e.preventDefault(); }
    else if (e.key==='ArrowUp'||e.key==='w'||e.key==='W'){ keys.up=true; player.aimUp=true; e.preventDefault(); }
    else if (e.key==='z'||e.key==='Z'){ if(!keys.jump && !player.ducking && !player.sliding) doJump(); keys.jump=true; e.preventDefault(); }
    else if (e.key==='ArrowDown'||e.key==='s'||e.key==='S'){
      keys.down=true;
      // Duck (crouch): on ground, not sliding, no prior duck
      if (player.onGround && !player.sliding && !player.ducking) {
        player.ducking = true;
      }
      e.preventDefault();
    }
    else if (e.key===' '||e.key==='x'||e.key==='X'){
      if (!keys.fire){ keys.fire=true; player.charge=1; fire(); }
      e.preventDefault();
    }
  }
  function onKeyUp(e){
    if (e.key==='ArrowLeft'||e.key==='a'||e.key==='A'){ keys.left=false; }
    else if (e.key==='ArrowRight'||e.key==='d'||e.key==='D'){ keys.right=false; }
    else if (e.key==='ArrowUp'||e.key==='w'||e.key==='W'){ keys.up=false; player.aimUp=false; }
    else if (e.key==='z'||e.key==='Z'){ keys.jump=false; }
    else if (e.key==='ArrowDown'||e.key==='s'||e.key==='S'){
      keys.down=false;
      player.ducking = false;
    }
    else if (e.key===' '||e.key==='x'||e.key==='X'){
      keys.fire=false;
      if (player.chargeLevel>0) fire();
      player.charge=0; player.chargeLevel=0;
    }
  }
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKeyUp);

  // Touch handlers
  var touchCleanup = bindGameTouch('megaman-touch', {
    left:  function(on){ keys.left  = on; },
    right: function(on){ keys.right = on; },
    up:    function(on){ keys.up = on; player.aimUp = on; },
    slide: function(on){ if (on) doSlide(); },
    jump:  function(on){ if (on) doJump(); keys.jump=on; },
    fire:  function(on){
      if (on) { keys.fire=true; player.charge=1; fire(); }
      else {
        keys.fire=false;
        if (player.chargeLevel>0) fire();
        player.charge=0; player.chargeLevel=0;
      }
    }
  });

  // Canvas taps — top third = aim up + fire, bottom = jump-or-fire
  function onCanvasTap(e){
    if (gameOver||win){ reset(); e.preventDefault(); return; }
    var t = e.touches ? e.touches[0] : e;
    var rect = canvas.getBoundingClientRect();
    var y = (t.clientY-rect.top)*(canvas.height/rect.height);
    if (y < H*0.33) { player.aimUp = true; fire(); setTimeout(function(){ player.aimUp=false; }, 150); }
    else { fire(); }
    e.preventDefault();
  }
  canvas.addEventListener('touchstart', onCanvasTap, {passive:false});

  // ---------- Physics helpers ----------
  function rectsHit(a,b){
    return a.x-a.w/2 < b.x+b.w/2 && a.x+a.w/2 > b.x-b.w/2 &&
           a.y-a.h   < b.y       && a.y       > b.y-b.h;
  }

  function playerOnPlatform(){
    // Check if player just landed on a platform
    for (var i=0;i<platforms.length;i++){
      var p = platforms[i];
      if (player.x > p.x-6 && player.x < p.x+p.w+6) {
        var prevY = player.y - player.vy;
        if (prevY <= p.y+1 && player.y >= p.y && player.vy >= 0) {
          player.y = p.y; player.vy = 0; player.onGround = true; return;
        }
      }
    }
  }

  // ---------- Update ----------
  function updatePlayer(){
    // Physics first
    if (player.sliding) {
      player.slideTime--;
      if (player.slideTime<=0) { player.sliding=false; player.vx=0; }
    } else {
      var target = 0;
      if (keys.left)  { target = -MOVE_SPEED; player.facing=-1; }
      if (keys.right) { target =  MOVE_SPEED; player.facing= 1; }
      player.vx = target;
    }
    if (player.slideCD>0) player.slideCD--;

    player.vy += GRAVITY;
    player.x += player.vx;
    player.y += player.vy;

    // Ground
    if (player.y >= GROUND_Y) { player.y = GROUND_Y; player.vy = 0; player.onGround = true; }
    else player.onGround = false;
    playerOnPlatform();

    // Camera scroll — smooth lerp, triggers when player enters RIGHT 40% of screen
    var targetCam = player.x - W * 0.6;
    cameraX += (targetCam - cameraX) * 0.08;

    // Bounds — apply AFTER camera update using the new cameraX
    var minX = cameraX + 30;
    var maxX = cameraX + W - 40;
    if (player.x < minX) player.x = minX;
    if (player.x > maxX) player.x = maxX;

    if (player.iframes>0) player.iframes--;
    player.anim = (player.anim + Math.abs(player.vx)*0.18) % (Math.PI*2);

    // Charge
    if (keys.fire) {
      player.charge++;
      if (player.charge >= 40) player.chargeLevel = 2;
      else if (player.charge >= 18) player.chargeLevel = 1;
      else player.chargeLevel = 0;
    }
  }

  function updateEnemies(){
    for (var i=enemies.length-1;i>=0;i--){
      var e = enemies[i];
      if (e.type==='walker'){
        e.x += e.vx; e.anim = (e.anim||0)+0.15;
        // Edge detection
        if (e.x < -30) { enemies.splice(i,1); continue; }
        // Fire
        e.fireCD--; if (e.fireCD<=0) {
          bullets.push({x:e.x + e.facing*14, y:e.y-e.h/2, vx:e.facing*5, vy:0, color:'#ff4444', size:5, damage:1, friendly:false});
          e.fireCD = 90+Math.random()*60;
        }
      } else if (e.type==='flier') {
        e.phase += 0.06;
        e.x += e.vx;
        e.y = e.baseY + Math.sin(e.phase)*30;
        if (e.x < -30) { enemies.splice(i,1); continue; }
        e.fireCD--; if (e.fireCD<=0) {
          var dx = player.x-e.x, dy = player.y-player.h/2-e.y, d = Math.sqrt(dx*dx+dy*dy)||1;
          bullets.push({x:e.x, y:e.y, vx:dx/d*4.5, vy:dy/d*4.5, color:'#ff66ff', size:5, damage:1, friendly:false});
          e.fireCD = 80+Math.random()*40;
        }
      } else if (e.type==='turret') {
        e.facing = player.x < e.x ? -1 : 1;
        e.fireCD--; if (e.fireCD<=0) {
          bullets.push({x:e.x + e.facing*14, y:e.y-e.h/2, vx:e.facing*6, vy:0, color:'#aaaaaa', size:6, damage:1, friendly:false});
          e.fireCD = 45+Math.random()*25;
        }
      } else if (e.type==='jumper') {
        e.vy += GRAVITY; e.y += e.vy; e.x += e.vx;
        if (e.y >= GROUND_Y-26) { e.y = GROUND_Y-26; e.vy = 0; e.onGround=true; }
        e.jumpCD--;
        if (e.onGround && e.jumpCD<=0) {
          e.vy = -10 - Math.random()*3; e.onGround = false; e.jumpCD = 50+Math.random()*30;
          e.facing = player.x < e.x ? -1 : 1;
          e.vx = e.facing * (1.8+Math.random());
        }
        if (e.x < -30 || e.x > W+40) { enemies.splice(i,1); continue; }
      }
    }
    // Wave advance
    if (enemies.length===0 && !boss && !win && !gameOver) {
      nextWaveOrLevel();
    }
  }

  function updateBoss(){
    if (!boss) return;
    boss.phaseTime++;
    boss.facing = player.x < boss.x ? -1 : 1;
    if (boss.kind==='cutman' || boss.kind==='iceman') {
      boss.vy += GRAVITY; boss.y += boss.vy;
      if (boss.y >= GROUND_Y - (boss.kind==='cutman'?56:54)) {
        boss.y = GROUND_Y - (boss.kind==='cutman'?56:54);
        boss.vy = 0; boss.onGround = true;
      }
      boss.x += boss.vx;
      if (boss.x < 200) { boss.x = 200; boss.vx = Math.abs(boss.vx); }
      if (boss.x > W-40) { boss.x = W-40; boss.vx = -Math.abs(boss.vx); }
      boss.jumpCD--; boss.fireCD--;
      if (boss.onGround && boss.jumpCD<=0) {
        boss.vy = -14; boss.onGround=false; boss.jumpCD = 50+Math.random()*40;
        boss.vx = boss.facing * (2+Math.random()*2);
      }
      if (boss.fireCD<=0) {
        if (boss.kind==='cutman') {
          // Rolling cutter (boomerang)
          bullets.push({x:boss.x, y:boss.y-boss.h+8, vx:boss.facing*5, vy:-1, color:'#ff6699', size:7, damage:2, friendly:false, life:90, boomerang:true, originX:boss.x});
        } else {
          // Ice shard spread
          [-0.4,-0.2,0,0.2,0.4].forEach(function(off){
            bullets.push({x:boss.x + boss.facing*16, y:boss.y-boss.h/2, vx:Math.cos(off)*boss.facing*5.5, vy:Math.sin(off)*5.5-1, color:'#aaeeff', size:6, damage:1, friendly:false});
          });
        }
        boss.fireCD = 55+Math.random()*25;
      }
    } else if (boss.kind==='wily') {
      // Hovering saucer, strafes
      boss.phase = (boss.phase||0) + 0.04;
      boss.y = GROUND_Y - 150 + Math.sin(boss.phase)*30;
      boss.x += boss.vx;
      if (boss.x < 200) boss.vx = Math.abs(boss.vx);
      if (boss.x > W-60) boss.vx = -Math.abs(boss.vx);
      boss.fireCD--;
      if (boss.fireCD<=0) {
        var dx = player.x - boss.x, dy = (player.y-player.h/2) - boss.y, d=Math.sqrt(dx*dx+dy*dy)||1;
        // Triple shot
        [-0.18,0,0.18].forEach(function(off){
          var cs = Math.cos(off), sn = Math.sin(off);
          var vx = (dx*cs - dy*sn)/d * 6, vy = (dx*sn + dy*cs)/d * 6;
          bullets.push({x:boss.x, y:boss.y, vx:vx, vy:vy, color:'#ffaa33', size:6, damage:2, friendly:false});
        });
        boss.fireCD = 40+Math.random()*25;
      }
    }
  }

  function updateBoss(){
    if (!boss) return;
    boss.phaseTime++;
    boss.facing = player.x < boss.x ? -1 : 1;
    if (boss.kind==='cutman' || boss.kind==='iceman') {
      boss.vy += GRAVITY; boss.y += boss.vy;
      if (boss.y >= GROUND_Y - (boss.kind==='cutman'?56:54)) {
        boss.y = GROUND_Y - (boss.kind==='cutman'?56:54);
        boss.vy = 0; boss.onGround = true;
      }
      boss.x += boss.vx;
      if (boss.x < 200) { boss.x = 200; boss.vx = Math.abs(boss.vx); }
      if (boss.x > W-40) { boss.x = W-40; boss.vx = -Math.abs(boss.vx); }
      boss.jumpCD--; boss.fireCD--;
      if (boss.onGround && boss.jumpCD<=0) {
        boss.vy = -14; boss.onGround=false; boss.jumpCD = 50+Math.random()*40;
        boss.vx = boss.facing * (2+Math.random()*2);
      }
      if (boss.fireCD<=0) {
        if (boss.kind==='cutman') {
          // Rolling cutter (boomerang)
          bullets.push({x:boss.x, y:boss.y-boss.h+8, vx:boss.facing*5, vy:-1, color:'#ff6699', size:7, damage:2, friendly:false, life:90, boomerang:true, originX:boss.x});
        } else {
          // Ice shard spread
          [-0.4,-0.2,0,0.2,0.4].forEach(function(off){
            bullets.push({x:boss.x + boss.facing*16, y:boss.y-boss.h/2, vx:Math.cos(off)*boss.facing*5.5, vy:Math.sin(off)*5.5-1, color:'#aaeeff', size:6, damage:1, friendly:false});
          });
        }
        boss.fireCD = 55+Math.random()*25;
      }
    } else if (boss.kind==='wily') {
      // Hovering saucer, strafes
      boss.phase = (boss.phase||0) + 0.04;
      boss.y = GROUND_Y - 150 + Math.sin(boss.phase)*30;
      boss.x += boss.vx;
      if (boss.x < 200) boss.vx = Math.abs(boss.vx);
      if (boss.x > W-60) boss.vx = -Math.abs(boss.vx);
      boss.fireCD--;
      if (boss.fireCD<=0) {
        var dx = player.x - boss.x, dy = (player.y-player.h/2) - boss.y, d=Math.sqrt(dx*dx+dy*dy)||1;
        // Triple shot
        [-0.18,0,0.18].forEach(function(off){
          var cs = Math.cos(off), sn = Math.sin(off);
          var vx = (dx*cs - dy*sn)/d * 6, vy = (dx*sn + dy*cs)/d * 6;
          bullets.push({x:boss.x, y:boss.y, vx:vx, vy:vy, color:'#ffaa33', size:6, damage:2, friendly:false});
        });
        boss.fireCD = 40+Math.random()*25;
      }
    }
  }

  function updateBullets(){
    // Decay enemy flash
    for (var efx in enemyFlash) { if (enemyFlash[efx] > 0) enemyFlash[efx]--; }
    for (var i=bullets.length-1;i>=0;i--){
      var b = bullets[i];
      b.x += b.vx; b.y += b.vy;
      if (b.boomerang) {
        b.life--; b.vx *= 0.985;
        if (b.life<60) b.vx -= Math.sign(b.vx)*0.25;
        if (b.life<=0) { bullets.splice(i,1); continue; }
      }
      if (b.x<-20||b.x>W+20||b.y<-20||b.y>H+20){ bullets.splice(i,1); continue; }
      if (b.friendly) {
        // vs enemies
        var hit=false;
        for (var j=enemies.length-1;j>=0;j--){
          var e = enemies[j];
          if (Math.abs(b.x-e.x) < e.w/2+b.size && Math.abs(b.y - (e.y-e.h/2)) < e.h/2+b.size) {
            e.hp -= b.damage; burst(b.x,b.y,b.color,6);
            if (e.hp<=0) {
              burst(e.x, e.y-e.h/2, '#ff8833', 18);
              enemyFlash[e.x + '_walker_' + j] = 6;
              if (Math.random()<0.25) pickups.push({x:e.x, y:e.y-e.h/2, kind:'hp', vy:-2, life:300});
              enemies.splice(j,1); score += 50;
            }
            hit=true; break;
          }
        }
        // vs boss
        if (!hit && boss) {
          if (Math.abs(b.x-boss.x) < boss.w/2+b.size && Math.abs(b.y - (boss.y-boss.h/2)) < boss.h/2+b.size) {
            boss.hp -= b.damage; burst(b.x,b.y,b.color,8); hit=true;
            if (boss.hp<=0) {
              burst(boss.x, boss.y-boss.h/2, '#ffcc33', 40); addScreenShake(20);
              score += 500;
              boss = null;
              setTimeout(advanceLevel, 600);
              showBanner(LEVELS[levelIdx].name+' CLEARED!');
            }
          }
        }
        if (hit) bullets.splice(i,1);
      } else {
        // vs player
        if (player.iframes<=0 &&
            Math.abs(b.x-player.x) < player.w/2+b.size &&
            Math.abs(b.y - (player.y-player.h/2)) < player.h/2+b.size) {
          player.hp -= b.damage; player.iframes = 60; burst(b.x,b.y,'#ff4444',8); addScreenShake(12);
          bullets.splice(i,1);
          if (player.hp<=0) gameOver=true;
        }
      }
    }
  }

  function updatePickups(){
    for (var i=pickups.length-1;i>=0;i--){
      var p = pickups[i];
      p.vy += 0.3; if (p.vy>4) p.vy=4;
      p.y += p.vy;
      if (p.y > GROUND_Y-6) { p.y = GROUND_Y-6; p.vy=0; }
      p.life--;
      if (p.life<=0) { pickups.splice(i,1); continue; }
      if (Math.abs(p.x-player.x)<16 && Math.abs(p.y-(player.y-player.h/2))<20) {
        if (p.kind==='hp') { player.hp = Math.min(player.maxHp, player.hp+4); score+=20; }
        burst(p.x,p.y,'#33ff77',10);
        pickups.splice(i,1);
      }
    }
  }

  function updateEnemyCollision(){
    if (player.iframes>0) return;
    function touch(o){ return Math.abs(o.x-player.x) < (o.w/2+player.w/2) &&
                             Math.abs((o.y-o.h/2) - (player.y-player.h/2)) < (o.h/2+player.h/2); }
    for (var i=0;i<enemies.length;i++){
      if (touch(enemies[i])) {
        player.hp -= 2; player.iframes=60; addScreenShake(8);
        if (player.hp<=0) gameOver=true;
        break;
      }
    }
    if (boss && touch(boss)) {
      player.hp -= 3; player.iframes=60; addScreenShake(15);
      if (player.hp<=0) gameOver=true;
    }
  }

  function updateParticles(){
    for (var i=particles.length-1;i>=0;i--){
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.22; p.life -= 0.03;
      if (p.life<=0) particles.splice(i,1);
    }
  }

  // ---------- Draw ----------
  function drawBG(){
    var L = LEVELS[levelIdx];
    var grad = ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0, L.bg1); grad.addColorStop(1, L.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0,0,W,H);

    // Parallax mountains/city (0.2x camera speed)
    ctx.fillStyle = L.fg + '66';
    var parallaxOffset = cameraX * 0.2;
    for (var i=0;i<6;i++){
      var bx = (i*120 - parallaxOffset % 120 + 120) % (W + 240) - 120;
      var bh = 60 + ((i*17)%50);
      ctx.fillRect(bx, H-60-bh, 90, bh);
      ctx.fillRect(bx+30, H-60-bh*0.6, 30, bh*0.6);
    }

    // Stars / flakes
    for (var i=0;i<30;i++){
      var x = (i*73 + frame*0.3) % W;
      var y = ((i*41) % H) * 0.7;
      ctx.fillStyle = 'rgba(255,255,255,'+(0.2+(i%3)*0.1)+')';
      ctx.fillRect(x, y, 1+((i%3)===0?1:0), 1+((i%3)===0?1:0));
    }
    // Distant silhouettes (parallax — move slower than camera for depth)
    ctx.fillStyle = L.fg;
    var silOffset = cameraX * 0.4;
    for (var i=0;i<8;i++){
      var bx = (i*90 - silOffset % 90 + 90) % (W + 180) - 90;
      var bh = 40 + ((i*13)%40);
      ctx.fillRect(bx, H-80-bh, 60, bh);
    }
    // Ground strip
    var gg = ctx.createLinearGradient(0,GROUND_Y,0,H);
    gg.addColorStop(0, L.fg); gg.addColorStop(1, '#050010');
    ctx.fillStyle = gg; ctx.fillRect(0,GROUND_Y,W,H-GROUND_Y);
    // Grid lines (scroll with world)
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    for (var gx=(frame*0.6 + cameraX)%40; gx<W; gx+=40){ ctx.beginPath(); ctx.moveTo(gx,GROUND_Y); ctx.lineTo(gx-60,H); ctx.stroke(); }
  }

  function drawPlatforms(){
    platforms.forEach(function(p){
      var g = ctx.createLinearGradient(p.x-cameraX,p.y,p.x-cameraX,p.y+p.h);
      g.addColorStop(0,'#8090b0'); g.addColorStop(1,'#303050');
      ctx.fillStyle=g; ctx.fillRect(p.x-cameraX,p.y,p.w,p.h);
      ctx.fillStyle='#ffffff33'; ctx.fillRect(p.x-cameraX,p.y,p.w,2);
      ctx.fillStyle='#00000055'; ctx.fillRect(p.x-cameraX,p.y+p.h-2,p.w,2);
    });
  }

  function drawMegaMan(){
    var px = player.x - cameraX, py = player.y;
    if (player.iframes>0 && frame%6<3) return;

    // Apply screen shake
    ctx.save();
    if (screenShake > 0) {
      var shakeX = (Math.random() - 0.5) * screenShake;
      var shakeY = (Math.random() - 0.5) * screenShake;
      ctx.translate(shakeX, shakeY);
    }

    var state = getPlayerState();
    var spriteSet = SPRITE[state.state || state];
    var spriteFrame = state.frame !== undefined ? state.frame : 0;
    var sprite = spriteSet[spriteFrame] || spriteSet[0];
    var flip = player.facing === -1;

    // Draw sprite centered on player foot position
    var spriteH = sprite.length * PIXEL_SCALE;
    var spriteW = (sprite[0] || []).length * PIXEL_SCALE;
    var drawX = px - spriteW / 2;
    var drawY = py - spriteH; // sprite bottom = player foot
    drawSprite(sprite, drawX, drawY, flip);

    // Muzzle flash
    if (muzzleFlash > 0) {
      var flashX = px + player.facing * (spriteW / 2 + 8);
      var flashY = py - player.h * 0.5;
      var flashR = 8 + muzzleFlash * 2;
      ctx.fillStyle = 'rgba(255,255,200,' + (muzzleFlash / 4) + ')';
      ctx.beginPath();
      ctx.arc(flashX, flashY, flashR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Charge aura (drawn on top)
    if (player.chargeLevel > 0) {
      var rad = (player.chargeLevel === 2 ? 28 : 18) + Math.sin(frame * 0.4) * 3;
      var auraColor = player.chargeLevel === 2
        ? 'rgba(255,238,51,0.55)'
        : 'rgba(0,204,255,0.5)';
      ctx.fillStyle = auraColor;
      ctx.beginPath();
      ctx.arc(px, py - spriteH * 0.5, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawWalker(e){
    var x = e.x - cameraX, y = e.y, w = e.w, h = e.h;
    var isFlashing = enemyFlash[e.x+"_walker_"+(enemies.indexOf(e)||0)] > 0;
    ctx.save(); ctx.translate(x,y); ctx.scale(e.facing,1);
    if (isFlashing) { ctx.fillStyle="#ffffff"; ctx.fillRect(-w/2,-h,w,h); ctx.restore(); return; }
    // Body
    var bg = ctx.createLinearGradient(0,-h,0,0);
    bg.addColorStop(0,'#ff8844'); bg.addColorStop(1,'#aa2200');
    ctx.fillStyle=bg; ctx.fillRect(-w/2,-h,w,h);
    // Stripe
    ctx.fillStyle='#ffdd00'; ctx.fillRect(-w/2,-h*0.6,w,3);
    // Eye
    ctx.fillStyle='#fff'; ctx.fillRect(w/2-8,-h*0.85,6,5);
    ctx.fillStyle='#000'; ctx.fillRect(w/2-6,-h*0.82,3,3);
    // Legs (animated)
    var leg = Math.sin((e.anim||0))*3;
    ctx.fillStyle='#660000';
    ctx.fillRect(-w/2+2,-3,w/3,3+leg);
    ctx.fillRect( w/2-w/3-2,-3,w/3,3-leg);
    // HP indicator
    if (e.hp < e.maxHp) drawHPBar(x,y-h-6,w,e.hp/e.maxHp,'#ff4444');
    ctx.restore();
  }
  function drawFlier(e){
    var x=e.x-cameraX,y=e.y,w=e.w,h=e.h;
    ctx.save(); ctx.translate(x,y);
    var isFlashing = enemyFlash[e.x+"_flier_"+(enemies.indexOf(e)||0)] > 0;
    if (isFlashing) { ctx.fillStyle="#ffffff"; ctx.beginPath(); ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2); ctx.fill(); ctx.restore(); return; }
    // Wings
    var wingY = Math.sin(frame*0.4)*3;
    ctx.fillStyle='#aa44dd';
    ctx.beginPath(); ctx.moveTo(-w/2-8,-h/2+wingY); ctx.lineTo(-w/2,-h/2-4); ctx.lineTo(-w/2,h/2-4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w/2+8,-h/2+wingY); ctx.lineTo(w/2,-h/2-4); ctx.lineTo(w/2,h/2-4); ctx.closePath(); ctx.fill();
    // Body
    var bg = ctx.createRadialGradient(0,-2,2,0,0,w*0.7);
    bg.addColorStop(0,'#ff99ff'); bg.addColorStop(1,'#660099');
    ctx.fillStyle=bg;
    ctx.beginPath(); ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2); ctx.fill();
    // Eye
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(e.facing*3,-2,4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(e.facing*4,-2,2,0,Math.PI*2); ctx.fill();
    if (e.hp < e.maxHp) drawHPBar(x,y-h,w,e.hp/e.maxHp,'#ff4444');
    ctx.restore();
  }
  function drawTurret(e){
    var x=e.x-cameraX,y=e.y,w=e.w,h=e.h;
    ctx.save(); ctx.translate(x,y); ctx.scale(e.facing,1);
    var isFlashing = enemyFlash[e.x+"_turret_"+(enemies.indexOf(e)||0)] > 0;
    if (isFlashing) { ctx.fillStyle="#ffffff"; ctx.fillRect(-w/2,-h,w,h); ctx.restore(); return; }
    // Base
    var bg = ctx.createLinearGradient(0,-h,0,0);
    bg.addColorStop(0,'#999'); bg.addColorStop(1,'#333');
    ctx.fillStyle=bg; ctx.fillRect(-w/2,-h,w,h);
    // Dome
    ctx.fillStyle='#bbb'; ctx.beginPath(); ctx.arc(0,-h, w/2-2, Math.PI, 0); ctx.fill();
    // Barrel
    ctx.fillStyle='#222'; ctx.fillRect(w/2-4,-h*0.75,10,6);
    // Eye
    ctx.fillStyle='#ff3333'; ctx.beginPath(); ctx.arc(0,-h*1.05,3,0,Math.PI*2); ctx.fill();
    if (e.hp < e.maxHp) drawHPBar(x,y-h-8,w,e.hp/e.maxHp,'#ff4444');
    ctx.restore();
  }
  function drawJumper(e){
    var x=e.x-cameraX,y=e.y,w=e.w,h=e.h;
    ctx.save(); ctx.translate(x,y); ctx.scale(e.facing,1);
    var isFlashing = enemyFlash[e.x+"_jumper_"+(enemies.indexOf(e)||0)] > 0;
    if (isFlashing) { ctx.fillStyle="#ffffff"; ctx.beginPath(); ctx.ellipse(0,-h/2,w/2,h/2,0,0,Math.PI*2); ctx.fill(); ctx.restore(); return; }
    var bg = ctx.createRadialGradient(0,-h/2,2,0,-h/2,h);
    bg.addColorStop(0,'#77ff77'); bg.addColorStop(1,'#006600');
    ctx.fillStyle=bg;
    ctx.beginPath(); ctx.ellipse(0,-h/2,w/2,h/2,0,0,Math.PI*2); ctx.fill();
    // Feet
    ctx.fillStyle='#004400'; ctx.fillRect(-w/2,-2,w/3,3); ctx.fillRect(w/2-w/3,-2,w/3,3);
    // Eye
    ctx.fillStyle='#fff'; ctx.fillRect(w/4-1,-h*0.7,5,4);
    ctx.fillStyle='#000'; ctx.fillRect(w/4+1,-h*0.68,2,3);
    if (e.hp < e.maxHp) drawHPBar(x,y-h-4,w,e.hp/e.maxHp,'#ff4444');
    ctx.restore();
  }
  function drawEnemy(e){
    if (e.type==='walker') drawWalker(e);
    else if (e.type==='flier') drawFlier(e);
    else if (e.type==='turret') drawTurret(e);
    else if (e.type==='jumper') drawJumper(e);
  }

  function drawBoss(){
    if (!boss) return;
    var x=boss.x-cameraX, y=boss.y, w=boss.w, h=boss.h;
    ctx.save(); ctx.translate(x,y); ctx.scale(boss.facing,1);
    if (boss.kind==='cutman') {
      // Body
      var bg=ctx.createLinearGradient(0,-h,0,0);
      bg.addColorStop(0,'#ff66aa'); bg.addColorStop(1,'#880033');
      ctx.fillStyle=bg; ctx.fillRect(-w/2,-h*0.8,w,h*0.6);
      // Legs
      ctx.fillStyle='#550022'; ctx.fillRect(-w/2+2,-h*0.2,w*0.35,h*0.2); ctx.fillRect(w/2-w*0.4,-h*0.2,w*0.35,h*0.2);
      ctx.fillStyle='#fff'; ctx.fillRect(-w/2+2,-4,w*0.38,4); ctx.fillRect(w/2-w*0.42,-4,w*0.38,4);
      // Head
      ctx.fillStyle='#ff88cc'; ctx.fillRect(-w/2+3,-h,w-6,h*0.25);
      // SCISSORS on head
      ctx.fillStyle='#ccc';
      ctx.beginPath(); ctx.moveTo(-8,-h-4); ctx.lineTo(0,-h-18); ctx.lineTo(3,-h-4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-3,-h-4); ctx.lineTo(6,-h-16); ctx.lineTo(10,-h-4); ctx.closePath(); ctx.fill();
      // Eyes
      ctx.fillStyle='#220000'; ctx.fillRect(-w/2+6,-h*0.92,5,4); ctx.fillRect(w/2-11,-h*0.92,5,4);
      ctx.fillStyle='#fff'; ctx.fillRect(-w/2+8,-h*0.9,2,2); ctx.fillRect(w/2-9,-h*0.9,2,2);
    } else if (boss.kind==='iceman') {
      var bg=ctx.createLinearGradient(0,-h,0,0);
      bg.addColorStop(0,'#aaddff'); bg.addColorStop(1,'#2266aa');
      ctx.fillStyle=bg; ctx.fillRect(-w/2,-h*0.8,w,h*0.6);
      ctx.fillStyle='#113355'; ctx.fillRect(-w/2+2,-h*0.2,w*0.35,h*0.2); ctx.fillRect(w/2-w*0.4,-h*0.2,w*0.35,h*0.2);
      ctx.fillStyle='#fff'; ctx.fillRect(-w/2+2,-4,w*0.38,4); ctx.fillRect(w/2-w*0.42,-4,w*0.38,4);
      // Head
      ctx.fillStyle='#ccefff'; ctx.fillRect(-w/2+3,-h,w-6,h*0.28);
      // Parka hood
      ctx.fillStyle='#ffffff'; ctx.beginPath(); ctx.arc(0,-h,w/2+2,Math.PI,0); ctx.fill();
      // Goggles
      ctx.fillStyle='#000'; ctx.fillRect(-w/2+5,-h*0.88,w-10,6);
      ctx.fillStyle='#66aaff'; ctx.fillRect(-w/2+7,-h*0.86,6,3); ctx.fillRect(w/2-13,-h*0.86,6,3);
    } else if (boss.kind==='wily') {
      // Saucer
      var sg=ctx.createLinearGradient(0,-h,0,0);
      sg.addColorStop(0,'#ffee88'); sg.addColorStop(1,'#aa6600');
      ctx.fillStyle=sg;
      ctx.beginPath(); ctx.ellipse(0,-h*0.3,w*0.6,h*0.18,0,0,Math.PI*2); ctx.fill();
      // Dome
      var dg=ctx.createRadialGradient(0,-h*0.7,2,0,-h*0.7,w*0.35);
      dg.addColorStop(0,'#ffffff'); dg.addColorStop(1,'#66ccff');
      ctx.fillStyle=dg;
      ctx.beginPath(); ctx.ellipse(0,-h*0.55,w*0.3,h*0.3,0,Math.PI,0); ctx.fill();
      // Wily inside
      ctx.fillStyle='#ffccaa'; ctx.beginPath(); ctx.arc(0,-h*0.6,w*0.12,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.fillRect(-6,-h*0.68,12,3); // mustache line
      ctx.fillStyle='#000'; ctx.fillRect(-4,-h*0.62,2,2); ctx.fillRect(2,-h*0.62,2,2); // eyes
      // Thrusters
      ctx.fillStyle='#ff6600';
      ctx.beginPath(); ctx.arc(-w*0.45,-h*0.2,4,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc( w*0.45,-h*0.2,4,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();

    // Boss HP bar at top
    var barW = W*0.5, barX = (W-barW)/2, barY = 18;
    ctx.fillStyle='#222'; ctx.fillRect(barX-2,barY-2,barW+4,14);
    ctx.fillStyle='#000'; ctx.fillRect(barX,barY,barW,10);
    var hpFrac = Math.max(0, boss.hp/boss.maxHp);
    var grad = ctx.createLinearGradient(barX,0,barX+barW,0);
    grad.addColorStop(0,'#ffdd00'); grad.addColorStop(1,'#ff3333');
    ctx.fillStyle=grad; ctx.fillRect(barX,barY,barW*hpFrac,10);
    ctx.fillStyle='#fff'; ctx.font='bold 11px monospace'; ctx.textAlign='center';
    ctx.fillText(boss.kind.toUpperCase(), W/2, barY+9); ctx.textAlign='left';
  }

  function drawHPBar(x,y,w,frac,color){
    ctx.fillStyle='#000'; ctx.fillRect(x-w/2,y,w,3);
    ctx.fillStyle=color; ctx.fillRect(x-w/2,y,w*frac,3);
  }

  function drawBullet(b){
    var g = ctx.createRadialGradient(b.x-cameraX,b.y,0,b.x-cameraX,b.y,b.size+2);
    g.addColorStop(0,b.color); g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(b.x-cameraX,b.y,b.size+3,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=b.color;
    ctx.beginPath(); ctx.arc(b.x-cameraX,b.y,b.size,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(b.x-cameraX-b.size*0.3,b.y-b.size*0.3,b.size*0.35,0,Math.PI*2); ctx.fill();
  }

  function drawPickups(){
    pickups.forEach(function(p){
      var bob = Math.sin(frame*0.2+p.x*0.01)*3;
      ctx.save(); ctx.translate(p.x-cameraX, p.y+bob);
      ctx.fillStyle='#33ff66';
      ctx.fillRect(-6,-2,12,4); ctx.fillRect(-2,-6,4,12);
      ctx.fillStyle='#aaffaa';
      ctx.fillRect(-1,-5,2,10); ctx.fillRect(-5,-1,10,2);
      ctx.restore();
    });
  }

  function drawParticles(){
    particles.forEach(function(p){
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillRect(p.x-p.size/2, p.y-p.size/2, p.size, p.size);
    });
    ctx.globalAlpha = 1;
  }

  function drawHUD(){
    // HP
    ctx.fillStyle='#000c'; ctx.fillRect(6,6,120,14);
    ctx.fillStyle='#fff'; ctx.font='bold 10px monospace';
    ctx.fillText('E', 10, 16);
    for (var i=0;i<player.maxHp;i++){
      ctx.fillStyle = i<player.hp ? '#33ff88' : '#222';
      ctx.fillRect(20+i*8, 9, 6, 8);
    }
    // Score
    ctx.fillStyle='#fff'; ctx.font='bold 12px monospace';
    ctx.fillText('SCORE '+score, W-110, 16);
    ctx.fillText('STAGE '+(levelIdx+1)+'-'+(Math.min(wave+1, LEVELS[levelIdx].waves.length+1)), W/2-36, 16);
    // Banner
    if (bannerTime>0){
      bannerTime--;
      var alpha = bannerTime>20 ? 1 : bannerTime/20;
      ctx.fillStyle = 'rgba(0,0,0,'+0.6*alpha+')'; ctx.fillRect(0,H/2-22,W,44);
      ctx.textAlign='center'; ctx.fillStyle='rgba(255,238,51,'+alpha+')';
      ctx.font='bold 22px monospace';
      ctx.fillText(bannerText, W/2, H/2+6);
      ctx.textAlign='left';
    }
    // Game over / win
    if (gameOver || win){
      ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';
      ctx.fillStyle = win?'#00ff88':'#ff3344'; ctx.font='bold 38px monospace';
      ctx.fillText(win?'YOU BEAT WILY!':'GAME OVER', W/2, H/2-10);
      ctx.fillStyle='#fff'; ctx.font='16px monospace';
      ctx.fillText('Score: '+score, W/2, H/2+18);
      ctx.fillStyle='#aaa'; ctx.font='12px monospace';
      ctx.fillText('Press SPACE or tap canvas to restart', W/2, H/2+40);
      ctx.textAlign='left';
    }
  }

  // ---------- Pixel Art Sprite System ----------
  var PIXEL_SCALE = 3;
  var COLOR_MAP = {
    'B': '#0066cc', 'b': '#33aaff', 'S': '#ffcc99',
    'W': '#ffffff', 'R': '#ff3333', 'Y': '#ffcc00',
    'G': '#999999', 'K': '#000000', '.': null
  };

  // Mega Man sprite frames — each is a 2D array of color keys
  // Format: each row is array of color strings (null = transparent)
  var SPRITE = {
    idle: [
      // Frame 0: standing
      [
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','B','W','W','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','W','W','W','W','W','W','W','W','.','.','.'],
        ['.','.','.','.','S','S','S','S','S','S','S','S','S','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','b','b','B','B','B','B','B','B','B','B','B','b','b','.'],
        ['.','.','.','.','.','.','B','B','B','B','.','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','B','B','B','B','B','B','B','B','B','B','B','B','B','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.']
      ],
      // Frame 1: slight chest rise (shift torso up 1px)
      [
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','B','W','W','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','W','W','W','W','W','W','W','W','W','W','.','.'],
        ['.','.','.','S','S','S','S','S','S','S','S','S','S','S','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','B','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','B','.'],
        ['.','.','b','b','B','B','B','B','B','B','B','B','B','b','b','.'],
        ['.','.','.','.','.','.','B','B','B','B','.','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','B','B','B','B','B','B','B','B','B','B','B','B','B','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.']
      ],
      // Frame 2: same as 0
      [
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','B','W','W','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','W','W','W','W','W','W','W','W','.','.','.'],
        ['.','.','.','.','S','S','S','S','S','S','S','S','S','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','b','b','B','B','B','B','B','B','B','B','B','b','b','.'],
        ['.','.','.','.','.','.','B','B','B','B','.','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','B','B','B','B','B','B','B','B','B','B','B','B','B','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.']
      ],
      // Frame 3: slight chest fall (shift torso down 1px) — eye row moves up
      [
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','B','W','W','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','W','W','W','W','W','W','W','W','W','W','.','.'],
        ['.','.','.','S','S','S','S','S','S','S','S','S','S','S','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','B','.'],
        ['.','.','b','b','B','B','B','B','B','B','B','B','B','b','b','.'],
        ['.','.','.','.','.','.','B','B','B','B','.','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','B','B','B','B','B','B','B','B','B','B','B','B','B','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.']
      ]
    ],
    run: [
      // Run frame 0: right leg forward, right arm back
      [
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','B','W','W','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','W','W','W','W','W','W','W','W','.','.','.'],
        ['.','.','.','.','S','S','S','S','S','S','S','S','S','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','b','b','B','B','B','B','B','B','B','B','B','b','b','.'],
        ['.','.','.','.','.','.','B','B','B','B','.','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','B','B','.','.','.','.'],
        ['.','B','B','.','.','.','.','.','.','.','.','.','B','B','.','.'],
        ['.','.','B','B','.','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.']
      ],
      // Run frame 1: legs crossing
      [
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','B','W','W','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','W','W','W','W','W','W','W','W','.','.','.'],
        ['.','.','.','.','S','S','S','S','S','S','S','S','S','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','b','b','B','B','B','B','B','B','B','B','B','b','b','.'],
        ['.','.','.','.','.','.','B','B','B','B','.','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','B','B','B','B','B','B','B','B','B','B','B','B','B','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.']
      ],
      // Run frame 2: left leg forward, left arm back
      [
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','B','W','W','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','W','W','W','W','W','W','W','W','.','.','.'],
        ['.','.','.','.','S','S','S','S','S','S','S','S','S','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','b','b','B','B','B','B','B','B','B','B','B','b','b','.'],
        ['.','.','.','.','.','.','B','B','B','B','.','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','B','B','.','.','.','.','.','.','.','.','B','B','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.']
      ],
      // Run frames 3-5 are mirrors of 0-2 (handled by flip)
      [
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','B','W','W','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','W','W','W','W','W','W','W','W','.','.','.'],
        ['.','.','.','.','S','S','S','S','S','S','S','S','S','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','b','b','B','B','B','B','B','B','B','B','B','b','b','.'],
        ['.','.','.','.','.','.','B','B','B','B','.','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','B','B','.','.','.','.'],
        ['.','B','B','.','.','.','.','.','.','.','.','.','B','B','.','.'],
        ['.','.','B','B','.','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.']
      ],
      [
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','B','W','W','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','W','W','W','W','W','W','W','W','.','.','.'],
        ['.','.','.','.','S','S','S','S','S','S','S','S','S','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','b','b','B','B','B','B','B','B','B','B','B','b','b','.'],
        ['.','.','.','.','.','.','B','B','B','B','.','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','B','B','B','B','B','B','B','B','B','B','B','B','B','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.']
      ],
      [
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','B','W','W','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','W','W','W','W','W','W','W','W','.','.','.'],
        ['.','.','.','.','S','S','S','S','S','S','S','S','S','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','b','b','B','B','B','B','B','B','B','B','B','b','b','.'],
        ['.','.','.','.','.','.','B','B','B','B','.','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','B','B','.','.','.','.','.','.','.','.','B','B','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.']
      ]
    ],
    jump: [
      // Arms raised above head, buster pointing up, legs together
      [
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','B','W','W','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','W','W','W','W','W','W','W','W','.','.','.'],
        ['.','.','.','.','S','S','S','S','S','S','S','S','S','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','B','B','B','B','B','B','B','B','B','B','B','B','B','B','.'],
        ['.','B','B','B','B','B','B','B','B','B','B','B','B','B','B','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.']
      ]
    ],
    duck: [
      // One clean crouch frame - helmet + shoulders blob (compact squat)
      [
        ['.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','.','B','W','W','W','W','W','W','W','W','B','.','.'],
        ['.','.','.','B','S','S','S','S','S','S','S','S','S','B','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','b','b','B','B','B','B','B','B','B','B','B','b','b','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.']
      ]
    ],
    slide: [
      [
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','B','W','W','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','W','W','W','W','W','W','W','W','.','.','.'],
        ['.','.','.','.','S','S','S','S','S','S','S','S','S','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','b','b','B','B','B','B','B','B','B','B','B','b','b','.'],
        ['.','.','.','.','.','.','B','B','B','B','.','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','B','B','B','B','B','B','B','B','B','B','B','B','B','B','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.']
      ]
    ],
    fire: [
      // Same as idle but arm extended forward with visible buster, slight lean
      [
        ['.','.','.','.','.','B','B','B','B','B','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','B','W','W','B','B','B','B','B','.','.','.'],
        ['.','.','.','.','B','W','W','W','W','W','W','W','W','.','.','.'],
        ['.','.','.','.','S','S','S','S','S','S','S','S','S','.','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','.','B','B','B','B','B','B','B','B','B','B','B','.','.'],
        ['.','.','b','b','B','B','B','B','B','B','B','B','B','b','b','.'],
        ['.','.','.','.','.','.','B','B','B','B','.','.','.','.','.','.'],
        ['.','.','.','.','.','B','B','B','B','B','B','.','.','.','.','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','.','.','B','B','.','.','.','.','B','B','.','.','.','.'],
        ['.','.','B','B','B','B','B','B','B','B','B','B','B','B','B','.'],
        ['.','.','.','.','B','B','B','B','B','B','B','B','B','.','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','.','B','B','.','.','.','.','.','.','B','B','.','.','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.'],
        ['.','.','G','G','.','.','.','.','.','.','.','.','.','G','G','.']
      ]
    ]
  };

  function drawSprite(sprite, x, y, flip, scale) {
    scale = scale || PIXEL_SCALE;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    for (var row = 0; row < sprite.length; row++) {
      for (var col = 0; col < sprite[row].length; col++) {
        var c = sprite[row][col];
        if (c && c !== '.') {
          ctx.fillStyle = COLOR_MAP[c] || c;
          ctx.fillRect(col * scale, row * scale, scale, scale);
        }
      }
    }
    ctx.restore();
  }

  // Determine player animation state
  function getPlayerState() {
    if (player.sliding) return 'slide';
    if (!player.onGround) return 'jump';
    if (player.ducking) {
      // Duck animation: 1 compact crouch frame
      return { state: 'duck', frame: 0 };
    }
    if (player.chargeLevel > 0) return { state: 'fire', frame: 0 };
    if (Math.abs(player.vx) > 0.5) {
      // running - use run animation, 6 frames
      var runFrame = Math.floor(frame / 6) % 6;
      return { state: 'run', frame: runFrame };
    }
    // idle - use idle animation, 4 frames
    var idleFrame = Math.floor(frame / 30) % 4;
    return { state: 'idle', frame: idleFrame };
  }

  // Screen shake state
  var screenShake = 0;
  function addScreenShake(amount) { screenShake = amount; }

  // Muzzle flash state
  var muzzleFlash = 0;

  // Enemy flash state (map from enemy x to flash time)
  var enemyFlash = {};

  // Ground detail cache
  var groundDetails = [];
  function buildGroundDetails() {
    groundDetails = [];
    for (var i = 0; i < 20; i++) {
      groundDetails.push({
        x: Math.random() * (W + 400) - 200,
        kind: Math.random() < 0.4 ? 'pipe' : (Math.random() < 0.5 ? 'rock' : 'bolt'),
        h: 12 + Math.random() * 20,
        w: 8 + Math.random() * 16
      });
    }
  }
  buildGroundDetails();

  function drawGroundDetails() {
    var scrollOffset = (frame * 0.6 + cameraX * 0.3) % 60;
    groundDetails.forEach(function(d) {
      var gx = d.x - scrollOffset;
      if (gx < -40) gx += W + 80;
      if (gx > W + 40) return;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      if (d.kind === 'pipe') {
        ctx.fillStyle = '#203040';
        ctx.fillRect(gx, GROUND_Y + 2, d.w, 10);
        ctx.fillStyle = '#304050';
        ctx.fillRect(gx + 2, GROUND_Y + 2, d.w - 4, 4);
      } else if (d.kind === 'rock') {
        ctx.fillStyle = '#252535';
        ctx.fillRect(gx, GROUND_Y + 2, d.w, d.h);
        ctx.fillStyle = '#353545';
        ctx.fillRect(gx + 1, GROUND_Y + 3, d.w - 2, 3);
      } else {
        ctx.fillStyle = '#404050';
        ctx.fillRect(gx, GROUND_Y + 2, 3, d.h);
        ctx.fillRect(gx + 4, GROUND_Y + 2, 3, d.h);
      }
    });
  }

  function reset(){
    levelIdx=0; wave=0; bullets=[]; enemies=[]; particles=[]; pickups=[]; boss=null;
    platforms = LEVELS[0].platforms;
    player.x=80; player.y=GROUND_Y-40; player.vx=0; player.vy=0;
    player.hp=player.maxHp; player.iframes=0; player.sliding=false; player.charge=0; player.chargeLevel=0; player.ducking=false;
    score=0; gameOver=false; win=false; frame=0; cameraX=0;
    startWave();
  }

  // ---------- Loop ----------
  var raf;
  window._activeGameCleanup = function(){
    try { if (raf) cancelAnimationFrame(raf); } catch(e){}
    try { document.removeEventListener('keydown', onKey); } catch(e){}
    try { document.removeEventListener('keyup', onKeyUp); } catch(e){}
    try { touchCleanup(); } catch(e){}
    try { canvas.removeEventListener('touchstart', onCanvasTap); } catch(e){}
  };

  function step(){
    frame++;
    // Decay effects
    if (screenShake > 0) screenShake *= 0.85;
    if (muzzleFlash > 0) muzzleFlash = Math.max(0, muzzleFlash - 1);
    if (!gameOver && !win){
      updatePlayer(); updateEnemies(); updateBoss(); updateBullets();
      updatePickups(); updateEnemyCollision(); updateParticles();
    }
    drawBG();
    drawGroundDetails();
    drawPlatforms();
    drawPickups();
    enemies.forEach(drawEnemy);
    drawBoss();
    bullets.forEach(drawBullet);
    drawMegaMan();
    drawParticles();
    drawHUD();
    raf = requestAnimationFrame(step);
  }
  startWave();
  step();
}



// ============================================================
// bindGameTouch: reliable touch/mouse binding for touch-control buttons.
// Wires pointer events directly to a callback map instead of synthesizing
// KeyboardEvents (which iOS Safari does NOT reliably dispatch to the game).
// Usage: bindGameTouch('megaman-touch', { left:fn, right:fn, jump:fn, ... })
//   fn receives a single boolean: true when pressed, false when released.
// ============================================================
function bindGameTouch(containerId, handlers) {
  var cont = document.getElementById(containerId);
  if (!cont) return function(){};
  var btns = cont.querySelectorAll('.touch-btn');
  var cleanups = [];
  btns.forEach(function(btn) {
    var action = btn.getAttribute('data-touch');
    if (!action) return;
    var h = handlers[action];
    if (!h) return;
    function down(e) {
      e.preventDefault();
      btn.classList.add('pressed');
      h(true);
    }
    function up(e) {
      if (e) e.preventDefault();
      btn.classList.remove('pressed');
      h(false);
    }
    btn.addEventListener('touchstart', down, { passive: false });
    btn.addEventListener('touchend', up, { passive: false });
    btn.addEventListener('touchcancel', up, { passive: false });
    btn.addEventListener('mousedown', down);
    btn.addEventListener('mouseup', up);
    btn.addEventListener('mouseleave', up);
    cleanups.push(function() {
      btn.removeEventListener('touchstart', down);
      btn.removeEventListener('touchend', up);
      btn.removeEventListener('touchcancel', up);
      btn.removeEventListener('mousedown', down);
      btn.removeEventListener('mouseup', up);
      btn.removeEventListener('mouseleave', up);
      btn.classList.remove('pressed');
      // Ensure the handler sees "released" so no stuck keys
      try { h(false); } catch(e){}
    });
  });
  return function() { cleanups.forEach(function(fn){ try{fn();}catch(e){} }); };
}

// ============================================================
// CardTrack Shop OS — Meet / cart / storefront / payments / arb
// ============================================================
var CART = [];
var CART_SEL = -1;
var MEET_SIDE = 'sell';
var PAY_METHOD = 'cash';
var _logSaleCore = null;

function suggestedSell(market, cost) {
  if (market != null && !isNaN(market) && market > 0) return Math.round(market * 100) / 100;
  if (cost) return Math.round(num(cost) * 1.5 * 100) / 100;
  return 0;
}
function suggestedBuy(market) {
  var s = loadSettings();
  var rate = s.cashRate != null ? s.cashRate : 0.6;
  if (market == null || isNaN(market) || !market) return 0;
  return Math.round(market * rate * 100) / 100;
}
function edgeDollars(market, cost) {
  if (market == null || cost == null) return null;
  return Math.round((num(market) - num(cost)) * 100) / 100;
}
function edgeBadgeHtml(market, cost) {
  var e = edgeDollars(market, cost);
  if (e == null) return '';
  if (Math.abs(e) < 0.5) return '';
  return '<span class="edge-badge' + (e < 0 ? ' neg' : '') + '">' + (e >= 0 ? '+' : '') + fmt(e) + ' vs mkt</span>';
}
function lastSalePrice(item) {
  if (!item) return 0;
  var last = (DB.sales || []).slice().reverse().find(function (s) {
    return s && s.type !== 'box' && s.kind !== 'buylist' && ((s.sku && s.sku === item.sku) || (s.name && s.name === item.name));
  });
  return last && last.price ? num(last.price) : 0;
}
function cartSubtotal() {
  return CART.reduce(function (s, l) { return s + num(l.price) * int(l.qty, 1); }, 0);
}
function renderCart() {
  var box = $('cart-lines');
  if (!box) return;
  if (!CART.length) {
    box.innerHTML = '<div class="empty-state" style="padding:24px 8px"><div class="empty-title">Cart is empty</div><div class="empty-hint">Scan a SKU or tap a result to add a line.</div></div>';
  } else {
    box.innerHTML = CART.map(function (l, i) {
      var sel = i === CART_SEL ? ' style="background:var(--accent-soft);border-radius:10px;padding:10px 8px"' : '';
      var thumb = (typeof cardArtHtml === 'function') ? cardArtHtml(l.imageLarge || l.image || '', 'card-art-cart', true) : '';
      return '<div class="cart-line" data-i="' + i + '"' + sel + ' onclick="selectCartLine(' + i + ')">' +
        '<div class="cl-thumb" onclick="event.stopPropagation();openCartItemSheet(' + i + ')">' + (thumb || '') + '</div>' +
        '<div class="cl-body"><div class="cl-name">' + esc(l.name || l.sku || 'Item') + '</div>' +
        '<div class="cl-meta">' + esc(l.sku || '') + ' · ' + esc(l.condition || 'NM') +
        (l.cost ? ' · cost ' + fmt(l.cost) : '') + ' ' + edgeBadgeHtml(l.market, l.cost) + '</div>' +
        ((typeof ctLivePriceRowHtml === 'function') ? ('<div class="lp-mini">' + ctLivePriceRowHtml(l.invIdx != null && DB.inventory[l.invIdx] ? DB.inventory[l.invIdx] : l, { w: 48, h: 16 }) + '</div>') : '') +
        '</div>' +
        '<input type="number" min="1" value="' + int(l.qty, 1) + '" onclick="event.stopPropagation()" onchange="updateCartLine(' + i + ',\'qty\',this.value)">' +
        '<input type="number" step="0.01" value="' + (l.price ? Number(l.price).toFixed(2) : '') + '" placeholder="0.00" onclick="event.stopPropagation()" onchange="updateCartLine(' + i + ',\'price\',this.value)">' +
        '<button class="icon-btn" type="button" onclick="event.stopPropagation();removeCartLine(' + i + ')" aria-label="Remove">×</button></div>';
    }).join('');
  }
  var sub = cartSubtotal();
  if ($('cart-subtotal')) $('cart-subtotal').textContent = fmt(sub);
  if ($('cart-count')) $('cart-count').textContent = CART.length ? (CART.length + (CART.length === 1 ? ' line' : ' lines')) : '0 lines';
  updateSaleCreditPreview();
  updateCheckoutDue();
}
function selectCartLine(i) {
  CART_SEL = i;
  var l = CART[i];
  if (!l) return;
  if ($('log-sku')) $('log-sku').value = l.sku || '';
  if ($('log-name')) $('log-name').value = l.name || '';
  if ($('log-price')) $('log-price').value = l.price ? Number(l.price).toFixed(2) : '';
  if ($('log-cost')) $('log-cost').value = l.cost != null ? l.cost : '';
  if ($('log-qty')) $('log-qty').value = l.qty || 1;
  if ($('log-condition')) $('log-condition').value = l.condition || 'NM';
  if (typeof updateMeetCardPreview === 'function') updateMeetCardPreview(l);
  renderCart();
  if (typeof refreshCompsPanel === 'function' && l.name) refreshCompsPanel('sale', false);
  if (!l.image && l.name && typeof lookupCardArt === 'function') {
    lookupCardArt(l.name, l.set, l.number).then(function (meta) {
      if (!meta || CART[CART_SEL] !== l) return;
      persistItemImage(l, meta);
      if (l.invIdx != null && DB.inventory[l.invIdx]) {
        if (persistItemImage(DB.inventory[l.invIdx], meta)) try { DB.saveInventory(); } catch (e) {}
      }
      updateMeetCardPreview(l);
      renderCart();
    });
  }
}
function updateCartLine(i, field, val) {
  if (!CART[i]) return;
  if (field === 'qty') CART[i].qty = Math.max(1, int(val, 1));
  if (field === 'price') CART[i].price = num(val);
  if (field === 'condition') CART[i].condition = val;
  renderCart();
}
function removeCartLine(i) {
  CART.splice(i, 1);
  if (CART_SEL === i) CART_SEL = -1;
  else if (CART_SEL > i) CART_SEL--;
  renderCart();
}
function clearCart() {
  CART = [];
  CART_SEL = -1;
  if (typeof updateMeetCardPreview === 'function') updateMeetCardPreview(null);
  if ($('log-sku')) $('log-sku').value = '';
  if ($('log-name')) $('log-name').value = '';
  if ($('log-price')) $('log-price').value = '';
  if ($('log-cost')) $('log-cost').value = '';
  if ($('log-qty')) $('log-qty').value = '1';
  if ($('log-find')) $('log-find').value = '';
  if ($('reg-search')) $('reg-search').value = '';
  if ($('fast-sale-q')) $('fast-sale-q').value = '';
  if ($('inv-pick-box')) $('inv-pick-box').innerHTML = '';
  if ($('fast-sale-list')) $('fast-sale-list').innerHTML = '';
  renderCart();
}
function addInventoryToCart(idx) {
  var item = DB.inventory[idx];
  if (!item || !item.qty) { toast('Out of stock', 'err'); return; }
  var existing = CART.findIndex(function (l) { return l.invIdx === idx || (l.sku && item.sku && l.sku === item.sku && l.condition === (item.condition || 'NM')); });
  var price = lastSalePrice(item) || suggestedSell(item.market, item.cost);
  if (existing >= 0) {
    CART[existing].qty = int(CART[existing].qty, 1) + 1;
    CART_SEL = existing;
  } else {
    CART.push({
      invIdx: idx,
      sku: item.sku || '',
      name: item.name || '',
      price: price,
      cost: num(item.cost),
      qty: 1,
      condition: item.condition || 'NM',
      kind: item.kind || 'raw',
      market: item.market || null,
      set: item.set || '',
      number: item.number || '',
      tcgId: item.tcgId || '',
      image: item.image || '',
      imageLarge: item.imageLarge || ''
    });
    CART_SEL = CART.length - 1;
  }
  if (typeof updateMeetCardPreview === 'function') updateMeetCardPreview(CART[CART_SEL]);
  if ($('log-name')) $('log-name').value = item.name || '';
  if ($('log-sku')) $('log-sku').value = item.sku || '';
  if ($('log-price')) $('log-price').value = price ? Number(price).toFixed(2) : '';
  if ($('log-cost')) $('log-cost').value = item.cost != null ? item.cost : '';
  if ($('log-condition')) $('log-condition').value = item.condition || 'NM';
  renderCart();
  if (typeof refreshCompsPanel === 'function') refreshCompsPanel('sale', false);
  toast('Added ' + (item.name || item.sku), 'ok');
  setTimeout(focusSaleScanField, 20);
}
function addManualToCart() {
  var name = (($('log-name') && $('log-name').value) || '').trim();
  var sku = (($('log-sku') && $('log-sku').value) || '').trim().toUpperCase();
  var price = num($('log-price') && $('log-price').value);
  var cost = num($('log-cost') && $('log-cost').value);
  var qty = int($('log-qty') && $('log-qty').value, 1);
  var condition = ($('log-condition') && $('log-condition').value) || 'NM';
  if (!name && !sku) { toast('Scan or enter an item first', 'err'); return; }
  if (!price) { toast('Set a price (or Use market)', 'err'); return; }
  CART.push({ sku: sku, name: name, price: price, cost: cost, qty: qty, condition: condition, kind: 'raw', market: null });
  CART_SEL = CART.length - 1;
  renderCart();
  toast('Added to cart', 'ok');
}

function setPayMethod(m) {
  PAY_METHOD = m || 'cash';
  document.querySelectorAll('.pay-opt').forEach(function (el) {
    el.classList.toggle('active', el.getAttribute('data-pay') === PAY_METHOD);
  });
  var extra = $('pay-link-box');
  if (extra) extra.style.display = PAY_METHOD === 'link' ? 'block' : 'none';
  updateCheckoutDue();
}
function paymentLinkForAmount(amount) {
  var s = loadSettings();
  var url = (s.paymentLinkUrl || '').trim();
  if (!url) return '';
  return url.replace(/\{amount\}/g, (num(amount) || 0).toFixed(2)).replace(/\{total\}/g, (num(amount) || 0).toFixed(2));
}
function copyPaymentLink() {
  var due = checkoutDue();
  var url = ($('sale-pay-link') && $('sale-pay-link').value) || paymentLinkForAmount(due);
  if (!url) { toast('Add a payment link in Settings', 'err'); return; }
  if ($('sale-pay-link')) $('sale-pay-link').value = url;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () { toast('Payment link copied', 'ok'); }).catch(function () { prompt('Copy this link', url); });
  } else {
    prompt('Copy this link', url);
  }
}
function checkoutDue() {
  // Empty cart must always show $0 — never fall back to leftover log-price form fields.
  var sub = CART.length ? cartSubtotal() : 0;
  var apply = CART.length && $('log-apply-credit') && $('log-apply-credit').checked;
  var credit = apply ? num($('log-credit-amt') && $('log-credit-amt').value) : 0;
  return Math.max(0, Math.round((sub - credit) * 100) / 100);
}
function updateCheckoutDue() {
  var due = checkoutDue();
  if ($('sale-cash-due')) $('sale-cash-due').textContent = fmt(due);
  if ($('cart-due')) $('cart-due').textContent = fmt(due);
  if (PAY_METHOD === 'link' && $('sale-pay-link') && !$('sale-pay-link').value) {
    var u = paymentLinkForAmount(due);
    if (u) $('sale-pay-link').value = u;
  }
}
function toggleShipFields() {
  var on = $('sale-needs-ship') && $('sale-needs-ship').checked;
  var box = $('ship-fields');
  if (box) box.classList.toggle('open', !!on);
}
function captureCustomerFromForm() {
  var name = normalizeCustName($('log-customer') && $('log-customer').value);
  if (!name) return null;
  var list = getCustomers();
  var c = list.find(function (x) { return (x.name || '').toLowerCase() === name.toLowerCase(); });
  if (!c) {
    c = { id: Date.now() + Math.floor(Math.random() * 999), name: name, balance: 0, history: [], createdAt: new Date().toISOString() };
    list.push(c);
  }
  c.email = (($('log-email') && $('log-email').value) || c.email || '').trim();
  c.phone = (($('log-phone') && $('log-phone').value) || c.phone || '').trim();
  c.address = (($('log-addr') && $('log-addr').value) || c.address || '').trim();
  c.city = (($('log-city') && $('log-city').value) || c.city || '').trim();
  c.state = (($('log-state') && $('log-state').value) || c.state || '').trim();
  c.zip = (($('log-zip') && $('log-zip').value) || c.zip || '').trim();
  saveCustomers(list);
  return c;
}
function fillCustomerContact(c) {
  if (!c) return;
  if ($('log-email') && c.email) $('log-email').value = c.email;
  if ($('log-phone') && c.phone) $('log-phone').value = c.phone;
  if ($('log-addr') && c.address) $('log-addr').value = c.address;
  if ($('log-city') && c.city) $('log-city').value = c.city;
  if ($('log-state') && c.state) $('log-state').value = c.state;
  if ($('log-zip') && c.zip) $('log-zip').value = c.zip;
}

function checkoutCart() {
  if (!CART.length) {
    if (typeof _logSaleCore === 'function') return _logSaleCore();
    if (typeof logSale === 'function') return logSale();
    return;
  }
  for (var i = 0; i < CART.length; i++) {
    if (!num(CART[i].price)) { toast('Set a price on every line (or Use market)', 'err'); selectCartLine(i); return; }
  }
  var customer = captureCustomerFromForm();
  var custName = customer ? customer.name : normalizeCustName($('log-customer') && $('log-customer').value);
  var applyCredit = !!( $('log-apply-credit') && $('log-apply-credit').checked );
  var saleTotal = cartSubtotal();
  var creditApplied = 0;
  var creditBalance = null;
  if (applyCredit && custName) {
    creditApplied = Math.min(num($('log-credit-amt') && $('log-credit-amt').value), saleTotal);
    var cust = findCustomerByName(custName);
    if (!cust) { toast('Customer not found for store credit', 'err'); return; }
    if (creditApplied > cust.balance + 0.001) { toast('Credit exceeds balance', 'err'); return; }
    if (creditApplied > 0) {
      try {
        var updated = redeemCustomerCredit(custName, creditApplied, 'Sale cart', 'sale');
        creditBalance = updated.balance;
      } catch (e) { toast(e.message || 'Credit apply failed', 'err'); return; }
    }
  }
  var cashPaid = Math.round((saleTotal - creditApplied) * 100) / 100;
  var location = ($('sale-location') && $('sale-location').value) || 'Counter';
  var date = ($('sale-date') && $('sale-date').value) || d8();
  var needsShip = !!( $('sale-needs-ship') && $('sale-needs-ship').checked );
  var payStatus = PAY_METHOD === 'link' ? (($('sale-mark-paid') && $('sale-mark-paid').checked) ? 'paid' : 'pending') : 'paid';
  var payLink = ($('sale-pay-link') && $('sale-pay-link').value) || '';
  var notePay = (($('sale-pay-note') && $('sale-pay-note').value) || '').trim();
  var shipping = needsShip ? {
    address: ($('log-addr') && $('log-addr').value) || '',
    city: ($('log-city') && $('log-city').value) || '',
    state: ($('log-state') && $('log-state').value) || '',
    zip: ($('log-zip') && $('log-zip').value) || ''
  } : null;
  var groupId = Date.now();
  var lines = [];
  var remainingCredit = creditApplied;
  CART.forEach(function (line, li) {
    var sku = (line.sku || '').toUpperCase();
    var name = line.name || '';
    var price = num(line.price);
    var cost = num(line.cost);
    var qty = int(line.qty, 1);
    var condition = line.condition || 'NM';
    var inv = DB.inventory;
    var remaining = qty;
    var kind = line.kind || 'raw';
    for (var i = 0; i < inv.length && remaining > 0; i++) {
      var sameSku = sku && inv[i].sku === sku;
      var sameName = !sku && name && (inv[i].name || '').toLowerCase() === name.toLowerCase();
      if (inv[i].qty > 0 && (sameSku || sameName)) {
        if (!cost && inv[i].cost) cost = inv[i].cost;
        kind = inv[i].kind || kind;
        var take = Math.min(inv[i].qty, remaining);
        inv[i].qty -= take;
        remaining -= take;
      }
    }
    DB.inventory = inv.filter(function (x) { return x.qty > 0; });
    var lineTotal = price * qty;
    var lineCredit = 0;
    if (remainingCredit > 0) {
      lineCredit = Math.min(remainingCredit, lineTotal);
      remainingCredit -= lineCredit;
    }
    var sale = {
      id: groupId + li,
      groupId: groupId,
      sku: sku, name: name, price: price, cost: cost, qty: qty, location: location, date: date,
      condition: condition, kind: kind, profit: (price - cost) * qty,
      customer: custName || '',
      customerEmail: customer && customer.email || '',
      customerPhone: customer && customer.phone || '',
      creditApplied: lineCredit,
      cashPaid: Math.round((lineTotal - lineCredit) * 100) / 100,
      paymentMethod: PAY_METHOD,
      paymentStatus: payStatus,
      paymentLink: payLink,
      paymentNote: notePay,
      needsShip: needsShip,
      shipping: shipping
    };
    DB.sales.push(sale);
    lines.push({ name: name, sku: sku, qty: qty, price: price });
  });
  DB.saveInventory();
  DB.saveSales();
  toast('Sale logged — ' + lines.length + ' line' + (lines.length === 1 ? '' : 's') + ' · ' + fmt(saleTotal), 'ok');
  if (typeof renderRecentSales === 'function') renderRecentSales();
  if (typeof renderFastSale === 'function') renderFastSale();
  if (typeof renderStorefront === 'function') renderStorefront();
  if (typeof refreshCustomerDatalist === 'function') refreshCustomerDatalist();
  if (typeof openPrintableReceipt === 'function') {
    openPrintableReceipt({
      title: 'Sale receipt',
      date: date,
      location: location,
      customer: custName || '',
      lines: lines,
      subtotal: saleTotal,
      creditApplied: creditApplied || 0,
      cashPaid: cashPaid,
      creditBalance: creditBalance,
      notes: (PAY_METHOD !== 'cash' ? ('Payment: ' + PAY_METHOD + (payStatus === 'pending' ? ' (pending)' : ' (paid)')) : '') +
        (needsShip ? ' · Ships to customer' : '')
    });
  }
  clearCart();
  if ($('log-apply-credit')) $('log-apply-credit').checked = false;
  if ($('sale-needs-ship')) $('sale-needs-ship').checked = false;
  toggleShipFields();
  setTimeout(focusSaleScanField, 40);
}

function setMeetSide(side) {
  MEET_SIDE = side === 'buy' ? 'buy' : 'sell';
  document.querySelectorAll('.mode-switch [data-side]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-side') === MEET_SIDE);
  });
  var sell = $('meet-sell-pane');
  var buy = $('meet-buy-hint');
  if (sell) sell.style.display = MEET_SIDE === 'sell' ? '' : 'none';
  if (buy) buy.style.display = MEET_SIDE === 'buy' ? '' : 'none';
  if (MEET_SIDE === 'buy') {
    toast('Buy side — opening Trade-in', 'ok');
    setTimeout(function () { switchTab('buylist'); }, 80);
  }
}

function openSheet(id) {
  var el = $(id);
  if (el) { el.classList.add('open'); el.style.display = 'flex'; }
}
function closeSheet(id) {
  var el = $(id);
  if (!el) return;
  if (typeof window.__ctAnimateClose === 'function' && (el.classList.contains('open') || (el.style && el.style.display === 'flex'))) {
    el.classList.add('open');
    window.__ctAnimateClose(el, false);
    setTimeout(function () { try { el.style.display = 'none'; } catch (e) {} }, 280);
  } else {
    el.classList.remove('open', 'ct-closing');
    el.style.display = 'none';
  }
}
function toggleMoreMenu() {
  var m = $('more-menu');
  if (m) m.classList.toggle('open');
}
document.addEventListener('click', function (e) {
  var m = $('more-menu');
  if (!m || !m.classList.contains('open')) return;
  if (e.target.closest && (e.target.closest('#more-menu') || e.target.closest('#btn-more'))) return;
  m.classList.remove('open');
});

var CT_SCHEMES = [
  { id:'graphite', name:'Graphite', hint:'Cool gray + electric blue', sw:['#0B0F14','#3B82F6','#38BDF8'] },
  { id:'aurora', name:'Aurora', hint:'Teal / green', sw:['#071210','#14B8A6','#34D399'] },
  { id:'ember', name:'Ember', hint:'Amber / orange', sw:['#120C08','#F59E0B','#FB923C'] },
  { id:'cobalt', name:'Cobalt', hint:'Deep blue', sw:['#060B16','#2563EB','#38BDF8'] },
  { id:'venom', name:'Venom', hint:'Toxic green', sw:['#070F08','#22C55E','#A3E635'] },
  { id:'royal', name:'Royal', hint:'Purple (not pink)', sw:['#0C0814','#8B5CF6','#C4B5FD'] },
  { id:'crimson', name:'Crimson', hint:'Red / black', sw:['#100808','#EF4444','#7F1D1D'] },
  { id:'arctic', name:'Arctic', hint:'Ice white-on-blue', sw:['#071018','#38BDF8','#E0F2FE'] },
  { id:'sunset', name:'Sunset', hint:'Coral / gold', sw:['#120A08','#FB7185','#F59E0B'] },
  { id:'neon', name:'Neon', hint:'Cyberpunk multi', sw:['#05050A','#22D3EE','var(--accent)'] },
  { id:'pink-foil', name:'Pink foil', hint:'Classic magenta (optional)', sw:['#07060B','var(--accent)','#22D3EE'] },
  { id:'matcha', name:'Matcha', hint:'Soft sage', sw:['#0A100C','#86EFAC','#4ADE80'] }
];
function schemeMeta(id) {
  for (var i = 0; i < CT_SCHEMES.length; i++) if (CT_SCHEMES[i].id === id) return CT_SCHEMES[i];
  return CT_SCHEMES[0];
}
function applyColorScheme(id, persist) {
  var s = loadSettings();
  var sid = id || s.colorScheme || 'graphite';
  var ok = false;
  for (var i = 0; i < CT_SCHEMES.length; i++) if (CT_SCHEMES[i].id === sid) { ok = true; break; }
  if (!ok) sid = 'graphite';
  s.colorScheme = sid;
  if (persist !== false) saveSettings(s);
  document.documentElement.setAttribute('data-scheme', sid);
  var lab = $('scheme-chip-label');
  if (lab) lab.textContent = schemeMeta(sid).name;
  renderSchemePicker();
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    var dark = s.theme !== 'light';
    meta.setAttribute('content', dark ? getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0B0F14' : '#F4F6F9');
  }
}
function cycleColorScheme() {
  var s = loadSettings();
  var cur = s.colorScheme || 'graphite';
  var idx = 0;
  for (var i = 0; i < CT_SCHEMES.length; i++) if (CT_SCHEMES[i].id === cur) { idx = i; break; }
  applyColorScheme(CT_SCHEMES[(idx + 1) % CT_SCHEMES.length].id, true);
  try { toast('Theme: ' + schemeMeta(loadSettings().colorScheme).name, 'ok'); } catch (e) {}
}
function renderSchemePicker() {
  var grid = $('scheme-picker');
  if (!grid) return;
  var cur = (loadSettings().colorScheme || 'graphite');
  grid.innerHTML = CT_SCHEMES.map(function (sc) {
    return '<button type="button" class="scheme-swatch' + (sc.id === cur ? ' active' : '') + '" data-scheme="' + sc.id + '" onclick="applyColorScheme(\'' + sc.id + '\', true)">' +
      '<div class="bars"><i style="background:' + sc.sw[0] + '"></i><i style="background:' + sc.sw[1] + '"></i><i style="background:' + sc.sw[2] + '"></i></div>' +
      '<span class="name">' + sc.name + '</span><span class="hint">' + sc.hint + '</span></button>';
  }).join('');
}
function applyTheme() {
  var s = loadSettings();
  if (s.theme !== 'light' && s.theme !== 'dark') {
    s.theme = 'dark';
    saveSettings(s);
  }
  if (!s.colorScheme) {
    s.colorScheme = 'graphite';
    saveSettings(s);
  }
  var dark = s.theme !== 'light';
  document.documentElement.classList.toggle('theme-dark', dark);
  document.documentElement.classList.toggle('theme-light', !dark);
  applyColorScheme(s.colorScheme, false);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0B0F14' : '#F4F6F9');
  var t = $('btn-theme');
  if (t) { t.setAttribute('aria-label', dark ? 'Switch to light' : 'Switch to dark'); t.title = dark ? 'Light mode' : 'Dark mode'; }
  if ($('set-theme-dark')) $('set-theme-dark').checked = dark;
}

/* ===== Command palette ===== */
var _cmdItems = [];
var _cmdActive = 0;
function buildCommandItems() {
  var items = [
    { id:'meet', label:'Meet checkout', ico:'meet', run:function(){ switchTab('log'); }, meta:'Meet' },
    { id:'inv', label:'Inventory', ico:'inventory', run:function(){ switchTab('inventory'); }, meta:'Stock' },
    { id:'trade', label:'Trade-in', ico:'trade', run:function(){ switchTab('buylist'); }, meta:'Buy' },
    { id:'sf', label:'Storefront', ico:'storefront', run:function(){ switchTab('storefront'); }, meta:'Shop' },
    { id:'cust', label:'Customers', ico:'customers', run:function(){ switchTab('customers'); }, meta:'CRM' },
    { id:'ins', label:'Insights', ico:'insights', run:function(){ switchTab('reports'); }, meta:'Edge' },
    { id:'scan', label:'Receipt / box scan', ico:'scan', run:function(){ switchTab('scan'); }, meta:'Scan' },
    { id:'set', label:'Settings', ico:'settings', run:function(){ switchTab('shop'); }, meta:'Config' },
    { id:'bulk', label:'Bulk SKU queue', ico:'list', run:function(){ switchTab('inventory'); var t=$('bulk-sku-input'); if(t)t.focus(); }, meta:'Scan' },
    { id:'analytics', label:'Export analytics CSV', ico:'download', run:function(){ exportAnalyticsCsv(); }, meta:'Data' },
    { id:'sample', label:'Load sample shop', ico:'spark', run:function(){ if (typeof loadSampleShop==='function') loadSampleShop(true); }, meta:'Demo' },
    { id:'backup', label:'Backup JSON', ico:'backup', run:function(){ backupJSON(); }, meta:'Data' }
  ];
  CT_SCHEMES.forEach(function(sc){
    items.push({
      id:'theme-'+sc.id,
      label:'Theme: '+sc.name,
      ico:'palette',
      run:function(){ applyColorScheme(sc.id, true); try{toast('Theme: '+sc.name,'ok');}catch(e){} },
      meta: sc.id
    });
  });
  // Inventory SKU / name jumps
  try {
    var inv = (typeof DB !== 'undefined' && DB.inventory) ? DB.inventory : [];
    inv.slice(0, 80).forEach(function(it){
      if (!it) return;
      var label = (it.name || 'Item') + (it.sku ? ' · '+it.sku : '');
      items.push({
        id:'sku-'+(it.id||it.sku||label),
        label: label,
        ico:'tag',
        run:function(){
          switchTab('inventory');
          var q = $('inv-search');
          if (q) { q.value = it.sku || it.name || ''; if (typeof renderInventory==='function') renderInventory(); }
        },
        meta: it.sku || 'SKU'
      });
    });
  } catch (e) {}
  try {
    var custs = (typeof getCustomers === 'function') ? getCustomers() : [];
    (custs || []).slice(0, 40).forEach(function(c){
      if (!c || !c.name) return;
      items.push({
        id:'cust-'+(c.id||c.name),
        label: 'Customer: '+c.name,
        ico:'user',
        run:function(){ switchTab('customers'); },
        meta: 'CRM'
      });
    });
  } catch (e) {}
  return items;
}
function openCommandPalette() {
  var bd = $('cmd-palette');
  if (!bd) return;
  bd.classList.add('open');
  _cmdItems = buildCommandItems();
  _cmdActive = 0;
  var inp = $('cmd-input');
  if (inp) { inp.value = ''; inp.focus(); }
  renderCommandPalette('');
}
function closeCommandPalette() {
  var bd = $('cmd-palette');
  if (bd) bd.classList.remove('open');
}
function renderCommandPalette(q) {
  var list = $('cmd-list');
  if (!list) return;
  q = (q || '').trim().toLowerCase();
  var filtered = !_cmdItems.length ? [] : _cmdItems.filter(function(it){
    if (!q) return it.id.indexOf('theme-') !== 0 && it.id.indexOf('sku-') !== 0 && it.id.indexOf('cust-') !== 0 || q;
    // when empty show nav actions only; when typing show all matches
    return (it.label + ' ' + (it.meta||'') + ' ' + it.id).toLowerCase().indexOf(q) !== -1;
  });
  if (!q) {
    filtered = _cmdItems.filter(function(it){ return it.id.indexOf('theme-')!==0 && it.id.indexOf('sku-')!==0 && it.id.indexOf('cust-')!==0; });
    // also show first few themes
    filtered = filtered.concat(_cmdItems.filter(function(it){ return it.id.indexOf('theme-')===0; }).slice(0,4));
  }
  filtered = filtered.slice(0, 40);
  if (_cmdActive >= filtered.length) _cmdActive = 0;
  if (!filtered.length) {
    list.innerHTML = '<div class="cmd-empty">No matches</div>';
    list._cmds = [];
    return;
  }
  list._cmds = filtered;
  list.innerHTML = filtered.map(function(it, i){
    return '<button type="button" class="cmd-item'+(i===_cmdActive?' active':'')+'" data-i="'+i+'" onclick="runCommandAt('+i+')">' +
      '<span class="cmd-ico">'+(typeof icon==='function'?icon(it.ico||'bolt'):(it.ico||'•'))+'</span><span>'+it.label+'</span>' +
      '<span class="cmd-meta">'+(it.meta||'')+'</span></button>';
  }).join('');
}
function runCommandAt(i) {
  var list = $('cmd-list');
  var cmds = list && list._cmds;
  if (!cmds || !cmds[i]) return;
  closeCommandPalette();
  try { cmds[i].run(); } catch (e) { console.warn(e); }
}
function onCmdKey(e) {
  var list = $('cmd-list');
  var cmds = list && list._cmds || [];
  if (e.key === 'Escape') { e.preventDefault(); closeCommandPalette(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); _cmdActive = Math.min(_cmdActive+1, Math.max(0,cmds.length-1)); renderCommandPalette(($('cmd-input')||{}).value); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); _cmdActive = Math.max(_cmdActive-1, 0); renderCommandPalette(($('cmd-input')||{}).value); return; }
  if (e.key === 'Enter') { e.preventDefault(); runCommandAt(_cmdActive); }
}
document.addEventListener('keydown', function(e){
  var tag = (e.target && e.target.tagName) || '';
  var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
  if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (typing && e.target && e.target.id !== 'cmd-input') return;
    e.preventDefault();
    openCommandPalette();
  }
  if (e.key === 'Escape') {
    var bd = $('cmd-palette');
    if (bd && bd.classList.contains('open')) closeCommandPalette();
  }
});

function toggleTheme() {
  var s = loadSettings();
  s.theme = s.theme === 'light' ? 'dark' : 'light';
  saveSettings(s);
  applyTheme();
}
function toggleMeetMode() {
  var s = loadSettings();
  setShowMode(!s.showMode);
}
function isStorefrontPublic() {
  try {
    var q = new URLSearchParams(location.search || '');
    if (q.get('storefront') === '1' || q.get('store') === '1') return true;
    if (q.get('c')) return true;
  } catch (e) {}
  var h = (location.hash || '');
  if (h === '#storefront' || h.indexOf('#storefront/') === 0) return true;
  return false;
}
function storefrontCustomerIdFromUrl() {
  try {
    var q = new URLSearchParams(location.search || '');
    var c = q.get('c') || q.get('customer') || '';
    if (c) return String(c);
  } catch (e) {}
  var h = (location.hash || '');
  if (h.indexOf('#storefront/') === 0) return decodeURIComponent(h.slice('#storefront/'.length).split('?')[0] || '');
  return '';
}
function enterStorefrontPublic() {
  document.body.classList.add('storefront-public');
  switchTab('storefront');
  try { hydrateSfCustomerFromUrl(); } catch (e) {}
}

function storefrontPrice(item) {
  if (item.listPrice) return num(item.listPrice);
  var last = lastSalePrice(item);
  if (last) return last;
  if (item.market) return num(item.market);
  return num(item.cost) ? Math.round(num(item.cost) * 1.5 * 100) / 100 : 0;
}
function renderStorefront() {
  var grid = $('sf-grid');
  if (!grid) return;
  var q = (($('sf-search') && $('sf-search').value) || '').toLowerCase().trim();
  var filter = ($('sf-filter') && $('sf-filter').value) || 'all';
  var items = (DB.inventory || []).filter(function (i) {
    if (!i.qty) return false;
    if (filter !== 'all') {
      var g = (typeof itemKindGroup === 'function') ? itemKindGroup(i) : (i.kind || 'raw');
      if (g !== filter) return false;
    }
    if (!q) return true;
    return (i.name || '').toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q) || (i.set || '').toLowerCase().includes(q);
  });
  var shop = (loadSettings().shopName || 'CardTrack Shop');
  if ($('sf-shop-name')) $('sf-shop-name').textContent = shop;
  if ($('sf-count')) $('sf-count').textContent = items.length + (items.length === 1 ? ' item' : ' items');
  if (!items.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-title">Nothing on the shelf yet</div><div class="empty-hint">Add stock in Inventory. Public visitors see only in-stock items.</div></div>';
    return;
  }
  grid.innerHTML = items.map(function (i) {
    var price = storefrontPrice(i);
    var idx = DB.inventory.indexOf(i);
    var art = (typeof cardArtHtml === 'function') ? cardArtHtml(i.imageLarge || i.image || '', 'card-art-sf', true) : '';
    return '<article class="sf-card">' +
      '<div class="sf-art-wrap">' + art + '</div>' +
      '<div class="sf-name">' + esc(i.name || i.sku || 'Item') + '</div>' +
      '<div class="sf-meta">' + esc(kindLabel(i)) + ' · ' + esc(i.condition || 'NM') +
      (i.set ? ' · ' + esc(i.set) : '') + (i.number ? ' · #' + esc(i.number) : '') +
      (i.qty > 1 ? ' · ' + i.qty + ' left' : '') + '</div>' +
      '<div class="sf-price">' + ((typeof ctLivePriceRowHtml === 'function') ? ctLivePriceRowHtml(i) : ('<span class="sf-price-chip">' + (price ? fmt(price) : 'Inquire') + '</span>')) + '</div>' +
      '<div class="btn-row">' +
      '<button class="btn btn-primary" type="button" onclick="sfAddToCart(' + idx + ')">Add</button>' +
      '<button class="btn btn-secondary" type="button" style="flex:1" onclick="storefrontRequest(' + idx + ')">Request</button>' +
      '</div></article>';
  }).join('');
  if (typeof scheduleInventoryArtBackfill === 'function') scheduleInventoryArtBackfill();
}
function storefrontRequest(idx) {
  var item = DB.inventory[idx];
  if (!item) return;
  var shop = loadSettings();
  var email = shop.inquiryEmail || '';
  var subj = encodeURIComponent('Reserve: ' + (item.name || item.sku || 'item'));
  var body = encodeURIComponent('Hi ' + (shop.shopName || 'shop') + ',\n\nI would like to reserve:\n' + (item.name || '') + (item.sku ? ' (' + item.sku + ')' : '') + '\n\nThanks');
  if (email) {
    location.href = 'mailto:' + email + '?subject=' + subj + '&body=' + body;
  } else {
    toast('Reservation noted — shop will follow up. Add an inquiry email in Settings to enable mailto.', 'ok');
    try {
      var holds = JSON.parse(localStorage.getItem('ct_holds') || '[]');
      holds.unshift({ id: Date.now(), sku: item.sku, name: item.name, ts: new Date().toISOString(), status: 'requested' });
      localStorage.setItem('ct_holds', JSON.stringify(holds.slice(0, 200)));
    } catch (e) {}
  }
}
function storefrontPay(idx) {
  var item = DB.inventory[idx];
  if (!item) return;
  var price = storefrontPrice(item);
  var url = paymentLinkForAmount(price);
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
    toast('Opened payment link', 'ok');
    return;
  }
  storefrontRequest(idx);
}
function copyStorefrontLink() {
  var url = location.origin + location.pathname + '?storefront=1';
  if (location.protocol === 'file:') url = location.href.split('?')[0].split('#')[0] + '?storefront=1';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () { toast('Storefront link copied', 'ok'); }).catch(function () { prompt('Storefront URL', url); });
  } else prompt('Storefront URL', url);
}

function renderArbInsights() {
  var box = $('arb-edges');
  if (!box) return;
  var rows = [];
  (DB.inventory || []).forEach(function (i) {
    var mkt = i.market != null ? num(i.market) : 0;
    if (!mkt && i.name) {
      try {
        var store = typeof loadCompsStore === 'function' ? loadCompsStore() : null;
        var key = typeof nameOnlyKey === 'function' ? nameOnlyKey(i.name) : '';
        var g = store && store.guide && store.guide[key];
        if (g && g.market) mkt = num(g.market);
      } catch (e) {}
    }
    if (!mkt || !i.cost) return;
    var edge = edgeDollars(mkt, i.cost);
    if (edge == null) return;
    rows.push({ name: i.name || i.sku, sku: i.sku, cost: num(i.cost), market: mkt, edge: edge, qty: i.qty, kind: kindLabel(i) });
  });
  rows.sort(function (a, b) { return b.edge - a.edge; });
  if (!rows.length) {
    box.innerHTML = '<div class="text-muted" style="font-size:13px;padding:8px 0">No cost-vs-market edges yet. Use comps on Meet or import a price guide.</div>';
    return;
  }
  box.innerHTML = rows.slice(0, 25).map(function (r) {
    return '<div class="dead-row"><div><strong>' + esc(r.name) + '</strong><div class="text-muted">' + esc(r.kind) + ' · cost ' + fmt(r.cost) + ' · mkt ' + fmt(r.market) + '</div></div>' +
      '<span class="edge-badge' + (r.edge < 0 ? ' neg' : '') + '">' + (r.edge >= 0 ? '+' : '') + fmt(r.edge) + '</span></div>';
  }).join('');
}

function onRegisterSearch(q) {
  if ($('fast-sale-q')) $('fast-sale-q').value = q;
  if ($('log-find')) $('log-find').value = q;
  if ($('log-sku') && q && !/\s/.test(q)) $('log-sku').value = q.toUpperCase();
  if (typeof renderInvPicker === 'function') renderInvPicker(q);
  if (typeof renderFastSale === 'function') renderFastSale();
}

function patchPosHooks() {
  if (typeof fillFromInventory === 'function' && !fillFromInventory._pos) {
    var _fill = fillFromInventory;
    fillFromInventory = function (idx) {
      addInventoryToCart(idx);
      _fill(idx);
      if ($('log-price') && CART[CART_SEL] && CART[CART_SEL].price) {
        $('log-price').value = Number(CART[CART_SEL].price).toFixed(2);
      }
    };
    fillFromInventory._pos = true;
  }
  if (typeof fastSell === 'function' && !fastSell._pos) {
    fastSell = function (idx) { addInventoryToCart(idx); };
    fastSell._pos = true;
  }
  if (typeof useCompPrice === 'function' && !useCompPrice._pos) {
    var _use = useCompPrice;
    useCompPrice = function (ctx, which) {
      _use(ctx, which);
      if (ctx === 'sale' && CART_SEL >= 0 && CART[CART_SEL] && $('log-price')) {
        CART[CART_SEL].price = num($('log-price').value);
        var st = typeof _compState !== 'undefined' ? _compState.sale : null;
        if (st && st.market != null) CART[CART_SEL].market = st.market;
        renderCart();
      }
      if (ctx === 'buylist') {
        var st2 = typeof _compState !== 'undefined' ? _compState.buylist : null;
        if (st2 && $('bl-market') && !$('bl-market').value && st2.market) $('bl-market').value = (+st2.market).toFixed(2);
      }
    };
    useCompPrice._pos = true;
  }
  if (typeof logSale === 'function' && !logSale._pos) {
    _logSaleCore = logSale;
    logSale = function () {
      if (CART.length) return checkoutCart();
      if (_logSaleCore) {
        var r = _logSaleCore();
        try { stampLastSaleExtras(); } catch (e) {}
        return r;
      }
    };
    logSale._pos = true;
  }
  if (typeof updateSaleCreditPreview === 'function' && !updateSaleCreditPreview._pos) {
    var _prev = updateSaleCreditPreview;
    updateSaleCreditPreview = function () {
      if (CART.length && $('log-price')) {
        /* preview uses cart total via updateCheckoutDue */
      }
      _prev();
      updateCheckoutDue();
    };
    updateSaleCreditPreview._pos = true;
  }
  if (typeof onSaleCustomerInput === 'function' && !onSaleCustomerInput._pos) {
    var _oci = onSaleCustomerInput;
    onSaleCustomerInput = function () {
      _oci();
      var name = normalizeCustName($('log-customer') && $('log-customer').value);
      var c = name ? findCustomerByName(name) : null;
      if (c) fillCustomerContact(c);
    };
    onSaleCustomerInput._pos = true;
  }
  if (typeof renderInventory === 'function' && !renderInventory._pos) {
    var _ri = renderInventory;
    renderInventory = function () {
      _ri();
      try { decorateInventoryEdges(); } catch (e) {}
    };
    renderInventory._pos = true;
  }
  if (typeof renderReports === 'function' && !renderReports._pos) {
    var _rr = renderReports;
    renderReports = function () {
      _rr();
      try { renderArbInsights(); } catch (e) {}
    };
    renderReports._pos = true;
  }
  if (typeof applyShopChrome === 'function' && !applyShopChrome._pos) {
    var _asc = applyShopChrome;
    applyShopChrome = function () {
      _asc();
      applyTheme();
      var s = loadSettings();
      var mt = $('meet-toggle');
      if (mt) mt.classList.toggle('on', !!s.showMode);
      var pill = $('show-mode-pill');
      if (pill) { pill.textContent = 'Meet'; pill.style.display = s.showMode ? 'inline-flex' : 'none'; }
      if ($('set-pay-link')) $('set-pay-link').value = s.paymentLinkUrl || '';
      if ($('set-inquiry-email')) $('set-inquiry-email').value = s.inquiryEmail || '';
      if ($('set-theme-dark')) $('set-theme-dark').checked = s.theme === 'dark';
      var p2p = s.p2p || {};
      if ($('set-p2p-cashapp')) $('set-p2p-cashapp').value = p2p.cashapp || '';
      if ($('set-p2p-venmo')) $('set-p2p-venmo').value = p2p.venmo || '';
      if ($('set-p2p-zelle')) $('set-p2p-zelle').value = p2p.zelle || '';
      if ($('set-p2p-paypal')) $('set-p2p-paypal').value = p2p.paypal || '';
      if (typeof renderPromoList === 'function') renderPromoList();
    };
    applyShopChrome._pos = true;
  }
  if (typeof defaultSettings === 'function' && !defaultSettings._pos) {
    var _ds = defaultSettings;
    defaultSettings = function () {
      var d = _ds();
      d.theme = d.theme || 'dark';
      d.paymentLinkUrl = d.paymentLinkUrl || '';
      d.inquiryEmail = d.inquiryEmail || '';
      d.p2p = d.p2p || { cashapp: '', venmo: '', zelle: '', paypal: '' };
      d.promos = Array.isArray(d.promos) ? d.promos : [];
      d.gridSize = d.gridSize || 'L';
      if (d.livePrices == null) d.livePrices = true;
      if (d.livePriceIntervalSec == null) d.livePriceIntervalSec = 120;
      return d;
    };
    defaultSettings._pos = true;
  }
  if (typeof switchTab === 'function' && !switchTab._pos) {
    var _st = switchTab;
    switchTab = function (name) {
      var aliases = { sale: 'log', register: 'log', meet: 'log', home: 'home', dashboard: 'home', stock: 'inventory', 'buy-in': 'buylist', credit: 'customers', reports: 'reports', insights: 'reports', shop: 'shop', settings: 'shop' };
      if (aliases[name]) name = aliases[name];
      if (name === 'insights') name = 'reports';
      _st(name);
      var m = $('more-menu');
      if (m) m.classList.remove('open');
      if (name === 'storefront') renderStorefront();
      if (name === 'log') { renderCart(); setTimeout(focusSaleScanField, 30); }
      if (name === 'reports') renderArbInsights();
    };
    switchTab._pos = true;
  }
  if (typeof renderCustomers === 'function' && !renderCustomers._pos) {
    var _rc = renderCustomers;
    renderCustomers = function () {
      _rc();
      try { decorateCustomerCards(); } catch (e) {}
    };
    renderCustomers._pos = true;
  }
  if (typeof focusSaleScanField === 'function' && !focusSaleScanField._pos) {
    focusSaleScanField = function () {
      var el = $('reg-search') || $('log-sku') || $('fast-sale-q');
      if (!el) return;
      try { el.focus({ preventScroll: false }); if (el.value && el.select) el.select(); } catch (e) { try { el.focus(); } catch (e2) {} }
    };
    focusSaleScanField._pos = true;
  }
  if (typeof lookupSkuShowFloor === 'function' && !lookupSkuShowFloor._pos) {
    lookupSkuShowFloor = function () {
      var sku = (($('reg-search') && $('reg-search').value) || ($('fast-sale-q') && $('fast-sale-q').value) || ($('log-sku') && $('log-sku').value) || '').trim().toUpperCase();
      if (!sku) { if (typeof renderFastSale === 'function') renderFastSale(); return; }
      if ($('log-sku')) $('log-sku').value = sku;
      var exact = findInventoryBySku(sku);
      if (exact) { addInventoryToCart(DB.inventory.indexOf(exact)); if ($('reg-search')) $('reg-search').value = ''; return; }
      if (typeof renderInvPicker === 'function') renderInvPicker(sku);
      toast('No exact SKU — showing search', 'err');
    };
    lookupSkuShowFloor._pos = true;
  }
}

function stampLastSaleExtras() {
  if (!DB.sales || !DB.sales.length) return;
  var s = DB.sales[DB.sales.length - 1];
  if (!s || s.paymentMethod) return;
  s.paymentMethod = PAY_METHOD;
  s.paymentStatus = PAY_METHOD === 'link' ? (($('sale-mark-paid') && $('sale-mark-paid').checked) ? 'paid' : 'pending') : 'paid';
  s.paymentLink = ($('sale-pay-link') && $('sale-pay-link').value) || '';
  s.needsShip = !!( $('sale-needs-ship') && $('sale-needs-ship').checked );
  var c = captureCustomerFromForm();
  if (c) {
    s.customerEmail = c.email || '';
    s.customerPhone = c.phone || '';
    if (s.needsShip) s.shipping = { address: c.address, city: c.city, state: c.state, zip: c.zip };
  }
  DB.saveSales();
}

function decorateInventoryEdges() {
  var rows = document.querySelectorAll('#inventory-list tr[id^="inv-row-"]');
  rows.forEach(function (tr) {
    var idx = parseInt((tr.id || '').replace('inv-row-', ''), 10);
    var item = DB.inventory[idx];
    if (!item) return;
    var mkt = item.market;
    if (!mkt && item.name && typeof loadCompsStore === 'function') {
      var store = loadCompsStore();
      var key = typeof nameOnlyKey === 'function' ? nameOnlyKey(item.name) : '';
      var g = store && store.guide && store.guide[key];
      if (g && g.market) mkt = g.market;
    }
    if (!mkt || !item.cost) return;
    var td = tr.querySelector('td');
    if (td && !td.querySelector('.edge-badge')) td.insertAdjacentHTML('beforeend', ' ' + edgeBadgeHtml(mkt, item.cost));
  });
}
function decorateCustomerCards() {
  var box = $('customers-list');
  if (!box) return;
  box.querySelectorAll('.cust-row').forEach(function (row) {
    if (row.querySelector('.cust-qr-btn')) return;
    var btnRow = row.querySelector('.btn-row');
    if (!btnRow) return;
    var useBtn = btnRow.querySelector('button');
    var idMatch = (useBtn && useBtn.getAttribute('onclick') || '').match(/useCustomerOnSale\('([^']+)'\)/);
    var id = idMatch ? idMatch[1] : '';
    if (!id) return;
    var qr = document.createElement('button');
    qr.className = 'btn btn-secondary cust-qr-btn';
    qr.type = 'button';
    qr.textContent = 'Show QR';
    qr.setAttribute('onclick', "showCustomerQr('" + id.replace(/'/g, '') + "')");
    btnRow.appendChild(qr);
    var link = document.createElement('button');
    link.className = 'btn btn-secondary';
    link.type = 'button';
    link.textContent = 'Copy link';
    link.setAttribute('onclick', "copyCustomerStorefrontLink('" + id.replace(/'/g, '') + "')");
    btnRow.appendChild(link);
  });
}

function saveShopExtrasFromForm() {
  var s = loadSettings();
  if ($('set-pay-link')) s.paymentLinkUrl = $('set-pay-link').value.trim();
  if ($('set-inquiry-email')) s.inquiryEmail = $('set-inquiry-email').value.trim();
  if ($('set-theme-dark')) s.theme = $('set-theme-dark').checked ? 'dark' : 'light';
  s.p2p = s.p2p || { cashapp: '', venmo: '', zelle: '', paypal: '' };
  if ($('set-p2p-cashapp')) s.p2p.cashapp = $('set-p2p-cashapp').value.trim();
  if ($('set-p2p-venmo')) s.p2p.venmo = $('set-p2p-venmo').value.trim();
  if ($('set-p2p-zelle')) s.p2p.zelle = $('set-p2p-zelle').value.trim();
  if ($('set-p2p-paypal')) s.p2p.paypal = $('set-p2p-paypal').value.trim();
  if (!Array.isArray(s.promos)) s.promos = [];
  saveSettings(s);
  applyTheme();
  if (typeof renderPromoList === 'function') renderPromoList();
}

function ctInitPos() {
  patchPosHooks();
  applyTheme();
  renderCart();
  setPayMethod(PAY_METHOD);
  if ($('sale-date') && !$('sale-date').value) $('sale-date').value = d8();
  if (isStorefrontPublic()) {
    enterStorefrontPublic();
    renderStorefront();
    return;
  }
  try { renderStorefront(); } catch (e) {}
}

if (typeof window !== 'undefined') {
  window.CART = CART;
  window.addInventoryToCart = addInventoryToCart;
}



// ============================================================
// Comps auto-fill + sample shop (mobile-fun)
// ============================================================
var _autofill = {
  sale: { prev: null, active: false, manual: false },
  buylist: { prev: null, active: false, manual: false },
  'buylist-buy': { prev: null, active: false, manual: false }
};

function toggleCompsAutofill(on) {
  var s = loadSettings();
  s.compsAutoFill = !!on;
  saveSettings(s);
  toast(on ? 'Auto-fill prices ON' : 'Auto-fill prices OFF', 'ok');
}

function markPriceManual(ctx) {
  if (_autofill[ctx]) {
    _autofill[ctx].manual = true;
    _autofill[ctx].active = false;
  }
  var chip = $(ctx === 'buylist' ? 'bl-autofill-chip' : 'sale-autofill-chip');
  if (chip) chip.style.display = 'none';
  var wrap = $(ctx === 'buylist' ? 'bl-price-wrap' : 'sale-price-wrap');
  if (wrap) wrap.classList.remove('autofilled');
}

function undoAutofill(ctx) {
  var st = _autofill[ctx];
  if (!st) return;
  if (ctx === 'sale') {
    if ($('log-price')) $('log-price').value = st.prev != null ? st.prev : '';
    if (CART_SEL >= 0 && CART[CART_SEL]) {
      CART[CART_SEL].price = st.prev != null && st.prev !== '' ? num(st.prev) : 0;
      CART[CART_SEL]._autofilled = false;
      renderCart();
    }
    var chip = $('sale-autofill-chip');
    if (chip) chip.style.display = 'none';
    var wrap = $('sale-price-wrap');
    if (wrap) wrap.classList.remove('autofilled');
  } else if (ctx === 'buylist') {
    if ($('bl-market')) $('bl-market').value = st.prev != null ? st.prev : '';
    var chip2 = $('bl-autofill-chip');
    if (chip2) chip2.style.display = 'none';
    var wrap2 = $('bl-price-wrap');
    if (wrap2) wrap2.classList.remove('autofilled');
  } else if (ctx === 'buylist-buy') {
    var sb = $('bl-suggested-buy');
    if (sb) sb.textContent = '';
    var chip3 = $('bl-buy-autofill-chip');
    if (chip3) chip3.style.display = 'none';
  }
  st.active = false;
  st.manual = true;
  toast('Reverted auto-fill', 'ok');
  if (typeof updateSaleCreditPreview === 'function') updateSaleCreditPreview();
}

function pickSellCompPrice(comp) {
  if (!comp) return null;
  if (comp.mid != null && !isNaN(comp.mid)) return +comp.mid;
  if (comp.market != null && !isNaN(comp.market)) return +comp.market;
  if (comp.low != null && !isNaN(comp.low)) return +comp.low;
  return null;
}

function maybeAutoFillFromComps(ctx, comp) {
  try {
    var s = loadSettings();
    if (s.compsAutoFill === false || s.compsEnabled === false) return;
    if (!comp) return;
    if (ctx === 'sale') {
      if (_autofill.sale.manual) return;
      var val = pickSellCompPrice(comp);
      if (val == null) return;
      var cur = $('log-price') ? $('log-price').value : '';
      // Only fill empty or previously auto-filled
      var line = (CART_SEL >= 0 && CART[CART_SEL]) ? CART[CART_SEL] : null;
      var allow = !cur || (line && line._autofilled) || _autofill.sale.active;
      if (!allow && cur) return;
      _autofill.sale.prev = cur;
      if ($('log-price')) $('log-price').value = (+val).toFixed(2);
      if (line) {
        line.price = +val;
        line.market = comp.market != null ? +comp.market : line.market;
        line._autofilled = true;
        renderCart();
      }
      _autofill.sale.active = true;
      var chip = $('sale-autofill-chip');
      if (chip) chip.style.display = 'inline-flex';
      var wrap = $('sale-price-wrap');
      if (wrap) wrap.classList.add('autofilled');
      if (typeof updateSaleCreditPreview === 'function') updateSaleCreditPreview();
      if (typeof updateCheckoutDue === 'function') updateCheckoutDue();
    } else if (ctx === 'buylist') {
      if (_autofill.buylist.manual) return;
      var mkt = comp.market != null ? +comp.market : (comp.mid != null ? +comp.mid : null);
      if (mkt == null) return;
      var curM = $('bl-market') ? $('bl-market').value : '';
      if (curM && !_autofill.buylist.active) return;
      _autofill.buylist.prev = curM;
      if ($('bl-market')) $('bl-market').value = mkt.toFixed(2);
      _autofill.buylist.active = true;
      var chipB = $('bl-autofill-chip');
      if (chipB) chipB.style.display = 'inline-flex';
      var wrapB = $('bl-price-wrap');
      if (wrapB) wrapB.classList.add('autofilled');
      // Suggested cash buy = market × cash % (shown + drives quote via bl-market)
      var buy = (typeof suggestedBuy === 'function') ? suggestedBuy(mkt) : Math.round(mkt * (loadSettings().cashRate || 0.6) * 100) / 100;
      var sb = $('bl-suggested-buy');
      if (sb && buy) {
        var pct = Math.round((loadSettings().cashRate || 0.6) * 100);
        sb.innerHTML = 'Suggested cash buy: <span style="color:var(--green)">' + (typeof fmt === 'function' ? fmt(buy) : ('$' + buy.toFixed(2))) + '</span> <span style="font-weight:500;color:var(--muted)">(' + pct + '% of market)</span>';
      }
      var chipBuy = $('bl-buy-autofill-chip');
      if (chipBuy && buy) chipBuy.style.display = 'inline-flex';
      _autofill['buylist-buy'].active = true;
    }
  } catch (e) {
    console.warn('autofill', e);
  }
}

// Hook renderCompsUI to auto-fill without blocking
(function patchRenderCompsAutofill() {
  if (typeof renderCompsUI !== 'function' || renderCompsUI._autofill) return;
  var _rc = renderCompsUI;
  renderCompsUI = function (ctx, comp, statusKind, statusLabel, metaExtra) {
    _rc(ctx, comp, statusKind, statusLabel, metaExtra);
    if (comp) {
      setTimeout(function () {
        try { attachImageFromComp(ctx, comp); } catch (e) {}
        if (comp.market != null || comp.mid != null || comp.low != null) maybeAutoFillFromComps(ctx, comp);
      }, 0);
    }
  };
  renderCompsUI._autofill = true;
})();

function resetAutofillOnNameChange(ctx) {
  if (_autofill[ctx]) {
    _autofill[ctx].manual = false;
    _autofill[ctx].active = false;
  }
}

// Reset manual flag when name changes enough
(function patchOnCompName() {
  if (typeof onCompNameInput !== 'function' || onCompNameInput._af) return;
  var _on = onCompNameInput;
  onCompNameInput = function (ctx) {
    resetAutofillOnNameChange(ctx);
    if (ctx === 'buylist') resetAutofillOnNameChange('buylist-buy');
    _on(ctx);
  };
  onCompNameInput._af = true;
})();

// When adding inventory to cart with no price, trigger comps autofill
(function patchAddInvAutofill() {
  if (typeof addInventoryToCart !== 'function' || addInventoryToCart._af) return;
  var _add = addInventoryToCart;
  addInventoryToCart = function (idx) {
    resetAutofillOnNameChange('sale');
    _add(idx);
    var item = DB.inventory[idx];
    if (!item) return;
    // Prefer mid/market from item, else comps panel
    var price = 0;
    if (item.mid != null && !isNaN(item.mid)) price = +item.mid;
    else if (item.market != null && !isNaN(item.market)) price = +item.market;
    var s = loadSettings();
    if (s.compsAutoFill !== false && price > 0) {
      var line = CART[CART_SEL];
      if (line && (!line.price || line._autofilled)) {
        _autofill.sale.prev = $('log-price') ? $('log-price').value : '';
        line.price = price;
        line._autofilled = true;
        if ($('log-price')) $('log-price').value = price.toFixed(2);
        _autofill.sale.active = true;
        var chip = $('sale-autofill-chip');
        if (chip) chip.style.display = 'inline-flex';
        var wrap = $('sale-price-wrap');
        if (wrap) wrap.classList.add('autofilled');
        renderCart();
      }
    }
  };
  addInventoryToCart._af = true;
})();

function syncMeetCheckoutBar() {
  var dueEl = $('meet-bar-due');
  var cartDue = $('cart-due');
  if (dueEl && cartDue) dueEl.textContent = cartDue.textContent || '$0.00';
  else if (dueEl && typeof checkoutDue === 'function') dueEl.textContent = (typeof fmt === 'function' ? fmt(checkoutDue()) : '$' + checkoutDue().toFixed(2));
  var bar = $('meet-checkout-bar');
  var active = document.body.classList.contains('meet-active');
  if (bar) bar.style.display = active ? 'flex' : 'none';
}

(function patchUpdateCheckoutDueBar() {
  if (typeof updateCheckoutDue !== 'function' || updateCheckoutDue._bar) return;
  var _u = updateCheckoutDue;
  updateCheckoutDue = function () {
    _u();
    syncMeetCheckoutBar();
  };
  updateCheckoutDue._bar = true;
})();

(function patchSwitchTabMeet() {
  if (typeof switchTab !== 'function' || switchTab._meetbar) return;
  var _st = switchTab;
  switchTab = function (name) {
    _st.apply(this, arguments);
    var n = name;
    var aliases = { sale: 'log', register: 'log', meet: 'log' };
    if (aliases[n]) n = aliases[n];
    document.body.classList.toggle('meet-active', n === 'log');
    syncMeetCheckoutBar();
  };
  switchTab._meetbar = true;
})();

// ---------- Sample shop ----------
var CT_SAMPLE_FLAG = 'ct_sample_meta';

function sampleInventory() {
  var now = d8();
  var IMG = 'https://images.pokemontcg.io';
  var rows = [
    { sku: 'PKM-CHAR-001', name: 'Charizard ex', set: 'Obsidian Flames', number: '223', tcgId: 'sv3-223', kind: 'raw', condition: 'NM', qty: 2, cost: 28, market: 42, mid: 40, listPrice: 44, image: IMG + '/sv3/223.png', imageLarge: IMG + '/sv3/223_hires.png' },
    { sku: 'PKM-PIKA-025', name: 'Pikachu VMAX', set: 'Vivid Voltage', number: '188', tcgId: 'swsh4-188', kind: 'raw', condition: 'NM', qty: 3, cost: 12, market: 18, mid: 17, listPrice: 20, image: IMG + '/swsh4/188.png', imageLarge: IMG + '/swsh4/188_hires.png' },
    { sku: 'PKM-MUM-215', name: 'Umbreon VMAX', set: 'Evolving Skies', number: '215', tcgId: 'swsh7-215', kind: 'raw', condition: 'LP', qty: 1, cost: 95, market: 145, mid: 138, listPrice: 155, image: IMG + '/swsh7/215.png', imageLarge: IMG + '/swsh7/215_hires.png' },
    { sku: 'PKM-MEW-151', name: 'Mew ex', set: '151', number: '151', tcgId: 'sv3pt5-151', kind: 'raw', condition: 'NM', qty: 4, cost: 6.5, market: 11, mid: 10, listPrice: 12, image: IMG + '/sv3pt5/151.png', imageLarge: IMG + '/sv3pt5/151_hires.png' },
    { sku: 'PKM-GAR-130', name: 'Gardevoir ex', set: 'Scarlet & Violet', number: '228', tcgId: 'sv1-228', kind: 'raw', condition: 'NM', qty: 2, cost: 14, market: 22, mid: 21, listPrice: 24, image: IMG + '/sv1/228.png', imageLarge: IMG + '/sv1/228_hires.png' },
    { sku: 'PKM-LUG-PSA10', name: 'Lugia V ALT', set: 'Silver Tempest', number: '186', tcgId: 'swsh12-186', kind: 'graded', condition: 'NM', gradeCompany: 'PSA', gradeValue: '10', cert: '85201947', qty: 1, cost: 280, market: 360, mid: 350, listPrice: 375, image: IMG + '/swsh12/186.png', imageLarge: IMG + '/swsh12/186_hires.png' },
    { sku: 'PKM-MOON-PSA9', name: 'Umbreon Gold Star', set: 'POP Series 5', number: '17', tcgId: 'pop5-17', kind: 'graded', condition: 'NM', gradeCompany: 'PSA', gradeValue: '9', cert: '44102881', qty: 1, cost: 900, market: 1250, mid: 1200, listPrice: 1350, image: IMG + '/pop5/17.png', imageLarge: IMG + '/pop5/17_hires.png' },
    { sku: 'PKM-IRO-CGC10', name: 'Iono SIR', set: 'Paldea Evolved', number: '269', tcgId: 'sv2-269', kind: 'graded', condition: 'NM', gradeCompany: 'CGC', gradeValue: '10', cert: '6129033', qty: 1, cost: 110, market: 155, mid: 148, listPrice: 165, image: IMG + '/sv2/269.png', imageLarge: IMG + '/sv2/269_hires.png' },
    { sku: 'PKM-ETB-PRE', name: 'Prismatic Evolutions ETB', set: 'Prismatic Evolutions', kind: 'sealed', sealedType: 'etb', condition: 'NM', qty: 3, cost: 48, market: 62, mid: 60, listPrice: 69, image: IMG + '/sv8pt5/logo.png', imageLarge: IMG + '/sv8pt5/logo.png' },
    { sku: 'PKM-BB-151', name: '151 Booster Box', set: '151', kind: 'sealed', sealedType: 'booster_box', condition: 'NM', qty: 1, cost: 310, market: 380, mid: 370, listPrice: 399, image: IMG + '/sv3pt5/logo.png', imageLarge: IMG + '/sv3pt5/logo.png' },
    { sku: 'PKM-TIN-PAL', name: 'Paldea Adventures Tin', set: 'Paldea', kind: 'sealed', sealedType: 'tin', condition: 'NM', qty: 5, cost: 14, market: 22, mid: 20, listPrice: 24, image: IMG + '/sv1/logo.png', imageLarge: IMG + '/sv1/logo.png' },
    { sku: 'PKM-SUR-189', name: 'Surfing Pikachu VMAX', set: 'Celebrations', number: '9', tcgId: 'cel25-9', kind: 'raw', condition: 'NM', qty: 2, cost: 8, market: 14, mid: 13, listPrice: 15, image: IMG + '/cel25/9.png', imageLarge: IMG + '/cel25/9_hires.png' },
    { sku: 'PKM-RAY-BGS9', name: 'Rayquaza VMAX ALT', set: 'Evolving Skies', number: '218', tcgId: 'swsh7-218', kind: 'graded', condition: 'NM', gradeCompany: 'BGS', gradeValue: '9.5', cert: '001288492', qty: 1, cost: 420, market: 520, mid: 505, listPrice: 549, image: IMG + '/swsh7/218.png', imageLarge: IMG + '/swsh7/218_hires.png' },
    { sku: 'PKM-CLEF-036', name: 'Clefairy', set: '151', number: '35', tcgId: 'sv3pt5-35', kind: 'raw', condition: 'MP', qty: 6, cost: 0.4, market: 1.2, mid: 1, listPrice: 1.5, image: IMG + '/sv3pt5/35.png', imageLarge: IMG + '/sv3pt5/35_hires.png' },
    { sku: 'PKM-UPC-SV', name: 'SV Ultra-Premium Collection', set: 'Scarlet & Violet', kind: 'sealed', sealedType: 'upc', condition: 'NM', qty: 1, cost: 95, market: 120, mid: 115, listPrice: 129, image: IMG + '/sv1/logo.png', imageLarge: IMG + '/sv1/logo.png' },
    { sku: 'PKM-GIR-PSA8', name: 'Giratina V ALT', set: 'Lost Origin', number: '186', tcgId: 'swsh11-186', kind: 'graded', condition: 'NM', gradeCompany: 'PSA', gradeValue: '8', cert: '77812003', qty: 1, cost: 85, market: 110, mid: 105, listPrice: 119, image: IMG + '/swsh11/186.png', imageLarge: IMG + '/swsh11/186_hires.png' }
  ];
  return rows.map(function (r, i) {
    return Object.assign({
      id: Date.now() + i + 1000,
      sample: true,
      addedAt: now,
      qty: r.qty,
      cost: r.cost
    }, r);
  });
}

function sampleCustomers() {
  return [
    { id: Date.now() + 501, name: 'Alex Rivera', email: 'alex@example.com', phone: '555-0142', address: '12 Oak St', city: 'Austin', state: 'TX', zip: '78701', balance: 25, history: [{ id: 1, ts: new Date().toISOString(), type: 'credit', amount: 25, note: 'Sample credit', balance: 25 }], createdAt: new Date().toISOString(), sample: true },
    { id: Date.now() + 502, name: 'Jordan Lee', email: 'jordan@example.com', phone: '555-0199', address: '88 Market Ave', city: 'Portland', state: 'OR', zip: '97205', balance: 0, history: [], createdAt: new Date().toISOString(), sample: true },
    { id: Date.now() + 503, name: 'Sam Patel', email: 'sam@example.com', phone: '555-0177', address: '4 Pier Rd', city: 'San Diego', state: 'CA', zip: '92101', balance: 12.5, history: [{ id: 2, ts: new Date().toISOString(), type: 'credit', amount: 12.5, note: 'Trade-in sample', balance: 12.5 }], createdAt: new Date().toISOString(), sample: true }
  ];
}

function sampleSales() {
  var d = d8();
  return [
    { id: Date.now() + 701, sku: 'PKM-PIKA-025', name: 'Pikachu VMAX', price: 18, cost: 12, qty: 1, location: 'Card Show', date: d, condition: 'NM', kind: 'sale', profit: 6, customer: 'Jordan Lee', paymentMethod: 'cash', paymentStatus: 'paid', sample: true },
    { id: Date.now() + 702, sku: 'PKM-CLEF-036', name: 'Clefairy', price: 1.5, cost: 0.4, qty: 2, location: 'Counter', date: d, condition: 'MP', kind: 'sale', profit: 2.2, customer: 'Alex Rivera', paymentMethod: 'app', paymentStatus: 'paid', sample: true }
  ];
}

function seedCompsFromSample(inv) {
  if (typeof loadCompsStore !== 'function') return;
  var store = loadCompsStore();
  inv.forEach(function (i) {
    if (!i.name) return;
    var key = typeof nameOnlyKey === 'function' ? nameOnlyKey(i.name) : String(i.name).toLowerCase();
    store.guide[key] = {
      name: i.name,
      set: i.set || '',
      market: i.market,
      mid: i.mid,
      low: i.market ? Math.round(i.market * 0.85 * 100) / 100 : null,
      high: i.market ? Math.round(i.market * 1.15 * 100) / 100 : null,
      updatedAt: new Date().toISOString(),
      sample: true
    };
  });
  saveCompsStore(store);
  if (typeof ctSeedSamplePriceHistory === 'function') ctSeedSamplePriceHistory(inv);
}

function loadSampleShop(force) {
  var invEmpty = !(DB.inventory && DB.inventory.length);
  if (!force && !invEmpty) {
    toast('Inventory already has items — use Settings → Load sample shop', 'err');
    return false;
  }
  if (force && DB.inventory && DB.inventory.length) {
    var hasReal = DB.inventory.some(function (i) { return !i.sample; });
    if (hasReal && !confirm('Add sample rows alongside your existing inventory? Sample rows are tagged and can be cleared later.')) return false;
  }
  var inv = sampleInventory();
  if (force && DB.inventory && DB.inventory.length) {
    DB.inventory = DB.inventory.concat(inv);
  } else {
    DB.inventory = inv;
  }
  DB.saveInventory();
  var custs = (typeof getCustomers === 'function') ? getCustomers() : [];
  var samples = sampleCustomers();
  if (!custs.length || force) {
    var names = {};
    custs.forEach(function (c) { names[(c.name || '').toLowerCase()] = true; });
    samples.forEach(function (c) {
      if (!names[(c.name || '').toLowerCase()]) custs.push(c);
    });
    if (typeof saveCustomers === 'function') saveCustomers(custs);
  }
  if (!DB.sales.length || (force && !DB.sales.some(function (s) { return s.sample; }))) {
    DB.sales = (DB.sales || []).concat(sampleSales());
    DB.saveSales();
  }
  seedCompsFromSample(inv);
  try {
    localStorage.setItem(CT_SAMPLE_FLAG, JSON.stringify({ loadedAt: new Date().toISOString(), count: inv.length }));
  } catch (e) {}
  var s = loadSettings();
  s.sampleLoaded = true;
  if (!s.shopName) s.shopName = 'Demo Meet Booth';
  saveSettings(s);
  if (typeof applyShopChrome === 'function') applyShopChrome();
  if (typeof renderInventory === 'function') renderInventory();
  if (typeof renderCustomers === 'function') renderCustomers();
  if (typeof renderRecentSales === 'function') renderRecentSales();
  if (typeof renderStorefront === 'function') renderStorefront();
  if (typeof refreshCustomerDatalist === 'function') refreshCustomerDatalist();
  if (typeof renderFastSale === 'function') renderFastSale();
  if (typeof renderSmartGrid === 'function') renderSmartGrid();
  renderSampleChips();
  if (typeof ctScheduleLivePriceLoop === 'function') ctScheduleLivePriceLoop(true);
  toast('Sample shop loaded — ' + inv.length + ' items', 'ok');
  return true;
}

function clearSampleShop() {
  if (!confirm('Remove sample demo data only? Real inventory, customers, and sales (without sample flag) stay. Continue?')) return;
  DB.inventory = (DB.inventory || []).filter(function (i) { return !i.sample; });
  DB.sales = (DB.sales || []).filter(function (s) { return !s.sample; });
  DB.saveInventory();
  DB.saveSales();
  if (typeof getCustomers === 'function' && typeof saveCustomers === 'function') {
    saveCustomers(getCustomers().filter(function (c) { return !c.sample; }));
  }
  if (typeof loadCompsStore === 'function') {
    var store = loadCompsStore();
    Object.keys(store.guide || {}).forEach(function (k) {
      if (store.guide[k] && store.guide[k].sample) delete store.guide[k];
    });
    saveCompsStore(store);
  }
  try { localStorage.removeItem(CT_SAMPLE_FLAG); } catch (e) {}
  var s = loadSettings();
  s.sampleLoaded = false;
  saveSettings(s);
  if (typeof renderInventory === 'function') renderInventory();
  if (typeof renderCustomers === 'function') renderCustomers();
  if (typeof renderRecentSales === 'function') renderRecentSales();
  if (typeof renderStorefront === 'function') renderStorefront();
  renderSampleChips();
  toast('Sample data cleared', 'ok');
}

function renderSampleChips() {
  var box = $('sample-quick-chips');
  if (!box) return;
  var samples = (DB.inventory || []).filter(function (i) { return i.sample && i.qty > 0; }).slice(0, 8);
  if (!samples.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'flex';
  box.innerHTML = samples.map(function (i) {
    var idx = DB.inventory.indexOf(i);
    return '<button type="button" class="thumb-chip" onclick="addInventoryToCart(' + idx + ')">' +
      esc((i.name || i.sku || '').split(' ').slice(0, 2).join(' ')) +
      ' · ' + (typeof fmt === 'function' ? fmt(i.listPrice || i.mid || i.market || 0) : '') + '</button>';
  }).join('');
}

function maybeSeedSampleOnBoot() {
  try {
    if (DB.inventory && DB.inventory.length) {
      renderSampleChips();
      return;
    }
    // First launch — seed demo so Meet isn't empty
    loadSampleShop(false);
  } catch (e) {
    console.warn('sample seed', e);
  }
}

// Playful empty states with sample CTA

var _cartSig = '';
(function patchCartSig(){
  function wrap(){
    if (typeof renderCart !== 'function' || renderCart._sig) return;
    var _rc0 = renderCart;
    renderCart = function(force) {
      try {
        var sig = CART.length + '|' + CART.map(function(l){
          return [l.sku||'', l.qty||0, l.price||0, l.name||''].join(':');
        }).join(';') + '|' + CART_SEL;
        if (!force && sig === _cartSig && CART.length) {
          // still refresh totals
          var sub = cartSubtotal();
          if ($('cart-subtotal')) $('cart-subtotal').textContent = fmt(sub);
          if ($('cart-count')) $('cart-count').textContent = CART.length ? (CART.length + (CART.length === 1 ? ' line' : ' lines')) : '0 lines';
          if (typeof updateSaleCreditPreview === 'function') updateSaleCreditPreview();
          if (typeof updateCheckoutDue === 'function') updateCheckoutDue();
          if (typeof syncMeetCheckoutBar === 'function') syncMeetCheckoutBar();
          return;
        }
        _cartSig = sig;
      } catch (e) {}
      return _rc0.apply(this, arguments);
    };
    renderCart._sig = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(wrap, 0); });
  else setTimeout(wrap, 0);
})();

(function patchEmptyCart() {
  if (typeof renderCart !== 'function' || renderCart._sample) return;
  var _rc = renderCart;
  renderCart = function () {
    _rc();
    var box = $('cart-lines');
    if (!box || CART.length) return;
    if (!(DB.inventory && DB.inventory.length)) {
      box.innerHTML = '<div class="empty-state" style="padding:24px 8px"><div class="icon">'+(typeof icon==='function'?icon('meet'):'')+'</div><div class="empty-title">Cart is empty — load a demo?</div><div class="empty-hint">Seed sample Pokémon stock and customers to try Meet checkout.</div><div class="sample-cta"><button class="btn btn-primary" type="button" onclick="loadSampleShop(true)">Load sample shop</button></div></div>';
    } else {
      box.innerHTML = '<div class="empty-state" style="padding:24px 8px"><div class="icon">'+(typeof icon==='function'?icon('zap'):'')+'</div><div class="empty-title">Cart is empty</div><div class="empty-hint">Scan a SKU or tap a quick chip / search result.</div></div>';
    }
    syncMeetCheckoutBar();
  };
  renderCart._sample = true;
})();

(function patchEmptyStorefront() {
  if (typeof renderStorefront !== 'function' || renderStorefront._sample) return;
  var _rs = renderStorefront;
  renderStorefront = function () {
    _rs();
    var grid = $('sf-grid');
    if (!grid) return;
    if (!(DB.inventory || []).some(function (i) { return i.qty > 0; })) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">'+(typeof icon==='function'?icon('storefront'):'')+'</div><div class="empty-title">Shelf is empty</div><div class="empty-hint">Load sample stock to preview the storefront, or receive sealed in Inventory.</div><div class="sample-cta"><button class="btn btn-primary" type="button" onclick="loadSampleShop(true)">Load sample shop</button></div></div>';
    }
  };
  renderStorefront._sample = true;
})();

(function patchCtInitPosSample() {
  if (typeof ctInitPos !== 'function' || ctInitPos._sample) return;
  var _init = ctInitPos;
  ctInitPos = function () {
    _init();
    document.body.classList.toggle('meet-active', !!(document.getElementById('sec-log') && document.getElementById('sec-log').classList.contains('active')));
    maybeSeedSampleOnBoot();
    renderSampleChips();
    syncMeetCheckoutBar();
    // ensure autofill hook attached after functions exist
    try {
      if (typeof renderCompsUI === 'function' && !renderCompsUI._autofill) {
        var _rc = renderCompsUI;
        renderCompsUI = function (ctx, comp, statusKind, statusLabel, metaExtra) {
          _rc(ctx, comp, statusKind, statusLabel, metaExtra);
          if (comp && (comp.market != null || comp.mid != null || comp.low != null)) {
            setTimeout(function () { maybeAutoFillFromComps(ctx, comp); }, 0);
          }
        };
        renderCompsUI._autofill = true;
      }
    } catch (e) {}
  };
  ctInitPos._sample = true;
})();


function useSuggestedSell(){
  var st = (typeof _compState!=='undefined' && _compState.sale) ? _compState.sale : null;
  var m = st && (st.market!=null?st.market:st.mid);
  var v = suggestedSell(m, num($('log-cost')&&$('log-cost').value));
  if(!v){toast('No sell suggestion yet','err');return;}
  if($('log-price')) $('log-price').value=v.toFixed(2);
  if(CART_SEL>=0 && CART[CART_SEL]){CART[CART_SEL].price=v;renderCart();}
  toast('Sell set to '+fmt(v),'ok');
}
function useSuggestedBuy(){
  var st = (typeof _compState!=='undefined' && _compState.buylist) ? _compState.buylist : ((typeof _compState!=='undefined' && _compState.sale) ? _compState.sale : null);
  var m = st && (st.market!=null?st.market:st.mid);
  var v = suggestedBuy(m);
  if(!v){toast('No buy suggestion — set cash % in Settings','err');return;}
  if($('bl-market')) $('bl-market').value = (st && st.market != null ? st.market : v).toFixed(2);
  if($('bl-name') && $('log-name') && !$('bl-name').value) $('bl-name').value = $('log-name').value;
  toast('Guide set — cash offer uses your buy %', 'ok');
}


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { ctInitRetail(); try { ctInitPos(); } catch (e) { console.warn(e); }
    try { if (typeof ctRegisterSwLite==='function') ctRegisterSwLite(); } catch (e) {}
    try { document.querySelectorAll('.bnav-ico[data-ico]').forEach(function(el){ if(!el.getAttribute('data-painted')&&typeof icon==='function'){ el.innerHTML=icon(el.getAttribute('data-ico')); el.setAttribute('data-painted','1'); } }); } catch(e){}
  });
} else {
  ctInitRetail();
  try { ctInitPos(); } catch (e) { console.warn(e); }
  try { if (typeof ctRegisterSwLite==='function') ctRegisterSwLite(); } catch (e) {}
}


;

/* qrcode-generator (kazuhiko) — embedded for offline customer QR */
/**
 * Minified by jsDelivr using Terser v5.37.0.
 * Original file: /npm/qrcode-generator@1.4.4/qrcode.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var qrcode=function(){var t=function(t,r){var e=t,n=g[r],o=null,i=0,a=null,u=[],f={},c=function(t,r){o=function(t){for(var r=new Array(t),e=0;e<t;e+=1){r[e]=new Array(t);for(var n=0;n<t;n+=1)r[e][n]=null}return r}(i=4*e+17),l(0,0),l(i-7,0),l(0,i-7),s(),h(),d(t,r),e>=7&&v(t),null==a&&(a=p(e,n,u)),w(a,r)},l=function(t,r){for(var e=-1;e<=7;e+=1)if(!(t+e<=-1||i<=t+e))for(var n=-1;n<=7;n+=1)r+n<=-1||i<=r+n||(o[t+e][r+n]=0<=e&&e<=6&&(0==n||6==n)||0<=n&&n<=6&&(0==e||6==e)||2<=e&&e<=4&&2<=n&&n<=4)},h=function(){for(var t=8;t<i-8;t+=1)null==o[t][6]&&(o[t][6]=t%2==0);for(var r=8;r<i-8;r+=1)null==o[6][r]&&(o[6][r]=r%2==0)},s=function(){for(var t=B.getPatternPosition(e),r=0;r<t.length;r+=1)for(var n=0;n<t.length;n+=1){var i=t[r],a=t[n];if(null==o[i][a])for(var u=-2;u<=2;u+=1)for(var f=-2;f<=2;f+=1)o[i+u][a+f]=-2==u||2==u||-2==f||2==f||0==u&&0==f}},v=function(t){for(var r=B.getBCHTypeNumber(e),n=0;n<18;n+=1){var a=!t&&1==(r>>n&1);o[Math.floor(n/3)][n%3+i-8-3]=a}for(n=0;n<18;n+=1){a=!t&&1==(r>>n&1);o[n%3+i-8-3][Math.floor(n/3)]=a}},d=function(t,r){for(var e=n<<3|r,a=B.getBCHTypeInfo(e),u=0;u<15;u+=1){var f=!t&&1==(a>>u&1);u<6?o[u][8]=f:u<8?o[u+1][8]=f:o[i-15+u][8]=f}for(u=0;u<15;u+=1){f=!t&&1==(a>>u&1);u<8?o[8][i-u-1]=f:u<9?o[8][15-u-1+1]=f:o[8][15-u-1]=f}o[i-8][8]=!t},w=function(t,r){for(var e=-1,n=i-1,a=7,u=0,f=B.getMaskFunction(r),c=i-1;c>0;c-=2)for(6==c&&(c-=1);;){for(var g=0;g<2;g+=1)if(null==o[n][c-g]){var l=!1;u<t.length&&(l=1==(t[u]>>>a&1)),f(n,c-g)&&(l=!l),o[n][c-g]=l,-1==(a-=1)&&(u+=1,a=7)}if((n+=e)<0||i<=n){n-=e,e=-e;break}}},p=function(t,r,e){for(var n=A.getRSBlocks(t,r),o=b(),i=0;i<e.length;i+=1){var a=e[i];o.put(a.getMode(),4),o.put(a.getLength(),B.getLengthInBits(a.getMode(),t)),a.write(o)}var u=0;for(i=0;i<n.length;i+=1)u+=n[i].dataCount;if(o.getLengthInBits()>8*u)throw"code length overflow. ("+o.getLengthInBits()+">"+8*u+")";for(o.getLengthInBits()+4<=8*u&&o.put(0,4);o.getLengthInBits()%8!=0;)o.putBit(!1);for(;!(o.getLengthInBits()>=8*u||(o.put(236,8),o.getLengthInBits()>=8*u));)o.put(17,8);return function(t,r){for(var e=0,n=0,o=0,i=new Array(r.length),a=new Array(r.length),u=0;u<r.length;u+=1){var f=r[u].dataCount,c=r[u].totalCount-f;n=Math.max(n,f),o=Math.max(o,c),i[u]=new Array(f);for(var g=0;g<i[u].length;g+=1)i[u][g]=255&t.getBuffer()[g+e];e+=f;var l=B.getErrorCorrectPolynomial(c),h=k(i[u],l.getLength()-1).mod(l);for(a[u]=new Array(l.getLength()-1),g=0;g<a[u].length;g+=1){var s=g+h.getLength()-a[u].length;a[u][g]=s>=0?h.getAt(s):0}}var v=0;for(g=0;g<r.length;g+=1)v+=r[g].totalCount;var d=new Array(v),w=0;for(g=0;g<n;g+=1)for(u=0;u<r.length;u+=1)g<i[u].length&&(d[w]=i[u][g],w+=1);for(g=0;g<o;g+=1)for(u=0;u<r.length;u+=1)g<a[u].length&&(d[w]=a[u][g],w+=1);return d}(o,n)};f.addData=function(t,r){var e=null;switch(r=r||"Byte"){case"Numeric":e=M(t);break;case"Alphanumeric":e=x(t);break;case"Byte":e=m(t);break;case"Kanji":e=L(t);break;default:throw"mode:"+r}u.push(e),a=null},f.isDark=function(t,r){if(t<0||i<=t||r<0||i<=r)throw t+","+r;return o[t][r]},f.getModuleCount=function(){return i},f.make=function(){if(e<1){for(var t=1;t<40;t++){for(var r=A.getRSBlocks(t,n),o=b(),i=0;i<u.length;i++){var a=u[i];o.put(a.getMode(),4),o.put(a.getLength(),B.getLengthInBits(a.getMode(),t)),a.write(o)}var g=0;for(i=0;i<r.length;i++)g+=r[i].dataCount;if(o.getLengthInBits()<=8*g)break}e=t}c(!1,function(){for(var t=0,r=0,e=0;e<8;e+=1){c(!0,e);var n=B.getLostPoint(f);(0==e||t>n)&&(t=n,r=e)}return r}())},f.createTableTag=function(t,r){t=t||2;var e="";e+='<table style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: "+(r=void 0===r?4*t:r)+"px;",e+='">',e+="<tbody>";for(var n=0;n<f.getModuleCount();n+=1){e+="<tr>";for(var o=0;o<f.getModuleCount();o+=1)e+='<td style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: 0px;",e+=" width: "+t+"px;",e+=" height: "+t+"px;",e+=" background-color: ",e+=f.isDark(n,o)?"#000000":"#ffffff",e+=";",e+='"/>';e+="</tr>"}return e+="</tbody>",e+="</table>"},f.createSvgTag=function(t,r,e,n){var o={};"object"==typeof arguments[0]&&(t=(o=arguments[0]).cellSize,r=o.margin,e=o.alt,n=o.title),t=t||2,r=void 0===r?4*t:r,(e="string"==typeof e?{text:e}:e||{}).text=e.text||null,e.id=e.text?e.id||"qrcode-description":null,(n="string"==typeof n?{text:n}:n||{}).text=n.text||null,n.id=n.text?n.id||"qrcode-title":null;var i,a,u,c,g=f.getModuleCount()*t+2*r,l="";for(c="l"+t+",0 0,"+t+" -"+t+",0 0,-"+t+"z ",l+='<svg version="1.1" xmlns="http://www.w3.org/2000/svg"',l+=o.scalable?"":' width="'+g+'px" height="'+g+'px"',l+=' viewBox="0 0 '+g+" "+g+'" ',l+=' preserveAspectRatio="xMinYMin meet"',l+=n.text||e.text?' role="img" aria-labelledby="'+y([n.id,e.id].join(" ").trim())+'"':"",l+=">",l+=n.text?'<title id="'+y(n.id)+'">'+y(n.text)+"</title>":"",l+=e.text?'<description id="'+y(e.id)+'">'+y(e.text)+"</description>":"",l+='<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>',l+='<path d="',a=0;a<f.getModuleCount();a+=1)for(u=a*t+r,i=0;i<f.getModuleCount();i+=1)f.isDark(a,i)&&(l+="M"+(i*t+r)+","+u+c);return l+='" stroke="transparent" fill="black"/>',l+="</svg>"},f.createDataURL=function(t,r){t=t||2,r=void 0===r?4*t:r;var e=f.getModuleCount()*t+2*r,n=r,o=e-r;return I(e,e,(function(r,e){if(n<=r&&r<o&&n<=e&&e<o){var i=Math.floor((r-n)/t),a=Math.floor((e-n)/t);return f.isDark(a,i)?0:1}return 1}))},f.createImgTag=function(t,r,e){t=t||2,r=void 0===r?4*t:r;var n=f.getModuleCount()*t+2*r,o="";return o+="<img",o+=' src="',o+=f.createDataURL(t,r),o+='"',o+=' width="',o+=n,o+='"',o+=' height="',o+=n,o+='"',e&&(o+=' alt="',o+=y(e),o+='"'),o+="/>"};var y=function(t){for(var r="",e=0;e<t.length;e+=1){var n=t.charAt(e);switch(n){case"<":r+="&lt;";break;case">":r+="&gt;";break;case"&":r+="&amp;";break;case'"':r+="&quot;";break;default:r+=n}}return r};return f.createASCII=function(t,r){if((t=t||1)<2)return function(t){t=void 0===t?2:t;var r,e,n,o,i,a=1*f.getModuleCount()+2*t,u=t,c=a-t,g={"██":"█","█ ":"▀"," █":"▄","  ":" "},l={"██":"▀","█ ":"▀"," █":" ","  ":" "},h="";for(r=0;r<a;r+=2){for(n=Math.floor((r-u)/1),o=Math.floor((r+1-u)/1),e=0;e<a;e+=1)i="█",u<=e&&e<c&&u<=r&&r<c&&f.isDark(n,Math.floor((e-u)/1))&&(i=" "),u<=e&&e<c&&u<=r+1&&r+1<c&&f.isDark(o,Math.floor((e-u)/1))?i+=" ":i+="█",h+=t<1&&r+1>=c?l[i]:g[i];h+="\n"}return a%2&&t>0?h.substring(0,h.length-a-1)+Array(a+1).join("▀"):h.substring(0,h.length-1)}(r);t-=1,r=void 0===r?2*t:r;var e,n,o,i,a=f.getModuleCount()*t+2*r,u=r,c=a-r,g=Array(t+1).join("██"),l=Array(t+1).join("  "),h="",s="";for(e=0;e<a;e+=1){for(o=Math.floor((e-u)/t),s="",n=0;n<a;n+=1)i=1,u<=n&&n<c&&u<=e&&e<c&&f.isDark(o,Math.floor((n-u)/t))&&(i=0),s+=i?g:l;for(o=0;o<t;o+=1)h+=s+"\n"}return h.substring(0,h.length-1)},f.renderTo2dContext=function(t,r){r=r||2;for(var e=f.getModuleCount(),n=0;n<e;n++)for(var o=0;o<e;o++)t.fillStyle=f.isDark(n,o)?"black":"white",t.fillRect(n*r,o*r,r,r)},f};t.stringToBytes=(t.stringToBytesFuncs={default:function(t){for(var r=[],e=0;e<t.length;e+=1){var n=t.charCodeAt(e);r.push(255&n)}return r}}).default,t.createStringToBytes=function(t,r){var e=function(){for(var e=S(t),n=function(){var t=e.read();if(-1==t)throw"eof";return t},o=0,i={};;){var a=e.read();if(-1==a)break;var u=n(),f=n()<<8|n();i[String.fromCharCode(a<<8|u)]=f,o+=1}if(o!=r)throw o+" != "+r;return i}(),n="?".charCodeAt(0);return function(t){for(var r=[],o=0;o<t.length;o+=1){var i=t.charCodeAt(o);if(i<128)r.push(i);else{var a=e[t.charAt(o)];"number"==typeof a?(255&a)==a?r.push(a):(r.push(a>>>8),r.push(255&a)):r.push(n)}}return r}};var r,e,n,o,i,a=1,u=2,f=4,c=8,g={L:1,M:0,Q:3,H:2},l=0,h=1,s=2,v=3,d=4,w=5,p=6,y=7,B=(r=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],e=1335,n=7973,i=function(t){for(var r=0;0!=t;)r+=1,t>>>=1;return r},(o={}).getBCHTypeInfo=function(t){for(var r=t<<10;i(r)-i(e)>=0;)r^=e<<i(r)-i(e);return 21522^(t<<10|r)},o.getBCHTypeNumber=function(t){for(var r=t<<12;i(r)-i(n)>=0;)r^=n<<i(r)-i(n);return t<<12|r},o.getPatternPosition=function(t){return r[t-1]},o.getMaskFunction=function(t){switch(t){case l:return function(t,r){return(t+r)%2==0};case h:return function(t,r){return t%2==0};case s:return function(t,r){return r%3==0};case v:return function(t,r){return(t+r)%3==0};case d:return function(t,r){return(Math.floor(t/2)+Math.floor(r/3))%2==0};case w:return function(t,r){return t*r%2+t*r%3==0};case p:return function(t,r){return(t*r%2+t*r%3)%2==0};case y:return function(t,r){return(t*r%3+(t+r)%2)%2==0};default:throw"bad maskPattern:"+t}},o.getErrorCorrectPolynomial=function(t){for(var r=k([1],0),e=0;e<t;e+=1)r=r.multiply(k([1,C.gexp(e)],0));return r},o.getLengthInBits=function(t,r){if(1<=r&&r<10)switch(t){case a:return 10;case u:return 9;case f:case c:return 8;default:throw"mode:"+t}else if(r<27)switch(t){case a:return 12;case u:return 11;case f:return 16;case c:return 10;default:throw"mode:"+t}else{if(!(r<41))throw"type:"+r;switch(t){case a:return 14;case u:return 13;case f:return 16;case c:return 12;default:throw"mode:"+t}}},o.getLostPoint=function(t){for(var r=t.getModuleCount(),e=0,n=0;n<r;n+=1)for(var o=0;o<r;o+=1){for(var i=0,a=t.isDark(n,o),u=-1;u<=1;u+=1)if(!(n+u<0||r<=n+u))for(var f=-1;f<=1;f+=1)o+f<0||r<=o+f||0==u&&0==f||a==t.isDark(n+u,o+f)&&(i+=1);i>5&&(e+=3+i-5)}for(n=0;n<r-1;n+=1)for(o=0;o<r-1;o+=1){var c=0;t.isDark(n,o)&&(c+=1),t.isDark(n+1,o)&&(c+=1),t.isDark(n,o+1)&&(c+=1),t.isDark(n+1,o+1)&&(c+=1),0!=c&&4!=c||(e+=3)}for(n=0;n<r;n+=1)for(o=0;o<r-6;o+=1)t.isDark(n,o)&&!t.isDark(n,o+1)&&t.isDark(n,o+2)&&t.isDark(n,o+3)&&t.isDark(n,o+4)&&!t.isDark(n,o+5)&&t.isDark(n,o+6)&&(e+=40);for(o=0;o<r;o+=1)for(n=0;n<r-6;n+=1)t.isDark(n,o)&&!t.isDark(n+1,o)&&t.isDark(n+2,o)&&t.isDark(n+3,o)&&t.isDark(n+4,o)&&!t.isDark(n+5,o)&&t.isDark(n+6,o)&&(e+=40);var g=0;for(o=0;o<r;o+=1)for(n=0;n<r;n+=1)t.isDark(n,o)&&(g+=1);return e+=Math.abs(100*g/r/r-50)/5*10},o),C=function(){for(var t=new Array(256),r=new Array(256),e=0;e<8;e+=1)t[e]=1<<e;for(e=8;e<256;e+=1)t[e]=t[e-4]^t[e-5]^t[e-6]^t[e-8];for(e=0;e<255;e+=1)r[t[e]]=e;var n={glog:function(t){if(t<1)throw"glog("+t+")";return r[t]},gexp:function(r){for(;r<0;)r+=255;for(;r>=256;)r-=255;return t[r]}};return n}();function k(t,r){if(void 0===t.length)throw t.length+"/"+r;var e=function(){for(var e=0;e<t.length&&0==t[e];)e+=1;for(var n=new Array(t.length-e+r),o=0;o<t.length-e;o+=1)n[o]=t[o+e];return n}(),n={getAt:function(t){return e[t]},getLength:function(){return e.length},multiply:function(t){for(var r=new Array(n.getLength()+t.getLength()-1),e=0;e<n.getLength();e+=1)for(var o=0;o<t.getLength();o+=1)r[e+o]^=C.gexp(C.glog(n.getAt(e))+C.glog(t.getAt(o)));return k(r,0)},mod:function(t){if(n.getLength()-t.getLength()<0)return n;for(var r=C.glog(n.getAt(0))-C.glog(t.getAt(0)),e=new Array(n.getLength()),o=0;o<n.getLength();o+=1)e[o]=n.getAt(o);for(o=0;o<t.getLength();o+=1)e[o]^=C.gexp(C.glog(t.getAt(o))+r);return k(e,0).mod(t)}};return n}var A=function(){var t=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],r=function(t,r){var e={};return e.totalCount=t,e.dataCount=r,e},e={};return e.getRSBlocks=function(e,n){var o=function(r,e){switch(e){case g.L:return t[4*(r-1)+0];case g.M:return t[4*(r-1)+1];case g.Q:return t[4*(r-1)+2];case g.H:return t[4*(r-1)+3];default:return}}(e,n);if(void 0===o)throw"bad rs block @ typeNumber:"+e+"/errorCorrectionLevel:"+n;for(var i=o.length/3,a=[],u=0;u<i;u+=1)for(var f=o[3*u+0],c=o[3*u+1],l=o[3*u+2],h=0;h<f;h+=1)a.push(r(c,l));return a},e}(),b=function(){var t=[],r=0,e={getBuffer:function(){return t},getAt:function(r){var e=Math.floor(r/8);return 1==(t[e]>>>7-r%8&1)},put:function(t,r){for(var n=0;n<r;n+=1)e.putBit(1==(t>>>r-n-1&1))},getLengthInBits:function(){return r},putBit:function(e){var n=Math.floor(r/8);t.length<=n&&t.push(0),e&&(t[n]|=128>>>r%8),r+=1}};return e},M=function(t){var r=a,e=t,n={getMode:function(){return r},getLength:function(t){return e.length},write:function(t){for(var r=e,n=0;n+2<r.length;)t.put(o(r.substring(n,n+3)),10),n+=3;n<r.length&&(r.length-n==1?t.put(o(r.substring(n,n+1)),4):r.length-n==2&&t.put(o(r.substring(n,n+2)),7))}},o=function(t){for(var r=0,e=0;e<t.length;e+=1)r=10*r+i(t.charAt(e));return r},i=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);throw"illegal char :"+t};return n},x=function(t){var r=u,e=t,n={getMode:function(){return r},getLength:function(t){return e.length},write:function(t){for(var r=e,n=0;n+1<r.length;)t.put(45*o(r.charAt(n))+o(r.charAt(n+1)),11),n+=2;n<r.length&&t.put(o(r.charAt(n)),6)}},o=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);if("A"<=t&&t<="Z")return t.charCodeAt(0)-"A".charCodeAt(0)+10;switch(t){case" ":return 36;case"$":return 37;case"%":return 38;case"*":return 39;case"+":return 40;case"-":return 41;case".":return 42;case"/":return 43;case":":return 44;default:throw"illegal char :"+t}};return n},m=function(r){var e=f,n=t.stringToBytes(r),o={getMode:function(){return e},getLength:function(t){return n.length},write:function(t){for(var r=0;r<n.length;r+=1)t.put(n[r],8)}};return o},L=function(r){var e=c,n=t.stringToBytesFuncs.SJIS;if(!n)throw"sjis not supported.";!function(){var t=n("友");if(2!=t.length||38726!=(t[0]<<8|t[1]))throw"sjis not supported."}();var o=n(r),i={getMode:function(){return e},getLength:function(t){return~~(o.length/2)},write:function(t){for(var r=o,e=0;e+1<r.length;){var n=(255&r[e])<<8|255&r[e+1];if(33088<=n&&n<=40956)n-=33088;else{if(!(57408<=n&&n<=60351))throw"illegal char at "+(e+1)+"/"+n;n-=49472}n=192*(n>>>8&255)+(255&n),t.put(n,13),e+=2}if(e<r.length)throw"illegal char at "+(e+1)}};return i},D=function(){var t=[],r={writeByte:function(r){t.push(255&r)},writeShort:function(t){r.writeByte(t),r.writeByte(t>>>8)},writeBytes:function(t,e,n){e=e||0,n=n||t.length;for(var o=0;o<n;o+=1)r.writeByte(t[o+e])},writeString:function(t){for(var e=0;e<t.length;e+=1)r.writeByte(t.charCodeAt(e))},toByteArray:function(){return t},toString:function(){var r="";r+="[";for(var e=0;e<t.length;e+=1)e>0&&(r+=","),r+=t[e];return r+="]"}};return r},S=function(t){var r=t,e=0,n=0,o=0,i={read:function(){for(;o<8;){if(e>=r.length){if(0==o)return-1;throw"unexpected end of file./"+o}var t=r.charAt(e);if(e+=1,"="==t)return o=0,-1;t.match(/^\s$/)||(n=n<<6|a(t.charCodeAt(0)),o+=6)}var i=n>>>o-8&255;return o-=8,i}},a=function(t){if(65<=t&&t<=90)return t-65;if(97<=t&&t<=122)return t-97+26;if(48<=t&&t<=57)return t-48+52;if(43==t)return 62;if(47==t)return 63;throw"c:"+t};return i},I=function(t,r,e){for(var n=function(t,r){var e=t,n=r,o=new Array(t*r),i={setPixel:function(t,r,n){o[r*e+t]=n},write:function(t){t.writeString("GIF87a"),t.writeShort(e),t.writeShort(n),t.writeByte(128),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(255),t.writeByte(255),t.writeByte(255),t.writeString(","),t.writeShort(0),t.writeShort(0),t.writeShort(e),t.writeShort(n),t.writeByte(0);var r=a(2);t.writeByte(2);for(var o=0;r.length-o>255;)t.writeByte(255),t.writeBytes(r,o,255),o+=255;t.writeByte(r.length-o),t.writeBytes(r,o,r.length-o),t.writeByte(0),t.writeString(";")}},a=function(t){for(var r=1<<t,e=1+(1<<t),n=t+1,i=u(),a=0;a<r;a+=1)i.add(String.fromCharCode(a));i.add(String.fromCharCode(r)),i.add(String.fromCharCode(e));var f,c,g,l=D(),h=(f=l,c=0,g=0,{write:function(t,r){if(t>>>r!=0)throw"length over";for(;c+r>=8;)f.writeByte(255&(t<<c|g)),r-=8-c,t>>>=8-c,g=0,c=0;g|=t<<c,c+=r},flush:function(){c>0&&f.writeByte(g)}});h.write(r,n);var s=0,v=String.fromCharCode(o[s]);for(s+=1;s<o.length;){var d=String.fromCharCode(o[s]);s+=1,i.contains(v+d)?v+=d:(h.write(i.indexOf(v),n),i.size()<4095&&(i.size()==1<<n&&(n+=1),i.add(v+d)),v=d)}return h.write(i.indexOf(v),n),h.write(e,n),h.flush(),l.toByteArray()},u=function(){var t={},r=0,e={add:function(n){if(e.contains(n))throw"dup key:"+n;t[n]=r,r+=1},size:function(){return r},indexOf:function(r){return t[r]},contains:function(r){return void 0!==t[r]}};return e};return i}(t,r),o=0;o<r;o+=1)for(var i=0;i<t;i+=1)n.setPixel(i,o,e(i,o));var a=D();n.write(a);for(var u=function(){var t=0,r=0,e=0,n="",o={},i=function(t){n+=String.fromCharCode(a(63&t))},a=function(t){if(t<0);else{if(t<26)return 65+t;if(t<52)return t-26+97;if(t<62)return t-52+48;if(62==t)return 43;if(63==t)return 47}throw"n:"+t};return o.writeByte=function(n){for(t=t<<8|255&n,r+=8,e+=1;r>=6;)i(t>>>r-6),r-=6},o.flush=function(){if(r>0&&(i(t<<6-r),t=0,r=0),e%3!=0)for(var o=3-e%3,a=0;a<o;a+=1)n+="="},o.toString=function(){return n},o}(),f=a.toByteArray(),c=0;c<f.length;c+=1)u.writeByte(f[c]);return u.flush(),"data:image/gif;base64,"+u};return t}();qrcode.stringToBytesFuncs["UTF-8"]=function(t){return function(t){for(var r=[],e=0;e<t.length;e++){var n=t.charCodeAt(e);n<128?r.push(n):n<2048?r.push(192|n>>6,128|63&n):n<55296||n>=57344?r.push(224|n>>12,128|n>>6&63,128|63&n):(e++,n=65536+((1023&n)<<10|1023&t.charCodeAt(e)),r.push(240|n>>18,128|n>>12&63,128|n>>6&63,128|63&n))}return r}(t)},function(t){"function"==typeof define&&define.amd?define([],t):"object"==typeof exports&&(module.exports=t())}((function(){return qrcode}));
try { if (typeof qrcode === 'function') { window.qrcode = qrcode; } } catch (e) {}
//# sourceMappingURL=/sm/26b4b0d0b1e283d6b3ec9857ac597d7a60c76ac17be1ef4c965f03086de426bb.map

;

// ============================================================
// CardTrack — customer money loop (P2P, QR, storefront cart, promos)
// ============================================================
var SF_CART = [];
var SF_PAY = 'credit';
var SF_PROMO = null;
var MEET_PROMO = null;
var _p2pPending = null;
var SF_CUSTOMER = null; // public mode customer (id lookup only — never list others)

function ctMakeQrToken() {
  try {
    var a = new Uint8Array(8);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  } catch (e) {
    return String(Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  }
}
function ensureCustomerQrToken(c) {
  if (!c) return null;
  if (!c.qrToken) {
    c.qrToken = ctMakeQrToken();
    var list = getCustomers();
    var i = list.findIndex(function (x) { return String(x.id) === String(c.id); });
    if (i >= 0) { list[i].qrToken = c.qrToken; saveCustomers(list); }
  }
  return c.qrToken;
}
function findCustomerByIdOrToken(key) {
  if (!key) return null;
  var k = String(key);
  return getCustomers().find(function (c) {
    return String(c.id) === k || String(c.qrToken || '') === k;
  }) || null;
}
function customerStorefrontUrl(c) {
  ensureCustomerQrToken(c);
  var token = c.qrToken || c.id;
  var base;
  if (location.protocol === 'file:') {
    base = location.href.split('?')[0].split('#')[0];
  } else {
    base = location.origin + location.pathname;
  }
  return base + '?storefront=1&c=' + encodeURIComponent(token);
}
function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(t).then(function () { return true; }).catch(function () {
      prompt('Copy', t); return false;
    });
  }
  prompt('Copy', t);
  return Promise.resolve(false);
}
function ctQrFactory() {
  var q = (typeof window !== 'undefined' && window.qrcode) || (typeof qrcode !== 'undefined' ? qrcode : null);
  return (typeof q === 'function') ? q : null;
}
function renderQrToCanvas(text, canvas) {
  if (!canvas) return false;
  try {
    var factory = ctQrFactory();
    if (!factory) throw new Error('no qrcode');
    var qr = factory(0, 'M');
    qr.addData(String(text || ''), 'Byte');
    qr.make();
    var n = qr.getModuleCount();
    var size = Math.max(220, canvas.width || 220);
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d');
    var cell = size / n;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(Math.floor(c * cell), Math.floor(r * cell), Math.ceil(cell), Math.ceil(cell));
      }
    }
    return true;
  } catch (e) {
    try {
      var factory2 = ctQrFactory();
      if (!factory2) return false;
      var qr2 = factory2(0, 'M');
      qr2.addData(String(text || ''), 'Byte');
      qr2.make();
      if (typeof qr2.createDataURL === 'function') {
        var img = $('qr-img');
        if (img) { img.src = qr2.createDataURL(4, 8); img.style.display = 'block'; }
        if (canvas) canvas.style.display = 'none';
        return 'img';
      }
      if (typeof qr2.createSvgTag === 'function') {
        var wrap = canvas && canvas.parentNode;
        if (wrap) {
          var holder = document.createElement('div');
          holder.innerHTML = qr2.createSvgTag(4, 8);
          var svg = holder.firstChild;
          if (svg) {
            svg.style.width = '220px';
            svg.style.height = '220px';
            wrap.insertBefore(svg, canvas);
            canvas.style.display = 'none';
            return 'svg';
          }
        }
      }
    } catch (e2) {}
    return false;
  }
}
function ctPaintQrIntoModal(url, title, subtitle) {
  if ($('qr-modal-title')) $('qr-modal-title').textContent = (window._qrMode === 'customer' ? 'Customer QR' : 'Storefront QR');
  if ($('qr-cust-name')) $('qr-cust-name').textContent = title || 'QR';
  if ($('qr-cust-credit')) $('qr-cust-credit').textContent = subtitle || '';
  if ($('qr-link')) $('qr-link').textContent = url || '';
  window._qrLink = url || '';
  var canvas = $('qr-canvas');
  var img = $('qr-img');
  var wrap = canvas && canvas.parentNode;
  if (wrap) {
    Array.prototype.slice.call(wrap.querySelectorAll('svg')).forEach(function (s) { s.parentNode.removeChild(s); });
  }
  var ok = renderQrToCanvas(url, canvas);
  if (ok === true) {
    if (canvas) canvas.style.display = 'block';
    if (img) img.style.display = 'none';
  } else if (ok === 'img' || ok === 'svg') {
    /* already painted by fallback */
  } else {
    if (canvas) canvas.style.display = 'none';
    if (img) {
      img.style.display = 'block';
      /* offline-safe: tiny pure-JS already failed — show placeholder + link */
      try {
        var factory = ctQrFactory();
        if (factory) {
          var qr = factory(0, 'M');
          qr.addData(String(url || ''), 'Byte');
          qr.make();
          img.src = qr.createDataURL(4, 8);
        } else {
          img.removeAttribute('src');
          img.alt = 'QR unavailable — use Copy link';
        }
      } catch (e) {
        img.removeAttribute('src');
        img.alt = 'QR unavailable — use Copy link';
      }
    }
  }
  openSheet('sheet-customer-qr');
  var sheet = $('sheet-customer-qr');
  if (sheet) {
    sheet.classList.add('open');
    sheet.style.display = 'flex';
    sheet.style.zIndex = '20000';
  }
}
function showCustomerQr(id) {
  var c = findCustomerByIdOrToken(id) || getCustomers().find(function (x) { return String(x.id) === String(id); });
  if (!c) { toast('Customer not found', 'err'); return; }
  ensureCustomerQrToken(c);
  var url = customerStorefrontUrl(c);
  window._qrCustomerId = c.id;
  window._qrMode = 'customer';
  ctPaintQrIntoModal(url, c.name || 'Customer', (typeof fmt === 'function' ? fmt(c.balance || 0) : ('$' + (c.balance || 0))) + ' credit');
}
function showStorefrontQr() {
  var url = location.origin + location.pathname + '?storefront=1';
  if (location.protocol === 'file:') url = location.href.split('?')[0].split('#')[0] + '?storefront=1';
  window._qrCustomerId = null;
  window._qrMode = 'storefront';
  var shop = '';
  try { shop = (loadSettings().shopName) || 'Storefront'; } catch (e) { shop = 'Storefront'; }
  ctPaintQrIntoModal(url, shop || 'Storefront', 'Public catalog QR');
}
function dismissBackupBanner() {
  var b = $('backup-banner');
  if (b) b.classList.remove('show');
  try {
    var s = loadSettings();
    s.backupBannerDismissedAt = new Date().toISOString();
    saveSettings(s);
  } catch (e) {}
}
function copyCustomerQrLink() {
  var url = window._qrLink || '';
  if (!url) { toast('No link', 'err'); return; }
  copyText(url).then(function () { toast('Storefront link copied', 'ok'); });
}
function copyCustomerStorefrontLink(id) {
  var c = getCustomers().find(function (x) { return String(x.id) === String(id); });
  if (!c) { toast('Customer not found', 'err'); return; }
  var url = customerStorefrontUrl(c);
  copyText(url).then(function () { toast('Customer storefront link copied', 'ok'); });
}
function printCustomerQr() {
  document.body.classList.add('printing-qr');
  openSheet('sheet-customer-qr');
  setTimeout(function () {
    window.print();
    setTimeout(function () { document.body.classList.remove('printing-qr'); }, 400);
  }, 200);
}
function offerCustomerQrAfterCredit(c) {
  if (!c) return;
  if (confirm('Store credit added for ' + (c.name || 'customer') + '. Show their storefront QR?')) {
    showCustomerQr(c.id);
  }
}

/* ---- P2P payout ---- */
function p2pSettings() {
  var s = loadSettings();
  return s.p2p || { cashapp: '', venmo: '', zelle: '', paypal: '' };
}
function cashAppDeepLink(tag, amount) {
  var t = String(tag || '').replace(/^\$/, '').trim();
  if (!t) return '';
  var a = (num(amount) || 0).toFixed(2);
  return 'https://cash.app/$' + encodeURIComponent(t) + '/' + a;
}
function venmoDeepLink(handle, amount) {
  var h = String(handle || '').replace(/^@/, '').trim();
  if (!h) return '';
  return 'https://venmo.com/' + encodeURIComponent(h) + '?txn=pay&amount=' + encodeURIComponent((num(amount) || 0).toFixed(2));
}
function paypalDeepLink(me, amount) {
  var m = String(me || '').trim().replace(/^https?:\/\/(www\.)?paypal\.me\//i, '');
  if (!m) return '';
  if (/^https?:/i.test(me)) return me;
  return 'https://paypal.me/' + m.replace(/^\//, '') + '/' + (num(amount) || 0).toFixed(2);
}
function openP2PPayout() {
  if (!quoteLines.length) { toast('Add items to the quote first', 'err'); return; }
  var cashTotal = quoteLines.reduce(function (s, l) { return s + lineOffers(l).cash; }, 0);
  _p2pPending = { amount: cashTotal };
  var card = $('p2p-pay-card');
  if (card) card.style.display = 'block';
  if ($('p2p-pay-amt')) $('p2p-pay-amt').textContent = fmt(cashTotal);
  var p2p = p2pSettings();
  var label = p2p.cashapp ? ('Pay ' + fmt(cashTotal) + ' to ' + (p2p.cashapp.indexOf('$') === 0 ? p2p.cashapp : ('$' + p2p.cashapp))) :
    (p2p.venmo ? ('Pay ' + fmt(cashTotal) + ' via Venmo ' + p2p.venmo) :
    (p2p.zelle ? ('Zelle ' + fmt(cashTotal) + ' to ' + p2p.zelle) :
    (p2p.paypal ? ('PayPal ' + fmt(cashTotal)) : 'Set P2P handles in Settings')));
  if ($('p2p-pay-instr')) $('p2p-pay-instr').textContent = label;
  var box = $('p2p-handles');
  if (box) {
    var chips = [];
    if (p2p.cashapp) {
      var ca = cashAppDeepLink(p2p.cashapp, cashTotal);
      chips.push('<button type="button" class="p2p-chip" onclick="copyText(\'' + ca.replace(/'/g, '') + '\').then(function(){toast(\'Cash App link copied\',\'ok\')})">Cash App ' + esc(p2p.cashapp) + '</button>');
      chips.push('<button type="button" class="p2p-chip" onclick="window.open(\'' + ca.replace(/'/g, '') + '\',\'_blank\')">Open Cash App</button>');
    }
    if (p2p.venmo) {
      var vu = venmoDeepLink(p2p.venmo, cashTotal);
      chips.push('<button type="button" class="p2p-chip" onclick="copyText(\'' + vu.replace(/'/g, '') + '\').then(function(){toast(\'Venmo link copied\',\'ok\')})">Venmo ' + esc(p2p.venmo) + '</button>');
    }
    if (p2p.zelle) {
      chips.push('<button type="button" class="p2p-chip" onclick="copyText(\'' + String(p2p.zelle).replace(/'/g, '') + '\').then(function(){toast(\'Zelle handle copied\',\'ok\')})">Zelle ' + esc(p2p.zelle) + '</button>');
    }
    if (p2p.paypal) {
      var pu = paypalDeepLink(p2p.paypal, cashTotal);
      chips.push('<button type="button" class="p2p-chip" onclick="copyText(\'' + pu.replace(/'/g, '') + '\').then(function(){toast(\'PayPal link copied\',\'ok\')})">PayPal</button>');
    }
    if (!chips.length) chips.push('<div class="text-muted" style="font-size:12px">Add Cash App / Venmo / Zelle / PayPal in Settings → P2P payout handles.</div>');
    box.innerHTML = chips.join('');
  }
  if ($('p2p-seller-note') && $('bl-customer')) $('p2p-seller-note').value = $('bl-customer').value || '';
}
function hideP2PPayout() {
  _p2pPending = null;
  var card = $('p2p-pay-card');
  if (card) card.style.display = 'none';
}
function markP2PPaidAndAccept() {
  if ($('p2p-seller-note') && $('p2p-seller-note').value && $('bl-customer') && !$('bl-customer').value) {
    $('bl-customer').value = $('p2p-seller-note').value;
  }
  hideP2PPayout();
  acceptQuote('p2p');
}

/* ---- Promos ---- */
function getPromos() {
  var s = loadSettings();
  return Array.isArray(s.promos) ? s.promos : [];
}
function savePromos(list) {
  var s = loadSettings();
  s.promos = list || [];
  saveSettings(s);
}
function renderPromoList() {
  var box = $('promo-list');
  if (!box) return;
  var list = getPromos();
  if (!list.length) {
    box.innerHTML = '<div class="text-muted" style="font-size:12px">No promos yet.</div>';
    return;
  }
  box.innerHTML = list.map(function (p, i) {
    return '<div class="promo-item"><div><strong>' + esc(p.code) + '</strong> · ' +
      (p.type === 'percent' ? (p.value + '%') : fmt(p.value)) + ' off' +
      (p.expires ? ' · exp ' + esc(p.expires) : '') +
      ' · used ' + (p.uses || 0) + (p.maxUses ? '/' + p.maxUses : '') +
      '</div><button class="btn btn-secondary" type="button" style="width:auto;padding:6px 10px" onclick="removePromoCode(' + i + ')">Remove</button></div>';
  }).join('');
}
function addPromoCode() {
  var code = (($('promo-code') && $('promo-code').value) || '').trim().toUpperCase();
  var type = ($('promo-type') && $('promo-type').value) || 'percent';
  var value = num($('promo-value') && $('promo-value').value);
  var maxUses = ($('promo-max') && $('promo-max').value) ? int($('promo-max').value, 0) : null;
  var expires = ($('promo-expires') && $('promo-expires').value) || '';
  if (!code) { toast('Enter a code', 'err'); return; }
  if (!value) { toast('Enter a value', 'err'); return; }
  var list = getPromos();
  if (list.some(function (p) { return p.code === code; })) { toast('Code already exists', 'err'); return; }
  list.push({ code: code, type: type, value: value, expires: expires || null, uses: 0, maxUses: maxUses || null });
  savePromos(list);
  if ($('promo-code')) $('promo-code').value = '';
  if ($('promo-value')) $('promo-value').value = '';
  renderPromoList();
  toast('Promo ' + code + ' added', 'ok');
}
function removePromoCode(i) {
  var list = getPromos();
  list.splice(i, 1);
  savePromos(list);
  renderPromoList();
}
function findPromo(code) {
  var c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  return getPromos().find(function (p) { return p.code === c; }) || null;
}
function promoValid(p) {
  if (!p) return { ok: false, reason: 'Invalid code' };
  if (p.expires) {
    var today = d8();
    if (p.expires < today) return { ok: false, reason: 'Expired' };
  }
  if (p.maxUses != null && num(p.uses) >= num(p.maxUses)) return { ok: false, reason: 'Max uses reached' };
  return { ok: true };
}
function promoDiscount(p, subtotal) {
  if (!p) return 0;
  var sub = num(subtotal);
  if (p.type === 'percent') return Math.round(sub * (num(p.value) / 100) * 100) / 100;
  return Math.min(sub, num(p.value));
}
function redeemPromo(code) {
  var list = getPromos();
  var i = list.findIndex(function (p) { return p.code === String(code || '').toUpperCase(); });
  if (i < 0) return null;
  list[i].uses = int(list[i].uses, 0) + 1;
  savePromos(list);
  return list[i];
}
function applyMeetPromo() {
  var code = ($('log-promo-code') && $('log-promo-code').value) || '';
  var p = findPromo(code);
  var msg = $('meet-promo-msg');
  var v = promoValid(p);
  if (!v.ok) {
    MEET_PROMO = null;
    if (msg) { msg.textContent = v.reason || 'Invalid'; msg.className = 'err'; msg.style.color = 'var(--red)'; }
    updateSaleCreditPreview();
    return;
  }
  MEET_PROMO = p;
  if (msg) { msg.textContent = p.code + ' applied'; msg.className = 'ok'; msg.style.color = 'var(--green)'; }
  updateSaleCreditPreview();
  toast('Promo applied', 'ok');
}

/* wrap checkoutDue / updateSaleCreditPreview for promo */
(function patchPromoCheckout() {
  if (typeof checkoutDue === 'function' && !checkoutDue._promo) {
    var _cd = checkoutDue;
    checkoutDue = function () {
      var due = _cd();
      if (MEET_PROMO) {
        var sub = CART.length ? cartSubtotal() : (num($('log-price') && $('log-price').value) * int($('log-qty') && $('log-qty').value, 1));
        var apply = $('log-apply-credit') && $('log-apply-credit').checked;
        var credit = apply ? num($('log-credit-amt') && $('log-credit-amt').value) : 0;
        var disc = promoDiscount(MEET_PROMO, sub);
        due = Math.max(0, Math.round((sub - disc - credit) * 100) / 100);
      }
      return due;
    };
    checkoutDue._promo = true;
  }
})();

/* ---- Storefront cart / customer mode ---- */
function hydrateSfCustomerFromUrl() {
  var key = storefrontCustomerIdFromUrl();
  SF_CUSTOMER = null;
  if (!key) {
    var ban = $('sf-cust-banner');
    if (ban) ban.classList.remove('show');
    return;
  }
  // Only resolve the single customer by id/token — never enumerate others into the page
  var c = findCustomerByIdOrToken(key);
  if (!c) {
    var ban2 = $('sf-cust-banner');
    if (ban2) {
      ban2.classList.add('show');
      if ($('sf-cust-hi')) $('sf-cust-hi').textContent = 'Welcome';
      if ($('sf-cust-credit')) $('sf-cust-credit').textContent = 'Credit unavailable on this device';
    }
    return;
  }
  SF_CUSTOMER = { id: c.id, name: c.name, email: c.email, phone: c.phone, address: c.address, city: c.city, state: c.state, zip: c.zip, balance: c.balance, qrToken: c.qrToken };
  var ban3 = $('sf-cust-banner');
  if (ban3) ban3.classList.add('show');
  if ($('sf-cust-hi')) $('sf-cust-hi').textContent = 'Hi ' + (c.name || 'there');
  if ($('sf-cust-credit')) $('sf-cust-credit').textContent = fmt(c.balance || 0) + ' credit';
  if ($('sf-name')) $('sf-name').value = c.name || '';
  if ($('sf-email')) $('sf-email').value = c.email || '';
  if ($('sf-phone')) $('sf-phone').value = c.phone || '';
  if ($('sf-addr')) $('sf-addr').value = c.address || '';
  if ($('sf-city')) $('sf-city').value = c.city || '';
  if ($('sf-sz')) $('sf-sz').value = ((c.state || '') + ' ' + (c.zip || '')).trim();
}
function sfCartSubtotal() {
  return SF_CART.reduce(function (s, l) { return s + num(l.price) * int(l.qty, 1); }, 0);
}
function renderSfCartBar() {
  var bar = $('sf-cart-bar');
  if (!bar) return;
  if (!SF_CART.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  var n = SF_CART.reduce(function (s, l) { return s + int(l.qty, 1); }, 0);
  if ($('sf-cart-count')) $('sf-cart-count').textContent = n + (n === 1 ? ' item' : ' items');
  if ($('sf-cart-sub')) $('sf-cart-sub').textContent = fmt(sfCartSubtotal());
}
function sfAddToCart(idx) {
  var item = DB.inventory[idx];
  if (!item || !item.qty) { toast('Out of stock', 'err'); return; }
  var price = storefrontPrice(item);
  var existing = SF_CART.findIndex(function (l) { return l.invId != null && String(l.invId) === String(item.id); });
  if (existing < 0) existing = SF_CART.findIndex(function (l) { return l.sku && item.sku && l.sku === item.sku; });
  if (existing >= 0) {
    SF_CART[existing].qty = int(SF_CART[existing].qty, 1) + 1;
  } else {
    SF_CART.push({
      invId: item.id,
      invIdx: idx,
      sku: item.sku || '',
      name: item.name || '',
      price: price,
      cost: num(item.cost),
      qty: 1,
      condition: item.condition || 'NM',
      kind: item.kind || 'raw',
      image: item.image || ''
    });
  }
  renderSfCartBar();
  toast('Added to cart', 'ok');
}
function setSfPayMethod(m) {
  SF_PAY = m || 'credit';
  document.querySelectorAll('[data-sfpay]').forEach(function (el) {
    el.classList.toggle('active', el.getAttribute('data-sfpay') === SF_PAY);
  });
  previewSfCheckout();
}
function openSfCheckout() {
  if (!SF_CART.length) { toast('Cart is empty', 'err'); return; }
  hydrateSfCustomerFromUrl();
  var box = $('sf-checkout');
  if (box) box.classList.add('open');
  previewSfCheckout();
  try { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
}
function closeSfCheckout() {
  var box = $('sf-checkout');
  if (box) box.classList.remove('open');
}
function applySfPromo() {
  var code = ($('sf-promo-code') && $('sf-promo-code').value) || '';
  var p = findPromo(code);
  var msg = $('sf-promo-msg');
  var v = promoValid(p);
  if (!v.ok) {
    SF_PROMO = null;
    if (msg) { msg.textContent = v.reason || 'Invalid code'; msg.className = 'err'; }
    previewSfCheckout();
    return;
  }
  SF_PROMO = p;
  if (msg) { msg.textContent = p.code + ' · ' + (p.type === 'percent' ? (p.value + '%') : fmt(p.value)) + ' off'; msg.className = 'ok'; }
  previewSfCheckout();
  toast('Promo applied', 'ok');
}
function previewSfCheckout() {
  var sub = sfCartSubtotal();
  var lines = $('sf-checkout-lines');
  if (lines) {
    lines.innerHTML = SF_CART.map(function (l, i) {
      return '<div class="flex-between" style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--border)">' +
        '<div><strong>' + esc(l.name) + '</strong> × ' + int(l.qty, 1) +
        ' <button type="button" class="btn btn-secondary" style="width:auto;padding:2px 8px;margin-left:6px" onclick="SF_CART.splice(' + i + ',1);renderSfCartBar();previewSfCheckout()">×</button></div>' +
        '<span>' + fmt(num(l.price) * int(l.qty, 1)) + '</span></div>';
    }).join('') || '<div class="text-muted">Empty</div>';
  }
  if (SF_PROMO && ($('sf-promo-code') && $('sf-promo-code').value)) {
    /* keep */
  } else if ($('sf-promo-code') && $('sf-promo-code').value && !SF_PROMO) {
    var maybe = findPromo($('sf-promo-code').value);
    if (maybe && promoValid(maybe).ok) SF_PROMO = maybe;
  }
  var disc = promoDiscount(SF_PROMO, sub);
  var afterPromo = Math.max(0, sub - disc);
  var creditBal = 0;
  if (SF_CUSTOMER) {
    var live = findCustomerByIdOrToken(SF_CUSTOMER.id) || findCustomerByIdOrToken(SF_CUSTOMER.qrToken);
    creditBal = live ? num(live.balance) : num(SF_CUSTOMER.balance);
  } else {
    var nm = normalizeCustName($('sf-name') && $('sf-name').value);
    var found = nm ? findCustomerByName(nm) : null;
    creditBal = found ? num(found.balance) : 0;
  }
  var credBox = $('sf-credit-box');
  if (credBox) credBox.style.display = creditBal > 0 ? 'block' : 'none';
  if ($('sf-credit-bal')) $('sf-credit-bal').textContent = fmt(creditBal);
  var applyCred = !($('sf-apply-credit') && !$('sf-apply-credit').checked);
  var creditApply = applyCred ? Math.min(creditBal, afterPromo) : 0;
  var due = Math.max(0, Math.round((afterPromo - creditApply) * 100) / 100);
  if ($('sf-co-sub')) $('sf-co-sub').textContent = fmt(sub);
  if ($('sf-co-promo')) $('sf-co-promo').textContent = '−' + fmt(disc);
  if ($('sf-co-credit')) $('sf-co-credit').textContent = '−' + fmt(creditApply);
  if ($('sf-co-due')) $('sf-co-due').textContent = fmt(due);
  return { sub: sub, disc: disc, creditApply: creditApply, due: due, creditBal: creditBal };
}
function placeSfOrder() {
  if (!SF_CART.length) { toast('Cart is empty', 'err'); return; }
  var totals = previewSfCheckout();
  var name = normalizeCustName($('sf-name') && $('sf-name').value) || (SF_CUSTOMER && SF_CUSTOMER.name) || '';
  if (!name && totals.creditApply > 0) { toast('Name required to apply store credit', 'err'); return; }
  if (!name) name = 'Storefront guest';
  var customer = null;
  if (SF_CUSTOMER) {
    customer = findCustomerByIdOrToken(SF_CUSTOMER.id) || findCustomerByIdOrToken(SF_CUSTOMER.qrToken);
  }
  if (!customer && name) customer = findOrCreateCustomer(name);
  if (customer) {
    var list = getCustomers();
    var c = list.find(function (x) { return String(x.id) === String(customer.id); });
    if (c) {
      c.email = (($('sf-email') && $('sf-email').value) || c.email || '').trim();
      c.phone = (($('sf-phone') && $('sf-phone').value) || c.phone || '').trim();
      c.address = (($('sf-addr') && $('sf-addr').value) || c.address || '').trim();
      c.city = (($('sf-city') && $('sf-city').value) || c.city || '').trim();
      var sz = (($('sf-sz') && $('sf-sz').value) || '').trim();
      if (sz) {
        var parts = sz.split(/\s+/);
        if (parts.length >= 2) { c.state = parts[0]; c.zip = parts.slice(1).join(' '); }
        else c.zip = sz;
      }
      saveCustomers(list);
      customer = c;
    }
  }
  if (totals.creditApply > 0 && customer) {
    try {
      redeemCustomerCredit(customer.name, totals.creditApply, 'Storefront order', 'storefront');
    } catch (e) { toast(e.message || 'Credit failed', 'err'); return; }
  }
  var promoCode = SF_PROMO ? SF_PROMO.code : '';
  if (SF_PROMO) redeemPromo(SF_PROMO.code);
  var shipping = {
    address: ($('sf-addr') && $('sf-addr').value) || '',
    city: ($('sf-city') && $('sf-city').value) || '',
    state: '',
    zip: ''
  };
  var sz2 = (($('sf-sz') && $('sf-sz').value) || '').trim().split(/\s+/);
  if (sz2.length >= 2) { shipping.state = sz2[0]; shipping.zip = sz2.slice(1).join(' '); }
  else shipping.zip = (($('sf-sz') && $('sf-sz').value) || '');
  var groupId = Date.now();
  var notePay = (($('sf-pay-note') && $('sf-pay-note').value) || '').trim();
  var remainingCredit = totals.creditApply;
  var remainingDisc = totals.disc;
  SF_CART.forEach(function (line, li) {
    var sku = (line.sku || '').toUpperCase();
    var price = num(line.price);
    var cost = num(line.cost);
    var qty = int(line.qty, 1);
    var inv = DB.inventory;
    var remaining = qty;
    for (var i = 0; i < inv.length && remaining > 0; i++) {
      var same = (line.invId != null && String(inv[i].id) === String(line.invId)) ||
        (sku && inv[i].sku === sku) ||
        (!sku && line.name && (inv[i].name || '').toLowerCase() === line.name.toLowerCase());
      if (inv[i].qty > 0 && same) {
        if (!cost && inv[i].cost) cost = inv[i].cost;
        var take = Math.min(inv[i].qty, remaining);
        inv[i].qty -= take;
        remaining -= take;
      }
    }
    DB.inventory = inv.filter(function (x) { return x.qty > 0; });
    var lineTotal = price * qty;
    var share = totals.sub > 0 ? lineTotal / totals.sub : 0;
    var lineDisc = Math.round(totals.disc * share * 100) / 100;
    if (li === SF_CART.length - 1) lineDisc = remainingDisc;
    remainingDisc = Math.round((remainingDisc - lineDisc) * 100) / 100;
    var after = Math.max(0, lineTotal - lineDisc);
    var lineCredit = 0;
    if (remainingCredit > 0) {
      lineCredit = Math.min(remainingCredit, after);
      remainingCredit = Math.round((remainingCredit - lineCredit) * 100) / 100;
    }
    DB.sales.push({
      id: groupId + li,
      groupId: groupId,
      sku: sku,
      name: line.name,
      price: price,
      cost: cost,
      qty: qty,
      location: 'Storefront',
      date: d8(),
      condition: line.condition || 'NM',
      kind: line.kind || 'raw',
      profit: (price - cost) * qty - lineDisc,
      customer: customer ? customer.name : name,
      customerId: customer ? customer.id : null,
      customerEmail: customer && customer.email || (($('sf-email') && $('sf-email').value) || ''),
      customerPhone: customer && customer.phone || (($('sf-phone') && $('sf-phone').value) || ''),
      creditApplied: lineCredit,
      promoCode: promoCode,
      promoDiscount: lineDisc,
      cashPaid: Math.round((after - lineCredit) * 100) / 100,
      paymentMethod: SF_PAY,
      paymentStatus: totals.due <= 0.001 ? 'paid' : 'pending',
      paymentNote: notePay,
      needsShip: !!(shipping.address),
      shipping: shipping,
      source: 'storefront'
    });
  });
  if (customer) {
    customer.history = customer.history || [];
    customer.history.unshift({
      id: Date.now(), date: d8(), ts: new Date().toISOString(), type: 'order',
      amount: totals.sub, signed: 0, balanceAfter: customer.balance,
      note: 'Storefront order' + (promoCode ? (' · ' + promoCode) : ''), ref: 'sf:' + groupId,
      promoCode: promoCode
    });
    saveCustomers(getCustomers().map(function (x) { return String(x.id) === String(customer.id) ? customer : x; }));
  }
  DB.saveInventory();
  DB.saveSales();
  toast('Order placed · ' + fmt(totals.sub), 'ok');
  SF_CART = [];
  SF_PROMO = null;
  renderSfCartBar();
  closeSfCheckout();
  if (typeof renderStorefront === 'function') renderStorefront();
  if (typeof renderRecentSales === 'function') renderRecentSales();
  if (typeof renderCustomers === 'function') renderCustomers();
  hydrateSfCustomerFromUrl();
  if (typeof openPrintableReceipt === 'function') {
    openPrintableReceipt({
      title: 'Storefront order',
      date: d8(),
      location: 'Storefront',
      customer: customer ? customer.name : name,
      lines: [],
      subtotal: totals.sub,
      creditApplied: totals.creditApply,
      cashPaid: totals.due,
      notes: (promoCode ? ('Promo ' + promoCode + ' · ') : '') + 'Payment: ' + SF_PAY
    });
  }
}

/* Patch checkoutCart to record promo + customerId */
(function patchCheckoutPromo() {
  if (typeof checkoutCart !== 'function' || checkoutCart._promoLoop) return;
  var _cc = checkoutCart;
  checkoutCart = function () {
    var promoBefore = MEET_PROMO;
    var r = _cc();
    try {
      if (promoBefore && DB.sales && DB.sales.length) {
        var gid = null;
        for (var i = DB.sales.length - 1; i >= 0 && i >= DB.sales.length - 30; i--) {
          var s = DB.sales[i];
          if (!gid) gid = s.groupId || s.id;
          if ((s.groupId || s.id) === gid) {
            s.promoCode = promoBefore.code;
            var cust = s.customer ? findCustomerByName(s.customer) : null;
            if (cust) s.customerId = cust.id;
          } else break;
        }
        redeemPromo(promoBefore.code);
        DB.saveSales();
        MEET_PROMO = null;
        if ($('log-promo-code')) $('log-promo-code').value = '';
        if ($('meet-promo-msg')) $('meet-promo-msg').textContent = '';
      }
    } catch (e) {}
    return r;
  };
  checkoutCart._promoLoop = true;
})();

/* Init hooks */
(function ctInitMoneyLoop() {
  function boot() {
    try { renderPromoList(); } catch (e) {}
    try {
      if (isStorefrontPublic()) hydrateSfCustomerFromUrl();
      else if (storefrontCustomerIdFromUrl()) hydrateSfCustomerFromUrl();
    } catch (e) {}
    try {
      var s = loadSettings();
      var p2p = s.p2p || {};
      if ($('set-p2p-cashapp')) $('set-p2p-cashapp').value = p2p.cashapp || '';
      if ($('set-p2p-venmo')) $('set-p2p-venmo').value = p2p.venmo || '';
      if ($('set-p2p-zelle')) $('set-p2p-zelle').value = p2p.zelle || '';
      if ($('set-p2p-paypal')) $('set-p2p-paypal').value = p2p.paypal || '';
    } catch (e) {}
    // ensure existing customers have tokens
    try {
      var list = getCustomers();
      var changed = false;
      list.forEach(function (c) {
        if (!c.qrToken) { c.qrToken = ctMakeQrToken(); changed = true; }
      });
      if (changed) saveCustomers(list);
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
  window.addEventListener('hashchange', function () {
    if (isStorefrontPublic()) { enterStorefrontPublic(); renderStorefront(); }
  });
})();

window.showCustomerQr = showCustomerQr;
window.showStorefrontQr = showStorefrontQr;
window.dismissBackupBanner = dismissBackupBanner;
window.ctPaintQrIntoModal = ctPaintQrIntoModal;
window.copyCustomerStorefrontLink = copyCustomerStorefrontLink;
window.openP2PPayout = openP2PPayout;
window.markP2PPaidAndAccept = markP2PPaidAndAccept;
window.sfAddToCart = sfAddToCart;
window.placeSfOrder = placeSfOrder;
window.addPromoCode = addPromoCode;
window.ctMakeQrToken = ctMakeQrToken;

;

(function(){
  var btn = null;
  function bind(){
    btn = $('btn-scheme');
    if (!btn || btn._lp) return;
    btn._lp = true;
    var t = null;
    btn.addEventListener('touchstart', function(){ t = setTimeout(function(){ switchTab('shop'); try{toast('Pick a scheme below','ok');}catch(e){} }, 550); }, {passive:true});
    btn.addEventListener('touchend', function(){ if(t) clearTimeout(t); });
    btn.addEventListener('contextmenu', function(e){ e.preventDefault(); switchTab('shop'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  setTimeout(bind, 800);
})();


/* ===== Live prices + Robinhood sparklines ===== */
var _lpRefreshTimer = null;
var _lpAbort = null;
var _lpBusy = false;
var _lpLastPass = 0;

function ctLivePricesOn() {
  try {
    var s = loadSettings();
    return s.livePrices !== false && s.compsEnabled !== false;
  } catch (e) { return true; }
}
function ctApplyLivePricesChrome() {
  try {
    document.documentElement.classList.toggle('live-prices-off', !ctLivePricesOn());
    if ($('set-live-prices')) $('set-live-prices').checked = ctLivePricesOn();
    var s = loadSettings();
    if ($('set-live-price-interval')) $('set-live-price-interval').value = s.livePriceIntervalSec || 120;
  } catch (e) {}
}
function toggleLivePrices(on) {
  var s = loadSettings();
  s.livePrices = !!on;
  saveSettings(s);
  ctApplyLivePricesChrome();
  if (typeof renderSmartGrid === 'function') renderSmartGrid();
  if (typeof renderInventory === 'function') renderInventory();
  if (typeof renderStorefront === 'function') renderStorefront();
  if (typeof renderCart === 'function') renderCart();
  toast(on ? 'Live prices on' : 'Live prices off', 'ok');
  if (on) ctScheduleLivePriceLoop(true);
}
function saveLivePriceInterval(v) {
  var s = loadSettings();
  var n = Math.max(30, Math.min(3600, int(v, 120)));
  s.livePriceIntervalSec = n;
  saveSettings(s);
  if ($('set-live-price-interval')) $('set-live-price-interval').value = n;
  ctScheduleLivePriceLoop(true);
  toast('Refresh every ' + n + 's', 'ok');
}

function ctHistKey(item) {
  if (!item) return '';
  if (item.id != null && String(item.id)) {
    var nk = (typeof nameOnlyKey === 'function') ? nameOnlyKey(item.name) : String(item.name || '').toLowerCase();
    return 'id:' + item.id + (nk ? '|' + nk : '');
  }
  return (typeof nameOnlyKey === 'function') ? nameOnlyKey(item.name || item.sku) : String(item.name || item.sku || '').toLowerCase();
}
function ctNameHistKey(name) {
  return (typeof nameOnlyKey === 'function') ? nameOnlyKey(name) : String(name || '').toLowerCase();
}
function ctGetHistPoints(itemOrName) {
  var store = {};
  try { store = (typeof ctLoadCompsHist === 'function') ? (ctLoadCompsHist() || {}) : {}; } catch (e) { store = {}; }
  if (!itemOrName) return [];
  if (typeof itemOrName === 'string') return (store[ctNameHistKey(itemOrName)] || []).slice();
  var k1 = ctHistKey(itemOrName);
  var k2 = ctNameHistKey(itemOrName.name);
  var a = (store[k1] || store[k2] || []).slice();
  if (!a.length && k2 && store[k2]) a = store[k2].slice();
  return a;
}
function ctEnsureSparkSeries(points, comp) {
  var arr = (points || []).slice();
  if (arr.length >= 2) return arr;
  var mkt = null, mid = null, low = null;
  if (arr.length === 1) {
    mkt = num(arr[0].v);
    mid = num(arr[0].mid) || mkt;
    low = num(arr[0].low) || (mkt ? mkt * 0.92 : null);
  }
  if (comp) {
    if (mkt == null) mkt = num(comp.market != null ? comp.market : comp.mid);
    if (mid == null) mid = num(comp.mid != null ? comp.mid : mkt);
    if (low == null) low = num(comp.low != null ? comp.low : (mkt ? mkt * 0.92 : null));
  }
  if (!mkt) return arr;
  // Synthesize short flat/slight series from low/mid/market when only one point
  var t0 = Date.now() - 86400000 * 4;
  var synth = [
    { t: new Date(t0).toISOString(), v: low || mkt * 0.95, synth: true },
    { t: new Date(t0 + 86400000).toISOString(), v: mid || mkt * 0.98, synth: true },
    { t: new Date(t0 + 86400000 * 2).toISOString(), v: mkt * 0.995, synth: true },
    { t: new Date(t0 + 86400000 * 3).toISOString(), v: mkt, synth: true }
  ];
  if (arr.length === 1) synth[synth.length - 1] = arr[0];
  return synth;
}
function ctPriceChange(points, comp) {
  var series = ctEnsureSparkSeries(points, comp);
  if (!series || series.length < 2) return null;
  var a = num(series[0].v), b = num(series[series.length - 1].v);
  if (!a && !b) return null;
  var abs = Math.round((b - a) * 100) / 100;
  var pct = a ? ((b - a) / a) * 100 : 0;
  return { abs: abs, pct: pct, dir: abs > 0.004 ? 'up' : (abs < -0.004 ? 'down' : 'flat') };
}
function ctChangeChipHtml(chg) {
  if (!chg) return '<span class="lp-chip na">—</span>';
  var cls = chg.dir || 'flat';
  var label;
  if (cls === 'flat' || Math.abs(chg.pct) < 0.05) label = '0.0%';
  else {
    var sign = chg.pct > 0 ? '+' : '';
    label = sign + (Math.abs(chg.pct) >= 10 ? chg.pct.toFixed(0) : chg.pct.toFixed(1)) + '%';
  }
  return '<span class="lp-chip ' + cls + '">' + label + '</span>';
}
function ctLiveMarketForItem(item) {
  if (!item) return 0;
  var m = num(item.market);
  if (m) return m;
  if (item.mid) return num(item.mid);
  if (item.listPrice) return num(item.listPrice);
  if (item.sell) return num(item.sell);
  try {
    if (item.name && typeof lookupCachedComp === 'function') {
      var c = lookupCachedComp(item.name);
      if (c) {
        var v = num(c.market != null ? c.market : c.mid);
        if (v) return v;
      }
    }
  } catch (e) {}
  var hist = ctGetHistPoints(item);
  if (hist.length) return num(hist[hist.length - 1].v);
  return 0;
}
function ctResolveCompForItem(item) {
  if (!item || !item.name) return null;
  try {
    if (typeof lookupCachedComp === 'function') {
      var c = lookupCachedComp(item.name);
      if (c) return c;
    }
  } catch (e) {}
  var m = ctLiveMarketForItem(item);
  if (!m) return null;
  return {
    name: item.name,
    set: item.set || '',
    market: m,
    mid: num(item.mid) || m,
    low: num(item.low) || Math.round(m * 0.9 * 100) / 100,
    high: num(item.high) || Math.round(m * 1.1 * 100) / 100
  };
}
function ctLivePriceRowHtml(item, opts) {
  opts = opts || {};
  if (!ctLivePricesOn() && !opts.force) {
    var p0 = ctLiveMarketForItem(item) || num(item && (item.listPrice || item.sell || item.cost));
    return '<div class="lp-row"><span class="lp-price' + (p0 ? '' : ' muted') + '">' + (p0 ? (typeof fmt === 'function' ? fmt(p0) : ('$' + p0.toFixed(2))) : '—') + '</span></div>';
  }
  var comp = ctResolveCompForItem(item);
  var price = ctLiveMarketForItem(item);
  var pts = ctGetHistPoints(item);
  var seriesOpts = { comp: comp, w: opts.w || 64, h: opts.h || 24 };
  var spark = '';
  if (pts.length >= 2 || (pts.length >= 1 && comp) || (comp && (comp.low || comp.mid || comp.market))) {
    spark = ctSparkSvg(pts, seriesOpts);
  }
  var chg = ctPriceChange(pts, comp);
  var chip = spark ? ctChangeChipHtml(chg) : '<span class="lp-chip na">—</span>';
  var priceHtml = price
    ? (typeof fmt === 'function' ? fmt(price) : ('$' + Number(price).toFixed(2)))
    : '—';
  return '<div class="lp-row" data-lp-key="' + esc(ctHistKey(item) || ctNameHistKey(item && item.name)) + '">' +
    '<span class="lp-price' + (price ? '' : ' muted') + '">' + priceHtml + '</span>' +
    spark + chip + '</div>';
}
function ctDetailChartHtml(item) {
  var comp = ctResolveCompForItem(item);
  var pts = ctGetHistPoints(item);
  var series = ctEnsureSparkSeries(pts, comp);
  if (!series || series.length < 2) {
    return '<div class="text-muted" style="font-size:12px;padding:8px 0">Price history grows after the next comps refresh.</div>';
  }
  var vals = series.map(function (p) { return num(p.v); });
  var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  if (max <= min) max = min + 0.01;
  var w = 280, h = 72, pad = 6;
  var first = vals[0], last = vals[vals.length - 1];
  var dir = last > first + 0.004 ? 'up' : (last < first - 0.004 ? 'down' : 'flat');
  var stroke = dir === 'up' ? 'var(--green,#22c55e)' : (dir === 'down' ? 'var(--red,#ef4444)' : 'var(--muted)');
  var fill = stroke;
  var coords = series.map(function (p, i) {
    var x = pad + (i / (series.length - 1)) * (w - pad * 2);
    var y = h - pad - ((num(p.v) - min) / (max - min)) * (h - pad * 2);
    return [x, y];
  });
  var d = coords.map(function (c, i) { return (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1); }).join(' ');
  var fillD = d + ' L' + coords[coords.length - 1][0].toFixed(1) + ' ' + (h - pad) + ' L' + coords[0][0].toFixed(1) + ' ' + (h - pad) + ' Z';
  // low/mid/market marker lines
  var markers = '';
  function yFor(v) {
    return h - pad - ((num(v) - min) / (max - min)) * (h - pad * 2);
  }
  if (comp) {
    if (comp.low) markers += '<line x1="' + pad + '" x2="' + (w - pad) + '" y1="' + yFor(comp.low).toFixed(1) + '" y2="' + yFor(comp.low).toFixed(1) + '" stroke="var(--blue,#3b82f6)" stroke-width="1" stroke-dasharray="3 3" opacity="0.45"/>';
    if (comp.mid) markers += '<line x1="' + pad + '" x2="' + (w - pad) + '" y1="' + yFor(comp.mid).toFixed(1) + '" y2="' + yFor(comp.mid).toFixed(1) + '" stroke="var(--accent)" stroke-width="1" stroke-dasharray="3 3" opacity="0.45"/>';
    if (comp.market) markers += '<line x1="' + pad + '" x2="' + (w - pad) + '" y1="' + yFor(comp.market).toFixed(1) + '" y2="' + yFor(comp.market).toFixed(1) + '" stroke="var(--cyan,#06b6d4)" stroke-width="1" stroke-dasharray="2 4" opacity="0.55"/>';
  }
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="' + fillD + '" fill="' + fill + '" opacity="0.12"></path>' +
    markers +
    '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
}
function ctDetailMarkersHtml(item) {
  var comp = ctResolveCompForItem(item);
  if (!comp) return '';
  return '<span class="mk-low">Low<b>' + (typeof fmtCompMoney === 'function' ? fmtCompMoney(comp.low) : '—') + '</b></span>' +
    '<span class="mk-mid">Mid<b>' + (typeof fmtCompMoney === 'function' ? fmtCompMoney(comp.mid) : '—') + '</b></span>' +
    '<span class="mk-mkt">Market<b>' + (typeof fmtCompMoney === 'function' ? fmtCompMoney(comp.market) : '—') + '</b></span>';
}

function ctSeedHistFromComp(comp, item) {
  if (!comp) return;
  try { ctPushCompsHistory(comp); } catch (e) {}
  // Also key by inventory id when available
  if (item && item.id != null) {
    var store = ctLoadCompsHist();
    var key = ctHistKey(item);
    var nk = ctNameHistKey(comp.name || item.name);
    var arr = (store[key] || store[nk] || []).slice();
    var mkt = num(comp.market != null ? comp.market : comp.mid);
    if (!mkt) return;
    if (!arr.length) {
      arr = ctEnsureSparkSeries([{ t: new Date().toISOString(), v: mkt, mid: num(comp.mid), low: num(comp.low) }], comp);
    } else {
      var last = arr[arr.length - 1];
      if (!last || Math.abs(num(last.v) - mkt) >= 0.005 || (Date.now() - Date.parse(last.t || 0)) >= 3600000) {
        arr.push({ t: new Date().toISOString(), v: mkt, mid: num(comp.mid), low: num(comp.low) });
      }
    }
    if (arr.length > 30) arr = arr.slice(-30);
    store[key] = arr;
    if (nk) store[nk] = arr;
    ctSaveCompsHist(store);
  }
}
function ctSeedSamplePriceHistory(inv) {
  (inv || []).forEach(function (i) {
    if (!i || !i.name) return;
    var mkt = num(i.market || i.mid || i.listPrice);
    if (!mkt) return;
    var comp = {
      name: i.name,
      set: i.set || '',
      market: mkt,
      mid: num(i.mid) || mkt,
      low: Math.round(mkt * 0.88 * 100) / 100,
      high: Math.round(mkt * 1.12 * 100) / 100
    };
    var store = ctLoadCompsHist();
    var key = ctHistKey(i);
    var nk = ctNameHistKey(i.name);
    if ((store[key] && store[key].length >= 2) || (store[nk] && store[nk].length >= 2)) return;
    // Seed a slight walk so sparklines show immediately on sample
    var base = mkt;
    var pts = [];
    for (var n = 6; n >= 0; n--) {
      var wobble = 1 + Math.sin(n * 1.7 + (i.id || 1)) * 0.018 - n * 0.002;
      pts.push({
        t: new Date(Date.now() - n * 86400000).toISOString(),
        v: Math.round(base * wobble * 100) / 100,
        mid: Math.round(base * wobble * 0.98 * 100) / 100,
        low: Math.round(base * wobble * 0.9 * 100) / 100,
        sample: true
      });
    }
    store[key] = pts;
    store[nk] = pts;
    ctSaveCompsHist(store);
    try { ctPushCompsHistory(comp); } catch (e) {}
  });
}

async function ctFetchAndApplyLivePrice(item, signal) {
  if (!item || !item.name) return null;
  if (typeof fetchLiveComp !== 'function') return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return ctResolveCompForItem(item);
  }
  try {
    window._compsActiveCtx = 'grid';
    var live = await fetchLiveComp(item.name);
    if (signal && signal.aborted) return null;
    if (!live || (live.market == null && live.mid == null && live.low == null)) {
      return ctResolveCompForItem(item);
    }
    if (typeof cacheCompEntry === 'function') cacheCompEntry(live);
    var mkt = num(live.market != null ? live.market : live.mid);
    if (mkt) {
      item.market = mkt;
      if (live.mid != null) item.mid = num(live.mid);
      if (live.low != null) item.low = num(live.low);
      if (live.high != null) item.high = num(live.high);
      if (live.image && !item.image) item.image = live.image;
      if (live.imageLarge && !item.imageLarge) item.imageLarge = live.imageLarge;
    }
    ctSeedHistFromComp(live, item);
    return live;
  } catch (err) {
    if (err && err.name === 'AbortError') return null;
    return ctResolveCompForItem(item);
  }
}

function ctVisibleInventoryForLiveRefresh() {
  var out = [];
  var seen = {};
  function add(i) {
    if (!i || !i.name) return;
    var k = ctHistKey(i) || ctNameHistKey(i.name);
    if (!k || seen[k]) return;
    seen[k] = 1;
    out.push(i);
  }
  // Prefer tiles currently in DOM
  document.querySelectorAll('#smart-grid .qk-tile, #inventory-list .inv-card, #sf-grid .sf-card').forEach(function () {});
  // From smart grid render set / inventory
  var qk = $('smart-grid');
  if (qk) {
    (DB.inventory || []).forEach(function (i) {
      if (i.qty > 0) add(i);
    });
  }
  // Limit to top priced in-stock for register + currently filtered catalog
  out = (DB.inventory || []).filter(function (i) { return i && i.name && i.qty > 0; })
    .slice()
    .sort(function (a, b) { return ctLiveMarketForItem(b) - ctLiveMarketForItem(a); })
    .slice(0, 24);
  // Always include cart lines
  (typeof CART !== 'undefined' ? CART : []).forEach(function (l) {
    if (l && l.invIdx != null && DB.inventory[l.invIdx]) add(DB.inventory[l.invIdx]);
    else if (l && l.name) add(l);
  });
  return out.slice(0, 28);
}

async function ctRefreshVisibleLivePrices(force) {
  if (!ctLivePricesOn()) return;
  if (_lpBusy && !force) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  var now = Date.now();
  if (!force && now - _lpLastPass < 8000) return;
  _lpBusy = true;
  _lpLastPass = now;
  try {
    if (_lpAbort) try { _lpAbort.abort(); } catch (e) {}
    _lpAbort = new AbortController();
    var signal = _lpAbort.signal;
    var list = ctVisibleInventoryForLiveRefresh();
    var changed = false;
    // Throttle: at most 1 request every 350ms; stop early if aborted
    for (var i = 0; i < list.length; i++) {
      if (signal.aborted) break;
      var before = ctLiveMarketForItem(list[i]);
      var live = await ctFetchAndApplyLivePrice(list[i], signal);
      if (live && num(live.market || live.mid) && Math.abs(num(live.market || live.mid) - before) > 0.001) changed = true;
      else if (live) changed = true;
      await new Promise(function (r) { setTimeout(r, 350); });
    }
    if (changed) {
      try { DB.saveInventory(); } catch (e) {}
      if (typeof renderSmartGrid === 'function') renderSmartGrid();
      if (typeof renderInventory === 'function') renderInventory();
      if (typeof renderStorefront === 'function') renderStorefront();
      if (typeof renderCart === 'function') renderCart();
    }
  } finally {
    _lpBusy = false;
  }
}
function ctScheduleLivePriceLoop(kick) {
  if (_lpRefreshTimer) { clearInterval(_lpRefreshTimer); _lpRefreshTimer = null; }
  if (!ctLivePricesOn()) return;
  var s = loadSettings();
  var ms = Math.max(30, int(s.livePriceIntervalSec, 120)) * 1000;
  _lpRefreshTimer = setInterval(function () { ctRefreshVisibleLivePrices(false); }, ms);
  if (kick) setTimeout(function () { ctRefreshVisibleLivePrices(false); }, 1200);
}

(function bootLivePrices() {
  function go() {
    try {
      ctApplyLivePricesChrome();
      // Hydrate settings form when shop tab opens
      if (typeof applyShopChrome === 'function' && !applyShopChrome._lp) {
        var _asc = applyShopChrome;
        applyShopChrome = function () {
          _asc();
          try { ctApplyLivePricesChrome(); } catch (e) {}
        };
        applyShopChrome._lp = true;
      }
      ctScheduleLivePriceLoop(true);
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
  window.addEventListener('online', function () { ctScheduleLivePriceLoop(true); });
})();

/* ===== Enterprise POS shell JS ===== */
var _entSmartCat = 'all';
var CT_PARKED_KEY = 'ct_parked_sales_v1';

function syncRegSearch(v) {
  if ($('reg-search')) $('reg-search').value = v;
  if ($('reg-search-desk') && $('reg-search-desk') !== document.activeElement) $('reg-search-desk').value = v;
  if (typeof onRegisterSearch === 'function') onRegisterSearch(v);
  renderSmartGrid();
}
function setSmartCat(cat) {
  _entSmartCat = cat || 'all';
  document.querySelectorAll('#cat-chips .cat-chip').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-cat') === _entSmartCat);
  });
  renderSmartGrid();
}
function smartPrice(item) {
  if (!item) return 0;
  return num(item.listPrice || item.sell || item.mid || item.market || lastSalePrice(item) || suggestedSell(item.market, item.cost) || 0);
}
function renderSmartGrid() {
  var grid = $('smart-grid');
  if (!grid) return;
  var q = ((($('reg-search-desk') && $('reg-search-desk').value) || ($('reg-search') && $('reg-search').value) || '') + '').toLowerCase().trim();
  var items = (DB.inventory || []).filter(function (i) {
    if (_entSmartCat === 'in' && !(i.qty > 0)) return false;
    if (_entSmartCat === 'raw' && (i.kind || 'raw') !== 'raw') return false;
    if (_entSmartCat === 'graded' && i.kind !== 'graded') return false;
    if (_entSmartCat === 'sealed' && i.kind !== 'sealed' && i.type !== 'box') return false;
    if (!q) return i.qty > 0;
    return (i.name || '').toLowerCase().indexOf(q) >= 0 || (i.sku || '').toLowerCase().indexOf(q) >= 0 || (i.set || '').toLowerCase().indexOf(q) >= 0;
  });
  if (!q) {
    items = items.filter(function (i) { return i.qty > 0; }).slice().sort(function (a, b) {
      return smartPrice(b) - smartPrice(a);
    }).slice(0, 48);
  } else {
    items = items.slice(0, 60);
  }
  if (!items.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:28px 12px"><div class="empty-title">No in-stock quick keys</div><div class="empty-hint">Receive inventory or load the sample shop. Search still works from the bar.</div><div class="sample-cta"><button class="btn btn-primary" type="button" onclick="loadSampleShop(true)">Load sample shop</button></div></div>';
    return;
  }
  grid.innerHTML = items.map(function (i) {
    var idx = DB.inventory.indexOf(i);
    var price = smartPrice(i);
    var thumb = (typeof cardArtHtml === 'function') ? cardArtHtml(i.imageLarge || i.image || '', 'card-art-fill', true) : '';
    var oos = !(i.qty > 0);
    var lp;
    try {
      lp = (typeof ctLivePriceRowHtml === 'function') ? ctLivePriceRowHtml(i, { w: 56, h: 20 }) : null;
    } catch (eLp) { lp = null; }
    if (!lp) lp = '<div class="qk-price">' + (typeof fmt === 'function' ? fmt(price) : ('$' + price.toFixed(2))) + '</div>';
    return '<button type="button" class="qk-tile' + (oos ? ' oos' : '') + '" onclick="addInventoryToCart(' + idx + ')" oncontextmenu="event.preventDefault();openItemSheet(' + idx + ');return false;" title="' + esc(i.name || i.sku || '') + '">' +
      '<div class="qk-art">' + (thumb || '<span style="color:var(--muted);font-size:11px">No art</span>') + '</div>' +
      '<div class="qk-name">' + esc(i.name || i.sku || 'Item') + '</div>' +
      '<div class="qk-meta">' + esc(i.condition || 'NM') + ' · ' + (i.qty || 0) + ' left</div>' +
      '<div class="qk-price-wrap">' + lp + '</div></button>';
  }).join('');
  if (typeof ctScheduleLivePriceLoop === 'function') try { ctScheduleLivePriceLoop(false); } catch (e) {}
  setTimeout(function () { if (typeof ctRefreshVisibleLivePrices === 'function') ctRefreshVisibleLivePrices(false); }, 400);
}


/* ===== Big cards helpers ===== */
var _itemSheetIdx = null;
function applyGridSize(size) {
  size = (size || 'L').toUpperCase();
  if (['S','M','L'].indexOf(size) < 0) size = 'L';
  document.documentElement.setAttribute('data-grid-size', size);
  document.querySelectorAll('#grid-size-picker [data-gs]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-gs') === size);
  });
}
function setGridSize(size) {
  var s = loadSettings();
  s.gridSize = (size || 'L').toUpperCase();
  saveSettings(s);
  applyGridSize(s.gridSize);
  if (typeof renderSmartGrid === 'function') renderSmartGrid();
  toast('Grid size ' + s.gridSize, 'ok');
}
function openItemSheet(idx) {
  var item = DB.inventory[idx];
  if (!item) return;
  _itemSheetIdx = idx;
  if ($('item-sheet-title')) $('item-sheet-title').textContent = item.name || item.sku || 'Item';
  if ($('item-sheet-name')) $('item-sheet-name').textContent = item.name || item.sku || 'Item';
  var meta = [item.set, item.number ? ('#' + item.number) : '', item.condition || 'NM'].filter(Boolean).join(' · ');
  if ($('item-sheet-meta')) $('item-sheet-meta').textContent = meta || '—';
  var price = typeof smartPrice === 'function' ? smartPrice(item) : num(item.listPrice || item.sell || item.market || 0);
  var live = (typeof ctLiveMarketForItem === 'function') ? ctLiveMarketForItem(item) : price;
  if ($('item-sheet-price')) $('item-sheet-price').textContent = typeof fmt === 'function' ? fmt(live || price) : ('$' + Number(live || price).toFixed(2));
  if ($('item-sheet-chip')) {
    var chg = (typeof ctPriceChange === 'function') ? ctPriceChange(ctGetHistPoints(item), ctResolveCompForItem(item)) : null;
    $('item-sheet-chip').innerHTML = (typeof ctChangeChipHtml === 'function') ? ctChangeChipHtml(chg) : '';
  }
  if ($('item-sheet-chart')) $('item-sheet-chart').innerHTML = (typeof ctDetailChartHtml === 'function') ? ctDetailChartHtml(item) : '';
  if ($('item-sheet-markers')) $('item-sheet-markers').innerHTML = (typeof ctDetailMarkersHtml === 'function') ? ctDetailMarkersHtml(item) : '';
  if ($('item-sheet-stock')) $('item-sheet-stock').textContent = (item.qty || 0) + ' in stock' + (item.sku ? (' · ' + item.sku) : '');
  var art = $('item-sheet-art');
  if (art && typeof mountCardArt === 'function') {
    mountCardArt(art, (typeof cardImageUrl === 'function' ? cardImageUrl(item, 'large') : null) || item.imageLarge || item.image || '', 'card-art-xl', true);
  } else if (art && typeof cardArtHtml === 'function') {
    art.innerHTML = cardArtHtml(item.imageLarge || item.image || '', 'card-art-xl', true);
  }
  if ($('item-sheet-add')) $('item-sheet-add').disabled = !(item.qty > 0);
  openEntSheet('sheet-item');
  // Background refresh this card's comps so sparkline can grow
  if (typeof ctFetchAndApplyLivePrice === 'function' && ctLivePricesOn()) {
    ctFetchAndApplyLivePrice(item).then(function (liveComp) {
      if (!liveComp || _itemSheetIdx !== idx) return;
      try { DB.saveInventory(); } catch (e) {}
      if ($('item-sheet-price')) $('item-sheet-price').textContent = typeof fmt === 'function' ? fmt(ctLiveMarketForItem(item) || price) : '';
      if ($('item-sheet-chip')) $('item-sheet-chip').innerHTML = ctChangeChipHtml(ctPriceChange(ctGetHistPoints(item), liveComp));
      if ($('item-sheet-chart')) $('item-sheet-chart').innerHTML = ctDetailChartHtml(item);
      if ($('item-sheet-markers')) $('item-sheet-markers').innerHTML = ctDetailMarkersHtml(item);
    });
  }
}
function openCartItemSheet(i) {
  var l = CART[i];
  if (!l) return;
  if (l.invIdx != null) { openItemSheet(l.invIdx); return; }
  _itemSheetIdx = null;
  if ($('item-sheet-title')) $('item-sheet-title').textContent = l.name || l.sku || 'Item';
  if ($('item-sheet-name')) $('item-sheet-name').textContent = l.name || l.sku || 'Item';
  if ($('item-sheet-meta')) $('item-sheet-meta').textContent = [l.set, l.number ? ('#' + l.number) : '', l.condition || 'NM'].filter(Boolean).join(' · ') || '—';
  if ($('item-sheet-price')) $('item-sheet-price').textContent = typeof fmt === 'function' ? fmt(l.price || 0) : ('$' + Number(l.price || 0).toFixed(2));
  if ($('item-sheet-stock')) $('item-sheet-stock').textContent = 'In cart ×' + (l.qty || 1);
  var art = $('item-sheet-art');
  if (art && typeof mountCardArt === 'function') {
    mountCardArt(art, l.imageLarge || l.image || '', 'card-art-xl', true);
  } else if (art && typeof cardArtHtml === 'function') {
    art.innerHTML = cardArtHtml(l.imageLarge || l.image || '', 'card-art-xl', true);
  }
  if ($('item-sheet-add')) $('item-sheet-add').disabled = true;
  openEntSheet('sheet-item');
}
function addFromItemSheet() {
  if (_itemSheetIdx == null) return;
  addInventoryToCart(_itemSheetIdx);
  closeEntSheet('sheet-item');
}
(function bootBigCards() {
  function go() {
    try {
      var s = loadSettings();
      if (!s.gridSize) { s.gridSize = 'L'; saveSettings(s); }
      applyGridSize(s.gridSize || 'L');
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})();

function openEntSheet(id) {
  var el = $(id);
  if (!el) return;
  el.classList.add('open');
  if (id === 'sheet-parked') renderParkedList();
  if (id === 'sheet-customer') hydrateCustomerSheet();
  if (id === 'sheet-pay') hydratePaymentSheet();
}
function closeEntSheet(id) {
  var el = $(id);
  if (!el) return;
  if (typeof window.__ctAnimateClose === 'function' && el.classList.contains('open')) {
    window.__ctAnimateClose(el, false);
  } else {
    el.classList.remove('open', 'ct-closing');
  }
}
function openCartSheet() {
  document.body.classList.add('cart-sheet-open');
  var btn = $('btn-close-cart-sheet');
  if (btn) btn.style.display = 'inline-flex';
}
function closeCartSheet() {
  document.body.classList.remove('cart-sheet-open');
  var btn = $('btn-close-cart-sheet');
  if (btn) btn.style.display = 'none';
}
function openPaymentSheet() {
  if (!CART.length) { toast('Add items to the cart first', 'err'); return; }
  closeCartSheet();
  openEntSheet('sheet-pay');
}
function hydratePaymentSheet() {
  var due = typeof checkoutDue === 'function' ? checkoutDue() : cartSubtotal();
  if ($('pay-sheet-due')) $('pay-sheet-due').textContent = fmt(due);
  if ($('pay-sheet-complete')) $('pay-sheet-complete').textContent = 'Charge ' + fmt(due);
  document.querySelectorAll('#pay-sheet-grid .pay-opt').forEach(function (el) {
    el.classList.toggle('active', el.getAttribute('data-pay') === PAY_METHOD || (PAY_METHOD === 'credit' && el.getAttribute('data-pay') === 'credit'));
  });
  var linkBox = $('pay-link-box-sheet');
  if (linkBox) linkBox.style.display = PAY_METHOD === 'link' ? 'block' : 'none';
  var cred = $('pay-sheet-credit');
  if (cred) cred.style.display = PAY_METHOD === 'credit' ? 'block' : 'none';
  if ($('sale-pay-link-sheet') && $('sale-pay-link')) $('sale-pay-link-sheet').value = $('sale-pay-link').value || '';
  if ($('sale-pay-note-sheet') && $('sale-pay-note')) $('sale-pay-note-sheet').value = $('sale-pay-note').value || '';
}
function syncPayLink(v) {
  if ($('sale-pay-link')) $('sale-pay-link').value = v;
}
function completeSaleFromSheet() {
  if (PAY_METHOD === 'credit') {
    if ($('log-apply-credit')) $('log-apply-credit').checked = true;
    if ($('sheet-apply-credit')) $('sheet-apply-credit').checked = true;
  }
  closeEntSheet('sheet-pay');
  if (typeof logSale === 'function') logSale();
}
function entUpdateChargeBtn() {
  var due = !CART.length ? 0 : (typeof checkoutDue === 'function' ? checkoutDue() : cartSubtotal());
  var label = 'Charge ' + (typeof fmt === 'function' ? fmt(due) : ('$' + due.toFixed(2)));
  if ($('btn-charge')) {
    $('btn-charge').textContent = label;
    $('btn-charge').disabled = !CART.length;
  }
  if (!CART.length) {
    if ($('cart-subtotal')) $('cart-subtotal').textContent = typeof fmt === 'function' ? fmt(0) : '$0.00';
    if ($('cart-due')) $('cart-due').textContent = typeof fmt === 'function' ? fmt(0) : '$0.00';
  }
  if ($('meet-bar-pay') && window.matchMedia && window.matchMedia('(max-width:899px)').matches) {
    $('meet-bar-pay').textContent = CART.length ? label : 'Charge';
  }
  if ($('cart-lane-label')) $('cart-lane-label').textContent = 'Lane ' + (typeof _ctLane !== 'undefined' ? _ctLane : 'A');
  entSyncCustChip();
  entSyncUndercutStrip();
}
function entSyncCustChip() {
  var name = ($('log-customer') && $('log-customer').value || '').trim();
  var chip = $('cart-customer-chip');
  var lab = $('cart-customer-label');
  if (!chip || !lab) return;
  if (name) {
    chip.classList.add('has-cust');
    lab.innerHTML = '<strong>' + esc(name) + '</strong>';
  } else {
    chip.classList.remove('has-cust');
    lab.textContent = 'Add customer';
  }
}
function entSyncUndercutStrip() {
  var el = $('ent-undercut-strip');
  if (!el) return;
  var warn = $('price-floor-warn');
  if (warn && warn.classList.contains('show') && warn.textContent) {
    el.style.display = 'block';
    el.innerHTML = '<strong style="color:var(--red)">Price floor</strong> · ' + esc(warn.textContent);
  } else {
    el.style.display = 'none';
    el.innerHTML = '';
  }
}
function hydrateCustomerSheet() {
  if ($('sheet-cust-name') && $('log-customer')) $('sheet-cust-name').value = $('log-customer').value || '';
  if ($('sheet-cust-email') && $('log-email')) $('sheet-cust-email').value = $('log-email').value || '';
  if ($('sheet-cust-phone') && $('log-phone')) $('sheet-cust-phone').value = $('log-phone').value || '';
  if ($('sheet-cust-addr') && $('log-addr')) $('sheet-cust-addr').value = $('log-addr').value || '';
  if ($('sheet-cust-city') && $('log-city')) $('sheet-cust-city').value = $('log-city').value || '';
  if ($('sheet-cust-state') && $('log-state')) $('sheet-cust-state').value = $('log-state').value || '';
  if ($('sheet-cust-zip') && $('log-zip')) $('sheet-cust-zip').value = $('log-zip').value || '';
  if ($('sheet-needs-ship') && $('sale-needs-ship')) $('sheet-needs-ship').checked = !!$('sale-needs-ship').checked;
  if ($('sheet-apply-credit') && $('log-apply-credit')) $('sheet-apply-credit').checked = !!$('log-apply-credit').checked;
  if ($('sheet-credit-amt') && $('log-credit-amt')) $('sheet-credit-amt').value = $('log-credit-amt').value || '0';
  if ($('sheet-credit-bal') && $('sale-credit-bal')) $('sheet-credit-bal').textContent = $('sale-credit-bal').textContent;
  var box = $('sheet-credit-box');
  var src = $('sale-credit-box');
  if (box && src) box.style.display = src.style.display === 'none' ? 'none' : 'block';
}
function mirrorCustField(which, val) {
  var map = { name: 'log-customer', email: 'log-email', phone: 'log-phone', addr: 'log-addr', city: 'log-city', state: 'log-state', zip: 'log-zip' };
  var id = map[which];
  if (id && $(id)) $(id).value = val;
  if (which === 'name' && typeof onSaleCustomerInput === 'function') onSaleCustomerInput();
  entSyncCustChip();
}
function saveSheetCustomer() {
  if (typeof captureCustomerFromForm === 'function') {
    try { captureCustomerFromForm(); } catch (e) {}
  }
  entSyncCustChip();
  closeEntSheet('sheet-customer');
  toast('Customer on sale', 'ok');
}
function clearSaleCustomer() {
  ['log-customer','log-email','log-phone','log-addr','log-city','log-state','log-zip','sheet-cust-name','sheet-cust-email','sheet-cust-phone','sheet-cust-addr','sheet-cust-city','sheet-cust-state','sheet-cust-zip'].forEach(function (id) {
    if ($(id)) $(id).value = '';
  });
  if ($('log-apply-credit')) $('log-apply-credit').checked = false;
  if ($('sale-credit-box')) $('sale-credit-box').style.display = 'none';
  entSyncCustChip();
}

function loadParkedSales() {
  try { return JSON.parse(localStorage.getItem(CT_PARKED_KEY) || '[]'); } catch (e) { return []; }
}
function saveParkedSales(list) {
  try { localStorage.setItem(CT_PARKED_KEY, JSON.stringify(list || [])); } catch (e) {}
}
function ctParkSale() {
  if (!CART.length) { toast('Cart is empty', 'err'); return; }
  var list = loadParkedSales();
  list.unshift({
    id: Date.now(),
    at: new Date().toISOString(),
    lane: (typeof _ctLane !== 'undefined' ? _ctLane : 'A'),
    customer: ($('log-customer') && $('log-customer').value) || '',
    lines: CART.map(function (l) { return Object.assign({}, l); }),
    promo: ($('log-promo-code') && $('log-promo-code').value) || ''
  });
  saveParkedSales(list.slice(0, 30));
  clearCart();
  toast('Sale parked', 'ok');
}
function renderParkedList() {
  var box = $('parked-list');
  if (!box) return;
  var list = loadParkedSales();
  if (!list.length) {
    box.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-title">No parked sales</div><div class="empty-hint">Park a cart to switch customers without losing the sale.</div></div>';
    return;
  }
  box.innerHTML = list.map(function (p) {
    var n = (p.lines || []).length;
    var tot = (p.lines || []).reduce(function (s, l) { return s + num(l.price) * int(l.qty, 1); }, 0);
    var when = (p.at || '').replace('T', ' ').slice(0, 16);
    return '<div class="parked-item"><div><strong>' + esc(p.customer || 'Walk-in') + '</strong>' +
      '<div class="text-muted" style="font-size:11px">' + esc(when) + ' · Lane ' + esc(p.lane || '') + ' · ' + n + ' lines · ' + fmt(tot) + '</div></div>' +
      '<div style="display:flex;gap:6px"><button class="btn btn-primary" type="button" style="width:auto" onclick="ctRetrieveSale(' + p.id + ')">Retrieve</button>' +
      '<button class="btn btn-secondary" type="button" style="width:auto" onclick="ctDiscardParked(' + p.id + ')">×</button></div></div>';
  }).join('');
}
function ctRetrieveSale(id) {
  var list = loadParkedSales();
  var p = list.find(function (x) { return x.id === id; });
  if (!p) { toast('Parked sale missing', 'err'); return; }
  if (CART.length && !confirm('Replace current cart with parked sale?')) return;
  CART = (p.lines || []).map(function (l) { return Object.assign({}, l); });
  CART_SEL = CART.length ? 0 : -1;
  if ($('log-customer')) $('log-customer').value = p.customer || '';
  if ($('log-promo-code')) $('log-promo-code').value = p.promo || '';
  list = list.filter(function (x) { return x.id !== id; });
  saveParkedSales(list);
  if (typeof renderCart === 'function') renderCart(true);
  entSyncCustChip();
  closeEntSheet('sheet-parked');
  toast('Sale retrieved', 'ok');
}
function ctDiscardParked(id) {
  saveParkedSales(loadParkedSales().filter(function (x) { return x.id !== id; }));
  renderParkedList();
}

function ctLockRegister() {
  var s = loadSettings();
  if (!s.pinEnabled || !s.pinHash) {
    toast('Set a PIN in Settings → PIN lock first', 'err');
    switchTab('shop');
    return;
  }
  _ctUnlockedUntil = 0;
  var chip = $('reg-status-chip');
  if (chip) chip.classList.add('locked');
  if ($('reg-status-label')) $('reg-status-label').textContent = 'Locked';
  if (typeof ctRequireUnlock === 'function') {
    ctRequireUnlock('Unlock register').then(function () {
      if (chip) chip.classList.remove('locked');
      if ($('reg-status-label')) $('reg-status-label').textContent = 'Open';
    });
  }
}

function renderOrdersHistory() {
  var tb = $('orders-tbody');
  if (!tb) return;
  var q = (($('orders-search') && $('orders-search').value) || '').toLowerCase().trim();
  var sales = (DB.sales || []).filter(function (s) {
    if (!s || s.type === 'box') return false;
    if (s.kind === 'buylist') return false;
    return true;
  }).slice().reverse();
  if (q) {
    sales = sales.filter(function (s) {
      return ((s.name || '') + ' ' + (s.sku || '') + ' ' + (s.customer || '') + ' ' + (s.date || '') + ' ' + (s.paymentMethod || '')).toLowerCase().indexOf(q) >= 0;
    });
  }
  sales = sales.slice(0, 100);
  if (!sales.length) {
    tb.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--muted)">No orders yet</td></tr>';
    return;
  }
  tb.innerHTML = sales.map(function (s) {
    var total = num(s.price) * int(s.qty, 1);
    var pay = s.paymentMethod || '—';
    return '<tr>' +
      '<td>' + esc(s.date || '') + '</td>' +
      '<td><div style="font-weight:650">' + esc(s.name || s.sku || 'Sale') + '</div><div class="text-muted" style="font-size:11px">' + esc(s.sku || '') + ' · qty ' + int(s.qty, 1) + '</div></td>' +
      '<td>' + esc(s.customer || '—') + '</td>' +
      '<td class="mono">' + fmt(total) + '</td>' +
      '<td>' + esc(pay) + (s.paymentStatus ? ' · ' + esc(s.paymentStatus) : '') + '</td>' +
      '<td class="orders-actions"><button class="btn btn-secondary" type="button" style="width:auto;min-height:32px;padding:4px 8px;font-size:11px" onclick="reprintSale(' + s.id + ')">Reprint</button></td>' +
      '</tr>';
  }).join('');
}
function reprintSale(id) {
  var s = (DB.sales || []).find(function (x) { return x.id === id; });
  if (!s) { toast('Sale not found', 'err'); return; }
  try {
    var w = window.open('', '_blank', 'width=420,height=640');
    if (w) {
      w.document.write('<pre style="font:13px/1.4 ui-monospace,monospace;padding:16px">' +
        esc((loadSettings().shopName || 'CardTrack') + '\n') +
        '----------------\n' +
        esc(s.name || s.sku || 'Item') + ' x' + int(s.qty, 1) + '  ' + fmt(num(s.price) * int(s.qty, 1)) + '\n' +
        'Customer: ' + esc(s.customer || '—') + '\n' +
        'Pay: ' + esc(s.paymentMethod || '') + ' ' + esc(s.paymentStatus || '') + '\n' +
        'Date: ' + esc(s.date || '') + '\n' +
        '----------------\nThank you\n</pre>');
      w.document.close();
      w.focus();
      w.print();
      toast('Reprint sent', 'ok');
      return;
    }
  } catch (e2) {}
  if (typeof printLastReceipt === 'function') printLastReceipt();
}

(function patchEntHooks(){
  function wrap(name, after) {
    if (typeof window[name] !== 'function' || window[name]['_ent']) return;
    var orig = window[name];
    window[name] = function () {
      var r = orig.apply(this, arguments);
      try { after.apply(this, arguments); } catch (e) {}
      return r;
    };
    window[name]._ent = true;
  }
  wrap('renderCart', function () { entUpdateChargeBtn(); renderSmartGrid(); });
  wrap('addInventoryToCart', function () { renderSmartGrid(); entUpdateChargeBtn(); });
  wrap('clearCart', function () { entUpdateChargeBtn(); renderSmartGrid(); });
  wrap('updateCheckoutDue', function () { entUpdateChargeBtn(); });
  wrap('setPayMethod', function (m) {
    document.querySelectorAll('#pay-sheet-grid .pay-opt').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-pay') === PAY_METHOD);
    });
    var linkBox = $('pay-link-box-sheet');
    if (linkBox) linkBox.style.display = PAY_METHOD === 'link' ? 'block' : 'none';
    var cred = $('pay-sheet-credit');
    if (cred) cred.style.display = (m === 'credit' || PAY_METHOD === 'credit') ? 'block' : 'none';
    hydratePaymentSheet();
  });
  wrap('renderInventory', function () { renderSmartGrid(); });
  wrap('loadSampleShop', function () { setTimeout(renderSmartGrid, 50); });
  wrap('ctSwitchLane', function () { entUpdateChargeBtn(); });

  if (typeof switchTab === 'function' && !switchTab._ent) {
    var _st = switchTab;
    switchTab = function (name) {
      var mapMore = ['shop','prices','watchlist','scan','ebay','game','storefront'];
      var r = _st.apply(this, arguments);
      try {
        document.querySelectorAll('#ent-rail .rail-item[data-tab]').forEach(function (b) {
          var t = b.getAttribute('data-tab');
          b.classList.toggle('active', t === name);
        });
        document.querySelectorAll('.bnav-item[data-tab]').forEach(function (b) {
          var t = b.getAttribute('data-tab');
          if (t === 'more') {
            b.classList.toggle('active', ['buylist','reports','shop','prices','watchlist','scan','ebay','game','storefront'].indexOf(name) !== -1);
          } else {
            b.classList.toggle('active', t === name);
          }
        });
        if (name === 'orders') renderOrdersHistory();
        if (name === 'log') {
          renderSmartGrid();
          entUpdateChargeBtn();
          setTimeout(function () {
            var el = $('reg-search-desk') || $('reg-search');
            if (el) try { el.focus(); } catch (e) {}
          }, 40);
        }
        if ($('shop-title')) {
          var titles = { home:'Home', log:'Register', orders:'Orders', inventory:'Catalog', customers:'Customers', reports:'Insights', buylist:'Trade-in', shop:'Settings', storefront:'Storefront' };
          $('shop-title').textContent = titles[name] || 'CardTrack';
        }
      } catch (e) {}
      return r;
    };
    switchTab._ent = true;
  }

  if (typeof setPayMethod === 'function' && !setPayMethod._creditAlias) {
    var _spm = setPayMethod;
    setPayMethod = function (m) {
      if (m === 'credit') {
        if ($('log-apply-credit')) $('log-apply-credit').checked = true;
        _spm('cash');
        PAY_METHOD = 'credit';
        document.querySelectorAll('.pay-opt').forEach(function (el) {
          el.classList.toggle('active', el.getAttribute('data-pay') === 'credit');
        });
        hydratePaymentSheet();
        return;
      }
      return _spm.apply(this, arguments);
    };
    setPayMethod._creditAlias = true;
  }
})();

document.addEventListener('DOMContentLoaded', function () {
  try {
    document.querySelectorAll('.ent-rail .rail-ico[data-ico]').forEach(function (el) {
      if (typeof icon === 'function') el.innerHTML = icon(el.getAttribute('data-ico'));
    });
    renderSmartGrid();
    entUpdateChargeBtn();
    if ($('reg-search')) {
      $('reg-search').addEventListener('input', function () {
        if ($('reg-search-desk')) $('reg-search-desk').value = this.value;
        renderSmartGrid();
      });
    }
  } catch (e) {}
});
setTimeout(function () {
  try {
    document.querySelectorAll('.ent-rail .rail-ico[data-ico]').forEach(function (el) {
      if (!el.getAttribute('data-painted') && typeof icon === 'function') {
        el.innerHTML = icon(el.getAttribute('data-ico'));
        el.setAttribute('data-painted', '1');
      }
    });
    renderSmartGrid();
    entUpdateChargeBtn();
  } catch (e) {}
}, 120);



window.ctShowSettingsGroup = function ctShowSettingsGroup(key) {
  key = key || 'shop';
  document.querySelectorAll('#settings-nav .settings-nav-item').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-settings-group') === key);
  });
  document.querySelectorAll('#settings-panels .settings-group').forEach(function (g) {
    g.classList.toggle('active', g.getAttribute('data-settings-group') === key);
  });
  try { localStorage.setItem('ct_settings_group', key); } catch (e) {}
};
(function patchSettingsTab() {
  if (typeof switchTab !== 'function' || switchTab._settingsNav) return;
  var _st = switchTab;
  switchTab = function (name) {
    var r = _st.apply(this, arguments);
    if (name === 'shop') {
      var key = 'shop';
      try { key = localStorage.getItem('ct_settings_group') || 'shop'; } catch (e) {}
      if (typeof ctShowSettingsGroup === 'function') ctShowSettingsGroup(key);
    }
    return r;
  };
  switchTab._settingsNav = true;
})();

/* ===== Home shell: onboarding + Home dashboard + settings groups ===== */
(function () {
  if (window.__ctHomeShell) return;
  window.__ctHomeShell = true;

  function todayKey() {
    try { return d8(); } catch (e) {
      var d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }
  }

  function paintHomeIcos() {
    if (typeof icon !== 'function') return;
    document.querySelectorAll('[data-home-ico]').forEach(function (el) {
      if (el.getAttribute('data-painted')) return;
      el.innerHTML = icon(el.getAttribute('data-home-ico'));
      el.setAttribute('data-painted', '1');
    });
    document.querySelectorAll('[data-ob-ico]').forEach(function (el) {
      if (el.getAttribute('data-painted')) return;
      el.innerHTML = icon(el.getAttribute('data-ob-ico'), 'sm');
      el.setAttribute('data-painted', '1');
    });
  }

  window.renderHomeDashboard = function renderHomeDashboard() {
    paintHomeIcos();
    var sales = (typeof DB !== 'undefined' && DB.sales) ? DB.sales : [];
    var inv = (typeof DB !== 'undefined' && DB.inventory) ? DB.inventory : [];
    var tk = todayKey();
    var today = sales.filter(function (s) {
      if (!s || s.type === 'box' || s.kind === 'buylist') return false;
      var d = (s.date || '').slice(0, 10);
      return d === tk || d === tk.replace(/-/g, '');
    });
    // also accept ISO dates
    if (!today.length) {
      today = sales.filter(function (s) {
        if (!s || s.type === 'box') return false;
        try {
          var t = new Date(s.date || s.ts || 0);
          var now = new Date();
          return t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth() && t.getDate() === now.getDate();
        } catch (e) { return false; }
      });
    }
    var salesSum = today.reduce(function (a, s) { return a + (Number(s.price) || 0) * (Number(s.qty) || 1); }, 0);
    var salesCount = today.length;
    var units = inv.reduce(function (a, i) { return a + (Number(i.qty) || 0); }, 0);
    var deadDays = 60;
    try { deadDays = Number(loadSettings().deadStockDays) || 60; } catch (e) {}
    var cutoff = Date.now() - deadDays * 86400000;
    var dead = inv.filter(function (i) {
      if (!i || !(Number(i.qty) > 0)) return false;
      var added = i.addedAt || i.receivedDate || i.date || '';
      var t = Date.parse(added) || 0;
      return t && t < cutoff;
    }).length;
    var creditOut = 0;
    try {
      var custs = (typeof getCustomers === 'function') ? getCustomers() : [];
      creditOut = custs.reduce(function (a, c) { return a + Math.max(0, Number(c.balance) || 0); }, 0);
    } catch (e) {}
    var outboxN = 0;
    try { outboxN = (typeof ctLoadOutbox === 'function') ? ctLoadOutbox().length : 0; } catch (e) {}

    var f = (typeof fmt === 'function') ? fmt : function (n) { return '$' + (Number(n) || 0).toFixed(2); };
    if ($('home-sales-val')) $('home-sales-val').textContent = f(salesSum);
    if ($('home-sales-count')) $('home-sales-count').textContent = salesCount + (salesCount === 1 ? ' order' : ' orders');
    if ($('home-inv-val')) $('home-inv-val').textContent = String(units);
    if ($('home-dead-sub')) $('home-dead-sub').textContent = dead + ' dead stock';
    if ($('home-credit-val')) $('home-credit-val').textContent = f(creditOut);
    if ($('home-outbox-val')) $('home-outbox-val').textContent = String(outboxN);
    var obKpi = $('home-outbox-kpi');
    if (obKpi) obKpi.classList.toggle('warn', outboxN > 0);
    var badge = $('rail-outbox-badge');
    if (badge) {
      badge.textContent = String(outboxN);
      badge.classList.toggle('show', outboxN > 0);
    }

    var box = $('home-recent-orders');
    if (box) {
      var recent = sales.filter(function (s) { return s && s.type !== 'box'; }).slice().sort(function (a, b) {
        return String(b.date || b.ts || '').localeCompare(String(a.date || a.ts || ''));
      }).slice(0, 8);
      if (!recent.length) {
        box.innerHTML = '<div class="home-empty-orders"><div class="heo-ico">' + (typeof icon==='function'?icon('receipt'):'') + '</div><div class="heo-title">No orders yet</div><div class="heo-hint">Open Register or load the sample shop to see activity here.</div></div>';
      } else {
        box.innerHTML = recent.map(function (s) {
          var total = (Number(s.price) || 0) * (Number(s.qty) || 1);
          return '<div class="home-recent-row">' +
            '<div><div class="hr-name">' + (typeof esc === 'function' ? esc(s.name || s.sku || 'Sale') : (s.name || 'Sale')) + '</div>' +
            '<div class="hr-meta">' + (typeof esc === 'function' ? esc(s.date || '') : (s.date || '')) +
            (s.customer ? ' · ' + (typeof esc === 'function' ? esc(s.customer) : s.customer) : '') + '</div></div>' +
            '<div class="hr-amt">' + f(total) + '</div></div>';
        }).join('');
      }
    }
  };

  window.ctHomeStorefrontShare = function () {
    if (typeof showStorefrontQr === 'function') showStorefrontQr();
    else if (typeof copyStorefrontLink === 'function') copyStorefrontLink();
    else if (typeof switchTab === 'function') switchTab('storefront');
  };

  window.ctNeedsOnboarding = function () {
    try {
      var s = loadSettings();
      if (s.onboarded) return false;
      if (typeof isStorefrontPublic === 'function' && isStorefrontPublic()) return false;
      return true;
    } catch (e) { return false; }
  };

  window.ctShowOnboarding = function () {
    var el = $('ct-onboard');
    if (!el) return;
    document.body.classList.add('onboarding');
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
    var w = $('ob-step-welcome'), se = $('ob-step-setup');
    if (w) w.classList.add('active');
    if (se) se.classList.remove('active');
    paintHomeIcos();
  };

  window.ctHideOnboarding = function () {
    var el = $('ct-onboard');
    document.body.classList.remove('onboarding');
    function unlockApp() {
      /* Belt-and-suspenders: never leave #ent-app untappable */
      try {
        var app = $('ent-app');
        if (app) { app.style.pointerEvents = ''; app.style.visibility = ''; }
      } catch (e) {}
    }
    if (el && el.classList.contains('show') && typeof window.__ctAnimateClose === 'function' && !window.__ctMotionReduce()) {
      var done = false;
      function finish() {
        if (done) return; done = true;
        el.classList.remove('show', 'ct-closing');
        el.setAttribute('aria-hidden', 'true');
        el.removeEventListener('animationend', onEnd);
        unlockApp();
      }
      function onEnd(ev) {
        if (!ev || !el.contains(ev.target)) return;
        finish();
      }
      el.classList.add('ct-closing');
      el.addEventListener('animationend', onEnd);
      setTimeout(finish, 280);
    } else if (el) {
      el.classList.remove('show', 'ct-closing');
      el.setAttribute('aria-hidden', 'true');
      unlockApp();
    } else {
      unlockApp();
    }
  };

  window.ctOnboardNext = function () {
    var w = $('ob-step-welcome'), se = $('ob-step-setup');
    if (w) w.classList.remove('active');
    if (se) se.classList.add('active');
    var s = loadSettings();
    if ($('ob-shop-name') && !$('ob-shop-name').value) $('ob-shop-name').value = s.shopName || '';
    if ($('ob-cashapp') && s.p2p && s.p2p.cashapp) $('ob-cashapp').value = s.p2p.cashapp;
    setTimeout(function () { try { $('ob-shop-name').focus(); } catch (e) {} }, 40);
  };

  window.ctOnboardSkip = function () {
    var s = loadSettings();
    s.onboarded = true;
    saveSettings(s);
    ctHideOnboarding();
    if (typeof switchTab === 'function') switchTab('home');
    renderHomeDashboard();
  };

  window.ctOnboardLoadSample = function () {
    try {
      if (typeof loadSampleShop === 'function') loadSampleShop(true);
    } catch (e) { console.warn(e); }
    if ($('ob-shop-name') && !$('ob-shop-name').value) {
      var s = loadSettings();
      $('ob-shop-name').value = s.shopName || 'Demo Meet Booth';
    }
    toast('Sample shop loaded', 'ok');
  };

  window.ctOnboardFinish = function (goHome) {
    var s = loadSettings();
    var name = ($('ob-shop-name') && $('ob-shop-name').value || '').trim();
    var cash = ($('ob-cashapp') && $('ob-cashapp').value || '').trim();
    if (name) s.shopName = name;
    s.p2p = s.p2p || {};
    if (cash) s.p2p.cashapp = cash;
    s.onboarded = true;
    saveSettings(s);
    if (typeof applyShopChrome === 'function') applyShopChrome();
    if ($('set-shop-name') && name) $('set-shop-name').value = name;
    if ($('set-p2p-cashapp') && cash) $('set-p2p-cashapp').value = cash;
    ctHideOnboarding();
    if (typeof switchTab === 'function') switchTab(goHome ? 'home' : 'log');
    renderHomeDashboard();
    toast(s.shopName ? ('Welcome, ' + s.shopName) : 'Ready', 'ok');
  };

  // Patch switchTab for home + rail highlighting
  function patchSwitchTab() {
    if (typeof switchTab !== 'function' || switchTab._homeShell) return;
    var _st = switchTab;
    switchTab = function (name) {
      var r = _st.apply(this, arguments);
      try {
        document.body.classList.toggle('home-active', name === 'home');
        document.body.classList.toggle('meet-active', name === 'log');
        document.querySelectorAll('#ent-rail .rail-item[data-tab]').forEach(function (b) {
          var t = b.getAttribute('data-tab');
          b.classList.toggle('active', t === name);
        });
        document.querySelectorAll('.bnav-item[data-tab]').forEach(function (b) {
          var t = b.getAttribute('data-tab');
          if (t === 'more') {
            b.classList.toggle('active', ['buylist','reports','shop','prices','watchlist','scan','ebay','game','storefront','customers'].indexOf(name) !== -1 && name !== 'home' && name !== 'log' && name !== 'orders' && name !== 'inventory');
          } else {
            b.classList.toggle('active', t === name || (t === 'home' && name === 'home'));
          }
        });
        if ($('shop-title')) {
          var titles = { home:'Home', log:'Register', orders:'Orders', inventory:'Catalog', customers:'Customers', reports:'Insights', buylist:'Trade-in', shop:'Settings', storefront:'Storefront' };
          $('shop-title').textContent = titles[name] || 'CardTrack';
        }
        if (name === 'home') renderHomeDashboard();
        if (name === 'shop' && typeof applyShopChrome === 'function') applyShopChrome();
      } catch (e) {}
      return r;
    };
    switchTab._homeShell = true;
  }

  function patchOutboxBadge() {
    if (typeof ctUpdateOutboxBadge !== 'function' || ctUpdateOutboxBadge._homeShell) return;
    var _u = ctUpdateOutboxBadge;
    ctUpdateOutboxBadge = function () {
      var r = _u.apply(this, arguments);
      try {
        var n = 0;
        try { n = ctLoadOutbox().length; } catch (e) {}
        var badge = $('rail-outbox-badge');
        if (badge) {
          badge.textContent = String(n);
          badge.classList.toggle('show', n > 0);
        }
        if ($('home-outbox-val')) $('home-outbox-val').textContent = String(n);
      } catch (e) {}
      return r;
    };
    ctUpdateOutboxBadge._homeShell = true;
  }

  function patchSampleBoot() {
    // Don't auto-seed when first-run landing will handle it
    if (typeof maybeSeedSampleOnBoot !== 'function' || maybeSeedSampleOnBoot._homeShell) return;
    var _m = maybeSeedSampleOnBoot;
    maybeSeedSampleOnBoot = function () {
      try {
        if (ctNeedsOnboarding()) {
          renderSampleChips && renderSampleChips();
          return;
        }
      } catch (e) {}
      return _m.apply(this, arguments);
    };
    maybeSeedSampleOnBoot._homeShell = true;
  }

  window.ctInitHomeShell = function ctInitHomeShell() {
    patchSwitchTab();
    patchOutboxBadge();
    patchSampleBoot();
    paintHomeIcos();
    // paint rail home icon
    document.querySelectorAll('.ent-rail .rail-ico[data-ico="home"]').forEach(function (el) {
      if (typeof icon === 'function') el.innerHTML = icon('home');
    });
    document.querySelectorAll('.bnav-ico[data-ico="home"]').forEach(function (el) {
      if (typeof icon === 'function') el.innerHTML = icon('home');
    });

    if (typeof isStorefrontPublic === 'function' && isStorefrontPublic()) return;

    if (ctNeedsOnboarding()) {
      ctShowOnboarding();
      return;
    }
    /* Ensure leftover onboarding class from a prior broken boot cannot block taps */
    ctHideOnboarding();
    // Default to Home when onboarded (unless last tab was intentional and not a heavy tool)
    try {
      var saved = localStorage.getItem(typeof CT_LAST_TAB_KEY !== 'undefined' ? CT_LAST_TAB_KEY : 'ct_last_tab');
      var preferHome = !saved || saved === 'log' || saved === 'home' || ['scan','prices','watchlist','ebay','game'].indexOf(saved) !== -1;
      if (preferHome && typeof switchTab === 'function') {
        switchTab('home');
      } else if (saved === 'home' && typeof switchTab === 'function') {
        switchTab('home');
      }
      renderHomeDashboard();
    } catch (e) {
      try { switchTab('home'); } catch (e2) {}
    }
  };

  function boot() {
    setTimeout(function () {
      try { ctInitHomeShell(); } catch (e) { console.warn('home shell', e); }
    }, 80);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

