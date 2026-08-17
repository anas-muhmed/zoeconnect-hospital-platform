import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const doctor = await prisma.user.upsert({
    where: { email: 'doctor@hospital.com' },
    update: {},
    create: {
      email: 'doctor@hospital.com',
      passwordHash,
      name: 'Dr. Thomas, MD',
      role: 'DOCTOR',
      department: 'Cardiology'
    }
  });

  console.log('Seeded primary doctor account:', doctor.email);

  // Seed sample consultation
  const existingConsultations = await prisma.consultation.count();
  if (existingConsultations === 0) {
    await prisma.consultation.create({
      data: {
        patientName: 'Robert Vance',
        patientAge: 58,
        patientGender: 'Male',
        duration: '02:45',
        transcript:
          "Doctor: Good morning Mr. Vance. What symptoms bring you to the clinic today?\n" +
          "Patient: I've had a severe persistent fever (102°F) and dry hacking cough for 4 days, with intense pressure headaches and chest discomfort.\n" +
          "Doctor: Do you have a history of smoking or chronic illnesses?\n" +
          "Patient: Yes, diabetic for 8 years, and I smoke occasionally. No drug allergies.",
        symptoms: JSON.stringify(['High Fever', 'Dry Cough', 'Pounding Headache', 'Chest Discomfort', 'Fatigue']),
        observations: JSON.stringify([
          'Age: 58',
          'Male',
          'Type 2 Diabetes (8 years)',
          'Occasional Smoker',
          'No known allergies'
        ]),
        diagnoses: JSON.stringify([
          {
            name: 'Acute Viral Bronchitis / Influenza A Exacerbation',
            confidence: '89%',
            recommendedTests: ['CBC with Differential', 'CRP', 'Influenza A/B Rapid Antigen Test', 'Chest X-Ray PA View']
          },
          {
            name: 'Community-Acquired Pneumonia (CAP)',
            confidence: '62%',
            recommendedTests: ['Procalcitonin Assay', 'Sputum Gram Stain & Culture', 'Pulse Oximetry Monitor']
          },
          {
            name: 'Diabetic Respiratory Complication Risk',
            confidence: '45%',
            recommendedTests: ['HbA1c', 'Comprehensive Metabolic Panel (CMP)']
          }
        ]),
        doctorId: doctor.id
      }
    });
    console.log('Seeded sample consultation record.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
