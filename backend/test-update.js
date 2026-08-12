const axios = require('axios');

async function test() {
  try {
    const login = await axios.post('http://localhost:3000/api/v1/auth/login', {
      username: 'superadmin',
      password: 'password123!' // assuming default password
    });
    
    const token = login.data.accessToken;
    console.log('Logged in!');
    
    const users = await axios.get('http://localhost:3000/api/v1/users', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const staff = users.data.items.find(u => u.username === 'staff' || u.email === 'staff@test.com');
    if (!staff) {
      console.log('staff not found');
      return;
    }
    
    console.log(`Testing PATCH on user ${staff.id}...`);
    
    // Send empty object
    const res1 = await axios.patch(`http://localhost:3000/api/v1/users/${staff.id}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Empty object test passed', res1.status);
    
    // Send full object without modifications
    const res2 = await axios.patch(`http://localhost:3000/api/v1/users/${staff.id}`, {
      email: staff.email,
      fullName: staff.fullName,
      roleIds: staff.roles.map(r => r.id),
      hisEmployeeCode: ""
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Full object test passed', res2.status);
    
  } catch (err) {
    console.error('Error during test:', err.response?.data || err.message);
  }
}

test();
