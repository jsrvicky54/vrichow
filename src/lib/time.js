/**
 * Time helpers. The database stores UTC; everything shown to people is in
 * the office time zone (APP_TIMEZONE, default Asia/Kolkata).
 */
const { DateTime } = require('luxon');
const config = require('../config');

const TZ = config.timezone;

function nowLocal() {
  return DateTime.now().setZone(TZ);
}

function toLocal(date) {
  if (!date) return null;
  return DateTime.fromJSDate(date instanceof Date ? date : new Date(date)).setZone(TZ);
}

function fmtTime(date) {
  const d = toLocal(date);
  return d ? d.toFormat('hh:mm a') : '';
}

function fmtDate(date) {
  const d = toLocal(date);
  return d ? d.toFormat('ccc, dd LLL yyyy') : '';
}

function fmtDateTime(date) {
  const d = toLocal(date);
  return d ? d.toFormat('dd LLL yyyy, hh:mm a') : '';
}

/** 'yyyy-MM-dd' in office time. */
function dateKey(date) {
  const d = toLocal(date);
  return d ? d.toISODate() : '';
}

/** 'HH:mm' (24h) in office time, for <input type="time">. */
function timeValue(date) {
  const d = toLocal(date);
  return d ? d.toFormat('HH:mm') : '';
}

function todayKey() {
  return nowLocal().toISODate();
}

function currentMonthKey() {
  return nowLocal().toFormat('yyyy-MM');
}

function isValidDateKey(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromISO(s, { zone: TZ }).isValid;
}

function isValidMonthKey(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}$/.test(s) && DateTime.fromISO(`${s}-01`, { zone: TZ }).isValid;
}

/** UTC [start, end) covering one office-time day. */
function dayRange(key) {
  const start = DateTime.fromISO(key, { zone: TZ }).startOf('day');
  return { start: start.toJSDate(), end: start.plus({ days: 1 }).toJSDate() };
}

/** UTC [start, end) covering an inclusive range of office-time days. */
function dateSpan(fromKey, toKey) {
  const start = DateTime.fromISO(fromKey, { zone: TZ }).startOf('day');
  const end = DateTime.fromISO(toKey, { zone: TZ }).startOf('day').plus({ days: 1 });
  return { start: start.toJSDate(), end: end.toJSDate() };
}

/** UTC [start, end) covering one office-time month ('yyyy-MM'). */
function monthRange(key) {
  const start = DateTime.fromISO(`${key}-01`, { zone: TZ }).startOf('month');
  return { start: start.toJSDate(), end: start.plus({ months: 1 }).toJSDate() };
}

function monthLabel(key) {
  return DateTime.fromISO(`${key}-01`, { zone: TZ }).toFormat('LLLL yyyy');
}

function shiftMonth(key, n) {
  return DateTime.fromISO(`${key}-01`, { zone: TZ }).plus({ months: n }).toFormat('yyyy-MM');
}

/** Office-time date ('yyyy-MM-dd') + time ('HH:mm') -> JS Date (UTC), or null if invalid. */
function localToDate(dateStr, timeStr) {
  if (!isValidDateKey(dateStr) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr || '')) return null;
  const d = DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: TZ });
  return d.isValid ? d.toJSDate() : null;
}

function minutesBetween(a, b) {
  if (!a || !b) return null;
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
}

function fmtDuration(minutes) {
  if (minutes === null || minutes === undefined) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Decimal hours (2 dp) for exports. */
function decimalHours(minutes) {
  if (minutes === null || minutes === undefined) return '';
  return Math.round((minutes / 60) * 100) / 100;
}

/** True if the given time is after LATE_AFTER on its own office-time day. */
function isLate(date) {
  return timeValue(date) > config.lateAfter;
}

function lateAfterLabel() {
  return DateTime.fromFormat(config.lateAfter, 'HH:mm', { zone: TZ }).toFormat('hh:mm a');
}

module.exports = {
  TZ,
  nowLocal,
  toLocal,
  fmtTime,
  fmtDate,
  fmtDateTime,
  dateKey,
  timeValue,
  todayKey,
  currentMonthKey,
  isValidDateKey,
  isValidMonthKey,
  dayRange,
  dateSpan,
  monthRange,
  monthLabel,
  shiftMonth,
  localToDate,
  minutesBetween,
  fmtDuration,
  decimalHours,
  isLate,
  lateAfterLabel,
};
