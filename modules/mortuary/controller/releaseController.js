import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, runQuery, hospitalClause } from '../config/db.js';
import { compressImage } from '../config/imageCompress.js';

const DOCUMENT_MAX_DIMENSION = 1600;

export async function createBodyRelease(req, res) {
  try {
    const {
      bodyId, caseType, bodyTakenBy, relationship,
      address, contactNumber, policeStationName, siName
    } = req.body;

    // The body's own hospital_id is the source of truth for the release
    // record's tenant - also an ownership check against a guessed bodyId.
    const bodyForHospital = await queryOne('SELECT hospital_id, status FROM bodies WHERE id = $1', [bodyId]);
    if (!bodyForHospital) return res.status(404).json({ error: 'Body not found' });
    if (req.hospitalId != null && bodyForHospital.hospital_id !== req.hospitalId) {
      return res.status(404).json({ error: 'Body not found' });
    }
    const hospitalId = bodyForHospital.hospital_id;

    const invoice = await queryOne('SELECT * FROM billing WHERE "bodyId" = $1', [bodyId]);
    if (!invoice || invoice.status !== 'Settled') {
      return res.status(400).json({ error: 'Mortuary Stay Bill must be settled before release' });
    }

    const svcBill = await queryOne('SELECT * FROM service_billing WHERE "bodyId" = $1', [bodyId]);
    if (svcBill && svcBill.status !== 'Settled') {
      return res.status(400).json({ error: 'Body Dressing Service Bill must be settled before release' });
    }

    const body = bodyForHospital;
    if (body && body.status === 'RELEASED') {
      return res.status(400).json({ error: 'Body already released' });
    }

    if (caseType === 'NON_MLC' && (!bodyTakenBy || !relationship || !address || !contactNumber)) {
      const missing = !bodyTakenBy ? 'bodyTakenBy' : !relationship ? 'relationship' : !address ? 'address' : 'contactNumber';
      return res.status(422).json({ error: `Field ${missing} is required` });
    }
    if (caseType === 'MLC' && (!bodyTakenBy || !contactNumber || !policeStationName || !siName)) {
      const missing = !bodyTakenBy ? 'bodyTakenBy' : !contactNumber ? 'contactNumber' : !policeStationName ? 'policeStationName' : 'siName';
      return res.status(422).json({ error: `Field ${missing} is required` });
    }

    const nocFile           = req.files?.nocFile?.[0] || null;
    const legalDocumentsFile = req.files?.legalDocumentsFile?.[0] || null;
    if (nocFile)            await compressImage(nocFile.path, DOCUMENT_MAX_DIMENSION);
    if (legalDocumentsFile)  await compressImage(legalDocumentsFile.path, DOCUMENT_MAX_DIMENSION);

    // file.path (used elsewhere in this codebase's other upload handlers,
    // e.g. uploadController.js) means multer's raw absolute filesystem
    // path -- not a web-servable URL. Storing that here meant every
    // release-time NOC/legal document link was the server's own disk path
    // (e.g. C:\Users\...\uploads\169...jpg), not something a browser or
    // the /uploads/:filename route could ever resolve. file.filename is
    // just the generated filename, matching the /uploads/<filename> shape
    // every other upload response already uses.
    const nocCertificateUrl  = nocFile ? `/uploads/${nocFile.filename}` : null;
    const legalDocumentsUrl  = legalDocumentsFile ? `/uploads/${legalDocumentsFile.filename}` : null;

    const id = uuidv4();
    await runQuery(`
      INSERT INTO body_releases (
        id, "bodyId", "releaseType", "takenBy", relationship, address,
        "contactNumber", "policeStation", "siName", "nocDocument", "legalDocuments", "releaseDateTime", hospital_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12)
    `, [
      id, bodyId, caseType || 'NON_MLC', bodyTakenBy,
      relationship || null, address || null, contactNumber,
      policeStationName || null, siName || null,
      nocCertificateUrl, legalDocumentsUrl, hospitalId
    ]);

    await runQuery("UPDATE bodies SET status='RELEASED' WHERE id=$1", [bodyId]);

    const allocation = await queryOne(
      'SELECT "cabinId" FROM cabin_allocations WHERE "bodyId"=$1 ORDER BY "createdAt" DESC LIMIT 1',
      [bodyId]
    );
    if (allocation) {
      await runQuery("UPDATE cabins SET status='NEEDS_CLEANING' WHERE id=$1", [allocation.cabinId]);

      await runQuery(
        'INSERT INTO housekeeping_tasks (id, "cabinId", status, "createdAt", hospital_id) VALUES ($1,$2,$3,NOW(),$4)',
        [uuidv4(), allocation.cabinId, 'PENDING', hospitalId]
      );

      await runQuery(
        "UPDATE cabin_allocations SET \"releaseDateTime\"=NOW() WHERE \"bodyId\"=$1 AND status='Allocated'",
        [bodyId]
      );
    }

    res.status(201).json({ message: 'Body released successfully', releaseId: id });
  } catch (error) {
    console.error('Body release error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function getBodyRelease(req, res) {
  try {
    const { bodyId } = req.params;
    const hc = hospitalClause(req.hospitalId, 2);
    const release = await queryOne(
      `SELECT * FROM body_releases WHERE "bodyId"=$1${hc.sql} ORDER BY "createdAt" DESC LIMIT 1`,
      [bodyId, ...hc.params]
    );
    res.json(release || null);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function getReleaseHistory(req, res) {
  try {
    const hc = hospitalClause(req.hospitalId, 1, 'br.hospital_id');
    const records = await queryAll(`
      SELECT
        br.id AS "releaseId",
        br."bodyId",
        br."releaseType",
        br."takenBy",
        br.relationship,
        br.address,
        br."contactNumber",
        br."policeStation",
        br."siName",
        br."releaseDateTime",
        br."createdAt" AS "releaseCreatedAt",
        bo."bodyNumber",
        bo."patientName",
        bo."bodyType",
        bo."hospitalNumber",
        bo."mlcNo",
        bo.gender,
        bo.age,
        bo."createdAt" AS "bodyRegisteredAt",
        bi.id AS "billingId",
        bi."totalAmount" AS "stayTotalAmount",
        bi."discountAmount" AS "stayDiscountAmount",
        bi."netAmount" AS "stayNetAmount",
        bi.status AS "stayBillStatus",
        bi."staffConcession",
        bi."staffName",
        bi."staffEmployeeId",
        bi."staffRelation",
        bi."firstDayCharge",
        bi."extraHours",
        bi."hourlyRate",
        bi."additionalHourCharges",
        bi."totalHours",
        bi."advanceAmount",
        bi."discountReason",
        ca."admissionDateTime",
        c."cabinNumber",
        sb.id AS "serviceBillId",
        sb."serviceName",
        sb."serviceAmount",
        sb."netAmount" AS "serviceNetAmount",
        sb.status AS "serviceBillStatus"
      FROM body_releases br
      JOIN bodies bo ON br."bodyId" = bo.id
      LEFT JOIN billing bi ON bi."bodyId" = bo.id
      LEFT JOIN cabin_allocations ca ON ca."bodyId" = bo.id AND ca.status = 'Allocated'
      LEFT JOIN cabins c ON ca."cabinId" = c.id
      LEFT JOIN service_billing sb ON sb."bodyId" = bo.id
      WHERE 1=1${hc.sql}
      ORDER BY br."releaseDateTime" DESC
    `, hc.params);
    res.json(records);
  } catch (error) {
    console.error('Release history error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}
