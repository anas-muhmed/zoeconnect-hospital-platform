import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeedbackForm } from '../entities/feedback-form.entity';
import { FeedbackSection } from '../entities/feedback-section.entity';
import { FeedbackQuestion } from '../entities/feedback-question.entity';
import { FeedbackQuestionOption } from '../entities/feedback-question-option.entity';
import { FeedbackQuestionCondition } from '../entities/feedback-question-condition.entity';
import { CreateSectionDto, UpdateSectionDto } from '../dto/feedback-section.dto';
import { CreateQuestionDto, UpdateQuestionDto, QuestionOptionInputDto, QuestionConditionInputDto } from '../dto/feedback-question.dto';
import { OPTION_BASED_QUESTION_TYPES } from '../entities/feedback-question-type.enum';
import { FeedbackAuditService } from '../audit/feedback-audit.service';
import { FeedbackFormService } from '../forms/feedback-form.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class FeedbackQuestionService {
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
    private readonly formService: FeedbackFormService,

    /**
     * Stage B (Checkpoint B3.7) — scoped repositories for `_formOrThrow()`/
     * `_sectionOrThrow()`/`_questionOrThrow()` only. All three are private,
     * write-adjacent existence checks reached exclusively from
     * `FeedbackQuestionController`'s routes (which are all writes — this
     * controller has no GET routes at all, form structure is read back via
     * `FeedbackFormService.findOne()`'s nested relations instead), so every
     * call site is session-resolved.
     */
    @Inject(getTenantScopedRepositoryToken(FeedbackForm))
    private readonly scopedFormRepo: TenantScopedRepository<FeedbackForm>,
    @Inject(getTenantScopedRepositoryToken(FeedbackSection))
    private readonly scopedSectionRepo: TenantScopedRepository<FeedbackSection>,
    @Inject(getTenantScopedRepositoryToken(FeedbackQuestion))
    private readonly scopedQuestionRepo: TenantScopedRepository<FeedbackQuestion>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring audit.service.ts's pattern.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // -- Sections -------------------------------------------------------------------

  private async _formOrThrow(formId: string): Promise<FeedbackForm> {
    const form = await this.scopedFormRepo.findOne({ where: { id: formId } });
    if (!form) throw new NotFoundException(`Feedback form "${formId}" not found`);
    return form;
  }

  private async _sectionOrThrow(id: string): Promise<FeedbackSection> {
    const section = await this.scopedSectionRepo.findOne({ where: { id } });
    if (!section) throw new NotFoundException(`Section "${id}" not found`);
    return section;
  }

  private async _questionOrThrow(id: string): Promise<FeedbackQuestion> {
    const question = await this.scopedQuestionRepo.findOne({ where: { id } });
    if (!question) throw new NotFoundException(`Question "${id}" not found`);
    return question;
  }

  /** Resolves a section's parent form and enforces the "PUBLISHED forms are frozen" rule (see FeedbackFormService.assertEditable). */
  private async _formForSection(section: FeedbackSection, verb: string): Promise<FeedbackForm> {
    const form = await this._formOrThrow(section.formId);
    this.formService.assertEditable(form, verb);
    return form;
  }

  private async _formForQuestion(question: FeedbackQuestion, verb: string): Promise<FeedbackForm> {
    const form = await this._formOrThrow(question.formId);
    this.formService.assertEditable(form, verb);
    return form;
  }

  async createSection(formId: string, dto: CreateSectionDto, changedBy: string): Promise<FeedbackSection> {
    const form = await this._formOrThrow(formId);
    this.formService.assertEditable(form, 'editing');
    let displayOrder = dto.displayOrder;
    if (displayOrder === undefined) {
      const count = await this.sectionRepo.count({ where: { formId } });
      displayOrder = count;
    }
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const section = this.sectionRepo.create({
      formId,
      title: dto.title,
      description: dto.description ?? null,
      displayOrder,
      tenantId,
    });
    const saved = await this.sectionRepo.save(section);
    await this.auditService.log({
      entityType: 'feedback_section', entityId: saved.id, action: 'CREATE',
      changedBy, branchId: form.branchId, summary: `Added section "${saved.title}" to form "${form.name}"`,
    });
    return saved;
  }

  async updateSection(id: string, dto: UpdateSectionDto, changedBy: string): Promise<FeedbackSection> {
    const section = await this._sectionOrThrow(id);
    const form = await this._formForSection(section, 'editing');
    if (dto.title !== undefined) section.title = dto.title;
    if (dto.description !== undefined) section.description = dto.description;
    if (dto.displayOrder !== undefined) section.displayOrder = dto.displayOrder;
    const saved = await this.sectionRepo.save(section);
    await this.auditService.log({
      entityType: 'feedback_section', entityId: id, action: 'UPDATE',
      changedBy, branchId: form.branchId, summary: `Updated section "${saved.title}"`,
    });
    return saved;
  }

  async removeSection(id: string, changedBy: string): Promise<void> {
    const section = await this._sectionOrThrow(id);
    const form = await this._formForSection(section, 'editing');
    await this.sectionRepo.remove(section);
    await this.auditService.log({
      entityType: 'feedback_section', entityId: id, action: 'DELETE',
      changedBy, branchId: form.branchId, summary: `Deleted section "${section.title}" from form "${form.name}"`,
    });
  }

  async reorderSections(formId: string, sectionIds: string[], changedBy: string): Promise<void> {
    const form = await this._formOrThrow(formId);
    this.formService.assertEditable(form, 'editing');
    await Promise.all(sectionIds.map((id, index) =>
      this.sectionRepo.update({ id, formId }, { displayOrder: index }),
    ));
    await this.auditService.log({
      entityType: 'feedback_form', entityId: formId, action: 'UPDATE',
      changedBy, branchId: form.branchId, summary: `Reordered sections on form "${form.name}"`,
    });
  }

  // -- Questions --------------------------------------------------------------------

  async createQuestion(sectionId: string, dto: CreateQuestionDto, changedBy: string): Promise<FeedbackQuestion> {
    const section = await this._sectionOrThrow(sectionId);
    const form = await this._formForSection(section, 'editing');
    let displayOrder = dto.displayOrder;
    if (displayOrder === undefined) {
      const count = await this.questionRepo.count({ where: { sectionId } });
      displayOrder = count;
    }
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const question = this.questionRepo.create({
      formId: section.formId,
      sectionId,
      questionType: dto.questionType,
      questionText: dto.questionText,
      helpText: dto.helpText ?? null,
      placeholder: dto.placeholder ?? null,
      isRequired: dto.isRequired ?? false,
      displayOrder,
      minLength: dto.minLength ?? null,
      maxLength: dto.maxLength ?? null,
      defaultValue: dto.defaultValue ?? null,
      config: dto.config ?? null,
      tenantId,
    });
    const saved = await this.questionRepo.save(question);
    await this.auditService.log({
      entityType: 'feedback_question', entityId: saved.id, action: 'CREATE',
      changedBy, branchId: form.branchId, summary: `Added question "${saved.questionText.slice(0, 60)}" to section "${section.title}"`,
    });
    return saved;
  }

  async updateQuestion(id: string, dto: UpdateQuestionDto, changedBy: string): Promise<FeedbackQuestion> {
    const question = await this._questionOrThrow(id);
    const form = await this._formForQuestion(question, 'editing');
    if (dto.questionType !== undefined) question.questionType = dto.questionType;
    if (dto.questionText !== undefined) question.questionText = dto.questionText;
    if (dto.helpText !== undefined) question.helpText = dto.helpText;
    if (dto.placeholder !== undefined) question.placeholder = dto.placeholder;
    if (dto.isRequired !== undefined) question.isRequired = dto.isRequired;
    if (dto.displayOrder !== undefined) question.displayOrder = dto.displayOrder;
    if (dto.minLength !== undefined) question.minLength = dto.minLength;
    if (dto.maxLength !== undefined) question.maxLength = dto.maxLength;
    if (dto.defaultValue !== undefined) question.defaultValue = dto.defaultValue;
    if (dto.config !== undefined) question.config = dto.config;
    const saved = await this.questionRepo.save(question);
    await this.auditService.log({
      entityType: 'feedback_question', entityId: id, action: 'UPDATE',
      changedBy, branchId: form.branchId, summary: `Updated question "${saved.questionText.slice(0, 60)}"`,
    });
    return saved;
  }

  async removeQuestion(id: string, changedBy: string): Promise<void> {
    const question = await this._questionOrThrow(id);
    const form = await this._formForQuestion(question, 'editing');
    await this.questionRepo.remove(question);
    await this.auditService.log({
      entityType: 'feedback_question', entityId: id, action: 'DELETE',
      changedBy, branchId: form.branchId, summary: `Deleted question "${question.questionText.slice(0, 60)}"`,
    });
  }

  async reorderQuestions(sectionId: string, questionIds: string[], changedBy: string): Promise<void> {
    const section = await this._sectionOrThrow(sectionId);
    const form = await this._formForSection(section, 'editing');
    await Promise.all(questionIds.map((id, index) =>
      this.questionRepo.update({ id, sectionId }, { displayOrder: index }),
    ));
    await this.auditService.log({
      entityType: 'feedback_section', entityId: sectionId, action: 'UPDATE',
      changedBy, branchId: form.branchId, summary: `Reordered questions in section "${section.title}"`,
    });
  }

  // -- Options (whole-list replace, see SetQuestionOptionsDto doc comment) ----------

  async setOptions(questionId: string, options: QuestionOptionInputDto[], changedBy: string): Promise<FeedbackQuestionOption[]> {
    const question = await this._questionOrThrow(questionId);
    const form = await this._formForQuestion(question, 'editing');
    if (!OPTION_BASED_QUESTION_TYPES.has(question.questionType)) {
      throw new BadRequestException(`Question type "${question.questionType}" does not support options`);
    }

    const existing = await this.optionRepo.find({ where: { questionId } });
    const keptIds = new Set(options.filter(o => o.id).map(o => o.id as string));
    const toDelete = existing.filter(o => !keptIds.has(o.id));
    if (toDelete.length > 0) await this.optionRepo.remove(toDelete);

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const saved: FeedbackQuestionOption[] = [];
    for (let index = 0; index < options.length; index++) {
      const input = options[index];
      const entity = input.id
        ? existing.find(o => o.id === input.id) ?? this.optionRepo.create({ questionId, tenantId })
        : this.optionRepo.create({ questionId, tenantId });
      entity.label = input.label;
      entity.value = input.value;
      entity.displayOrder = input.displayOrder ?? index;
      saved.push(await this.optionRepo.save(entity));
    }

    await this.auditService.log({
      entityType: 'feedback_question', entityId: questionId, action: 'UPDATE',
      changedBy, branchId: form.branchId, summary: `Set ${saved.length} option(s) on question "${question.questionText.slice(0, 60)}"`,
    });
    return saved;
  }

  // -- Conditions (whole-list replace) ------------------------------------------------

  async setConditions(questionId: string, conditions: QuestionConditionInputDto[], changedBy: string): Promise<FeedbackQuestionCondition[]> {
    const question = await this._questionOrThrow(questionId);
    const form = await this._formForQuestion(question, 'editing');

    for (const c of conditions) {
      if (c.sourceQuestionId === questionId) {
        throw new BadRequestException('A question cannot have a condition that depends on itself');
      }
    }

    const existing = await this.conditionRepo.find({ where: { questionId } });
    const keptIds = new Set(conditions.filter(c => c.id).map(c => c.id as string));
    const toDelete = existing.filter(c => !keptIds.has(c.id));
    if (toDelete.length > 0) await this.conditionRepo.remove(toDelete);

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const saved: FeedbackQuestionCondition[] = [];
    for (const input of conditions) {
      const entity = input.id
        ? existing.find(c => c.id === input.id) ?? this.conditionRepo.create({ questionId: question.id, tenantId })
        : this.conditionRepo.create({ questionId: question.id, tenantId });
      entity.sourceQuestionId = input.sourceQuestionId;
      entity.operator = input.operator;
      entity.comparisonValue = input.comparisonValue;
      entity.action = input.action ?? 'SHOW';
      saved.push(await this.conditionRepo.save(entity));
    }

    await this.auditService.log({
      entityType: 'feedback_question', entityId: questionId, action: 'UPDATE',
      changedBy, branchId: form.branchId, summary: `Set ${saved.length} condition(s) on question "${question.questionText.slice(0, 60)}"`,
    });
    return saved;
  }
}
