/*
 * App shell: screen routing, home screen (chapter selection), settings modal,
 * theme and global keyboard handling.
 */
(function (root) {
  'use strict';
  var Trainer = root.Trainer;
  var D = Trainer.Data, S = Trainer.State;
  var el = D.el;

  function $(id) { return document.getElementById(id); }

  var SCREENS = ['home', 'learn', 'practise', 'results'];
  var currentScreen = 'home';
  var modalOpen = false;
  var lastFocus = null;

  var CHEVRON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="6 9 12 15 18 9"/></svg>';

  function reducedMotion() {
    try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------

  function show(name, opts) {
    opts = opts || {};
    if (name !== 'learn') Trainer.Learn.stop();
    if (name !== 'practise' && name !== 'results') Trainer.Practise.stop();
    SCREENS.forEach(function (s) { $('screen-' + s).hidden = s !== name; });
    currentScreen = name;
    document.body.setAttribute('data-screen', name);
    try { root.scrollTo(0, 0); } catch (e) { /* ignore */ }
    if (!opts.noFocus) {
      var title = document.querySelector('#screen-' + name + ' [tabindex="-1"]');
      if (title) title.focus({ preventScroll: true });
    }
  }

  function goHome(focusChapters) {
    show('home', { noFocus: !!focusChapters });
    updateHome();
    if (focusChapters) {
      var first = document.querySelector('#books input[type="checkbox"]');
      if (first) first.focus();
    }
  }

  function startLearn() {
    var cards = D.cardsForChapters(S.selection);
    if (!cards.length) return;
    show('learn', { noFocus: true });
    Trainer.Learn.start(cards);
    Trainer.Learn.focus();
  }

  function startPractise(cards) {
    if (!cards || !cards.length) return;
    Trainer.Practise.start(cards, { pool: cards.slice() });
  }

  function startPractiseFromSelection() {
    startPractise(D.cardsForChapters(S.selection));
  }

  // ---------------------------------------------------------------------------
  // Home: chapter selection
  // ---------------------------------------------------------------------------

  function buildHome() {
    var container = $('books');
    D.BOOKS.forEach(function (b) {
      var section = el('section', 'book');
      section.setAttribute('aria-labelledby', 'book-' + b.number + '-title');

      var head = el('div', 'book-head');
      var h = el('h3', 'book-title');
      h.id = 'book-' + b.number + '-title';
      var toggle = el('button', 'book-toggle');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-controls', 'book-' + b.number + '-chapters');
      toggle.innerHTML = CHEVRON;
      toggle.appendChild(el('span', 'book-name', 'Book ' + b.number));
      toggle.appendChild(el('span', 'book-range', 'Chapters ' + b.from + '–' + b.to));
      h.appendChild(toggle);
      head.appendChild(h);

      var count = el('span', 'book-count');
      count.id = 'book-' + b.number + '-count';
      head.appendChild(count);

      var sel = el('button', 'btn small book-select');
      sel.type = 'button';
      sel.id = 'book-' + b.number + '-select';
      sel.setAttribute('data-book', String(b.number));
      head.appendChild(sel);
      section.appendChild(head);

      var grid = el('div', 'chapter-grid');
      grid.id = 'book-' + b.number + '-chapters';
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', 'Book ' + b.number + ' chapters');
      D.chaptersOfBook(b.number).forEach(function (ch) {
        var label = el('label', 'chip');
        var input = el('input');
        input.type = 'checkbox';
        input.value = String(ch);
        input.setAttribute('data-chapter', String(ch));
        var body = el('span', 'chip-body');
        body.appendChild(el('span', 'chip-title', 'Chapter ' + ch));
        var n = (D.byChapter[ch] || []).length;
        body.appendChild(el('span', 'chip-count', n + ' words'));
        body.appendChild(el('span', 'chip-check')).setAttribute('aria-hidden', 'true');
        label.appendChild(input);
        label.appendChild(body);
        grid.appendChild(label);
      });
      section.appendChild(grid);
      container.appendChild(section);

      function setCollapsed(collapsed) {
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        grid.hidden = collapsed;
        section.classList.toggle('is-collapsed', collapsed);
      }
      setCollapsed(S.collapsedBooks.indexOf(b.number) !== -1);
      toggle.addEventListener('click', function () {
        var collapsed = toggle.getAttribute('aria-expanded') === 'true';
        setCollapsed(collapsed);
        S.setBookCollapsed(b.number, collapsed);
      });
      sel.addEventListener('click', function () {
        var chapters = D.chaptersOfBook(b.number);
        var selection = S.selection;
        var all = chapters.every(function (c) { return selection.indexOf(c) !== -1; });
        if (all) selection = selection.filter(function (c) { return chapters.indexOf(c) === -1; });
        else selection = selection.concat(chapters);
        S.setSelection(selection);
      });
    });

    container.addEventListener('change', function (e) {
      var t = e.target;
      if (!t.hasAttribute('data-chapter')) return;
      var ch = Number(t.getAttribute('data-chapter'));
      var selection = S.selection.filter(function (c) { return c !== ch; });
      if (t.checked) selection.push(ch);
      S.setSelection(selection);
    });

    $('select-all-btn').addEventListener('click', function () {
      var all = [];
      for (var i = 1; i <= 40; i++) all.push(i);
      S.setSelection(all);
    });
    $('clear-btn').addEventListener('click', function () { S.setSelection([]); });
    $('learn-btn').addEventListener('click', startLearn);
    $('practise-btn').addEventListener('click', startPractiseFromSelection);
  }

  function updateHome() {
    var selection = S.selection;
    Array.prototype.forEach.call(document.querySelectorAll('#books input[data-chapter]'), function (input) {
      input.checked = selection.indexOf(Number(input.getAttribute('data-chapter'))) !== -1;
    });
    D.BOOKS.forEach(function (b) {
      var chapters = D.chaptersOfBook(b.number);
      var n = chapters.filter(function (c) { return selection.indexOf(c) !== -1; }).length;
      $('book-' + b.number + '-count').textContent = n + ' / ' + chapters.length + ' selected';
      var btn = $('book-' + b.number + '-select');
      var all = n === chapters.length;
      btn.textContent = all ? 'Select none' : 'Select all';
      btn.setAttribute('aria-label', (all ? 'Select none in Book ' : 'Select all in Book ') + b.number);
    });
    var words = D.cardsForChapters(selection).length;
    var summary = selection.length
      ? selection.length + (selection.length === 1 ? ' chapter' : ' chapters') + ' selected · ' + words + ' words'
      : 'No chapters selected';
    $('selection-summary').textContent = summary;
    var none = !selection.length;
    $('learn-btn').disabled = none;
    $('practise-btn').disabled = none;
    $('action-hint').hidden = !none;
    $('clear-btn').disabled = none;
    $('select-all-btn').disabled = selection.length === 40;
  }

  // ---------------------------------------------------------------------------
  // Settings modal
  // ---------------------------------------------------------------------------

  function applyTheme() {
    var t = S.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }

  function syncSettingsForm() {
    var form = $('settings-form'), st = S.settings;
    Array.prototype.forEach.call(form.elements, function (input) {
      var name = input.name;
      if (!name || !Object.prototype.hasOwnProperty.call(st, name)) return;
      if (input.type === 'checkbox') input.checked = !!st[name];
      else if (input.type === 'radio') input.checked = input.value === String(st[name]);
      else input.value = String(st[name]);
    });
    lockPair(form.elements.dirLaEn, form.elements.dirEnLa, $('lock-dir'));
    lockPair(form.elements.typeMc, form.elements.typeTyped, $('lock-type'));
  }

  // When only one of a pair is ticked, disable it and show why.
  function lockPair(a, b, msg) {
    var onlyA = a.checked && !b.checked, onlyB = b.checked && !a.checked;
    a.disabled = onlyA;
    b.disabled = onlyB;
    msg.hidden = !(onlyA || onlyB);
    [a, b].forEach(function (x) {
      if (x.disabled) x.setAttribute('aria-describedby', msg.id); else x.removeAttribute('aria-describedby');
    });
  }

  function focusables(container) {
    return Array.prototype.filter.call(
      container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      function (n) { return !n.disabled && !n.hidden && n.offsetParent !== null && n.getAttribute('tabindex') !== '-1'; }
    );
  }

  function setInert(on) {
    var targets = [document.querySelector('.app-header'), $('main'), document.querySelector('.skip-link')];
    targets.forEach(function (t) {
      if (!t) return;
      if (on) { t.setAttribute('inert', ''); t.setAttribute('aria-hidden', 'true'); }
      else { t.removeAttribute('inert'); t.removeAttribute('aria-hidden'); }
      try { t.inert = on; } catch (e) { /* older browsers */ }
    });
  }

  function openSettings() {
    if (modalOpen) return;
    lastFocus = document.activeElement;
    syncSettingsForm();
    $('settings-overlay').hidden = false;
    document.body.classList.add('modal-open');
    setInert(true);
    modalOpen = true;
    var f = focusables($('settings-dialog'));
    var firstField = $('settings-form').querySelector('input:not(:disabled)');
    (firstField || f[0]).focus();
  }

  function closeSettings() {
    if (!modalOpen) return;
    $('settings-overlay').hidden = true;
    document.body.classList.remove('modal-open');
    setInert(false);
    modalOpen = false;
    if (lastFocus && document.body.contains(lastFocus) && !lastFocus.disabled) {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) { lastFocus.focus(); }
    } else {
      $('settings-btn').focus();
    }
  }

  function buildSettings() {
    $('settings-btn').addEventListener('click', openSettings);
    $('settings-close').addEventListener('click', closeSettings);
    $('settings-close-x').addEventListener('click', closeSettings);
    $('settings-overlay').addEventListener('mousedown', function (e) {
      if (e.target === e.currentTarget) closeSettings();
    });
    $('settings-reset').addEventListener('click', function () {
      S.resetSettings();
      $('settings-live').textContent = 'All settings reset to their defaults.';
    });
    $('settings-form').addEventListener('submit', function (e) { e.preventDefault(); });
    $('settings-form').addEventListener('change', function (e) {
      var t = e.target;
      if (!t.name) return;
      var value = t.type === 'checkbox' ? t.checked : t.value;
      S.setSetting(t.name, value);
      syncSettingsForm();
    });
  }

  function trapTab(e) {
    var f = focusables($('settings-dialog'));
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !$('settings-dialog').contains(document.activeElement))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !$('settings-dialog').contains(document.activeElement))) {
      e.preventDefault(); first.focus();
    }
  }

  // ---------------------------------------------------------------------------
  // Global keyboard
  // ---------------------------------------------------------------------------

  function onKeyDown(e) {
    if (modalOpen) {
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); closeSettings(); }
      else if (e.key === 'Tab') trapTab(e);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var handled = false;
    if (currentScreen === 'learn') handled = Trainer.Learn.onKey(e);
    else if (currentScreen === 'practise') handled = Trainer.Practise.onKey(e);
    if (handled) e.preventDefault();
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  function init() {
    applyTheme();
    buildHome();
    buildSettings();
    updateHome();

    S.onChange(function (what, key) {
      if (what === 'selection') updateHome();
      if (what === 'settings') {
        applyTheme();
        if (modalOpen) syncSettingsForm();
        Trainer.Learn.onSettings(key);
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-go-home]'), function (b) {
      b.addEventListener('click', function () { goHome(); });
    });
    $('brand-btn').addEventListener('click', function () {
      if (Trainer.Practise.isActive() && !root.confirm('Leave this practice session? Your progress in it will be lost.')) return;
      goHome();
    });

    document.addEventListener('keydown', onKeyDown);
    show('home', { noFocus: true });
  }

  Trainer.App = {
    show: show,
    goHome: goHome,
    startPractise: startPractise,
    startPractiseFromSelection: startPractiseFromSelection,
    reducedMotion: reducedMotion
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
