/*
 * Suburani Vocab Trainer – answer checker.
 *
 * PURE functions only (no DOM, no randomness, no storage) so this file can be
 * loaded both by the browser (classic <script>, attaches to window.Trainer.Checker)
 * and by Node (module.exports) for the automated tests.
 *
 * Messages may contain *asterisks* around Latin / quoted words; the UI turns
 * those into <em> elements. Everything else is plain text.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Normalisation
  // ---------------------------------------------------------------------------

  var ALL_MARKS = /[\u0300-\u036f]/g;
  var NON_MACRON_MARKS = /[\u0300-\u0303\u0305-\u036f]/g;

  function str(s) { return s == null ? '' : String(s); }
  function nfc(s) { s = str(s); return s.normalize ? s.normalize('NFC') : s; }

  function stripMarks(s) {
    return nfc(s).normalize('NFD').replace(ALL_MARKS, '').normalize('NFC');
  }

  // Lowercase, ligatures, apostrophes, punctuation → space, collapse whitespace.
  function cleanText(s) {
    s = nfc(s).toLowerCase().replace(/æ/g, 'ae').replace(/œ/g, 'oe');
    s = s.replace(/['’‘ʼ`´]/g, '');
    s = s.replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  /** Latin normalisation. keepMacrons=true keeps only the macron mark (U+0304). */
  function normLatin(s, keepMacrons) {
    var t = nfc(s).normalize('NFD');
    t = t.replace(keepMacrons ? NON_MACRON_MARKS : ALL_MARKS, '').normalize('NFC');
    t = cleanText(t);
    return t.replace(/j/g, 'i').replace(/v/g, 'u');
  }

  var OUR_WORDS = /^(hon|dishon|fav|neighb|rum|col|behavi|lab|harb|hum|vig|ard|val|rig|splend|savi|vap|clam|od|arm)our(s|ed|ing|able|ably|ite|ites|hood|hoods)?$/;
  var ISE_WORDS = /^(real|recogn|organ|apolog|critic|emphas|civil|util|memor|sympath|summar|author|special|symbol|character|central|final|minim|maxim|harmon|ideal|terror|agon)is(e|es|ed|ing|ation|ations)$/;

  function spellingVariant(word) {
    if (OUR_WORDS.test(word)) return word.replace('our', 'or');
    if (ISE_WORDS.test(word)) return word.replace(/is(e|es|ed|ing|ation|ations)$/, 'iz$1');
    return word;
  }

  /** English normalisation (accents stripped, punctuation removed, US/UK spellings unified). */
  function normEnglish(s) {
    var t = cleanText(stripMarks(s));
    if (!t) return '';
    return t.split(' ').map(spellingVariant).join(' ')
      .replace(/\bdont\b/g, 'do not').replace(/\bdoesnt\b/g, 'does not').replace(/\bcannot\b/g, 'can not');
  }

  var LEADING_FULL = ['i am ', 'to be ', 'i ', 'am ', 'to ', 'be ', 'a ', 'an ', 'the '];
  var LEADING_ALIAS = ['i ', 'to ', 'a ', 'an ', 'the '];

  function stripLeading(k, list) {
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (k.indexOf(p) === 0 && k.length > p.length) {
          k = k.slice(p.length);
          changed = true;
          break;
        }
      }
    }
    return k;
  }

  /** Comparison key for English: normalised, optional leading words removed. */
  function englishKey(s) { return stripLeading(normEnglish(s), LEADING_FULL); }
  function aliasKeyOf(s) { return stripLeading(normEnglish(s), LEADING_ALIAS); }

  // ---------------------------------------------------------------------------
  // Parsing dictionary entries
  // ---------------------------------------------------------------------------

  function removeGrammarNotes(s) {
    return str(s)
      .replace(/\bor\s+abl\.?/g, ' ')
      .replace(/\+\s*(abl|acc|dat|subj|indic)\.?/g, ' ')
      .replace(/\+\s*superlative/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var LABEL_TOKEN = /(^|\s)(m\.\s?f\.|m\.|f\.|n\.|pl\.)(?=\s|$)/g;

  function removeLabels(s) {
    var prev;
    s = str(s);
    do { prev = s; s = s.replace(LABEL_TOKEN, ' '); } while (s !== prev);
    return s.replace(/\s+/g, ' ').trim();
  }

  /** The main word the student types for English → Latin. */
  function parseHeadword(latin) {
    var first = nfc(latin).split(',')[0];
    var h = removeLabels(removeGrammarNotes(first));
    h = h.replace(/(\s*…)+\s*!?\s*$/, '');
    return h.replace(/\s+/g, ' ').trim();
  }

  /** Remaining comma-separated segments (principal parts, genitives, endings…). */
  function parseOtherForms(latin) {
    var segs = nfc(latin).split(',').slice(1);
    var head = parseHeadword(latin);
    var headWords = head.split(' ');
    var prefix = headWords.length > 1 ? headWords.slice(0, -1).join(' ') + ' ' : '';
    var out = [];
    segs.forEach(function (seg) {
      var s = removeLabels(removeGrammarNotes(seg).replace(/^\s*pl\.\s*/, ''));
      s.split('/').forEach(function (f) {
        f = f.trim();
        if (!f) return;
        // For multi-word headwords (poenās dō) the forms belong to the last word.
        if (prefix && f.indexOf(' ') === -1) f = prefix + f;
        if (out.indexOf(f) === -1) out.push(f);
      });
    });
    return out;
  }

  // Split on separators that are not inside parentheses.
  function splitTopLevel(s, isSep) {
    var out = [], depth = 0, cur = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '(') depth++;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if (depth === 0 && isSep(s, i)) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  var PRONOUNS = { he: 1, she: 1, it: 1, they: 1, we: 1, you: 1 };

  // "he/she/it is" → [whole, "he is", "she is", "it is", "is"]; "at/in Rome" → [whole, "at Rome", "in Rome"]
  function expandSlashes(text) {
    var m = /(\S+)\/(\S+(?:\/\S+)*)/.exec(text);
    if (!m) return [text];
    var token = m[0];
    var alts = token.split('/');
    var out = [text.replace(token, alts.join(' '))];
    alts.forEach(function (a) { out.push(text.replace(token, a)); });
    var allPronouns = alts.every(function (a) { return PRONOUNS[a.toLowerCase()]; });
    if (allPronouns) {
      var rest = text.replace(token, ' ').replace(/\s+/g, ' ').trim();
      if (rest) out.push(rest);
    }
    var result = [];
    out.forEach(function (o) {
      expandSlashes(o).forEach(function (x) {
        if (result.indexOf(x) === -1) result.push(x);
      });
    });
    return result;
  }

  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }

  /**
   * English senses of a gloss.
   * Returns [{ display, keys: [comparison keys], aliasKey }].
   */
  function parseSenses(english) {
    var gloss = nfc(english);
    var pieces = splitTopLevel(gloss, function (s, i) {
      var ch = s.charAt(i);
      if (ch === ';' || ch === ',') return true;
      // "who? what?" / "look! see!" / "how? in what way?" are separate senses.
      if ((ch === '?' || ch === '!') && /^\s+\S/.test(s.slice(i + 1))) return true;
      return false;
    });
    var senses = [];
    pieces.forEach(function (p) {
      p = p.trim().replace(/^pl\.\s*=\s*/, '');
      p = p.replace(/\(\s*\+[^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
      if (!p) return;
      var display = p.replace(/\s*[?!]+$/, '').trim() || p;
      var withoutParens = p.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
      var withParens = p.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
      var variants = [];
      uniq([withoutParens, withParens]).forEach(function (v) {
        variants = variants.concat(expandSlashes(v));
      });
      var keys = uniq(variants.map(englishKey));
      if (!keys.length) return;
      senses.push({ display: display, keys: keys, aliasKey: aliasKeyOf(withParens) });
    });
    return senses;
  }

  // ---------------------------------------------------------------------------
  // Rough word type (for distractors and alias compatibility)
  // ---------------------------------------------------------------------------

  // Book 1 lists many words without any grammatical information; these are
  // the ones whose type cannot be read off the entry's shape.
  var TYPE_OVERRIDES = {
    'frater': 'noun', 'hora': 'noun', 'insula': 'noun', 'pater': 'noun', 'seruus': 'noun',
    'turba': 'noun', 'uia': 'noun',
    'meus': 'adjective', 'magnus': 'adjective', 'infelix': 'adjective', 'laetus': 'adjective',
    'multus': 'adjective', 'omnis': 'adjective', 'primus': 'adjective', 'paruus': 'adjective',
    'perterritus': 'adjective', 'romanus': 'adjective', 'pulcher': 'adjective', 'totus': 'adjective',
    'tristis': 'adjective', 'tuus': 'adjective', 'ingens': 'adjective', 'noster': 'adjective',
    'difficilis': 'adjective', 'grauis': 'adjective', 'iratus': 'adjective', 'medius': 'adjective',
    'pauci': 'adjective',
    'es': 'verb', 'est': 'verb', 'coepi': 'verb', 'inquit': 'verb', 'aio': 'verb'
  };
  var PRONOUN_HEADS = /^(hic|is|qui|quidam|quisque|quicumque|quis|duo|tres|idem|ipse|iste|ille|uterque|aliquis|quisquam|quisquis)$/;
  var GENDER = /(^|[\s,])(m\.\s?f\.|m\.|f\.|n\.)(?=$|[\s,])/;

  function detectType(latin, english) {
    var head = parseHeadword(latin);
    var nh = normLatin(head);
    if (TYPE_OVERRIDES.hasOwnProperty(nh) && latin.indexOf(',') === -1) return TYPE_OVERRIDES[nh];
    if (/\+\s*(acc|abl)/.test(latin) && latin.indexOf(',') === -1) return 'other';
    if (GENDER.test(latin)) return 'noun';
    var segs = nfc(latin).split(',').map(function (s) { return normLatin(removeLabels(removeGrammarNotes(s))); })
      .filter(Boolean);
    if (segs.length >= 2) {
      var s2 = segs[1];
      if (PRONOUN_HEADS.test(segs[0])) return 'other';
      if (/(re|ri|sse|lle|se)$/.test(s2) || /\ssum$/.test(segs[segs.length - 1]) ||
          (/or$/.test(segs[0]) && /i$/.test(s2))) return 'verb';
      if (segs.length >= 3) return 'adjective';
      if (/is$/.test(s2)) return 'adjective';
      return 'other';
    }
    if (/^I \S/.test(english) && /o$/.test(nh)) return 'verb';
    if (/^I (am )?\S/.test(english) && english !== 'I') return 'verb';
    return 'other';
  }

  // ---------------------------------------------------------------------------
  // Database: cards + indexes for homographs, aliases and "different word" lookups
  // ---------------------------------------------------------------------------

  function hasGenderMarker(english) { return /\((fe)?male\)/i.test(english); }

  // Aliases must be the same rough word type, so amō (verb) ≠ amor (noun)
  // and dexter (adjective, "right") ≠ iūs (noun, "right").
  function typesCompatible(a, b) { return a === b; }

  /**
   * Build the in-memory card database from the raw VOCAB array.
   * Each card gains: headword, otherForms, senses, type, normHead,
   * aliases (array of ids), groupIds (homographs, incl. itself).
   */
  function buildDb(vocab) {
    var cards = vocab.map(function (v) {
      var latin = nfc(v.latin), english = nfc(v.english);
      var headword = parseHeadword(latin);
      return {
        id: v.id,
        book: v.book,
        chapter: v.chapter,
        latin: latin,
        english: english,
        accept: (v.accept || []).map(nfc),
        headword: headword,
        otherForms: parseOtherForms(latin),
        senses: parseSenses(english),
        type: detectType(latin, english),
        normHead: normLatin(headword),
        normEnglish: normEnglish(english),
        aliases: [],
        groupIds: []
      };
    });
    var byId = {};
    cards.forEach(function (c) { byId[c.id] = c; });

    var groups = {};
    cards.forEach(function (c) { (groups[c.normHead] = groups[c.normHead] || []).push(c.id); });
    cards.forEach(function (c) { c.groupIds = groups[c.normHead]; });

    // English sense key → card ids (all comparison keys)
    var senseIndex = {};
    // Latin headword/accept (normalised) → card ids
    var headIndex = {};
    var aliasIndex = {};
    cards.forEach(function (c) {
      c.keySet = {};
      c.senses.forEach(function (s) {
        s.keys.forEach(function (k) {
          c.keySet[k] = 1;
          var list = senseIndex[k] = senseIndex[k] || [];
          if (list.indexOf(c.id) === -1) list.push(c.id);
        });
        if (!hasGenderMarker(c.english)) {
          var al = aliasIndex[s.aliasKey] = aliasIndex[s.aliasKey] || [];
          if (al.indexOf(c.id) === -1) al.push(c.id);
        }
      });
      [c.headword].concat(c.accept).forEach(function (f) {
        var n = normLatin(f);
        var list = headIndex[n] = headIndex[n] || [];
        if (list.indexOf(c.id) === -1) list.push(c.id);
      });
    });

    cards.forEach(function (c) {
      if (hasGenderMarker(c.english)) return;
      c.senses.forEach(function (s) {
        (aliasIndex[s.aliasKey] || []).forEach(function (id) {
          var o = byId[id];
          if (o.normHead === c.normHead) return;
          if (!typesCompatible(o.type, c.type)) return;
          if (c.aliases.indexOf(id) === -1) c.aliases.push(id);
        });
      });
    });

    return { cards: cards, byId: byId, groups: groups, senseIndex: senseIndex, headIndex: headIndex };
  }

  function isAlias(card, otherId) { return card.aliases.indexOf(otherId) !== -1; }

  /** True if b must never be used as a multiple-choice distractor for a. */
  function isConfusable(a, b) {
    if (a.id === b.id) return true;
    if (a.normHead === b.normHead) return true;
    if (a.normEnglish === b.normEnglish) return true;
    if (a.aliases.indexOf(b.id) !== -1 || b.aliases.indexOf(a.id) !== -1) return true;
    for (var k in a.keySet) if (b.keySet[k]) return true;
    return false;
  }

  // ---------------------------------------------------------------------------
  // Distance + tolerance
  // ---------------------------------------------------------------------------

  /** Damerau–Levenshtein (optimal string alignment): adjacent swap counts as 1. */
  function damerau(a, b) {
    a = Array.from(a); b = Array.from(b);
    var n = a.length, m = b.length, i, j;
    if (!n) return m;
    if (!m) return n;
    var d = [];
    for (i = 0; i <= n; i++) { d[i] = [i]; }
    for (j = 0; j <= m; j++) { d[0][j] = j; }
    for (i = 1; i <= n; i++) {
      for (j = 1; j <= m; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        var v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
        d[i][j] = v;
      }
    }
    return d[n][m];
  }

  function typoTolerance(len, strictness) {
    if (strictness === 'strict') return 0;
    if (strictness === 'lenient') return len <= 3 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : 3;
    return len <= 3 ? 0 : len <= 7 ? 1 : 2;
  }

  function letterCount(s) { return s.replace(/\s/g, '').length; }

  // Lenient mode: very simple English inflection stripping (-s, -es, -ed, -ing, -ly).
  function stemWord(w) {
    if (w.length < 4) return w;
    var b = w;
    if (/ing$/.test(w)) b = w.slice(0, -3);
    else if (/ied$/.test(w) || /ies$/.test(w)) b = w.slice(0, -3) + 'y';
    else if (/ed$/.test(w)) b = w.slice(0, -2);
    else if (/ly$/.test(w)) b = w.slice(0, -2);
    else if (/es$/.test(w)) b = w.slice(0, -2);
    else if (/s$/.test(w) && !/ss$/.test(w)) b = w.slice(0, -1);
    if (b.length < 3) return w;
    b = b.replace(/e$/, '');
    b = b.replace(/([b-df-hj-np-tv-z])\1$/, '$1');
    return b;
  }
  function stemPhrase(k) { return k.split(' ').map(stemWord).join(' '); }

  // ---------------------------------------------------------------------------
  // Splitting typed answers
  // ---------------------------------------------------------------------------

  function splitAnswers(typed) {
    return str(typed).split(/[,;\/]|\s+or\s+/i).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  // ---------------------------------------------------------------------------
  // Combining piece results into one verdict
  // ---------------------------------------------------------------------------

  var RANK = { exact: 0, alias: 1, form: 2, inflection: 3, typo: 4 };

  function quote(s) { return '‘' + s + '’'; }

  function combine(results, ctx) {
    var strict = ctx.strictness === 'strict';
    var base = { matchedAnswer: null, notes: [], suggestion: ctx.suggestion, pieces: results };
    var hasHead = results.some(function (r) { return r.kind === 'exact' || r.kind === 'alias'; });

    function good(r) {
      if (r.kind === 'exact' || r.kind === 'alias' || r.kind === 'typo' || r.kind === 'inflection') return true;
      if (r.kind === 'form') return !strict || (hasHead && results.length > 1);
      return false;
    }

    var goods = results.filter(good);
    var bads = results.filter(function (r) { return !good(r); });

    if (goods.length && (!strict || !bads.length)) {
      goods.sort(function (a, b) { return RANK[a.kind] - RANK[b.kind]; });
      var best = goods[0];
      var out = Object.assign({}, base, { verdict: 'correct', reason: best.kind, matchedAnswer: best.answer });
      if (best.note) out.notes.push(best.note);
      if (best.kind !== 'exact' && !(best.kind === 'form' && hasHead)) out.verdict = 'correct-with-note';
      if (best.kind === 'form' && hasHead) out.notes = [];
      if (best.extraNote) out.notes.push(best.extraNote);
      if (bads.length) {
        out.notes.push('Not counted: ' + bads.map(function (r) { return quote(r.raw); }).join(', ') + '.');
      }
      return out;
    }

    var wrong = Object.assign({}, base, { verdict: 'wrong', reason: 'no-match' });
    if (strict && goods.length && bads.length) {
      wrong.reason = 'strict-extra';
      wrong.notes.push('In Strict mode every answer must be right – not accepted: ' +
        bads.map(function (r) { return quote(r.raw); }).join(', ') + '.');
      bads.forEach(function (r) { if (r.wrongNote) wrong.notes.push(r.wrongNote); });
      return wrong;
    }
    var order = ['macrons', 'form', 'other-word'];
    for (var i = 0; i < order.length; i++) {
      var hit = bads.filter(function (r) { return r.kind === order[i]; })[0];
      if (hit) {
        wrong.reason = order[i];
        if (hit.wrongNote) wrong.notes.push(hit.wrongNote);
        return wrong;
      }
    }
    return wrong;
  }

  // ---------------------------------------------------------------------------
  // Latin → English
  // ---------------------------------------------------------------------------

  function checkLaEn(card, typed, settings, db) {
    var strictness = settings.strictness;
    var valid = [];
    card.groupIds.forEach(function (id) {
      db.byId[id].senses.forEach(function (s) {
        s.keys.forEach(function (k) { valid.push({ key: k, display: s.display, cardId: id }); });
      });
    });
    var validByKey = {};
    valid.forEach(function (v) { if (!validByKey[v.key]) validByKey[v.key] = v; });

    function otherCardsFor(k) {
      return (db.senseIndex[k] || []).filter(function (id) {
        return card.groupIds.indexOf(id) === -1 && !isAlias(card, id);
      }).map(function (id) { return db.byId[id]; });
    }

    function otherWordNote(raw, others) {
      var names = uniq(others.map(function (o) { return '*' + o.headword + '*'; }));
      return quote(raw.trim()) + ' is ' + names.join(' / ') + ' – *' + card.headword + '* means ' + quote(card.english) + '.';
    }

    function matchPiece(raw) {
      var k = englishKey(raw);
      if (!k) return { kind: 'blank', raw: raw };
      if (validByKey[k]) return { kind: 'exact', raw: raw, answer: validByKey[k].display };
      if (strictness === 'lenient') {
        var sk = stemPhrase(k);
        for (var i = 0; i < valid.length; i++) {
          if (stemPhrase(valid[i].key) === sk) {
            return { kind: 'inflection', raw: raw, answer: valid[i].display,
              note: 'Correct – accepted ' + quote(raw.trim()) + ' for ' + quote(valid[i].display) + '.' };
          }
        }
      }
      var others = otherCardsFor(k);
      if (others.length) {
        return { kind: 'other-word', raw: raw, wrongNote: otherWordNote(raw, others) };
      }
      var best = null, bestD = Infinity;
      valid.forEach(function (v) {
        var tol = typoTolerance(letterCount(v.key), strictness);
        if (!tol) return;
        var d = damerau(k, v.key);
        if (d <= tol && d < bestD) { best = v; bestD = d; }
      });
      if (best) {
        return { kind: 'typo', raw: raw, answer: best.display,
          note: 'Correct – small typo: you wrote ' + quote(raw.trim()) + ', it’s ' + quote(best.display) + '.' };
      }
      return { kind: 'none', raw: raw };
    }

    var ctx = { strictness: strictness, suggestion: card.english };
    var whole = matchPiece(typed);
    if (RANK.hasOwnProperty(whole.kind)) return combine([whole], ctx);
    var pieces = splitAnswers(typed);
    if (pieces.length <= 1 && /\band\b/i.test(typed)) {
      pieces = str(typed).split(/\band\b/i).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    if (pieces.length <= 1) return combine([whole], ctx);
    var results = pieces.map(matchPiece).filter(function (r) { return r.kind !== 'blank'; });
    return combine(results.length ? results : [whole], ctx);
  }

  // ---------------------------------------------------------------------------
  // English → Latin
  // ---------------------------------------------------------------------------

  function checkEnLa(card, typed, settings, db) {
    var strictness = settings.strictness;
    var requireMacrons = !!settings.requireMacrons;

    var accepted = [];
    function addAccepted(form, kind, owner) {
      accepted.push({ form: form, kind: kind, owner: owner, norm: normLatin(form), normM: normLatin(form, true) });
    }
    addAccepted(card.headword, 'headword', card);
    card.accept.forEach(function (a) { addAccepted(a, 'accept', card); });
    card.aliases.forEach(function (id) {
      var o = db.byId[id];
      addAccepted(o.headword, 'alias', o);
      o.accept.forEach(function (a) { addAccepted(a, 'alias', o); });
    });
    var acceptedNorms = {};
    accepted.forEach(function (a) { acceptedNorms[a.norm] = 1; });

    var forms = [];
    function addForms(owner, dictCard) {
      owner.otherForms.forEach(function (f) {
        var n = normLatin(f);
        if (acceptedNorms[n]) return;
        forms.push({ form: f, dict: dictCard.headword, norm: n, normM: normLatin(f, true) });
      });
    }
    card.groupIds.forEach(function (id) { addForms(db.byId[id], card); });
    card.aliases.forEach(function (id) { addForms(db.byId[id], db.byId[id]); });

    function typeWord(t) { return t === 'other' ? '' : t; }

    function otherWordNote(raw, others) {
      var meanings = uniq(others.map(function (o) { return o.english; })).join('; ');
      var o = others[0];
      var shown = uniq(others.map(function (x) { return x.headword; }))[0];
      var tOther = typeWord(o.type), tCard = typeWord(card.type);
      if (others.length === 1 && tOther && tCard && tOther !== tCard) {
        return '*' + shown + '* means ' + quote(meanings) + ' (' + tOther + ') – the ' + tCard + ' is *' + card.headword + '*.';
      }
      return '*' + shown + '* means ' + quote(meanings) + ' – the answer is *' + card.headword + '*.';
    }

    function matchPiece(raw) {
      var p = normLatin(raw);
      if (!p) return { kind: 'blank', raw: raw };
      var pm = normLatin(raw, true);

      var plain = accepted.filter(function (a) { return a.norm === p; });
      if (plain.length) {
        plain.sort(function (a, b) { return (a.kind === 'alias') - (b.kind === 'alias'); });
        var withM = plain.filter(function (a) { return a.normM === pm; })[0];
        if (requireMacrons && !withM) {
          return { kind: 'macrons', raw: raw, wrongNote: 'Right word – check the macrons: *' + plain[0].form + '*.' };
        }
        var a = withM || plain[0];
        if (a.kind === 'alias') {
          return { kind: 'alias', raw: raw, answer: a.form,
            note: 'Also correct: *' + a.form + '*. This card’s word is *' + card.headword + '*.' };
        }
        var r = { kind: 'exact', raw: raw, answer: a.form };
        if (!withM) r.note = 'With macrons: *' + a.form + '*.';
        return r;
      }

      var f = forms.filter(function (x) { return x.norm === p; })[0];
      if (f) {
        if (requireMacrons && f.normM !== pm) {
          return { kind: 'macrons', raw: raw, wrongNote: 'Right word – check the macrons: *' + f.form + '*.' };
        }
        return { kind: 'form', raw: raw, answer: f.dict,
          note: 'Correct – *' + f.form + '* is another form of this word; the dictionary form is *' + f.dict + '*.',
          wrongNote: 'Right word – give the dictionary form: *' + f.dict + '*.' };
      }

      var others = (db.headIndex[p] || []).filter(function (id) {
        return card.groupIds.indexOf(id) === -1 && !isAlias(card, id);
      }).map(function (id) { return db.byId[id]; });
      if (others.length) return { kind: 'other-word', raw: raw, wrongNote: otherWordNote(raw, others) };

      var best = null, bestD = Infinity;
      accepted.forEach(function (a) {
        var tol = typoTolerance(letterCount(a.norm), strictness);
        if (!tol) return;
        var d = requireMacrons ? damerau(pm, a.normM) : damerau(p, a.norm);
        if (d <= tol && d < bestD) { best = a; bestD = d; }
      });
      if (best) {
        var note = 'Correct – small typo: you wrote *' + raw.trim() + '*, it’s *' + best.form + '*.';
        if (best.kind === 'alias') note += ' (This card’s word is *' + card.headword + '*.)';
        return { kind: 'typo', raw: raw, answer: best.form, note: note };
      }
      return { kind: 'none', raw: raw };
    }

    var ctx = { strictness: strictness, suggestion: card.headword };
    var whole = matchPiece(typed);
    if (whole.kind !== 'none') return combine([whole], ctx);

    var pieces = splitAnswers(typed);
    if (pieces.length > 1) {
      var res = pieces.map(matchPiece).filter(function (r) { return r.kind !== 'blank'; });
      if (res.some(function (r) { return r.kind !== 'none'; })) return combine(res, ctx);
    }
    var tokens = normLatin(typed).split(' ').filter(Boolean);
    if (tokens.length > 1) {
      var tres = tokens.map(matchPiece);
      if (tres.some(function (r) { return r.kind !== 'none'; })) return combine(tres, ctx);
    }
    return combine([whole], ctx);
  }

  // ---------------------------------------------------------------------------
  // Public entry point
  // ---------------------------------------------------------------------------

  /**
   * @param card       a card from buildDb()
   * @param direction  'la-en' (answer in English) or 'en-la' (answer in Latin)
   * @param typed      the student's text
   * @param settings   { strictness: 'lenient'|'normal'|'strict', requireMacrons: bool }
   * @param db         result of buildDb()
   * @returns { verdict: 'correct'|'correct-with-note'|'wrong'|'empty', reason, matchedAnswer, notes[], suggestion }
   */
  function checkAnswer(card, direction, typed, settings, db) {
    settings = settings || {};
    var s = {
      strictness: ['lenient', 'normal', 'strict'].indexOf(settings.strictness) !== -1 ? settings.strictness : 'normal',
      requireMacrons: !!settings.requireMacrons
    };
    var probe = direction === 'la-en' ? normEnglish(typed) : normLatin(typed);
    if (!probe) {
      return { verdict: 'empty', reason: 'empty', matchedAnswer: null, notes: ['Type an answer first – or choose “I don’t know”.'],
        suggestion: direction === 'la-en' ? card.english : card.headword, pieces: [] };
    }
    var r = direction === 'la-en' ? checkLaEn(card, typed, s, db) : checkEnLa(card, typed, s, db);
    r.notes = uniq(r.notes);
    return r;
  }

  /** Strip *markers* for plain-text use (tests, aria labels). */
  function plainNote(s) { return str(s).replace(/\*/g, ''); }

  var api = {
    stripMarks: stripMarks,
    normLatin: normLatin,
    normEnglish: normEnglish,
    englishKey: englishKey,
    parseHeadword: parseHeadword,
    parseOtherForms: parseOtherForms,
    parseSenses: parseSenses,
    detectType: detectType,
    buildDb: buildDb,
    isConfusable: isConfusable,
    damerau: damerau,
    typoTolerance: typoTolerance,
    splitAnswers: splitAnswers,
    checkAnswer: checkAnswer,
    plainNote: plainNote
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.Trainer = root.Trainer || {};
    root.Trainer.Checker = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
