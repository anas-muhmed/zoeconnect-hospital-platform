import { queryAll, queryOne, runQuery, hospitalClause } from '../config/db.js';

export async function getTasks(req, res) {
  try {
    const hc = hospitalClause(req.hospitalId, 1, 'ht.hospital_id');
    const tasks = await queryAll(`
      SELECT ht.*, c."cabinNumber"
      FROM housekeeping_tasks ht
      JOIN cabins c ON ht."cabinId" = c.id
      WHERE 1=1${hc.sql}
      ORDER BY ht."createdAt" DESC
    `, hc.params);
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function assignTask(req, res) {
  try {
    const { taskId, staffName } = req.body;
    if (!taskId || !staffName)
      return res.status(400).json({ error: 'taskId and staffName are required' });

    const hc = hospitalClause(req.hospitalId, 3);
    const result = await runQuery(
      `UPDATE housekeeping_tasks SET "assignedTo"=$1, status='IN_PROGRESS' WHERE id=$2${hc.sql}`,
      [staffName, taskId, ...hc.params]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task assigned successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function completeTask(req, res) {
  try {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ error: 'taskId is required' });

    const hc = hospitalClause(req.hospitalId, 2);
    const result = await runQuery(`UPDATE housekeeping_tasks SET status='COMPLETED' WHERE id=$1${hc.sql}`, [taskId, ...hc.params]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task marked as completed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function verifyTask(req, res) {
  try {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ error: 'taskId is required' });

    const hc = hospitalClause(req.hospitalId, 2);
    const task = await queryOne(`SELECT "cabinId" FROM housekeeping_tasks WHERE id=$1${hc.sql}`, [taskId, ...hc.params]);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    await runQuery("UPDATE housekeeping_tasks SET status='VERIFIED' WHERE id=$1", [taskId]);
    await runQuery("UPDATE cabins SET status='Available' WHERE id=$1", [task.cabinId]);

    res.json({ message: 'Task verified and cabin is now Available' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}
