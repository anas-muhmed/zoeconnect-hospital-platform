// Postgres versions of utils/auditHelpers.js -- parallel to that file
// the same way db/pgPool.js is parallel to db/pool.js. Each function
// there takes an Oracle-style `conn.execute(sql, namedBinds)`; these
// take a pg Pool (or Client) and use positional binds instead. Route
// files still on Oracle keep importing from auditHelpers.js; converted
// route files import from here. Once every caller of a given function
// is converted, the Oracle version of that function can be deleted --
// not done yet, since most route files still need it.

// createNotificationsBulk's Oracle version used executeMany() specifically
// to avoid N round trips for N recipients (see that file's comment) --
// pg has no equivalent method, so the same "one round trip" property is
// preserved here with a single multi-row INSERT (multiple VALUES tuples
// in one statement) instead of looping pool.query() per recipient, which
// would have silently reintroduced the N-round-trips problem the
// original code was written to avoid.

export async function createNotification(pool, userId, requestId, message) {
  await pool.query(
    `INSERT INTO notifications (user_id, request_id, message) VALUES ($1, $2, $3)`,
    [userId, requestId, message]
  );
}

export async function createNotificationsBulk(pool, userIds, requestId, message) {
  if (!userIds || userIds.length === 0) return;
  const values = [];
  const placeholders = userIds.map((userId, i) => {
    values.push(userId, requestId, message);
    const base = i * 3;
    return `($${base + 1}, $${base + 2}, $${base + 3})`;
  });
  await pool.query(
    `INSERT INTO notifications (user_id, request_id, message) VALUES ${placeholders.join(', ')}`,
    values
  );
}

export async function writeAudit(pool, requestId, action, performedBy, fromStage, toStage, remarks) {
  await pool.query(
    `INSERT INTO audit_logs (request_id, action, performed_by, from_stage, to_stage, remarks)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [requestId, action, performedBy, fromStage, toStage, remarks || null]
  );
}

export async function saveApprovalRemarks(pool, remarks, roleName, performedBy) {
  if (!remarks || !roleName) return;

  const remarksToProcess = [];
  if (Array.isArray(remarks)) {
    remarksToProcess.push(...remarks);
  } else if (typeof remarks === 'string') {
    remarksToProcess.push(remarks);
  }

  for (const remark of remarksToProcess) {
    const trimmedRemark = remark.trim();
    if (trimmedRemark === '') continue;

    const remarkCheck = await pool.query(
      `SELECT history_id, usage_count FROM approval_remark_history
       WHERE LOWER(role_name) = LOWER($1)
         AND LOWER(TRIM(remark_text)) = LOWER(TRIM($2))`,
      [roleName, trimmedRemark]
    );

    if (remarkCheck.rows.length > 0) {
      const historyId = remarkCheck.rows[0].history_id;
      await pool.query(
        `UPDATE approval_remark_history
         SET usage_count = usage_count + 1,
             last_used_at = CURRENT_TIMESTAMP
         WHERE history_id = $1`,
        [historyId]
      );
    } else {
      // is_active is a real BOOLEAN column now -- true, not 1.
      await pool.query(
        `INSERT INTO approval_remark_history (role_name, remark_text, created_by, usage_count, last_used_at, is_active)
         VALUES ($1, $2, $3, 1, CURRENT_TIMESTAMP, true)`,
        [roleName, trimmedRemark, performedBy || null]
      );
    }
  }
}

export async function writeAdminAudit(pool, adminId, action, targetUser, details) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_logs (admin_id, action, target_user, details)
       VALUES ($1, $2, $3, $4)`,
      [adminId, action, targetUser || null, details || null]
    );
  } catch (err) {
    console.error('[writeAdminAudit] Failed:', err.message);
  }
}
