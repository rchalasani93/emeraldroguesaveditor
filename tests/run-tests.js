#!/usr/bin/env node
/* Dependency-free tests: `node tests/run-tests.js` */
'use strict';
var fs = require('fs');
var path = require('path');
var C = require('../js/core.js');
var D = require('../js/data.js');

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'expected equal') + ': ' + a + ' !== ' + b); }

// Builds a minimal, valid Emerald Rogue save (slot 1 = physical sectors 0-13).
function makeSave(counter) {
  var bytes = new Uint8Array(0x20000).fill(0xFF);
  for (var id = 0; id < 14; id++) {
    var off = id * 0x1000;
    bytes.fill(0, off, off + 0xFF4);
    if (id === 1) bytes[off + 0x234] = 0; // party count
    if (id === 10) {
      // Rogue header lives at storage offset 0x5DC4 => sector 10 (storage chunk 5), offset 0x5DC4 - 5*0xFF4
      var o = off + (0x5DC4 - 5 * 0xFF4);
      bytes[o] = 6; bytes[o + 1] = 0; bytes[o + 2] = 2; bytes[o + 3] = 27615 & 0xFF; bytes[o + 4] = 27615 >> 8;
      bytes[o + 5] = 1; bytes[o + 6] = 1574 & 0xFF; bytes[o + 7] = 1574 >> 8;
    }
    bytes[off + 0xFF4] = id; bytes[off + 0xFF5] = 0;
    var sig = 0x08012025; for (var k = 0; k < 4; k++) bytes[off + 0xFF8 + k] = (sig >>> (8 * k)) & 0xFF;
    for (k = 0; k < 4; k++) bytes[off + 0xFFC + k] = (counter >>> (8 * k)) & 0xFF;
    var chk = C.sectorChecksum(bytes, off);
    bytes[off + 0xFF6] = chk & 0xFF; bytes[off + 0xFF7] = chk >> 8;
  }
  // Party slots hold MAIL_NONE when empty
  for (var i = 0; i < 6; i++) bytes[0x1000 + 0x238 + i * 104 + 85] = 0xFF;
  var c1 = C.sectorChecksum(bytes, 0x1000); bytes[0x1FF6] = c1 & 0xFF; bytes[0x1FF7] = c1 >> 8;
  return bytes;
}

console.log('Emerald Rogue save editor tests');

test('Pokemon bit layout matches the game\'s C struct (tools/datagen/layout.c)', function () {
  var hex = fs.readFileSync(path.join(__dirname, 'fixture-pokemon-plain.hex'), 'utf8').trim();
  var ref = Buffer.from(hex, 'hex');
  var p = new C.Pokemon(null, true); p.data.set(ref);
  var expect = { personality: 0x12345678, otId: 0xA1B2C3D4, language: 2, hiddenNatureModifier: 13, hasSpecies: 1, markings: 5,
    species: 1234, heldItem: 2024, teraType: 17, experience: 29999, ppBonuses: 0xE4, friendship: 222, pokeball: 26,
    move0: 800, move1: 1, move2: 500, move3: 848, pp0: 5, pp1: 35, pp2: 10, pp3: 64, hpEV: 252, atkEV: 4, speEV: 252,
    spaEV: 1, spdEV: 2, sheen: 9, pokerus: 0x11, metLocation: 77, metLevel: 99, metGame: 3, otGender: 1,
    hpIV: 31, atkIV: 1, defIV: 30, speIV: 2, spaIV: 29, spdIV: 3, isEgg: 1, gigantamaxFactor: 1, isShiny: 5, genderFlag: 1,
    tutorMoveLvl: 3, abilityNum: 2, fatefulEncounter: 1, status: 7, level: 88, mail: 0xFF, hp: 300, maxHP: 301,
    attack: 302, defense: 303, speed: 304, spAttack: 305, spDefense: 306 };
  Object.keys(expect).forEach(function (k) { eq(p[k], expect[k], k); });
  var q = new C.Pokemon(null, true);
  Object.keys(expect).forEach(function (k) { q[k] = expect[k]; });
  eq(Buffer.compare(Buffer.from(q.data), ref), 0, 'setters produce identical bytes');
});

test('encrypt/decrypt round trip keeps data and checksum', function () {
  for (var n = 0; n < 48; n++) {
    var p = C.Pokemon.create({ isParty: n % 2 === 0, species: 1 + n * 7, level: 1 + n, otId: 0xDEADBEEF, otName: 'TEST', personality: n * 0x01010101 + n }, D);
    var r = new C.Pokemon(p.toRaw(), p.isParty);
    eq(r.checksumValid, true, 'checksum');
    eq(r.species, p.species, 'species');
    eq(r.levelFromExp(), 1 + n, 'level');
    eq(r.getOtName(), 'TEST', 'ot name');
  }
});

test('text encoding round trip', function () {
  var b = new Uint8Array(16); b.fill(0);
  var s = 'Poké-Hub!';
  var enc = C.encodeString(s, 16); b.set(enc); b[enc.length] = 0xFF;
  eq(C.decodeString(b, 0, 16), s);
});

test('nature is stored through hiddenNatureModifier', function () {
  var p = C.Pokemon.create({ species: 25, level: 5, otId: 1, personality: 7 }, D);
  for (var nat = 0; nat < 25; nat++) { p.nature = nat; eq(p.nature, nat); }
});

test('Rogue exp curve: 300 EXP per level', function () {
  var p = C.Pokemon.create({ species: 25, level: 37, otId: 1 }, D);
  eq(p.experience, 11100); eq(p.levelFromExp(), 37);
  p.experience = 11399; eq(p.levelFromExp(), 37);
  p.experience = 11400; eq(p.levelFromExp(), 38);
});

test('stat calculation (Rayquaza Lv50, 31 IVs, Hardy)', function () {
  var p = C.Pokemon.create({ isParty: true, species: 384, level: 50, otId: 1, personality: 0, nature: 0 }, D);
  eq(p.maxHP, 180); eq(p.attack, 170); eq(p.defense, 110); eq(p.speed, 115); eq(p.spAttack, 170); eq(p.spDefense, 110);
});

test('empty save: parse, no-op export is byte-identical', function () {
  var bytes = makeSave(5);
  var s = new C.SaveFile(bytes);
  eq(s.warnings.length, 0, 'warnings: ' + s.warnings.join(';'));
  eq(s.rogue.numSpecies, 1574);
  var out = s.export();
  eq(Buffer.compare(Buffer.from(out), Buffer.from(bytes)), 0);
});

test('edit trainer, party, box, bag and PC items then re-read', function () {
  var s = new C.SaveFile(makeSave(9));
  s.playerName = 'MAY'; s.tid = 12345; s.sid = 54321; s.money = 777777; s.playHours = 12;
  s.party[2] = C.Pokemon.create({ isParty: true, species: 6, level: 36, otId: s.otId, otName: 'MAY', moves: [52, 0, 0, 0] }, D);
  s.boxes[3][29] = C.Pokemon.create({ species: 150, level: 70, otId: s.otId, otName: 'MAY' }, D);
  s.setBag([{ item: 1, quantity: 5 }, { item: 39, quantity: 2 }, { item: 68, quantity: 9 }], function (id) { return D.items[id][1]; });
  s.setPcItems([{ item: 39, quantity: 1 }]);
  s.setBoxName(3, 'LEGENDS');
  var t = new C.SaveFile(s.export());
  eq(t.playerName, 'MAY'); eq(t.tid, 12345); eq(t.sid, 54321); eq(t.money, 777777); eq(t.playHours, 12);
  eq(t.partyCount, 1, 'party compacted');
  eq(t.party[0].species, 6); eq(t.party[0].level, 36); eq(t.party[0].mail, 0xFF); eq(t.party[0].checksumValid, true);
  eq(t.party[1].isEmptySlot, true);
  eq(t.boxes[3][29].species, 150); eq(t.boxes[3][29].levelFromExp(), 70);
  eq(t.getBoxName(3), 'LEGENDS');
  var bag = t.getBag();
  eq(bag.length, 3);
  for (var i = 1; i < bag.length; i++) if (D.items[bag[i].item][1] < D.items[bag[i - 1].item][1]) throw new Error('bag not sorted by pocket');
  eq(t.getPcItems()[0].quantity, 1);
  for (var sec = 0; sec < 14; sec++) {
    var o = sec * 0x1000; var stored = t.bytes[o + 0xFF6] | (t.bytes[o + 0xFF7] << 8);
    eq(C.sectorChecksum(t.bytes, o), stored, 'sector ' + sec + ' checksum');
  }
});

test('newest slot is chosen when both slots are valid', function () {
  var a = makeSave(3), b = makeSave(4);
  var both = new Uint8Array(0x20000); both.set(a.subarray(0, 0xE000), 0); both.set(b.subarray(0, 0xE000), 0xE000);
  both.fill(0xFF, 0x1C000);
  var s = new C.SaveFile(both);
  eq(s.slot.slot, 1); eq(s.slot.counter, 4);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
