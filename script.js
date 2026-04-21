// ─── DATA ───
// PROD (kitchen): Shift 1 = 05:00–11:00, Shift 2 = 08:00–14:00, Full = 05:00–14:00
// FOH  (bar/floor): Shift 1 = 08:00–14:00, Shift 2 = 12:00–18:00, Full = 08:00–18:00
const SHIFT_TYPES = {
    am: { label: 'Shift 1', cls: 'am' },
    pm: { label: 'Shift 2', cls: 'pm' },
    full: { label: 'Full Day', cls: 'full' },
    off: { label: 'Day Off', cls: 'off' },
};

function shiftTime(type, cat) {
    if (type === 'off') return '—';
    const isProd = cat === 'kitchen';
    if (type === 'am') return isProd ? '05:00 – 11:00' : '08:00 – 14:00';
    if (type === 'pm') return isProd ? '08:00 – 14:00' : '12:00 – 18:00';
    if (type === 'full') return isProd ? '05:00 – 14:00' : '08:00 – 18:00';
    return '—';
}

const STAFF = [
    { name: 'Stella', role: 'Head Baker', cat: 'kitchen' },
    { name: 'Kevin', role: 'Asst Baker', cat: 'kitchen' },
    { name: 'Kahlaa', role: 'Daily Baker', cat: 'kitchen' },
    { name: 'Ivonne', role: 'Daily Baker', cat: 'kitchen' },
    { name: 'Finley', role: 'Head Bar', cat: 'bar' },
    { name: 'Regina', role: 'Floor', cat: 'floor' },
    { name: 'Mei', role: 'Floor', cat: 'floor' },
    { name: 'Wan', role: 'Barista', cat: 'bar' },
    { name: 'Fikri', role: 'Barista', cat: 'bar' },
];

const CAT_LABELS = { kitchen: 'Kitchen', bar: 'Bar & Coffee', floor: 'Floor' };
const CAT_ORDER = ['kitchen', 'floor', 'bar'];

// Weeks: base week = Apr 21 2026
const BASE_WEEK = new Date(2026, 3, 21); // month is 0-indexed
let weekOffset = 0;

// Schedule data: weekOffset → [staffIndex][dayIndex] = shift type
let scheduleData = {};

function weekKey(offset) { return `w${offset}`; }

function defaultSchedule(offset) {
    // Off patterns for base week
    const baseOff = {
        '4-0': true, '4-1': true, '4-2': true, '4-3': true, // Finley off days 0-3
        '6-4': true, // Mei off day 4
        '7-4': true, // Wan off day 4
    };

    const data = {};
    STAFF.forEach((s, si) => {
        data[si] = {};
        for (let di = 0; di < 6; di++) {
            const key = `${si}-${di}`;
            if (offset === 0 && baseOff[key]) {
                data[si][di] = 'off';
            } else {
                // Default smart assignment
                if (s.cat === 'kitchen') {
                    if (si <= 1) data[si][di] = 'am';
                    else data[si][di] = (si === 2) ? (di % 2 === 0 ? 'am' : 'pm') : (di % 2 === 0 ? 'pm' : 'am');
                } else if (s.cat === 'bar') {
                    if (si === 4) data[si][di] = 'full';
                    else if (si === 7) {
                        if (offset === 0 && di === 3) data[si][di] = 'am';
                        else data[si][di] = di % 2 === 0 ? 'am' : 'pm';
                    } else {
                        data[si][di] = di % 2 === 0 ? 'pm' : 'am';
                    }
                } else {
                    if (si === 5) data[si][di] = di % 2 === 0 ? 'am' : 'pm';
                    else data[si][di] = di % 2 === 0 ? 'pm' : 'am';
                }
            }
        }
    });
    return data;
}

function getSchedule(offset) {
    const k = weekKey(offset);
    if (!scheduleData[k]) scheduleData[k] = defaultSchedule(offset);
    return scheduleData[k];
}

function getWeekDates(offset) {
    const dates = [];
    for (let i = 0; i < 6; i++) {
        const d = new Date(BASE_WEEK);
        d.setDate(d.getDate() + offset * 7 + i);
        dates.push(d);
    }
    return dates;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(d) {
    return `${DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1]} ${d.getDate()}`;
}

function formatWeekLabel(dates) {
    return `${MONTHS[dates[0].getMonth()]} ${dates[0].getDate()} – ${dates[5].getDate()}`;
}

// ─── RENDER ───
function render() {
    const dates = getWeekDates(weekOffset);
    const sched = getSchedule(weekOffset);

    document.getElementById('week-label').textContent = formatWeekLabel(dates);
    renderSummary(sched);
    renderTable(dates, sched);
    renderStaffCards(dates, sched);
}

function renderSummary(sched) {
    let totalShifts = 0, amCount = 0, pmCount = 0, fullCount = 0, offCount = 0;
    STAFF.forEach((s, si) => {
        for (let di = 0; di < 6; di++) {
            const t = sched[si][di];
            if (t === 'off') offCount++;
            else { totalShifts++; if (t === 'am') amCount++; else if (t === 'pm') pmCount++; else if (t === 'full') fullCount++; }
        }
    });

    const el = document.getElementById('summary-row');
    el.innerHTML = `
    <div class="summary-card">
      <div class="label">Total staff</div>
      <div class="value">${STAFF.length}</div>
      <div class="sub">across all roles</div>
    </div>
    <div class="summary-card">
      <div class="label">Shifts this week</div>
      <div class="value">${totalShifts}</div>
      <div class="sub">${offCount} days off</div>
    </div>
    <div class="summary-card">
      <div class="label">Shift 1 (AM)</div>
      <div class="value">${amCount}</div>
      <div class="sub">PROD 05:00 · FOH 08:00</div>
    </div>
    <div class="summary-card">
      <div class="label">Shift 2 (PM)</div>
      <div class="value">${pmCount}</div>
      <div class="sub">PROD 08:00 · FOH 12:00</div>
    </div>
    <div class="summary-card">
      <div class="label">Full Day</div>
      <div class="value">${fullCount}</div>
      <div class="sub">PROD 05:00 · FOH 08:00</div>
    </div>
  `;
}

function renderTable(dates, sched) {
    // Header
    const thead = document.getElementById('table-header');
    const today = new Date();
    let headerHtml = `<th>Staff member</th>`;
    dates.forEach(d => {
        const isToday = d.toDateString() === today.toDateString();
        headerHtml += `<th class="${isToday ? 'today-header' : ''}">
      <span class="day-name">${d.getDate()}</span>
      <span class="day-sub">${DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1]}</span>
    </th>`;
    });
    thead.innerHTML = headerHtml;

    // Body
    const tbody = document.getElementById('table-body');
    let bodyHtml = '';
    let lastCat = null;

    STAFF.forEach((s, si) => {
        if (s.cat !== lastCat) {
            bodyHtml += `<tr class="section-row"><td colspan="7">${CAT_LABELS[s.cat]}</td></tr>`;
            lastCat = s.cat;
        }
        bodyHtml += `<tr class="staff-row">`;
        bodyHtml += `<td class="staff-cell">
      <div class="staff-name">${s.name}</div>
      <div class="staff-role">${s.role}</div>
    </td>`;
        for (let di = 0; di < 6; di++) {
            const type = sched[si][di];
            const sh = SHIFT_TYPES[type];
            const timeLabel = shiftTime(type, s.cat);
            bodyHtml += `<td class="shift-cell">
        <div class="chip ${sh.cls}" onclick="openModal(${si},${di})">
          ${sh.label}
          <span class="chip-time">${timeLabel}</span>
        </div>
      </td>`;
        }
        bodyHtml += `</tr>`;
    });

    tbody.innerHTML = bodyHtml;
}

function renderStaffCards(dates, sched) {
    const el = document.getElementById('staff-cards');
    let html = '';
    STAFF.forEach((s, si) => {
        const initials = s.name.substring(0, 2).toUpperCase();
        html += `<div class="staff-card" style="animation-delay:${si * 0.04}s">
      <div class="staff-card-header">
        <div class="avatar ${s.cat}">${initials}</div>
        <div>
          <div style="font-size:15px;font-weight:500">${s.name}</div>
          <div style="font-size:12px;color:var(--ink-muted)">${s.role}</div>
        </div>
      </div>
      <div class="staff-card-body">
        <div style="font-size:11px;color:var(--ink-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;font-weight:500">This week</div>
        <div class="week-chips">`;
        dates.forEach((d, di) => {
            const type = sched[si][di];
            const sh = SHIFT_TYPES[type];
            html += `<div class="mini-chip ${sh.cls}" title="${formatDate(d)}: ${sh.label} ${shiftTime(type, s.cat)}">${d.getDate()} ${sh.label}</div>`;
        });
        html += `</div></div></div>`;
    });
    el.innerHTML = html;
}

// ─── MODAL ───
let editTarget = null;
let selectedShift = null;

function openModal(si, di) {
    editTarget = { si, di };
    const s = STAFF[si];
    const dates = getWeekDates(weekOffset);
    const currentShift = getSchedule(weekOffset)[si][di];
    selectedShift = currentShift;

    document.getElementById('modal-title').textContent = s.name;
    document.getElementById('modal-sub').textContent = `${s.role} · ${formatDate(dates[di])}`;

    let optHtml = '';
    Object.entries(SHIFT_TYPES).forEach(([k, v]) => {
        const timeStr = shiftTime(k, s.cat);
        optHtml += `<div class="shift-option ${k === currentShift ? 'selected' : ''}" onclick="selectShift('${k}', this)">
      <div class="opt-label">${v.label}</div>
      <div class="opt-time">${timeStr}</div>
    </div>`;
    });
    document.getElementById('shift-options').innerHTML = optHtml;
    document.getElementById('modal').classList.add('open');
}

function selectShift(type, el) {
    selectedShift = type;
    document.querySelectorAll('.shift-option').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
}

function closeModal(event) {
    if (event && event.target !== document.getElementById('modal')) return;
    document.getElementById('modal').classList.remove('open');
    editTarget = null;
}

function saveShift() {
    if (!editTarget || !selectedShift) return;
    const { si, di } = editTarget;
    getSchedule(weekOffset)[si][di] = selectedShift;
    document.getElementById('modal').classList.remove('open');
    render();
}

// ─── WEEK NAV ───
function changeWeek(dir) {
    weekOffset += dir;
    render();
}

// ─── VIEW TABS ───
function switchView(view, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-week').style.display = view === 'week' ? 'block' : 'none';
    document.getElementById('view-staff').style.display = view === 'staff' ? 'block' : 'none';
}

// ─── INIT ───
render();