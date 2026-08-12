import { Controller, Get, Post, Param, Body, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { IsString, IsNumber, IsNotEmpty } from 'class-validator';
import { AssetLibraryService } from '../services/asset-library.service';

export class CreateAssetDto {
  @IsString()
  @IsNotEmpty()
  filename: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsNumber()
  sizeBytes: number;

  @IsString()
  @IsNotEmpty()
  base64Data: string;
}

@Controller('assets')
export class AssetLibraryController {
  constructor(private readonly assetService: AssetLibraryService) {}

  @Post()
  async uploadAsset(@Body() body: CreateAssetDto) {
    return this.assetService.uploadAsset(body.filename, body.mimeType, body.sizeBytes, body.base64Data);
  }

  @Get()
  async listAssets() {
    return this.assetService.listAssets();
  }

  @Get(':id')
  async getAsset(@Param('id') id: string) {
    return this.assetService.getAsset(id);
  }

  @Get(':id/content')
  async getAssetContent(@Param('id') id: string, @Res() res: FastifyReply) {
    const asset = await this.assetService.getAsset(id);
    if (!asset || !asset.base64Data) return res.status(404).send();

    const matches = asset.base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const buffer = Buffer.from(matches[2], 'base64');
      res.type(matches[1]).send(buffer);
    } else {
      res.type(asset.mimeType).send(Buffer.from(asset.base64Data, 'base64'));
    }
  }
}
