import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, runQuery, hospitalClause } from '../config/db.js';
import { getHospitalSettings, getMinimumAdvance, computeStayCharge } from '../config/pricing.js';

export async function createAllocation(req, res) {
  try {
    const { bodyId, cabinId, advanceAmount, estimatedDaysOfStay } = req.body;

    if (!bodyId || !cabinId)
      return res.status(400).json({ error: 'bodyId and cabinId are required' });

    // SuperAdmin has no single hospital scope of their own - a write on their
    // behalf must say which hospital it's for.
    const hospitalId = req.hospitalId ?? req.body.hospitalId;
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId is required' });

    // Both sides of the allocation must actually belong to that hospital -
    // otherwise a hospital could link its body to another hospital's cabin.
    const bodyOwned = await queryOne('SELECT id FROM bodies WHERE id = $1 AND hospital_id = $2', [bodyId, hospitalId]);
    if (!bodyOwned) return res.status(404).json({ error: 'Body not found' });
    const cabinOwned = await queryOne('SELECT id FROM cabins WHERE id = $1 AND hospital_id = $2', [cabinId, hospitalId]);
    if (!cabinOwned) return res.status(404).json({ error: 'Cabin not found' });

    const settings       = await getHospitalSettings(hospitalId);
    const minimumAdvance = getMinimumAdvance(settings);
    const firstDayCharge = minimumAdvance; // used below only to seed the allocation's stored rate

    // Advance amount is an Admin-set policy value, not something Staff gets
    // to change - the frontend already locks this field for Staff, but that
    // alone doesn't stop a direct API call, so enforce it here too. Only
    // Admin/SuperAdmin can override the default; everyone else's request
    // silently uses the hospital's configured minimum regardless of what
    // they sent.
    const canSetAdvance = req.user.role === 'Admin' || req.user.role === 'SuperAdmin';
    const parsedAdvance = canSetAdvance ? (parseFloat(advanceAmount) || 0) : minimumAdvance;
    if (parsedAdvance < minimumAdvance) {
      return res.status(400).json({ error: `Advance collection is mandatory and must be at least ₹${minimumAdvance}` });
    }

    const existing = await queryOne(
      "SELECT * FROM cabin_allocations WHERE \"bodyId\" = $1 AND status = 'Allocated' AND hospital_id = $2",
      [bodyId, hospitalId]
    );
    if (existing) return res.status(400).json({ error: 'Body already has an active cabin allocation' });

    const cabinInUse = await queryOne(
      "SELECT * FROM cabin_allocations WHERE \"cabinId\" = $1 AND status = 'Allocated' AND hospital_id = $2",
      [cabinId, hospitalId]
    );
    if (cabinInUse) return res.status(400).json({ error: 'This cabin is already occupied by another body' });

    const bodyRecord = await queryOne('SELECT "bodyType", "freezerRequired", "estimatedDaysOfStay" FROM bodies WHERE id = $1', [bodyId]);
    if (bodyRecord && bodyRecord.bodyType === 'MLC' && bodyRecord.freezerRequired === 0) {
      return res.status(400).json({
        error: 'This MLC case does not require a freezer. Cabin allocation is not applicable.'
      });
    }

    // The allocation-time override field was removed from the frontend
    // (Cabin Allocation modal no longer sends estimatedDaysOfStay), so this
    // was silently hardcoding every allocation to exactly 3 days -- the
    // real duration staff already entered at Body Registration was being
    // collected and stored, then never read again. Body's own value is
    // now the real source; 3 is only the last-resort fallback for bodies
    // registered before this field existed.
    const daysOfStay = parseInt(estimatedDaysOfStay) || parseInt(bodyRecord?.estimatedDaysOfStay) || 3;

    const admissionDateTime          = new Date();
    const estimatedReleaseDateTime   = new Date(admissionDateTime);
    estimatedReleaseDateTime.setDate(estimatedReleaseDateTime.getDate() + daysOfStay);
    estimatedReleaseDateTime.setHours(23, 59, 0, 0);

    const id = uuidv4();
    await runQuery(`
      INSERT INTO cabin_allocations
        (id, "bodyId", "cabinId", "admissionDateTime", "advanceAmount",
         "hourlyRate", "minHours", "freeHours", "estimatedReleaseDateTime", hospital_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [id, bodyId, cabinId, admissionDateTime, parsedAdvance, firstDayCharge, 1, 0, estimatedReleaseDateTime, hospitalId]);

    await runQuery("UPDATE cabins SET status = 'Occupied' WHERE id = $1", [cabinId]);
    await runQuery("UPDATE bodies SET status = 'Allocated' WHERE id = $1", [bodyId]);

    const allocation = await queryOne(`
      SELECT ca.*, c."cabinNumber", b."patientName", b."bodyNumber"
      FROM cabin_allocations ca
      JOIN cabins c ON ca."cabinId" = c.id
      JOIN bodies b ON ca."bodyId" = b.id
      WHERE ca.id = $1
    `, [id]);

    res.json(allocation);
  } catch (error) {
    console.error('Error allocating cabin:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function getAllocations(req, res) {
  try {
    const { status } = req.query;
    let query = `
      SELECT ca.*, c."cabinNumber", c.status AS "cabinStatus",
             b."patientName", b."bodyNumber", b."bodyType"
      FROM cabin_allocations ca
      JOIN cabins c ON ca."cabinId" = c.id
      JOIN bodies b ON ca."bodyId" = b.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (status) { query += ` AND ca.status = $${idx++}`; params.push(status); }
    const hc = hospitalClause(req.hospitalId, idx, 'ca.hospital_id');
    query += hc.sql; params.push(...hc.params);
    query += ' ORDER BY ca."createdAt" DESC';

    const allocations = await queryAll(query, params);
    res.json(allocations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function releaseAllocation(req, res) {
  try {
    const { id } = req.params;
    const hc = hospitalClause(req.hospitalId, 2);
    const allocation = await queryOne(`SELECT * FROM cabin_allocations WHERE id = $1${hc.sql}`, [id, ...hc.params]);
    if (!allocation) return res.status(404).json({ error: 'Allocation not found' });

    const body = await queryOne('SELECT billing_status FROM bodies WHERE id = $1', [allocation.bodyId]);
    if (!body || body.billing_status !== 'SETTLED') {
      return res.status(400).json({ error: 'Bill must be settled before release' });
    }

    await runQuery(
      "UPDATE cabin_allocations SET status = 'Released', \"releaseDateTime\" = NOW() WHERE id = $1",
      [id]
    );
    await runQuery("UPDATE cabins SET status = 'NEEDS_CLEANING' WHERE id = $1", [allocation.cabinId]);
    await runQuery(
      'INSERT INTO housekeeping_tasks (id, "cabinId", status, "createdAt", hospital_id) VALUES ($1,$2,$3,NOW(),$4)',
      [uuidv4(), allocation.cabinId, 'PENDING', allocation.hospital_id]
    );

    res.json({ message: 'Marked as released successfully', releaseDateTime: new Date().toISOString() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function extendAllocation(req, res) {
  try {
    const { id } = req.params;
    const { expectedReleaseDateTime } = req.body;

    const hc = hospitalClause(req.hospitalId, 2);
    const allocation = await queryOne(`SELECT * FROM cabin_allocations WHERE id = $1${hc.sql}`, [id, ...hc.params]);
    if (!allocation) return res.status(404).json({ error: 'Allocation not found' });

    // Accept ISO or any parseable date string
    const pgDateTime = expectedReleaseDateTime
      ? new Date(expectedReleaseDateTime).toISOString()
      : null;

    await runQuery('UPDATE cabin_allocations SET "estimatedReleaseDateTime" = $1 WHERE id = $2', [pgDateTime, id]);
    res.json({ message: 'Estimated release date updated successfully', estimatedReleaseDateTime: pgDateTime });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function calculateAllocation(req, res) {
  try {
    const { id } = req.params;
    const hc = hospitalClause(req.hospitalId, 2);
    const allocation = await queryOne(`SELECT * FROM cabin_allocations WHERE id = $1${hc.sql}`, [id, ...hc.params]);
    if (!allocation) return res.status(404).json({ error: 'Allocation not found' });

    const settings = await getHospitalSettings(allocation.hospital_id);

    const admissionDate = new Date(allocation.admissionDateTime);
    const endDate       = allocation.releaseDateTime ? new Date(allocation.releaseDateTime) : new Date();
    const diffMs        = endDate - admissionDate;
    const totalHours    = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));

    const charge = computeStayCharge(settings, totalHours);

    const advance     = Number(allocation.advanceAmount) || 0;
    const finalAmount = Math.max(0, charge.totalAmount - advance);

    res.json({
      admissionDateTime: allocation.admissionDateTime,
      currentDateTime:   endDate.toISOString(),
      totalHours,
      firstDayCharge: charge.firstDayCharge,
      extraHours: charge.extraHours,
      hourlyRate: charge.hourlyRate,
      additionalHourCharges: charge.additionalHourCharges,
      totalAmount:   charge.totalAmount.toFixed(2),
      advanceAmount: advance,
      finalAmount:   finalAmount.toFixed(2),
      days:          charge.days,
      dailyRate:     charge.dailyRate
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}
