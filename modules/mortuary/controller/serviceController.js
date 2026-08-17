import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, runQuery, hospitalClause } from '../config/db.js';

export async function getServices(req, res) {
  try {
    const hc = hospitalClause(req.hospitalId, 1);
    const services = await queryAll(`SELECT * FROM service_master WHERE 1=1${hc.sql} ORDER BY service_name`, hc.params);
    res.json(services);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function createService(req, res) {
  try {
    const { service_name, tariff } = req.body;
    if (!service_name || tariff === undefined)
      return res.status(400).json({ error: 'service_name and tariff are required' });

    const hospitalId = req.hospitalId ?? req.body.hospitalId;
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId is required' });

    const id = uuidv4();
    await runQuery(
      'INSERT INTO service_master (id, service_name, tariff, hospital_id) VALUES ($1, $2, $3, $4)',
      [id, service_name.trim(), parseFloat(tariff) || 0, hospitalId]
    );
    const service = await queryOne('SELECT * FROM service_master WHERE id = $1', [id]);
    res.json(service);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function updateService(req, res) {
  try {
    const { id } = req.params;
    const { service_name, tariff } = req.body;
    if (!service_name || tariff === undefined)
      return res.status(400).json({ error: 'service_name and tariff are required' });

    const hc = hospitalClause(req.hospitalId, 4);
    await runQuery(
      `UPDATE service_master SET service_name=$1, tariff=$2, "updatedAt"=NOW() WHERE id=$3${hc.sql}`,
      [service_name.trim(), parseFloat(tariff) || 0, id, ...hc.params]
    );
    const hc2 = hospitalClause(req.hospitalId, 2);
    const service = await queryOne(`SELECT * FROM service_master WHERE id = $1${hc2.sql}`, [id, ...hc2.params]);
    res.json(service);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}

export async function deleteService(req, res) {
  try {
    const { id } = req.params;
    const hc = hospitalClause(req.hospitalId, 2);
    await runQuery(`DELETE FROM service_master WHERE id = $1${hc.sql}`, [id, ...hc.params]);
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
}
