import { z } from 'zod';

export const transcribeSchema = z.object({
  audioId: z.string().min(1, 'Audio ID is required'),
  language: z.enum(['english', 'malayalam']).optional().default('english')
});

export const extractSymptomsSchema = z.object({
  transcript: z.string().min(5, 'Transcript text must be at least 5 characters long')
});

export const diagnosisSchema = z.object({
  symptoms: z.array(z.string()).min(1, 'At least one symptom is required'),
  observations: z.array(z.string()).optional().default([])
});

export const zoiBotSchema = z.object({
  userInput: z.string().min(1, 'Input prompt is required')
});

