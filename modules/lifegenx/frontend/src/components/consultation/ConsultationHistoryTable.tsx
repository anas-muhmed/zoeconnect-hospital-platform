import React, { useState } from 'react';
import { Search, User, Eye, Stethoscope, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { PDFExporter } from './PDFExporter';
import { ConsultationRecord } from '../../types';
import { formatDate } from '../../lib/utils';
import { consultationService } from '../../services/consultationService';

export function ConsultationHistoryTable() {
  const [searchTerm, setSearchTerm] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('');
  const [patientFilter, setPatientFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedConsultation, setSelectedConsultation] = useState<ConsultationRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [consultations, setConsultations] = useState<ConsultationRecord[]>([
    {
      id: 'demo-c1',
      patientName: 'Robert Vance',
      patientAge: 58,
      patientGender: 'Male',
      duration: '02:45',
      transcript:
        "Doctor: Good morning Mr. Vance. What symptoms bring you to the clinic today?\nPatient: I've had a severe persistent fever (102°F) and dry hacking cough for 4 days, with intense pressure headaches.\nDoctor: Any chest pain or diabetes history?\nPatient: No chest pain, but diabetic for 8 years and I smoke occasionally.",
      symptoms: ['High Fever', 'Dry Cough', 'Headache', 'Fatigue'],
      observations: ['Age: 58', 'Male', 'Type 2 Diabetes', 'Occasional Smoker'],
      diagnoses: [
        { name: 'Acute Viral Bronchitis / Influenza A', confidence: '89%', recommendedTests: ['CBC', 'CRP', 'Influenza Swab'] },
        { name: 'Community-Acquired Pneumonia (CAP)', confidence: '62%', recommendedTests: ['Chest X-Ray', 'Pulse Oximetry'] }
      ],
      doctorId: 'd1',
      doctor: { id: 'd1', name: 'Dr. Sarah Jenkins', email: 'doctor@hospital.com', department: 'General Internal Medicine' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ]);

  const [total, setTotal] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  React.useEffect(() => {
    consultationService.getConsultations({ search: searchTerm, doctorName: doctorFilter, patientName: patientFilter, page, limit: 10 })
      .then((res) => {
        if (res?.consultations?.length) {
          setConsultations(res.consultations);
          setTotal(res.total || 1);
          setTotalPages(res.totalPages || 1);
        }
      }).catch(() => {});
  }, [page, searchTerm, doctorFilter, patientFilter]);

  const handleOpenDetails = (item: ConsultationRecord) => {
    setSelectedConsultation(item);
    setIsModalOpen(true);
  };

  const inputClass = "w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 transition-colors";

  return (
    <div className="space-y-4">
      {/* Search & Filter */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search patient, symptoms, or diagnoses..." className={inputClass} />
          </div>
          <div className="relative">
            <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input type="text" value={patientFilter} onChange={(e) => setPatientFilter(e.target.value)}
              placeholder="Filter by Patient Name..." className={inputClass} />
          </div>
          <div className="relative">
            <Stethoscope className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input type="text" value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}
              placeholder="Filter by Attending Doctor..." className={inputClass} />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-5">Patient</th>
                <th className="py-3 px-5">Date & Time</th>
                <th className="py-3 px-5">Extracted Symptoms</th>
                <th className="py-3 px-5">Primary AI Diagnosis</th>
                <th className="py-3 px-5">Doctor</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {consultations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">No consultation records found.</td>
                </tr>
              ) : (
                consultations.map((item) => {
                  const topDiag = item.diagnoses?.[0];
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-5 font-semibold text-slate-900 dark:text-slate-100">
                        {item.patientName}
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                          {item.patientAge ? `${item.patientAge} Yrs` : ''} {item.patientGender || ''}
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDate(item.createdAt)}</td>
                      <td className="py-3.5 px-5">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {item.symptoms?.slice(0, 3).map((s, i) => (
                            <Badge key={i} variant="teal" size="sm">{s}</Badge>
                          ))}
                          {item.symptoms?.length > 3 && (
                            <span className="text-[10px] text-slate-400 self-center">+{item.symptoms.length - 3} more</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        {topDiag ? (
                          <div>
                            <div className="font-medium text-slate-900 dark:text-slate-200">{topDiag.name}</div>
                            <div className="text-[11px] text-emerald-600 dark:text-emerald-400">Confidence: {topDiag.confidence}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">None generated</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-slate-700 dark:text-slate-300">{item.doctor?.name || 'Dr. Sarah Jenkins'}</td>
                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenDetails(item)} title="View Details">
                            <Eye className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                          </Button>
                          <PDFExporter
                            patientName={item.patientName}
                            patientAge={item.patientAge ? String(item.patientAge) : undefined}
                            patientGender={item.patientGender || undefined}
                            transcript={item.transcript}
                            symptoms={item.symptoms}
                            observations={item.observations}
                            diagnoses={item.diagnoses}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">
          <span>Page {page} of {totalPages} ({total} consultations)</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}
              leftIcon={<ChevronLeft className="h-4 w-4" />}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}
              rightIcon={<ChevronRight className="h-4 w-4" />}>Next</Button>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      {selectedConsultation && (
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
          title={`Consultation: ${selectedConsultation.patientName}`} maxWidth="4xl">
          <div className="space-y-4 text-xs text-slate-700 dark:text-slate-200">
            <div className="grid grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Patient Name:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedConsultation.patientName}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Date & Time:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{formatDate(selectedConsultation.createdAt)}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Attending Doctor:</span>
                <span className="font-semibold text-teal-700 dark:text-teal-300">{selectedConsultation.doctor?.name || 'Dr. Sarah Jenkins'}</span>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Extracted Symptoms</h4>
              <div className="flex flex-wrap gap-1.5">
                {selectedConsultation.symptoms?.map((s, i) => <Badge key={i} variant="teal">✓ {s}</Badge>)}
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Clinical Observations</h4>
              <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300 font-mono bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                {selectedConsultation.observations?.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-1.5">AI Differential Diagnoses</h4>
              <div className="space-y-2">
                {selectedConsultation.diagnoses?.map((d, i) => (
                  <div key={i} className="bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex justify-between items-start">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-slate-100">#{i + 1} {d.name}</div>
                      <div className="text-slate-500 dark:text-slate-400 mt-1">Tests: {d.recommendedTests.join(', ')}</div>
                    </div>
                    <Badge variant="emerald">{d.confidence}</Badge>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Interaction Transcript</h4>
              <pre className="p-3 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 font-mono text-[11px] whitespace-pre-wrap max-h-48 overflow-y-auto text-slate-800 dark:text-slate-200">
                {selectedConsultation.transcript}
              </pre>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
