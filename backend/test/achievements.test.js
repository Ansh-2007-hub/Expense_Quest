'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deriveAchievements } = require('../src/achievements');

test('achievements unlock only when persisted review and completion counts meet milestones', () => {
  assert.deepEqual(deriveAchievements({}), []);
  assert.deepEqual(deriveAchievements({ reviewedTransactions: 1 }), ['First Review']);
  assert.deepEqual(deriveAchievements({ questsCompleted: 1 }), ['Dragon Slayer']);
  assert.deepEqual(
    deriveAchievements({ reviewedTransactions: 49, questsCompleted: 4 }),
    ['First Review', 'Dragon Slayer'],
  );
  assert.deepEqual(
    deriveAchievements({ reviewedTransactions: 50, questsCompleted: 5 }),
    ['First Review', 'Dragon Slayer', 'Sorting Expert', 'Five Quests Cleared'],
  );
});
