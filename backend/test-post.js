const { spawn } = require('child_process');

const backend = spawn('npm.cmd', ['run', 'start'], {
  cwd: '.',
  env: { ...process.env, DB_NAME: 'hdsp_db_e2e' },
  shell: true
});

backend.stdout.on('data', data => console.log(data.toString()));
backend.stderr.on('data', data => console.error(data.toString()));

async function run() {
  let up = false;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://localhost:3001/api/v1/health/live');
      if (res.status === 200) { up = true; break; }
    } catch(e) {}
    await new Promise(r => setTimeout(r, 2000));
  }
  
  if (!up) {
    console.error('Backend never came up');
    process.exit(1);
  }
  
  console.log('Backend is UP! Sending POST...');
  try {
    const res = await fetch('http://localhost:3001/api/v1/incident', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        categoryId: '6bc94fa9-0c1d-4b65-a19c-f2d6c7af5ac2',
        typeId: '038e6aa9-5b53-428a-b78e-983b33a28eec',
        severityCode: 'HIGH',
        incidentDate: '2026-07-27T16:44',
        department: 'Emergency Department',
        description: 'Patient fell out of bed while reaching for water.',
        isAnonymous: false,
        isNearMiss: false,
        isSentinelEvent: false,
        tags: []
      })
    });
    const data = await res.json();
    console.log('STATUS:', res.status);
    console.log('RESPONSE:', data);
  } catch(e) {
    console.error('POST Error:', e);
  }
  
  backend.kill();
}
run();
