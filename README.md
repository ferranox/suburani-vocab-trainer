# Suburani Latin Vocabulary Trainer

A small static website for learning the 800 Latin words in *Suburani* Books 1–3 (Chapters 1–40, 20 words each).
It is plain HTML, CSS and JavaScript. There is no build step, nothing to install, and it makes no network requests.

## How to open it

Double-click **`index.html`**. It runs straight from the file system (`file://`) in current Chrome, Firefox, Safari and Edge, and works offline.

1. **Home:** tick one or more chapters (grouped by Book 1 / 2 / 3). Your selection is remembered.
2. **Learn:** flashcards. Click or tap the card (or press `Space`) to flip it. Use `←` / `→`, the arrow buttons or a swipe to move between cards. `Esc` goes back to Home.
3. **Practise:** multiple-choice and typed questions, followed by a results screen.
4. **Settings:** the gear icon in the header. Changes are saved automatically.

To run the tests, use `node tests/checker-tests.js` (add `-v` to list every test), or open `tests/tests.html` in a browser.

## Folder layout

```
suburani-vocab-trainer/
  index.html              all screens + settings modal
  README.md
  css/style.css           light/dark themes via CSS custom properties
  data/vocab.js           GENERATED – window.VOCAB = [...800 entries...]
  js/checker.js           pure functions: normalising, parsing entries, answer checking (also loads in Node)
  js/data.js              builds the card database from window.VOCAB + small DOM helpers
  js/state.js             settings + chapter selection, localStorage persistence (falls back to memory)
  js/learn.js             flashcard mode
  js/practise.js          practise session queue, MC + typed questions, results
  js/app.js               screen routing, home screen, settings modal, keyboard handling
  tests/checker-tests.js  automated tests (Node or browser)
  tests/tests.html        runs the same tests in a browser
  tools/appendix-a.txt    the vocabulary source (Appendix A, verbatim)
  tools/build-vocab.js    generator: appendix-a.txt → data/vocab.js (with verification)
```

All scripts are classic `<script>` tags that share one global, `window.Trainer`. ES modules and `fetch` are avoided because they don't work on `file://`.

### Regenerating the vocabulary

Edit `tools/appendix-a.txt`, then run:

```
node tools/build-vocab.js
```

The script stops with an error unless it finds exactly 40 chapters × 20 entries = 800, with no empty fields. Line format: `Latin :: English` or `Latin :: English :: accept=alt1 | alt2`.

## Changing the defaults

The defaults are in the `DEFAULTS` object at the top of **`js/state.js`**: question directions, question types, strictness, required macrons, words per session, flashcard front side, shuffle, and theme. Users who have already changed a setting keep their saved value. "Reset to defaults" in Settings, or clearing site data, brings back the new defaults.

## How the answer checker works (brief)

Everything is in `js/checker.js`, as pure functions.

- **Normalising:** text is converted to NFC and then NFD, and accents/macrons are stripped (unless *Require macrons* is on). It is then lower-cased, `æ/œ` become `ae/oe`, and apostrophes are removed. Other punctuation becomes a space and whitespace is collapsed. For Latin, `j→i` and `v→u`. For English, British and American spellings are treated as the same (`honour/honor`, `realise/realize`, …), `don't` = `do not`, and leading `I / I am / am / to / to be / be / a / an / the` words are optional.
- **Entry parsing:**
  - The **headword** is the first comma segment, without grammar notes or gender/number labels. For example, `sub + acc. or abl.` → `sub` and `poenās dō, dare…` → `poenās dō`.
  - **Other forms** are the remaining segments.
  - **Senses** come from splitting the gloss on `,` and `;`. Text in brackets is optional, `(+ subj.)`-style notes are removed, `pl. = X` becomes `X`, and `a/b` gives you `a`, `b` or both. So `he/she/it is` also accepts `is`.
- **Latin → English:** each sense of the card is accepted. Senses of every card with the same macron-stripped headword are also accepted (homographs like *ut*, *quam*, *dum*).
- **English → Latin:** the checker accepts:
  - the headword and any `accept=` alternatives
  - the headwords of **alias** cards (cards whose glosses share a sense, e.g. *iterum* / *rūrsus*), shown as "Also correct: X".
  
  Another listed form of the right word (e.g. `amāre`) is correct with a note, except in Strict mode.
- **Order of checks for each typed piece:**
  1. exact match
  2. (Lenient) English inflection
  3. another form of the word
  4. **different-word guard:** the input exactly matches another word in the dataset, so it is wrong and the note says what that word means
  5. typo tolerance (Damerau–Levenshtein, limit based on the length of the expected answer)
- **Several answers:** the whole input is tried first. After that it is split on `, ; /` and `or` (and `and` as a last resort for English). For Latin, it is finally split on spaces. Lenient and Normal need one valid piece. Strict needs every piece to be valid.
- The result is `{ verdict: 'correct' | 'correct-with-note' | 'wrong' | 'empty', reason, matchedAnswer, notes[], suggestion }`.

## Decisions I made

These are points the brief left open, and what I chose:

- **Data pipeline:** Appendix A is copied verbatim to `tools/appendix-a.txt`. A Node script generates `data/vocab.js` from it. Card ids are `chapter-position` (e.g. `6-5` = ē, ex). Derived fields (headword, forms, senses, aliases, word type) are computed when the page loads, by `Checker.buildDb`.
- **Word type** (verb / noun / adjective / other) is read from the entry's shape: gender labels, infinitive endings, three adjective endings or `-is` genitives. Many Book 1 entries have no grammatical information (e.g. `frāter`, `magnus`, `est`). For 33 of those, a small override table in `checker.js` supplies the type.
- **Aliases must have the same word type.** That's why *amō* (verb) and *amor* (noun) are not aliases, even though both mean "love". It also separates *dexter* (adj., "right") from *iūs* (noun, "right") and *līber* (adj., "free") from *līberō* (verb, "free"). *via* / *iter* (both nouns, "way") are still aliases, as the brief requires.
- **Alias senses are compared more narrowly:** only leading `I / to / a / an / the` are stripped, not `am / be`. Otherwise *valeō* ("be well") and *bene* ("well"), or *adsum* ("I am here") and *hīc* ("here"), would become synonyms.
- **Senses are also split at `?` or `!` when more text follows,** so `who? what?` gives two senses and `how …? how …!` gives `how`.
- **The different-word message appears whenever a wrong answer exactly matches another word** (e.g. *amor* for *amō*, *puella* for *puer*), not only when it is within typo range. This was more helpful.
- **Multiple Latin pieces in Strict mode:** extra pieces that are principal parts of the right word (e.g. `amō, amāre, amāvī`) are allowed, as long as the dictionary form is also given. Showing more knowledge shouldn't be punished.
- **Correct answers typed without macrons** get the verdict `correct`, with an informational note ("With macrons: *rēx*"). The verdict `correct-with-note` is used for typos, other forms, aliases and Lenient inflections.
- **Lenient inflection** uses simple English stemming: `-ing`, `-ed`, `-ies`, `-es`, `-s`, `-ly`, then a final `-e` and doubled consonants are removed.
- **Typo tolerance** is based on the number of letters (spaces not counted) in the expected answer.
- **Multiple-choice options:** for English → Latin questions they show the full Latin entry, with the headword in bold. Distractors come from the session's chapters, preferring the same word type and similar length. Anything confusable is never used: aliases, homographs, identical glosses, or any shared sense.
- **First-try accuracy** = words attempted that were never answered wrong ÷ words attempted.
- **"I was actually right"** changes the result before the queue is updated (the update happens on *Next*), so the word is treated exactly like a correct answer. "I don't know" counts as wrong and has no override.
- **Wrong answers** come back at the same stage they were asked at (MC stays MC, typed stays typed).
- **Settings changed during a question:** the question type, direction and strictness for the current question are fixed when it is shown. Changes apply from the next question.
- **Practise missed words** uses all the missed words and ignores "Words per session". It still draws distractors from the original chapters.
- **Shuffle:** the Shuffle toggle on the Learn screen and the "Shuffle flashcards" setting are the same thing. Turning it on keeps the current card and shuffles the rest behind it; turning it off returns to the original order at the same card. The *Shuffle* button in the end-of-deck message reshuffles, restarts from card 1, and turns the setting on.
- **Esc in Practise does nothing,** so a session isn't lost by accident. Use *End session*. Clicking the app name during a session asks for confirmation before leaving.
- **Settings modal:** I used a custom `role="dialog"` modal instead of `<dialog>`. It makes the rest of the page `inert`, traps Tab, and closes on Esc, a click on the overlay, or the Close/✕ buttons. When only one option of a pair is ticked, that box is disabled and a note explains why.
- **"Book 1/2/3 select all/none" button:** shows *Select none* when every chapter in that book is already selected, otherwise *Select all*.
- **Storage:** everything is stored under the localStorage key `suburani-vocab-trainer:v1`. If storage is unavailable, the app keeps working in memory without saving.
- `Trainer.Practise._debug()` gives a read-only view of the session, used for automated UI checks. It has no effect on the app.

## Caveats

- Aliases are worked out automatically from shared glosses. Some are broad because the English is ambiguous: for example, `that` accepts *ille / is / iste / ut / quīn*, and `he` accepts *hic / is / ille / iste*. In practice this is usually what you want for English → Latin, but it is not hand-curated.
- I tested in Chrome, both headless from `file://` and interactively. I did not run it in Safari or Firefox; it only uses standard ES2018 and CSS features they support (`color-mix` has a fallback).
