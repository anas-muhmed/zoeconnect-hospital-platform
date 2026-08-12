/**
 * Drug Indenting integration. Pure port of `utils/pureHelpers.js`'s
 * `computeAltDerived` — derived pricing fields (mrp, rate, margins) for a
 * drug alternative entry, from raw base inputs. No DB/side effects.
 */
export interface AltDerivedInput {
  mrpPerPack?: number | string;
  ratePerPack?: number | string;
  gstPercent?: number | string;
  pack?: number | string;
  qty?: number | string;
  offer?: number | string;
}

export interface AltDerived {
  mrp: number | null;
  rate: number | null;
  markup_margin: number | null;
  profit_margin: number | null;
  absolute_margin: number | null;
  net_rate: number | null;
  total_margin: number | null;
}

export function computeAltDerived(alt: AltDerivedInput): AltDerived {
  const mp = parseFloat(String(alt.mrpPerPack)) || 0;
  const rp = parseFloat(String(alt.ratePerPack)) || 0;
  const g = parseFloat(String(alt.gstPercent)) || 0;
  const pk = parseFloat(String(alt.pack)) || 0;
  const q = parseFloat(String(alt.qty)) || 0;
  const o = parseFloat(String(alt.offer)) || 0;

  const mrp = pk > 0 ? +(mp / pk).toFixed(4) : null;
  const rate = pk > 0 ? +((rp * (1 + g / 100)) / pk).toFixed(4) : null;

  const markup = mrp != null && rate != null && rate > 0 ? +(((mrp - rate) / rate) * 100).toFixed(2) : null;
  const netRate = rate != null ? (q + o > 0 ? +((rate * q) / (q + o)).toFixed(4) : rate) : null;
  const profit = mrp != null && netRate != null && mrp > 0 ? +(((mrp - netRate) / mrp) * 100).toFixed(2) : null;
  const absMargin = mrp != null && netRate != null ? +(mrp - netRate).toFixed(4) : null;
  const totalMargin = mrp != null && netRate != null && netRate > 0 ? +(((mrp - netRate) / netRate) * 100).toFixed(2) : null;

  return {
    mrp,
    rate,
    markup_margin: markup,
    profit_margin: profit,
    absolute_margin: absMargin,
    net_rate: netRate,
    total_margin: totalMargin,
  };
}
