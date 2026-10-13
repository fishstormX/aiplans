import { thirdPartyCoverageLabel, type ThirdPartyCoverage } from '@/lib/third-party-coverage';

export function PlanCoverage({
  coverage,
  note,
  locale,
}: {
  coverage?: ThirdPartyCoverage | null;
  note?: string | null;
  locale: string;
}) {
  return (
    <div className="text-xs text-zinc-600 dark:text-zinc-400">
      <p>
        {locale === 'zh' ? '第三方模型额度' : 'Third-party model quota'}: {thirdPartyCoverageLabel(coverage, locale)}
      </p>
      {note && <p className="mt-1">{note}</p>}
    </div>
  );
}
