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

function suggestCategory(description) {
  const merchant = String(description || '').trim();
  for (const [category, pattern] of rules) {
    const match = merchant.match(pattern);
    if (match) {
      return {
        category,
        reason: `Matched “${match[0]}” to the ${category} rule.`,
      };
    }
  }
  return {
    category: 'Other',
    reason: 'No merchant rule matched. Choose the category that fits.',
  };
}

function categorize(description) {
  return suggestCategory(description).category;
}

module.exports = {
  categorize,
  suggestCategory,
  categories: [...rules.map(([category]) => category), 'Other'],
};
