import { queryAll, queryOne, hospitalClause } from '../config/db.js';

export async function getCabinOccupancy(req, res) {
  try {
    const { startDate, endDate, cabinNo, bodyType } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    // endDate arrives as a plain YYYY-MM-DD from a date input, which Postgres
    // casts to midnight - a plain "<=" would silently drop every allocation
    // from that whole day. Compare against the start of the next day instead.
    if (startDate) { where += ` AND ca."admissionDateTime" >= $${idx++}`; params.push(startDate); }
    if (endDate)   { where += ` AND ca."admissionDateTime" < ($${idx++}::date + INTERVAL '1 day')`; params.push(endDate); }
    if (cabinNo)   { where += ` AND c."cabinNumber" = $${idx++}`;         params.push(cabinNo); }
    if (bodyType)  { where += ` AND b."bodyType" = $${idx++}`;            params.push(bodyType); }
    const hc = hospitalClause(req.hospitalId, idx, 'ca.hospital_id');
    where += hc.sql; params.push(...hc.params);

    // Row-level data and the summary counts run as two parallel queries -
    // the summary is computed by Postgres (COUNT/FILTER), not by looping
    // over every row in JS, which used to mean 4 separate .filter() passes
    // over the entire result set for every report view.
    const [data, summary] = await Promise.all([
      queryAll(`
        SELECT
          ca.*,
          c."cabinNumber",
          b."patientName",
          b."bodyNumber",
          b."bodyType",
          ca."admissionDateTime",
          ca."releaseDateTime",
          EXTRACT(EPOCH FROM (COALESCE(ca."releaseDateTime", NOW()) - ca."admissionDateTime")) / 3600
            AS "durationHours"
        FROM cabin_allocations ca
        JOIN cabins c ON ca."cabinId" = c.id
        JOIN bodies b ON ca."bodyId" = b.id
        ${where}
        ORDER BY ca."admissionDateTime" DESC
      `, params),
      queryOne(`
        SELECT
          COUNT(*) AS "totalAllocations",
          COUNT(*) FILTER (WHERE ca."releaseDateTime" IS NULL)     AS "occupied",
          COUNT(*) FILTER (WHERE ca."releaseDateTime" IS NOT NULL) AS "released",
          COUNT(*) FILTER (WHERE b."bodyType" = 'MLC')             AS "mlcCases",
          COUNT(*) FILTER (WHERE b."bodyType" = 'Non-MLC')         AS "nonMlcCases"
        FROM cabin_allocations ca
        JOIN cabins c ON ca."cabinId" = c.id
        JOIN bodies b ON ca."bodyId" = b.id
        ${where}
      `, params),
    ]);

    res.json({
      data,
      summary: {
        totalAllocations: Number(summary.totalAllocations),
        occupied:    Number(summary.occupied),
        released:    Number(summary.released),
        mlcCases:    Number(summary.mlcCases),
        nonMlcCases: Number(summary.nonMlcCases),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function getInvoiceAnalysis(req, res) {
  try {
    const { startDate, endDate, status } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    if (startDate) { where += ` AND b."createdAt" >= $${idx++}`; params.push(startDate); }
    if (endDate)   { where += ` AND b."createdAt" < ($${idx++}::date + INTERVAL '1 day')`; params.push(endDate); }
    if (status)    { where += ` AND b.status = $${idx++}`;        params.push(status); }
    const hc = hospitalClause(req.hospitalId, idx, 'b.hospital_id');
    where += hc.sql; params.push(...hc.params);

    // A bill's true amount includes both the mortuary-stay charge (billing.*)
    // and any service charge (e.g. body dressing) recorded separately in
    // service_billing - billing.servicesAmount is never populated (always 0),
    // so summing only billing.* undercounts every bill that has a service.
    const [data, summary] = await Promise.all([
      queryAll(`
        SELECT
          b.id, b."bodyId", b.status, b."createdAt", b."discountReason",
          bo."patientName", bo."bodyNumber", bo."bodyType",
          b."totalAmount" + COALESCE(sb."serviceAmount", 0)    AS "totalAmount",
          b."discountAmount" + COALESCE(sb."discountAmount", 0) AS "discountAmount",
          b."netAmount" + COALESCE(sb."netAmount", 0)          AS "netAmount"
        FROM billing b
        JOIN bodies bo ON b."bodyId" = bo.id
        LEFT JOIN LATERAL (
          SELECT * FROM service_billing s WHERE s."billingId" = b.id LIMIT 1
        ) sb ON true
        ${where}
        ORDER BY b."createdAt" DESC
      `, params),
      queryOne(`
        SELECT
          COUNT(*) AS "totalBills",
          COALESCE(SUM(b."totalAmount" + COALESCE(sb."serviceAmount", 0)), 0)    AS "totalAmount",
          COALESCE(SUM(b."discountAmount" + COALESCE(sb."discountAmount", 0)), 0) AS "totalDiscount",
          COALESCE(SUM(b."netAmount" + COALESCE(sb."netAmount", 0)), 0)          AS "totalNetAmount",
          COUNT(*) FILTER (WHERE b.status = 'Settled') AS "settled",
          COUNT(*) FILTER (WHERE b.status = 'Pending') AS "pending"
        FROM billing b
        JOIN bodies bo ON b."bodyId" = bo.id
        LEFT JOIN LATERAL (
          SELECT * FROM service_billing s WHERE s."billingId" = b.id LIMIT 1
        ) sb ON true
        ${where}
      `, params),
    ]);

    res.json({
      data,
      summary: {
        totalBills:     Number(summary.totalBills),
        totalAmount:    Number(summary.totalAmount),
        totalDiscount:  Number(summary.totalDiscount),
        totalNetAmount: Number(summary.totalNetAmount),
        settled: Number(summary.settled),
        pending: Number(summary.pending),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function getConcessionReport(req, res) {
  try {
    const { startDate, endDate } = req.query;
    let where = 'WHERE b."discountAmount" > 0';
    const params = [];
    let idx = 1;

    if (startDate) { where += ` AND b."createdAt" >= $${idx++}`; params.push(startDate); }
    if (endDate)   { where += ` AND b."createdAt" < ($${idx++}::date + INTERVAL '1 day')`; params.push(endDate); }
    const hc = hospitalClause(req.hospitalId, idx, 'b.hospital_id');
    where += hc.sql; params.push(...hc.params);

    const [data, summary] = await Promise.all([
      queryAll(`
        SELECT
          b.id, b."discountAmount", b."discountReason", b."createdAt",
          bo."patientName", bo."bodyNumber",
          ca.name AS "authorityName", ca.designation
        FROM billing b
        JOIN bodies bo ON b."bodyId" = bo.id
        LEFT JOIN concession_authorities ca ON b."concessionAuthorityId" = ca.id
        ${where}
        ORDER BY b."createdAt" DESC
      `, params),
      queryOne(`
        SELECT COUNT(*) AS "totalConcessions", COALESCE(SUM(b."discountAmount"), 0) AS "totalAmount"
        FROM billing b
        ${where}
      `, params),
    ]);

    res.json({
      data,
      summary: {
        totalConcessions: Number(summary.totalConcessions),
        totalAmount: Number(summary.totalAmount),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}
