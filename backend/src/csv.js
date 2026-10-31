'use strict';

const { parse } = require('csv-parse/sync');
const { categorize } = require('./categorize');

const normalizeHeader = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const headerAliases = {
  date: ['date', 'transactiondate', 'transdate', 'purchasedate'],
  description: [
    'description',
    'merchant',
    'name',
    'payee',
    'transaction',
    'details',
  ],
  amount: ['amount', 'value', 'total', 'transactionamount'],
};

function validCalendarDate(year, month, day) {
  const fullYear = year < 100 ? (year < 70 ? 2000 + year : 1900 + year) : year;
  const date = new Date(Date.UTC(fullYear, month - 1, day));
  return (
    date.getUTCFullYear() === fullYear &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidDate(value) {
  if (!value) return true;
  const input = String(value).trim();
  const iso = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/);
  if (iso) {
    if (!validCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3])))
      return false;
    return iso[0].length === input.length || !Number.isNaN(Date.parse(input));
  }

  const slash = input.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = Number(slash[3]);
    // Accept either common slash convention when both leading values are
    // plausible months; preserve the original input in the stored record.
    if (first > 12) return validCalendarDate(year, second, first); // DD/MM/YYYY
    if (second > 12) return validCalendarDate(year, first, second); // MM/DD/YYYY
    return (
      validCalendarDate(year, first, second) ||
      validCalendarDate(year, second, first)
    );
  }
  return !Number.isNaN(Date.parse(input));
}

function monthKeyFromDate(value) {
  if (!value || !isValidDate(value)) return null;
  const input = String(value).trim();
  const iso = input.match(/^(\d{4})-(\d{1,2})-/);
  if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, '0')}`;
  const slash = input.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const month = first > 12 ? Number(slash[2]) : first;
    const year = Number(slash[3]);
    const fullYear =
      year < 100 ? (year < 70 ? 2000 + year : 1900 + year) : year;
    return `${fullYear}-${String(month).padStart(2, '0')}`;
  }
  const parsed = new Date(input);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

function csvError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function parseExpenses(buffer) {
  let rows;
  try {
    rows = parse(buffer, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: false,
      max_record_size: 100000,
    });
  } catch {
    throw csvError('Malformed CSV. Check quoting and consistent columns.');
  }
  if (!rows.length)
    throw csvError('CSV needs a header and at least one expense row.');

  const headers = Object.keys(rows[0]);
  const findColumn = (aliases) =>
    headers.find((header) => aliases.includes(normalizeHeader(header)));
  const dateColumn = findColumn(headerAliases.date);
  const descriptionColumn = findColumn(headerAliases.description);
  const amountColumn = findColumn(headerAliases.amount);
  if (!descriptionColumn || !amountColumn) {
    throw csvError(
      'Required columns: Description (or Merchant) and Amount. Date is optional.',
    );
  }

  const expenses = [];
  rows.forEach((row, index) => {
    const description = String(row[descriptionColumn] || '').trim();
    const rawAmount = String(row[amountColumn] ?? '').trim();
    const rawDate = dateColumn ? String(row[dateColumn] || '').trim() : '';
    if (!description && !rawAmount && !rawDate) return;

    const amount = Number(rawAmount.replace(/[$₹,\s]/g, ''));
    if (!description || !rawAmount || !Number.isFinite(amount) || amount < 0) {
      throw csvError(
        `Invalid expense on CSV row ${index + 2}: description and non-negative numeric amount are required.`,
      );
    }
    if (rawDate && !isValidDate(rawDate)) {
      throw csvError(
        `Invalid date on CSV row ${index + 2}: enter a valid date or leave it blank.`,
      );
    }

    expenses.push({
      date: rawDate || null,
      description,
      amount,
      suggested_category: categorize(description),
    });
  });

  if (!expenses.length) throw csvError('No valid expense rows found.');
  return expenses;
}

module.exports = { parseExpenses, isValidDate, monthKeyFromDate };
