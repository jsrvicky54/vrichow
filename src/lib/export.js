const ExcelJS = require('exceljs');
const time = require('./time');

const HEADERS = [
  'Date',
  'Staff ID',
  'Name',
  'Department',
  'Sign in',
  'Sign out',
  'Hours',
  'Hours (decimal)',
  'Entered later',
  'Edited by admin',
  'Notes',
];

function toRow(r) {
  return [
    time.dateKey(r.sign_in_at),
    r.staff_id,
    r.name,
    r.department || '',
    time.fmtTime(r.sign_in_at),
    r.sign_out_at ? time.fmtTime(r.sign_out_at) : 'Not signed out',
    r.minutes === null ? '' : time.fmtDuration(r.minutes),
    r.minutes === null ? '' : time.decimalHours(r.minutes),
    r.entered_late ? 'Yes' : 'No',
    r.edited_by_name || '',
    r.note || '',
  ];
}

/** Stops spreadsheet apps from treating text as a formula (CSV injection). */
function safeCell(value) {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvEscape(value) {
  const s = String(safeCell(value) ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  const lines = [HEADERS, ...rows.map(toRow)].map((cols) => cols.map(csvEscape).join(','));
  // BOM so Excel opens UTF-8 names correctly.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

async function toXlsx(rows, { title }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Office Attendance';
  wb.created = new Date();
  const ws = wb.addWorksheet('Attendance', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = HEADERS.map((h) => ({ header: h, width: Math.max(12, h.length + 2) }));
  ws.getColumn(3).width = 24;
  ws.getColumn(11).width = 40;
  ws.getRow(1).font = { bold: true };

  for (const r of rows) ws.addRow(toRow(r).map(safeCell));

  const totalMinutes = rows.reduce((sum, r) => sum + (r.minutes || 0), 0);
  ws.addRow([]);
  const totalRow = ws.addRow(['Total', '', '', '', '', '', time.fmtDuration(totalMinutes), time.decimalHours(totalMinutes)]);
  totalRow.font = { bold: true };

  ws.headerFooter.oddHeader = title;
  return wb.xlsx.writeBuffer();
}

module.exports = { toCsv, toXlsx };
