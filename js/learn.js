/*
 * Learn mode: flashcards with 3D flip, arrows, keyboard and swipe navigation.
 */
(function (root) {
  'use strict';
  var Trainer = root.Trainer;
  var D = Trainer.Data, S = Trainer.State;

  function $(id) { return document.getElementById(id); }

  var els = null;
  var original = [];   // cards in book/chapter/original order
  var deck = [];       // current order
  var index = 0;
  var flipped = false;
  var active = false;
  var suppressClickUntil = 0;
  var touch = null;

  function init() {
    els = {
      stage: $('card-stage'), card: $('flashcard'),
      faceFront: $('face-front'), faceBack: $('face-back'),
      frontContent: $('front-content'), backContent: $('back-content'),
      frontCh: $('front-chapter'), backCh: $('back-chapter'),
      prev: $('learn-prev'), next: $('learn-next'),
      progress: $('learn-progress'), bar: $('learn-bar'), live: $('learn-live'),
      end: $('learn-end'), shuffleBtn: $('learn-shuffle')
    };

    els.card.addEventListener('click', function () {
      if (Date.now() < suppressClickUntil) return;
      flip();
    });
    els.prev.addEventListener('click', prev);
    els.next.addEventListener('click', next);
    els.shuffleBtn.addEventListener('click', function () { S.setSetting('shuffle', !S.settings.shuffle); });
    $('learn-restart').addEventListener('click', function () { index = 0; render(); els.card.focus(); });
    $('learn-end-shuffle').addEventListener('click', function () {
      if (!S.settings.shuffle) S.setSetting('shuffle', true);   // triggers reorder
      deck = D.shuffle(original);
      index = 0;
      render();
      els.card.focus();
    });
    $('learn-practise').addEventListener('click', function () { Trainer.App.startPractise(original.slice()); });

    els.stage.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { touch = null; return; }
      touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    els.stage.addEventListener('touchend', function (e) {
      if (!touch || !e.changedTouches.length) return;
      var dx = e.changedTouches[0].clientX - touch.x;
      var dy = e.changedTouches[0].clientY - touch.y;
      touch = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        suppressClickUntil = Date.now() + 400;
        if (dx < 0) next(); else prev();
      }
    }, { passive: true });
  }

  function sides() {
    return S.settings.frontSide === 'english' ? ['english', 'latin'] : ['latin', 'english'];
  }

  function fillFace(container, card, side) {
    container.textContent = '';
    container.className = 'face-content side-' + side;
    container.appendChild(side === 'latin' ? D.latinNode(card, 'p') : D.englishNode(card, 'p'));
  }

  function setFlipped(value) {
    flipped = value;
    els.card.classList.toggle('is-flipped', flipped);
    els.faceFront.setAttribute('aria-hidden', flipped ? 'true' : 'false');
    els.faceBack.setAttribute('aria-hidden', flipped ? 'false' : 'true');
  }

  function announce() {
    var card = deck[index];
    if (!card) return;
    var side = sides()[flipped ? 1 : 0];
    var text = side === 'latin' ? card.latin : card.english;
    els.live.textContent = 'Card ' + (index + 1) + ' of ' + deck.length + ', ' + (flipped ? 'back' : 'front') +
      ' (' + (side === 'latin' ? 'Latin' : 'English') + '): ' + text;
  }

  function render() {
    var card = deck[index];
    if (!card) return;
    // Show the front of the new card instantly – no flip animation that could leak the answer.
    els.card.classList.add('no-anim');
    setFlipped(false);
    var s = sides();
    fillFace(els.frontContent, card, s[0]);
    fillFace(els.backContent, card, s[1]);
    els.frontCh.textContent = els.backCh.textContent = 'Ch ' + card.chapter;
    void els.card.offsetWidth;
    els.card.classList.remove('no-anim');

    els.progress.textContent = (index + 1) + ' / ' + deck.length;
    els.bar.style.width = ((index + 1) / deck.length * 100) + '%';
    var atStart = index === 0, atEnd = index === deck.length - 1;
    var focusLost = (atStart && document.activeElement === els.prev) || (atEnd && document.activeElement === els.next);
    els.prev.disabled = atStart;
    els.next.disabled = atEnd;
    els.end.hidden = !atEnd;
    if (focusLost) els.card.focus();
    els.shuffleBtn.setAttribute('aria-pressed', S.settings.shuffle ? 'true' : 'false');
    announce();
  }

  function flip() {
    if (!active) return;
    setFlipped(!flipped);
    announce();
  }

  function next() { if (index < deck.length - 1) { index++; render(); } }
  function prev() { if (index > 0) { index--; render(); } }

  function start(cards) {
    if (!els) init();
    original = cards.slice();
    deck = S.settings.shuffle ? D.shuffle(original) : original.slice();
    index = 0;
    active = true;
    render();
  }

  function stop() { active = false; }

  function reorderKeepingCurrent() {
    var current = deck[index];
    if (S.settings.shuffle) {
      var rest = original.filter(function (c) { return c !== current; });
      deck = [current].concat(D.shuffle(rest));
      index = 0;
    } else {
      deck = original.slice();
      index = Math.max(0, deck.indexOf(current));
    }
  }

  function onSettings(key) {
    if (!active) return;
    if (key === 'shuffle' || key === '*') reorderKeepingCurrent();
    if (key === 'shuffle' || key === 'frontSide' || key === '*') render();
  }

  function isTextField(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  /** Returns true if the key was handled. */
  function onKey(e) {
    if (!active) return false;
    var t = e.target;
    if (isTextField(t)) return false;
    var onOtherButton = t && t.tagName === 'BUTTON' && t !== els.prev && t !== els.next;
    switch (e.key) {
      case 'ArrowLeft': prev(); return true;
      case 'ArrowRight': next(); return true;
      case ' ':
      case 'Spacebar':
        if (onOtherButton) return false;
        if (!e.repeat) flip();
        return true;
      case 'Enter':
        if (t === els.card) { if (!e.repeat) flip(); return true; }
        return false;
      case 'Escape':
      case 'Esc':
        Trainer.App.goHome();
        return true;
    }
    return false;
  }

  Trainer.Learn = { start: start, stop: stop, onKey: onKey, onSettings: onSettings, focus: function () { els && els.card.focus(); } };
})(window);
