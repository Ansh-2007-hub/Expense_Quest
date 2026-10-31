'use strict';

function deriveAchievements({ reviewedTransactions = 0, questsCompleted = 0 }) {
  const achievements = [];
  if (reviewedTransactions >= 1) achievements.push('First Review');
  if (questsCompleted >= 1) achievements.push('Dragon Slayer');
  if (reviewedTransactions >= 50) achievements.push('Sorting Expert');
  if (questsCompleted >= 5) achievements.push('Five Quests Cleared');
  return achievements;
}

module.exports = { deriveAchievements };
