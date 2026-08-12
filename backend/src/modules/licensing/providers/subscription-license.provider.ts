import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, IsNull } from 'typeorm';
import {
  ILicenseProvider,
  LicenseProviderStatus,
} from '../../platform/infrastructure/licensing/license-provider.interface';
import { SubscriptionLicense } from '../entities/subscription-license.entity';
import { ALL_MODULE_CODES } from '../license.service';

const EXPIRY_WARN_DAYS = 30;
const DEFAULT_GRACE_PERIOD_DAYS = 3;

/**
 * SubscriptionLicenseProvider — Phase 4 ("Licensing Providers", Task 4.2).
 *
 * Reads tenant license status from `subscription_licenses`, ZoeConnect's local
 * mirror of the billing-shaped Vendor Portal fields (stripeCustomerId,
 * planId, subscription status) the prior audit recommended. No Stripe
 * integration exists yet -- this provider proves `ILicenseProvider`'s
 * interface holds for a second, differently-shaped backing store; it does
 * not process billing events or call out to Stripe.
 *
 * Not bound as the active `LICENSE_PROVIDER` in any deployment by default
 * (see Task 4.3 -- `LICENSE_PROVIDER` defaults to `file`). Every existing
 * self-hosted deployment continues on `FileLicenseProvider` unless a
 * deployment explicitly opts in.
 */
@Injectable()
export class SubscriptionLicenseProvider implements ILicenseProvider {
  constructor(
    @InjectRepository(SubscriptionLicense)
    private readonly subscriptionRepo: Repository<SubscriptionLicense>,
    // Optional constructor param -- test call sites in
    // license-provider.conformance.spec.ts construct this class directly
    // with just a repo mock (`new SubscriptionLicenseProvider(repo)`), so
    // this must stay usable without a ConfigService. Falls back to
    // DEFAULT_GRACE_PERIOD_DAYS when omitted, exactly like an unset
    // SUBSCRIPTION_GRACE_PERIOD_DAYS env var would via licensing.config.ts.
    private readonly config?: ConfigService,
  ) {}

  async getStatus(tenantId?: string): Promise<LicenseProviderStatus> {
    // Matches FileLicenseProvider/LicenseService's own tolerance for "no
    // tenant resolved yet" (Phase 10 provisioning doesn't exist): a null/
    // undefined tenantId falls back to the single most-recently-updated
    // untenanted row, exactly like LicenseService.getHistory() picking the
    // newest record when there's no tenant filter to apply.
    const record = tenantId
      ? await this.subscriptionRepo.findOne({ where: { tenantId }, order: { updatedAt: 'DESC' } })
      : await this.subscriptionRepo.findOne({ where: { tenantId: IsNull() }, order: { updatedAt: 'DESC' } });

    if (!record) {
      return this._notFoundStatus();
    }

    const now = Date.now();
    const expiresAt = record.currentPeriodEnd;
    const daysRemaining = expiresAt ? Math.ceil((expiresAt.getTime() - now) / 86_400_000) : null;
    const isExpired = expiresAt ? expiresAt.getTime() < now : false;

    // Grace-period hardening (Cloud Licensing API, 2026-07-29): 'past_due'
    // is Stripe's lapsed-payment state -- the subscription hasn't been
    // explicitly canceled, so a short grace window keeps the tenant working
    // while billing is retried/fixed, instead of an instant hard cutoff the
    // moment a card declines. 'canceled'/'incomplete' get NO grace -- those
    // are deliberate/terminal states, not a transient payment hiccup.
    let isValid: boolean;
    let isInGracePeriod = false;
    let gracePeriodEndsAt: Date | null = null;

    if (record.subscriptionStatus === 'past_due') {
      if (expiresAt) {
        const graceDays = this.config?.get<number>('licensing.subscriptionGracePeriodDays', DEFAULT_GRACE_PERIOD_DAYS)
          ?? DEFAULT_GRACE_PERIOD_DAYS;
        const graceEnd = new Date(expiresAt.getTime() + graceDays * 86_400_000);
        const withinGrace = now <= graceEnd.getTime();
        isValid = withinGrace;
        isInGracePeriod = withinGrace;
        gracePeriodEndsAt = withinGrace ? graceEnd : null;
      } else {
        // No currentPeriodEnd to anchor a grace window to -- nothing to be
        // "in grace" relative to, so this falls back to invalid rather than
        // guessing a grace window out of thin air.
        isValid = false;
      }
    } else if (record.subscriptionStatus === 'canceled' || record.subscriptionStatus === 'incomplete' || record.subscriptionStatus === 'suspended') {
      // 'suspended' is an administrative override (abuse/compliance/manual
      // ops), not a billing lapse -- no grace period, same as a deliberate
      // cancellation. Kept as a distinct status (not reusing 'canceled') so
      // support/compliance tooling can tell the two apart later.
      isValid = false;
    } else {
      isValid = ['trialing', 'active'].includes(record.subscriptionStatus) && !isExpired;
    }

    const isTrial = record.subscriptionStatus === 'trialing';

    // Full-platform trial widening (2026-07-31) -- mirrors
    // LicenseService.refreshCache()'s `hasTrial` branch exactly (see that
    // method's doc comment): a trial that only unlocks the narrow module
    // set actually persisted at signup (`stepIssueTrialLicense` only grants
    // `['PLATFORM']` for cloud tenants) defeats the point of a trial. While
    // the subscription is genuinely `trialing` AND still valid (not
    // expired/past_due-exhausted), every registered module is treated as
    // licensed here too -- self-hosted and cloud trials now behave
    // identically. `ALL_MODULE_CODES` is imported from LicenseService
    // rather than redefined here, so the two providers can never drift on
    // "what counts as everything."
    const licensedModules = isTrial && isValid
      ? ALL_MODULE_CODES
      : (record.licensedModules ?? []);

    return {
      isValid,
      isTrial,
      hospitalName: record.hospitalName,
      hospitalCode: record.hospitalCode,
      licensedModules,
      maxUsers: record.maxUsers,
      expiresAt,
      daysRemaining,
      isExpiringSoon: daysRemaining !== null && daysRemaining <= EXPIRY_WARN_DAYS && daysRemaining >= 0,
      machineFingerprint: record.machineFingerprint,
      // Widened modules beyond what's actually persisted ride on the
      // trial's overall expiry (`expiresAt`), same fallback
      // LicenseService.refreshCache() uses for its own widened modules.
      moduleExpiries: Object.fromEntries(licensedModules.map((m) => [m, expiresAt])),
      isInGracePeriod,
      gracePeriodEndsAt,
      gracePeriodModules: isInGracePeriod ? (record.licensedModules ?? []) : [],
    };
  }

  private _notFoundStatus(): LicenseProviderStatus {
    return {
      isValid: false,
      isTrial: false,
      hospitalName: '',
      hospitalCode: '',
      licensedModules: [],
      maxUsers: 0,
      expiresAt: null,
      daysRemaining: null,
      isExpiringSoon: false,
      machineFingerprint: null,
      moduleExpiries: {},
      isInGracePeriod: false,
      gracePeriodEndsAt: null,
      gracePeriodModules: [],
    };
  }
}
