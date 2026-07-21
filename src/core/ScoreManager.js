export class ScoreManager {
  constructor() {
    this.suspectsArrested = 0;
    this.suspectsKilledJustified = 0; // armed & hostile when killed
    this.suspectsKilledExcessive = 0; // unarmed / surrendering / arrested when killed
    this.suspectsEscaped = 0;
    this.hostagesFreed = 0;
    this.hostagesDied = 0;
    this.civilianCasualties = 0;
    this.teammatesLost = 0;
    this.teammatesInjured = 0;
    this.excessiveForce = false;
    this.forceViolations = 0;
    this._violationTargets = new Set();
    this.timeElapsed = 0;
  }

  recordSuspectDeath(suspect) {
    const stateAtDeath = suspect.stateAtDeath || suspect.state;
    const wasCompliant = stateAtDeath === 'surrendering' || stateAtDeath === 'arrested' || !suspect.armed;
    if (wasCompliant) {
      this.suspectsKilledExcessive++;
      this.excessiveForce = true;
    } else {
      this.suspectsKilledJustified++;
    }
  }

  recordArrest() { this.suspectsArrested++; }
  recordEscape() { this.suspectsEscaped++; }
  recordHostageFreed() { this.hostagesFreed++; }
  recordHostageDied() { this.hostagesDied++; }
  recordCivilianCasualty() { this.civilianCasualties++; }
  recordTeammateLost() { this.teammatesLost++; }

  recordForceViolation(target) {
    const key = target?.id ?? `unknown-${this.forceViolations}`;
    if (this._violationTargets.has(key)) return false;
    this._violationTargets.add(key);
    this.forceViolations++;
    this.excessiveForce = true;
    return true;
  }

  finalize(teammates, targetTime) {
    this.teammatesInjured = teammates.filter(t => t.alive && t.hp < t.maxHp * 0.6).length;

    let score = 100;
    score += this.suspectsArrested * 10;
    score += this.hostagesFreed * 15;
    score -= this.suspectsKilledJustified * 3;
    score -= this.suspectsKilledExcessive * 25;
    score -= this.suspectsEscaped * 15;
    score -= this.hostagesDied * 30;
    score -= this.civilianCasualties * 20;
    score -= this.teammatesLost * 20;
    score -= this.teammatesInjured * 5;
    score -= this.forceViolations * 12;
    if (targetTime && this.timeElapsed < targetTime) {
      score += Math.round(10 * (1 - this.timeElapsed / targetTime));
    }
    score = Math.max(0, Math.round(score));

    let grade = 'F';
    if (score >= 90) grade = 'S';
    else if (score >= 75) grade = 'A';
    else if (score >= 60) grade = 'B';
    else if (score >= 40) grade = 'C';
    else if (score >= 20) grade = 'D';

    if (this.excessiveForce && (grade === 'S' || grade === 'A')) grade = 'B';
    if (this.hostagesDied > 0 && grade === 'S') grade = 'A';

    return { score, grade };
  }
}
