import { ArrowDownToLine, BarChart3, Check, FileText, LoaderCircle, Printer, Receipt, Target, Wallet } from 'lucide-react';

const money = (value, currency) => {
  const amount = Number(value) || 0;
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount); } catch { return `${currency} ${amount.toFixed(2)}`; }
  }
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
};

export default function Report({
  quest,
  report,
  showReport,
  onDownload,
  budgetInfo,
  budgetInput,
  setBudgetInput,
  onSaveBudget,
  savingBudget,
}) {
  if (!quest)
    return (
      <div className="empty-quest">
        <BarChart3 />
        <h2>No report to show</h2>
        <p>Start a quest to organize your actual expenses.</p>
      </div>
    );
  if (!report)
    return (
      <div className="empty-quest">
        <button className="button-primary" onClick={showReport}>
          Load spending report
        </button>
      </div>
    );
  const categorySpending = Array.isArray(report.categorySpending)
    ? report.categorySpending
    : [];
  const monthlySpending = Array.isArray(report.monthlySpending)
    ? report.monthlySpending
    : [];
  const max = Math.max(
    ...categorySpending.map((item) => Number(item.spending) || 0),
    1,
  );
  const positiveCategories = categorySpending.filter(
    (item) => Number(item.spending) > 0,
  );
  const colors = [
    '#b49aff',
    '#efc879',
    '#79cbb6',
    '#f18f8f',
    '#8fbdff',
    '#dc93cb',
    '#a7c96f',
    '#c2a888',
  ];
  let stop = 0;
  const donutSegments = positiveCategories.map((item, index) => {
    const start = stop;
    stop +=
      (Number(item.spending) / Math.max(Number(report.totalExpenses), 1)) * 100;
    return `${colors[index % colors.length]} ${start}% ${stop}%`;
  });
  return (
    <>
      <div className="report-heading">
        <div>
          <span className="overline">
            YOUR REAL SPENDING · QUEST {quest.id}
          </span>
          <h1>
            The money <em>map.</em>
          </h1>
          <p>Every number is calculated from your uploaded expenses.</p>
        </div>
        <div className="report-actions">
          <a
            className="button-primary"
            href="#download-categorized-csv"
            onClick={(event) => { event.preventDefault(); onDownload(); }}
          >
            <ArrowDownToLine size={15} /> Download categorized CSV
          </a>
          <button className="button-secondary" type="button" onClick={() => window.print()}>
            <Printer size={15} /> Print / Save as PDF
          </button>
        </div>
      </div>
      <section className="report-card budget-panel" aria-labelledby="budget-title">
        <div className="report-card-title">
          <Wallet />
          <div>
            <h2 id="budget-title">Monthly budget</h2>
            <p>Compare your budget with real debit transactions for {budgetInfo?.month || 'this month'}.</p>
          </div>
        </div>
        {quest.currency ? (
          <>
            <form
              className="budget-form"
              onSubmit={(event) => {
                event.preventDefault();
                onSaveBudget();
              }}
            >
              <label>
                <span>Budget amount ({quest.currency})</span>
                <input
                  type="number"
                  min="0"
                  max="1000000000"
                  step="0.01"
                  inputMode="decimal"
                  value={budgetInput}
                  onChange={(event) => setBudgetInput(event.target.value)}
                  placeholder="Set a monthly limit"
                  aria-label={`Monthly budget in ${quest.currency}`}
                />
              </label>
              <button className="button-primary" type="submit" disabled={savingBudget || !budgetInput}>
                {savingBudget ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}
                {savingBudget ? 'Saving…' : 'Save budget'}
              </button>
              {budgetInfo?.budget && (
                <button className="button-secondary" type="button" onClick={() => onSaveBudget('')} disabled={savingBudget}>
                  Clear budget
                </button>
              )}
            </form>
            {budgetInfo?.budget ? (
              <>
                <div className="budget-summary">
                  <div><span>MONTHLY BUDGET</span><b>{money(budgetInfo.budget.monthlyAmount, quest.currency)}</b></div>
                  <div><span>SPENT THIS MONTH</span><b>{money(budgetInfo.currentMonthSpending, quest.currency)}</b></div>
                  <div><span>REMAINING</span><b>{money(budgetInfo.remaining, quest.currency)}</b></div>
                  <div><span>USED</span><b>{budgetInfo.percentUsed}%</b></div>
                </div>
                <div
                  className={`budget-meter ${budgetInfo.overBudget ? 'over' : budgetInfo.nearLimit ? 'near' : ''}`}
                  role="img"
                  aria-label={`${budgetInfo.percentUsed}% of monthly budget used`}
                >
                  <i style={{ width: `${Math.min(budgetInfo.percentUsed, 100)}%` }} />
                </div>
                {(budgetInfo.nearLimit || budgetInfo.overBudget) && (
                  <p className={`budget-warning ${budgetInfo.overBudget ? 'over' : ''}`} role="status">
                    {budgetInfo.overBudget
                      ? `You are ${money(Math.abs(budgetInfo.remaining), quest.currency)} over this month's budget.`
                      : `You have used ${budgetInfo.percentUsed}% of this month's budget.`}
                  </p>
                )}
              </>
            ) : (
              <p className="budget-empty">Set a monthly limit to see spending, remaining balance, and an 80% heads-up. Totals include debit transactions saved in {quest.currency} across your quests.</p>
            )}
          </>
        ) : (
          <p className="budget-empty">This older quest has no saved currency code. Upload a statement with a currency selected to use budget tracking.</p>
        )}
      </section>
      <div className="report-kpis">
        <div>
          <span>TOTAL SPENDING</span>
          <b>{money(report.totalExpenses, report.currency || quest.currency)}</b>
          <small>
            {report.totalTransactions} transactions · {money(report.totalCredits, report.currency || quest.currency)} credits · Net {money(report.netSpend, report.currency || quest.currency)}
          </small>
        </div>
        <div>
          <span>AVERAGE TRANSACTION</span>
          <b>{money(report.averageTransactionAmount, report.currency || quest.currency)}</b>
          <small>Across this quest</small>
        </div>
        <div>
          <span>TOP CATEGORY</span>
          <b>{report.highestSpendingCategory || '—'}</b>
          <small>By total amount</small>
        </div>
        <div>
          <span>TOP MERCHANT</span>
          <b>{report.topMerchants?.[0]?.merchant || '—'}</b>
          <small>
            {report.topMerchants?.[0]
              ? `${money(report.topMerchants[0].spending, report.currency || quest.currency)} across ${report.topMerchants[0].count} transactions`
              : 'No merchant totals yet'}
          </small>
        </div>
      </div>
      <div className="report-grid">
        <section className="report-card">
          <div className="report-card-title">
            <BarChart3 />
            <div>
              <h2>Where it went</h2>
              <p>Spending by category</p>
            </div>
          </div>
          {categorySpending.map((item, index) => (
            <div className="category-bar" key={item.category}>
              <div>
                <span>
                  <i className={`legend-dot dot-${index % 6}`} />
                  {item.category}
                </span>
                <b>{money(item.spending, report.currency || quest.currency)}</b>
              </div>
              <div className="thin-meter">
                <i
                  style={{ width: `${(Number(item.spending) / max) * 100}%` }}
                />
              </div>
              <small>
                {item.count} transactions ·{' '}
                {Math.round(
                  (Number(item.spending) /
                    Math.max(Number(report.totalExpenses), 1)) *
                    100,
                )}
                % of total
              </small>
            </div>
          ))}
        </section>
        <section className="report-card distribution-card">
          <div className="report-card-title">
            <Target />
            <div>
              <h2>Spending mix</h2>
              <p>Share of your total</p>
            </div>
          </div>
          {positiveCategories.length ? (
            <div className="donut-layout">
              <div
                className="spending-donut"
                role="img"
                aria-label={`Category distribution of ${money(report.totalExpenses, report.currency || quest.currency)} total spending`}
                style={{
                  background: `conic-gradient(${donutSegments.join(', ')})`,
                }}
              >
                <span>
                  <small>TOTAL</small>
                  <b>{money(report.totalExpenses, report.currency || quest.currency)}</b>
                </span>
              </div>
              <div className="donut-legend">
                {positiveCategories.map((item, index) => (
                  <div key={item.category}>
                    <i style={{ background: colors[index % colors.length] }} />
                    <span>{item.category}</span>
                    <b>
                      {Math.round(
                        (Number(item.spending) /
                          Math.max(Number(report.totalExpenses), 1)) *
                          100,
                      )}
                      %
                    </b>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-month">
              <FileText size={20} />
              <p>
                Category distribution will appear when this quest has spending.
              </p>
            </div>
          )}
        </section>
        <section className="report-card">
          <div className="report-card-title">
            <TrendingUp />
            <div>
              <h2>Monthly spending</h2>
              <p>Based on dates in your CSV</p>
            </div>
          </div>
          {monthlySpending.length >= 2 &&
            (() => {
              const previous = monthlySpending[monthlySpending.length - 2];
              const latest = monthlySpending[monthlySpending.length - 1];
              if (Number(previous.spending) <= 0)
                return (
                  <p className="month-comparison">
                    {latest.month} has spending data. There’s no spend in{' '}
                    {previous.month} to calculate a percentage change.
                  </p>
                );
              const change =
                ((Number(latest.spending) - Number(previous.spending)) /
                  Number(previous.spending)) *
                100;
              return (
                <p className="month-comparison">
                  {latest.month} is{' '}
                  <b>
                    {Math.abs(Math.round(change))}%{' '}
                    {change > 0 ? 'higher' : change < 0 ? 'lower' : 'unchanged'}
                  </b>{' '}
                  than {previous.month}.
                </p>
              );
            })()}
          {monthlySpending.length === 1 && (
            <p className="month-comparison">
              Add another month of expenses to see a monthly comparison.
            </p>
          )}
          {monthlySpending.length ? (
            monthlySpending.map((item) => (
              <div className="month-row" key={item.month}>
                <span>{item.month}</span>
                <div className="thin-meter">
                  <i
                    style={{
                      width: `${(item.spending / Math.max(...monthlySpending.map((row) => row.spending), 1)) * 100}%`,
                    }}
                  />
                </div>
                <b>{money(item.spending, report.currency || quest.currency)}</b>
              </div>
            ))
          ) : (
            <div className="empty-month">
              <FileText size={20} />
              <p>No usable dates were included in this CSV.</p>
            </div>
          )}
        </section>
        <section className="report-card">
          <div className="report-card-title">
            <Receipt />
            <div>
              <h2>Top merchants</h2>
              <p>Grouped by the exact description in your CSV</p>
            </div>
          </div>
          {report.topMerchants?.length ? (
            <ol className="insight-list">
              {report.topMerchants.map((item, index) => (
                <li key={`${item.merchant}-${index}`}>
                  <span className="insight-rank">{index + 1}</span>
                  <span className="insight-detail">
                    <b>{item.merchant}</b>
                    <small>
                      {item.count} transaction{item.count === 1 ? '' : 's'} ·{' '}
                      {Math.round(
                        (Number(item.spending) /
                          Math.max(Number(report.totalExpenses), 1)) *
                          100,
                      )}
                      % of total
                    </small>
                  </span>
                  <strong>{money(item.spending, report.currency || quest.currency)}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-month">
              <FileText size={20} />
              <p>Merchant totals appear when your quest has transactions.</p>
            </div>
          )}
        </section>
        <section className="report-card">
          <div className="report-card-title">
            <Wallet />
            <div>
              <h2>Five highest expenses</h2>
              <p>Largest transactions in this quest</p>
            </div>
          </div>
          {report.topTransactions?.length ? (
            <ol className="insight-list">
              {report.topTransactions.map((item, index) => (
                <li key={`${item.description}-${item.date}-${index}`}>
                  <span className="insight-rank">{index + 1}</span>
                  <span className="insight-detail">
                    <b>{item.description}</b>
                    <small>
                      {item.date || 'Date not provided'} ·{' '}
                      {item.category || 'Uncategorized'}
                    </small>
                  </span>
                  <strong>{money(item.amount, item.currency || report.currency || quest.currency)}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-month">
              <FileText size={20} />
              <p>Your largest transactions will appear here.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
