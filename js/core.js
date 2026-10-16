/*
 * Emerald Rogue (EX) save file core library.
 *
 * Works in the browser (window.ERCore) and in Node (require('./core.js')).
 *
 * Layout notes (derived from the pokeemerald-rogue "expansion" branch, compiled
 * with arm-none-eabi-gcc -mabi=apcs-gnu, and verified against a real save):
 *   - 32 flash sectors of 0x1000 bytes, two save slots of 14 sectors each.
 *   - Rogue increases SECTOR_DATA_SIZE to 0xFF4 (vanilla is 0xF80) and shrinks
 *     the footer to 12 bytes: id u16 @0xFF4, checksum u16 @0xFF6,
 *     signature u32 @0xFF8 (0x08012025), counter u32 @0xFFC.
 *   - Sector 0 = SaveBlock2, 1-4 = SaveBlock1, 5-13 = PokemonStorage. Each
 *     sector holds 0xFF4 contiguous bytes of its block.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ERCore = factory();
})(this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  var SECTOR_SIZE = 0x1000;
  var SECTOR_DATA_SIZE = 0xFF4;
  var SECTOR_SIGNATURE = 0x08012025;
  var SECTORS_PER_SLOT = 14;
  var MIN_SAVE_SIZE = SECTOR_SIZE * SECTORS_PER_SLOT * 2; // 0x1C000

  var OFF = {
    sb2: {
      playerName: 0x00, // 7 chars + terminator
      playerGender: 0x08,
      trainerId: 0x0A, // u16 TID + u16 SID
      playHours: 0x0E,
      playMinutes: 0x10,
      playSeconds: 0x11,
      playFrames: 0x12,
      encryptionKey: 0x4C,
      hubName: 0xEE4, // 15 chars + terminator
      hubNameLength: 16
    },
    sb1: {
      partyCount: 0x234,
      party: 0x238,
      money: 0x4A8,
      bagSortMode: 0x4AC,
      bagCapacityUpgrades: 0x4AD,
      pcItems: 0x4B0,
      pcItemCount: 50,
      bag: 0x578,
      bagCount: 450,
      flags: 0x14D0,
      flagBytes: 300,
      vars: 0x15FC,
      varCount: 256
    },
    storage: {
      currentBox: 0x00,
      boxes: 0x04,
      boxCount: 10, // TOTAL_BOXES_COUNT (boxes 10-13 hold the Rogue save block)
      perBox: 30,
      boxNames: 0x8344,
      boxNameLength: 9,
      wallpapers: 0x83C2,
      rogueBlock: 0x04 + 10 * 30 * 80 // = 0x5DC4
    }
  };

  var PARTY_SIZE = 6;
  var BOX_MON_SIZE = 80;
  var PARTY_MON_SIZE = 104;
  var ROGUE_SECRET_ID = 27615;
  var EXPECTED_NUM_SPECIES = 1574; // Emerald Rogue EX

  // ---------------------------------------------------------------------------
  // Text encoding (Gen 3 western character map, as used by Emerald Rogue)
  // ---------------------------------------------------------------------------
  var CHARMAP = {
    0x00: ' ', 0x01: 'À', 0x02: 'Á', 0x03: 'Â', 0x04: 'Ç', 0x05: 'È', 0x06: 'É', 0x07: 'Ê', 0x08: 'Ë',
    0x09: 'Ì', 0x0B: 'Î', 0x0C: 'Ï', 0x0D: 'Ò', 0x0E: 'Ó', 0x0F: 'Ô', 0x10: 'Œ', 0x11: 'Ù', 0x12: 'Ú',
    0x13: 'Û', 0x14: 'Ñ', 0x15: 'ß', 0x16: 'à', 0x17: 'á', 0x19: 'ç', 0x1A: 'è', 0x1B: 'é', 0x1C: 'ê',
    0x1D: 'ë', 0x1E: 'ì', 0x20: 'î', 0x21: 'ï', 0x22: 'ò', 0x23: 'ó', 0x24: 'ô', 0x25: 'œ', 0x26: 'ù',
    0x27: 'ú', 0x28: 'û', 0x29: 'ñ', 0x2A: 'º', 0x2B: 'ª', 0x2D: '&', 0x2E: '+', 0x35: '=', 0x36: ';',
    0x51: '¿', 0x52: '¡', 0x5A: 'Í', 0x5B: '%', 0x5C: '(', 0x5D: ')', 0x68: 'â', 0x6F: 'í', 0x85: '<',
    0x86: '>', 0xA1: '0', 0xA2: '1', 0xA3: '2', 0xA4: '3', 0xA5: '4', 0xA6: '5', 0xA7: '6', 0xA8: '7',
    0xA9: '8', 0xAA: '9', 0xAB: '!', 0xAC: '?', 0xAD: '.', 0xAE: '-', 0xAF: '·', 0xB0: '…', 0xB1: '“',
    0xB2: '”', 0xB3: '‘', 0xB4: '’', 0xB5: '♂', 0xB6: '♀', 0xB7: '¥', 0xB8: ',', 0xB9: '×', 0xBA: '/',
    0xEF: '▶', 0xF0: ':', 0xF1: 'Ä', 0xF2: 'Ö', 0xF3: 'Ü', 0xF4: 'ä', 0xF5: 'ö', 0xF6: 'ü'
  };
  (function () {
    var i;
    for (i = 0; i < 26; i++) {
      CHARMAP[0xBB + i] = String.fromCharCode(65 + i);
      CHARMAP[0xD5 + i] = String.fromCharCode(97 + i);
    }
  })();
  var REVERSE_CHARMAP = {};
  Object.keys(CHARMAP).forEach(function (k) {
    var ch = CHARMAP[k];
    if (!(ch in REVERSE_CHARMAP)) REVERSE_CHARMAP[ch] = +k;
  });
  REVERSE_CHARMAP["'"] = 0xB4;
  REVERSE_CHARMAP['"'] = 0xB2;
  REVERSE_CHARMAP['_'] = 0xAE;
  REVERSE_CHARMAP['é'] = 0x1B;

  function decodeString(bytes, offset, maxLen) {
    var out = '';
    for (var i = 0; i < maxLen; i++) {
      var b = bytes[offset + i];
      if (b === 0xFF) break;
      out += (b in CHARMAP) ? CHARMAP[b] : '�';
    }
    return out;
  }

  /** Characters that cannot be stored are dropped. Returns the encoded byte array. */
  function encodeString(str, maxLen) {
    var out = [];
    for (var i = 0; i < str.length && out.length < maxLen; i++) {
      var ch = str[i];
      if (ch in REVERSE_CHARMAP) out.push(REVERSE_CHARMAP[ch]);
    }
    return out;
  }

  function canEncode(str) {
    for (var i = 0; i < str.length; i++) if (!(str[i] in REVERSE_CHARMAP)) return false;
    return true;
  }

  /** Writes a string into a fixed field, terminated with 0xFF and padded with padByte. */
  function writeString(bytes, offset, fieldLen, str, padByte) {
    var enc = encodeString(str, fieldLen);
    if (padByte === undefined) padByte = 0xFF;
    for (var i = 0; i < fieldLen; i++) {
      if (i < enc.length) bytes[offset + i] = enc[i];
      else if (i === enc.length) bytes[offset + i] = 0xFF;
      else bytes[offset + i] = padByte;
    }
  }

  // ---------------------------------------------------------------------------
  // Little-endian helpers on Uint8Array
  // ---------------------------------------------------------------------------
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function w16(b, o, v) { b[o] = v & 0xFF; b[o + 1] = (v >>> 8) & 0xFF; }
  function w32(b, o, v) { b[o] = v & 0xFF; b[o + 1] = (v >>> 8) & 0xFF; b[o + 2] = (v >>> 16) & 0xFF; b[o + 3] = (v >>> 24) & 0xFF; }
  function getBits(word, shift, width) { return (word >>> shift) & ((1 << width) - 1); }
  function setBits(word, shift, width, value) {
    var mask = ((1 << width) - 1) << shift;
    return ((word & ~mask) | ((value << shift) & mask)) >>> 0;
  }

  function sectorChecksum(bytes, offset) {
    var sum = 0;
    for (var i = 0; i < SECTOR_DATA_SIZE; i += 4) sum = (sum + u32(bytes, offset + i)) >>> 0;
    return ((sum >>> 16) + (sum & 0xFFFF)) & 0xFFFF;
  }

  // ---------------------------------------------------------------------------
  // Pokemon (BoxPokemon = 80 bytes, Pokemon = 104 bytes)
  // ---------------------------------------------------------------------------
  // SUBSTRUCT_ORDER[pid % 24][type] = position of substruct <type> in the data
  var SUBSTRUCT_ORDER = [
    [0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3], [0, 3, 1, 2], [0, 2, 3, 1], [0, 3, 2, 1],
    [1, 0, 2, 3], [1, 0, 3, 2], [2, 0, 1, 3], [3, 0, 1, 2], [2, 0, 3, 1], [3, 0, 2, 1],
    [1, 2, 0, 3], [1, 3, 0, 2], [2, 1, 0, 3], [3, 1, 0, 2], [2, 3, 0, 1], [3, 2, 0, 1],
    [1, 2, 3, 0], [1, 3, 2, 0], [2, 1, 3, 0], [3, 1, 2, 0], [2, 3, 1, 0], [3, 2, 1, 0]
  ];

  var STAT_NAMES = ['HP', 'Atk', 'Def', 'Spe', 'SpA', 'SpD'];
  // Nature stat modifiers in order Atk, Def, Spe, SpA, SpD
  function natureModifier(nature, statIndex /* 1..5 in Atk,Def,Spe,SpA,SpD order */) {
    if (nature >= 25) return 1;
    var up = Math.floor(nature / 5), down = nature % 5;
    if (up === down) return 1;
    if (statIndex - 1 === up) return 1.1;
    if (statIndex - 1 === down) return 0.9;
    return 1;
  }

  /**
   * A decrypted Pokemon. `data` holds an 80- or 104-byte plain copy where the
   * 48-byte secure area is stored in canonical substruct order (0,1,2,3).
   */
  function Pokemon(raw, isParty) {
    this.isParty = !!isParty;
    this.data = new Uint8Array(isParty ? PARTY_MON_SIZE : BOX_MON_SIZE);
    this.checksumValid = true;
    if (raw) this._load(raw);
  }

  Pokemon.prototype._load = function (raw) {
    var d = this.data, i;
    for (i = 0; i < d.length; i++) d[i] = raw[i];
    var pid = u32(raw, 0), otid = u32(raw, 4), key = (pid ^ otid) >>> 0;
    var order = SUBSTRUCT_ORDER[pid % 24];
    var plain = new Uint8Array(48);
    for (i = 0; i < 48; i += 4) w32(plain, i, (u32(raw, 32 + i) ^ key) >>> 0);
    for (var t = 0; t < 4; t++) for (i = 0; i < 12; i++) d[32 + t * 12 + i] = plain[order[t] * 12 + i];
    var sum = 0;
    for (i = 0; i < 48; i += 2) sum = (sum + u16(d, 32 + i)) & 0xFFFF;
    this.checksumValid = sum === u16(raw, 28);
  };

  Pokemon.prototype.isEmpty = function () {
    for (var i = 0; i < 8; i++) if (this.data[i]) return false;
    return this.species === 0;
  };

  /** Encrypts and returns the raw bytes to store in the save. */
  Pokemon.prototype.toRaw = function () {
    var d = this.data, out = new Uint8Array(d.length), i;
    for (i = 0; i < d.length; i++) out[i] = d[i];
    if (this.isEmptySlot) { for (i = 0; i < out.length; i++) out[i] = 0; return out; }
    var sum = 0;
    for (i = 0; i < 48; i += 2) sum = (sum + u16(d, 32 + i)) & 0xFFFF;
    w16(out, 28, sum);
    var pid = u32(d, 0), otid = u32(d, 4), key = (pid ^ otid) >>> 0;
    var order = SUBSTRUCT_ORDER[pid % 24];
    var arranged = new Uint8Array(48);
    for (var t = 0; t < 4; t++) for (i = 0; i < 12; i++) arranged[order[t] * 12 + i] = d[32 + t * 12 + i];
    for (i = 0; i < 48; i += 4) w32(out, 32 + i, (u32(arranged, i) ^ key) >>> 0);
    return out;
  };

  Pokemon.prototype.clone = function () {
    var p = new Pokemon(null, this.isParty);
    p.data.set(this.data);
    p.checksumValid = this.checksumValid;
    return p;
  };

  /** Converts to box (80 bytes) or party (104 bytes) form. */
  Pokemon.prototype.asParty = function (isParty) {
    var p = new Pokemon(null, isParty);
    p.data.set(this.data.subarray(0, BOX_MON_SIZE));
    if (isParty && this.isParty) p.data.set(this.data.subarray(BOX_MON_SIZE), BOX_MON_SIZE);
    if (isParty && !this.isParty) p.mail = 0xFF;
    if (isParty && !this.isParty && p.species) {
      p.level = p.levelFromExp();
      p.recalcStats(true);
    }
    return p;
  };

  // substruct base offsets inside `data`
  var S0 = 32, S1 = 44, S2 = 56, S3 = 68;

  function defineField(name, get, set) {
    Object.defineProperty(Pokemon.prototype, name, { get: get, set: set, enumerable: true });
  }
  function u8Field(name, off) {
    defineField(name, function () { return this.data[off]; }, function (v) { this.data[off] = v & 0xFF; });
  }
  function u16Field(name, off) {
    defineField(name, function () { return u16(this.data, off); }, function (v) { w16(this.data, off, v); });
  }
  function u32Field(name, off) {
    defineField(name, function () { return u32(this.data, off); }, function (v) { w32(this.data, off, v >>> 0); });
  }
  function bitField(name, off, size, shift, width) {
    var rd = size === 4 ? u32 : (size === 2 ? u16 : function (b, o) { return b[o]; });
    var wr = size === 4 ? w32 : (size === 2 ? w16 : function (b, o, v) { b[o] = v & 0xFF; });
    defineField(name, function () { return getBits(rd(this.data, off), shift, width); },
      function (v) { wr(this.data, off, setBits(rd(this.data, off), shift, width, v)); });
  }

  // Header
  u32Field('personality', 0);
  u32Field('otId', 4);
  bitField('language', 18, 1, 0, 3);
  bitField('hiddenNatureModifier', 18, 1, 3, 5);
  bitField('isBadEgg', 19, 1, 0, 1);
  bitField('hasSpecies', 19, 1, 1, 1);
  bitField('sanityIsEgg', 19, 1, 2, 1);
  u8Field('markings', 27);
  // Substruct 0 (growth)
  bitField('species', S0, 4, 0, 11);
  bitField('heldItem1', S0, 4, 11, 10);
  bitField('teraType', S0, 4, 21, 5);
  bitField('heldItem2', S0, 4, 26, 1);
  bitField('experience', S0 + 4, 4, 0, 21);
  u8Field('ppBonuses', S0 + 8);
  u8Field('friendship', S0 + 9);
  bitField('pokeball', S0 + 10, 2, 0, 5);
  // Substruct 1 (moves)
  [0, 1, 2, 3].forEach(function (i) {
    u16Field('move' + i, S1 + i * 2);
    u8Field('pp' + i, S1 + 8 + i);
  });
  // Substruct 2 (EVs / condition)
  ['hpEV', 'atkEV', 'defEV', 'speEV', 'spaEV', 'spdEV', 'cool', 'beauty', 'cute', 'smart', 'tough', 'sheen']
    .forEach(function (n, i) { u8Field(n, S2 + i); });
  // Substruct 3 (misc)
  u8Field('pokerus', S3);
  u8Field('metLocation', S3 + 1);
  bitField('metLevel', S3 + 2, 2, 0, 7);
  bitField('metGame', S3 + 2, 2, 7, 4);
  bitField('otGender', S3 + 2, 2, 15, 1);
  ['hpIV', 'atkIV', 'defIV', 'speIV', 'spaIV', 'spdIV'].forEach(function (n, i) { bitField(n, S3 + 4, 4, i * 5, 5); });
  bitField('isEgg', S3 + 4, 4, 30, 1);
  bitField('gigantamaxFactor', S3 + 4, 4, 31, 1);
  bitField('isShiny', S3 + 8, 4, 0, 3);
  bitField('genderFlag', S3 + 8, 4, 3, 3);
  bitField('tutorMoveLvl', S3 + 8, 4, 27, 2);
  bitField('abilityNum', S3 + 8, 4, 29, 2);
  bitField('fatefulEncounter', S3 + 8, 4, 31, 1);
  // Party-only
  u32Field('status', 80);
  u8Field('level', 84);
  u8Field('mail', 85);
  u16Field('hp', 86);
  u16Field('maxHP', 88);
  u16Field('attack', 90);
  u16Field('defense', 92);
  u16Field('speed', 94);
  u16Field('spAttack', 96);
  u16Field('spDefense', 98);

  defineField('heldItem', function () { return this.heldItem1 | (this.heldItem2 << 10); },
    function (v) { this.heldItem1 = v & 0x3FF; this.heldItem2 = (v >> 10) & 1; });
  defineField('nature', function () { return ((this.personality % 25) ^ this.hiddenNatureModifier) >>> 0; },
    function (v) { this.hiddenNatureModifier = ((this.personality % 25) ^ v) & 0x1F; });
  defineField('tid', function () { return this.otId & 0xFFFF; }, function (v) { this.otId = ((this.otId & 0xFFFF0000) | (v & 0xFFFF)) >>> 0; });
  defineField('sid', function () { return this.otId >>> 16; }, function (v) { this.otId = ((this.otId & 0xFFFF) | ((v & 0xFFFF) << 16)) >>> 0; });

  Pokemon.prototype.getNickname = function () { return decodeString(this.data, 8, 10); };
  Pokemon.prototype.setNickname = function (s) { writeString(this.data, 8, 10, s, 0xFF); };
  Pokemon.prototype.getOtName = function () { return decodeString(this.data, 20, 7); };
  Pokemon.prototype.setOtName = function (s) { writeString(this.data, 20, 7, s, 0xFF); };

  Pokemon.prototype.getIVs = function () { return [this.hpIV, this.atkIV, this.defIV, this.speIV, this.spaIV, this.spdIV]; };
  Pokemon.prototype.setIVs = function (a) { var self = this; ['hpIV', 'atkIV', 'defIV', 'speIV', 'spaIV', 'spdIV'].forEach(function (n, i) { self[n] = a[i]; }); };
  Pokemon.prototype.getEVs = function () { return [this.hpEV, this.atkEV, this.defEV, this.speEV, this.spaEV, this.spdEV]; };
  Pokemon.prototype.setEVs = function (a) { var self = this; ['hpEV', 'atkEV', 'defEV', 'speEV', 'spaEV', 'spdEV'].forEach(function (n, i) { self[n] = a[i]; }); };
  Pokemon.prototype.getMoves = function () { return [this.move0, this.move1, this.move2, this.move3]; };
  Pokemon.prototype.getPPs = function () { return [this.pp0, this.pp1, this.pp2, this.pp3]; };
  Pokemon.prototype.ppUps = function (i) { return (this.ppBonuses >> (i * 2)) & 3; };
  Pokemon.prototype.setPPUps = function (i, v) { this.ppBonuses = (this.ppBonuses & ~(3 << (i * 2))) | ((v & 3) << (i * 2)); };

  /** Emerald Rogue uses a flat experience curve: level L needs L * 300 EXP. */
  Pokemon.expForLevel = function (level) { return level * 300; };
  Pokemon.prototype.levelFromExp = function () {
    var level = 1;
    while (level <= 100 && Pokemon.expForLevel(level) <= this.experience) level++;
    return Math.max(1, level - 1);
  };
  Pokemon.prototype.setLevel = function (level) {
    level = Math.max(1, Math.min(100, level | 0));
    this.experience = Pokemon.expForLevel(level);
    if (this.isParty) { this.level = level; this.recalcStats(false); }
  };

  /** Computes stats from base stats (non-rebalanced profile). Needs ER_DATA. */
  Pokemon.prototype.calcStats = function (data) {
    var sp = data.species[this.species];
    if (!sp) return null;
    var base = sp[1], ivs = this.getIVs(), evs = this.getEVs();
    var level = this.isParty ? this.level : this.levelFromExp();
    var stats = [];
    if (base[0] === 1) stats.push(1); // Shedinja
    else stats.push(Math.floor(((2 * base[0] + ivs[0] + Math.floor(evs[0] / 4)) * level) / 100) + level + 10);
    for (var i = 1; i < 6; i++) {
      var n = Math.floor(((2 * base[i] + ivs[i] + Math.floor(evs[i] / 4)) * level) / 100) + 5;
      stats.push(Math.floor(n * natureModifier(this.nature, i)));
    }
    return stats;
  };

  Pokemon.prototype.recalcStats = function (fullHeal, data) {
    if (!this.isParty) return;
    data = data || (typeof ER_DATA !== 'undefined' ? ER_DATA : null); // eslint-disable-line no-undef
    if (!data) return;
    var st = this.calcStats(data);
    if (!st) return;
    var oldMax = this.maxHP, oldHp = this.hp;
    this.maxHP = st[0]; this.attack = st[1]; this.defense = st[2]; this.speed = st[3];
    this.spAttack = st[4]; this.spDefense = st[5];
    if (fullHeal || oldMax === 0) this.hp = st[0];
    else if (oldHp > 0) this.hp = Math.max(1, Math.min(st[0], oldHp + (st[0] - oldMax)));
  };

  Pokemon.prototype.markEmpty = function () {
    this.data.fill(0);
    if (this.isParty) this.data[85] = 0xFF;
    this.isEmptySlot = true;
  };

  /** Creates a brand new Pokemon owned by the player. */
  Pokemon.create = function (opts, data) {
    var p = new Pokemon(null, !!opts.isParty);
    var pid = opts.personality !== undefined ? opts.personality >>> 0 : Math.floor(Math.random() * 0x100000000) >>> 0;
    p.personality = pid;
    p.otId = opts.otId >>> 0;
    p.language = 2; // English
    p.setOtName(opts.otName || '');
    p.species = opts.species;
    p.hasSpecies = opts.species ? 1 : 0;
    var name = (data && data.species[opts.species]) ? data.species[opts.species][0].replace(/ \(.*\)$/, '') : '';
    p.setNickname(opts.nickname || name.toUpperCase().slice(0, 10));
    p.nature = opts.nature !== undefined ? opts.nature : pid % 25;
    p.friendship = 70;
    p.pokeball = opts.pokeball || 1;
    p.metLevel = opts.level || 5;
    p.metGame = 3; // Emerald
    p.otGender = opts.otGender || 0;
    p.setIVs(opts.ivs || [31, 31, 31, 31, 31, 31]);
    p.genderFlag = opts.genderFlag || 0;
    var moves = opts.moves || [33, 0, 0, 0]; // Tackle
    for (var i = 0; i < 4; i++) {
      p['move' + i] = moves[i] || 0;
      p['pp' + i] = (data && moves[i]) ? data.moves[moves[i]][1] : 0;
    }
    p.experience = Pokemon.expForLevel(opts.level || 5);
    if (p.isParty) { p.mail = 0xFF; p.level = opts.level || 5; p.recalcStats(true, data); }
    return p;
  };

  // ---------------------------------------------------------------------------
  // Save file
  // ---------------------------------------------------------------------------
  function SaveFile(buffer) {
    var bytes = buffer instanceof Uint8Array ? new Uint8Array(buffer) : new Uint8Array(buffer);
    if (bytes.length < MIN_SAVE_SIZE) throw new Error('File is too small to be a GBA flash save (' + bytes.length + ' bytes).');
    this.bytes = bytes;
    this.warnings = [];
    this._pickSlot();
    this._loadBlocks();
  }

  SaveFile.prototype._scanSlot = function (slot) {
    var b = this.bytes, info = { slot: slot, valid: 0, counter: 0, sectors: {}, badChecksum: [] };
    for (var i = 0; i < SECTORS_PER_SLOT; i++) {
      var phys = slot * SECTORS_PER_SLOT + i, off = phys * SECTOR_SIZE;
      var id = u16(b, off + 0xFF4), chk = u16(b, off + 0xFF6), sig = u32(b, off + 0xFF8), counter = u32(b, off + 0xFFC);
      if (sig !== SECTOR_SIGNATURE || id >= SECTORS_PER_SLOT) continue;
      info.sectors[id] = phys;
      info.counter = counter;
      if (sectorChecksum(b, off) === chk) info.valid++;
      else info.badChecksum.push(id);
    }
    info.complete = Object.keys(info.sectors).length === SECTORS_PER_SLOT;
    return info;
  };

  SaveFile.prototype._pickSlot = function () {
    var a = this._scanSlot(0), b = this._scanSlot(1), pick;
    var aOk = a.complete && a.valid === SECTORS_PER_SLOT, bOk = b.complete && b.valid === SECTORS_PER_SLOT;
    if (aOk && bOk) {
      // Same rule as the game: higher counter wins (with wrap-around handling)
      if (a.counter === 0xFFFFFFFF && b.counter === 0) pick = b;
      else if (b.counter === 0xFFFFFFFF && a.counter === 0) pick = a;
      else pick = a.counter >= b.counter ? a : b;
    } else if (aOk) pick = a;
    else if (bOk) pick = b;
    else if (a.complete || b.complete) {
      pick = (a.complete && (!b.complete || a.valid >= b.valid)) ? a : b;
      this.warnings.push('No fully valid save slot was found; loaded slot ' + (pick.slot + 1) +
        ' which has checksum errors in sector(s) ' + pick.badChecksum.join(', ') + '. Saving will rewrite those checksums.');
    } else {
      throw new Error('No Emerald Rogue save data was found in this file (missing sector signatures).');
    }
    this.slot = pick;
    this.otherSlot = pick === a ? b : a;
  };

  SaveFile.prototype._readBlock = function (firstId, count) {
    var out = new Uint8Array(count * SECTOR_DATA_SIZE);
    for (var i = 0; i < count; i++) {
      var off = this.slot.sectors[firstId + i] * SECTOR_SIZE;
      out.set(this.bytes.subarray(off, off + SECTOR_DATA_SIZE), i * SECTOR_DATA_SIZE);
    }
    return out;
  };

  SaveFile.prototype._loadBlocks = function () {
    this.sb2 = this._readBlock(0, 1);
    this.sb1 = this._readBlock(1, 4);
    this.storage = this._readBlock(5, 9);

    var rb = OFF.storage.rogueBlock, st = this.storage;
    this.rogue = {
      saveVersion: u16(st, rb),
      blockFormat: st[rb + 2],
      secretId: u16(st, rb + 3),
      rogueVersion: st[rb + 5],
      numSpecies: u16(st, rb + 6)
    };
    if (this.rogue.secretId !== ROGUE_SECRET_ID) {
      this.warnings.push('The Emerald Rogue save header was not found. This may not be an Emerald Rogue 2.x save; edit with care.');
    } else if (this.rogue.numSpecies && this.rogue.numSpecies !== EXPECTED_NUM_SPECIES) {
      this.warnings.push('This save reports ' + this.rogue.numSpecies + ' species, but this editor was built for Emerald Rogue EX (' +
        EXPECTED_NUM_SPECIES + ' species). Pokémon/item names may be wrong (the vanilla build is not supported).');
    }

    this.party = [];
    var count = this.partyCount;
    for (var i = 0; i < PARTY_SIZE; i++) {
      var o = OFF.sb1.party + i * PARTY_MON_SIZE;
      var mon = new Pokemon(this.sb1.subarray(o, o + PARTY_MON_SIZE), true);
      if (i >= count) mon.isEmptySlot = true;
      this.party.push(mon);
    }
    this.boxes = [];
    for (var bx = 0; bx < OFF.storage.boxCount; bx++) {
      var box = [];
      for (var s = 0; s < OFF.storage.perBox; s++) {
        var bo = OFF.storage.boxes + (bx * OFF.storage.perBox + s) * BOX_MON_SIZE;
        var bm = new Pokemon(this.storage.subarray(bo, bo + BOX_MON_SIZE), false);
        if (bm.species === 0) bm.isEmptySlot = true;
        box.push(bm);
      }
      this.boxes.push(box);
    }
  };

  // --- Trainer ---------------------------------------------------------------
  Object.defineProperties(SaveFile.prototype, {
    encryptionKey: { get: function () { return u32(this.sb2, OFF.sb2.encryptionKey); } },
    playerName: {
      get: function () { return decodeString(this.sb2, OFF.sb2.playerName, 7); },
      set: function (v) { writeString(this.sb2, OFF.sb2.playerName, 8, v, 0xFF); }
    },
    playerGender: {
      get: function () { return this.sb2[OFF.sb2.playerGender]; },
      set: function (v) { this.sb2[OFF.sb2.playerGender] = v; }
    },
    tid: { get: function () { return u16(this.sb2, OFF.sb2.trainerId); }, set: function (v) { w16(this.sb2, OFF.sb2.trainerId, v); } },
    sid: { get: function () { return u16(this.sb2, OFF.sb2.trainerId + 2); }, set: function (v) { w16(this.sb2, OFF.sb2.trainerId + 2, v); } },
    otId: { get: function () { return u32(this.sb2, OFF.sb2.trainerId); } },
    playHours: { get: function () { return u16(this.sb2, OFF.sb2.playHours); }, set: function (v) { w16(this.sb2, OFF.sb2.playHours, v); } },
    playMinutes: { get: function () { return this.sb2[OFF.sb2.playMinutes]; }, set: function (v) { this.sb2[OFF.sb2.playMinutes] = v; } },
    playSeconds: { get: function () { return this.sb2[OFF.sb2.playSeconds]; }, set: function (v) { this.sb2[OFF.sb2.playSeconds] = v; } },
    hubName: {
      get: function () { return decodeString(this.sb2, OFF.sb2.hubName, OFF.sb2.hubNameLength - 1); },
      set: function (v) { writeString(this.sb2, OFF.sb2.hubName, OFF.sb2.hubNameLength, v, 0xFF); }
    },
    money: {
      get: function () { return (u32(this.sb1, OFF.sb1.money) ^ this.encryptionKey) >>> 0; },
      set: function (v) { w32(this.sb1, OFF.sb1.money, (v ^ this.encryptionKey) >>> 0); }
    },
    partyCount: {
      get: function () { return Math.min(PARTY_SIZE, this.sb1[OFF.sb1.partyCount]); },
      set: function (v) { this.sb1[OFF.sb1.partyCount] = v; }
    },
    bagCapacityUpgrades: {
      get: function () { return this.sb1[OFF.sb1.bagCapacityUpgrades]; },
      set: function (v) { this.sb1[OFF.sb1.bagCapacityUpgrades] = v; }
    },
    currentBox: {
      get: function () { return this.storage[OFF.storage.currentBox]; },
      set: function (v) { this.storage[OFF.storage.currentBox] = v; }
    }
  });

  // --- Items -----------------------------------------------------------------
  /** Bag: flat 450-slot array, quantities XOR'd with the low 16 bits of the key. */
  SaveFile.prototype.getBag = function () {
    var list = [], key = this.encryptionKey & 0xFFFF;
    for (var i = 0; i < OFF.sb1.bagCount; i++) {
      var o = OFF.sb1.bag + i * 4, id = u16(this.sb1, o);
      if (id === 0) continue;
      list.push({ item: id, quantity: (u16(this.sb1, o + 2) ^ key) & 0xFFFF });
    }
    return list;
  };

  /**
   * The game expects the bag to be sorted by pocket with no gaps
   * (see UpdateBagItemsPointers). pocketOf(itemId) must return the pocket id.
   */
  SaveFile.prototype.setBag = function (list, pocketOf) {
    var key = this.encryptionKey & 0xFFFF;
    var clean = list.filter(function (e) { return e.item > 0 && e.quantity > 0; })
      .map(function (e, idx) { return { item: e.item, quantity: Math.min(0xFFFF, e.quantity), idx: idx, pocket: pocketOf ? pocketOf(e.item) : 0 }; });
    clean.sort(function (a, b) { return (a.pocket - b.pocket) || (a.idx - b.idx); });
    if (clean.length > OFF.sb1.bagCount) throw new Error('Too many bag items (max ' + OFF.sb1.bagCount + ').');
    for (var i = 0; i < OFF.sb1.bagCount; i++) {
      var o = OFF.sb1.bag + i * 4;
      if (i < clean.length) { w16(this.sb1, o, clean[i].item); w16(this.sb1, o + 2, clean[i].quantity ^ key); }
      else { w16(this.sb1, o, 0); w16(this.sb1, o + 2, 0 ^ key); }
    }
  };

  /** PC item storage: 50 slots, quantities not encrypted. */
  SaveFile.prototype.getPcItems = function () {
    var list = [];
    for (var i = 0; i < OFF.sb1.pcItemCount; i++) {
      var o = OFF.sb1.pcItems + i * 4, id = u16(this.sb1, o);
      if (id === 0) continue;
      list.push({ item: id, quantity: u16(this.sb1, o + 2) });
    }
    return list;
  };

  SaveFile.prototype.setPcItems = function (list) {
    var clean = list.filter(function (e) { return e.item > 0 && e.quantity > 0; });
    if (clean.length > OFF.sb1.pcItemCount) throw new Error('Too many PC items (max ' + OFF.sb1.pcItemCount + ').');
    for (var i = 0; i < OFF.sb1.pcItemCount; i++) {
      var o = OFF.sb1.pcItems + i * 4;
      w16(this.sb1, o, i < clean.length ? clean[i].item : 0);
      w16(this.sb1, o + 2, i < clean.length ? Math.min(0xFFFF, clean[i].quantity) : 0);
    }
  };

  // --- Boxes -----------------------------------------------------------------
  SaveFile.prototype.getBoxName = function (i) {
    return decodeString(this.storage, OFF.storage.boxNames + i * OFF.storage.boxNameLength, OFF.storage.boxNameLength - 1);
  };
  SaveFile.prototype.setBoxName = function (i, name) {
    writeString(this.storage, OFF.storage.boxNames + i * OFF.storage.boxNameLength, OFF.storage.boxNameLength, name, 0x00);
  };

  // --- Flags / vars ----------------------------------------------------------
  SaveFile.prototype.getFlag = function (id) {
    return (this.sb1[OFF.sb1.flags + (id >> 3)] >> (id & 7)) & 1;
  };
  SaveFile.prototype.setFlag = function (id, on) {
    var o = OFF.sb1.flags + (id >> 3);
    if (on) this.sb1[o] |= (1 << (id & 7)); else this.sb1[o] &= ~(1 << (id & 7));
  };
  SaveFile.prototype.getVar = function (index) { return u16(this.sb1, OFF.sb1.vars + index * 2); };
  SaveFile.prototype.setVar = function (index, v) { w16(this.sb1, OFF.sb1.vars + index * 2, v); };

  // --- Writing ---------------------------------------------------------------
  SaveFile.prototype._commitPokemon = function () {
    var i, filled = [];
    for (i = 0; i < PARTY_SIZE; i++) if (!this.party[i].isEmptySlot) filled.push(this.party[i]);
    // Party must be contiguous
    for (i = 0; i < PARTY_SIZE; i++) {
      var o = OFF.sb1.party + i * PARTY_MON_SIZE;
      if (i < filled.length) this.sb1.set(filled[i].toRaw(), o);
      else { this.sb1.fill(0, o, o + PARTY_MON_SIZE); this.sb1[o + 85] = 0xFF; } // MAIL_NONE
    }
    this.partyCount = filled.length;
    for (var bx = 0; bx < this.boxes.length; bx++) {
      for (var s = 0; s < OFF.storage.perBox; s++) {
        var bo = OFF.storage.boxes + (bx * OFF.storage.perBox + s) * BOX_MON_SIZE;
        var m = this.boxes[bx][s];
        if (m.isEmptySlot) this.storage.fill(0, bo, bo + BOX_MON_SIZE);
        else this.storage.set(m.toRaw(), bo);
      }
    }
    // Re-read the party so the in-memory list matches the compacted order
    this.party = [];
    for (i = 0; i < PARTY_SIZE; i++) {
      var po = OFF.sb1.party + i * PARTY_MON_SIZE;
      var mon = new Pokemon(this.sb1.subarray(po, po + PARTY_MON_SIZE), true);
      if (i >= filled.length) mon.isEmptySlot = true;
      this.party.push(mon);
    }
  };

  SaveFile.prototype._writeBlock = function (block, firstId, count) {
    for (var i = 0; i < count; i++) {
      var phys = this.slot.sectors[firstId + i], off = phys * SECTOR_SIZE;
      this.bytes.set(block.subarray(i * SECTOR_DATA_SIZE, (i + 1) * SECTOR_DATA_SIZE), off);
      w16(this.bytes, off + 0xFF6, sectorChecksum(this.bytes, off));
    }
  };

  /** Returns a new Uint8Array with all edits applied and checksums fixed. */
  SaveFile.prototype.export = function () {
    this._commitPokemon();
    this._writeBlock(this.sb2, 0, 1);
    this._writeBlock(this.sb1, 1, 4);
    this._writeBlock(this.storage, 5, 9);
    return new Uint8Array(this.bytes);
  };

  return {
    SaveFile: SaveFile,
    Pokemon: Pokemon,
    decodeString: decodeString,
    encodeString: encodeString,
    canEncode: canEncode,
    sectorChecksum: sectorChecksum,
    natureModifier: natureModifier,
    STAT_NAMES: STAT_NAMES,
    OFFSETS: OFF,
    constants: {
      SECTOR_SIZE: SECTOR_SIZE, SECTOR_DATA_SIZE: SECTOR_DATA_SIZE, SECTOR_SIGNATURE: SECTOR_SIGNATURE,
      SECTORS_PER_SLOT: SECTORS_PER_SLOT, PARTY_SIZE: PARTY_SIZE, BOX_MON_SIZE: BOX_MON_SIZE,
      PARTY_MON_SIZE: PARTY_MON_SIZE, EXPECTED_NUM_SPECIES: EXPECTED_NUM_SPECIES
    }
  };
});
