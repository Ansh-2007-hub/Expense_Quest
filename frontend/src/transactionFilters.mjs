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
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date.getTime();
  }
  const parsed = Date.parse(input);
  return Number.isNaN(parsed) ? null : parsed;
}

function boundaryValue(value, endOfDay = false) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
}

export function filterAndSortTransactions(transactions, filters = {}) {
  const {
    query = '',
    category = 'all',
    status = 'all',
    fromDate = '',
    toDate = '',
    sort = 'date-newest',
  } = filters;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const from = boundaryValue(fromDate);
  const to = boundaryValue(toDate, true);

  return transactions
    .filter((item) => {
      const matchesQuery =
        !normalizedQuery ||
        `${item.description || ''} ${item.date || ''}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      const matchesCategory =
        category === 'all' ||
        (item.category || item.suggestedCategory) === category;
      const itemStatus = item.reviewed
        ? 'reviewed'
        : item.skipped
          ? 'skipped'
          : 'pending';
      const date = dateSortValue(item.date);
      const matchesFrom = from == null || (date != null && date >= from);
      const matchesTo = to == null || (date != null && date <= to);
      return (
        matchesQuery &&
        matchesCategory &&
        (status === 'all' || itemStatus === status) &&
        matchesFrom &&
        matchesTo
      );
    })
    .sort((left, right) => {
      if (sort === 'amount-high') return Number(right.amount) - Number(left.amount);
      if (sort === 'amount-low') return Number(left.amount) - Number(right.amount);
      if (sort === 'merchant') {
        return String(left.description || '').localeCompare(String(right.description || ''));
      }
      const leftDate = dateSortValue(left.date);
      const rightDate = dateSortValue(right.date);
      if (leftDate == null && rightDate == null) return 0;
      if (leftDate == null) return 1;
      if (rightDate == null) return -1;
      return sort === 'date-oldest' ? leftDate - rightDate : rightDate - leftDate;
    });
}

export function pageTransactions(transactions, page, pageSize) {
  const size = Math.max(1, Number(pageSize) || 1);
  const totalPages = Math.max(1, Math.ceil(transactions.length / size));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (currentPage - 1) * size;
  return {
    page: currentPage,
    pageSize: size,
    totalPages,
    total: transactions.length,
    rows: transactions.slice(start, start + size),
  };
}
