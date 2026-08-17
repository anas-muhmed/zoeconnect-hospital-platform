import { z } from 'zod';

export const createConsultationSchema = z.object({
  patientName: z.string().optional().default('Anonymous Patient'),
  patientAge: z.number().optional(),
  patientGender: z.string().optional(),
  audioPath: z.string().optional(),
  audioFileName: z.string().optional(),
  duration: z.string().optional(),
  transcript: z.string().min(1, 'Transcript is required'),
  symptoms: z.array(z.string()).default([]),
  observations: z.array(z.string()).default([]),
  diagnoses: z.array(
    z.object({
      name: z.string(),
      confidence: z.string(),
      recommendedTests: z.array(z.string())
    })
  ).default([])
});

export type CreateConsultationInput = z.infer<typeof createConsultationSchema>;
