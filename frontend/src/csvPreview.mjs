const aliases = {
  date: new Set(['date', 'transactiondate', 'transdate', 'purchasedate']),
  description: new Set([
    'description',
    'merchant',
    'name',
    'payee',
    'transaction',
    'details',
  ]),
  amount: new Set(['amount', 'value', 'total', 'transactionamount']),
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
      row.push(field);
      if (row.some((value) => value.trim() !== '')) records.push(row);
      row = [];
      field = '';
      if (char === '\r' && source[index + 1] === '\n') index += 1;
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted field.');
  row.push(field);
  if (row.some((value) => value.trim() !== '')) records.push(row);
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
  return { headers, rows: dataRows, delimiter };
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
  };
}

export function analyzeMappedCsv(parsed, mapping) {
  if (mapping.description == null || mapping.amount == null) {
    return {
      rows: [],
      errors: ['Choose a description column and an amount column.'],
      duplicates: [],
    };
  }
  if (
    mapping.description === mapping.amount ||
    mapping.description === mapping.date ||
    (mapping.date != null && mapping.amount === mapping.date)
  ) {
    return {
      rows: [],
      errors: ['Date, description and amount must use separate columns.'],
      duplicates: [],
    };
  }

  const seen = new Map();
  const rows = parsed.rows.map((values, index) => {
    const rowNumber = index + 2;
    const date =
      mapping.date == null ? '' : String(values[mapping.date] || '').trim();
    const description = String(values[mapping.description] || '').trim();
    const rawAmount = String(values[mapping.amount] || '').trim();
    const amount = Number(rawAmount.replace(/[$₹,\s]/g, ''));
    const errors = [];
    if (!description) errors.push('Description is missing.');
    if (date && !isValidDate(date)) {
      errors.push('Date is invalid. Use a valid date or leave it blank.');
    }
    if (!rawAmount || !Number.isFinite(amount) || amount < 0) {
      errors.push('Amount must be a non-negative number.');
    }
    const normalizedAmount = Number.isFinite(amount)
      ? amount.toFixed(2)
      : rawAmount;
    const duplicateKey = `${date.toLocaleLowerCase()}\u0000${description.toLocaleLowerCase()}\u0000${normalizedAmount}`;
    const duplicateOf = errors.length ? null : seen.get(duplicateKey) || null;
    if (!errors.length && !duplicateOf) seen.set(duplicateKey, rowNumber);
    return {
      rowNumber,
      date,
      description,
      rawAmount,
      amount,
      errors,
      duplicateOf,
    };
  });
  return {
    rows,
    errors: rows.filter((row) => row.errors.length),
    duplicates: rows.filter((row) => row.duplicateOf),
  };
}

function quote(value, delimiter) {
  const text = String(value ?? '');
  return /["\r\n]/.test(text) || text.includes(delimiter)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

export function buildCanonicalCsv(parsed, mapping, options = {}) {
  const analysis = analyzeMappedCsv(parsed, mapping);
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
  if (!included.length)
    throw new Error('No valid expense rows remain to create a quest.');

  const canonical = [
    ['Date', 'Description', 'Amount'],
    ...included.map((row) => [row.date, row.description, row.amount]),
  ];
  const csv = canonical
    .map((values) => values.map((value) => quote(value, ',')).join(','))
    .join('\r\n');
  return {
    csv: `${csv}\r\n`,
    rows: included,
    removedInvalid:
      analysis.errors.length && excludeInvalid ? analysis.errors.length : 0,
    removedDuplicates:
      analysis.duplicates.length && excludeDuplicates
        ? analysis.duplicates.length
        : 0,
  };
}
