/**
 * All question types supported by the Feedback Form Builder (Phase 1 spec §2).
 * FILE_UPLOAD / IMAGE_UPLOAD are "future ready" per the spec -- the type exists
 * end-to-end (entity, DTO validation, builder UI question-type picker) but the
 * actual upload/storage wiring is deliberately not implemented yet, matching
 * how CMS deferred video-duration/thumbnail extraction until a real need
 * arose rather than half-building it.
 */
export enum FeedbackQuestionType {
  STAR_RATING = 'STAR_RATING',
  EMOJI_RATING = 'EMOJI_RATING',
  NPS_SCORE = 'NPS_SCORE',
  YES_NO = 'YES_NO',
  RADIO = 'RADIO',
  CHECKBOX = 'CHECKBOX',
  DROPDOWN = 'DROPDOWN',
  MULTI_SELECT = 'MULTI_SELECT',
  SINGLE_LINE_TEXT = 'SINGLE_LINE_TEXT',
  PARAGRAPH = 'PARAGRAPH',
  NUMBER = 'NUMBER',
  DATE = 'DATE',
  TIME = 'TIME',
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
  FILE_UPLOAD = 'FILE_UPLOAD',
  IMAGE_UPLOAD = 'IMAGE_UPLOAD',
}

/** Question types that need an options list (feedback_question_options rows). */
export const OPTION_BASED_QUESTION_TYPES = new Set<FeedbackQuestionType>([
  FeedbackQuestionType.RADIO,
  FeedbackQuestionType.CHECKBOX,
  FeedbackQuestionType.DROPDOWN,
  FeedbackQuestionType.MULTI_SELECT,
]);

export type FeedbackFormStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type FeedbackConditionOperator = 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'CONTAINS';

export type FeedbackConditionAction = 'SHOW' | 'HIDE';
