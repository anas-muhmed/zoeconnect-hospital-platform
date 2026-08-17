import { queryOne, runQuery } from './db.js';
import { v4 as uuidv4 } from 'uuid';

// Fetches a hospital's pricing/settings row, creating one with safe defaults
// if it somehow doesn't exist yet (e.g. a hospital inserted directly in the
// DB before the SuperAdmin onboarding UI creates one automatically).
export async function getHospitalSettings(hospitalId) {
  let settings = await queryOne('SELECT * FROM system_settings WHERE hospital_id = $1', [hospitalId]);
  if (!settings) {
    const id = uuidv4();
    await runQuery(
      'INSERT INTO system_settings (id, hospital_id, first_day_charge, hourly_charge_after_24hrs) VALUES ($1, $2, $3, $4)',
      [id, hospitalId, 2100.00, 130.00]
    );
    settings = await queryOne('SELECT * FROM system_settings WHERE id = $1', [id]);
  }
  return settings;
}

// The minimum advance a hospital's pricing model requires up front, at the
// point a body is allocated a cabin - before we know the actual stay length.
export function getMinimumAdvance(settings) {
  switch (settings.pricing_model) {
    case 'flat_daily': return Number(settings.daily_rate) || 0;
    case 'free':       return 0;
    default:           return Number(settings.first_day_charge) || 0; // tiered_flat_hourly
  }
}

// Computes the stay charge for a given pricing model. Keeps the same field
// shape across models (firstDayCharge/hourlyRate/dailyRate/extraHours/
// additionalHourCharges/totalAmount/days) so callers and the frontend bill
// views don't need to branch on pricing_model themselves.
export function computeStayCharge(settings, totalHours) {
  const days = Math.max(1, Math.ceil(totalHours / 24));

  if (settings.pricing_model === 'free') {
    return { totalAmount: 0, firstDayCharge: 0, hourlyRate: 0, extraHours: 0, additionalHourCharges: 0, dailyRate: 0, days };
  }

  if (settings.pricing_model === 'flat_daily') {
    const dailyRate = Number(settings.daily_rate) || 0;
    return {
      totalAmount: dailyRate * days,
      firstDayCharge: dailyRate, hourlyRate: 0, extraHours: 0, additionalHourCharges: 0,
      dailyRate, days,
    };
  }

  // tiered_flat_hourly (default): flat charge for the first 24h, then hourly.
  const firstDayCharge = Number(settings.first_day_charge) || 0;
  const hourlyRate     = Number(settings.hourly_charge_after_24hrs) || 0;
  let extraHours = 0, additionalHourCharges = 0, totalAmount = firstDayCharge;
  if (totalHours > 24) {
    extraHours            = totalHours - 24;
    additionalHourCharges = extraHours * hourlyRate;
    totalAmount           = firstDayCharge + additionalHourCharges;
  }
  return { totalAmount, firstDayCharge, hourlyRate, extraHours, additionalHourCharges, dailyRate: firstDayCharge, days };
}
