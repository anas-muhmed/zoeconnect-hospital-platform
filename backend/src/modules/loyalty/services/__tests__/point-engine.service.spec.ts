import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PointEngineService } from '../point-engine.service';
import { Campaign } from '../../entities/campaign.entity';
import type { CardCategory } from '../../entities/card-category.entity';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Fixtures use the real CardCategory schema: earnRatePer100 (points earned
// per Rs.100 of bill amount), pointValuePer100 (Rs. value of 100 accumulated
// points — used by computeDiscount's cardValue calc), and discountThresholds
// keyed by snake_case {min_value, discount_pct} (JSONB, stored as-is by
// TypeORM per the entity's own doc comment). With pointValuePer100 = 1,
// cardValue (Rs.) = availablePoints / 100, so thresholds below are just the
// old point-thresholds divided by 100 — same qualitative test behavior.
const makeSilverCategory = (overrides: Partial<CardCategory> = {}): CardCategory =>
  ({
    id:               'cat-silver',
    name:             'Silver',
    code:             'SILVER',
    colourHex:        '#C0C0C0',
    earnRatePer100:   1,
    pointValuePer100: 1,
    minSpend:         0,
    maxSpend:         50000,
    discountThresholds:   [
      { min_value: 5,  discount_pct: 5 },
      { min_value: 10, discount_pct: 10 },
    ],
    isActive:     true,
    displayOrder: 1,
    ...overrides,
  } as unknown as CardCategory);

const makeGoldCategory = (): CardCategory =>
  ({
    id:               'cat-gold',
    name:             'Gold',
    code:             'GOLD',
    colourHex:        '#FFD700',
    earnRatePer100:   2,
    pointValuePer100: 1,
    minSpend:         50001,
    maxSpend:         150000,
    discountThresholds:   [{ min_value: 20, discount_pct: 15 }],
    isActive:     true,
    displayOrder: 2,
  } as unknown as CardCategory);

const makePlatinumCategory = (): CardCategory =>
  ({
    id:               'cat-plat',
    name:             'Platinum',
    code:             'PLATINUM',
    colourHex:        '#E5E4E2',
    earnRatePer100:   3,
    pointValuePer100: 1,
    minSpend:         150001,
    maxSpend:         null,
    discountThresholds:   [{ min_value: 50, discount_pct: 20 }],
    isActive:     true,
    displayOrder: 3,
  } as unknown as CardCategory);

function mockCampaignRepo(campaigns: Partial<Campaign>[] = []): Partial<Repository<Campaign>> {
  return {
    find: jest.fn().mockResolvedValue(campaigns),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PointEngineService', () => {
  let service: PointEngineService;
  let campaignRepo: jest.Mocked<Repository<Campaign>>;

  async function createService(campaigns: Partial<Campaign>[] = []) {
    const repoMock = mockCampaignRepo(campaigns);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PointEngineService,
        { provide: getRepositoryToken(Campaign), useValue: repoMock },
      ],
    }).compile();

    service = module.get<PointEngineService>(PointEngineService);
    campaignRepo = module.get(getRepositoryToken(Campaign));
    return service;
  }

  // ── calculateEarnPoints ───────────────────────────────────────────────────

  describe('calculateEarnPoints', () => {
    it('returns floor(billAmount/100) * earnRatePer100 base points with no campaigns', async () => {
      await createService([]);
      const silver = makeSilverCategory();

      const result = await service.calculateEarnPoints(750, silver);

      expect(result.basePoints).toBe(7);       // floor(750/100) * 1
      expect(result.campaignMultiplier).toBe(1);
      expect(result.campaignBonus).toBe(0);
      expect(result.totalPoints).toBe(7);
      expect(result.activeCampaigns).toHaveLength(0);
    });

    it('applies campaign multiplier correctly', async () => {
      const doubleCampaign: Partial<Campaign> = {
        id: 'c1', name: 'Diwali Double', campaignType: 'FESTIVAL',
        earnMultiplier: 2, bonusPointsFlat: 0, isActive: true, startDate: new Date(), endDate: new Date(),
      };
      await createService([doubleCampaign]);
      const silver = makeSilverCategory();

      const result = await service.calculateEarnPoints(1000, silver);

      expect(result.basePoints).toBe(10);      // floor(1000/100) * 1
      expect(result.campaignMultiplier).toBe(2);
      expect(result.totalPoints).toBe(20);     // 10 * 2 + 0
    });

    it('adds campaign flat bonus on top of multiplied points', async () => {
      const bonusCampaign: Partial<Campaign> = {
        id: 'c2', name: 'New Year', campaignType: 'FESTIVAL',
        earnMultiplier: 1, bonusPointsFlat: 50, isActive: true, startDate: new Date(), endDate: new Date(),
      };
      await createService([bonusCampaign]);
      const silver = makeSilverCategory();

      const result = await service.calculateEarnPoints(500, silver);

      expect(result.basePoints).toBe(5);
      expect(result.campaignBonus).toBe(50);
      expect(result.totalPoints).toBe(55);     // 5 * 1 + 50
    });

    it('uses highest multiplier when multiple campaigns active', async () => {
      const campaigns: Partial<Campaign>[] = [
        { id: 'c1', name: 'C1', campaignType: 'FESTIVAL', earnMultiplier: 2, bonusPointsFlat: 0, isActive: true, startDate: new Date(), endDate: new Date() },
        { id: 'c2', name: 'C2', campaignType: 'MANUAL',   earnMultiplier: 3, bonusPointsFlat: 0, isActive: true, startDate: new Date(), endDate: new Date() },
      ];
      await createService(campaigns);

      const result = await service.calculateEarnPoints(1000, makeSilverCategory());

      expect(result.campaignMultiplier).toBe(3);
      expect(result.totalPoints).toBe(30);
    });

    it('birthday campaign only applies in patient birth month', async () => {
      const currentMonth = new Date().getMonth() + 1;
      const bdayCampaign: Partial<Campaign> = {
        id: 'b1', name: 'Birthday', campaignType: 'BIRTHDAY',
        earnMultiplier: 1, bonusPointsFlat: 100, isActive: true, startDate: new Date(), endDate: new Date(),
      };
      await createService([bdayCampaign]);
      const silver = makeSilverCategory();

      // With matching birth month — bonus applies
      const withBonus = await service.calculateEarnPoints(1000, silver, currentMonth);
      expect(withBonus.campaignBonus).toBe(100);

      // With mismatching birth month — no bonus
      const otherMonth = currentMonth === 12 ? 1 : currentMonth + 1;
      const noBonus = await service.calculateEarnPoints(1000, silver, otherMonth);
      expect(noBonus.campaignBonus).toBe(0);
    });

    it('excludes campaigns past their end date', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const expiredCampaign: Partial<Campaign> = {
        id: 'e1', name: 'Expired', campaignType: 'FESTIVAL',
        earnMultiplier: 5, bonusPointsFlat: 200, isActive: true,
        startDate: new Date(), endDate: yesterday,
      };
      await createService([expiredCampaign]);

      const result = await service.calculateEarnPoints(1000, makeSilverCategory());

      expect(result.campaignMultiplier).toBe(1);
      expect(result.campaignBonus).toBe(0);
    });

    it('uses gold category earnRatePer100 = 2', async () => {
      await createService([]);
      const gold = makeGoldCategory();

      const result = await service.calculateEarnPoints(500, gold);

      expect(result.basePoints).toBe(10);      // floor(500/100) * 2
    });
  });

  // ── computeDiscount ────────────────────────────────────────────────────────

  describe('computeDiscount', () => {
    const silver = makeSilverCategory();

    it('returns 0% when below all thresholds', () => {
      const result = service.computeDiscount(100, silver);
      expect(result.discountPct).toBe(0);
    });

    it('returns 5% at exactly 500 points threshold', () => {
      const result = service.computeDiscount(500, silver);
      expect(result.discountPct).toBe(5);
    });

    it('returns 10% at exactly 1000 points threshold (highest wins)', () => {
      const result = service.computeDiscount(1000, silver);
      expect(result.discountPct).toBe(10);
    });

    it('returns highest threshold when well above all thresholds', () => {
      const result = service.computeDiscount(5000, silver);
      expect(result.discountPct).toBe(10);
    });

    it('returns 0% with no thresholds defined', () => {
      const cat = makeSilverCategory({ discountThresholds: [] });
      const result = service.computeDiscount(9999, cat);
      expect(result.discountPct).toBe(0);
    });
  });

  // ── determineTier ─────────────────────────────────────────────────────────

  describe('determineTier', () => {
    const categories = [makeSilverCategory(), makeGoldCategory(), makePlatinumCategory()];

    it('returns Silver for spend = 0', () => {
      const tier = service.determineTier(0, categories);
      expect(tier.name).toBe('Silver');
    });

    it('returns Silver for spend at minSpend boundary', () => {
      const tier = service.determineTier(0, categories);
      expect(tier.name).toBe('Silver');
    });

    it('returns Gold for spend = 50001', () => {
      const tier = service.determineTier(50001, categories);
      expect(tier.name).toBe('Gold');
    });

    it('returns Gold at Gold upper boundary', () => {
      const tier = service.determineTier(150000, categories);
      expect(tier.name).toBe('Gold');
    });

    it('returns Platinum for spend > 150000', () => {
      const tier = service.determineTier(150001, categories);
      expect(tier.name).toBe('Platinum');
    });

    it('returns Platinum for very high spend (null maxSpend)', () => {
      const tier = service.determineTier(10_000_000, categories);
      expect(tier.name).toBe('Platinum');
    });

    it('falls back to lowest tier when no categories match', () => {
      const onlySilver = [makeSilverCategory()];
      const tier = service.determineTier(999_999, onlySilver);
      expect(tier.name).toBe('Silver');
    });
  });
});
