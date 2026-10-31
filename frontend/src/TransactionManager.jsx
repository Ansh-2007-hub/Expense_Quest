import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Check,
  ListFilter,
  LoaderCircle,
  Search,
  SkipForward,
} from 'lucide-react';
import {
  filterAndSortTransactions,
  pageTransactions,
} from './transactionFilters.mjs';

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
const PAGE_SIZE = 20;

const money = (value, currency) => {
  const amount = Number(value) || 0;
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export default function TransactionManager({
  transactions,
  currency,
  onSaveCategory,
  onBulkSaveCategory,
  onReview,
  savingCategoryId,
}) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState('date-newest');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkCategory, setBulkCategory] = useState('Other');
  const [bulkSaving, setBulkSaving] = useState(false);

  const totals = useMemo(
    () =>
      transactions.reduce(
        (result, item) => {
          result.count += 1;
          if (item.direction === 'credit') result.credits += Number(item.amount) || 0;
          else result.debits += Number(item.amount) || 0;
          if (item.reviewed) result.reviewed += 1;
          else if (item.skipped) result.skipped += 1;
          else result.pending += 1;
          return result;
        },
        { debits: 0, credits: 0, count: 0, reviewed: 0, skipped: 0, pending: 0 },
      ),
    [transactions],
  );

  const visible = useMemo(
    () =>
      filterAndSortTransactions(transactions, {
        query,
        category: categoryFilter,
        status: statusFilter,
        fromDate,
        toDate,
        sort,
      }),
    [transactions, query, categoryFilter, statusFilter, fromDate, toDate, sort],
  );
  const paged = pageTransactions(visible, page, PAGE_SIZE);
  const pageIds = paged.rows.map((item) => item.id);
  const pageFullySelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  function changeFilter(setter, value) {
    setter(value);
    setPage(1);
    setSelectedIds(new Set());
  }

  function togglePageSelection(checked) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of pageIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggleRowSelection(id, checked) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function applyBulkCategory() {
    if (!selectedIds.size || bulkSaving) return;
    setBulkSaving(true);
    try {
      const updatedIds = await onBulkSaveCategory([...selectedIds], bulkCategory);
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const id of updatedIds || []) next.delete(id);
        return next;
      });
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <section
      className="transaction-manager transactions-page"
      id="transaction-manager"
      aria-labelledby="transaction-manager-title"
    >
      <div className="manager-heading">
        <div>
          <span className="step-tag">YOUR STATEMENT</span>
          <h1 id="transaction-manager-title">Transactions</h1>
          <p>Search, filter, and correct categories. Changes save to your quest.</p>
        </div>
        <strong className="manager-total">
          {money(totals.debits, currency)}
          <small>debits · {money(totals.credits, currency)} credits</small>
        </strong>
      </div>

      <div className="manager-summary" aria-label="Transaction status summary">
        <span><b>{totals.count}</b> total</span>
        <span><b>{totals.pending}</b> to review</span>
        <span><b>{totals.reviewed}</b> reviewed</span>
        <span><b>{totals.skipped}</b> skipped</span>
      </div>

      <div className="manager-filters">
        <label className="manager-search">
          <Search size={16} />
          <span className="sr-only">Search transactions</span>
          <input
            value={query}
            onChange={(event) => changeFilter(setQuery, event.target.value)}
            placeholder="Search merchant or date"
          />
        </label>
        <label className="manager-select">
          <ListFilter size={15} />
          <span className="sr-only">Filter by category</span>
          <select
            value={categoryFilter}
            onChange={(event) => changeFilter(setCategoryFilter, event.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label className="manager-select">
          <span className="sr-only">Filter by review status</span>
          <select
            value={statusFilter}
            onChange={(event) => changeFilter(setStatusFilter, event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">To review</option>
            <option value="reviewed">Reviewed</option>
            <option value="skipped">Skipped</option>
          </select>
        </label>
        <label className="manager-date">
          <span className="sr-only">From date</span>
          <input
            type="date"
            aria-label="From date"
            value={fromDate}
            onChange={(event) => changeFilter(setFromDate, event.target.value)}
          />
        </label>
        <label className="manager-date">
          <span className="sr-only">To date</span>
          <input
            type="date"
            aria-label="To date"
            value={toDate}
            onChange={(event) => changeFilter(setToDate, event.target.value)}
          />
        </label>
        <label className="manager-select">
          <ArrowUpDown size={15} />
          <span className="sr-only">Sort transactions</span>
          <select
            value={sort}
            onChange={(event) => changeFilter(setSort, event.target.value)}
          >
            <option value="date-newest">Date: newest</option>
            <option value="date-oldest">Date: oldest</option>
            <option value="amount-high">Amount: high to low</option>
            <option value="amount-low">Amount: low to high</option>
            <option value="merchant">Description: A to Z</option>
          </select>
        </label>
      </div>

      {selectedIds.size > 0 && (
        <div className="bulk-controls" aria-label="Bulk category controls">
          <span><b>{selectedIds.size}</b> selected</span>
          <label>
            <span className="sr-only">Set selected transactions to category</span>
            <select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)}>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <button type="button" className="manager-action" onClick={applyBulkCategory} disabled={bulkSaving}>
            {bulkSaving ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}
            {bulkSaving ? 'Saving…' : 'Apply category'}
          </button>
          <button type="button" className="manager-clear-selection" onClick={() => setSelectedIds(new Set())} disabled={bulkSaving}>
            Clear selection
          </button>
        </div>
      )}

      <div className="transaction-table-wrap">
        <table className="transaction-table">
          <thead>
            <tr>
              <th scope="col" className="select-cell">
                <input
                  type="checkbox"
                  aria-label="Select all transactions on this page"
                  checked={pageFullySelected}
                  onChange={(event) => togglePageSelection(event.target.checked)}
                />
              </th>
              <th scope="col">Expense</th>
              <th scope="col">Category</th>
              <th scope="col">Amount</th>
              <th scope="col">Status</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((item) => {
              const status = item.reviewed ? 'Reviewed' : item.skipped ? 'Skipped' : 'To review';
              const busy = savingCategoryId === item.id;
              return (
                <tr key={item.id}>
                  <td data-label="Select" className="select-cell">
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.description}`}
                      checked={selectedIds.has(item.id)}
                      onChange={(event) => toggleRowSelection(item.id, event.target.checked)}
                    />
                  </td>
                  <td data-label="Expense">
                    <b>{item.description}</b>
                    <small>{item.date || 'Date not provided'}</small>
                  </td>
                  <td data-label="Category">
                    <label className="sr-only" htmlFor={`category-${item.id}`}>Category for {item.description}</label>
                    <select
                      id={`category-${item.id}`}
                      value={item.category || item.suggestedCategory || 'Other'}
                      disabled={busy}
                      onChange={(event) => onSaveCategory(item.id, event.target.value)}
                    >
                      {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                    {busy && <span className="inline-saving" role="status"><LoaderCircle size={13} className="spin" /> Saving</span>}
                  </td>
                  <td data-label="Amount">
                    {item.direction === 'credit' ? '+ ' : ''}
                    {money(item.amount, item.currency || currency)}
                    {item.direction === 'credit' && <small>Credit</small>}
                  </td>
                  <td data-label="Status">
                    <span className={`transaction-status ${status.toLowerCase().replace(' ', '-')}`}>
                      {item.reviewed && <Check size={12} />}
                      {item.skipped && <SkipForward size={12} />}
                      {status}
                    </span>
                  </td>
                  <td className="manager-action-cell">
                    {item.reviewed ? <span className="manager-saved">Saved</span> : (
                      <button className="manager-action" type="button" onClick={() => onReview(item)}>
                        {item.skipped ? 'Resume' : 'Review'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!paged.rows.length && (
              <tr>
                <td colSpan="6"><div className="manager-empty">No transactions match these filters. Try a different search, date range, or status.</div></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="manager-pagination">
        <span>Showing {visible.length ? (paged.page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(paged.page * PAGE_SIZE, visible.length)} of {visible.length} matching transactions</span>
        <div>
          <button type="button" className="manager-page-button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={paged.page <= 1} aria-label="Previous page"><ArrowLeft size={14} /> Previous</button>
          <span aria-live="polite">Page {paged.page} of {paged.totalPages}</span>
          <button type="button" className="manager-page-button" onClick={() => setPage((value) => Math.min(paged.totalPages, value + 1))} disabled={paged.page >= paged.totalPages} aria-label="Next page">Next <ArrowRight size={14} /></button>
        </div>
      </div>
    </section>
  );
}
