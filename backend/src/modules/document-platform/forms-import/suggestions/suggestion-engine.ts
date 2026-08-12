import { Injectable } from '@nestjs/common';
import { ClassifiedField, FormSuggestion } from '../entities/import-job.entity';

const HOSPITAL_DEPT_OPTIONS = [
  'Emergency', 'ICU', 'General Ward', 'Paediatrics', 'Obstetrics', 'Orthopaedics',
  'Cardiology', 'Neurology', 'Oncology', 'Radiology', 'Pharmacy', 'Laboratory',
  'Physiotherapy', 'Psychiatry', 'ENT', 'Ophthalmology', 'Dermatology',
];

const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

/**
 * SuggestionEngine — post-processing pass after schema generation.
 *
 * Generates actionable suggestions the user can Accept or Reject in Review Mode:
 *  - Required field suggestions (name, date, id fields)
 *  - Validation patterns (date format, phone regex, MRN format)
 *  - Dropdown options (department, blood group, ward, etc.)
 *  - Field type adjustments (if confidence < 0.7, suggest alternative type)
 *  - Lookup suggestions (doctor, patient, ICD code lookups)
 */
@Injectable()
export class SuggestionEngine {
  generate(fields: ClassifiedField[]): FormSuggestion[] {
    const suggestions: FormSuggestion[] = [];
    let seq = 0;
    const id = () => `sug-${++seq}`;

    for (const field of fields) {
      const label = field.label.toLowerCase();

      // ── Required field suggestions ──────────────────────────────────────
      if (/\b(patient name|name|date|id|number|mrn|uhid)\b/.test(label)) {
        suggestions.push({
          id: id(),
          fieldKey: field.fieldKey,
          suggestionType: 'required',
          suggestedValue: true,
          reason: `"${field.label}" is typically a mandatory field.`,
          accepted: null,
        });
      }

      // ── Validation patterns ─────────────────────────────────────────────
      if (/\b(date|dob|date of birth)\b/.test(label)) {
        suggestions.push({
          id: id(),
          fieldKey: field.fieldKey,
          suggestionType: 'validation',
          suggestedValue: { pattern: '^\\d{2}/\\d{2}/\\d{4}$', message: 'Enter date as DD/MM/YYYY' },
          reason: 'Date fields should have a format validation.',
          accepted: null,
        });
      }

      if (/\b(phone|mobile|contact)\b/.test(label)) {
        suggestions.push({
          id: id(),
          fieldKey: field.fieldKey,
          suggestionType: 'validation',
          suggestedValue: { pattern: '^[0-9]{10,15}$', message: 'Enter a valid phone number' },
          reason: 'Phone number fields should have numeric length validation.',
          accepted: null,
        });
      }

      // ── Dropdown options ────────────────────────────────────────────────
      if (field.componentType === 'dropdown') {
        if (/\b(department|ward)\b/.test(label)) {
          suggestions.push({
            id: id(),
            fieldKey: field.fieldKey,
            suggestionType: 'options',
            suggestedValue: HOSPITAL_DEPT_OPTIONS,
            reason: 'Standard hospital department list.',
            accepted: null,
          });
        }
        if (/blood group/.test(label)) {
          suggestions.push({
            id: id(),
            fieldKey: field.fieldKey,
            suggestionType: 'options',
            suggestedValue: BLOOD_GROUP_OPTIONS,
            reason: 'Standard ABO blood group options.',
            accepted: null,
          });
        }
      }

      // ── Lookup suggestions ──────────────────────────────────────────────
      if (/\b(doctor|physician|consultant|referred by)\b/.test(label)) {
        suggestions.push({
          id: id(),
          fieldKey: field.fieldKey,
          suggestionType: 'lookup',
          suggestedValue: { source: 'doctors', displayField: 'name', valueField: 'id' },
          reason: 'Doctor name fields benefit from a staff directory lookup.',
          accepted: null,
        });
      }

      if (/\b(patient|mrn|uhid)\b/.test(label)) {
        suggestions.push({
          id: id(),
          fieldKey: field.fieldKey,
          suggestionType: 'lookup',
          suggestedValue: { source: 'patients', displayField: 'name', valueField: 'mrn' },
          reason: 'Patient ID fields benefit from a patient registry lookup.',
          accepted: null,
        });
      }

      if (/\b(icd|diagnosis code|disease code)\b/.test(label)) {
        suggestions.push({
          id: id(),
          fieldKey: field.fieldKey,
          suggestionType: 'lookup',
          suggestedValue: { source: 'icd10', displayField: 'description', valueField: 'code' },
          reason: 'Diagnosis fields can link to the ICD-10 code lookup.',
          accepted: null,
        });
      }

      // ── Field type adjustment for low-confidence fields ─────────────────
      if (field.needsReview && field.alternativeSuggestions && field.alternativeSuggestions.length > 0) {
        const bestAlt = field.alternativeSuggestions[0];
        suggestions.push({
          id: id(),
          fieldKey: field.fieldKey,
          suggestionType: 'fieldType',
          suggestedValue: bestAlt.componentType,
          reason: `The classifier is uncertain (confidence: ${(field.confidence * 100).toFixed(0)}%). Consider "${bestAlt.componentType}" as an alternative.`,
          accepted: null,
        });
      }
    }

    return suggestions;
  }
}
