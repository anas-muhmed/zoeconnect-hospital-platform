import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetEntity } from '../entities/asset.entity';

@Injectable()
export class AssetLibraryService {
  constructor(
    @InjectRepository(AssetEntity)
    private readonly assetRepo: Repository<AssetEntity>,
  ) {}

  async uploadAsset(filename: string, mimeType: string, sizeBytes: number, base64Data: string): Promise<AssetEntity> {
    const asset = this.assetRepo.create({
      filename,
      mimeType,
      sizeBytes,
      base64Data, // In a real env, we'd store this in S3 and set the URL. For this milestone, we use base64 in DB or local disk.
    });
    return this.assetRepo.save(asset);
  }

  async getAsset(id: string): Promise<AssetEntity> {
    const asset = await this.assetRepo.findOne({ where: { id } });
    if (!asset) {
      throw new NotFoundException(`Asset ${id} not found`);
    }
    return asset;
  }

  async listAssets(): Promise<AssetEntity[]> {
    return this.assetRepo.find({
      select: ['id', 'filename', 'mimeType', 'sizeBytes', 'createdAt'],
      order: { createdAt: 'DESC' },
    });
  }
}
