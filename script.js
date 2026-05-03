const STORAGE_KEY = 'bakehouse_attendance_v1';
const SHIFT_QR_TOKEN = 'BAKEHOUSE-SHIFT-2026';
const SHIFT_HOURS = {
  morning: { start: 6, end: 14 },
  afternoon: { start: 14, end: 22 }
};

let cameraStream = null;
let selfieData = '';

const el = (id) => document.getElementById(id);

function loadRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function nowISO() {
  return new Date().toISOString();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function ensureQr() {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(SHIFT_QR_TOKEN)}`;
  el('qrImage').src = qrUrl;
  el('shiftTokenLabel').textContent = SHIFT_QR_TOKEN;
}

async function startCamera() {
  cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  el('camera').srcObject = cameraStream;
}

function captureSelfie() {
  const video = el('camera');
  const canvas = el('selfieCanvas');
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  selfieData = canvas.toDataURL('image/jpeg', 0.85);
  const preview = el('selfiePreview');
  preview.src = selfieData;
  preview.hidden = false;
}

function setStatus(msg, isError = false) {
  const s = el('employeeStatus');
  s.textContent = msg;
  s.style.color = isError ? '#9f2f2f' : '#1f7a53';
}

function upsertRecord(type) {
  const name = el('employeeName').value.trim();
  const shift = el('assignedShift').value;
  const scanned = el('scanToken').value.trim();
  if (!name) return setStatus('Employee name is required.', true);
  if (!selfieData) return setStatus('Please capture a selfie first.', true);
  if (scanned !== SHIFT_QR_TOKEN) return setStatus('Invalid QR token.', true);

  const date = todayKey();
  const key = `${date}_${name.toLowerCase()}`;
  const records = loadRecords();
  const record = records[key] || { name, date, shift, clockIn: null, clockOut: null, selfieIn: '', selfieOut: '' };
  record.shift = shift;

  if (type === 'in') {
    record.clockIn = nowISO();
    record.selfieIn = selfieData;
    setStatus(`${name} clocked in successfully.`);
  } else {
    record.clockOut = nowISO();
    record.selfieOut = selfieData;
    setStatus(`${name} clocked out successfully.`);
  }

  records[key] = record;
  saveRecords(records);
  renderAdmin();
}

function fmt(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function overtimeHours(r) {
  if (!r.clockIn || !r.clockOut) return 0;
  const shiftCfg = SHIFT_HOURS[r.shift];
  const outHour = new Date(r.clockOut).getHours() + (new Date(r.clockOut).getMinutes() / 60);
  return Math.max(0, outHour - shiftCfg.end);
}

function attendanceState(r) {
  if (r.clockIn && r.clockOut) return 'Attended';
  return 'Not complete';
}

function renderAdmin() {
  const date = todayKey();
  const records = Object.values(loadRecords()).filter(r => r.date === date);
  const body = el('attendanceBody');
  body.innerHTML = '';

  records.forEach(r => {
    const attended = attendanceState(r) === 'Attended';
    const ot = overtimeHours(r);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.name}</td>
      <td>${r.shift}</td>
      <td>${fmt(r.clockIn)}</td>
      <td>${fmt(r.clockOut)}</td>
      <td><span class="badge ${attended ? 'ok' : 'no'}">${attended ? 'Attended' : 'Not complete'}</span></td>
      <td>${ot.toFixed(2)} hrs</td>`;
    body.appendChild(tr);
  });

  const attendedCount = records.filter(r => attendanceState(r) === 'Attended').length;
  const overtimeCount = records.filter(r => overtimeHours(r) > 0).length;
  el('totalEmployees').textContent = String(records.length);
  el('attendedCount').textContent = String(attendedCount);
  el('missingCount').textContent = String(records.length - attendedCount);
  el('overtimeCount').textContent = String(overtimeCount);
}

el('startCameraBtn').addEventListener('click', () => startCamera().catch(() => setStatus('Camera access denied.', true)));
el('captureBtn').addEventListener('click', captureSelfie);
el('clockInBtn').addEventListener('click', () => upsertRecord('in'));
el('clockOutBtn').addEventListener('click', () => upsertRecord('out'));

ensureQr();
renderAdmin();
