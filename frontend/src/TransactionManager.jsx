import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  ListFilter,
  LoaderCircle,
  Search,
  SkipForward,
} from 'lucide-react';

const categories = [
  'Food',
  'Shopping',
  'Travel',
  'Bills',
  'Entertainment',
  'Healthcare',
  'Education',
  'Other',
];
const money = (value) =>
  new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

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
  const valueMs = Date.parse(input);
  return Number.isNaN(valueMs) ? null : valueMs;
}

export default function TransactionManager({
  transactions,
  onSaveCategory,
  onReview,
  savingCategoryId,
}) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('date-newest');

  const totals = useMemo(
    () =>
      transactions.reduce(
        (result, item) => {
          result.amount += Number(item.amount) || 0;
          result.count += 1;
          if (item.reviewed) result.reviewed += 1;
          else if (item.skipped) result.skipped += 1;
          else result.pending += 1;
          return result;
        },
        { amount: 0, count: 0, reviewed: 0, skipped: 0, pending: 0 },
      ),
    [transactions],
  );

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return transactions
      .filter((item) => {
        const matchesQuery =
          !normalizedQuery ||
          `${item.description} ${item.date || ''}`
            .toLocaleLowerCase()
            .includes(normalizedQuery);
        const matchesCategory =
          categoryFilter === 'all' ||
          (item.category || item.suggestedCategory) === categoryFilter;
        const status = item.reviewed
          ? 'reviewed'
          : item.skipped
            ? 'skipped'
            : 'pending';
        return (
          matchesQuery &&
          matchesCategory &&
          (statusFilter === 'all' || status === statusFilter)
        );
      })
      .sort((left, right) => {
        if (sort === 'amount-high')
          return Number(right.amount) - Number(left.amount);
        if (sort === 'amount-low')
          return Number(left.amount) - Number(right.amount);
        if (sort === 'merchant')
          return String(left.description).localeCompare(
            String(right.description),
          );
        const leftDate = dateSortValue(left.date);
        const rightDate = dateSortValue(right.date);
        if (leftDate == null && rightDate == null) return 0;
        if (leftDate == null) return 1;
        if (rightDate == null) return -1;
        return sort === 'date-oldest'
          ? leftDate - rightDate
          : rightDate - leftDate;
      });
  }, [transactions, query, categoryFilter, statusFilter, sort]);

  return (
    <section
      className="transaction-manager"
      id="transaction-manager"
      aria-labelledby="transaction-manager-title"
    >
      <div className="manager-heading">
        <div>
          <span className="step-tag">YOUR STATEMENT</span>
          <h2 id="transaction-manager-title">Transaction list</h2>
          <p>Search, correct categories, and return to anything you skipped.</p>
        </div>
        <strong className="manager-total">
          {money(totals.amount)} <small>{totals.count} transactions</small>
        </strong>
      </div>

      <div className="manager-summary" aria-label="Transaction status summary">
        <span>
          <b>{totals.pending}</b> to review
        </span>
        <span>
          <b>{totals.reviewed}</b> reviewed
        </span>
        <span>
          <b>{totals.skipped}</b> skipped
        </span>
      </div>

      <div className="manager-filters">
        <label className="manager-search">
          <Search size={16} />
          <span className="sr-only">Search transactions</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search description or date"
          />
        </label>
        <label className="manager-select">
          <ListFilter size={15} />
          <span className="sr-only">Filter by category</span>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="manager-select">
          <span className="sr-only">Filter by review status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">To review</option>
            <option value="reviewed">Reviewed</option>
            <option value="skipped">Skipped</option>
          </select>
        </label>
        <label className="manager-select">
          <ArrowUpDown size={15} />
          <span className="sr-only">Sort transactions</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="date-newest">Date: newest</option>
            <option value="date-oldest">Date: oldest</option>
            <option value="amount-high">Amount: high to low</option>
            <option value="amount-low">Amount: low to high</option>
            <option value="merchant">Description: A to Z</option>
          </select>
        </label>
      </div>

      <div className="transaction-table-wrap">
        <table className="transaction-table">
          <thead>
            <tr>
              <th scope="col">Expense</th>
              <th scope="col">Category</th>
              <th scope="col">Amount</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              const status = item.reviewed
                ? 'Reviewed'
                : item.skipped
                  ? 'Skipped'
                  : 'To review';
              const busy = savingCategoryId === item.id;
              return (
                <tr key={item.id}>
                  <td data-label="Expense">
                    <b>{item.description}</b>
                    <small>{item.date || 'Date not provided'}</small>
                  </td>
                  <td data-label="Category">
                    <label className="sr-only" htmlFor={`category-${item.id}`}>
                      Category for {item.description}
                    </label>
                    <select
                      id={`category-${item.id}`}
                      value={item.category || item.suggestedCategory || 'Other'}
                      disabled={busy}
                      onChange={(event) =>
                        onSaveCategory(item.id, event.target.value)
                      }
                    >
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    {busy && (
                      <span className="inline-saving" role="status">
                        <LoaderCircle size={13} className="spin" /> Saving
                      </span>
                    )}
                  </td>
                  <td data-label="Amount">{money(item.amount)}</td>
                  <td data-label="Status">
                    <span
                      className={`transaction-status ${status.toLowerCase().replace(' ', '-')}`}
                    >
                      {item.reviewed && <Check size={12} />}
                      {item.skipped && <SkipForward size={12} />}
                      {status}
                    </span>
                  </td>
                  <td className="manager-action-cell">
                    {item.reviewed ? (
                      <span className="manager-saved">Saved</span>
                    ) : (
                      <button
                        className="manager-action"
                        type="button"
                        onClick={() => onReview(item)}
                      >
                        {item.skipped ? 'Resume' : 'Review'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan="5">
                  <div className="manager-empty">
                    No transactions match these filters. Try a different search
                    or status.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="manager-result-count">
        Showing {visible.length} of {transactions.length} transactions
      </div>
    </section>
  );
}
