const SAVE_KEY = 'swatsim_career_v1';

const DEFAULT_SAVE = {
  officerName: 'Officer Reyes',
  rank: 'Recruit',
  unlockedIndex: 0, // highest mission index the player may play
  results: {},      // missionIndex -> { grade, score, completed }
};

export class CareerManager {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return structuredClone(DEFAULT_SAVE);
      const parsed = JSON.parse(raw);
      return { ...structuredClone(DEFAULT_SAVE), ...parsed };
    } catch {
      return structuredClone(DEFAULT_SAVE);
    }
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch { /* storage unavailable */ }
  }

  isUnlocked(index) { return index <= this.data.unlockedIndex; }

  recordResult(index, { grade, score }) {
    const prev = this.data.results[index];
    if (!prev || score > prev.score) {
      this.data.results[index] = { grade, score, completed: true };
    }
    if (index >= this.data.unlockedIndex) {
      this.data.unlockedIndex = Math.min(index + 1, 4);
    }
    this.data.rank = rankForUnlocked(this.data.unlockedIndex);
    this.save();
  }

  reset() {
    this.data = structuredClone(DEFAULT_SAVE);
    this.save();
  }

  totalStars() {
    return Object.values(this.data.results).filter(r => r.completed).length;
  }
}

function rankForUnlocked(unlockedIndex) {
  const ranks = ['Recruit', 'Officer', 'Senior Officer', 'Team Leader', 'Sergeant', 'Squad Commander'];
  return ranks[Math.min(unlockedIndex, ranks.length - 1)];
}
