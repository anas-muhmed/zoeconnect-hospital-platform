import { Controller, Get, Post, Param, Body, Query, Req, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import * as crypto from 'crypto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FeedbackPublicService } from './feedback-public.service';
import { SubmitFeedbackDto } from '../dto/feedback-submission.dto';
import { SubmitComplaintDto } from '../dto/feedback-complaint.dto';

/**
 * Fully public, no-login, no-guards portal -- mirrors the CMS player
 * controller's pattern (no `@UseGuards()` at all, rather than `@Public()`
 * exemptions) since every route here must be reachable by an anonymous
 * patient scanning a printed QR code. Never exposes internal database ids;
 * the only identifier a client ever sees is the QR token already in the URL.
 */
@ApiTags('Feedback Public Portal')
@Controller('feedback/public')
export class FeedbackPublicController {
  constructor(private readonly publicService: FeedbackPublicService) {}

  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  // A QR's active/expired/campaign/publish state can flip between two scans
  // of the *same* URL (e.g. an admin re-enables it) -- never let a browser,
  // proxy, or CDN serve a stale cached answer for that.
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @ApiOperation({ summary: 'Resolve a QR token to its live form for the public portal (?lang= selects a translation)' })
  resolve(@Param('token') token: string, @Query('lang') lang?: string) {
    return this.publicService.resolve(token, lang);
  }

  @Post(':token/submit')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit a completed feedback form' })
  submit(@Param('token') token: string, @Body() dto: SubmitFeedbackDto, @Req() req: FastifyRequest) {
    const userAgent = (req.headers['user-agent'] as string) ?? null;
    const ip = req.ip ?? '';
    // Hashed, never stored raw -- only used to make abuse patterns visible, not to identify a person.
    const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex') : null;
    return this.publicService.submit(token, dto, { userAgent, ipHash });
  }

  @Post(':token/complaint')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "Opt-in complaint/suggestion submission, shown after a low-rated feedback submission" })
  submitComplaint(@Param('token') token: string, @Body() dto: SubmitComplaintDto) {
    return this.publicService.submitComplaint(token, dto);
  }
}
