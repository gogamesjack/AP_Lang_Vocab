(() => {
  'use strict';
  const FALLBACK_WORDS = [
    { word: 'Intransigence', hint: 'In-tran-si-gence', definition: 'Stubborn refusal to change your mind or compromise' },
    { word: 'Chagrin', hint: 'Cha-grin', definition: 'A feeling of embarrassment or disappointment' },
    { word: 'Predilection', hint: 'Pre-di-lec-tion', definition: 'A strong liking or preference for something' },
    { word: 'Incontrovertible', hint: 'In-con-tro-ver-ti-ble', definition: 'So clearly true that it cannot reasonably be disputed' },
    { word: 'Equivocate', hint: 'E-qui-vo-cate', definition: 'To avoid giving a clear or direct answer' },
    { word: 'Incongruous', hint: 'In-con-gru-ous', definition: 'Strange or out of place because something does not fit' },
    { word: 'Acquiesce', hint: 'Ac-qui-esce', definition: 'To accept or agree to something without resisting' },
    { word: 'Paradox', hint: 'Para-dox', definition: 'A seeming contradiction that may reveal a truth' },
    { word: 'Asyndeton', hint: 'A-syn-de-ton', definition: 'The omission of conjunctions between words or phrases' },
    { word: 'Polysyndeton', hint: 'Poly-syn-de-ton', definition: 'The use of multiple conjunctions in close succession' }
  ];
  const WORDS = Array.isArray(window.SPELLWELL_WORDS) ? window.SPELLWELL_WORDS : FALLBACK_WORDS;
  const WEEK = window.SPELLWELL_WEEK || 1;
  const LEGACY_KEY = `spellwell.best.ap-lang-vocab-${WEEK}`;
  const BEST_COOKIE = `spellwell.best.week-${WEEK}`;
  const TIMES_COOKIE = `spellwell.times.week-${WEEK}`;
  const app = document.getElementById('app');
  const fmt = s => { s = Math.floor(s); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` };
  let order = [], index = 0, attempts = 0, misses = {}, correct = 0, start = 0, tick = null, locked = false, best = readBest();

  function readCookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const cookie = document.cookie.split('; ').find(part => part.startsWith(prefix));
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
  }

  function writeCookie(name, value) {
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; max-age=31536000; path=/; samesite=lax`;
  }

  function clearCookie(name) {
    document.cookie = `${encodeURIComponent(name)}=; max-age=0; path=/; samesite=lax`;
  }

  function readTimes() {
    try {
      const value = JSON.parse(readCookie(TIMES_COOKIE) || '[]');
      return Array.isArray(value) ? value.filter(time => Number.isFinite(Number(time))).map(Number) : [];
    } catch (_) {
      return [];
    }
  }

  function readBest() {
    const cookieBest = Number(readCookie(BEST_COOKIE));
    if (cookieBest > 0) return cookieBest;

    const times = readTimes();
    if (times.length) return Math.min(...times);

    try {
      const legacyBest = Number(localStorage.getItem(LEGACY_KEY));
      if (legacyBest > 0) {
        writeCookie(BEST_COOKIE, String(legacyBest));
        writeCookie(TIMES_COOKIE, JSON.stringify([legacyBest]));
        return legacyBest;
      }
    } catch (_) { }
    return null;
  }

  function saveTime(seconds) {
    const times = readTimes();
    times.push(seconds);
    writeCookie(TIMES_COOKIE, JSON.stringify(times));

    const newBest = best === null || seconds < best ? seconds : best;
    best = newBest;
    writeCookie(BEST_COOKIE, String(newBest));

    try {
      localStorage.setItem(LEGACY_KEY, String(newBest));
    } catch (_) { }
  }

  function readWeekTimes(week) {
    try {
      const value = JSON.parse(readCookie(`spellwell.times.week-${week}`) || '[]');
      return Array.isArray(value) ? value.filter(time => Number.isFinite(Number(time))).map(Number) : [];
    } catch (_) {
      return [];
    }
  }

  function scoreGraph(times) {
    if (!times.length) return '<p class="no-history">No scores yet</p>';

    const width = 320;
    const height = 92;
    const padding = 10;
    const max = Math.max(...times);
    const min = Math.min(...times);
    const range = max - min || 1;
    const points = times.map((time, i) => {
      const x = times.length === 1 ? width / 2 : padding + i * (width - padding * 2) / (times.length - 1);
      const y = padding + (time - min) * (height - padding * 2) / range;
      return [x, y];
    });
    const polyline = points.map(point => point.join(',')).join(' ');
    const circles = points.map((point, i) =>
      `<circle cx="${point[0]}" cy="${point[1]}" r="4" fill="#287956"><title>Run ${i + 1}: ${fmt(times[i])}</title></circle>`
    ).join('');

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Score progression for ${times.length} runs">
      <polyline points="${polyline}" fill="none" stroke="#287956" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${circles}
    </svg>
    <div class="history-labels"><span>Run 1</span><span>${times.map(fmt).join(' · ')}</span></div>`;
  }

  function clearWeekScores(week) {
    clearCookie(`spellwell.best.week-${week}`);
    clearCookie(`spellwell.times.week-${week}`);
    try {
      localStorage.removeItem(`spellwell.best.ap-lang-vocab-${week}`);
    } catch (_) { }
  }

  function loadIndexTimes() {
    document.querySelectorAll('[data-week]').forEach(row => {
      const week = row.dataset.week;
      const times = readWeekTimes(week);
      const bestValue = times.length ? Math.min(...times) : Number(readCookie(`spellwell.best.week-${week}`));
      const label = row.querySelector('.week-link small');
      if (label) label.textContent = bestValue > 0 ? `Best ${fmt(bestValue)} · Practice →` : '10 words →';

      const history = row.querySelector('.score-history');
      if (history) history.innerHTML = scoreGraph(times);
    });

    document.querySelectorAll('[data-clear-week]').forEach(button => {
      button.addEventListener('click', () => {
        const week = button.dataset.clearWeek;
        if (!window.confirm(`Clear all saved scores for Week ${week}?`)) return;
        clearWeekScores(week);
        location.reload();
      });
    });
  }

  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function intro() { clearInterval(tick); const times = readTimes(); app.innerHTML = `<section class="screen"><div class="intro"><div class="spark">✳</div><h1>Words worth knowing.</h1><p class="sub">A quick spelling round for your AP Lang vocabulary. Read the definition, type the word, and build your streak one answer at a time.</p><div class="list-preview"><b>${WORDS.length} words</b> · hints appear after two misses<br><b>Retry once</b> after an incorrect spelling, with a letter-distance clue</div><div class="actions"><button class="btn primary" id="start">Start practicing&nbsp; →</button><a class="btn secondary" href="index.html">← Home</a></div>${best !== null ? `<div class="bestbox"><small>PERSONAL BEST</small><strong>${fmt(best)}</strong></div>` : ''}${times.length ? `<div class="saved-times"><small>SAVED TIMES</small><p>${times.map(fmt).join(' · ')}</p></div>` : ''}</div></section>`; document.getElementById('start').onclick = begin; }
  function begin() { order = WORDS.map((_, i) => i).sort(() => Math.random() - .5); index = 0; attempts = 0; misses = {}; correct = 0; start = performance.now(); render(); tick = setInterval(updateTimer, 250); }
  function updateTimer() { const el = document.getElementById('timer'); if (el) el.textContent = fmt((performance.now() - start) / 1000); }
  function render() { if (index >= order.length) { finish(); return } const item = WORDS[order[index]]; attempts = 0; locked = false; app.innerHTML = `<section class="quiz"><div class="topline"><span class="eyebrow">SESSION PROGRESS</span><span class="timer" id="timer">${fmt((performance.now() - start) / 1000)}</span></div><div class="track" role="progressbar" aria-label="Words completed" aria-valuemin="0" aria-valuemax="${WORDS.length}" aria-valuenow="${correct}"><div class="fill" style="width:${correct / WORDS.length * 100}%"></div></div><div class="prompt-card"><span class="tag">✦ &nbsp;WORD ${String(correct + 1).padStart(2, '0')} OF ${WORDS.length}</span><p class="prompt-label">Spell the word that means:</p><p class="definition">${escapeHtml(item.definition)}</p><div class="entry-wrap"><label class="sr" for="answer">Your spelling</label><input id="answer" class="answer" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type your answer…"><p id="feedback" class="feedback" aria-live="polite">Press Enter or use the button to check.</p><div class="actions"><button class="btn primary" id="check">Check spelling&nbsp; ↗</button></div></div></div><div class="bottom"><span class="stat">Completed <strong>${correct}</strong> / ${WORDS.length}</span><a class="home-link" href="index.html">← Home</a><span>Take your time · missed words return later</span></div></section>`; const input = document.getElementById('answer'); input.focus(); input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }); document.getElementById('check').onclick = submit; }
  // Levenshtein distance: minimum insertions, deletions, and substitutions between strings.
  function distance(a, b) { a = a.toLocaleLowerCase(); b = b.toLocaleLowerCase(); let prev = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { const row = [i]; for (let j = 1; j <= b.length; j++)row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = row } return prev[b.length] }
  function submit() {
    if (locked) return; const input = document.getElementById('answer'), feedback = document.getElementById('feedback'), given = input.value.trim(), item = WORDS[order[index]]; if (!given) { feedback.textContent = 'Type your spelling above to check it.'; return } if (given.toLocaleLowerCase() === item.word.toLocaleLowerCase()) { locked = true; correct++; feedback.className = 'feedback good'; feedback.textContent = 'That’s it! Nice work.'; burst(); const bar = app.querySelector('.fill'); bar.style.width = `${correct / WORDS.length * 100}%`; app.querySelector('[role=progressbar]').setAttribute('aria-valuenow', correct); app.querySelector('.bottom strong').textContent = correct; setTimeout(() => { index++; render() }, 650); return }
    attempts++; const key = item.word.toLocaleLowerCase(); misses[key] = (misses[key] || 0) + 1; const d = distance(given, item.word); feedback.className = misses[key] >= 2 ? 'feedback hint' : 'feedback bad'; if (attempts === 1) { feedback.textContent = `Not quite — ${d} letter${d === 1 ? '' : 's'} away by edit distance. Try once more; it may have been a typo.`; input.value = ''; input.focus(); return }
    locked = true; order.push(order[index]); const hint = misses[key] >= 2 ? ` Hint: ${item.hint}.` : ''; feedback.textContent = `Still not quite — ${d} letter${d === 1 ? '' : 's'} away. Press Enter to continue; this word will come around again.${hint}`; const button = document.getElementById('check'); button.textContent = 'Continue  →'; button.onclick = () => { if (!locked) return; index++; if (index >= order.length) { finish(); return } render() }; input.disabled = true; input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); button.click() } }); button.focus();
  }
  function burst() { const root = document.getElementById('confetti'), colors = ['#287956', '#80bb87', '#e4b552', '#ed8e77', '#87b8c8', '#b99bd0']; const rect = app.getBoundingClientRect(), cx = rect.left + rect.width / 2, cy = rect.top + rect.height * .52; for (let i = 0; i < 24; i++) { const p = document.createElement('i'); p.className = 'piece'; p.style.left = `${cx}px`; p.style.top = `${cy}px`; p.style.background = colors[i % colors.length]; p.style.setProperty('--dx', `${(Math.random() - .5) * 300}px`); p.style.setProperty('--dy', `${(Math.random() - .7) * 230}px`); p.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`); root.appendChild(p); setTimeout(() => p.remove(), 900) } }
  function finish() { clearInterval(tick); const seconds = (performance.now() - start) / 1000; saveTime(seconds); app.innerHTML = `<section class="screen"><div class="finish"><div class="spark">✦</div><h1>Beautifully done.</h1><p class="sub">You practiced all ${WORDS.length} words in AP Lang Vocab ${WEEK}.</p><div class="bestbox"><div style="display:flex;justify-content:space-around;gap:25px"><div><small>YOUR TIME</small><strong>${fmt(seconds)}</strong></div><div><small>PERSONAL BEST</small><strong>${fmt(best)}</strong></div></div></div><div class="actions"><button class="btn primary" id="again">Practice again&nbsp; →</button><a class="btn secondary" href="index.html">← Home</a></div></div></section>`; document.getElementById('again').onclick = intro }
  if (app) intro();
  else loadIndexTimes();
})();
