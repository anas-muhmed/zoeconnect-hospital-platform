import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, runQuery, hospitalClause } from '../config/db.js';

export async function getCabins(req, res) {
  try {
    const hc = hospitalClause(req.hospitalId, 1);
    const cabins = await queryAll(`SELECT * FROM cabins WHERE 1=1${hc.sql} ORDER BY "cabinNumber"`, hc.params);
    res.json(cabins);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function createCabin(req, res) {
  try {
    const { cabinNumber, tariff, floor, cabinType, dailyRate } = req.body;
    const hospitalId = req.hospitalId ?? req.body.hospitalId;
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId is required' });

    const id = uuidv4();
    const resolvedType      = cabinType === 'FREEZER' ? 'FREEZER' : 'NORMAL_CABIN';
    const resolvedDailyRate = parseFloat(dailyRate) || parseFloat(tariff) || 500;

    await runQuery(
      'INSERT INTO cabins (id, "cabinNumber", tariff, daily_rate, floor, cabin_type, hospital_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, cabinNumber, tariff || 500, resolvedDailyRate, floor || 1, resolvedType, hospitalId]
    );
    const cabin = await queryOne('SELECT * FROM cabins WHERE id = $1', [id]);
    res.json(cabin);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function updateCabin(req, res) {
  try {
    const { id } = req.params;
    const { cabinNumber, status, tariff, floor, cabinType, dailyRate } = req.body;
    const resolvedType      = cabinType === 'FREEZER' ? 'FREEZER' : 'NORMAL_CABIN';
    const resolvedDailyRate = parseFloat(dailyRate) || parseFloat(tariff) || 500;

    const hc = hospitalClause(req.hospitalId, 8);
    await runQuery(
      `UPDATE cabins SET "cabinNumber"=$1, status=$2, tariff=$3, daily_rate=$4, floor=$5, cabin_type=$6, "updatedAt"=NOW() WHERE id=$7${hc.sql}`,
      [cabinNumber, status, tariff, resolvedDailyRate, floor, resolvedType, id, ...hc.params]
    );
    const hc2 = hospitalClause(req.hospitalId, 2);
    const cabin = await queryOne(`SELECT * FROM cabins WHERE id = $1${hc2.sql}`, [id, ...hc2.params]);
    res.json(cabin);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function deleteCabin(req, res) {
  try {
    const { id } = req.params;
    const hc = hospitalClause(req.hospitalId, 2);
    const cabin = await queryOne(`SELECT status FROM cabins WHERE id = $1${hc.sql}`, [id, ...hc.params]);
    if (!cabin) return res.status(404).json({ error: 'Cabin not found' });
    if (cabin.status === 'Occupied') {
      return res.status(409).json({ error: 'This cabin is currently occupied and cannot be deleted. Release the body first.' });
    }
    await runQuery(`UPDATE cabins SET status = 'Deactivated' WHERE id = $1${hc.sql}`, [id, ...hc.params]);
    res.json({ message: 'Cabin deactivated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}
