/*
 * Automated tests for js/checker.js and the generated data/vocab.js.
 *   Node:    node tests/checker-tests.js
 *   Browser: open tests/tests.html
 */
(function (root) {
  'use strict';

  function run(Checker, VOCAB, report) {
    var passed = 0, failed = 0, failures = [];
    var db = Checker.buildDb(VOCAB);

    function ok(cond, name, detail) {
      if (cond) { passed++; report(true, name); }
      else { failed++; failures.push(name); report(false, name, detail); }
    }

    function card(latin, english) {
      var list = db.cards.filter(function (c) {
        return c.latin === latin && (!english || c.english === english);
      });
      if (list.length !== 1) throw new Error('Test card not unique/found: ' + latin + ' :: ' + english + ' (' + list.length + ')');
      return list[0];
    }

    var LENIENT = { strictness: 'lenient' };
    var NORMAL = { strictness: 'normal' };
    var STRICT = { strictness: 'strict' };
    var MACRONS = { strictness: 'normal', requireMacrons: true };

    function notesText(r) { return r.notes.map(Checker.plainNote).join(' | '); }

    function expect(c, dir, typed, settings, verdicts, noteIncludes) {
      var r = Checker.checkAnswer(c, dir, typed, settings, db);
      var allowed = [].concat(verdicts);
      var good = allowed.indexOf(r.verdict) !== -1;
      var nt = notesText(r);
      if (good && noteIncludes) good = nt.toLowerCase().indexOf(noteIncludes.toLowerCase()) !== -1;
      var label = c.latin + ' [' + dir + '] "' + typed + '" (' + (settings.strictness || 'normal') +
        (settings.requireMacrons ? '+macrons' : '') + ') → ' + allowed.join('/') + (noteIncludes ? ' «' + noteIncludes + '»' : '');
      ok(good, label, 'got ' + r.verdict + ' (' + r.reason + ') notes: ' + nt);
      return r;
    }

    var CORRECT = ['correct', 'correct-with-note'];
    var ALL = [LENIENT, NORMAL, STRICT];

    // ---- Dataset ------------------------------------------------------------
    ok(VOCAB.length === 800, 'dataset has 800 entries', 'found ' + VOCAB.length);
    var perCh = {};
    VOCAB.forEach(function (v) { perCh[v.chapter] = (perCh[v.chapter] || 0) + 1; });
    var chOk = true;
    for (var ch = 1; ch <= 40; ch++) if (perCh[ch] !== 20) chOk = false;
    ok(chOk && Object.keys(perCh).length === 40, '40 chapters × 20 entries');
    ok(VOCAB.every(function (v) { return v.latin && v.latin.trim() && v.english && v.english.trim(); }), 'no empty latin/english');
    ok(VOCAB.every(function (v) { return v.latin === v.latin.normalize('NFC') && v.english === v.english.normalize('NFC'); }), 'all text is NFC');
    ok(VOCAB.every(function (v) { return (v.chapter <= 16 ? 1 : v.chapter <= 32 ? 2 : 3) === v.book; }), 'book numbers match chapters');
    var ids = {};
    ok(VOCAB.every(function (v) { if (ids[v.id]) return false; ids[v.id] = 1; return true; }), 'ids are unique');
    ok(db.byId['6-5'].latin === 'ē, ex + abl.', 'id 6-5 is ē, ex + abl.');

    // ---- Parsing ------------------------------------------------------------
    [
      ['puella, puellam f.', 'puella'], ['paucī pl.', 'paucī'], ['quam + superlative', 'quam'],
      ['sub + acc. or abl.', 'sub'], ['neque … neque …', 'neque … neque'], ['quis? quid?', 'quis? quid?'],
      ['ita vērō', 'ita vērō'], ['poenās dō, dare, dedī, datus', 'poenās dō'], ['quam … !', 'quam'],
      ['līberī, līberōs m. pl.', 'līberī'], ['ā, ab + abl.', 'ā'], ['resistō, resistere, restitī + dat.', 'resistō']
    ].forEach(function (p) {
      ok(Checker.parseHeadword(p[0]) === p[1], 'headword of "' + p[0] + '" is "' + p[1] + '"', 'got "' + Checker.parseHeadword(p[0]) + '"');
    });
    ok(JSON.stringify(Checker.parseOtherForms('cōnor, cōnārī, cōnātus sum')) === JSON.stringify(['cōnārī', 'cōnātus sum']), 'other forms of cōnor');
    ok(JSON.stringify(Checker.parseOtherForms('quisquis, quicquid/quidquid')) === JSON.stringify(['quicquid', 'quidquid']), 'other forms split on /');
    ok(JSON.stringify(Checker.parseOtherForms('cōpiae, cōpiārum, f. pl.')) === JSON.stringify(['cōpiārum']), 'labels removed from other forms');
    var wage = Checker.parseSenses('wage (war); wear (clothes)');
    ok(wage[0].keys.indexOf('wage') !== -1 && wage[0].keys.indexOf('wage war') !== -1, 'parenthetical text optional: wage (war)');
    var utS = Checker.parseSenses('(+ subj.) that, so that');
    ok(utS[0].keys.join() === 'that', '(+ subj.) grammar note removed from sense', utS[0].keys.join());
    var eq = Checker.parseSenses('horseman; pl. = cavalry');
    ok(eq[1].keys[0] === 'cavalry', 'pl. = X sense is X');
    ok(Checker.parseSenses('I')[0].keys[0] === 'i', 'sense "I" keeps the I');
    ok(Checker.normLatin('Juvenis') === 'iuuenis' && Checker.normLatin('veniō') === 'uenio', 'u/v and i/j mapping');
    ok(Checker.normLatin('ōrō', true) === 'ōrō' && Checker.normLatin('ōrō') === 'oro', 'macrons kept/stripped');
    ok(Checker.normLatin('cǽsar') === 'caesar' || Checker.normLatin('cæsar') === 'caesar', 'æ → ae');
    ok(Checker.normEnglish("don’t") === Checker.normEnglish("don't") && Checker.normEnglish("don't") === 'do not', 'apostrophes removed');
    ok(Checker.damerau('slpee', 'sleep') === 2 && Checker.damerau('sleep', 'sleep') === 0 && Checker.damerau('ab', 'ba') === 1, 'Damerau–Levenshtein');

    // ---- Latin → English ----------------------------------------------------
    var dormio = card('dormiō');
    ALL.forEach(function (s) {
      expect(dormio, 'la-en', 'sleep', s, 'correct');
      expect(dormio, 'la-en', 'i sleep', s, 'correct');
      expect(dormio, 'la-en', 'to sleep', s, 'correct');
      expect(dormio, 'la-en', 'I SLEEP!', s, 'correct');
    });
    expect(dormio, 'la-en', 'slep', NORMAL, 'correct-with-note', 'small typo');
    expect(dormio, 'la-en', 'slep', STRICT, 'wrong');
    expect(dormio, 'la-en', 'sleeping', LENIENT, CORRECT);
    expect(dormio, 'la-en', 'sleeping', NORMAL, 'wrong');
    expect(dormio, 'la-en', 'sleeping', STRICT, 'wrong');

    var capio = card('capiō, capere');
    expect(capio, 'la-en', 'catch', NORMAL, 'correct');
    expect(capio, 'la-en', 'take, catch', NORMAL, 'correct');
    expect(capio, 'la-en', 'take, catch', STRICT, 'correct');
    expect(capio, 'la-en', 'adopt a plan', NORMAL, 'correct');
    expect(capio, 'la-en', 'adopt', NORMAL, 'correct');
    expect(capio, 'la-en', 'take or capture', NORMAL, 'correct');
    expect(capio, 'la-en', 'grab', NORMAL, 'wrong', 'rapiō');

    var rideo = card('rīdeō');
    expect(rideo, 'la-en', 'smile, laugh', STRICT, 'correct');
    expect(rideo, 'la-en', 'smile and laugh', STRICT, 'correct');
    expect(rideo, 'la-en', 'laugh, cry', STRICT, 'wrong', 'cry');
    expect(rideo, 'la-en', 'laugh, cry', NORMAL, CORRECT);
    expect(rideo, 'la-en', 'laugh; cry', LENIENT, CORRECT);

    var est = card('est');
    ['it is', 'she is', 'is', 'he is', 'he/she/it is', 'He / she / it is'].forEach(function (t) {
      expect(est, 'la-en', t, NORMAL, 'correct');
    });
    expect(est, 'la-en', 'he/she/it is', STRICT, 'correct');

    var utAs = card('ut', 'as');
    expect(utAs, 'la-en', 'when', NORMAL, 'correct');
    expect(utAs, 'la-en', 'so that', NORMAL, 'correct');
    expect(card('quam … !'), 'la-en', 'than', NORMAL, 'correct');

    var honor = card('honor, honōris, m.');
    expect(honor, 'la-en', 'honor', NORMAL, 'correct');
    expect(honor, 'la-en', 'honour', NORMAL, 'correct');
    expect(card('faveō, favēre, fāvī, fautus + dat.'), 'la-en', 'favor', STRICT, 'correct');
    expect(card('intellegō, intellegere, intellēxī'), 'la-en', 'realise', STRICT, 'correct');

    expect(card('ego'), 'la-en', 'I', STRICT, 'correct');
    expect(card('ego'), 'la-en', 'me', NORMAL, 'wrong');
    expect(card('sum'), 'la-en', 'I am', STRICT, 'correct');
    expect(card('tū'), 'la-en', 'you', STRICT, 'correct');
    expect(card('tū'), 'la-en', 'you (singular)', STRICT, 'correct');
    expect(card('nōlō, nōlle'), 'la-en', "don't want", STRICT, 'correct');
    expect(card('nōlō, nōlle'), 'la-en', 'do not want', STRICT, 'correct');
    expect(card('nec … nec …'), 'la-en', 'neither … nor …', STRICT, 'correct');
    expect(card('nec … nec …'), 'la-en', 'neither nor', STRICT, 'correct');
    expect(card('neque … neque …'), 'la-en', 'neither...nor', NORMAL, 'correct');
    expect(card('quam … !'), 'la-en', 'how', STRICT, 'correct');
    expect(card('Rōmae'), 'la-en', 'in Rome', STRICT, 'correct');
    expect(card('Rōmae'), 'la-en', 'at/in Rome', STRICT, 'correct');
    expect(card('eques, equitis, m.'), 'la-en', 'cavalry', STRICT, 'correct');
    expect(card('gerō, gerere, gessī, gestus'), 'la-en', 'wage war', STRICT, 'correct');
    expect(card('gerō, gerere, gessī, gestus'), 'la-en', 'wage', STRICT, 'correct');
    expect(card('nōs'), 'la-en', 'WE', STRICT, 'correct');
    expect(card('silva, silvam f.'), 'la-en', 'word', NORMAL, 'wrong', 'verbum');
    expect(dormio, 'la-en', '   ', NORMAL, 'empty');
    expect(dormio, 'la-en', '…', NORMAL, 'empty');

    // ---- English → Latin ----------------------------------------------------
    var puer = card('puer, puerum m.');
    expect(puer, 'en-la', 'puer', NORMAL, 'correct');
    expect(puer, 'en-la', 'pver', NORMAL, 'correct');
    expect(puer, 'en-la', 'Puer', STRICT, 'correct');
    expect(puer, 'en-la', 'puella', NORMAL, 'wrong', 'puella means ‘girl’');
    expect(puer, 'en-la', 'puerum', NORMAL, 'correct-with-note', 'dictionary form is puer');

    var puella = card('puella, puellam f.');
    expect(puella, 'en-la', 'poella', NORMAL, 'correct-with-note', 'small typo');
    expect(puella, 'en-la', 'poella', STRICT, 'wrong');
    expect(puella, 'en-la', 'puer', NORMAL, 'wrong', 'puer means ‘boy’');

    var rex = card('rēx, rēgem m.');
    expect(rex, 'en-la', 'rex', NORMAL, 'correct', 'with macrons: rēx');
    expect(rex, 'en-la', 'rēx', NORMAL, 'correct');
    expect(rex, 'en-la', 'reks', NORMAL, 'wrong');
    expect(rex, 'en-la', 'rēx', MACRONS, 'correct');
    expect(rex, 'en-la', 'rex', MACRONS, 'wrong', 'check the macrons: rēx');

    var amo = card('amō, amāre, amāvī');
    expect(amo, 'en-la', 'amo', NORMAL, 'correct');
    expect(amo, 'en-la', 'amō', STRICT, 'correct');
    expect(amo, 'en-la', 'amor', NORMAL, 'wrong', 'amor means ‘love’ (noun) – the verb is amō');
    expect(amo, 'en-la', 'amor', LENIENT, 'wrong');
    expect(amo, 'en-la', 'amare', NORMAL, 'correct-with-note', 'dictionary form is amō');
    expect(amo, 'en-la', 'amare', LENIENT, 'correct-with-note');
    expect(amo, 'en-la', 'amare', STRICT, 'wrong', 'give the dictionary form: amō');
    expect(amo, 'en-la', 'amo, amare, amavi', STRICT, 'correct');
    expect(amo, 'en-la', 'amo amare amavi', NORMAL, 'correct');

    var ab = card('ā, ab + abl.', 'from, away from');
    expect(ab, 'en-la', 'a', NORMAL, 'correct');
    expect(ab, 'en-la', 'ab', NORMAL, 'correct');
    expect(ab, 'en-la', 'ā', MACRONS, 'correct');
    expect(ab, 'en-la', 'ab', MACRONS, 'correct');
    expect(ab, 'en-la', 'a', MACRONS, 'wrong', 'check the macrons: ā');
    expect(ab, 'en-la', 'ex', NORMAL, 'correct-with-note', 'Also correct: ex');
    expect(ab, 'en-la', 'de', NORMAL, 'correct-with-note', 'Also correct: dē');
    expect(ab, 'en-la', 'a / ab', STRICT, 'correct');

    expect(card('iuvenis, iuvenem m.f.'), 'en-la', 'juvenis', NORMAL, 'correct');
    expect(card('iuvenis, iuvenem m.f.'), 'en-la', 'iuuenis', STRICT, 'correct');
    expect(card('veniō'), 'en-la', 'uenio', NORMAL, 'correct');
    expect(card('veniō'), 'en-la', 'VENIO', STRICT, 'correct');

    var itaVero = card('ita vērō');
    expect(itaVero, 'en-la', 'ita vero', NORMAL, 'correct');
    expect(itaVero, 'en-la', 'ita vērō', STRICT, 'correct');
    expect(itaVero, 'en-la', 'ita', NORMAL, 'wrong', 'ita means ‘so, in this way’');
    expect(itaVero, 'en-la', 'ita vero', MACRONS, 'wrong', 'check the macrons');

    expect(card('iter, iter n.'), 'en-la', 'via', NORMAL, 'correct-with-note', 'Also correct: via');
    expect(card('iterum'), 'en-la', 'rursus', NORMAL, 'correct-with-note', 'Also correct: rūrsus');
    expect(card('iterum'), 'en-la', 'iterum', NORMAL, 'correct');
    expect(card('necō, necāre, necāvī'), 'en-la', 'occido', NORMAL, 'correct-with-note', 'Also correct: occīdō');
    expect(card('necō, necāre, necāvī'), 'en-la', 'interficio', NORMAL, 'correct-with-note', 'Also correct: interficiō');
    expect(card('ē, ex + abl.'), 'en-la', 'ab', NORMAL, 'correct-with-note');

    expect(card('neque … neque …'), 'en-la', 'neque … neque …', STRICT, 'correct');
    expect(card('neque … neque …'), 'en-la', 'neque neque', STRICT, 'correct');
    expect(card('neque … neque …'), 'en-la', 'neque...neque', NORMAL, 'correct');
    expect(card('nec … nec …'), 'en-la', 'nec nec', NORMAL, 'correct');
    expect(card('nec … nec …'), 'en-la', 'neque neque', NORMAL, 'correct-with-note', 'Also correct');
    expect(card('poenās dō, dare, dedī, datus'), 'en-la', 'poenas do', NORMAL, 'correct');
    expect(card('poenās dō, dare, dedī, datus'), 'en-la', 'poenas dare', STRICT, 'correct');
    expect(card('quis? quid?'), 'en-la', 'quis? quid?', STRICT, 'correct');
    expect(card('quis? quid?'), 'en-la', 'quid', STRICT, 'correct');
    expect(card('quisquis, quicquid/quidquid'), 'en-la', 'quidquid', STRICT, 'correct');
    expect(card('seu, sīve'), 'en-la', 'sive', NORMAL, 'correct');
    expect(card('nōlō, nōlle'), 'en-la', "nolo'", NORMAL, 'correct');
    expect(card('dormiō'), 'en-la', 'somnus', NORMAL, 'wrong', 'somnus means ‘sleep’ (noun)');
    expect(card('vīs, vim, f.'), 'en-la', 'vir', NORMAL, 'wrong', 'vir means ‘man’');
    expect(card('sed'), 'en-la', 'set', NORMAL, 'wrong');
    expect(card('dexter, dextra, dextrum'), 'en-la', 'ius', NORMAL, 'wrong');
    expect(card('dexter, dextra, dextrum'), 'en-la', 'dextra', NORMAL, 'correct-with-note', 'dexter');
    expect(card('bonus, bona, bonum'), 'en-la', 'bona', NORMAL, 'correct-with-note', 'bonus');
    expect(card('dormiō'), 'en-la', '', NORMAL, 'empty');
    expect(card('dormiō'), 'en-la', 'dormio', MACRONS, 'wrong', 'dormiō');
    expect(card('dormiō'), 'en-la', 'dormīo', STRICT, 'correct');
    expect(card('puer, puerum m.'), 'en-la', 'puer, puella', NORMAL, 'correct');
    expect(card('puer, puerum m.'), 'en-la', 'puer, puella', STRICT, 'wrong');

    // ---- Homographs / aliases / distractor safety ---------------------------
    var amor = card('amor, amōris m.');
    ok(amo.aliases.indexOf(amor.id) === -1, 'amō and amor are not aliases (verb vs noun)');
    ok(card('servus').aliases.length === 0 && card('ancilla, ancillam f.').aliases.length === 0, '(male)/(female) cards have no aliases');
    ok(Checker.isConfusable(amo, amor), 'amō/amor never distractors for each other');
    ok(Checker.isConfusable(card('iterum'), card('rūrsus')), 'iterum/rūrsus are confusable');
    ok(!Checker.isConfusable(puer, puella), 'puer/puella may be distractors');
    ok(card('ut', 'as').groupIds.length === 3, 'three ut cards share a homograph group');

    return { passed: passed, failed: failed, failures: failures };
  }

  var api = { run: run };
  if (typeof module !== 'undefined' && module.exports && typeof require === 'function' && require.main === module) {
    var path = require('path');
    var Checker = require(path.join(__dirname, '..', 'js', 'checker.js'));
    var VOCAB = require(path.join(__dirname, '..', 'data', 'vocab.js'));
    var res = run(Checker, VOCAB, function (pass, name, detail) {
      if (!pass) console.log('FAIL  ' + name + (detail ? '\n      ' + detail : ''));
      else if (process.argv.indexOf('-v') !== -1) console.log('ok    ' + name);
    });
    console.log('\n' + res.passed + ' passed, ' + res.failed + ' failed');
    process.exit(res.failed ? 1 : 0);
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (root) {
    root.Trainer = root.Trainer || {};
    root.Trainer.CheckerTests = api;
  }
})(typeof window !== 'undefined' ? window : this);
