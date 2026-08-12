import { Inject, Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeedbackForm } from '../entities/feedback-form.entity';
import { FeedbackSection } from '../entities/feedback-section.entity';
import { FeedbackQuestion } from '../entities/feedback-question.entity';
import { FeedbackQuestionOption } from '../entities/feedback-question-option.entity';
import { FeedbackQuestionCondition } from '../entities/feedback-question-condition.entity';
import { CreateFeedbackFormDto, UpdateFeedbackFormDto } from '../dto/feedback-form.dto';
import { FeedbackAuditService } from '../audit/feedback-audit.service';
import { OPTION_BASED_QUESTION_TYPES } from '../entities/feedback-question-type.enum';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class FeedbackFormService {
  constructor(
    @InjectRepository(FeedbackForm)
    private readonly formRepo: Repository<FeedbackForm>,
    @InjectRepository(FeedbackSection)
    private readonly sectionRepo: Repository<FeedbackSection>,
    @InjectRepository(FeedbackQuestion)
    private readonly questionRepo: Repository<FeedbackQuestion>,
    @InjectRepository(FeedbackQuestionOption)
    private readonly optionRepo: Repository<FeedbackQuestionOption>,
    @InjectRepository(FeedbackQuestionCondition)
    private readonly conditionRepo: Repository<FeedbackQuestionCondition>,
    private readonly auditService: FeedbackAuditService,

    /**
     * Stage B (Checkpoint B3.7) — scoped repository for `list()` (session-
     * resolved only, `FeedbackFormController.list()`) and `_findOrThrow()`
     * (write-adjacent, used only by `update()`/`remove()`/`unpublish()`/
     * `archive()`/`setHeaderImage()`/`removeHeaderImage()`/`setSplashImage()`/
     * `removeSplashImage()`, all session-resolved routes). `findOne()` stays
     * raw — shared with the anonymous `FeedbackPublicService._resolveChain()`
     * chain (chain-resolved, deferred to B5) and internally by `publish()`/
     * `clone()`, both of which call `findOne()` not `_findOrThrow()`.
     */
    @Inject(getTenantScopedRepositoryToken(FeedbackForm))
    private readonly scopedFormRepo: TenantScopedRepository<FeedbackForm>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring audit.service.ts's pattern.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // A5.5 API Contract Audit: admin GET /feedback/forms -- explicit select excludes tenantId.
  async list(branchId?: string | null): Promise<FeedbackForm[]> {
    return this.scopedFormRepo.find({
      where: branchId ? { branchId } : {},
      order: { createdAt: 'DESC' },
      select: [
        'id', 'branchId', 'name', 'description', 'language', 'status', 'publishedAt',
        'createdBy', 'updatedBy', 'headerImageUrl', 'headerImageType',
        'splashImageUrl', 'splashDurationSeconds', 'createdAt', 'updatedAt',
      ],
    });
  }

  /**
   * Full nested tree: form -> sections -> questions -> options/conditions, all
   * in display order. Reached both by session-resolved admin routes AND the
   * fully-anonymous public portal (FeedbackPublicService._resolveChain ->
   * resolve()), so the eager `relations` load here can't safely carry
   * tenantId through to a QR-scan client -- A5.5 API Contract Audit: strip
   * tenantId post-fetch at every level of the tree (form, each section, each
   * question, each option, each condition) since the eager relations make an
   * explicit `select` array impractical.
   */
  async findOne(id: string): Promise<FeedbackForm> {
    const form = await this.formRepo.findOne({
      where: { id },
      relations: ['sections', 'sections.questions', 'sections.questions.options', 'sections.questions.conditions'],
    });
    if (!form) throw new NotFoundException(`Feedback form "${id}" not found`);

    delete (form as { tenantId?: string | null }).tenantId;
    form.sections = (form.sections ?? [])
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(section => {
        const { tenantId: _sectionTenantId, ...sectionRest } = section;
        return {
          ...sectionRest,
          questions: (section.questions ?? [])
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map(question => {
              const { tenantId: _questionTenantId, ...questionRest } = question;
              return {
                ...questionRest,
                options: (question.options ?? [])
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map(option => {
                    const { tenantId: _optionTenantId, ...optionRest } = option;
                    return optionRest;
                  }),
                conditions: (question.conditions ?? []).map(condition => {
                  const { tenantId: _conditionTenantId, ...conditionRest } = condition;
                  return conditionRest;
                }),
              };
            }),
        };
      }) as FeedbackForm['sections'];
    return form;
  }

  async create(data: CreateFeedbackFormDto & { branchId: string | null }, createdBy: string): Promise<FeedbackForm> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const form = this.formRepo.create({
      branchId: data.branchId,
      name: data.name,
      description: data.description ?? null,
      language: data.language ?? 'en',
      status: 'DRAFT',
      createdBy,
      tenantId,
    });
    const saved = await this.formRepo.save(form);
    await this.auditService.log({
      entityType: 'feedback_form', entityId: saved.id, action: 'CREATE',
      changedBy: createdBy, branchId: saved.branchId, summary: `Created form "${saved.name}"`,
    });
    return saved;
  }

  async update(id: string, dto: UpdateFeedbackFormDto, updatedBy: string): Promise<FeedbackForm> {
    const form = await this._findOrThrow(id);
    this._assertEditable(form);
    if (dto.name !== undefined) form.name = dto.name;
    if (dto.description !== undefined) form.description = dto.description;
    if (dto.language !== undefined) form.language = dto.language;
    form.updatedBy = updatedBy;
    const saved = await this.formRepo.save(form);
    await this.auditService.log({
      entityType: 'feedback_form', entityId: id, action: 'UPDATE',
      changedBy: updatedBy, branchId: saved.branchId, summary: `Updated form "${saved.name}"`,
    });
    return saved;
  }

  async remove(id: string): Promise<void> {
    const form = await this._findOrThrow(id);
    this._assertEditable(form, 'deleting');
    await this.formRepo.remove(form);
    await this.auditService.log({
      entityType: 'feedback_form', entityId: id, action: 'DELETE',
      changedBy: 'unknown', branchId: form.branchId, summary: `Deleted form "${form.name}"`,
    });
  }

  /**
   * Validates the form has real, well-formed content, then flips it live.
   * Per-type validation lives here (not on question create/update) so a
   * builder can freely leave a question half-configured mid-edit -- the
   * gate is only enforced at the moment a form actually goes live for
   * patients to fill out.
   */
  async publish(id: string, updatedBy: string): Promise<FeedbackForm> {
    const form = await this.findOne(id);
    const allQuestions = (form.sections ?? []).flatMap(s => s.questions ?? []);

    if (allQuestions.length === 0) {
      throw new BadRequestException('Add at least one section with a question before publishing');
    }
    for (const question of allQuestions) {
      if (!question.questionText?.trim()) {
        throw new BadRequestException('Every question must have question text before publishing');
      }
      if (OPTION_BASED_QUESTION_TYPES.has(question.questionType) && (question.options ?? []).length < 2) {
        throw new BadRequestException(
          `Question "${question.questionText.slice(0, 60)}" (${question.questionType}) needs at least 2 options before publishing`,
        );
      }
    }

    form.status = 'PUBLISHED';
    form.publishedAt = new Date();
    form.updatedBy = updatedBy;
    const saved = await this.formRepo.save(form);
    await this.auditService.log({
      entityType: 'feedback_form', entityId: id, action: 'PUBLISH',
      changedBy: updatedBy, branchId: saved.branchId, summary: `Published form "${saved.name}"`,
    });
    return saved;
  }

  async unpublish(id: string, updatedBy: string): Promise<FeedbackForm> {
    const form = await this._findOrThrow(id);
    form.status = 'DRAFT';
    form.publishedAt = null;
    form.updatedBy = updatedBy;
    const saved = await this.formRepo.save(form);
    await this.auditService.log({
      entityType: 'feedback_form', entityId: id, action: 'UNPUBLISH',
      changedBy: updatedBy, branchId: saved.branchId, summary: `Unpublished form "${saved.name}"`,
    });
    return saved;
  }

  async archive(id: string, updatedBy: string): Promise<FeedbackForm> {
    const form = await this._findOrThrow(id);
    form.status = 'ARCHIVED';
    form.updatedBy = updatedBy;
    const saved = await this.formRepo.save(form);
    await this.auditService.log({
      entityType: 'feedback_form', entityId: id, action: 'ARCHIVE',
      changedBy: updatedBy, branchId: saved.branchId, summary: `Archived form "${saved.name}"`,
    });
    return saved;
  }

  /**
   * Deep-clones a form (sections, questions, options, conditions) as a new
   * DRAFT. Conditions reference other questions by id (source_question_id),
   * so cloning has to happen in two passes: first clone every question and
   * remember old-id -> new-id, then clone conditions remapped through that
   * table -- otherwise a cloned condition would silently point at the
   * *original* form's questions instead of the clone's.
   */
  async clone(id: string, createdBy: string): Promise<FeedbackForm> {
    const source = await this.findOne(id);

    // Stage B (Checkpoint B6) — resolved once here and reused for every
    // nested create below (form, sections, questions, options, conditions)
    // rather than re-resolved per row.
    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    const clonedForm = await this.formRepo.save(this.formRepo.create({
      branchId: source.branchId,
      name: `${source.name} (Copy)`,
      description: source.description,
      language: source.language,
      status: 'DRAFT',
      createdBy,
      headerImageUrl: source.headerImageUrl,
      headerImageType: source.headerImageType,
      splashImageUrl: source.splashImageUrl,
      splashDurationSeconds: source.splashDurationSeconds,
      tenantId,
    }));

    const questionIdMap = new Map<string, string>();
    const pendingConditions: { newQuestionId: string; original: FeedbackQuestionCondition }[] = [];

    for (const section of source.sections ?? []) {
      const clonedSection = await this.sectionRepo.save(this.sectionRepo.create({
        formId: clonedForm.id,
        title: section.title,
        description: section.description,
        displayOrder: section.displayOrder,
        tenantId,
      }));

      for (const question of section.questions ?? []) {
        const clonedQuestion = await this.questionRepo.save(this.questionRepo.create({
          formId: clonedForm.id,
          sectionId: clonedSection.id,
          questionType: question.questionType,
          questionText: question.questionText,
          helpText: question.helpText,
          placeholder: question.placeholder,
          isRequired: question.isRequired,
          displayOrder: question.displayOrder,
          minLength: question.minLength,
          maxLength: question.maxLength,
          defaultValue: question.defaultValue,
          config: question.config,
          tenantId,
        }));
        questionIdMap.set(question.id, clonedQuestion.id);

        for (const option of question.options ?? []) {
          await this.optionRepo.save(this.optionRepo.create({
            questionId: clonedQuestion.id,
            label: option.label,
            value: option.value,
            displayOrder: option.displayOrder,
            tenantId,
          }));
        }

        for (const condition of question.conditions ?? []) {
          pendingConditions.push({ newQuestionId: clonedQuestion.id, original: condition });
        }
      }
    }

    for (const { newQuestionId, original } of pendingConditions) {
      const newSourceId = questionIdMap.get(original.sourceQuestionId);
      if (!newSourceId) continue; // source question wasn't part of this form (shouldn't happen) -- skip rather than half-clone
      await this.conditionRepo.save(this.conditionRepo.create({
        questionId: newQuestionId,
        sourceQuestionId: newSourceId,
        operator: original.operator,
        comparisonValue: original.comparisonValue,
        action: original.action,
        tenantId,
      }));
    }

    await this.auditService.log({
      entityType: 'feedback_form', entityId: clonedForm.id, action: 'CLONE',
      changedBy: createdBy, branchId: clonedForm.branchId, summary: `Cloned form "${source.name}" -> "${clonedForm.name}"`,
    });

    return this.findOne(clonedForm.id);
  }

  /**
   * Sets/replaces the form's header logo/banner. Deliberately does NOT call
   * assertEditable -- unlike sections/questions/options/conditions, swapping
   * branding doesn't change what a question means or corrupt an in-flight
   * submission, so it's allowed even while the form is PUBLISHED.
   */
  async setHeaderImage(id: string, data: { url: string; type: 'LOGO' | 'BANNER' }, updatedBy: string): Promise<FeedbackForm> {
    const form = await this._findOrThrow(id);
    form.headerImageUrl = data.url;
    form.headerImageType = data.type;
    form.updatedBy = updatedBy;
    const saved = await this.formRepo.save(form);
    await this.auditService.log({
      entityType: 'feedback_form', entityId: id, action: 'UPDATE',
      changedBy: updatedBy, branchId: saved.branchId, summary: `Set header image (${data.type}) on form "${saved.name}"`,
    });
    return saved;
  }

  async removeHeaderImage(id: string, updatedBy: string): Promise<FeedbackForm> {
    const form = await this._findOrThrow(id);
    form.headerImageUrl = null;
    form.headerImageType = null;
    form.updatedBy = updatedBy;
    const saved = await this.formRepo.save(form);
    await this.auditService.log({
      entityType: 'feedback_form', entityId: id, action: 'UPDATE',
      changedBy: updatedBy, branchId: saved.branchId, summary: `Removed header image from form "${saved.name}"`,
    });
    return saved;
  }

  /**
   * Sets/replaces the form's full-screen splash image, shown before the
   * form on the public portal. Same rationale as setHeaderImage for not
   * calling assertEditable -- purely presentational, safe to change on a
   * PUBLISHED form.
   */
  async setSplashImage(id: string, data: { url: string; durationSeconds: number }, updatedBy: string): Promise<FeedbackForm> {
    const form = await this._findOrThrow(id);
    form.splashImageUrl = data.url;
    form.splashDurationSeconds = data.durationSeconds;
    form.updatedBy = updatedBy;
    const saved = await this.formRepo.save(form);
    await this.auditService.log({
      entityType: 'feedback_form', entityId: id, action: 'UPDATE',
      changedBy: updatedBy, branchId: saved.branchId, summary: `Set splash screen (${data.durationSeconds}s) on form "${saved.name}"`,
    });
    return saved;
  }

  async removeSplashImage(id: string, updatedBy: string): Promise<FeedbackForm> {
    const form = await this._findOrThrow(id);
    form.splashImageUrl = null;
    form.splashDurationSeconds = null;
    form.updatedBy = updatedBy;
    const saved = await this.formRepo.save(form);
    await this.auditService.log({
      entityType: 'feedback_form', entityId: id, action: 'UPDATE',
      changedBy: updatedBy, branchId: saved.branchId, summary: `Removed splash screen from form "${saved.name}"`,
    });
    return saved;
  }

  private async _findOrThrow(id: string): Promise<FeedbackForm> {
    const form = await this.scopedFormRepo.findOne({ where: { id } });
    if (!form) throw new NotFoundException(`Feedback form "${id}" not found`);
    return form;
  }

  /**
   * A PUBLISHED form's content is frozen -- once patients may be actively
   * scanning a QR code and filling it out, structural or text edits could
   * corrupt in-flight submissions or silently change what a question meant
   * after the fact. Unpublish (back to DRAFT) is required before any edit;
   * publishing again re-validates and re-stamps `publishedAt`. Exposed as a
   * public method (not private) so FeedbackQuestionService can enforce the
   * exact same rule for section/question/option/condition mutations without
   * duplicating the status check in two places.
   */
  assertEditable(form: FeedbackForm, verb: string = 'editing'): void {
    if (form.status === 'PUBLISHED') {
      throw new ConflictException(`Unpublish this form before ${verb} it`);
    }
  }

  private _assertEditable(form: FeedbackForm, verb: string = 'editing'): void {
    this.assertEditable(form, verb);
  }
}
