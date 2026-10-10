/** Under 48 hours: hours. From 48 hours: days with one decimal (sandbox/EXPECTED.md). */
export function formatDuration(hours: number): string {
  if (hours < 48) {
    const h = Math.round(hours * 10) / 10;
    return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  }
  return `${(hours / 24).toFixed(1)} days`;
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

export function formatPerWeek(perWeek: number): string {
  return `${perWeek.toFixed(2)} per week`;
}
