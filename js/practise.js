/*
 * Practise mode: session queue, multiple-choice and typed questions, results.
 */
(function (root) {
  'use strict';
  var Trainer = root.Trainer;
  var D = Trainer.Data, S = Trainer.State, Checker = Trainer.Checker;
  var el = D.el;

  function $(id) { return document.getElementById(id); }

  var els = null;
  var session = null;
  var current = null;
  var active = false;
  var keysDown = {};
  var awaitingRelease = false;

  var MACRONS = ['ā', 'ē', 'ī', 'ō', 'ū'];
  var DIR_LABEL = { 'la-en': 'Latin → English', 'en-la': 'English → Latin' };

  function init() {
    els = {
      meta: $('q-meta'), instruction: $('q-instruction'), prompt: $('q-prompt'), body: $('q-body'),
      feedback: $('q-feedback'), next: $('next-btn'), bar: $('practise-bar'), progressbar: $('practise-progressbar'),
      progress: $('practise-progress'), hint: $('practise-kbd-hint')
    };
    els.prompt.setAttribute('tabindex', '-1');
    els.next.addEventListener('click', function () { if (current && current.answered) advance(); });
    $('end-session-btn').addEventListener('click', endSession);
    $('practise-missed-btn').addEventListener('click', function () {
      if (!session || !session.missedOrder.length) return;
      start(session.missedOrder.slice(), { pool: session.pool, applySize: false, label: 'missed' });
    });
    $('new-session-btn').addEventListener('click', function () { Trainer.App.startPractiseFromSelection(); });
    $('change-chapters-btn').addEventListener('click', function () { Trainer.App.goHome(true); });

    document.addEventListener('keydown', function (e) { keysDown[e.key] = true; }, true);
    document.addEventListener('keyup', function (e) {
      delete keysDown[e.key];
      if (!Object.keys(keysDown).length) awaitingRelease = false;
    }, true);
    root.addEventListener('blur', function () { keysDown = {}; awaitingRelease = false; });
  }

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------

  /**
   * @param cards  words for this session
   * @param opts   { pool: cards for distractors, applySize: bool }
   */
  function start(cards, opts) {
    if (!els) init();
    opts = opts || {};
    var list = D.shuffle(cards);
    var size = S.settings.sessionSize;
    if (opts.applySize !== false && size !== 'all' && Number(size) < list.length) list = list.slice(0, Number(size));
    var firstStage = S.settings.typeMc ? 'mc' : 'typed';
    session = {
      cards: list,
      pool: opts.pool || cards.slice(),
      total: list.length,
      queue: list.map(function (c) { return { card: c, stage: firstStage }; }),
      completed: {}, completedCount: 0,
      attempted: {}, attemptedCount: 0,
      missed: {}, missedOrder: [],
      questions: 0,
      lastId: null,
      dirHistory: []
    };
    active = true;
    current = null;
    Trainer.App.show('practise');
    updateProgress();
    nextQuestion();
  }

  function insertAt(idx, item) {
    if (idx >= session.queue.length) session.queue.push(item);
    else session.queue.splice(idx, 0, item);
  }

  function effectiveStage(stage) {
    var st = S.settings;
    if (stage === 'mc' && !st.typeMc) return 'typed';
    if (stage === 'typed' && !st.typeTyped) return 'mc';
    return stage;
  }

  function pickDirection() {
    var st = S.settings, dirs = [];
    if (st.dirLaEn) dirs.push('la-en');
    if (st.dirEnLa) dirs.push('en-la');
    var h = session.dirHistory, d;
    if (dirs.length === 1) d = dirs[0];
    else {
      var last3 = h.slice(-3);
      if (last3.length === 3 && last3[0] === last3[1] && last3[1] === last3[2]) {
        d = last3[0] === 'la-en' ? 'en-la' : 'la-en';
      } else {
        d = Math.random() < 0.5 ? 'la-en' : 'en-la';
      }
    }
    h.push(d);
    if (h.length > 10) h.shift();
    return d;
  }

  function updateProgress() {
    var done = session.completedCount, total = session.total;
    els.progress.textContent = done + ' / ' + total + ' words';
    els.bar.style.width = (total ? done / total * 100 : 0) + '%';
    els.progressbar.setAttribute('aria-valuemax', String(total));
    els.progressbar.setAttribute('aria-valuenow', String(done));
    els.progressbar.setAttribute('aria-valuetext', done + ' of ' + total + ' words completed');
  }

  function nextQuestion() {
    if (!session.queue.length) { finish(true); return; }
    var i = 0;
    if (session.queue.length > 1 && session.queue[0].card.id === session.lastId) {
      for (var j = 1; j < session.queue.length; j++) {
        if (session.queue[j].card.id !== session.lastId) { i = j; break; }
      }
    }
    var item = session.queue.splice(i, 1)[0];
    current = {
      item: item,
      card: item.card,
      type: effectiveStage(item.stage),
      direction: pickDirection(),
      // Settings changed mid-question only take effect from the next question.
      check: { strictness: S.settings.strictness, requireMacrons: S.settings.requireMacrons },
      answered: false,
      applied: false,
      correct: false
    };
    renderQuestion();
  }

  function markMissed(card) {
    if (!session.missed[card.id]) {
      session.missed[card.id] = true;
      session.missedOrder.push(card);
    }
  }

  // Apply the result of the answered question to the queue (deferred until
  // "Next" so that "I was actually right" can still change it).
  function applyOutcome() {
    var q = current;
    if (!q || !q.answered || q.applied) return;
    q.applied = true;
    var card = q.card;
    if (q.correct) {
      if (q.type === 'mc' && S.settings.typeTyped) {
        insertAt(D.randInt(2, 5), { card: card, stage: 'typed' });    // 3–6 questions later
      } else if (!session.completed[card.id]) {
        session.completed[card.id] = true;
        session.completedCount++;
      }
    } else {
      markMissed(card);
      insertAt(D.randInt(1, 3), { card: card, stage: q.type });        // 2–4 questions later
    }
    session.lastId = card.id;
    updateProgress();
  }

  function recordAnswer(correct) {
    current.answered = true;
    current.correct = correct;
    session.questions++;
    if (!session.attempted[current.card.id]) {
      session.attempted[current.card.id] = true;
      session.attemptedCount++;
    }
    awaitingRelease = Object.keys(keysDown).length > 0;
  }

  function advance() {
    applyOutcome();
    nextQuestion();
  }

  function endSession() {
    if (!session) return;
    applyOutcome();
    finish(false);
  }

  // ---------------------------------------------------------------------------
  // Rendering questions
  // ---------------------------------------------------------------------------

  function renderQuestion() {
    var q = current, card = q.card;
    els.meta.textContent = DIR_LABEL[q.direction] + ' · ' + (q.type === 'mc' ? 'Multiple choice' : 'Typed') + ' · Ch ' + card.chapter;
    var instr;
    if (q.type === 'mc') instr = q.direction === 'la-en' ? 'Choose the English meaning' : 'Choose the Latin word';
    else instr = q.direction === 'la-en' ? 'Type the English meaning' : 'Type the Latin word (dictionary form)';
    els.instruction.textContent = instr;

    els.prompt.textContent = '';
    els.prompt.className = 'q-prompt prompt-' + (q.direction === 'la-en' ? 'latin' : 'english');
    els.prompt.appendChild(q.direction === 'la-en' ? D.latinNode(card, 'p') : D.englishNode(card, 'p'));

    els.feedback.textContent = '';
    els.feedback.className = 'q-feedback';
    els.next.hidden = true;
    els.body.textContent = '';

    if (q.type === 'mc') {
      renderMc();
      els.hint.innerHTML = '<kbd>1</kbd>–<kbd>4</kbd> choose · <kbd>Enter</kbd> next';
      els.prompt.focus({ preventScroll: true });
    } else {
      renderTyped();
      els.hint.innerHTML = '<kbd>Enter</kbd> check · <kbd>Enter</kbd> again for the next question';
    }
  }

  function optionText(card, direction) { return direction === 'la-en' ? card.english : card.latin; }

  function pickDistractors(card, direction) {
    function choose(pool, chosen) {
      var target = optionText(card, direction).length;
      var scored = pool.filter(function (c) { return !Checker.isConfusable(card, c); }).map(function (c) {
        var len = optionText(c, direction).length;
        return {
          c: c,
          s: (c.type === card.type ? 0 : 1.5) + Math.abs(len - target) / Math.max(target, 8) + Math.random() * 0.9
        };
      }).sort(function (a, b) { return a.s - b.s; });
      for (var i = 0; i < scored.length && chosen.length < 3; i++) {
        var c = scored[i].c;
        var clash = chosen.some(function (x) {
          return Checker.isConfusable(x, c) || optionText(x, direction) === optionText(c, direction);
        });
        if (!clash) chosen.push(c);
      }
      return chosen;
    }
    var chosen = choose(session.pool, []);
    if (chosen.length < 3) chosen = choose(D.cards, chosen);
    return chosen;
  }

  function renderMc() {
    var q = current;
    var options = D.shuffle([q.card].concat(pickDistractors(q.card, q.direction)));
    q.options = options;
    var list = el('div', 'options');
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', 'Answer options');
    q.optionButtons = options.map(function (c, i) {
      var b = el('button', 'option');
      b.type = 'button';
      b.appendChild(el('span', 'opt-key', String(i + 1))).setAttribute('aria-hidden', 'true');
      var text = el('span', 'opt-text');
      text.appendChild(q.direction === 'la-en' ? D.englishNode(c) : D.latinNode(c));
      b.appendChild(text);
      b.appendChild(el('span', 'opt-mark'));
      b.addEventListener('click', function () { answerMc(i); });
      list.appendChild(b);
      return b;
    });
    els.body.appendChild(list);
  }

  function answerMc(i) {
    var q = current;
    if (!q || q.answered || q.type !== 'mc' || !q.options[i]) return;
    var correct = q.options[i] === q.card;
    recordAnswer(correct);
    q.optionButtons.forEach(function (b, j) {
      b.disabled = true;
      var mark = b.querySelector('.opt-mark');
      if (q.options[j] === q.card) {
        b.classList.add('is-correct');
        mark.textContent = j === i ? '✓ Your answer – correct' : '✓ Correct answer';
      } else if (j === i) {
        b.classList.add('is-wrong');
        mark.textContent = '✗ Your answer';
      } else {
        b.classList.add('is-dimmed');
      }
    });
    renderFeedback(correct ? 'correct' : 'wrong', correct ? 'Correct!' : 'Not quite', []);
  }

  function renderTyped() {
    var q = current;
    var form = el('form', 'typed-form');
    form.setAttribute('novalidate', '');
    form.setAttribute('autocomplete', 'off');
    var label = el('label', 'sr-only', q.direction === 'la-en' ? 'Your answer in English' : 'Your answer in Latin');
    label.setAttribute('for', 'answer-input');
    var input = el('input', 'answer-input');
    input.id = 'answer-input';
    input.type = 'text';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('enterkeyhint', 'done');
    input.setAttribute('lang', q.direction === 'la-en' ? 'en' : 'la');
    input.placeholder = q.direction === 'la-en' ? 'English meaning…' : 'Latin word…';
    form.appendChild(label);
    form.appendChild(input);

    if (q.direction === 'en-la') {
      var row = el('div', 'macron-row');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', 'Insert a letter with a macron');
      MACRONS.forEach(function (ch) {
        var b = el('button', 'macron-btn', ch);
        b.type = 'button';
        b.setAttribute('aria-label', 'Insert ' + ch);
        b.addEventListener('mousedown', function (e) { e.preventDefault(); });   // keep focus in the input
        b.addEventListener('click', function () { insertAtCursor(input, ch); });
        row.appendChild(b);
      });
      form.appendChild(row);
    }

    var actions = el('div', 'typed-actions');
    var check = el('button', 'btn primary', 'Check');
    check.type = 'submit';
    var dk = el('button', 'btn ghost', 'I don’t know');
    dk.type = 'button';
    actions.appendChild(check);
    actions.appendChild(dk);
    form.appendChild(actions);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submitTyped(input.value);
    });
    dk.addEventListener('click', dontKnow);
    q.input = input;
    q.form = form;
    els.body.appendChild(form);
    input.focus({ preventScroll: false });
  }

  function insertAtCursor(input, ch) {
    if (input.readOnly) return;
    var start = input.selectionStart, end = input.selectionEnd;
    if (start == null) { input.value += ch; }
    else {
      input.value = input.value.slice(0, start) + ch + input.value.slice(end);
      input.setSelectionRange(start + ch.length, start + ch.length);
    }
    input.focus();
  }

  function lockTyped() {
    var q = current;
    q.input.readOnly = true;
    q.input.setAttribute('aria-readonly', 'true');
    Array.prototype.forEach.call(q.form.querySelectorAll('button'), function (b) { b.disabled = true; });
  }

  function submitTyped(value) {
    var q = current;
    if (!q || q.answered || q.type !== 'typed') return;
    var result = Checker.checkAnswer(q.card, q.direction, value, q.check, D.db);
    if (result.verdict === 'empty') {
      els.feedback.textContent = '';
      els.feedback.className = 'q-feedback is-hint';
      els.feedback.appendChild(el('p', 'gentle', 'Type your answer first – or press “I don’t know” to see it.'));
      q.input.focus();
      return;
    }
    q.result = result;
    q.typed = value;
    var correct = result.verdict !== 'wrong';
    recordAnswer(correct);
    lockTyped();
    q.input.classList.add(correct ? 'is-correct' : 'is-wrong');
    if (!correct) q.input.setAttribute('aria-invalid', 'true');
    var lines = [];
    if (result.verdict === 'wrong') lines.push('You wrote: ' + showTyped(q, value));
    lines = lines.concat(result.notes);
    var kind = result.verdict === 'correct' ? 'correct' : result.verdict === 'correct-with-note' ? 'note' : 'wrong';
    var title = kind === 'correct' ? 'Correct!' : kind === 'note' ? 'Correct' : 'Not quite';
    renderFeedback(kind, title, lines, kind === 'wrong');
  }

  // Latin answers are shown in italics, English answers in quotes.
  function showTyped(q, value) {
    var v = String(value || '').trim().replace(/\*/g, '');
    return q.direction === 'en-la' ? '*' + v + '*' : '‘' + v + '’';
  }

  function dontKnow() {
    var q = current;
    if (!q || q.answered) return;
    recordAnswer(false);
    q.dontKnow = true;
    lockTyped();
    renderFeedback('reveal', 'Here’s the answer', []);
  }

  function override() {
    var q = current;
    if (!q || !q.answered || q.applied || q.correct) return;
    q.correct = true;
    q.overridden = true;
    if (q.input) { q.input.classList.remove('is-wrong'); q.input.classList.add('is-correct'); q.input.removeAttribute('aria-invalid'); }
    renderFeedback('override', 'Marked as correct', ['Counted as correct. You wrote: ' + showTyped(q, q.typed)]);
  }

  function renderFeedback(kind, title, lines, showOverride) {
    var q = current, card = q.card;
    var fb = els.feedback;
    fb.textContent = '';
    fb.className = 'q-feedback is-' + kind;

    var head = el('p', 'verdict');
    var icon = { correct: '✓', note: '✓', override: '✓', wrong: '✗', reveal: '→' }[kind];
    head.appendChild(el('span', 'verdict-icon', icon)).setAttribute('aria-hidden', 'true');
    head.appendChild(el('strong', null, title));
    fb.appendChild(head);

    if (lines.length) {
      var ul = el('ul', 'notes');
      lines.forEach(function (l) { ul.appendChild(D.richText(l, 'li')); });
      fb.appendChild(ul);
    }

    if (q.direction === 'en-la') {
      var also = card.aliases.map(function (id) { return D.byId[id].headword; })
        .concat(card.accept)
        .filter(function (h, i, arr) { return h !== card.headword && arr.indexOf(h) === i; });
      if (also.length) fb.appendChild(D.richText('Also accepted: ' + also.map(function (h) { return '*' + h + '*'; }).join(', '), 'p')).className = 'also';
    }

    var reveal = el('div', 'reveal');
    var r1 = el('div', 'reveal-row');
    r1.appendChild(el('span', 'reveal-label', 'Latin'));
    r1.appendChild(D.latinNode(card));
    var r2 = el('div', 'reveal-row');
    r2.appendChild(el('span', 'reveal-label', 'English'));
    r2.appendChild(D.englishNode(card));
    reveal.appendChild(r1);
    reveal.appendChild(r2);
    fb.appendChild(reveal);

    if (showOverride) {
      var ob = el('button', 'btn small ghost override-btn', 'I was actually right');
      ob.type = 'button';
      ob.addEventListener('click', function () { override(); els.next.focus(); });
      fb.appendChild(ob);
    }

    els.next.hidden = false;
    els.next.textContent = '';
    els.next.appendChild(document.createTextNode(session.queue.length || !q.correct || (q.type === 'mc' && S.settings.typeTyped) ? 'Next ' : 'See results '));
    els.next.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="9 18 15 12 9 6"/></svg>');
    els.next.focus({ preventScroll: true });
    if (els.next.scrollIntoView) {
      try { els.next.scrollIntoView({ block: 'nearest', behavior: Trainer.App.reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { /* old browsers */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------

  function finish(completedAll) {
    active = false;
    var s = session;
    $('results-title').textContent = completedAll ? 'Session complete' : 'Session ended';
    $('results-subtitle').textContent = completedAll
      ? 'You worked through all ' + s.total + ' words.'
      : 'Results cover the ' + s.attemptedCount + ' word' + (s.attemptedCount === 1 ? '' : 's') + ' you attempted.';
    $('stat-completed').textContent = s.completedCount + ' / ' + s.total;
    var firstTry = s.attemptedCount ? Math.round((s.attemptedCount - s.missedOrder.length) / s.attemptedCount * 100) : null;
    $('stat-accuracy').textContent = firstTry == null ? '–' : firstTry + '%';
    $('stat-questions').textContent = String(s.questions);

    var list = $('missed-list');
    list.textContent = '';
    s.missedOrder.forEach(function (c) {
      var li = el('li', 'missed-item');
      li.appendChild(D.latinNode(c));
      li.appendChild(el('span', 'missed-sep', ' – ')).setAttribute('aria-hidden', 'true');
      li.appendChild(D.englishNode(c));
      li.appendChild(el('span', 'missed-ch', 'Ch ' + c.chapter));
      list.appendChild(li);
    });
    var none = !s.missedOrder.length;
    list.hidden = none;
    $('missed-title').hidden = none && !s.attemptedCount;
    $('no-missed').hidden = !none || !s.attemptedCount;
    $('no-missed').textContent = 'No mistakes – excellent work!';
    $('practise-missed-btn').disabled = none;
    Trainer.App.show('results');
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  function isTextField(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  function onKey(e) {
    if (!active || !current) return false;
    var t = e.target;
    if (!current.answered) {
      if (current.type === 'mc' && /^[1-4]$/.test(e.key) && !isTextField(t) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!e.repeat) answerMc(Number(e.key) - 1);
        return true;
      }
      return false;
    }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      if (e.repeat || awaitingRelease) return true;           // need a fresh key press
      if (t && t.tagName === 'BUTTON' && t !== els.next) return false;
      advance();
      return true;
    }
    return false;
  }

  Trainer.Practise = {
    start: start,
    onKey: onKey,
    isActive: function () { return active; },
    stop: function () { active = false; },
    // Read-only peek used by manual/automated UI checks.
    _debug: function () { return { session: session, current: current }; }
  };
})(window);
