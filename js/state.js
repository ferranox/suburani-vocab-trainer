/*
 * Settings + chapter selection, persisted to localStorage when available.
 * Every storage access is wrapped in try/catch; on failure we silently keep
 * the state in memory only (e.g. some browsers block storage on file://).
 */
(function (root) {
  'use strict';
  var Trainer = root.Trainer = root.Trainer || {};

  var STORAGE_KEY = 'suburani-vocab-trainer:v1';

  // ---- Defaults: edit here to change the app's out-of-the-box behaviour ----
  var DEFAULTS = {
    dirLaEn: true,          // Latin → English questions
    dirEnLa: true,          // English → Latin questions
    typeMc: true,           // multiple-choice questions
    typeTyped: true,        // typed questions
    strictness: 'normal',   // 'lenient' | 'normal' | 'strict'
    requireMacrons: false,
    sessionSize: 'all',     // 'all' | '10' | '20' | '30' | '50'
    frontSide: 'latin',     // 'latin' | 'english'
    shuffle: false,         // flashcard order
    theme: 'system'         // 'system' | 'light' | 'dark'
  };

  var ALLOWED = {
    strictness: ['lenient', 'normal', 'strict'],
    sessionSize: ['all', '10', '20', '30', '50'],
    frontSide: ['latin', 'english'],
    theme: ['system', 'light', 'dark']
  };

  function readStorage() {
    try {
      var raw = root.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeStorage(obj) {
    try { root.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (e) { /* in-memory only */ }
  }

  function sanitizeSettings(s) {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      var v = s && Object.prototype.hasOwnProperty.call(s, k) ? s[k] : DEFAULTS[k];
      if (typeof DEFAULTS[k] === 'boolean') v = !!v;
      else {
        v = String(v);
        if (ALLOWED[k] && ALLOWED[k].indexOf(v) === -1) v = DEFAULTS[k];
      }
      out[k] = v;
    });
    if (!out.dirLaEn && !out.dirEnLa) { out.dirLaEn = true; out.dirEnLa = true; }
    if (!out.typeMc && !out.typeTyped) { out.typeMc = true; out.typeTyped = true; }
    return out;
  }

  function sanitizeSelection(sel) {
    if (!Array.isArray(sel)) return [];
    var seen = {};
    return sel.map(Number).filter(function (n) {
      if (!(n >= 1 && n <= 40) || seen[n]) return false;
      seen[n] = 1;
      return true;
    }).sort(function (a, b) { return a - b; });
  }

  function sanitizeCollapsed(list) {
    if (!Array.isArray(list)) return [];
    var seen = {};
    return list.map(Number).filter(function (n) {
      if (!(n >= 1 && n <= 3) || seen[n]) return false;
      seen[n] = 1;
      return true;
    }).sort(function (a, b) { return a - b; });
  }

  var saved = readStorage() || {};
  var state = {
    settings: sanitizeSettings(saved.settings),
    selection: sanitizeSelection(saved.selection),
    collapsedBooks: sanitizeCollapsed(saved.collapsedBooks)
  };
  var listeners = [];

  function persist() {
    writeStorage({ settings: state.settings, selection: state.selection, collapsedBooks: state.collapsedBooks });
  }
  function emit(what, key) { listeners.forEach(function (fn) { try { fn(what, key); } catch (e) { if (root.console) console.error(e); } }); }

  Trainer.State = {
    DEFAULTS: DEFAULTS,
    get settings() { return state.settings; },
    get selection() { return state.selection.slice(); },
    get collapsedBooks() { return state.collapsedBooks.slice(); },

    setSetting: function (key, value) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return;
      var next = Object.assign({}, state.settings);
      next[key] = value;
      next = sanitizeSettings(next);
      if (next[key] === state.settings[key]) return;
      state.settings = next;
      persist();
      emit('settings', key);
    },

    resetSettings: function () {
      state.settings = sanitizeSettings({});
      persist();
      emit('settings', '*');
    },

    setSelection: function (chapters) {
      state.selection = sanitizeSelection(chapters);
      persist();
      emit('selection');
    },

    setBookCollapsed: function (book, collapsed) {
      var rest = state.collapsedBooks.filter(function (n) { return n !== book; });
      if (collapsed) rest.push(book);
      state.collapsedBooks = sanitizeCollapsed(rest);
      persist();
    },

    onChange: function (fn) { listeners.push(fn); }
  };
})(window);
