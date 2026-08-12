import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Hospital } from '../hospitals/entities/hospital.entity';
import { RevocationEvent } from '../hospitals/entities/revocation-event.entity';
import { SigningService } from '../signing/signing.service';

export interface WebhookPayload {
  type: string;
  [key: string]: unknown;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(Hospital)
    private readonly hospitalRepo: Repository<Hospital>,
    @InjectRepository(RevocationEvent)
    private readonly revocationRepo: Repository<RevocationEvent>,
    private readonly signingService: SigningService,
  ) {}

  async deliver(hospital: Hospital, payload: WebhookPayload): Promise<{ ok: boolean; error?: string }> {
    // Customers merge (Phase 2, 2026-07-20): webhookUrl/instanceSecret are
    // now nullable (a cloud hospital row has neither -- see
    // hospital.entity.ts). deliver() is still called for cloud hospitals
    // from call sites that intentionally weren't given a hard
    // assertSelfHosted() guard (revoke/approve/extend-trial/delete --
    // see HospitalsService), since those should still succeed on the
    // Vendor Portal side even though there's nothing to push to yet. Fail
    // this specific delivery clearly instead of letting `fetch(null, ...)`
    // throw a less legible TypeError.
    if (!hospital.webhookUrl || !hospital.instanceSecret) {
      const error = 'No webhook configured for this hospital (cloud tenants are not push-integrated yet -- see CLOUD_VS_SELF_HOSTED_ROADMAP.md Phase 3).';
      this.logger.warn(`Webhook delivery skipped for ${hospital.hospitalCode}: ${error}`);
      return { ok: false, error };
    }
    const webhookUrl = hospital.webhookUrl;
    const instanceSecret = hospital.instanceSecret;

    const body = JSON.stringify(payload);
    const signature = this.signingService.computeHmac(instanceSecret, body);

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type':       'application/json',
          'X-Vendor-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });

      const ok = res.ok;
      await this.hospitalRepo.update(hospital.id, {
        lastWebhookAt:     new Date(),
        lastWebhookStatus: ok ? 'OK' : 'FAILED',
      });

      if (!ok) {
        const errText = await res.text();
        this.logger.warn(`Webhook to ${hospital.hospitalCode} failed (${res.status}): ${errText}`);
        return { ok: false, error: `HTTP ${res.status}: ${errText}` };
      }

      this.logger.log(`Webhook delivered to ${hospital.hospitalCode}: type=${payload.type}`);
      return { ok: true };
    } catch (err: any) {
      await this.hospitalRepo.update(hospital.id, {
        lastWebhookAt:     new Date(),
        lastWebhookStatus: 'FAILED',
      });
      this.logger.error(`Webhook delivery failed for ${hospital.hospitalCode}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  async deliverRevocation(
    revocationId: string,
    hospital: Hospital,
    payload: WebhookPayload,
  ): Promise<void> {
    const result = await this.deliver(hospital, payload);
    await this.revocationRepo.update(revocationId, {
      webhookStatus: result.ok ? 'DELIVERED' : 'FAILED',
    });
  }
}
