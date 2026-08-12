import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FeedbackTranslation, FeedbackTranslatableEntityType } from '../entities/feedback-translation.entity';
import { FeedbackLanguage } from '../entities/feedback-language.entity';
import { FeedbackForm } from '../entities/feedback-form.entity';
import { FeedbackFormService } from '../forms/feedback-form.service';
import { TranslationItemDto } from '../dto/feedback-translation.dto';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

export interface TranslatableField {
  entityType: FeedbackTranslatableEntityType;
  entityId: string;
  fieldName: string;
  sourceText: string;
}

export interface TranslatableFieldWithValue extends TranslatableField {
  translatedText: string | null;
}

/**
 * Extracts the fixed set of translatable text fields out of a form's tree,
 * and reads/writes the (entity, field, language) -> text rows that
 * override them for a given language. Deliberately doesn't touch
 * questions' `config` jsonb (e.g. NPS scale endpoint labels) -- that's a
 * reasonable follow-up, scoped out here to keep the translatable surface
 * to the fields every question type actually has.
 */
@Injectable()
export class FeedbackTranslationService {
  constructor(
    @InjectRepository(FeedbackTranslation)
    private readonly translationRepo: Repository<FeedbackTranslation>,
    @InjectRepository(FeedbackLanguage)
    private readonly languageRepo: Repository<FeedbackLanguage>,
    private readonly formService: FeedbackFormService,

    /**
     * Stage B (Checkpoint B3.7) — scoped repository for `getFieldsForLanguage()`
     * only (session-resolved-only, `FeedbackTranslationController`). `getAvailableLanguages()`
     * (shared with the anonymous `resolve()` chain) and `applyTranslations()`
     * (chain-only) stay raw — both chain-resolved, deferred to B5.
     * `upsertTranslations()` (a write) is unaffected.
     */
    @Inject(getTenantScopedRepositoryToken(FeedbackTranslation))
    private readonly scopedTranslationRepo: TenantScopedRepository<FeedbackTranslation>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring audit.service.ts's pattern.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  /** Walks a resolved form tree (see FeedbackFormService.findOne) and lists every field that can be translated, with its current source text. */
  extractTranslatableFields(form: FeedbackForm): TranslatableField[] {
    const fields: TranslatableField[] = [];
    fields.push({ entityType: 'FORM', entityId: form.id, fieldName: 'name', sourceText: form.name });
    if (form.description) fields.push({ entityType: 'FORM', entityId: form.id, fieldName: 'description', sourceText: form.description });

    for (const section of form.sections ?? []) {
      fields.push({ entityType: 'SECTION', entityId: section.id, fieldName: 'title', sourceText: section.title });
      if (section.description) fields.push({ entityType: 'SECTION', entityId: section.id, fieldName: 'description', sourceText: section.description });

      for (const question of section.questions ?? []) {
        fields.push({ entityType: 'QUESTION', entityId: question.id, fieldName: 'questionText', sourceText: question.questionText });
        if (question.helpText) fields.push({ entityType: 'QUESTION', entityId: question.id, fieldName: 'helpText', sourceText: question.helpText });
        if (question.placeholder) fields.push({ entityType: 'QUESTION', entityId: question.id, fieldName: 'placeholder', sourceText: question.placeholder });

        for (const option of question.options ?? []) {
          fields.push({ entityType: 'OPTION', entityId: option.id, fieldName: 'label', sourceText: option.label });
        }
      }
    }
    return fields;
  }

  /** For the builder's translation editor: every translatable field alongside whatever's already saved for `languageCode` (null if untranslated yet). */
  async getFieldsForLanguage(formId: string, languageCode: string): Promise<TranslatableFieldWithValue[]> {
    const form = await this.formService.findOne(formId);
    const fields = this.extractTranslatableFields(form);

    const existing = await this.scopedTranslationRepo.find({ where: { formId, languageCode } });
    const byKey = new Map(existing.map(t => [`${t.entityType}:${t.entityId}:${t.fieldName}`, t.value]));

    return fields.map(f => ({
      ...f,
      translatedText: byKey.get(`${f.entityType}:${f.entityId}:${f.fieldName}`) ?? null,
    }));
  }

  /** Upserts a batch of translated fields for one form/language. An empty-string value is saved as-is (clears back to source at read time is a display-layer choice, not deleted here) so a builder can intentionally blank a field without it silently reverting. */
  async upsertTranslations(formId: string, languageCode: string, items: TranslationItemDto[]): Promise<void> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    for (const item of items) {
      const existing = await this.translationRepo.findOne({
        where: { formId, entityType: item.entityType, entityId: item.entityId, fieldName: item.fieldName, languageCode },
      });
      if (existing) {
        existing.value = item.value;
        await this.translationRepo.save(existing);
      } else {
        await this.translationRepo.save(this.translationRepo.create({
          formId, entityType: item.entityType, entityId: item.entityId, fieldName: item.fieldName, languageCode, value: item.value,
          tenantId,
        }));
      }
    }
  }

  /** Languages actually usable on the public portal for this form: its own authored language, plus any language with at least one saved translation for it, filtered to still-active entries in the global pool. */
  async getAvailableLanguages(form: FeedbackForm): Promise<{ code: string; name: string }[]> {
    const translatedRows = await this.translationRepo
      .createQueryBuilder('t')
      .select('DISTINCT t.language_code', 'languageCode')
      .where('t.form_id = :formId', { formId: form.id })
      .getRawMany<{ languageCode: string }>();
    const codes = new Set([form.language, ...translatedRows.map(r => r.languageCode)]);

    const languages = await this.languageRepo.find({ where: { code: In([...codes]), isActive: true } });
    const languageByCode = new Map(languages.map(l => [l.code, l]));

    // The form's own base language is always offered even if it's not (or no longer) in the active pool --
    // it's the text that already lives directly on the form/section/question rows, not a translation row.
    const result: { code: string; name: string }[] = [];
    if (!languageByCode.has(form.language)) {
      result.push({ code: form.language, name: form.language.toUpperCase() });
    }
    for (const code of codes) {
      const lang = languageByCode.get(code);
      if (lang) result.push({ code: lang.code, name: lang.name });
    }
    return result;
  }

  /**
   * Deep-overlays translated text onto a resolved form tree for
   * `languageCode`, falling back to the original text field-by-field where
   * no translation was saved. Returns a new object -- never mutates the
   * tree passed in, since FeedbackFormService.findOne's result may be
   * reused elsewhere (e.g. the admin builder calling the same method).
   */
  async applyTranslations(form: FeedbackForm, languageCode: string): Promise<FeedbackForm> {
    if (languageCode === form.language) return form;

    const rows = await this.translationRepo.find({ where: { formId: form.id, languageCode } });
    if (rows.length === 0) return form;
    const byKey = new Map(rows.map(r => [`${r.entityType}:${r.entityId}:${r.fieldName}`, r.value]));
    const get = (type: FeedbackTranslatableEntityType, id: string, field: string, fallback: string) =>
      byKey.get(`${type}:${id}:${field}`) ?? fallback;

    return {
      ...form,
      name: get('FORM', form.id, 'name', form.name),
      description: form.description ? get('FORM', form.id, 'description', form.description) : form.description,
      sections: (form.sections ?? []).map(section => ({
        ...section,
        title: get('SECTION', section.id, 'title', section.title),
        description: section.description ? get('SECTION', section.id, 'description', section.description) : section.description,
        questions: (section.questions ?? []).map(question => ({
          ...question,
          questionText: get('QUESTION', question.id, 'questionText', question.questionText),
          helpText: question.helpText ? get('QUESTION', question.id, 'helpText', question.helpText) : question.helpText,
          placeholder: question.placeholder ? get('QUESTION', question.id, 'placeholder', question.placeholder) : question.placeholder,
          options: (question.options ?? []).map(option => ({
            ...option,
            label: get('OPTION', option.id, 'label', option.label),
          })),
        })),
      })),
    };
  }
}
