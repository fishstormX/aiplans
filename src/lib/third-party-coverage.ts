/** Whether the subscription allowance pays for models from other providers.
 * Availability alone does not mean their usage is included in the quota.
 */
export const THIRD_PARTY_COVERAGE_VALUES = ['none', 'partial', 'full', 'unknown'] as const;
export type ThirdPartyCoverage = (typeof THIRD_PARTY_COVERAGE_VALUES)[number];

export interface PlanCoverageFields {
  third_party_coverage: ThirdPartyCoverage;
  third_party_coverage_note: string | null;
}

export function normalizeThirdPartyCoverage(value: unknown): ThirdPartyCoverage {
  return THIRD_PARTY_COVERAGE_VALUES.find((coverage) => coverage === value) ?? 'unknown';
}

export function thirdPartyCoverageLabel(value: unknown, locale: string): string {
  const labels: Record<ThirdPartyCoverage, string> = locale === 'zh'
    ? { none: '不包含', partial: '部分包含', full: '全部包含', unknown: '未知' }
    : { none: 'Not included', partial: 'Partially included', full: 'Fully included', unknown: 'Unknown' };
  return labels[normalizeThirdPartyCoverage(value)];
}
