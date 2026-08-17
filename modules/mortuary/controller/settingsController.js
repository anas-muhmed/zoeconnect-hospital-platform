import { queryOne, runQuery } from '../config/db.js';
import { compressImage } from '../config/imageCompress.js';
import { getHospitalSettings } from '../config/pricing.js';

export async function getBillingSettings(req, res) {
  try {
    // SuperAdmin has no single hospital of their own - reading settings on
    // their behalf must say which hospital's settings are wanted.
    const hospitalId = req.hospitalId ?? req.query.hospitalId;
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId is required' });

    const settings = await getHospitalSettings(hospitalId);
    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function getMortuaryName(req, res) {
  try {
    // Authenticated - shown in the post-login header/sidebar, scoped to the
    // caller's own hospital. SuperAdmin has no single hospital (hospitalId
    // is null), so falls back to whichever row comes first - they don't
    // have one "home" hospital's branding to show.
    const hospitalId = req.hospitalId ?? req.query.hospitalId;
    const settings = hospitalId
      ? await queryOne('SELECT mortuary_name FROM system_settings WHERE hospital_id = $1', [hospitalId])
      : await queryOne('SELECT mortuary_name FROM system_settings LIMIT 1');

    // Admin Dashboard's System Information panel showed a hardcoded
    // "Kolenchery, IN" for every hospital regardless of which one was
    // actually logged in -- hospitals.address is the real per-hospital
    // value, fetched here since this is already the "my hospital's
    // display info" call every page loads on login.
    const hospital = hospitalId
      ? await queryOne('SELECT address FROM hospitals WHERE id = $1', [hospitalId])
      : null;

    if (!settings) {
      return res.json({ mortuary_name: 'MOSC Medical College Mortuary', address: hospital?.address || null });
    }
    res.json({ mortuary_name: settings.mortuary_name, address: hospital?.address || null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function updateMortuaryName(req, res) {
  try {
    const { mortuary_name, updated_by } = req.body;

    if (!mortuary_name || typeof mortuary_name !== 'string' || !mortuary_name.trim())
      return res.status(400).json({ error: 'mortuary_name is required' });

    const cleanName = mortuary_name.trim();
    const hospitalId = req.hospitalId ?? req.body.hospitalId;
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId is required' });

    const settings = await getHospitalSettings(hospitalId);
    await runQuery(
      'UPDATE system_settings SET mortuary_name=$1, updated_by=$2, updated_at=NOW() WHERE id=$3',
      [cleanName, updated_by || 'SuperAdmin', settings.id]
    );

    res.json({ message: 'Mortuary name updated successfully', mortuary_name: cleanName });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function uploadMortuaryLogo(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Logo only ever renders small (sidebar icon) - no reason to store it at
    // full camera/screenshot resolution.
    await compressImage(req.file.path, 400);

    const logoUrl = `/uploads/logos/${req.file.filename}`;
    const updated_by = req.body.updated_by || 'SuperAdmin';
    const hospitalId = req.hospitalId ?? req.body.hospitalId;
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId is required' });

    const settings = await getHospitalSettings(hospitalId);
    await runQuery(
      'UPDATE system_settings SET mortuary_logo=$1, updated_by=$2, updated_at=NOW() WHERE id=$3',
      [logoUrl, updated_by, settings.id]
    );

    res.json({ message: 'Logo uploaded successfully', mortuary_logo: logoUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function getMortuaryLogo(req, res) {
  try {
    // Authenticated - same reasoning as getMortuaryName above.
    const hospitalId = req.hospitalId ?? req.query.hospitalId;
    const settings = hospitalId
      ? await queryOne('SELECT mortuary_logo FROM system_settings WHERE hospital_id = $1', [hospitalId])
      : await queryOne('SELECT mortuary_logo FROM system_settings LIMIT 1');

    if (settings?.mortuary_logo) {
      return res.json({ mortuary_logo: settings.mortuary_logo });
    }

    // A hospital's logo is normally set once, at SuperAdmin onboarding
    // (stored on hospitals.logo) - system_settings.mortuary_logo is only
    // populated if someone later uses this Admin-facing "Upload Logo"
    // action separately. Fall back to the hospital's own logo so a hospital
    // isn't shown as logo-less just because nobody re-uploaded it here.
    if (hospitalId) {
      const hospital = await queryOne('SELECT logo FROM hospitals WHERE id = $1', [hospitalId]);
      if (hospital?.logo) return res.json({ mortuary_logo: hospital.logo });
    }

    res.json({ mortuary_logo: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function updateBillingSettings(req, res) {
  try {
    const {
      first_day_charge, hourly_charge_after_24hrs, updated_by,
      pricing_model, daily_rate, staff_discount_percent
    } = req.body;

    if (first_day_charge === undefined || hourly_charge_after_24hrs === undefined)
      return res.status(400).json({ error: 'first_day_charge and hourly_charge_after_24hrs are required' });

    const firstDay = parseFloat(first_day_charge);
    const hourly   = parseFloat(hourly_charge_after_24hrs);

    if (isNaN(firstDay) || isNaN(hourly) || firstDay < 0 || hourly < 0)
      return res.status(400).json({ error: 'Charges must be non-negative numbers' });

    const hospitalId = req.hospitalId ?? req.body.hospitalId;
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId is required' });

    // Pricing-model fields are optional here so existing frontend calls that
    // only send first_day_charge/hourly_charge_after_24hrs don't accidentally
    // reset a hospital's model/discount back to defaults.
    const existing = await getHospitalSettings(hospitalId);

    const resolvedModel = pricing_model ?? existing.pricing_model;
    if (!['tiered_flat_hourly', 'flat_daily', 'free'].includes(resolvedModel))
      return res.status(400).json({ error: 'Invalid pricing_model' });

    const resolvedDailyRate = daily_rate !== undefined ? parseFloat(daily_rate) : Number(existing.daily_rate);
    if (isNaN(resolvedDailyRate) || resolvedDailyRate < 0)
      return res.status(400).json({ error: 'daily_rate must be a non-negative number' });

    const resolvedStaffDiscount = staff_discount_percent !== undefined
      ? parseFloat(staff_discount_percent) : Number(existing.staff_discount_percent);
    if (isNaN(resolvedStaffDiscount) || resolvedStaffDiscount < 0 || resolvedStaffDiscount > 100)
      return res.status(400).json({ error: 'staff_discount_percent must be between 0 and 100' });

    await runQuery(
      `UPDATE system_settings
       SET first_day_charge=$1, hourly_charge_after_24hrs=$2, updated_by=$3, updated_at=NOW(),
           pricing_model=$4, daily_rate=$5, staff_discount_percent=$6
       WHERE id=$7`,
      [firstDay, hourly, updated_by || 'Admin', resolvedModel, resolvedDailyRate, resolvedStaffDiscount, existing.id]
    );

    const updatedSettings = await queryOne('SELECT * FROM system_settings WHERE id = $1', [existing.id]);
    res.json({ message: 'Settings updated successfully', settings: updatedSettings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}
