'use strict';

function roundCurrency(value, currency) {
  let digits = 2;
  try {
    if (currency && /^[A-Z]{3}$/.test(currency)) digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  } catch { /* Keep two digits for unrecognized legacy codes. */ }
  const scale = 10 ** digits;
  return Math.round((Number(value || 0) + Number.EPSILON) * scale) / scale;
}

function monthKeyExpression() {
  const value = { $ifNull: ['$date', ''] };
  const parts = { $split: [value, '/'] };
  const integer = (input) => ({ $convert: { input, to: 'int', onError: null, onNull: null } });
  return { $switch: {
    branches: [
      { case: { $regexMatch: { input: value, regex: /^\d{4}-\d{1,2}-\d{1,2}/ } }, then: {
        $let: { vars: { pieces: { $split: [{ $substrBytes: [value, 0, 7] }, '-'] } }, in: {
          $concat: [{ $arrayElemAt: ['$$pieces', 0] }, '-', { $cond: [
            { $eq: [{ $strLenBytes: { $arrayElemAt: ['$$pieces', 1] } }, 1] },
            { $concat: ['0', { $arrayElemAt: ['$$pieces', 1] }] }, { $arrayElemAt: ['$$pieces', 1] },
          ] }],
        } },
      } },
      { case: { $regexMatch: { input: value, regex: /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/ } }, then: {
        $let: { vars: { first: integer({ $arrayElemAt: [parts, 0] }), second: integer({ $arrayElemAt: [parts, 1] }), year: integer({ $arrayElemAt: [parts, 2] }) }, in: {
          $let: { vars: { month: { $cond: [{ $gt: ['$$first', 12] }, '$$second', '$$first'] }, yearFull: { $cond: [{ $lt: ['$$year', 100] }, { $add: ['$$year', { $cond: [{ $lt: ['$$year', 70] }, 2000, 1900] }] }, '$$year'] } }, in: {
            $concat: [{ $toString: '$$yearFull' }, '-', { $cond: [{ $lt: ['$$month', 10] }, { $concat: ['0', { $toString: '$$month' }] }, { $toString: '$$month' }] }],
          } },
        } },
      } },
    ],
    default: { $let: { vars: { parsed: { $dateFromString: { dateString: value, onError: null, onNull: null } } }, in: { $cond: [{ $ne: ['$$parsed', null] }, { $dateToString: { date: '$$parsed', format: '%Y-%m', timezone: 'UTC' } }, null] } } },
  } };
}

async function buildQuestReport(transactions, { userId, questId, currency }) {
  const [result = {}] = await transactions.aggregate([
    { $match: { user_id: userId, quest_id: questId } },
    { $facet: {
      summary: [{ $group: { _id: null, totalTransactions: { $sum: 1 }, debitCount: { $sum: { $cond: [{ $ne: ['$direction', 'credit'] }, 1, 0] } }, debits: { $sum: { $cond: [{ $ne: ['$direction', 'credit'] }, '$amount', 0] } }, credits: { $sum: { $cond: [{ $eq: ['$direction', 'credit'] }, '$amount', 0] } } } }],
      categories: [{ $match: { direction: { $ne: 'credit' } } }, { $group: { _id: { $ifNull: ['$final_category', 'Other'] }, spending: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { spending: -1, _id: 1 } }],
      merchants: [{ $match: { direction: { $ne: 'credit' } } }, { $set: { merchant: { $trim: { input: { $ifNull: ['$description', ''] } } }, merchantKey: { $toLower: { $trim: { input: { $ifNull: ['$description', ''] } } } } } }, { $group: { _id: '$merchantKey', merchant: { $first: '$merchant' }, spending: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { spending: -1, _id: 1 } }, { $limit: 5 }],
      top: [{ $match: { direction: { $ne: 'credit' } } }, { $sort: { amount: -1, _id: 1 } }, { $limit: 5 }, { $project: { _id: 0, date: 1, description: 1, amount: 1, category: '$final_category', currency: { $ifNull: ['$currency', currency || null] } } }],
      monthly: [{ $match: { direction: { $ne: 'credit' } } }, { $set: { month: monthKeyExpression() } }, { $match: { month: { $ne: null } } }, { $group: { _id: '$month', spending: { $sum: '$amount' } } }, { $sort: { _id: 1 } }],
    } },
  ]).next();
  const summary = result.summary?.[0] || { totalTransactions: 0, debitCount: 0, debits: 0, credits: 0 };
  const categories = (result.categories || []).map((row) => ({ category: row._id, spending: roundCurrency(row.spending, currency), count: row.count }));
  const topTransactions = result.top || [];
  const largest = topTransactions[0];
  const totalExpenses = roundCurrency(summary.debits, currency);
  const totalCredits = roundCurrency(summary.credits, currency);
  return {
    totalExpenses, totalDebits: totalExpenses, totalCredits,
    netSpend: roundCurrency(summary.debits - summary.credits, currency),
    currency: currency || null, totalTransactions: summary.totalTransactions,
    categorySpending: categories,
    topMerchants: (result.merchants || []).map((row) => ({ merchant: row.merchant, spending: roundCurrency(row.spending, currency), count: row.count })),
    topTransactions,
    highestSpendingCategory: categories[0]?.category || null,
    averageTransactionAmount: summary.debitCount ? roundCurrency(summary.debits / summary.debitCount, currency) : 0,
    largestTransaction: largest ? { ...largest, currency: largest.currency || currency || null } : null,
    monthlySpending: (result.monthly || []).map((row) => ({ month: row._id, spending: roundCurrency(row.spending, currency) })),
  };
}

module.exports = { buildQuestReport, monthKeyExpression };
