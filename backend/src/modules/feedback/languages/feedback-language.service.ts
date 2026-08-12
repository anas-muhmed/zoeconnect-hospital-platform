import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeedbackLanguage } from '../entities/feedback-language.entity';
import { CreateLanguageDto, UpdateLanguageDto } from '../dto/feedback-translation.dto';

@Injectable()
export class FeedbackLanguageService {
  constructor(
    @InjectRepository(FeedbackLanguage)
    private readonly languageRepo: Repository<FeedbackLanguage>,
  ) {}

  // A5.5 API Contract Audit: admin GET /feedback/languages -- explicit select excludes tenantId.
  list(): Promise<FeedbackLanguage[]> {
    return this.languageRepo.find({
      order: { name: 'ASC' },
      select: ['id', 'code', 'name', 'isActive', 'createdAt'],
    });
  }

  async create(dto: CreateLanguageDto): Promise<FeedbackLanguage> {
    const existing = await this.languageRepo.findOne({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Language code "${dto.code}" already exists`);
    return this.languageRepo.save(this.languageRepo.create({ code: dto.code, name: dto.name, isActive: true }));
  }

  async update(id: string, dto: UpdateLanguageDto): Promise<FeedbackLanguage> {
    const language = await this.languageRepo.findOne({ where: { id } });
    if (!language) throw new NotFoundException(`Language "${id}" not found`);
    if (dto.name !== undefined) language.name = dto.name;
    if (dto.isActive !== undefined) language.isActive = dto.isActive;
    return this.languageRepo.save(language);
  }
}
