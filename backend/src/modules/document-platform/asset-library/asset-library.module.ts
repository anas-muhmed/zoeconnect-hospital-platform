import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetEntity } from './entities/asset.entity';
import { AssetLibraryService } from './services/asset-library.service';
import { AssetLibraryController } from './controllers/asset-library.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AssetEntity])],
  controllers: [AssetLibraryController],
  providers: [AssetLibraryService],
  exports: [AssetLibraryService],
})
export class AssetLibraryModule {}
