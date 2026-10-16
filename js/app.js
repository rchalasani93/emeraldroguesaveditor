/* Emerald Rogue Save Editor — UI */
(function () {
  'use strict';
  var D = window.ER_DATA, C = window.ERCore, Pokemon = C.Pokemon;
  var state = { save: null, fileName: 'Emeraldrogue.sav', selected: null, work: null, clipboard: null, tab: 'trainer', box: 0, dirty: false };

  // ---------------------------------------------------------------- helpers
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clamp(v, lo, hi) { v = parseInt(v, 10); if (isNaN(v)) v = lo; return Math.max(lo, Math.min(hi, v)); }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function markDirty() { state.dirty = true; $('#download-btn').disabled = false; }

  function speciesName(id) { var s = D.species[id]; return s && s[0] ? s[0] : 'Species #' + id; }
  function moveName(id) { var m = D.moves[id]; return id ? (m && m[0] ? m[0] : 'Move #' + id) : '—'; }
  function itemName(id) { var it = D.items[id]; return id ? (it && it[0] ? it[0] : 'Item #' + id) : 'None'; }
  function itemPocket(id) { var it = D.items[id]; return it ? it[1] : 0; }
  function isValidSpecies(id) { var s = D.species[id]; return !!(s && s[0] && s[1][0] > 0); }

  function refLabel(name, id) { return name + ' #' + id; }
  /** Parses "Name #123", "123" or an exact name into an id; returns -1 if unknown. */
  function parseRef(value, table, nameIdx) {
    value = (value || '').trim();
    if (!value) return 0;
    var m = value.match(/#(\d+)\s*$/) || value.match(/^(\d+)$/);
    if (m) { var n = +m[1]; return n < table.length ? n : -1; }
    // In-game names are often abbreviated ("DragonAscent"), so compare loosely
    var key = normName(value);
    for (var i = 1; i < table.length; i++) {
      var nm = nameIdx === undefined ? table[i] : table[i][nameIdx];
      if (nm && normName(nm) === key) return i;
    }
    return -1;
  }

  function normName(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }

  function buildDatalists() {
    var sp = [], mv = [], it = [], i;
    for (i = 1; i < D.species.length; i++) if (isValidSpecies(i)) sp.push('<option value="' + esc(refLabel(D.species[i][0], i)) + '">');
    for (i = 1; i < D.moves.length; i++) if (D.moves[i][0] && D.moves[i][0] !== '-') mv.push('<option value="' + esc(refLabel(D.moves[i][0], i)) + '">');
    for (i = 1; i < D.items.length; i++) if (D.items[i][0] && D.items[i][0] !== '????????') it.push('<option value="' + esc(refLabel(D.items[i][0], i)) + '">');
    $('#species-list').innerHTML = sp.join('');
    $('#move-list').innerHTML = mv.join('');
    $('#item-list').innerHTML = it.join('');
  }

  // ---------------------------------------------------------------- loading
  function loadFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        state.save = new C.SaveFile(new Uint8Array(reader.result));
      } catch (e) {
        toast(e.message);
        alert('Could not open this file: ' + e.message);
        return;
      }
      state.fileName = file.name || state.fileName;
      state.dirty = false;
      state.selected = null;
      state.box = Math.min(state.save.currentBox || 0, C.OFFSETS.storage.boxCount - 1);
      closeEditor();
      $('#dropzone').hidden = true;
      $('#editor').hidden = false;
      $('#download-btn').disabled = false;
      $('#warnings').innerHTML = state.save.warnings.map(function (w) { return '<div class="warning">' + esc(w) + '</div>'; }).join('');
      renderAll();
      toast('Loaded ' + state.fileName);
    };
    reader.readAsArrayBuffer(file);
  }

  function download() {
    if (!state.save) return;
    if (state.work && state.dirtyMon) applyEditor(true);
    var out;
    try { out = state.save.export(); } catch (e) { alert(e.message); return; }
    var blob = new Blob([out], { type: 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.fileName.replace(/(\.[^.]+)?$/, function (ext) { return ext || '.sav'; });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    state.dirty = false;
    renderParty(); renderBoxes();
    toast('Saved ' + a.download + ' with fixed checksums');
  }

  // ---------------------------------------------------------------- tabs
  function selectTab(name) {
    state.tab = name;
    $all('.tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false'); });
    $all('.pane').forEach(function (p) { p.hidden = p.id !== 'pane-' + name; });
  }

  function renderAll() { renderTrainer(); renderParty(); renderBoxes(); renderBag(); renderPcItems(); renderAdvanced(); }

  // ---------------------------------------------------------------- trainer
  function renderTrainer() {
    var s = state.save, r = s.rogue;
    var p = $('#pane-trainer');
    p.innerHTML =
      '<h2>Trainer</h2><p class="lede">Your name, ID and money. Party Pokémon you create use this name and ID as their original trainer.</p>' +
      '<div class="form-grid">' +
      field('Name', '<input id="t-name" maxlength="7" value="' + esc(s.playerName) + '">', 'Up to 7 characters') +
      field('Trainer ID', '<input id="t-tid" type="number" min="0" max="65535" value="' + s.tid + '">') +
      field('Secret ID', '<input id="t-sid" type="number" min="0" max="65535" value="' + s.sid + '">') +
      field('Money', '<input id="t-money" type="number" min="0" max="9999999" value="' + s.money + '">') +
      field('Play time (h : m : s)', '<div class="inline"><input id="t-h" type="number" min="0" max="999" value="' + s.playHours + '"><input id="t-m" type="number" min="0" max="59" value="' + s.playMinutes + '"><input id="t-s" type="number" min="0" max="59" value="' + s.playSeconds + '"></div>') +
      field('Hub name', '<input id="t-hub" maxlength="15" value="' + esc(s.hubName) + '">', 'Shown around the Pokémon Hub') +
      '</div>' +
      '<p class="hint" style="margin-top:22px">Loaded save slot ' + (s.slot.slot + 1) + ' (save counter ' + s.slot.counter + ').' +
      (r.secretId === 27615 ? ' Rogue save format ' + r.saveVersion + ', ' + r.numSpecies + ' species.' : '') +
      ' Outfit #' + s.playerGender + '.</p>';
    bind('#t-name', 'input', function (e) { s.playerName = e.target.value; e.target.classList.toggle('invalid', !C.canEncode(e.target.value)); markDirty(); });
    bind('#t-tid', 'change', function (e) { s.tid = clamp(e.target.value, 0, 65535); e.target.value = s.tid; markDirty(); });
    bind('#t-sid', 'change', function (e) { s.sid = clamp(e.target.value, 0, 65535); e.target.value = s.sid; markDirty(); });
    bind('#t-money', 'change', function (e) { s.money = clamp(e.target.value, 0, 9999999); e.target.value = s.money; markDirty(); });
    bind('#t-h', 'change', function (e) { s.playHours = clamp(e.target.value, 0, 999); e.target.value = s.playHours; markDirty(); });
    bind('#t-m', 'change', function (e) { s.playMinutes = clamp(e.target.value, 0, 59); e.target.value = s.playMinutes; markDirty(); });
    bind('#t-s', 'change', function (e) { s.playSeconds = clamp(e.target.value, 0, 59); e.target.value = s.playSeconds; markDirty(); });
    bind('#t-hub', 'input', function (e) { s.hubName = e.target.value; e.target.classList.toggle('invalid', !C.canEncode(e.target.value)); markDirty(); });
  }
  function field(label, control, note) {
    return '<label class="field"><span>' + label + '</span>' + control + (note ? '<small>' + note + '</small>' : '') + '</label>';
  }
  function bind(sel, ev, fn, root) { var el = $(sel, root); if (el) el.addEventListener(ev, fn); return el; }

  // ---------------------------------------------------------------- party
  function monSummary(m) {
    var lvl = m.isParty ? m.level : m.levelFromExp();
    var name = m.isEgg ? 'Egg' : m.getNickname();
    return { name: name, species: m.isEgg ? 'Egg' : speciesName(m.species), level: lvl };
  }

  function renderParty() {
    var s = state.save, p = $('#pane-party');
    var html = '<h2>Party</h2><p class="lede">Select a Pokémon to edit it. Empty slots let you create a new one or paste a copied Pokémon. Gaps are closed up when you download.</p><div class="party-grid">';
    s.party.forEach(function (m, i) {
      var sel = state.selected && state.selected.kind === 'party' && state.selected.index === i ? ' selected' : '';
      if (m.isEmptySlot) {
        html += '<button class="slot-card empty' + sel + '" data-party="' + i + '">Empty slot — add Pokémon</button>';
      } else {
        var sm = monSummary(m), pct = m.maxHP ? Math.round(100 * m.hp / m.maxHP) : 0;
        html += '<button class="slot-card' + sel + '" data-party="' + i + '">' +
          '<span class="nick">' + esc(sm.name) + (m.isShiny ? ' <span class="shiny" title="Shiny">★</span>' : '') + '</span>' +
          '<span class="meta">' + esc(sm.species) + ' · Lv ' + sm.level + ' · HP ' + m.hp + '/' + m.maxHP + '</span>' +
          '<span class="meta">' + esc(itemName(m.heldItem)) + '</span>' +
          '<span class="hpbar"><i style="width:' + pct + '%"></i></span>' +
          (m.checksumValid ? '' : '<span class="meta" style="color:var(--danger)">Checksum was invalid (shows as a Bad Egg in game)</span>') +
          '</button>';
      }
    });
    html += '</div>';
    p.innerHTML = html;
    $all('[data-party]', p).forEach(function (b) {
      b.addEventListener('click', function () { openEditor({ kind: 'party', index: +b.dataset.party }); });
    });
  }

  // ---------------------------------------------------------------- boxes
  function renderBoxes() {
    var s = state.save, p = $('#pane-boxes'), bi = state.box;
    var opts = '';
    for (var i = 0; i < s.boxes.length; i++) opts += '<option value="' + i + '"' + (i === bi ? ' selected' : '') + '>' + esc(s.getBoxName(i) || 'Box ' + (i + 1)) + '</option>';
    var html = '<h2>PC Boxes</h2><p class="lede">Ten boxes of thirty. Select a slot to edit, create or paste a Pokémon.</p>' +
      '<div class="box-head"><button class="btn btn-small" id="box-prev" aria-label="Previous box">◀</button>' +
      '<select id="box-select" aria-label="Box">' + opts + '</select>' +
      '<button class="btn btn-small" id="box-next" aria-label="Next box">▶</button>' +
      '<label class="inline"><span class="hint">Rename</span><input id="box-name" maxlength="8" value="' + esc(s.getBoxName(bi)) + '"></label></div>' +
      '<div class="box-frame"><div class="box-grid">';
    s.boxes[bi].forEach(function (m, slot) {
      var sel = state.selected && state.selected.kind === 'box' && state.selected.box === bi && state.selected.index === slot ? ' selected' : '';
      if (m.isEmptySlot) html += '<button class="box-cell empty' + sel + '" data-slot="' + slot + '" aria-label="Empty slot ' + (slot + 1) + '">+</button>';
      else {
        var sm = monSummary(m);
        html += '<button class="box-cell' + (m.isEgg ? ' egg' : '') + sel + '" data-slot="' + slot + '" title="' + esc(sm.name + ' (' + sm.species + ')') + '">' +
          '<span class="sp">' + esc(sm.species) + (m.isShiny ? ' <span class="shiny">★</span>' : '') + '</span>' +
          '<span class="lv">Lv ' + sm.level + '</span></button>';
      }
    });
    html += '</div></div>';
    p.innerHTML = html;
    bind('#box-select', 'change', function (e) { state.box = +e.target.value; renderBoxes(); }, p);
    bind('#box-prev', 'click', function () { state.box = (bi + s.boxes.length - 1) % s.boxes.length; renderBoxes(); }, p);
    bind('#box-next', 'click', function () { state.box = (bi + 1) % s.boxes.length; renderBoxes(); }, p);
    bind('#box-name', 'change', function (e) { s.setBoxName(bi, e.target.value); markDirty(); renderBoxes(); }, p);
    $all('[data-slot]', p).forEach(function (b) {
      b.addEventListener('click', function () { openEditor({ kind: 'box', box: bi, index: +b.dataset.slot }); });
    });
  }

  // ---------------------------------------------------------------- items
  function itemTable(list, opts) {
    var html = '<table class="item-table"><thead><tr><th>Item</th><th>Quantity</th><th><span class="sr">Remove</span></th></tr></thead><tbody>';
    var lastPocket = -1;
    var rows = list.map(function (e, i) { return { e: e, i: i, pocket: itemPocket(e.item) }; });
    if (opts.grouped) rows.sort(function (a, b) { return (a.pocket - b.pocket) || (a.i - b.i); });
    rows.forEach(function (r) {
      if (opts.grouped && r.pocket !== lastPocket) {
        lastPocket = r.pocket;
        html += '<tr class="pocket-row"><td colspan="3">' + esc(D.pockets[r.pocket] || 'Unknown pocket') + '</td></tr>';
      }
      html += '<tr><td>' + esc(itemName(r.e.item)) + ' <span class="hint">#' + r.e.item + '</span></td>' +
        '<td class="num"><input type="number" min="1" max="' + opts.max + '" value="' + r.e.quantity + '" data-qty="' + r.i + '" aria-label="Quantity"></td>' +
        '<td class="act"><button class="btn btn-small btn-danger" data-del="' + r.i + '">Remove</button></td></tr>';
    });
    if (!list.length) html += '<tr><td colspan="3" class="hint">No items yet. Add one below.</td></tr>';
    html += '</tbody></table>' +
      '<div class="add-row"><input list="item-list" placeholder="Search for an item…" class="add-item" aria-label="Item to add">' +
      '<input type="number" class="add-qty" min="1" max="' + opts.max + '" value="1" aria-label="Quantity">' +
      '<button class="btn btn-primary add-btn">Add item</button></div>';
    return html;
  }

  function wireItemTable(root, list, commit, max) {
    $all('[data-qty]', root).forEach(function (inp) {
      inp.addEventListener('change', function () { var e = list[+inp.dataset.qty]; e.quantity = clamp(inp.value, 1, max); inp.value = e.quantity; commit(list, false); });
    });
    $all('[data-del]', root).forEach(function (b) {
      b.addEventListener('click', function () { list.splice(+b.dataset.del, 1); commit(list, true); });
    });
    var addBtn = $('.add-btn', root), addItem = $('.add-item', root), addQty = $('.add-qty', root);
    function add() {
      var id = parseRef(addItem.value, D.items, 0);
      if (id <= 0 || !D.items[id] || !D.items[id][0]) { addItem.classList.add('invalid'); toast('Pick an item from the list'); return; }
      var q = clamp(addQty.value, 1, max);
      var existing = list.filter(function (e) { return e.item === id; })[0];
      if (existing) existing.quantity = Math.min(max, existing.quantity + q); else list.push({ item: id, quantity: q });
      commit(list, true);
      toast('Added ' + q + '× ' + itemName(id));
    }
    addBtn.addEventListener('click', add);
    addItem.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
    addItem.addEventListener('input', function () { addItem.classList.remove('invalid'); });
  }

  function renderBag() {
    var s = state.save, p = $('#pane-bag'), list = s.getBag();
    p.innerHTML = '<h2>Bag</h2><p class="lede">Items are grouped by pocket automatically, the way the game expects. Quantities above 999 may be capped in game.</p>' +
      itemTable(list, { grouped: true, max: 999 });
    wireItemTable(p, list, function (l, rerender) {
      try { s.setBag(l, itemPocket); } catch (e) { toast(e.message); return; }
      markDirty(); if (rerender) renderBag();
    }, 999);
  }

  function renderPcItems() {
    var s = state.save, p = $('#pane-pcitems'), list = s.getPcItems();
    p.innerHTML = '<h2>PC Items</h2><p class="lede">The item storage in your PC (50 slots).</p>' + itemTable(list, { grouped: false, max: 999 });
    wireItemTable(p, list, function (l, rerender) {
      try { s.setPcItems(l); } catch (e) { toast(e.message); return; }
      markDirty(); if (rerender) renderPcItems();
    }, 999);
  }

  // ---------------------------------------------------------------- advanced
  function renderAdvanced() {
    var s = state.save, p = $('#pane-advanced');
    p.innerHTML = '<h2>Flags &amp; Vars</h2><p class="lede">Raw story flags (0–2399) and variables (0x4000–0x40FF). Only change these if you know the ID you need from the Emerald Rogue source — wrong values can break events.</p>' +
      '<div class="form-grid">' +
      field('Flag ID', '<input id="f-id" type="number" min="0" max="2399" value="0">') +
      field('Flag state', '<label class="check"><input type="checkbox" id="f-val"> Set</label>') +
      field('Var ID (hex)', '<input id="v-id" value="4000">') +
      field('Var value', '<input id="v-val" type="number" min="0" max="65535">') +
      '</div>';
    var fid = $('#f-id', p), fval = $('#f-val', p), vid = $('#v-id', p), vval = $('#v-val', p);
    function refreshFlag() { fval.checked = !!s.getFlag(clamp(fid.value, 0, 2399)); }
    function varIndex() { var n = parseInt(vid.value, 16); if (isNaN(n)) return -1; if (n >= 0x4000) n -= 0x4000; return n >= 0 && n < 256 ? n : -1; }
    function refreshVar() { var i = varIndex(); vid.classList.toggle('invalid', i < 0); vval.value = i < 0 ? '' : s.getVar(i); }
    fid.addEventListener('input', refreshFlag);
    fval.addEventListener('change', function () { s.setFlag(clamp(fid.value, 0, 2399), fval.checked); markDirty(); });
    vid.addEventListener('input', refreshVar);
    vval.addEventListener('change', function () { var i = varIndex(); if (i < 0) return; s.setVar(i, clamp(vval.value, 0, 65535)); markDirty(); });
    refreshFlag(); refreshVar();
  }

  // ---------------------------------------------------------------- mon editor
  function slotMon(sel) { return sel.kind === 'party' ? state.save.party[sel.index] : state.save.boxes[sel.box][sel.index]; }
  function setSlotMon(sel, mon) {
    if (sel.kind === 'party') state.save.party[sel.index] = mon;
    else state.save.boxes[sel.box][sel.index] = mon;
  }

  function newMonFor(sel) {
    var s = state.save;
    return Pokemon.create({ isParty: sel.kind === 'party', species: 25, level: 5, otId: s.otId, otName: s.playerName, pokeball: 1, moves: [84, 45, 0, 0] }, D);
  }

  function openEditor(sel) {
    if (state.work && state.dirtyMon) applyEditor(true);
    state.selected = sel;
    var mon = slotMon(sel);
    state.isNew = !!mon.isEmptySlot;
    state.work = mon.isEmptySlot ? null : mon.clone();
    state.dirtyMon = false;
    renderParty(); renderBoxes();
    renderEditor();
    $('#mon-editor').hidden = false;
  }

  function closeEditor() {
    state.work = null; state.selected = null; state.dirtyMon = false;
    $('#mon-editor').hidden = true;
    if (state.save) { renderParty(); renderBoxes(); }
  }

  function where(sel) { return sel.kind === 'party' ? 'Party slot ' + (sel.index + 1) : (state.save.getBoxName(sel.box) || 'Box ' + (sel.box + 1)) + ', slot ' + (sel.index + 1); }

  function renderEditor() {
    var el = $('#mon-editor'), sel = state.selected;
    if (!state.work) {
      el.innerHTML = '<div class="me-head"><h2>' + esc(where(sel)) + '</h2><button class="btn btn-small" id="me-close">Close</button></div>' +
        '<p>This slot is empty.</p><div class="me-actions"><button class="btn btn-primary" id="me-create">Create Pokémon</button>' +
        (state.clipboard ? '<button class="btn" id="me-paste">Paste ' + esc(monSummary(state.clipboard).name) + '</button>' : '') + '</div>';
      bind('#me-close', 'click', closeEditor, el);
      bind('#me-create', 'click', function () { state.work = newMonFor(sel); state.dirtyMon = true; renderEditor(); }, el);
      bind('#me-paste', 'click', function () { pasteInto(sel); }, el);
      return;
    }
    var m = state.work, sp = D.species[m.species] || ['?', [0, 0, 0, 0, 0, 0], 0, [0, 0, 0], [0, 0], 0];
    var natures = D.natures.map(function (n, i) { return '<option value="' + i + '"' + (i === m.nature ? ' selected' : '') + '>' + esc(n) + natureHint(i) + '</option>'; }).join('');
    var abil = [0, 1, 2].map(function (i) {
      var a = sp[3][i]; var label = (i === 2 ? 'Hidden: ' : 'Slot ' + (i + 1) + ': ') + (a ? D.abilities[a] : '(none)');
      return '<option value="' + i + '"' + (i === m.abilityNum ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
    var balls = '';
    for (var b = 0; b < 32; b++) {
      var bn = b === 0 ? 'Strange Ball' : (D.items[b] && D.items[b][1] === 5 ? D.items[b][0] : null);
      if (bn || b === m.pokeball) balls += '<option value="' + b + '"' + (b === m.pokeball ? ' selected' : '') + '>' + esc(bn || 'Ball #' + b) + '</option>';
    }
    var ratio = sp[2], genderFixed = ratio === 0 || ratio === 254 || ratio === 255;
    var genderSel = genderFixed ? '<input disabled value="' + (ratio === 0 ? 'Always male' : ratio === 254 ? 'Always female' : 'Genderless') + '">' :
      '<select id="me-gender"><option value="0"' + (m.genderFlag ? '' : ' selected') + '>Male</option><option value="1"' + (m.genderFlag ? ' selected' : '') + '>Female</option></select>';

    var level = m.isParty ? m.level : m.levelFromExp();
    var html = '<div class="me-head"><h2>' + esc(where(sel)) + (state.isNew ? ' (new)' : '') + '</h2><button class="btn btn-small" id="me-close">Close</button></div>' +
      '<div class="form-grid">' +
      field('Species', '<input id="me-species" list="species-list" value="' + esc(refLabel(speciesName(m.species), m.species)) + '">') +
      field('Nickname', '<input id="me-nick" maxlength="10" value="' + esc(m.getNickname()) + '">') +
      field('Level', '<input id="me-level" type="number" min="1" max="100" value="' + level + '">', 'EXP ' + m.experience + ' (Rogue uses 300 EXP per level)') +
      field('Nature', '<select id="me-nature">' + natures + '</select>') +
      field('Ability', '<select id="me-ability">' + abil + '</select>') +
      field('Gender', genderSel) +
      field('Held item', '<input id="me-item" list="item-list" placeholder="None" value="' + (m.heldItem ? esc(refLabel(itemName(m.heldItem), m.heldItem)) : '') + '">') +
      field('Poké Ball', '<select id="me-ball">' + balls + '</select>') +
      field('Friendship', '<input id="me-friend" type="number" min="0" max="255" value="' + m.friendship + '">') +
      '</div>' +
      '<div class="inline" style="gap:18px;margin-top:12px;flex-wrap:wrap">' +
      '<label class="check"><input type="checkbox" id="me-shiny"' + (m.isShiny ? ' checked' : '') + '> Shiny</label>' +
      '<label class="check"><input type="checkbox" id="me-egg"' + (m.isEgg ? ' checked' : '') + '> Egg</label>' +
      '<label class="check"><input type="checkbox" id="me-gmax"' + (m.gigantamaxFactor ? ' checked' : '') + '> Gigantamax factor</label>' +
      '</div>' +
      '<div class="me-section">Stats</div>' + statTable(m) +
      '<div class="inline" style="margin-top:8px;gap:8px;flex-wrap:wrap"><button class="btn btn-small" id="me-maxiv">Max IVs</button><button class="btn btn-small" id="me-clearev">Clear EVs</button>' +
      (m.isParty ? '<button class="btn btn-small" id="me-heal">Heal (HP, PP, status)</button>' : '') + '</div>' +
      '<div class="me-section">Moves</div><div class="moves-grid">' +
      [0, 1, 2, 3].map(function (i) {
        var mv = m['move' + i];
        return field('Move ' + (i + 1), '<input list="move-list" data-move="' + i + '" placeholder="Empty" value="' + (mv ? esc(refLabel(moveName(mv), mv)) : '') + '">') +
          field('PP', '<input type="number" min="0" max="99" data-pp="' + i + '" value="' + m['pp' + i] + '">') +
          field('PP Ups', '<input type="number" min="0" max="3" data-ppup="' + i + '" value="' + m.ppUps(i) + '">');
      }).join('') + '</div>' +
      '<div class="me-section">Original trainer</div><div class="form-grid">' +
      field('OT name', '<input id="me-ot" maxlength="7" value="' + esc(m.getOtName()) + '">') +
      field('OT ID', '<input id="me-tid" type="number" min="0" max="65535" value="' + m.tid + '">') +
      field('OT secret ID', '<input id="me-sid" type="number" min="0" max="65535" value="' + m.sid + '">') +
      field('Met at level', '<input id="me-metlvl" type="number" min="0" max="100" value="' + m.metLevel + '">') +
      '</div>' +
      '<div class="me-actions"><button class="btn btn-primary" id="me-apply">Save to slot</button>' +
      '<button class="btn" id="me-copy">Copy</button>' +
      (state.clipboard ? '<button class="btn" id="me-paste">Paste here</button>' : '') +
      (state.isNew ? '' : '<button class="btn btn-danger" id="me-delete">Delete</button>') + '</div>' +
      '<p class="me-note">Stats are recalculated from base stats. If you play with rebalanced Pokémon stats on, the game corrects them the next time it recalculates (e.g. on level up).</p>';
    el.innerHTML = html;
    wireEditor(el);
  }

  function natureHint(n) {
    var up = Math.floor(n / 5), down = n % 5; if (up === down) return '';
    var names = ['Atk', 'Def', 'Spe', 'SpA', 'SpD'];
    return ' (+' + names[up] + ' −' + names[down] + ')';
  }

  function statTable(m) {
    var calc = m.calcStats(D) || [0, 0, 0, 0, 0, 0], ivs = m.getIVs(), evs = m.getEVs();
    var sp = D.species[m.species], base = sp ? sp[1] : [0, 0, 0, 0, 0, 0];
    var evTotal = evs.reduce(function (a, b) { return a + b; }, 0);
    var html = '<table class="stat-table"><thead><tr><th>Stat</th><th>Base</th><th>IV</th><th>EV</th><th class="calc">Value</th></tr></thead><tbody>';
    C.STAT_NAMES.forEach(function (n, i) {
      var mod = i ? C.natureModifier(m.nature, i) : 1;
      html += '<tr><td class="' + (mod > 1 ? 'stat-up' : mod < 1 ? 'stat-down' : '') + '">' + n + '</td><td>' + base[i] + '</td>' +
        '<td><input type="number" min="0" max="31" data-iv="' + i + '" value="' + ivs[i] + '" aria-label="' + n + ' IV"></td>' +
        '<td><input type="number" min="0" max="255" data-ev="' + i + '" value="' + evs[i] + '" aria-label="' + n + ' EV"></td>' +
        '<td class="calc">' + calc[i] + '</td></tr>';
    });
    html += '</tbody></table><p class="me-note">EV total ' + evTotal + ' / 510' + (m.isParty ? ' · Current HP ' + m.hp + ' / ' + m.maxHP : '') + '</p>';
    return html;
  }

  function wireEditor(el) {
    var m = state.work;
    function touch(rerender) {
      state.dirtyMon = true;
      if (m.isParty) m.recalcStats(false, D);
      if (rerender) { var y = el.scrollTop; renderEditor(); el.scrollTop = y; }
    }
    bind('#me-close', 'click', function () {
      if (state.dirtyMon && !confirm('Discard unsaved changes to this Pokémon?')) return;
      closeEditor();
    }, el);
    bind('#me-species', 'change', function (e) {
      var id = parseRef(e.target.value, D.species, 0);
      if (id <= 0 || !isValidSpecies(id)) { e.target.classList.add('invalid'); toast('Pick a species from the list'); return; }
      var oldDefault = speciesName(m.species).replace(/ \(.*\)$/, '').toUpperCase().slice(0, 10);
      var cur = m.getNickname();
      m.species = id; m.hasSpecies = 1;
      if (!cur || cur.toUpperCase() === oldDefault) m.setNickname(speciesName(id).replace(/ \(.*\)$/, '').toUpperCase().slice(0, 10));
      var r = D.species[id][2];
      if (r === 254) m.genderFlag = 1; else if (r === 0 || r === 255) m.genderFlag = 0;
      if (m.abilityNum && !D.species[id][3][m.abilityNum]) m.abilityNum = 0;
      touch(true);
    }, el);
    bind('#me-nick', 'input', function (e) { m.setNickname(e.target.value); e.target.classList.toggle('invalid', !C.canEncode(e.target.value)); touch(false); }, el);
    bind('#me-level', 'change', function (e) { m.setLevel(clamp(e.target.value, 1, 100)); touch(true); }, el);
    bind('#me-nature', 'change', function (e) { m.nature = +e.target.value; touch(true); }, el);
    bind('#me-ability', 'change', function (e) { m.abilityNum = +e.target.value; touch(false); }, el);
    bind('#me-gender', 'change', function (e) { m.genderFlag = +e.target.value; touch(false); }, el);
    bind('#me-item', 'change', function (e) {
      var id = parseRef(e.target.value, D.items, 0);
      if (id < 0) { e.target.classList.add('invalid'); toast('Pick an item from the list'); return; }
      e.target.classList.remove('invalid'); m.heldItem = id; touch(false);
    }, el);
    bind('#me-ball', 'change', function (e) { m.pokeball = +e.target.value; touch(false); }, el);
    bind('#me-friend', 'change', function (e) { m.friendship = clamp(e.target.value, 0, 255); touch(false); }, el);
    bind('#me-shiny', 'change', function (e) { m.isShiny = e.target.checked ? 1 : 0; touch(false); }, el);
    bind('#me-egg', 'change', function (e) { m.isEgg = e.target.checked ? 1 : 0; m.sanityIsEgg = m.isEgg; touch(false); }, el);
    bind('#me-gmax', 'change', function (e) { m.gigantamaxFactor = e.target.checked ? 1 : 0; touch(false); }, el);
    $all('[data-iv]', el).forEach(function (inp) {
      inp.addEventListener('change', function () { var a = m.getIVs(); a[+inp.dataset.iv] = clamp(inp.value, 0, 31); m.setIVs(a); touch(true); });
    });
    $all('[data-ev]', el).forEach(function (inp) {
      inp.addEventListener('change', function () { var a = m.getEVs(); a[+inp.dataset.ev] = clamp(inp.value, 0, 255); m.setEVs(a); touch(true); });
    });
    bind('#me-maxiv', 'click', function () { m.setIVs([31, 31, 31, 31, 31, 31]); touch(true); }, el);
    bind('#me-clearev', 'click', function () { m.setEVs([0, 0, 0, 0, 0, 0]); touch(true); }, el);
    bind('#me-heal', 'click', function () {
      m.recalcStats(true, D); m.status = 0;
      for (var i = 0; i < 4; i++) m['pp' + i] = maxPP(m['move' + i], m.ppUps(i));
      touch(true); toast('Healed');
    }, el);
    $all('[data-move]', el).forEach(function (inp) {
      inp.addEventListener('change', function () {
        var i = +inp.dataset.move, id = parseRef(inp.value, D.moves, 0);
        if (id < 0) { inp.classList.add('invalid'); toast('Pick a move from the list'); return; }
        m['move' + i] = id; m['pp' + i] = maxPP(id, m.ppUps(i)); touch(true);
      });
    });
    $all('[data-pp]', el).forEach(function (inp) {
      inp.addEventListener('change', function () { m['pp' + inp.dataset.pp] = clamp(inp.value, 0, 99); touch(false); });
    });
    $all('[data-ppup]', el).forEach(function (inp) {
      inp.addEventListener('change', function () { var i = +inp.dataset.ppup; m.setPPUps(i, clamp(inp.value, 0, 3)); m['pp' + i] = maxPP(m['move' + i], m.ppUps(i)); touch(true); });
    });
    bind('#me-ot', 'input', function (e) { m.setOtName(e.target.value); touch(false); }, el);
    bind('#me-tid', 'change', function (e) { m.tid = clamp(e.target.value, 0, 65535); touch(false); }, el);
    bind('#me-sid', 'change', function (e) { m.sid = clamp(e.target.value, 0, 65535); touch(false); }, el);
    bind('#me-metlvl', 'change', function (e) { m.metLevel = clamp(e.target.value, 0, 100); touch(false); }, el);
    bind('#me-apply', 'click', function () { applyEditor(false); }, el);
    bind('#me-copy', 'click', function () { state.clipboard = m.clone(); toast('Copied ' + monSummary(m).name); renderEditor(); }, el);
    bind('#me-paste', 'click', function () { pasteInto(state.selected); }, el);
    bind('#me-delete', 'click', function () {
      if (!confirm('Delete this Pokémon from the save?')) return;
      var sel = state.selected, empty = new Pokemon(null, sel.kind === 'party');
      empty.markEmpty();
      setSlotMon(sel, empty); markDirty(); closeEditor(); toast('Deleted');
    }, el);
  }

  function maxPP(move, ups) {
    if (!move || !D.moves[move]) return 0;
    var base = D.moves[move][1];
    return base + Math.floor(base * ups / 5);
  }

  function applyEditor(silent) {
    if (!state.work || !state.selected) return;
    var m = state.work;
    if (!m.species || !isValidSpecies(m.species)) { if (!silent) toast('Choose a valid species first'); return; }
    m.isEmptySlot = false; m.hasSpecies = 1; m.isBadEgg = 0;
    if (m.isParty) m.recalcStats(false, D);
    setSlotMon(state.selected, m.clone());
    state.isNew = false; state.dirtyMon = false;
    markDirty();
    renderParty(); renderBoxes();
    if (!silent) { renderEditor(); toast('Saved to ' + where(state.selected)); }
  }

  function pasteInto(sel) {
    if (!state.clipboard) return;
    var mon = state.clipboard.asParty(sel.kind === 'party');
    if (mon.isParty) mon.recalcStats(true, D);
    state.work = mon; state.dirtyMon = true;
    applyEditor(true);
    renderEditor();
    toast('Pasted into ' + where(sel));
  }

  // ---------------------------------------------------------------- init
  function init() {
    buildDatalists();
    $('#file-input').addEventListener('change', function (e) { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ''; });
    $('#download-btn').addEventListener('click', download);
    $all('.tabs button').forEach(function (b) { b.addEventListener('click', function () { selectTab(b.dataset.tab); }); });
    var dz = document.body;
    dz.addEventListener('dragover', function (e) { e.preventDefault(); $('#dropzone').classList.add('drag'); });
    dz.addEventListener('dragleave', function () { $('#dropzone').classList.remove('drag'); });
    dz.addEventListener('drop', function (e) {
      e.preventDefault(); $('#dropzone').classList.remove('drag');
      if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#mon-editor').hidden && !state.dirtyMon) closeEditor(); });
    window.addEventListener('beforeunload', function (e) { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
  }
  init();
})();
