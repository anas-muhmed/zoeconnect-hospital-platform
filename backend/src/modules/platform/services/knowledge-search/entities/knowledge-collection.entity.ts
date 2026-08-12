export class KnowledgeCollectionEntity {
  id: string; // e.g. 'hospital-policies'
  name: string; // e.g. 'Hospital Policies'
  description: string;
  category: 'CLINICAL_GUIDELINES' | 'SOPS' | 'PATIENT_EDUCATION' | 'REFERENCE' | 'ADMINISTRATIVE';
  tenantId?: string; // Optional: specific to a hospital/tenant
  departmentId?: string;
  governancePolicyId?: string;
  isActive: boolean;
}
