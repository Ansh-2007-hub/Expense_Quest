'use strict';

const { parse } = require('csv-parse/sync');
const { categories, suggestCategory } = require('./categorize');

const normalizeHeader = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const headerAliases = {
  date: ['date', 'transactiondate', 'transdate', 'purchasedate', 'posteddate', 'valuedate'],
  description: [
    'description',
    'merchant',
    'name',
    'payee',
    'transaction',
    'details',
    'narration',
    'transactiondetails',
    'transactiondescription',
    'merchantname',
  ],
  amount: ['amount', 'value', 'total', 'transactionamount'],
  debit: ['debit', 'withdrawal', 'outflow', 'moneyout', 'debitamount', 'withdrawalamount', 'outflowamount'],
  credit: ['credit', 'deposit', 'inflow', 'moneyin', 'creditamount', 'depositamount', 'inflowamount'],
  currency: ['currency', 'currencycode', 'ccy'],
  category: ['category', 'finalcategory', 'expensecategory'],
  direction: ['direction', 'type', 'transactiontype', 'debitcredit'],
};

function parseAmount(value) {
  let raw = String(value || '').trim();
  if (!raw) return null;
  const parenthesized = /^\(.*\)$/.test(raw);
  const explicitlyNegative = parenthesized || raw.startsWith('-');
  raw = raw
    .replace(/[()]/g, '')
    .replace(/\b[A-Z]{3}\b/gi, '')
    .replace(/[$€£₹¥₩₽\s']/g, '')
    .replace(/^[+-]/, '');
  if (/[+-]/.test(raw)) return null;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const groupingSeparator = decimalSeparator === ',' ? '.' : ',';
    const fractionLength = raw.length - raw.lastIndexOf(decimalSeparator) - 1;
    raw = raw.replaceAll(groupingSeparator, '');
    if (decimalSeparator === ',' && fractionLength > 0 && fractionLength <= 3)
      raw = raw.replace(',', '.');
  } else if (lastComma >= 0) {
    const fractionLength = raw.length - lastComma - 1;
    raw = fractionLength > 0 && fractionLength <= 2
      ? `${raw.slice(0, lastComma).replaceAll(',', '')}.${raw.slice(lastComma + 1)}`
      : raw.replaceAll(',', '');
  } else if ((raw.match(/\./g) || []).length > 1) {
    const lastPeriod = raw.lastIndexOf('.');
    const fractionLength = raw.length - lastPeriod - 1;
    raw = fractionLength === 3
      ? raw.replaceAll('.', '')
      : `${raw.slice(0, lastPeriod).replaceAll('.', '')}.${raw.slice(lastPeriod + 1)}`;
  }
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const amount = Number(raw);
  return Number.isFinite(amount)
    ? parenthesized || explicitlyNegative
      ? -amount
      : amount
    : null;
}

function detectCurrency(value) {
  const input = String(value || '').trim();
  const code = input.match(/\b([A-Z]{3})\b/i)?.[1]?.toUpperCase();
  if (code) return code;
  if (input.includes('₹')) return 'INR';
  if (input.includes('€')) return 'EUR';
  if (input.includes('£')) return 'GBP';
  return '';
}

function isCurrencyCode(value) {
  const currency = String(value || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return false;
  return typeof Intl.supportedValuesOf !== 'function' ||
    Intl.supportedValuesOf('currency').includes(currency);
}

function normalizeDirection(value) {
  const input = String(value || '').trim().toLowerCase();
  if (['debit', 'expense', 'outflow', 'withdrawal', 'dr'].includes(input))
    return 'debit';
  if (['credit', 'income', 'inflow', 'deposit', 'refund', 'cr'].includes(input))
    return 'credit';
  return null;
}

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
  const debitColumn = findColumn(headerAliases.debit);
  const creditColumn = findColumn(headerAliases.credit);
  const currencyColumn = findColumn(headerAliases.currency);
  const categoryColumn = findColumn(headerAliases.category);
  const directionColumn = findColumn(headerAliases.direction);
  if (!descriptionColumn || (!amountColumn && !debitColumn && !creditColumn)) {
    throw csvError(
      'Required columns: Description (or Merchant) and Amount, Debit, or Credit. Date is optional.',
    );
  }

  const expenses = [];
  const currencies = new Set();
  rows.forEach((row, index) => {
    const description = String(row[descriptionColumn] || '').trim();
    const rawAmount = String(row[amountColumn] ?? '').trim();
    const rawDebit = String(row[debitColumn] ?? '').trim();
    const rawCredit = String(row[creditColumn] ?? '').trim();
    const rawDate = dateColumn ? String(row[dateColumn] || '').trim() : '';
    const rawDirection = directionColumn
      ? String(row[directionColumn] || '').trim()
      : '';
    const rawCurrency = currencyColumn
      ? String(row[currencyColumn] || '').trim()
      : '';
    const rawCategory = categoryColumn
      ? String(row[categoryColumn] || '').trim()
      : '';
    if (
      !description &&
      !rawAmount &&
      !rawDebit &&
      !rawCredit &&
      !rawDate
    )
      return;

    const amountValue = rawAmount ? parseAmount(rawAmount) : null;
    const debitValue = rawDebit ? parseAmount(rawDebit) : null;
    const creditValue = rawCredit ? parseAmount(rawCredit) : null;
    const debitEntered = rawDebit !== '';
    const creditEntered = rawCredit !== '';
    const debitPresent = debitEntered && debitValue != null && debitValue !== 0;
    const creditPresent = creditEntered && creditValue != null && creditValue !== 0;
    if (debitPresent && creditPresent) {
      throw csvError(
        `CSV row ${index + 2} contains both debit and credit amounts.`,
      );
    }
    if (
      (rawAmount && amountValue == null) ||
      (rawDebit && debitValue == null) ||
      (rawCredit && creditValue == null)
    ) {
      throw csvError(`Invalid amount on CSV row ${index + 2}.`);
    }
    let direction = amountValue != null && amountValue < 0 ? 'credit' : 'debit';
    let selectedAmount = amountValue;
    if (debitPresent || creditPresent) {
      selectedAmount = debitPresent ? debitValue : creditValue;
      direction = creditPresent ? 'credit' : 'debit';
      if (selectedAmount < 0) direction = 'credit';
    } else if (debitEntered || creditEntered) {
      selectedAmount = debitEntered ? debitValue : creditValue;
      direction = creditEntered ? 'credit' : 'debit';
    }
    const explicitDirection = normalizeDirection(rawDirection);
    if (rawDirection && !explicitDirection) {
      throw csvError(
        `Invalid direction on CSV row ${index + 2}: use debit/expense or credit/income.`,
      );
    }
    if (explicitDirection) direction = explicitDirection;
    const amount = Math.abs(selectedAmount ?? 0);
    if (!description || selectedAmount == null) {
      throw csvError(
        `Invalid expense on CSV row ${index + 2}: description and a numeric amount are required.`,
      );
    }
    if (rawDate && !isValidDate(rawDate)) {
      throw csvError(
        `Invalid date on CSV row ${index + 2}: enter a valid date or leave it blank.`,
      );
    }

    const rawCurrencyCode = detectCurrency(rawCurrency);
    const amountCurrencyCode = detectCurrency(rawAmount || rawDebit || rawCredit);
    if (
      rawCurrencyCode &&
      amountCurrencyCode &&
      rawCurrencyCode !== amountCurrencyCode
    ) {
      throw csvError(`Currency does not match the amount on CSV row ${index + 2}.`);
    }
    const detectedCurrency = rawCurrencyCode || amountCurrencyCode;
    if (detectedCurrency && !isCurrencyCode(detectedCurrency)) {
      throw csvError(`Enter a supported ISO currency code on CSV row ${index + 2}.`);
    }
    if (rawCurrency && !detectedCurrency) {
      throw csvError(`Enter an ISO currency code on CSV row ${index + 2}.`);
    }
    if (detectedCurrency) currencies.add(detectedCurrency);
    const category = rawCategory
      ? categories.find(
          (item) => item.toLowerCase() === rawCategory.toLowerCase(),
        )
      : null;
    if (rawCategory && !category) {
      throw csvError(`Unsupported category on CSV row ${index + 2}.`);
    }

    const suggestion = suggestCategory(description);
    expenses.push({
      date: rawDate || null,
      description,
      amount,
      direction,
      currency: detectedCurrency || null,
      imported_category: category,
      suggested_category: suggestion.category,
      suggestion_reason: suggestion.reason,
    });
  });

  if (!expenses.length) throw csvError('No valid expense rows found.');
  if (currencies.size > 1) {
    throw csvError('A quest can use one currency. Split mixed-currency CSVs.');
  }
  return expenses;
}

module.exports = { parseExpenses, isValidDate, monthKeyFromDate, parseAmount };
