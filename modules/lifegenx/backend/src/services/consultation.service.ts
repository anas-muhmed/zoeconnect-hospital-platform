import { prisma } from '../config/db';
import { CreateConsultationInput } from '../validators/consultation.validator';

export interface ConsultationFilterOptions {
  search?: string;
  doctorName?: string;
  patientName?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export async function createConsultationRecord(doctorId: string, data: CreateConsultationInput) {
  return await prisma.consultation.create({
    data: {
      patientName: data.patientName || 'Anonymous Patient',
      patientAge: data.patientAge ?? null,
      patientGender: data.patientGender || 'Unspecified',
      audioPath: data.audioPath ?? null,
      audioFileName: data.audioFileName ?? null,
      duration: data.duration ?? null,
      transcript: data.transcript,
      symptoms: JSON.stringify(data.symptoms || []),
      observations: JSON.stringify(data.observations || []),
      diagnoses: JSON.stringify(data.diagnoses || []),
      doctorId
    },
    include: {
      doctor: {
        select: {
          id: true,
          name: true,
          email: true,
          department: true
        }
      }
    }
  });
}

export async function getConsultationsList(options: ConsultationFilterOptions) {
  const page = options.page || 1;
  const limit = options.limit || 10;
  const skip = (page - 1) * limit;

  const where: any = {};

  if (options.search) {
    where.OR = [
      { patientName: { contains: options.search } },
      { transcript: { contains: options.search } },
      { symptoms: { contains: options.search } },
      { diagnoses: { contains: options.search } }
    ];
  }

  if (options.patientName) {
    where.patientName = { contains: options.patientName };
  }

  if (options.doctorName) {
    where.doctor = {
      name: { contains: options.doctorName }
    };
  }

  if (options.startDate || options.endDate) {
    where.createdAt = {};
    if (options.startDate) {
      where.createdAt.gte = new Date(options.startDate);
    }
    if (options.endDate) {
      where.createdAt.lte = new Date(options.endDate);
    }
  }

  const [total, items] = await Promise.all([
    prisma.consultation.count({ where }),
    prisma.consultation.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            email: true,
            department: true
          }
        }
      }
    })
  ]);

  const parsedItems = items.map((item) => ({
    ...item,
    symptoms: JSON.parse(item.symptoms || '[]'),
    observations: JSON.parse(item.observations || '[]'),
    diagnoses: JSON.parse(item.diagnoses || '[]')
  }));

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    consultations: parsedItems
  };
}

export async function getConsultationById(id: string) {
  const item = await prisma.consultation.findUnique({
    where: { id },
    include: {
      doctor: {
        select: {
          id: true,
          name: true,
          email: true,
          department: true
        }
      }
    }
  });

  if (!item) return null;

  return {
    ...item,
    symptoms: JSON.parse(item.symptoms || '[]'),
    observations: JSON.parse(item.observations || '[]'),
    diagnoses: JSON.parse(item.diagnoses || '[]')
  };
}

export async function getDashboardMetrics() {
  const totalConsultations = await prisma.consultation.count();
  
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayDiagnoses = await prisma.consultation.count({
    where: {
      createdAt: { gte: todayStart }
    }
  });

  const todayAudioUploaded = await prisma.consultation.count({
    where: {
      createdAt: { gte: todayStart },
      audioPath: { not: null }
    }
  });

  const recentConsultations = await prisma.consultation.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      doctor: {
        select: {
          name: true,
          department: true
        }
      }
    }
  });

  return {
    totalConsultations,
    todayDiagnoses,
    todayAudioUploaded,
    recentConsultations: recentConsultations.map((item) => ({
      ...item,
      symptoms: JSON.parse(item.symptoms || '[]'),
      diagnoses: JSON.parse(item.diagnoses || '[]')
    }))
  };
}
