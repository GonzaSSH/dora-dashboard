// DORA 2025 distributions for the two directly measured metrics (v1.3, PLAN.md §2c).
//
// Source: DORA, "State of AI-assisted Software Development 2025" (Google LLC, v2025.2), page 20,
// Figure 11 (deployment frequency) and Figure 12 (change lead time), "Top %" column: the share
// of surveyed respondents in that band or better. The report is licensed under the Creative
// Commons Attribution-NonCommercial-ShareAlike 4.0 International licence (report page 141);
// these figures are reproduced unchanged, with attribution, in this non-commercial project.
//
// Only these two metrics get a benchmark: the survey asks teams about their own deployments and
// lead times, which this app measures directly. Its failure, recovery and rework figures come
// from real incident data, which public release patterns can only estimate.
import type { MetricKey } from '../ratings';

export const DORA_2025 = {
  source: {
    title: 'State of AI-assisted Software Development 2025',
    publisher: 'DORA (Google LLC)',
    version: 'v2025.2',
    page: 20,
    url: 'https://services.google.com/fh/files/misc/2025_state_of_ai_assisted_software_development.pdf',
    licence: 'CC BY-NC-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  },
  /** Bands from fastest to slowest; `atLeast` is in deployments per week, `top` is the report's Top %. */
  deploymentFrequency: [
    { band: 'Between once per hour and once per day', atLeast: 7, top: 22.7 },
    { band: 'Between once per day and once per week', atLeast: 1, top: 44.6 },
    { band: 'Between once per week and once per month', atLeast: 7 / 30, top: 76.1 },
    { band: 'Between once per month and once every six months', atLeast: 7 / 182.5, top: 96.4 },
    { band: 'Fewer than once per six months', atLeast: 0, top: 100 },
  ],
  /** `under` is in hours. */
  leadTime: [
    { band: 'Less than one hour', under: 1, top: 9.4 },
    { band: 'Between one hour and one day', under: 24, top: 24.4 },
    { band: 'Between one day and one week', under: 168, top: 56.4 },
    { band: 'Between one week and one month', under: 720, top: 84.7 },
    { band: 'Between one month and six months', under: 4380, top: 98 },
    { band: 'More than six months', under: Infinity, top: 100 },
  ],
} as const;

/** Shown with every DORA figure (the delivery lead's wording, verbatim). */
export const SERVICES_NOTE = 'DORA surveys mostly teams running services. Libraries release on a different rhythm.';

/** Shown on the three proxy tiles instead of a figure. */
export const NO_BENCHMARK =
  "No DORA benchmark: the survey asks teams about real incidents, while this is estimated from public release patterns, so the two can't be compared.";

/** "About 76% of surveyed teams ship this often or more." Null for proxies and missing values. */
export function doraContext(key: MetricKey, value: number | null): string | null {
  if (value === null) return null;
  if (key === 'deploymentFrequency') {
    if (value <= 0) return null;
    const b = DORA_2025.deploymentFrequency.find((x) => value >= x.atLeast)!;
    return `About ${Math.round(b.top)}% of surveyed teams ship this often or more.`;
  }
  if (key === 'leadTime') {
    const b = DORA_2025.leadTime.find((x) => value < x.under)!;
    return `About ${Math.round(b.top)}% of surveyed teams have this lead time or shorter.`;
  }
  return null;
}
