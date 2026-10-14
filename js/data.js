/*
 * Builds the in-memory card database from window.VOCAB (via the pure
 * Trainer.Checker.buildDb) and offers small helpers for the UI.
 */
(function (root) {
  'use strict';
  var Trainer = root.Trainer = root.Trainer || {};
  var Checker = Trainer.Checker;

  var db = Checker.buildDb(root.VOCAB || []);

  var BOOKS = [
    { number: 1, from: 1, to: 16 },
    { number: 2, from: 17, to: 32 },
    { number: 3, from: 33, to: 40 }
  ];

  var byChapter = {};
  db.cards.forEach(function (c) { (byChapter[c.chapter] = byChapter[c.chapter] || []).push(c); });

  function bookOf(chapter) {
    for (var i = 0; i < BOOKS.length; i++) {
      if (chapter >= BOOKS[i].from && chapter <= BOOKS[i].to) return BOOKS[i].number;
    }
    return 0;
  }

  function chaptersOfBook(n) {
    var b = BOOKS[n - 1], out = [];
    for (var c = b.from; c <= b.to; c++) out.push(c);
    return out;
  }

  /** Cards of the given chapters, in book/chapter/original order. */
  function cardsForChapters(chapters) {
    var sorted = chapters.slice().sort(function (a, b) { return a - b; });
    var out = [];
    sorted.forEach(function (ch) { out = out.concat(byChapter[ch] || []); });
    return out;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /** Latin entry as DOM: headword emphasised, other forms lighter. */
  function latinNode(card, tag) {
    var wrap = el(tag || 'span', 'latin-entry');
    wrap.setAttribute('lang', 'la');
    var latin = card.latin, head = card.headword;
    if (head && latin.indexOf(head) === 0) {
      wrap.appendChild(el('span', 'la-head', head));
      var rest = latin.slice(head.length);
      if (rest) wrap.appendChild(el('span', 'la-rest', rest));
    } else {
      wrap.appendChild(el('span', 'la-head', latin));
    }
    return wrap;
  }

  function englishNode(card, tag) {
    var e = el(tag || 'span', 'english-gloss', card.english);
    e.setAttribute('lang', 'en');
    return e;
  }

  /** Text with *markers* → DOM with <em>. */
  function richText(text, tag) {
    var node = el(tag || 'span');
    String(text).split(/(\*[^*]+\*)/).forEach(function (part) {
      if (!part) return;
      if (/^\*[^*]+\*$/.test(part)) node.appendChild(el('em', null, part.slice(1, -1)));
      else node.appendChild(document.createTextNode(part));
    });
    return node;
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

  Trainer.Data = {
    shuffle: shuffle,
    randInt: randInt,
    db: db,
    cards: db.cards,
    byId: db.byId,
    BOOKS: BOOKS,
    byChapter: byChapter,
    bookOf: bookOf,
    chaptersOfBook: chaptersOfBook,
    cardsForChapters: cardsForChapters,
    latinNode: latinNode,
    englishNode: englishNode,
    richText: richText,
    el: el
  };
})(window);
