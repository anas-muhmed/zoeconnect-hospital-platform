import React from 'react';
import { Activity, TestTube, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Progress } from '../ui/Progress';
import { ConfidenceBadge } from './ConfidenceBadge';
import { DiagnosisItem } from '../../types';
import { parseConfidenceNumber } from '../../lib/utils';

export interface DiagnosisCardProps {
  diagnosis: DiagnosisItem;
  rank: number;
}

export function DiagnosisCard({ diagnosis, rank }: DiagnosisCardProps) {
  const score = parseConfidenceNumber(diagnosis.confidence);

  let color: 'emerald' | 'amber' | 'sky' = 'emerald';
  if (score < 50) color = 'sky';
  else if (score < 80) color = 'amber';

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-4 shadow-lg transition-all hover:border-slate-600 space-y-3">
      {/* Header Rank & Name */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-teal-400 border border-slate-700 shrink-0 mt-0.5">
            #{rank}
          </span>
          <div>
            <h4 className="text-sm font-bold text-slate-100 leading-snug">{diagnosis.name}</h4>
          </div>
        </div>
        <ConfidenceBadge confidence={diagnosis.confidence} />
      </div>

      {/* Confidence Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[11px] text-slate-400 font-medium">
          <span>Match Likelihood</span>
          <span>{score}%</span>
        </div>
        <Progress value={score} color={color} />
      </div>

      {/* Recommended Medical Tests */}
      {diagnosis.recommendedTests && diagnosis.recommendedTests.length > 0 && (
        <div className="border-t border-slate-800/80 pt-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <TestTube className="h-4 w-4 text-teal-400" />
            <span>Recommended Diagnostic Tests:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {diagnosis.recommendedTests.map((test, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded-md border border-slate-700/80 bg-slate-950/60 px-2.5 py-1 text-[11px] font-medium text-slate-300"
              >
                <CheckCircle2 className="h-3 w-3 text-teal-400" />
                {test}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
