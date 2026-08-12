import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { LifeGenXAiService } from '../services/lifegenx-ai.service';
import { LifeGenXAudioService } from '../services/lifegenx-audio.service';
import { TranscribeAudioDto, ExtractSymptomsDto, GenerateDiagnosisDto, ZoiBotDto } from '../dto/ai.dto';

/** LifeGenX integration (delivery phase). Ports `controllers/ai.controller.ts`. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('LIFEGENX:AI:USE')
@Controller('lifegenx/ai')
export class LifeGenXAiController {
  constructor(
    private readonly aiService: LifeGenXAiService,
    private readonly audioService: LifeGenXAudioService,
  ) {}

  @Post('transcribe')
  async transcribe(@Body() dto: TranscribeAudioDto) {
    const filePath = this.audioService.findFilePathByAudioId(dto.audioId) || '';

    if (dto.language === 'malayalam') {
      const result = await this.aiService.transcribeAndTranslateMalayalam(filePath);
      return {
        malayalamTranscript: result.malayalamTranscript,
        transcript: result.englishTranslation,
      };
    }

    const transcript = await this.aiService.transcribeAudio(filePath);
    return { transcript };
  }

  @Post('extract')
  extract(@Body() dto: ExtractSymptomsDto) {
    return this.aiService.extractSymptoms(dto.transcript);
  }

  @Post('diagnosis')
  diagnosis(@Body() dto: GenerateDiagnosisDto) {
    return this.aiService.generateDiagnosis(dto.symptoms, dto.observations || []);
  }

  @Post('zoibot')
  async zoibot(@Body() dto: ZoiBotDto) {
    const response = await this.aiService.askZoiBot(dto.userInput);
    return { response };
  }
}
