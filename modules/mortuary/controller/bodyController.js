import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, runQuery, generateBodyNumber, hospitalClause } from '../config/db.js';

export async function getBodyTypes(req, res) {
  try {
    const types = await queryAll('SELECT * FROM body_types');
    res.json(types);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function getBodies(req, res) {
  try {
    const { status, bodyType, search, page, limit } = req.query;
    // LEFT JOIN LATERAL fetches each body's latest allocation in the same
    // query instead of one extra round-trip per body (was O(n) queries).
    // Columns list is deliberately explicit, not `b.*` - the list view (and
    // every other page that hits this endpoint: Billing, CabinAllocation,
    // BodyRelease, housekeeping) never reads witness addresses, reasonOfDeath,
    // nocCertificateUrl, or the MLC police-report fields; those are only
    // shown in the single-body detail view (getBodyById), which still
    // selects everything. Pulling them here just inflates every list request
    // (measured ~1.2KB/row -> ~30ms of Node CPU time per 800-row request on
    // JSON serialization alone) for data nothing on this endpoint displays.
    let query = `
      SELECT
        b.id, b."bodyNumber", b."bodyType", b."hospitalNumber", b."patientName",
        b.gender, b.age, b."dateOfDeath", b."timeOfDeath",
        b."mlcNo", b."estimatedDaysOfStay",
        b."witness1Name", b."witness1Contact", b."witness2Name", b."witness2Contact",
        b.billing_status, b.status, b."freezerRequired",
        b."createdAt", b."updatedAt", b.hospital_id,
        to_jsonb(alloc) AS allocation
      FROM bodies b
      LEFT JOIN LATERAL (
        SELECT ca.*, c."cabinNumber"
        FROM cabin_allocations ca
        JOIN cabins c ON ca."cabinId" = c.id
        WHERE ca."bodyId" = b.id
        ORDER BY ca."createdAt" DESC
        LIMIT 1
      ) alloc ON true
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (status)   { query += ` AND b.status = $${idx++}`;     params.push(status); }
    if (bodyType) { query += ` AND b."bodyType" = $${idx++}`; params.push(bodyType); }
    if (search) {
      query += ` AND (b."patientName" ILIKE $${idx} OR b."bodyNumber" ILIKE $${idx+1} OR b."hospitalNumber" ILIKE $${idx+2})`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      idx += 3;
    }
    const hc = hospitalClause(req.hospitalId, idx, 'b.hospital_id');
    query += hc.sql; params.push(...hc.params);

    // Pagination is opt-in via ?page=&limit= - existing callers that don't
    // pass them (Billing, CabinAllocation, BodyRelease, housekeeping) keep
    // getting the full unpaginated array exactly as before. Only the body
    // registry list view needs paging as historical records grow past a
    // single screenful; nothing else on this endpoint's other consumers
    // wants a partial list.
    if (page && limit) {
      const countQuery = query.replace(
        /SELECT[\s\S]*?FROM bodies b/,
        'SELECT COUNT(*)::int AS count FROM bodies b'
      );
      const countResult = await queryOne(countQuery, params);
      const total = countResult?.count || 0;

      const limitNum = Math.max(1, parseInt(limit, 10) || 50);
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const offset = (pageNum - 1) * limitNum;

      query += ` ORDER BY b."createdAt" DESC LIMIT $${idx + hc.params.length} OFFSET $${idx + hc.params.length + 1}`;
      const bodies = await queryAll(query, [...params, limitNum, offset]);
      return res.json({ data: bodies, total, page: pageNum, limit: limitNum });
    }

    query += ' ORDER BY b."createdAt" DESC';
    const bodies = await queryAll(query, params);
    res.json(bodies);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function getBodyById(req, res) {
  try {
    const { id } = req.params;
    const hc = hospitalClause(req.hospitalId, 2);
    const body = await queryOne(`SELECT * FROM bodies WHERE id = $1${hc.sql}`, [id, ...hc.params]);
    if (!body) return res.status(404).json({ error: 'Body not found' });

    const allocation = await queryOne(`
      SELECT ca.*, c."cabinNumber"
      FROM cabin_allocations ca
      JOIN cabins c ON ca."cabinId" = c.id
      WHERE ca."bodyId" = $1
      ORDER BY ca."createdAt" DESC LIMIT 1
    `, [id]);

    const billing = await queryOne('SELECT * FROM billing WHERE "bodyId" = $1', [id]);
    res.json({ ...body, allocation, billing });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function getBodyAllocation(req, res) {
  try {
    const { id } = req.params;
    const hc = hospitalClause(req.hospitalId, 2, 'ca.hospital_id');
    const allocation = await queryOne(`
      SELECT ca.*, c."cabinNumber"
      FROM cabin_allocations ca
      JOIN cabins c ON ca."cabinId" = c.id
      WHERE ca."bodyId" = $1${hc.sql}
      ORDER BY ca."createdAt" DESC LIMIT 1
    `, [id, ...hc.params]);

    if (!allocation) return res.status(404).json({ error: 'No allocation found for this body' });
    res.json(allocation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function createBody(req, res) {
  try {
    const {
      bodyType, hospitalNumber, patientName, gender, age, locality,
      dateOfDeath, timeOfDeath, declaredBy, reasonOfDeath, deathIntimationNo, mlcNo,
      estimatedDaysOfStay,
      witness1Name, witness1Address, witness1Contact,
      witness2Name, witness2Address, witness2Contact,
      policeStationName, stationSiName, presentPoliceOfficerName, nocCertificateUrl, freezerRequired
    } = req.body;

    if (bodyType === 'MLC') {
      if (!policeStationName || !stationSiName || !presentPoliceOfficerName) {
        return res.status(400).json({ error: 'Police Station Name, SI Name, and Officer Name are mandatory for MLC cases.' });
      }
    }

    // SuperAdmin has no single hospital scope of their own (req.hospitalId is
    // null) - a body write on their behalf must say which hospital it's for.
    const hospitalId = req.hospitalId ?? req.body.hospitalId;
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId is required' });

    const id         = uuidv4();
    const bodyNumber = await generateBodyNumber(hospitalId);
    const freezerReqValue = bodyType === 'MLC'
      ? (freezerRequired === false || freezerRequired === 0 || freezerRequired === '0' || freezerRequired === 'false' ? 0 : 1)
      : null;

    await runQuery(`
      INSERT INTO bodies (
        id, "bodyNumber", "bodyType", "hospitalNumber", "patientName", gender, age, locality,
        "dateOfDeath", "timeOfDeath", "declaredBy", "reasonOfDeath", "deathIntimationNo", "mlcNo",
        "estimatedDaysOfStay", "witness1Name", "witness1Address", "witness1Contact",
        "witness2Name", "witness2Address", "witness2Contact",
        "policeStationName", "stationSiName", "presentPoliceOfficerName",
        "nocCertificateUrl", "freezerRequired", hospital_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
        $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
      )
    `, [
      id, bodyNumber, bodyType, hospitalNumber, patientName, gender, age, locality,
      dateOfDeath, timeOfDeath, declaredBy, reasonOfDeath, deathIntimationNo, mlcNo,
      estimatedDaysOfStay,
      witness1Name, witness1Address, witness1Contact,
      witness2Name, witness2Address, witness2Contact,
      policeStationName || null, stationSiName || null, presentPoliceOfficerName || null,
      nocCertificateUrl || null, freezerReqValue, hospitalId
    ]);

    const body = await queryOne('SELECT * FROM bodies WHERE id = $1', [id]);
    res.json(body);
  } catch (error) {
    console.error('Error registering body:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function updateBody(req, res) {
  try {
    const { id } = req.params;
    const fields = req.body;
    const setClauses = [];
    const values    = [];
    let idx = 1;

    // Map camelCase keys to quoted PG column names
    const pgKey = (key) => {
      // columns that are stored lowercase in PG
      const lower = ['status', 'gender', 'age', 'locality', 'address', 'billing_status'];
      return lower.includes(key) ? key : `"${key}"`;
    };

    for (const [key, value] of Object.entries(fields)) {
      // id and hospital_id are never client-settable - hospital_id especially
      // must not be overwritable here, or a request could move a body to a
      // different hospital and defeat tenant isolation entirely.
      if (key !== 'id' && key !== 'hospital_id') {
        setClauses.push(`${pgKey(key)} = $${idx++}`);
        // freezerRequired is smallint (0/1), but the frontend sends a real
        // JS boolean -- pg serializes that as the text "true"/"false" for
        // a bound parameter, which smallint's parser rejects outright
        // ("invalid input syntax for type smallint"). createBody already
        // coerces this same field the same way; updateBody just never did.
        values.push(key === 'freezerRequired'
          ? (value === false || value === 0 || value === '0' || value === 'false' ? 0 : 1)
          : value);
      }
    }

    if (setClauses.length > 0) {
      setClauses.push(`"updatedAt" = NOW()`);
      values.push(id);
      const hc = hospitalClause(req.hospitalId, idx + 1);
      values.push(...hc.params);
      await runQuery(`UPDATE bodies SET ${setClauses.join(', ')} WHERE id = $${idx}${hc.sql}`, values);
    }

    const hc2 = hospitalClause(req.hospitalId, 2);
    const body = await queryOne(`SELECT * FROM bodies WHERE id = $1${hc2.sql}`, [id, ...hc2.params]);
    res.json(body);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function deleteBody(req, res) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Body ID is required' });

    const hc = hospitalClause(req.hospitalId, 2);
    const body = await queryOne(`SELECT id FROM bodies WHERE id = $1${hc.sql} LIMIT 1`, [id, ...hc.params]);
    if (!body) return res.status(404).json({ error: 'Body not found' });

    const allocation = await queryOne('SELECT id FROM cabin_allocations WHERE "bodyId" = $1 LIMIT 1', [id]);
    if (allocation) {
      return res.status(400).json({ error: 'Cannot delete body with active allocations. Please release the cabin first.' });
    }

    const result = await runQuery('DELETE FROM bodies WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(500).json({ error: 'Delete failed' });

    res.json({ message: 'Body deleted successfully' });
  } catch (error) {
    console.error('DELETE BODY ERROR:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function getMlcRegistration(req, res) {
  try {
    const { bodyId } = req.params;
    const hc = hospitalClause(req.hospitalId, 2);
    const body = await queryOne(`SELECT * FROM bodies WHERE id = $1${hc.sql}`, [bodyId, ...hc.params]);
    if (!body) return res.status(404).json({ error: 'Body not found' });
    if (body.bodyType !== 'MLC') {
      return res.status(400).json({ error: 'This body is not an MLC case.' });
    }
    res.json(body);
  } catch (error) {
    console.error('MLC REGISTRATION ERROR:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function getConcessionAuthorities(req, res) {
  try {
    const hc = hospitalClause(req.hospitalId, 1);
    const authorities = await queryAll(`SELECT * FROM concession_authorities WHERE "isActive" = 1${hc.sql}`, hc.params);
    res.json(authorities);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function createConcessionAuthority(req, res) {
  try {
    const { name, designation, department, maxDiscountPercent } = req.body;
    const hospitalId = req.hospitalId ?? req.body.hospitalId;
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId is required' });

    const id = uuidv4();
    await runQuery(
      'INSERT INTO concession_authorities (id, name, designation, department, "maxDiscountPercent", hospital_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, name, designation, department, maxDiscountPercent || 100, hospitalId]
    );
    const authority = await queryOne('SELECT * FROM concession_authorities WHERE id = $1', [id]);
    res.json(authority);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function deleteConcessionAuthority(req, res) {
  try {
    const { id } = req.params;
    const hc = hospitalClause(req.hospitalId, 2);
    await runQuery(`UPDATE concession_authorities SET "isActive" = 0 WHERE id = $1${hc.sql}`, [id, ...hc.params]);
    res.json({ message: 'Concession authority deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}
