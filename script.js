/**
 * FIFA World Cup 2026 — script.js
 * ─────────────────────────────────────────────────────────
 * HOW TO MAINTAIN:
 *   1. All match data lives in matches.json — edit that file.
 *   2. To add a new stage colour, add a CSS class to .card-stage-bar in style.css
 *      and map it in getStageBarClass() below.
 *   3. Countdown auto-targets the next upcoming match by date/time.
 *   4. Status auto-computes from current time vs match date/time.
 * ─────────────────────────────────────────────────────────
 */

// ── STATE ──────────────────────────────────────────────────────────────────
let allMatches = [];       // full data from matches.json
let filteredMatches = [];  // current view after filters
let countdownInterval = null;

// ── DOM REFS ───────────────────────────────────────────────────────────────
const matchesGrid     = document.getElementById('matchesGrid');
const noResults       = document.getElementById('noResults');
const resultsInfo     = document.getElementById('resultsInfo');
const nextMatchCard   = document.getElementById('nextMatchCard');
const searchInput     = document.getElementById('searchInput');
const stageFilter     = document.getElementById('stageFilter');
const groupFilter     = document.getElementById('groupFilter');
const cityFilter      = document.getElementById('cityFilter');
const dateFilter      = document.getElementById('dateFilter');
const resetBtn        = document.getElementById('resetFilters');
const noResultsReset  = document.getElementById('noResultsReset');
const themeToggle     = document.getElementById('themeToggle');
const themeIcon       = document.getElementById('themeIcon');
const lastUpdated     = document.getElementById('lastUpdated');

// ── BOOT ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  fetchMatches();
  themeToggle.addEventListener('click', toggleTheme);
  searchInput.addEventListener('input', applyFilters);
  stageFilter.addEventListener('change', applyFilters);
  groupFilter.addEventListener('change', applyFilters);
  cityFilter.addEventListener('change', applyFilters);
  dateFilter.addEventListener('change', applyFilters);
  resetBtn.addEventListener('click', clearFilters);
  noResultsReset.addEventListener('click', clearFilters);
});

// ── FETCH DATA ─────────────────────────────────────────────────────────────
/**
 * Loads matches.json (same folder) and initialises the page.
 * To add matches: edit matches.json — no JS changes needed.
 */
async function fetchMatches() {
  try {
    const res = await fetch('matches.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    allMatches = data.matches.map(enrichMatch);

    // Show last-updated date from JSON
    if (data.lastUpdated && lastUpdated) {
      lastUpdated.textContent = formatDate(data.lastUpdated);
    }

    populateCityFilter();
    applyFilters();
    renderNextMatch();
  } catch (err) {
    console.error('Could not load matches.json:', err);
    matchesGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted)">
        <p>⚠️ Unable to load match data. Please check that <code>matches.json</code> is in the same folder.</p>
        <p style="margin-top:8px;font-size:13px;">${err.message}</p>
      </div>`;
  }
}

// ── ENRICH MATCH ───────────────────────────────────────────────────────────
/**
 * Computes live status (upcoming / live / finished) and a JS Date object
 * from the match's date/time strings. This runs at page-load time.
 */
function enrichMatch(match) {
  // Parse datetime: assume Eastern Time (UTC-5 / UTC-4 DST)
  // For real-world use, replace with proper timezone handling (e.g. Luxon)
  const matchDate = parseMatchDate(match.date, match.time);
  const now = new Date();
  const endTime = new Date(matchDate.getTime() + 110 * 60 * 1000); // ~110 min window

  let status = 'upcoming';
  if (now > endTime) status = 'finished';
  else if (now >= matchDate) status = 'live';

  return { ...match, _date: matchDate, status };
}

/**
 * Converts date "YYYY-MM-DD" + time "HH:MM" to a local Date object.
 * The JSON stores times in ET; we approximate by treating them as local time
 * for broad demo purposes. Adjust offset logic for production.
 */
function parseMatchDate(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min]  = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0);
}

// ── CITY FILTER POPULATION ─────────────────────────────────────────────────
function populateCityFilter() {
  const cities = [...new Set(allMatches.map(m => m.city))].sort();
  cities.forEach(city => {
    const opt = document.createElement('option');
    opt.value = city;
    opt.textContent = city;
    cityFilter.appendChild(opt);
  });
}

// ── FILTERING ──────────────────────────────────────────────────────────────
/**
 * applyFilters() is called whenever any filter input changes.
 * All filtering happens on the already-loaded allMatches array — no re-fetch.
 */
function applyFilters() {
  const query  = searchInput.value.trim().toLowerCase();
  const stage  = stageFilter.value;
  const group  = groupFilter.value;
  const city   = cityFilter.value;
  const date   = dateFilter.value;   // "YYYY-MM-DD" or ""

  filteredMatches = allMatches.filter(m => {
    // Search: team names or city
    if (query) {
      const haystack = [
        m.homeTeam.name, m.awayTeam.name,
        m.homeTeam.code, m.awayTeam.code,
        m.city, m.stadium
      ].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    // Stage
    if (stage !== 'all' && m.stage !== stage) return false;
    // Group
    if (group !== 'all' && m.group !== group) return false;
    // City
    if (city !== 'all' && m.city !== city) return false;
    // Date
    if (date && m.date !== date) return false;

    return true;
  });

  renderMatches(filteredMatches);
  updateResultsInfo(filteredMatches.length, allMatches.length);
}

// ── CLEAR FILTERS ──────────────────────────────────────────────────────────
function clearFilters() {
  searchInput.value   = '';
  stageFilter.value   = 'all';
  groupFilter.value   = 'all';
  cityFilter.value    = 'all';
  dateFilter.value    = '';
  applyFilters();
}

// ── RENDER MATCHES ─────────────────────────────────────────────────────────
function renderMatches(matches) {
  matchesGrid.innerHTML = '';

  if (matches.length === 0) {
    noResults.classList.remove('hidden');
    return;
  }
  noResults.classList.add('hidden');

  // Group by date for visual order
  const sorted = [...matches].sort((a, b) => a._date - b._date);

  sorted.forEach((match, i) => {
    const card = buildMatchCard(match, i);
    matchesGrid.appendChild(card);
  });
}

/**
 * buildMatchCard() creates a DOM element for a single match.
 * To change card layout: edit this function and the .match-card CSS.
 */
function buildMatchCard(match, index) {
  const article = document.createElement('article');
  article.className = 'match-card' + (match.stage === 'Final' ? ' is-final' : '');
  article.setAttribute('role', 'listitem');
  article.setAttribute('aria-label', `${match.homeTeam.name} vs ${match.awayTeam.name}, ${match.stage}`);
  // Stagger animation delay
  article.style.animationDelay = `${Math.min(index * 0.04, 0.6)}s`;

  const stageBar = `<div class="card-stage-bar ${getStageBarClass(match.stage)}" aria-hidden="true"></div>`;

  const groupBadge = match.group
    ? `<span class="card-group-badge">Group ${match.group}</span>`
    : '';

  const statusHtml = `<span class="status-pill status-${match.status}" role="status">${capitalise(match.status)}</span>`;

  article.innerHTML = `
    ${stageBar}
    <div class="card-body">
      <div class="card-header">
        <div>
          <div class="card-stage">${match.stage}</div>
          ${groupBadge}
        </div>
        ${statusHtml}
      </div>
      <div class="card-teams">
        <div class="card-team">
          <span class="card-flag" aria-hidden="true">${match.homeTeam.flag}</span>
          <span class="card-team-name">${match.homeTeam.name}</span>
          <span class="card-team-code">${match.homeTeam.code}</span>
        </div>
        <span class="card-vs" aria-hidden="true">VS</span>
        <div class="card-team">
          <span class="card-flag" aria-hidden="true">${match.awayTeam.flag}</span>
          <span class="card-team-name">${match.awayTeam.name}</span>
          <span class="card-team-code">${match.awayTeam.code}</span>
        </div>
      </div>
    </div>
    <div class="card-footer">
      <div class="card-datetime">
        <span class="card-date">${formatDate(match.date)}</span>
        <span class="card-time">${match.time} ${match.timezone}</span>
      </div>
      <div class="card-venue">
        <div class="card-stadium">📍 ${match.stadium}</div>
        <div class="card-city">${match.city}</div>
      </div>
    </div>
  `;

  return article;
}

// ── NEXT MATCH FEATURED CARD ───────────────────────────────────────────────
/**
 * Finds the earliest upcoming (or live) match and renders it in the hero card.
 * Also kicks off the countdown timer.
 */
function renderNextMatch() {
  const now = new Date();
  const upcoming = allMatches
    .filter(m => m.status === 'upcoming' || m.status === 'live')
    .sort((a, b) => a._date - b._date);

  if (upcoming.length === 0) {
    nextMatchCard.innerHTML = '<p style="color:var(--text-muted);padding:20px 0">All matches have been played. 🏆</p>';
    return;
  }

  const match = upcoming[0];

  nextMatchCard.innerHTML = `
    <div>
      <div class="nm-stage">${match.stage}${match.group ? ' · Group ' + match.group : ''}</div>
      <div class="nm-teams">
        <div class="nm-team home">
          <span class="nm-flag" aria-hidden="true">${match.homeTeam.flag}</span>
          <span class="nm-name">${match.homeTeam.name}</span>
        </div>
        <span class="nm-vs" aria-hidden="true">VS</span>
        <div class="nm-team away">
          <span class="nm-flag" aria-hidden="true">${match.awayTeam.flag}</span>
          <span class="nm-name">${match.awayTeam.name}</span>
        </div>
      </div>
    </div>
    <div class="nm-meta">
      <div class="nm-date">${formatDate(match.date)}</div>
      <div class="nm-time">${match.time} ${match.timezone}</div>
      <div class="nm-venue">📍 ${match.stadium}, ${match.city}</div>
    </div>
  `;

  startCountdown(match._date);
}

// ── COUNTDOWN ──────────────────────────────────────────────────────────────
/**
 * Ticks every second and updates the four countdown units.
 * Clears automatically when the target time passes.
 */
function startCountdown(targetDate) {
  if (countdownInterval) clearInterval(countdownInterval);

  function tick() {
    const diff = targetDate - new Date();
    if (diff <= 0) {
      clearInterval(countdownInterval);
      setCountdown(0, 0, 0, 0);
      // Refresh so status updates to "Live"
      allMatches = allMatches.map(enrichMatch);
      renderNextMatch();
      applyFilters();
      return;
    }
    const days    = Math.floor(diff / 86400000);
    const hours   = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000)  / 60000);
    const seconds = Math.floor((diff % 60000)    / 1000);
    setCountdown(days, hours, minutes, seconds);
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

function setCountdown(d, h, m, s) {
  document.querySelector('#cd-days    .cd-num').textContent = pad(d);
  document.querySelector('#cd-hours   .cd-num').textContent = pad(h);
  document.querySelector('#cd-minutes .cd-num').textContent = pad(m);
  document.querySelector('#cd-seconds .cd-num').textContent = pad(s);
}

// ── THEME TOGGLE ───────────────────────────────────────────────────────────
/**
 * Persists theme choice to localStorage so it survives page refresh.
 */
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  themeIcon.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('wc2026-theme', isDark ? 'light' : 'dark');
}

function loadTheme() {
  const saved = localStorage.getItem('wc2026-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    themeIcon.textContent = saved === 'light' ? '☀️' : '🌙';
  }
}

// ── RESULTS INFO ───────────────────────────────────────────────────────────
function updateResultsInfo(shown, total) {
  if (shown === total) {
    resultsInfo.textContent = `Showing all ${total} matches`;
  } else {
    resultsInfo.textContent = `Showing ${shown} of ${total} matches`;
  }
}

// ── HELPERS ────────────────────────────────────────────────────────────────
/** Maps stage name to a CSS modifier class for the colour bar on each card */
function getStageBarClass(stage) {
  const map = {
    'Final':            'final',
    'Third Place Match':'semi',
    'Semi-finals':      'semi',
    'Quarter-finals':   'quarter',
    'Round of 16':      'r16',
    'Round of 32':      'r32',
    'Group Stage':      ''
  };
  return map[stage] || '';
}

/** Format "YYYY-MM-DD" → "Mon DD, YYYY" */
function formatDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

/** Zero-pad single digits */
function pad(n) { return String(n).padStart(2, '0'); }

/** Capitalise first letter */
function capitalise(str) { return str.charAt(0).toUpperCase() + str.slice(1); }
