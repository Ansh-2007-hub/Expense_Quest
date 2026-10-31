'use strict';

// Ordered, deterministic merchant rules. Delivery services are checked before
// transport providers so merchants such as "Uber Eats" resolve to Food.
const rules = [
  [
    'Food',
    /\b(?:uber\s*eats|doordash|grubhub|deliveroo|foodpanda|swiggy|zomato)\b|restaurant|cafe|coffee|food|grocery|groceries|bakery|pizza/i,
  ],
  ['Shopping', /\b(?:amazon|flipkart)\b|store|shopping|mall|retail|clothing/i],
  [
    'Travel',
    /\b(?:uber|ola|metro|petrol|fuel|taxi|flight|train|bus|parking)\b/i,
  ],
  [
    'Bills',
    /electricity|water\s*bill|internet|rent|utility|broadband|mobile\s*bill/i,
  ],
  ['Entertainment', /netflix|spotify|movie|cinema|concert|gaming|theatre/i],
  ['Healthcare', /hospital|pharmacy|medicine|medical|clinic|doctor|health/i],
  ['Education', /school|college|course|books|tuition|university/i],
];

function categorize(description) {
  const merchant = String(description || '').trim();
  return rules.find(([, pattern]) => pattern.test(merchant))?.[0] || 'Other';
}

module.exports = {
  categorize,
  categories: [...rules.map(([category]) => category), 'Other'],
};
