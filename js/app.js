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

  function renderAll() { renderTrainer(); renderParty(); renderBoxes(); renderBag(); renderPcItems(); renderUnlocks(); renderAdvanced(); }

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
    html += '</div></div>' +
      '<h3 class="me-section">Fill boxes</h3>' +
      '<p class="hint">Puts one Pokémon of each species into empty slots, in Pokédex order, starting from the species you choose. Existing Pokémon are left alone.</p>' +
      '<div class="add-row"><input id="fill-start" list="species-list" placeholder="Start from (default: Bulbasaur)" aria-label="Start species">' +
      '<input id="fill-level" type="number" min="1" max="100" value="5" aria-label="Level" title="Level">' +
      '<label class="check"><input type="checkbox" id="fill-forms"> Include alternate forms</label>' +
      '<label class="check"><input type="checkbox" id="fill-shiny"> Shiny</label></div>' +
      '<div class="add-row"><button class="btn btn-primary" id="fill-box">Fill this box</button>' +
      '<button class="btn" id="fill-all">Fill all boxes</button>' +
      '<button class="btn btn-danger" id="clear-box">Empty this box</button></div>';
    p.innerHTML = html;
    bind('#fill-box', 'click', function () { fillBoxes([bi]); }, p);
    bind('#fill-all', 'click', function () { fillBoxes(s.boxes.map(function (_, i) { return i; })); }, p);
    bind('#clear-box', 'click', function () {
      if (!confirm('Remove every Pokémon from ' + (s.getBoxName(bi) || 'this box') + '?')) return;
      s.boxes[bi] = s.boxes[bi].map(function () { var e = new Pokemon(null, false); e.markEmpty(); return e; });
      markDirty(); closeEditor(); renderBoxes(); toast('Box emptied');
    }, p);
    bind('#box-select', 'change', function (e) { state.box = +e.target.value; renderBoxes(); }, p);
    bind('#box-prev', 'click', function () { state.box = (bi + s.boxes.length - 1) % s.boxes.length; renderBoxes(); }, p);
    bind('#box-next', 'click', function () { state.box = (bi + 1) % s.boxes.length; renderBoxes(); }, p);
    bind('#box-name', 'change', function (e) { s.setBoxName(bi, e.target.value); markDirty(); renderBoxes(); }, p);
    $all('[data-slot]', p).forEach(function (b) {
      b.addEventListener('click', function () { openEditor({ kind: 'box', box: bi, index: +b.dataset.slot }); });
    });
  }

  function isBaseForm(id) { return isValidSpecies(id) && !/\(/.test(D.species[id][0]); }

  function fillBoxes(boxIndexes) {
    var s = state.save, p = $('#pane-boxes');
    var start = $('#fill-start', p).value.trim() ? parseRef($('#fill-start', p).value, D.species, 0) : 1;
    if (start <= 0 || !isValidSpecies(start)) { toast('Pick a start species from the list'); return; }
    var level = clamp($('#fill-level', p).value, 1, 100);
    var forms = $('#fill-forms', p).checked, shiny = $('#fill-shiny', p).checked;
    var sp = start, placed = 0, lastSpecies = 0;
    boxIndexes.forEach(function (bx) {
      for (var slot = 0; slot < s.boxes[bx].length; slot++) {
        if (!s.boxes[bx][slot].isEmptySlot) continue;
        while (sp < D.species.length && !(forms ? isValidSpecies(sp) : isBaseForm(sp))) sp++;
        if (sp >= D.species.length) return;
        var mon = Pokemon.create({ species: sp, level: level, otId: s.otId, otName: s.playerName, pokeball: 1, moves: [33, 0, 0, 0] }, D);
        if (shiny) mon.isShiny = 1;
        var r = D.species[sp][2]; mon.genderFlag = r === 254 ? 1 : (r === 0 || r === 255 ? 0 : (mon.personality & 1));
        s.boxes[bx][slot] = mon; placed++; lastSpecies = sp; sp++;
      }
    });
    markDirty(); renderBoxes();
    toast(placed ? 'Added ' + placed + ' Pokémon (up to ' + speciesName(lastSpecies) + '). Fill again from #' + sp + ' after making room.' : 'No empty slots or no species left');
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

  function isGivableItem(id) {
    var it = D.items[id];
    return !!(it && it[0] && it[0] !== '????????' && it[1] > 0);
  }

  function renderBag() {
    var s = state.save, p = $('#pane-bag'), list = s.getBag(), cap = s.bagSlotCapacity();
    var pocketOpts = D.pockets.map(function (n, i) { return i ? '<option value="' + i + '">' + esc(n) + '</option>' : ''; }).join('');
    p.innerHTML = '<h2>Bag</h2><p class="lede">Items are grouped by pocket automatically, the way the game expects. ' +
      'Using ' + list.length + ' of ' + cap + ' slots (the game\'s maximum is 450).</p>' +
      '<div class="tool-box"><h3 class="me-section">Bulk tools</h3>' +
      '<div class="add-row"><select id="bulk-pocket" aria-label="Pocket"><option value="all">Every pocket</option>' + pocketOpts + '</select>' +
      '<input type="number" id="bulk-qty" min="1" max="999" value="99" aria-label="Quantity">' +
      '<button class="btn btn-primary" id="bulk-add">Add all items</button></div>' +
      '<div class="add-row"><button class="btn" id="bulk-max">Set every quantity to 999</button>' +
      '<button class="btn" id="bulk-cap"' + (s.bagCapacityUpgrades >= C.SaveFile.MAX_BAG_UPGRADES ? ' disabled' : '') + '>Max out bag size (450 slots)</button>' +
      '<button class="btn btn-danger" id="bulk-clear">Empty the bag</button></div>' +
      '<p class="hint">There are more items than bag slots, so "Every pocket" stops when the bag is full. Some items exist in the data but are unused in Emerald Rogue.</p></div>' +
      itemTable(list, { grouped: true, max: 999 });
    function commit(l) {
      try { s.setBag(l, itemPocket); } catch (e) { toast(e.message); return false; }
      markDirty(); renderBag(); return true;
    }
    bind('#bulk-add', 'click', function () {
      var pocket = $('#bulk-pocket', p).value, qty = clamp($('#bulk-qty', p).value, 1, 999);
      var have = {}, added = 0, skipped = 0;
      list.forEach(function (e) { have[e.item] = e; });
      for (var id = 1; id < D.items.length; id++) {
        if (!isGivableItem(id) || (pocket !== 'all' && itemPocket(id) !== +pocket)) continue;
        if (have[id]) { have[id].quantity = Math.max(have[id].quantity, qty); continue; }
        if (list.length >= s.bagSlotCapacity()) { skipped++; continue; }
        list.push({ item: id, quantity: qty }); added++;
      }
      if (commit(list)) toast('Added ' + added + ' items' + (skipped ? '; ' + skipped + ' did not fit' : ''));
    }, p);
    bind('#bulk-max', 'click', function () { list.forEach(function (e) { e.quantity = 999; }); if (commit(list)) toast('All quantities set to 999'); }, p);
    bind('#bulk-cap', 'click', function () { s.bagCapacityUpgrades = C.SaveFile.MAX_BAG_UPGRADES; markDirty(); renderBag(); toast('Bag size maxed'); }, p);
    bind('#bulk-clear', 'click', function () { if (confirm('Remove every item from the bag?') && commit([])) toast('Bag emptied'); }, p);
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

  // ---------------------------------------------------------------- unlocks
  var QUEST_STATUS = [['locked', 'Locked'], ['unlocked', 'Unlocked'], ['ready', 'Complete, rewards to collect'], ['claimed', 'Complete, rewards collected']];
  var DIFFICULTIES = ['Easy', 'Average', 'Hard', 'Brutal'];

  function renderUnlocks() {
    var s = state.save, p = $('#pane-unlocks'), rb = s.rogueBlock();
    if (!rb) {
      p.innerHTML = '<h2>Unlocks</h2><p class="lede">This save\'s Rogue data doesn\'t match the layout this editor knows (Emerald Rogue EX 2.1.x), so quests, hub upgrades and masteries are not editable. The Pokédex tools below still work.</p>' + dexSection();
      wireDex(p); return;
    }
    var nameOk = s.questCount() === D.quests.length;
    var counts = { locked: 0, unlocked: 0, ready: 0, claimed: 0 };
    for (var q = 0; q < s.questCount(); q++) counts[s.getQuestStatus(q)]++;
    var diffOpts = DIFFICULTIES.map(function (d, i) { return '<option value="' + i + '"' + (i === 3 ? ' selected' : '') + '>' + d + '</option>'; }).join('');

    var html = '<h2>Unlocks</h2><p class="lede">Quests, the Pokédex, hub upgrades and Pokémon masteries. ' +
      'Completed quests are best left as "rewards to collect": the game then hands out their rewards (money, building supplies, new quests and features) when you visit the quest board.</p>' +

      '<h3 class="me-section">Quests</h3>' +
      '<p class="hint">' + counts.claimed + ' collected · ' + counts.ready + ' ready to collect · ' + counts.unlocked + ' in progress · ' + counts.locked + ' locked</p>' +
      '<div class="add-row"><label class="inline"><span class="hint">Reward difficulty</span><select id="q-diff">' + diffOpts + '</select></label>' +
      '<button class="btn btn-primary" id="q-complete">Complete all quests</button>' +
      '<button class="btn" id="q-unlock">Unlock all quests</button>' +
      '<button class="btn btn-danger" id="q-reset">Reset all quests</button></div>' +
      '<div class="add-row"><select id="q-filter" aria-label="Show"><option value="">All categories</option><option>Main</option><option>Challenge</option><option>Mastery</option></select>' +
      '<input id="q-search" placeholder="Search quests…" aria-label="Search quests"></div>' +
      '<div class="scroll-table"><table class="item-table" id="q-table"><thead><tr><th>Quest</th><th>Type</th><th>Status</th></tr></thead><tbody></tbody></table></div>' +

      dexSection() +

      '<h3 class="me-section">Hub upgrades</h3>' +
      '<p class="hint">Upgrades only work in areas you have built; areas are placed on the hub map in game, so they can\'t be added here. "Unlock all" respects each upgrade\'s requirements. Some (like the Unique Lab) come from quest rewards.</p>' +
      '<div class="add-row"><button class="btn btn-primary" id="hub-all">Unlock all upgrades in built areas</button>' +
      '<button class="btn btn-danger" id="hub-none">Remove all upgrades</button></div>' +
      '<div class="check-grid">' + D.hubAreas.map(function (area, ai) {
        var built = s.hasHubArea(ai);
        var ups = D.hubUpgrades.map(function (u, ui) { return [u, ui]; }).filter(function (x) { return x[0] && x[0][1] === ai && !x[0][3]; });
        return '<div class="check-group"><strong>' + esc(area || 'Area ' + ai) + '</strong> <span class="hint">' + (built ? 'built' : 'not built') + '</span>' +
          (ups.length ? ups.map(function (x) {
            return '<label class="check"><input type="checkbox" data-upgrade="' + x[1] + '"' + (s.hasHubUpgrade(x[1]) ? ' checked' : '') + (built ? '' : ' disabled') + '> ' + esc(x[0][0]) + '</label>';
          }).join('') : '<span class="hint">No upgrades</span>') + '</div>';
      }).join('') + '</div>' +

      '<h3 class="me-section">Pokémon masteries</h3>' +
      '<p class="hint">' + s.masteryCount() + ' mastery flags set. Mastery quests above track the same thing; complete those to get their rewards.</p>' +
      '<div class="add-row"><button class="btn btn-primary" id="m-all">Master every Pokémon</button><button class="btn btn-danger" id="m-none">Clear masteries</button></div>';
    p.innerHTML = html;

    var tbody = $('#q-table tbody', p), filter = $('#q-filter', p), search = $('#q-search', p);
    function drawQuests() {
      var f = filter.value, term = search.value.trim().toLowerCase(), rows = [];
      for (var i = 0; i < s.questCount(); i++) {
        var meta = nameOk ? D.quests[i] : ['Quest #' + i, '?'];
        if (f && meta[1] !== f) continue;
        if (term && meta[0].toLowerCase().indexOf(term) < 0) continue;
        var st = s.getQuestStatus(i);
        rows.push('<tr><td>' + esc(meta[0]) + '</td><td class="hint">' + esc(meta[1]) + '</td><td><select data-quest="' + i + '" aria-label="Status of ' + esc(meta[0]) + '">' +
          QUEST_STATUS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === st ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></td></tr>');
      }
      tbody.innerHTML = rows.join('') || '<tr><td colspan="3" class="hint">No quests match.</td></tr>';
      $all('[data-quest]', tbody).forEach(function (sel) {
        sel.addEventListener('change', function () { s.setQuestStatus(+sel.dataset.quest, sel.value, +$('#q-diff', p).value); markDirty(); });
      });
    }
    filter.addEventListener('change', drawQuests);
    search.addEventListener('input', drawQuests);
    drawQuests();

    function allQuests(status, msg) {
      var d = +$('#q-diff', p).value;
      for (var i = 0; i < s.questCount(); i++) {
        var cur = s.getQuestStatus(i);
        if (status === 'unlocked' && cur !== 'locked') continue; // don't undo progress
        if (status === 'ready' && cur === 'claimed' && s.getQuest(i).completeDifficulty >= d) continue;
        s.setQuestStatus(i, status, d);
      }
      markDirty(); renderUnlocks(); toast(msg);
    }
    bind('#q-complete', 'click', function () { allQuests('ready', 'All quests complete. Collect the rewards at the quest board in game.'); }, p);
    bind('#q-unlock', 'click', function () { allQuests('unlocked', 'All quests unlocked'); }, p);
    bind('#q-reset', 'click', function () { if (confirm('Reset every quest to locked? The game re-unlocks the starting quests on load.')) allQuests('locked', 'Quests reset'); }, p);

    $all('[data-upgrade]', p).forEach(function (cb) {
      cb.addEventListener('change', function () { s.setHubUpgrade(+cb.dataset.upgrade, cb.checked); markDirty(); });
    });
    bind('#hub-all', 'click', function () {
      // Repeat until nothing changes so chains of required upgrades unlock in order.
      // Hidden upgrades are granted by quests, so they are never set here.
      var n = 0, changed = true;
      while (changed) {
        changed = false;
        D.hubUpgrades.forEach(function (u, i) {
          if (!u || u[3] || !s.hasHubArea(u[1]) || s.hasHubUpgrade(i)) return;
          if (!u[2].every(function (r) { return s.hasHubUpgrade(r); })) return;
          s.setHubUpgrade(i, true); n++; changed = true;
        });
      }
      markDirty(); renderUnlocks(); toast(n + ' upgrades unlocked');
    }, p);
    bind('#hub-none', 'click', function () {
      if (!confirm('Remove every hub upgrade?')) return;
      D.hubUpgrades.forEach(function (u, i) { if (u && !u[3]) s.setHubUpgrade(i, false); });
      markDirty(); renderUnlocks(); toast('Upgrades removed');
    }, p);
    bind('#m-all', 'click', function () { s.setAllMastery(true); markDirty(); renderUnlocks(); toast('Every Pokémon mastered'); }, p);
    bind('#m-none', 'click', function () { if (confirm('Clear all mastery flags?')) { s.setAllMastery(false); markDirty(); renderUnlocks(); toast('Masteries cleared'); } }, p);
    wireDex(p);
  }

  function dexCounts() {
    var s = state.save, c = [0, 0, 0, 0], total = 0;
    for (var i = 1; i < D.species.length; i++) if (isValidSpecies(i)) { total++; c[s.getDexState(i)]++; }
    return { seen: c[1] + c[2] + c[3], caught: c[2] + c[3], shiny: c[3], total: total };
  }

  function dexSection() {
    var c = dexCounts();
    return '<h3 class="me-section">Pokédex</h3>' +
      '<p class="hint">' + c.seen + ' seen · ' + c.caught + ' caught · ' + c.shiny + ' caught shiny, out of ' + c.total + ' species and forms.</p>' +
      '<div class="add-row"><button class="btn btn-primary" data-dex="2">Mark all caught</button>' +
      '<button class="btn" data-dex="3">Mark all caught shiny</button>' +
      '<button class="btn" data-dex="1">Mark all seen</button>' +
      '<button class="btn btn-danger" data-dex="0">Clear Pokédex</button></div>';
  }

  function wireDex(p) {
    $all('[data-dex]', p).forEach(function (b) {
      b.addEventListener('click', function () {
        var st = +b.dataset.dex, s = state.save;
        if (st === 0 && !confirm('Clear every Pokédex entry?')) return;
        for (var i = 1; i < D.species.length; i++) {
          if (!isValidSpecies(i)) continue;
          if (st === 0 || s.getDexState(i) < st) s.setDexState(i, st);
        }
        markDirty(); renderUnlocks(); toast('Pokédex updated');
      });
    });
  }

  // ---------------------------------------------------------------- advanced
  function renderAdvanced() {
    var s = state.save, p = $('#pane-advanced');
    p.innerHTML = '<h2>Flags &amp; Vars</h2><p class="lede">Every named story flag and variable from the Emerald Rogue source. ' +
      'Many are leftovers from Pokémon Emerald and do nothing in Rogue; others control game state, so change only what you understand. ' +
      'Useful ones include the <code>SYS_RIDING_*</code> flags (riding abilities) and <code>BADGE*_GET</code>.</p>' +
      '<h3 class="me-section">Flags</h3>' +
      '<div class="add-row"><input id="f-search" placeholder="Search flags, e.g. SYS_RIDING" aria-label="Search flags">' +
      '<label class="check"><input type="checkbox" id="f-onlyset"> Only set flags</label></div>' +
      '<div class="scroll-table"><table class="item-table"><thead><tr><th>Flag</th><th>ID</th><th>Set</th></tr></thead><tbody id="f-body"></tbody></table></div>' +
      '<p class="hint" id="f-more"></p>' +
      '<h3 class="me-section">Variables</h3>' +
      '<div class="add-row"><input id="v-search" placeholder="Search variables" aria-label="Search variables"></div>' +
      '<div class="scroll-table"><table class="item-table"><thead><tr><th>Variable</th><th>ID</th><th>Value</th></tr></thead><tbody id="v-body"></tbody></table></div>';
    var LIMIT = 200;
    function drawFlags() {
      var term = $('#f-search', p).value.trim().toUpperCase(), onlySet = $('#f-onlyset', p).checked, rows = [], hits = 0;
      D.flags.forEach(function (f) {
        if (term && f[1].indexOf(term) < 0 && String(f[0]) !== term && '0X' + f[0].toString(16).toUpperCase() !== term) return;
        var on = s.getFlag(f[0]);
        if (onlySet && !on) return;
        if (++hits > LIMIT) return;
        rows.push('<tr><td>' + esc(f[1]) + '</td><td class="hint">0x' + f[0].toString(16).toUpperCase() + '</td><td><input type="checkbox" data-flag="' + f[0] + '"' + (on ? ' checked' : '') + ' aria-label="' + esc(f[1]) + '"></td></tr>');
      });
      $('#f-body', p).innerHTML = rows.join('') || '<tr><td colspan="3" class="hint">No flags match.</td></tr>';
      $('#f-more', p).textContent = hits > LIMIT ? 'Showing ' + LIMIT + ' of ' + hits + ' matches. Search to narrow it down.' : '';
      $all('[data-flag]', p).forEach(function (cb) { cb.addEventListener('change', function () { s.setFlag(+cb.dataset.flag, cb.checked); markDirty(); }); });
    }
    function drawVars() {
      var term = $('#v-search', p).value.trim().toUpperCase(), rows = [];
      D.vars.forEach(function (v) {
        if (term && v[1].indexOf(term) < 0) return;
        rows.push('<tr><td>' + esc(v[1]) + '</td><td class="hint">0x' + (0x4000 + v[0]).toString(16).toUpperCase() + '</td><td class="num"><input type="number" min="0" max="65535" data-var="' + v[0] + '" value="' + s.getVar(v[0]) + '" aria-label="' + esc(v[1]) + '"></td></tr>');
      });
      $('#v-body', p).innerHTML = rows.join('');
      $all('[data-var]', p).forEach(function (inp) { inp.addEventListener('change', function () { s.setVar(+inp.dataset.var, clamp(inp.value, 0, 65535)); inp.value = s.getVar(+inp.dataset.var); markDirty(); }); });
    }
    $('#f-search', p).addEventListener('input', drawFlags);
    $('#f-onlyset', p).addEventListener('change', drawFlags);
    $('#v-search', p).addEventListener('input', drawVars);
    drawFlags(); drawVars();
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
