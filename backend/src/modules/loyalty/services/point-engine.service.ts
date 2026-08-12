import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from '../entities/campaign.entity';
import type { CardCategory, DiscountThreshold } from '../entities/card-category.entity';

export interface PointCalculation {
  basePoints: number;
  campaignBonus: number;
  campaignMultiplier: number;
  totalPoints: number;
  activeCampaigns: string[];
}

export interface DiscountResult {
  discountPct: number;
  cardValue: number;       // monetary value of current points in Rs.
  thresholdLabel: string;
}

@Injectable()
export class PointEngineService {
  private readonly logger = new Logger(PointEngineService.name);

  constructor(
    @InjectRepository(Campaign) private readonly campaignRepo: Repository<Campaign>,
  ) {}

  // ── Calculate points for a bill ───────────────────────────────────────────
  async calculateEarnPoints(
    billAmount: number,
    category: CardCategory,
    patientDobMonth?: number, // 1-12, for birthday campaign check
  ): Promise<PointCalculation> {
    // Base: floor(billAmount / 100) × earnRatePer100
    const basePoints = Math.floor(billAmount / 100) * Number(category.earnRatePer100);

    // Find active campaigns
    const now = new Date();
    const campaigns = await this.campaignRepo.find({ where: { isActive: true } });

    const activeCampaigns = campaigns.filter((c) => {
      if (c.startDate && c.startDate > now) return false;
      if (c.endDate   && c.endDate   < now) return false;

      // Birthday campaign: applies only in patient's birth month
      if (c.campaignType === 'BIRTHDAY') {
        if (patientDobMonth === undefined || new Date().getMonth() + 1 !== patientDobMonth) return false;
      }

      // Tier restriction: if eligibleCardCodes is non-empty, the account's
      // card category code must be in the list; otherwise applies to all tiers
      if (c.eligibleCardCodes && c.eligibleCardCodes.length > 0) {
        if (!c.eligibleCardCodes.includes(category.code)) return false;
      }

      return true;
    });

    // Take the highest multiplier from all active campaigns
    let campaignMultiplier = 1;
    let campaignBonus = 0;

    for (const c of activeCampaigns) {
      if (Number(c.earnMultiplier) > campaignMultiplier) campaignMultiplier = Number(c.earnMultiplier);
      campaignBonus += Number(c.bonusPointsFlat);
    }

    const multipliedPoints = Math.floor(basePoints * campaignMultiplier);
    const totalPoints = multipliedPoints + campaignBonus;

    return {
      basePoints,
      campaignBonus,
      campaignMultiplier,
      totalPoints,
      activeCampaigns: activeCampaigns.map((c) => c.name),
    };
  }

  // ── Compute discount % based on accumulated card value ────────────────────
  // SRS: "Applies once point value hits thresholds"
  //   cardValue (Rs.) = (availablePoints / 100) × pointValuePer100
  //   Silver:   Rs.300+  → 3%
  //   Gold:     Rs.300+  → 3%;  Rs.600+ → 6%
  //   Platinum: Rs.300+  → 3%;  Rs.600+ → 6%;  Rs.900+ → 10%
  computeDiscount(availablePoints: number, category: CardCategory): DiscountResult {
    const cardValue = (availablePoints / 100) * Number(category.pointValuePer100);

    const thresholds: DiscountThreshold[] = [...(category.discountThresholds ?? [])].sort(
      (a, b) => b.min_value - a.min_value, // highest bracket first
    );

    for (const t of thresholds) {
      if (cardValue >= t.min_value) {
        return {
          discountPct: t.discount_pct,
          cardValue: Math.round(cardValue * 100) / 100,
          thresholdLabel: `₹${t.min_value}+ card value → ${t.discount_pct}% off`,
        };
      }
    }

    return {
      discountPct: 0,
      cardValue: Math.round(cardValue * 100) / 100,
      thresholdLabel: 'No discount threshold met',
    };
  }

  // ── Determine tier from total lifetime spend ──────────────────────────────
  // Tiers are sorted by minSpend descending and the first one whose threshold
  // the customer has met wins. maxSpend is NOT used here — it is purely
  // informational for the UI progress bar. Using maxSpend for matching creates
  // gaps between tiers (e.g. ₹50001–₹99999 with no matching range would
  // incorrectly fall back to Silver).
  determineTier(totalSpend: number, categories: CardCategory[]): CardCategory {
    const sorted = [...categories].sort((a, b) => Number(b.minSpend) - Number(a.minSpend));
    for (const cat of sorted) {
      if (totalSpend >= Number(cat.minSpend)) return cat;
    }
    // Silver (minSpend=0) always matches, so this is only hit if no categories exist
    return sorted[sorted.length - 1];
  }
}
