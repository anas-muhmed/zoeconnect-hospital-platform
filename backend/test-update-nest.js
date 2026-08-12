const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { UsersService } = require('./dist/modules/users/users.service');

async function test() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  
  try {
    const users = await usersService.findAll(1, 10);
    const staff = users.items.find(u => u.username === 'staff' || u.email === 'staff@test.com');
    if (!staff) {
      console.log('staff not found');
      return;
    }
    
    console.log(`Testing PATCH on user ${staff.id}...`);
    
    const updateDto = {
      email: staff.email,
      fullName: staff.fullName,
      roleIds: staff.roles.map(r => r.id),
      hisEmployeeCode: ""
    };
    
    console.log('Sending DTO:', updateDto);
    await usersService.update(staff.id, updateDto, staff.id);
    
    console.log('Update passed!');
  } catch (err) {
    console.error('Update failed with error:', err);
  } finally {
    await app.close();
  }
}

test();
