'use strict';

const { monthKeyFromDate } = require('./csv');

function roundCurrency(value, currency) {
  let fractionDigits = 2;
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    try {
      fractionDigits = new Intl.NumberFormat('en', {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits;
    } catch {
      fractionDigits = 2;
    }
  }
  const scale = 10 ** fractionDigits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function buildBudgetSummary({ currency, month, budget, transactions }) {
  const currentMonthSpending = roundCurrency(
    transactions.reduce(
      (sum, transaction) =>
        transaction.direction === 'credit' || monthKeyFromDate(transaction.date) !== month
          ? sum
          : sum + (Number(transaction.amount) || 0),
      0,
    ),
    currency,
  );
  const monthlyAmount = budget?.monthly_amount ?? null;
  const percentUsed = monthlyAmount
    ? Math.round((currentMonthSpending / monthlyAmount) * 1000) / 10
    : 0;
  return {
    currency,
    month,
    budget: budget
      ? {
          currency,
          monthlyAmount,
          updatedAt: budget.updated_at || null,
        }
      : null,
    currentMonthSpending,
    remaining: monthlyAmount == null
      ? null
      : roundCurrency(monthlyAmount - currentMonthSpending, currency),
    percentUsed,
    nearLimit: monthlyAmount != null && percentUsed >= 80 && percentUsed < 100,
    overBudget: monthlyAmount != null && currentMonthSpending >= monthlyAmount,
  };
}

module.exports = { buildBudgetSummary };
