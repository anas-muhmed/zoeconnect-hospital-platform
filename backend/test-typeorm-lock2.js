"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
const typeorm_1 = require("typeorm");
let TestLock = class TestLock {
};
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], TestLock.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], TestLock.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.VersionColumn)(),
    __metadata("design:type", Number)
], TestLock.prototype, "version", void 0);
TestLock = __decorate([
    (0, typeorm_1.Entity)()
], TestLock);
const ds = new typeorm_1.DataSource({
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'hdsp_app',
    password: 'dev_password_change_in_prod',
    database: 'hdsp_db',
    entities: [TestLock],
    synchronize: true
});
async function run() {
    await ds.initialize();
    const repo = ds.getRepository(TestLock);
    const e = await repo.save(repo.create({ name: 'Init' }));
    const c1 = await repo.findOneBy({ id: e.id });
    const c2 = await repo.findOneBy({ id: e.id });
    c1.name = 'V1';
    c2.name = 'V2';
    try {
        await Promise.all([repo.save(c1), repo.save(c2)]);
        console.log('NO ERROR THROWN!');
        const final = await repo.findOneBy({ id: e.id });
        console.log('Final version:', final.version, 'Final name:', final.name);
    }
    catch (err) {
        console.log('CAUGHT:', err.constructor.name, err.message);
    }
}
run();
//# sourceMappingURL=test-typeorm-lock2.js.map