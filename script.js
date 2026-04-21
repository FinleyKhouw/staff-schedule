// ─── CONFIG ───
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS6FdWT2Oj6_sXZTM7c4K5mnn-j_fxommGtfVx8gcoi8C3zb2nzPNktqiYTWQhqByGyV8TZSYWhgctb/pub?output=csv';
const CACHE_KEY = 'roster_cache_v1';
const CACHE_TTL = 90 * 1000; // 90 seconds

// All proxies raced in PARALLEL — fastest wins
const PROXIES = [
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    u => `https://thingproxy.freeboard.io/fetch/${u}`,
];

// ─── SHIFT CONFIG ───
const SHIFT_TYPES = {
    am: { label: 'Shift 1', cls: 'am' },
    pm: { label: 'Shift 2', cls: 'pm' },
    full: { label: 'Full Day', cls: 'full' },
    off: { label: 'Day Off', cls: 'off' },
};
function shiftTime(type, cat) {
    if (type === 'off') return '—';
    const p = cat === 'kitchen';
    if (type === 'am') return p ? '05:00–11:00' : '08:00–14:00';
    if (type === 'pm') return p ? '08:00–14:00' : '12:00–18:00';
    if (type === 'full') return p ? '05:00–14:00' : '08:00–18:00';
    return '—';
}

// ─── STATE ───
let STAFF = [];
let scheduleData = {};
let weekOffset = 0;
const BASE_WEEK = new Date(2026, 3, 21);
const CAT_LABELS = { kitchen: 'Kitchen', bar: 'Bar & Coffee', floor: 'Floor' };
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── SPLASH HELPERS ───
function setSplashStatus(msg, pct) {
    document.getElementById('splash-status').textContent = msg;
    if (pct !== undefined) document.getElementById('splash-bar').style.width = pct + '%';
}
function hideSplash() {
    document.getElementById('splash').classList.add('hidden');
    const app = document.getElementById('app-content');
    app.classList.add('visible');
}

// ─── CACHE ───
function saveCache(csv) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), csv })); } catch (e) { }
}
function loadCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { ts, csv } = JSON.parse(raw);
        if (Date.now() - ts > CACHE_TTL) return null;
        return csv;
    } catch (e) { return null; }
}

// ─── CSV PARSER ───
function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).filter(l => l.trim()).map(line => {
        const cols = []; let cur = '', inQ = false;
        for (const ch of line) {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
            else cur += ch;
        }
        cols.push(cur.trim());
        const obj = {};
        headers.forEach((h, i) => obj[h] = (cols[i] || '').replace(/^"|"$/g, ''));
        return obj;
    }).filter(r => (r['Name'] || r['name'] || '').trim());
}

// ─── PARALLEL RACE FETCH ───
// Fire all proxies at once, resolve with first successful response
async function raceFetch(url) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let failures = 0;
        PROXIES.forEach(proxyFn => {
            fetch(proxyFn(url), { cache: 'no-store' })
                .then(res => {
                    if (!res.ok) throw new Error('bad status');
                    return res.text();
                })
                .then(text => {
                    if (!settled && text && text.length > 20) {
                        settled = true;
                        resolve(text);
                    }
                })
                .catch(() => {
                    failures++;
                    if (failures === PROXIES.length && !settled) {
                        reject(new Error('All proxies failed. Check the Sheet is published to web.'));
                    }
                });
        });
    });
}

// ─── APPLY CSV DATA ───
function applyCSV(text) {
    const rows = parseCSV(text);
    if (!rows.length) throw new Error('Sheet appears empty — check column headers: Name, Role, Cat, Day1…Day6');

    STAFF = rows.map(r => ({
        name: (r['Name'] || r['name'] || '').trim(),
        role: (r['Role'] || r['role'] || '').trim(),
        cat: (r['Cat'] || r['cat'] || 'floor').toLowerCase().trim(),
    }));

    const sched = {};
    rows.forEach((row, si) => {
        sched[si] = {};
        for (let di = 0; di < 6; di++) {
            const val = (row[`Day${di + 1}`] || row[`day${di + 1}`] || 'off').toLowerCase().trim();
            sched[si][di] = ['am', 'pm', 'full', 'off'].includes(val) ? val : 'off';
        }
    });
    scheduleData['w0'] = sched;
}

// ─── MAIN FETCH ───
async function fetchSheet(isManual = false) {
    if (isManual) {
        const btn = document.getElementById('refresh-btn');
        if (btn) btn.classList.add('spinning');
        hideError();
    }

    // On first load, show splash. On refresh, skip splash.
    const firstLoad = !document.getElementById('app-content').classList.contains('visible');

    try {
        // STEP 1: Try cache first for instant display
        if (firstLoad) {
            setSplashStatus('Checking cache…', 20);
            const cached = loadCache();
            if (cached) {
                setSplashStatus('Loading from cache…', 60);
                applyCSV(cached);
                setSplashStatus('Ready!', 100);
                setTimeout(() => { hideSplash(); render(); }, 200);
                // Still fetch fresh in background silently
                raceFetch(SHEET_URL).then(text => { saveCache(text); applyCSV(text); render(); updateSyncTime(); }).catch(() => { });
                return;
            }
            setSplashStatus('Fetching schedule…', 35);
        }

        // STEP 2: Race all proxies in parallel
        const text = await raceFetch(SHEET_URL);
        saveCache(text);
        applyCSV(text);

        if (firstLoad) {
            setSplashStatus('Ready!', 100);
            setTimeout(() => { hideSplash(); render(); updateSyncTime(); }, 250);
        } else {
            render();
            updateSyncTime();
        }
    } catch (e) {
        if (firstLoad) {
            // Show app anyway with error
            hideSplash();
        }
        showError(e.message);
    } finally {
        const btn = document.getElementById('refresh-btn');
        if (btn) btn.classList.remove('spinning');
    }
}

function manualRefresh() { fetchSheet(true); }

function updateSyncTime() {
    const el = document.getElementById('last-updated');
    if (el) el.textContent = 'Last synced: ' + new Date().toLocaleTimeString();
}
function showError(msg) {
    const el = document.getElementById('error-banner');
    if (!el) return;
    el.innerHTML = '⚠ ' + msg + ' &nbsp;·&nbsp; <a href="' + SHEET_URL + '" target="_blank" style="color:inherit;text-decoration:underline">Open Sheet</a>';
    el.style.display = 'block';
}
function hideError() {
    const el = document.getElementById('error-banner');
    if (el) el.style.display = 'none';
}

// ─── SCHEDULE HELPERS ───
function weekKey(o) { return `w${o}`; }
function getSchedule(offset) {
    if (!scheduleData[weekKey(offset)]) {
        const s = {};
        STAFF.forEach((_, si) => { s[si] = {}; for (let di = 0; di < 6; di++) s[si][di] = 'off'; });
        scheduleData[weekKey(offset)] = s;
    }
    return scheduleData[weekKey(offset)];
}
function getWeekDates(offset) {
    return Array.from({ length: 6 }, (_, i) => {
        const d = new Date(BASE_WEEK); d.setDate(d.getDate() + offset * 7 + i); return d;
    });
}
function formatDate(d) { return `${DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1]} ${d.getDate()}`; }
function formatWeekLabel(dates) { return `${MONTHS[dates[0].getMonth()]} ${dates[0].getDate()} – ${dates[5].getDate()}`; }

// ─── RENDER ───
function render() {
    if (!STAFF.length) return;
    const dates = getWeekDates(weekOffset);
    const sched = getSchedule(weekOffset);
    document.getElementById('week-label').textContent = formatWeekLabel(dates);
    renderSummary(sched);
    renderTable(dates, sched);
    renderStaffCards(dates, sched);
}

function renderSummary(sched) {
    let total = 0, am = 0, pm = 0, full = 0, off = 0;
    STAFF.forEach((s, si) => {
        for (let di = 0; di < 6; di++) {
            const t = sched[si] ? sched[si][di] : 'off';
            if (t === 'off') off++; else { total++; if (t === 'am') am++; else if (t === 'pm') pm++; else if (t === 'full') full++; }
        }
    });
    document.getElementById('summary-row').innerHTML = `
    <div class="summary-card"><div class="label">Total staff</div><div class="value">${STAFF.length}</div><div class="sub">across all roles</div></div>
    <div class="summary-card"><div class="label">Shifts this week</div><div class="value">${total}</div><div class="sub">${off} days off</div></div>
    <div class="summary-card"><div class="label">Shift 1 (AM)</div><div class="value">${am}</div><div class="sub">PROD 05:00 · FOH 08:00</div></div>
    <div class="summary-card"><div class="label">Shift 2 (PM)</div><div class="value">${pm}</div><div class="sub">PROD 08:00 · FOH 12:00</div></div>
    <div class="summary-card"><div class="label">Full Day</div><div class="value">${full}</div><div class="sub">PROD 05:00 · FOH 08:00</div></div>`;
}

function renderTable(dates, sched) {
    const today = new Date();
    let hHtml = `<th>Staff member</th>`;
    dates.forEach(d => {
        const isToday = d.toDateString() === today.toDateString();
        hHtml += `<th class="${isToday ? 'today-header' : ''}"><span class="day-name">${d.getDate()}</span><span class="day-sub">${DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1]}</span></th>`;
    });
    document.getElementById('table-header').innerHTML = hHtml;

    let bHtml = ''; let lastCat = null;
    STAFF.forEach((s, si) => {
        if (s.cat !== lastCat) { bHtml += `<tr class="section-row"><td colspan="7">${CAT_LABELS[s.cat] || s.cat}</td></tr>`; lastCat = s.cat; }
        bHtml += `<tr class="staff-row"><td class="staff-cell"><div class="staff-name">${s.name}</div><div class="staff-role">${s.role}</div></td>`;
        for (let di = 0; di < 6; di++) {
            const type = sched[si] ? (sched[si][di] || 'off') : 'off';
            const sh = SHIFT_TYPES[type] || SHIFT_TYPES.off;
            bHtml += `<td class="shift-cell"><div class="chip ${sh.cls}">${sh.label}<span class="chip-time">${shiftTime(type, s.cat)}</span></div></td>`;
        }
        bHtml += `</tr>`;
    });
    document.getElementById('table-body').innerHTML = bHtml;
}

function renderStaffCards(dates, sched) {
    let html = '';
    STAFF.forEach((s, si) => {
        const initials = s.name.substring(0, 2).toUpperCase();
        html += `<div class="staff-card" style="animation-delay:${si * 0.04}s">
      <div class="staff-card-header">
        <div class="avatar ${s.cat}">${initials}</div>
        <div><div style="font-size:15px;font-weight:500">${s.name}</div><div style="font-size:12px;color:var(--ink-muted)">${s.role}</div></div>
      </div>
      <div class="staff-card-body">
        <div style="font-size:11px;color:var(--ink-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;font-weight:500">This week</div>
        <div class="week-chips">`;
        dates.forEach((d, di) => {
            const type = sched[si] ? (sched[si][di] || 'off') : 'off';
            const sh = SHIFT_TYPES[type] || SHIFT_TYPES.off;
            html += `<div class="mini-chip ${sh.cls}" title="${formatDate(d)}: ${sh.label} ${shiftTime(type, s.cat)}">${d.getDate()} ${sh.label}</div>`;
        });
        html += `</div></div></div>`;
    });
    document.getElementById('staff-cards').innerHTML = html;
}

// ─── WEEK NAV ───
function changeWeek(dir) { weekOffset += dir; render(); }

// ─── VIEW TABS ───
function switchView(view, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-week').style.display = view === 'week' ? 'block' : 'none';
    document.getElementById('view-staff').style.display = view === 'staff' ? 'block' : 'none';
}

// ─── MODAL (kept for future use) ───
let editTarget = null, selectedShift = null;
function openModal(si, di) { }
function closeModal(e) { if (e && e.target !== document.getElementById('modal')) return; document.getElementById('modal').classList.remove('open'); }
function saveShift() { }

// ─── INIT ───
fetchSheet();
setInterval(() => fetchSheet(false), 2 * 60 * 1000);