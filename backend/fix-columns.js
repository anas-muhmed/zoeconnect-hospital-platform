const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/modules/incident/entities');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.entity.ts'));

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace @Column({ length: ... }) with @Column({ type: 'varchar', length: ... })
  content = content.replace(/@Column\(\{\s*length:/g, "@Column({ type: 'varchar', length:");
  
  // Replace @Column({ name: '...', length: ... }) with @Column({ name: '...', type: 'varchar', length: ... })
  content = content.replace(/@Column\(\{\s*name:\s*([^,]+),\s*length:/g, "@Column({ name: $1, type: 'varchar', length:");

  fs.writeFileSync(filePath, content);
}
console.log('Fixed all entity columns');
