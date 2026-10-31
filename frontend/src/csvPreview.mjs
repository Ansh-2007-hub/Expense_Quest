export const CSV_CATEGORIES = [
  'Food',
  'Shopping',
  'Travel',
  'Bills',
  'Entertainment',
  'Healthcare',
  'Education',
  'Other',
];

const aliases = {
  date: new Set(['date', 'transactiondate', 'transdate', 'purchasedate', 'posteddate', 'valuedate']),
  description: new Set([
    'description',
    'merchant',
    'merchantname',
    'name',
    'payee',
    'transaction',
    'details',
    'narration',
    'transactiondetails',
    'transactiondescription',
  ]),
  amount: new Set(['amount', 'value', 'total', 'transactionamount']),
  debit: new Set(['debit', 'withdrawal', 'outflow', 'moneyout', 'debitamount', 'withdrawalamount', 'outflowamount']),
  credit: new Set(['credit', 'deposit', 'inflow', 'moneyin', 'creditamount', 'depositamount', 'inflowamount']),
  currency: new Set(['currency', 'currencycode', 'ccy']),
  category: new Set(['category', 'finalcategory', 'expensecategory']),
  direction: new Set(['direction', 'type', 'transactiontype', 'debitcredit']),
};

const normalizeHeader = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

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
    if (first > 12) return validCalendarDate(year, second, first);
    if (second > 12) return validCalendarDate(year, first, second);
    return (
      validCalendarDate(year, first, second) ||
      validCalendarDate(year, second, first)
    );
  }
  return !Number.isNaN(Date.parse(input));
}

function dateSortValue(value) {
  if (!value) return null;
  const input = String(value).trim();
  const slash = input.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    const day = first > 12 ? first : second > 12 ? second : second;
    const month = first > 12 ? second : first;
    return Date.UTC(year, month - 1, day);
  }
  const parsed = Date.parse(input);
  return Number.isNaN(parsed) ? null : parsed;
}

function detectDelimiter(text) {
  const candidates = [',', ';', '\t'];
  const counts = new Map(candidates.map((delimiter) => [delimiter, 0]));
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && (char === '\n' || char === '\r')) {
      break;
    } else if (!quoted && counts.has(char)) {
      counts.set(char, counts.get(char) + 1);
    }
  }
  return candidates.sort(
    (left, right) => counts.get(right) - counts.get(left),
  )[0];
}

export function parseCsv(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  if (!source.trim()) throw new Error('The CSV file is empty.');
  const delimiter = detectDelimiter(source);
  const records = [];
  let row = [];
  let field = '';
  let quoted = false;
  let emptyRowsSkipped = 0;

  const finishRow = () => {
    row.push(field);
    if (row.length === 1 && !row[0].trim()) emptyRowsSkipped += 1;
    else records.push(row);
    row = [];
    field = '';
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      if (field.trim())
        throw new Error('A quote appears inside an unquoted CSV field.');
      field = '';
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      finishRow();
      if (char === '\r' && source[index + 1] === '\n') index += 1;
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted field.');
  if (row.length || field) finishRow();
  if (records.length < 2)
    throw new Error('Add a header row and at least one expense.');

  const headers = records[0].map((header) => header.trim());
  if (headers.length < 2 || headers.every((header) => !header)) {
    throw new Error('The CSV needs column headers.');
  }
  const dataRows = records.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(
        `CSV row ${index + 2} has a different number of columns.`,
      );
    }
    return values;
  });
  return { headers, rows: dataRows, delimiter, emptyRowsSkipped };
}

export function inferColumnMapping(headers) {
  const find = (kind) => {
    const index = headers.findIndex((header) =>
      aliases[kind].has(normalizeHeader(header)),
    );
    return index < 0 ? null : index;
  };
  return {
    date: find('date'),
    description: find('description'),
    amount: find('amount'),
    debit: find('debit'),
    credit: find('credit'),
    currency: find('currency'),
    category: find('category'),
    direction: find('direction'),
  };
}

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
    if (decimalSeparator === ',' && fractionLength > 0 && fractionLength <= 3) {
      raw = raw.replace(',', '.');
    }
  } else if (lastComma >= 0) {
    const fractionLength = raw.length - lastComma - 1;
    raw = fractionLength > 0 && fractionLength <= 2
      ? `${raw.slice(0, lastComma).replaceAll(',', '')}.${raw.slice(lastComma + 1)}`
      : raw.replaceAll(',', '');
  } else if ((raw.match(/\./g) || []).length > 1) {
    const lastPeriod = raw.lastIndexOf('.');
    const fractionLength = raw.length - lastPeriod - 1;
    if (fractionLength === 3) raw = raw.replaceAll('.', '');
    else raw = `${raw.slice(0, lastPeriod).replaceAll('.', '')}.${raw.slice(lastPeriod + 1)}`;
  }

  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const amount = Number(raw);
  return Number.isFinite(amount)
    ? parenthesized || explicitlyNegative
      ? -amount
      : amount
    : null;
}

function detectCurrency(rawValue) {
  const value = String(rawValue || '').trim();
  const code = value.match(/\b([A-Z]{3})\b/i)?.[1]?.toUpperCase();
  if (code) return code;
  if (value.includes('₹')) return 'INR';
  if (value.includes('€')) return 'EUR';
  if (value.includes('£')) return 'GBP';
  // Dollar and yen symbols are shared by several currencies, so require a
  // user choice instead of guessing USD or JPY.
  return '';
}

function isCurrencyCode(value) {
  const currency = String(value || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return false;
  return typeof Intl.supportedValuesOf !== 'function' ||
    Intl.supportedValuesOf('currency').includes(currency);
}

function normalizeDirection(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['debit', 'expense', 'outflow', 'withdrawal', 'dr'].includes(normalized))
    return 'debit';
  if (['credit', 'income', 'inflow', 'deposit', 'refund', 'cr'].includes(normalized))
    return 'credit';
  return null;
}

export function analyzeMappedCsv(parsed, mapping, options = {}) {
  const hasDebitCredit = mapping.debit != null || mapping.credit != null;
  if (mapping.description == null || (mapping.amount == null && !hasDebitCredit)) {
    return {
      rows: [],
      errors: [
        'Choose a description column and either an amount column or debit/credit columns.',
      ],
      duplicates: [],
      totalDebits: 0,
      totalCredits: 0,
      dateRange: null,
    };
  }

  const mappedColumns = [
    mapping.date,
    mapping.description,
    mapping.amount,
    mapping.debit,
    mapping.credit,
    mapping.currency,
    mapping.category,
    mapping.direction,
  ].filter((index) => index != null);
  if (new Set(mappedColumns).size !== mappedColumns.length) {
    return {
      rows: [],
      errors: ['Each selected field must come from a different CSV column.'],
      duplicates: [],
      totalDebits: 0,
      totalCredits: 0,
      dateRange: null,
    };
  }

  const currenciesInFile = new Set(parsed.rows.map((values) => {
    const rawCurrency = mapping.currency == null
      ? ''
      : String(values[mapping.currency] || '').trim();
    const rawAmount = mapping.amount == null
      ? ''
      : String(values[mapping.amount] || '').trim();
    const rawDebit = mapping.debit == null
      ? ''
      : String(values[mapping.debit] || '').trim();
    const rawCredit = mapping.credit == null
      ? ''
      : String(values[mapping.credit] || '').trim();
    const rawValue = rawCurrency || rawAmount || rawDebit || rawCredit;
    return rawCurrency
      ? detectCurrency(rawCurrency) ||
        (/^[$¥]$/.test(rawCurrency) ? options.currency || '' : rawCurrency.toUpperCase())
      : detectCurrency(rawValue);
  }).filter(Boolean));
  const inferredCurrency = options.currency ||
    (currenciesInFile.size === 1 ? [...currenciesInFile][0] : '');

  const rows = parsed.rows.map((values, index) => {
    const rowNumber = index + 2;
    const date = mapping.date == null ? '' : String(values[mapping.date] || '').trim();
    const description = String(values[mapping.description] || '').trim();
    const rawAmount = mapping.amount == null ? '' : String(values[mapping.amount] || '').trim();
    const rawDebit = mapping.debit == null ? '' : String(values[mapping.debit] || '').trim();
    const rawCredit = mapping.credit == null ? '' : String(values[mapping.credit] || '').trim();
    const rawDirection = mapping.direction == null ? '' : String(values[mapping.direction] || '').trim();
    const rawCurrency = mapping.currency == null ? '' : String(values[mapping.currency] || '').trim();
    const categoryInput = mapping.category == null ? '' : String(values[mapping.category] || '').trim();
    const rawCategory = CSV_CATEGORIES.find(
      (category) => category.toLowerCase() === categoryInput.toLowerCase(),
    ) || categoryInput;
    const ambiguousCurrencySymbol = /[$¥]/.test(rawCurrency || rawAmount || rawDebit || rawCredit);
    const errors = [];
    let amount = null;
    let direction = null;
    const amountCurrency = detectCurrency(rawAmount || rawDebit || rawCredit);
    const explicitCurrency = detectCurrency(rawCurrency) || amountCurrency;
    let currency = rawCurrency
      ? detectCurrency(rawCurrency) ||
        (/^[$¥]$/.test(rawCurrency) ? options.currency || '' : rawCurrency.trim().toUpperCase())
      : amountCurrency || (ambiguousCurrencySymbol ? options.currency || '' : inferredCurrency) || '';
    const explicitDirection = normalizeDirection(rawDirection);

    if (!description) errors.push('Description is missing.');
    if (date && !isValidDate(date)) errors.push('Date is invalid. Use a valid date or leave it blank.');

    if (hasDebitCredit) {
      const debitValue = rawDebit ? parseAmount(rawDebit) : null;
      const creditValue = rawCredit ? parseAmount(rawCredit) : null;
      const debitEntered = rawDebit !== '';
      const creditEntered = rawCredit !== '';
      const hasDebit = debitEntered && debitValue != null && debitValue !== 0;
      const hasCredit = creditEntered && creditValue != null && creditValue !== 0;
      if (hasDebit && hasCredit) {
        errors.push('A row cannot contain both a debit and a credit amount.');
      } else if (hasDebit || hasCredit) {
        const selected = hasCredit ? creditValue : debitValue;
        amount = Math.abs(selected);
        direction = hasCredit ? 'credit' : 'debit';
        if (selected < 0) direction = options.negativeAmountMeans || 'credit';
      } else if (debitEntered || creditEntered) {
        const selected = debitEntered ? debitValue : creditValue;
        amount = selected == null ? null : Math.abs(selected);
        direction = debitEntered ? 'debit' : 'credit';
      } else if (rawAmount) {
        const signed = parseAmount(rawAmount);
        amount = signed == null ? null : Math.abs(signed);
        direction = signed != null && signed < 0 ? options.negativeAmountMeans || 'credit' : 'debit';
      }
      if ((debitEntered && debitValue == null) || (creditEntered && creditValue == null)) {
        errors.push('Debit and credit values must be numeric.');
      }
    } else {
      const signed = parseAmount(rawAmount);
      amount = signed == null ? null : Math.abs(signed);
      direction = signed != null && signed < 0 ? options.negativeAmountMeans || 'credit' : 'debit';
    }

    if (explicitDirection) direction = explicitDirection;
    else if (rawDirection) errors.push('Direction must be debit/expense or credit/income.');
    if (amount == null) errors.push('Amount must be a valid number.');
    if (direction && !['debit', 'credit'].includes(direction)) errors.push('Choose how negative amounts should be interpreted.');
    if (!isCurrencyCode(currency)) errors.push('Choose a valid ISO three-letter currency code.');
    if (
      options.currency &&
      explicitCurrency &&
      explicitCurrency !== options.currency.toUpperCase()
    ) {
      errors.push(`Selected ${options.currency.toUpperCase()} conflicts with ${explicitCurrency} in this row.`);
    }
    if (rawCategory && !CSV_CATEGORIES.includes(rawCategory)) {
      errors.push(`Category “${rawCategory}” is not supported. Map it to a supported category or clear the category column.`);
    }

    return {
      rowNumber,
      date,
      description,
      rawAmount: rawAmount || rawDebit || rawCredit,
      amount,
      direction,
      currency,
      category: rawCategory || '',
      errors,
    };
  });

  const currencySet = new Set(rows.map((row) => row.currency).filter(Boolean));
  const mixedCurrencies = currencySet.size > 1;
  if (mixedCurrencies) {
    rows.forEach((row) => row.errors.push('This file contains multiple currencies. Import each currency as a separate quest.'));
  }

  const seen = new Map();
  for (const row of rows) {
    if (row.errors.length) continue;
    const duplicateKey = `${row.date.toLocaleLowerCase()}\u0000${row.description.toLocaleLowerCase()}\u0000${row.amount.toFixed(2)}\u0000${row.direction}\u0000${row.currency}`;
    row.duplicateOf = seen.get(duplicateKey) || null;
    if (!row.duplicateOf) seen.set(duplicateKey, row.rowNumber);
  }

  const validRows = rows.filter((row) => !row.errors.length);
  const debitRows = validRows.filter((row) => row.direction === 'debit');
  const creditRows = validRows.filter((row) => row.direction === 'credit');
  const validDates = validRows.map((row) => ({ date: row.date, value: dateSortValue(row.date) })).filter((item) => item.value != null).sort((left, right) => left.value - right.value);
  const totals = {
    totalTransactions: validRows.length,
    totalDebits: debitRows.reduce((sum, row) => sum + row.amount, 0),
    totalCredits: creditRows.reduce((sum, row) => sum + row.amount, 0),
    currency: currencySet.size === 1 && rows.every((row) => row.currency)
      ? [...currencySet][0]
      : '',
    mixedCurrencies,
    dateRange: validDates.length ? { from: validDates[0].date, to: validDates[validDates.length - 1].date } : null,
  };
  return {
    rows,
    errors: rows.filter((row) => row.errors.length),
    duplicates: rows.filter((row) => row.duplicateOf),
    ...totals,
  };
}

function quote(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatAmount(value, currency) {
  const fractionDigits = new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
  }).resolvedOptions().maximumFractionDigits;
  return Number(value).toFixed(fractionDigits);
}

export function buildCanonicalCsv(parsed, mapping, options = {}) {
  const analysis = analyzeMappedCsv(parsed, mapping, options);
  const excludeInvalid = Boolean(options.excludeInvalid);
  const excludeDuplicates = Boolean(options.excludeDuplicates);
  if (analysis.errors.length && !excludeInvalid) {
    throw new Error('Review or exclude the invalid rows before continuing.');
  }
  const included = analysis.rows.filter((row) => {
    if (row.errors.length && excludeInvalid) return false;
    if (row.duplicateOf && excludeDuplicates) return false;
    return true;
  });
  if (!included.length) throw new Error('No valid expense rows remain to create a quest.');

  const canonical = [
    ['Date', 'Description', 'Amount', 'Direction', 'Currency', 'Category'],
    ...included.map((row) => [
      row.date,
      row.description,
      formatAmount(row.amount, row.currency),
      row.direction,
      row.currency,
      row.category,
    ]),
  ];
  const csv = canonical.map((values) => values.map(quote).join(',')).join('\r\n');
  const includedDebits = included
    .filter((row) => row.direction === 'debit')
    .reduce((sum, row) => sum + row.amount, 0);
  const includedCredits = included
    .filter((row) => row.direction === 'credit')
    .reduce((sum, row) => sum + row.amount, 0);
  const includedDates = included
    .map((row) => ({ date: row.date, value: dateSortValue(row.date) }))
    .filter((item) => item.value != null)
    .sort((left, right) => left.value - right.value);
  const includedCurrencies = new Set(included.map((row) => row.currency));
  return {
    csv: `${csv}\r\n`,
    rows: included,
    removedInvalid: analysis.errors.length && excludeInvalid ? analysis.errors.length : 0,
    removedDuplicates: analysis.duplicates.length && excludeDuplicates ? analysis.duplicates.length : 0,
    totals: {
      totalTransactions: included.length,
      totalDebits: includedDebits,
      totalCredits: includedCredits,
      currency: includedCurrencies.size === 1 ? [...includedCurrencies][0] : '',
      dateRange: includedDates.length
        ? { from: includedDates[0].date, to: includedDates[includedDates.length - 1].date }
        : null,
    },
  };
}
