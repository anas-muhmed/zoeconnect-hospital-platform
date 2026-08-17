import React from 'react';
import { Badge } from '../ui/Badge';
import { parseConfidenceNumber } from '../../lib/utils';

export function ConfidenceBadge({ confidence }: { confidence: string }) {
  const score = parseConfidenceNumber(confidence);

  let variant: 'emerald' | 'amber' | 'sky' = 'emerald';
  if (score < 50) variant = 'sky';
  else if (score < 80) variant = 'amber';

  return (
    <Badge variant={variant} size="md">
      Confidence: {confidence.includes('%') ? confidence : `${score}%`}
    </Badge>
  );
}
