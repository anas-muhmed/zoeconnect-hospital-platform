import { queryOne, queryAll, hospitalClause } from '../config/db.js';

export async function getDashboardStats(req, res) {
  try {
    // All of these are independent of each other, so they run concurrently
    // instead of one at a time - was 10 sequential round-trips on every
    // dashboard load, now the wait is as long as the slowest one, not the
    // sum of all of them.
    const hcBodies      = hospitalClause(req.hospitalId, 1);
    const hcAlloc        = hospitalClause(req.hospitalId, 1);
    const hcBilling      = hospitalClause(req.hospitalId, 1);
    const hcSvcBilling   = hospitalClause(req.hospitalId, 1);
    const hcReleases     = hospitalClause(req.hospitalId, 1);
    const hcReadyRelease = hospitalClause(req.hospitalId, 1);
    const hcCabins       = hospitalClause(req.hospitalId, 1);
    const hcRecent       = hospitalClause(req.hospitalId, 1);
    const hcMortRev      = hospitalClause(req.hospitalId, 1);
    const hcSvcRev       = hospitalClause(req.hospitalId, 1);
    const hcLegacySvc    = hospitalClause(req.hospitalId, 1);
    const hcMortDisc     = hospitalClause(req.hospitalId, 1);
    const hcSvcDisc      = hospitalClause(req.hospitalId, 1);

    const [
      totalBodies,
      activeAllocations,
      pendingMortuary,
      pendingService,
      releasedToday,
      readyForRelease,
      cabinStats,
      recentBodies,
      mortuaryRevenue,
      serviceRevenue,
      legacySvcRev,
      mortuaryDiscounts,
      serviceDiscounts,
    ] = await Promise.all([
      queryOne(`SELECT COUNT(*) AS count FROM bodies WHERE 1=1${hcBodies.sql}`, hcBodies.params),
      queryOne(`SELECT COUNT(*) AS count FROM cabin_allocations WHERE status='Allocated'${hcAlloc.sql}`, hcAlloc.params),
      queryOne(`SELECT COUNT(*) AS count FROM billing WHERE status='Pending'${hcBilling.sql}`, hcBilling.params),
      queryOne(`SELECT COUNT(*) AS count FROM service_billing WHERE status='Pending'${hcSvcBilling.sql}`, hcSvcBilling.params),
      queryOne(`SELECT COUNT(*) AS count FROM body_releases WHERE DATE("releaseDateTime") = CURRENT_DATE${hcReleases.sql}`, hcReleases.params),
      queryOne(`SELECT COUNT(*) AS count FROM bodies WHERE status='Ready for Release'${hcReadyRelease.sql}`, hcReadyRelease.params),
      queryOne(`
        SELECT
          COALESCE(SUM(CASE WHEN status='Available'         THEN 1 ELSE 0 END), 0) AS available,
          COALESCE(SUM(CASE WHEN status='Occupied'          THEN 1 ELSE 0 END), 0) AS occupied,
          COALESCE(SUM(CASE WHEN status='Under Maintenance' THEN 1 ELSE 0 END), 0) AS maintenance
        FROM cabins WHERE status != 'Deactivated'${hcCabins.sql}
      `, hcCabins.params),
      queryAll(`SELECT * FROM bodies WHERE 1=1${hcRecent.sql} ORDER BY "createdAt" DESC LIMIT 5`, hcRecent.params),
      queryOne(`SELECT SUM("netAmount") AS sum FROM billing WHERE status='Settled'${hcMortRev.sql}`, hcMortRev.params),
      queryOne(`SELECT SUM("netAmount") AS sum FROM service_billing WHERE status='Settled'${hcSvcRev.sql}`, hcSvcRev.params),
      queryOne(`
        SELECT SUM("servicesAmount") AS sum
        FROM billing
        WHERE status='Settled'
          AND id NOT IN (
            SELECT DISTINCT "billingId" FROM service_billing WHERE "billingId" IS NOT NULL
          )${hcLegacySvc.sql}
      `, hcLegacySvc.params),
      queryOne(`SELECT SUM("discountAmount") AS sum FROM billing WHERE 1=1${hcMortDisc.sql}`, hcMortDisc.params),
      queryOne(`SELECT SUM("discountAmount") AS sum FROM service_billing WHERE 1=1${hcSvcDisc.sql}`, hcSvcDisc.params),
    ]);

    const pendingBillsCount = (Number(pendingMortuary?.count) || 0) + (Number(pendingService?.count) || 0);
    const totalServiceRevenue = Number(serviceRevenue?.sum || 0) + Number(legacySvcRev?.sum || 0);

    res.json({
      totalBodies:       Number(totalBodies?.count || 0),
      activeAllocations: Number(activeAllocations?.count || 0),
      pendingBills:      pendingBillsCount,
      releasedToday:     Number(releasedToday?.count || 0),
      readyForRelease:   Number(readyForRelease?.count || 0),
      cabins:            cabinStats || { available: 0, occupied: 0, maintenance: 0 },
      recentBodies,
      mortuaryRevenue:     Number(mortuaryRevenue?.sum || 0),
      serviceRevenue:      totalServiceRevenue,
      bodyDressingRevenue: totalServiceRevenue,
      mortuaryDiscount:    Number(mortuaryDiscounts?.sum || 0),
      serviceDiscount:     Number(serviceDiscounts?.sum || 0)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}
