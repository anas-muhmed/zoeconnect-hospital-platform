import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, runQuery, hospitalClause } from '../config/db.js';
import { getHospitalSettings } from '../config/pricing.js';

// ── Mortuary billing ─────────────────────────────────────────────────────────

export async function getBilling(req, res) {
  try {
    const { status } = req.query;
    // LEFT JOIN LATERAL fetches each bill's service-bill info in the same
    // query instead of 1-2 extra round-trips per bill (was O(n) queries).
    // Prefers a real service_billing row; falls back to aggregating
    // billing_services into the same "legacy-<id>" shape the old JS loop
    // built for bills created before service_billing existed.
    let query = `
      SELECT b.*, bo."patientName", bo."bodyNumber", bo."bodyType", bo.status AS "bodyStatus",
        COALESCE(
          to_jsonb(svc),
          CASE WHEN legacy.charge IS NOT NULL THEN
            jsonb_build_object(
              'id', 'legacy-' || b.id,
              'bodyId', b."bodyId",
              'billingId', b.id,
              'serviceName', legacy."serviceName",
              'serviceAmount', legacy.charge,
              'discountAmount', 0,
              'netAmount', legacy.charge,
              'status', b.status,
              'createdAt', b."createdAt"
            )
          END
        ) AS "serviceBill"
      FROM billing b
      LEFT JOIN bodies bo ON b."bodyId" = bo.id
      LEFT JOIN LATERAL (
        SELECT * FROM service_billing sb WHERE sb."billingId" = b.id LIMIT 1
      ) svc ON true
      LEFT JOIN LATERAL (
        SELECT SUM(amount) AS charge,
               (array_agg("serviceName" ORDER BY "createdAt"))[1] AS "serviceName"
        FROM billing_services WHERE "billingId" = b.id
      ) legacy ON true
    `;
    const params = [];
    let idx = 1;
    let hasWhere = false;
    if (status) { query += ` WHERE b.status = $${idx++}`; params.push(status); hasWhere = true; }
    const hc = hospitalClause(req.hospitalId, idx, 'b.hospital_id');
    if (hc.sql) query += hasWhere ? hc.sql : ` WHERE ${hc.sql.replace(/^ AND /, '')}`;
    params.push(...hc.params);
    query += ' ORDER BY b."createdAt" DESC';

    const bills = await queryAll(query, params);
    res.json(bills);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function getBillingFull(req, res) {
  try {
    const { id } = req.params;
    const hc = hospitalClause(req.hospitalId, 2, 'bi.hospital_id');
    const bill = await queryOne(`
      SELECT
        bi.id, bi."bodyId", bi."cabinAllocationId",
        bi."totalAmount", bi."discountAmount", bi."discountReason",
        bi."servicesAmount", bi."netAmount", bi.status, bi."settledAt",
        bi."createdAt" AS "billCreatedAt",
        bi."firstDayCharge", bi."extraHours", bi."hourlyRate",
        bi."additionalHourCharges", bi."totalHours", bi."advanceAmount",
        bi."staffConcession", bi."staffName", bi."staffEmployeeId",
        bi."staffAddress", bi."staffPhone", bi."staffRelation",
        bo."bodyNumber", bo."patientName", bo."bodyType", bo."hospitalNumber",
        bo."mlcNo", bo."createdAt" AS "admittedAt", bo.status AS "bodyStatus",
        ca."admissionDateTime", c."cabinNumber",
        (SELECT br2."releaseDateTime" FROM body_releases br2
         WHERE br2."bodyId" = bo.id
         ORDER BY br2."releaseDateTime" DESC LIMIT 1) AS "bodyReleasedAt"
      FROM billing bi
      JOIN bodies bo ON bi."bodyId" = bo.id
      LEFT JOIN cabin_allocations ca ON bi."cabinAllocationId" = ca.id
      LEFT JOIN cabins c ON ca."cabinId" = c.id
      WHERE bi.id = $1${hc.sql}
    `, [id, ...hc.params]);

    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    const services = await queryAll(
      'SELECT * FROM billing_services WHERE "billingId" = $1 ORDER BY "createdAt"',
      [id]
    );

    let svcBill = await queryOne('SELECT * FROM service_billing WHERE "billingId" = $1', [id]);
    if (!svcBill && services.length > 0) {
      const charge = services.reduce((sum, s) => sum + Number(s.amount), 0);
      svcBill = {
        id: 'legacy-' + id, bodyId: bill.bodyId, billingId: id,
        serviceName: services[0].serviceName, serviceAmount: charge,
        discountAmount: 0, netAmount: charge, status: bill.status, createdAt: bill.billCreatedAt
      };
    }

    res.json({ ...bill, services, serviceBill: svcBill });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function getBillingByBodyId(req, res) {
  try {
    const { bodyId } = req.params;
    const hc = hospitalClause(req.hospitalId, 2);
    const billing = await queryOne(`SELECT * FROM billing WHERE "bodyId" = $1${hc.sql}`, [bodyId, ...hc.params]);
    if (!billing) return res.status(404).json({ error: 'Billing not found' });

    const services = await queryAll('SELECT * FROM billing_services WHERE "billingId" = $1', [billing.id]);
    res.json({ ...billing, services });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function generateBilling(req, res) {
  try {
    const {
      bodyId, cabinAllocationId, totalAmount, discountAmount, discountReason,
      concessionAuthorityId, firstDayCharge, extraHours, hourlyRate,
      additionalHourCharges, totalHours, advanceAmount,
      staffConcession, staffName, staffEmployeeId, staffAddress, staffPhone, staffRelation,
      bodyDressingRequired, bodyDressingCharge
    } = req.body;

    // The body's own hospital_id is the source of truth for the bill's tenant
    // - also doubles as an ownership check: a hospital can't bill a body it
    // doesn't own by guessing/knowing its id.
    const bodyRow = await queryOne('SELECT hospital_id FROM bodies WHERE id = $1', [bodyId]);
    if (!bodyRow) return res.status(404).json({ error: 'Body not found' });
    if (req.hospitalId != null && bodyRow.hospital_id !== req.hospitalId) {
      return res.status(404).json({ error: 'Body not found' });
    }
    const hospitalId = bodyRow.hospital_id;

    const id      = uuidv4();
    const isStaff = staffConcession === true || staffConcession === 1 || staffConcession === '1';

    let resolvedDiscountAmount = Number(discountAmount || 0);
    let resolvedDiscountReason = discountReason || null;

    if (isStaff) {
      // Staff welfare discount is a per-hospital percentage, not a hardcoded
      // 100% waiver - MOSC's default (100) preserves the old behavior exactly.
      const settings    = await getHospitalSettings(hospitalId);
      const discountPct = Number(settings.staff_discount_percent ?? 100);
      resolvedDiscountAmount = Number(totalAmount || 0) * (discountPct / 100);
      resolvedDiscountReason = `Staff Welfare Scheme - ${discountPct}% Discount`;
    }

    const resolvedAdvance   = advanceAmount !== undefined ? Number(advanceAmount || 0) : 0;
    // Not clamped to 0 - if the advance plus the discount exceed the total,
    // that's a real overpayment/refund-due amount, and flooring it at 0
    // silently hid that from the bill.
    const resolvedNetAmount = Number(totalAmount || 0) - resolvedAdvance - resolvedDiscountAmount;

    await runQuery(`
      INSERT INTO billing (
        id, "bodyId", "cabinAllocationId", "totalAmount", "discountAmount", "discountReason",
        "concessionAuthorityId", "servicesAmount", "netAmount", status,
        "firstDayCharge", "extraHours", "hourlyRate", "additionalHourCharges",
        "totalHours", "advanceAmount",
        "staffConcession", "staffName", "staffEmployeeId",
        "staffAddress", "staffPhone", "staffRelation", hospital_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
      )
    `, [
      id, bodyId, cabinAllocationId, totalAmount,
      resolvedDiscountAmount,
      resolvedDiscountReason,
      isStaff ? null : (concessionAuthorityId || null),
      0, resolvedNetAmount, 'Pending',
      firstDayCharge ?? null, extraHours ?? null, hourlyRate ?? null,
      additionalHourCharges ?? null, totalHours ?? null, advanceAmount ?? null,
      isStaff ? 1 : 0,
      isStaff ? (staffName || null) : null,
      isStaff ? (staffEmployeeId || null) : null,
      isStaff ? (staffAddress || null) : null,
      isStaff ? (staffPhone || null) : null,
      isStaff ? (staffRelation || null) : null,
      hospitalId,
    ]);

    let serviceBillId = null;

    if (bodyDressingRequired) {
      serviceBillId = uuidv4();
      const dressingService = await queryOne(
        "SELECT id, tariff FROM service_master WHERE service_name ILIKE '%dressing%' LIMIT 1"
      );
      const serviceId     = dressingService ? dressingService.id : null;
      const approvedTariff = dressingService ? Number(dressingService.tariff) : 500.00;
      const userRole       = req.user?.role || '';
      let charge           = parseFloat(bodyDressingCharge) || 0;
      if (userRole !== 'Admin' && userRole !== 'SuperAdmin') charge = approvedTariff;

      await runQuery(`
        INSERT INTO service_billing
          (id, "bodyId", "billingId", "serviceId", "serviceName", "serviceAmount", "discountAmount", "netAmount", status, hospital_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [serviceBillId, bodyId, id, serviceId, 'Body Dressing', charge, 0, charge, 'Pending', hospitalId]);

      await runQuery(
        'INSERT INTO billing_services (id, "billingId", "serviceId", "serviceName", amount, hospital_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [uuidv4(), id, serviceId, 'Body Dressing', charge, hospitalId]
      );
    }

    await runQuery("UPDATE bodies SET billing_status = 'GENERATED' WHERE id = $1", [bodyId]);
    res.json({ mortuaryBillId: id, serviceBillId });
  } catch (error) {
    console.error('Error generating bills:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function settleBilling(req, res) {
  try {
    const { id } = req.body;
    const hc = hospitalClause(req.hospitalId, 2);
    const billing = await queryOne(`SELECT * FROM billing WHERE id = $1${hc.sql}`, [id, ...hc.params]);
    if (!billing) return res.status(404).json({ error: 'Billing not found' });

    await runQuery("UPDATE billing SET status='Settled', \"settledAt\"=NOW() WHERE id=$1", [id]);

    const svcBilling = await queryOne('SELECT * FROM service_billing WHERE "bodyId" = $1', [billing.bodyId]);
    if (!svcBilling || svcBilling.status === 'Settled') {
      await runQuery("UPDATE bodies SET billing_status='SETTLED' WHERE id=$1", [billing.bodyId]);
    }

    const updatedBilling = await queryOne('SELECT * FROM billing WHERE id = $1', [id]);
    res.json(updatedBilling);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

// ── Service billing ──────────────────────────────────────────────────────────

export async function getServiceBillingFull(req, res) {
  try {
    const { id } = req.params;

    if (id.startsWith('legacy-')) {
      const parentBillId = id.replace('legacy-', '');
      const hcLegacy = hospitalClause(req.hospitalId, 2, 'bi.hospital_id');
      const bill = await queryOne(`
        SELECT
          bi.id, bi."bodyId", bi."cabinAllocationId",
          bi."totalAmount", bi."discountAmount", bi."discountReason",
          bi."servicesAmount", bi."netAmount", bi.status, bi."settledAt",
          bi."createdAt" AS "billCreatedAt",
          bi."firstDayCharge", bi."extraHours", bi."hourlyRate",
          bi."additionalHourCharges", bi."totalHours", bi."advanceAmount",
          bi."staffConcession", bi."staffName", bi."staffEmployeeId",
          bi."staffAddress", bi."staffPhone", bi."staffRelation",
          bo."bodyNumber", bo."patientName", bo."bodyType", bo."hospitalNumber",
          bo."mlcNo", bo."createdAt" AS "admittedAt", bo.status AS "bodyStatus",
          ca."admissionDateTime", c."cabinNumber",
          (SELECT br2."releaseDateTime" FROM body_releases br2
           WHERE br2."bodyId" = bo.id
           ORDER BY br2."releaseDateTime" DESC LIMIT 1) AS "bodyReleasedAt"
        FROM billing bi
        JOIN bodies bo ON bi."bodyId" = bo.id
        LEFT JOIN cabin_allocations ca ON bi."cabinAllocationId" = ca.id
        LEFT JOIN cabins c ON ca."cabinId" = c.id
        WHERE bi.id = $1${hcLegacy.sql}
      `, [parentBillId, ...hcLegacy.params]);

      if (!bill) return res.status(404).json({ error: 'Parent bill not found' });

      const services = await queryAll(
        'SELECT * FROM billing_services WHERE "billingId" = $1 ORDER BY "createdAt"',
        [parentBillId]
      );
      const charge = services.reduce((sum, s) => sum + Number(s.amount), 0);

      return res.json({
        id, bodyId: bill.bodyId, billingId: parentBillId,
        serviceId: services[0]?.serviceId || null,
        serviceName: services[0]?.serviceName || 'Body Dressing',
        serviceAmount: charge, discountAmount: 0, netAmount: charge,
        status: bill.status, createdAt: bill.billCreatedAt,
        bodyNumber: bill.bodyNumber, patientName: bill.patientName,
        bodyType: bill.bodyType, hospitalNumber: bill.hospitalNumber,
        mlcNo: bill.mlcNo, cabinNumber: bill.cabinNumber,
        admissionDateTime: bill.admissionDateTime, bodyReleasedAt: bill.bodyReleasedAt,
        staffConcession: bill.staffConcession, staffName: bill.staffName,
        staffEmployeeId: bill.staffEmployeeId, staffAddress: bill.staffAddress,
        staffPhone: bill.staffPhone, staffRelation: bill.staffRelation
      });
    }

    const hcSvc = hospitalClause(req.hospitalId, 2, 'sb.hospital_id');
    const svcBill = await queryOne(`
      SELECT
        sb.*,
        bo."bodyNumber", bo."patientName", bo."bodyType", bo."hospitalNumber", bo."mlcNo",
        c."cabinNumber", ca."admissionDateTime",
        (SELECT br2."releaseDateTime" FROM body_releases br2
         WHERE br2."bodyId" = bo.id
         ORDER BY br2."releaseDateTime" DESC LIMIT 1) AS "bodyReleasedAt",
        bi."staffConcession", bi."staffName", bi."staffEmployeeId",
        bi."staffAddress", bi."staffPhone", bi."staffRelation"
      FROM service_billing sb
      JOIN bodies bo ON sb."bodyId" = bo.id
      LEFT JOIN billing bi ON sb."billingId" = bi.id
      LEFT JOIN cabin_allocations ca ON bi."cabinAllocationId" = ca.id
      LEFT JOIN cabins c ON ca."cabinId" = c.id
      WHERE sb.id = $1${hcSvc.sql}
    `, [id, ...hcSvc.params]);

    if (!svcBill) return res.status(404).json({ error: 'Service bill not found' });
    res.json(svcBill);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function settleServiceBilling(req, res) {
  try {
    const { id } = req.body;

    if (id && id.startsWith('legacy-')) {
      const parentBillId = id.replace('legacy-', '');
      const hcLegacy = hospitalClause(req.hospitalId, 2);
      const parentBill = await queryOne(`SELECT "bodyId" FROM billing WHERE id = $1${hcLegacy.sql}`, [parentBillId, ...hcLegacy.params]);
      if (!parentBill) return res.status(404).json({ error: 'Billing not found' });

      await runQuery("UPDATE billing SET status='Settled', \"settledAt\"=NOW() WHERE id=$1", [parentBillId]);
      await runQuery("UPDATE bodies SET billing_status='SETTLED' WHERE id=$1", [parentBill.bodyId]);
      return res.json({ id, status: 'Settled' });
    }

    const hc = hospitalClause(req.hospitalId, 2);
    const svcBilling = await queryOne(`SELECT * FROM service_billing WHERE id = $1${hc.sql}`, [id, ...hc.params]);
    if (!svcBilling) return res.status(404).json({ error: 'Service billing not found' });

    await runQuery("UPDATE service_billing SET status='Settled' WHERE id=$1", [id]);

    const mortuaryBilling = await queryOne('SELECT * FROM billing WHERE "bodyId" = $1', [svcBilling.bodyId]);
    if (!mortuaryBilling || mortuaryBilling.status === 'Settled') {
      await runQuery("UPDATE bodies SET billing_status='SETTLED' WHERE id=$1", [svcBilling.bodyId]);
    }

    const updated = await queryOne('SELECT * FROM service_billing WHERE id = $1', [id]);
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}
