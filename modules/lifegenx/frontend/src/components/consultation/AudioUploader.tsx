import React, { useRef, useState, useEffect } from 'react';
import { Upload, FileAudio, Sparkles, AlertCircle, Mic, Square, Globe } from 'lucide-react';
import { Button } from '../ui/Button';
import { useConsultationStore } from '../../store/consultationStore';
import { aiService } from '../../services/aiService';
import { useToast } from '../ui/Toast';
import { useLayoutStore } from '../../store/layoutStore';

export function AudioUploader() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'record'>('upload');
  
  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { showToast } = useToast();
  const { sidebarOpen } = useLayoutStore();

  const { 
    audioFileName, 
    audioDuration, 
    language, 
    setLanguage, 
    setAudioData, 
    setTranscript, 
    setMalayalamTranscript, 
    setProcessingState, 
    loadSampleConsultation 
  } = useConsultationStore();

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('Microphone recording is not supported in this browser.', 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: 'audio/webm' };
      
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch (e) {
        recorder = new MediaRecorder(stream);
      }

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `live-consultation-${timestamp}.webm`;
        const file = new File([audioBlob], filename, { type: recorder.mimeType || 'audio/webm' });
        
        stream.getTracks().forEach(track => track.stop());
        processAudioFile(file);
      };

      setAudioChunks([]);
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingSeconds(0);
      
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      showToast('Live consultation recording started...', 'success');
    } catch (err: any) {
      showToast('Could not access microphone: ' + err.message, 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      showToast('Recording stopped. Preparing audio upload...', 'info');
    }
  };

  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const processAudioFile = async (file: File) => {
    const validExtensions = ['mp3', 'wav', 'm4a', 'ogg', 'webm'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !validExtensions.includes(ext)) { showToast('Invalid file format. Please upload .mp3, .wav, or .m4a', 'error'); return; }
    if (file.size > 25 * 1024 * 1024) { showToast('File size exceeds 25MB maximum limit', 'error'); return; }

    try {
      setProcessingState('isUploading', true);
      showToast(`Uploading ${file.name}...`, 'info');
      const uploadRes = await aiService.uploadAudio(file);
      setAudioData({ audioId: uploadRes.audioId, fileName: uploadRes.fileName, duration: uploadRes.duration, url: URL.createObjectURL(file) });
      
      const transcriptionEngine = language === 'malayalam' ? 'Gemini 1.5 Pro' : 'transcription model';
      showToast(`Audio uploaded. Starting ${transcriptionEngine} processing...`, 'info');
      
      setProcessingState('isUploading', false);
      setProcessingState('isTranscribing', true);
      
      const transcribeRes = await aiService.transcribeAudio(uploadRes.audioId, language);
      
      setTranscript(transcribeRes.transcript);
      if (transcribeRes.malayalamTranscript) {
        setMalayalamTranscript(transcribeRes.malayalamTranscript);
        showToast('Malayalam transcription and translation completed!', 'success');
      } else {
        setMalayalamTranscript('');
        showToast('Audio transcription completed!', 'success');
      }
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to process audio file', 'error');
    } finally {
      setProcessingState('isUploading', false);
      setProcessingState('isTranscribing', false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) processAudioFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 space-y-3.5 transition-all duration-300">
      
      {/* Language Selector */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
          <Globe className="h-3 w-3 text-teal-600 dark:text-teal-400" />
          Consultation Language Flow
        </label>
        <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-950/60 border border-slate-200/50 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => !isRecording && setLanguage('english')}
            disabled={isRecording}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
              language === 'english'
                ? 'bg-white text-slate-800 shadow dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            } disabled:opacity-50`}
          >
            English Flow
          </button>
          <button
            type="button"
            onClick={() => !isRecording && setLanguage('malayalam')}
            disabled={isRecording}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
              language === 'malayalam'
                ? 'bg-white text-slate-800 shadow dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            } disabled:opacity-50`}
          >
            Malayalam Flow
          </button>
        </div>
      </div>

      {/* Upload / Record Tab Selector */}
      <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-950/60 border border-slate-200/50 dark:border-slate-800/80">
        <button
          type="button"
          onClick={() => !isRecording && setActiveTab('upload')}
          disabled={isRecording}
          className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
            activeTab === 'upload'
              ? 'bg-white text-slate-800 shadow dark:bg-slate-900 dark:text-slate-100'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          } disabled:opacity-50`}
        >
          Upload Audio File
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('record')}
          className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
            activeTab === 'record'
              ? 'bg-white text-slate-800 shadow dark:bg-slate-900 dark:text-slate-100'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Record Live Session
        </button>
      </div>

      {activeTab === 'upload' ? (
        /* Upload Area */
        <div
          onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-all cursor-pointer ${
            dragActive
              ? 'border-teal-400 bg-teal-50 dark:bg-teal-950/20'
              : 'border-slate-300 bg-slate-50 hover:border-teal-400 hover:bg-teal-50/50 dark:border-slate-700 dark:bg-slate-950/50 dark:hover:border-slate-500'
          } ${sidebarOpen ? 'p-6' : 'p-8'}`}
        >
          <input ref={fileInputRef} type="file" accept=".mp3,.wav,.m4a,.ogg,.webm,audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && processAudioFile(e.target.files[0])} />

          <div className={`flex items-center justify-center rounded-xl bg-teal-100 text-teal-600 mb-3 border border-teal-200 dark:bg-slate-800 dark:text-teal-400 dark:border-slate-700 transition-all duration-300 ${sidebarOpen ? 'h-12 w-12' : 'h-16 w-16'}`}>
            <Upload className={`transition-all duration-300 ${sidebarOpen ? 'h-6 w-6' : 'h-8 w-8'}`} />
          </div>

          <h4 className={`font-semibold text-slate-800 dark:text-slate-100 transition-all duration-300 ${sidebarOpen ? 'text-sm' : 'text-base'}`}>
            Upload Consultation Audio or{' '}
            <span className="text-teal-600 dark:text-teal-400 underline">Drag & Drop</span>
          </h4>
          <p className={`text-slate-500 dark:text-slate-400 mt-1 transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
            Supported Formats: MP3, WAV, M4A (Max: 25MB)
          </p>
        </div>
      ) : (
        /* Live Recording Area */
        <div className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/50 text-center ${sidebarOpen ? 'p-6' : 'p-8'}`}>
          {isRecording ? (
            <div className="space-y-4 w-full flex flex-col items-center">
              {/* Blinking Live Indicator */}
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                </span>
                <span className="text-xs font-bold text-rose-500 uppercase tracking-widest">Recording live...</span>
              </div>
              
              {/* Counter */}
              <div className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 font-mono tracking-tight">
                {formatTime(recordingSeconds)}
              </div>

              {/* Pulsing Visual Waveform Simulation */}
              <div className="flex items-center gap-1 h-8 justify-center my-1 w-full max-w-[200px]">
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    style={{ animationDelay: `${i * 0.15}s` }}
                    className="w-1.5 bg-teal-500 dark:bg-teal-400 rounded-full animate-bounce h-2 bg-gradient-to-t from-teal-500 to-emerald-400"
                  />
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={stopRecording}
                className="border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 hover:border-rose-300 dark:border-rose-500/20 dark:bg-rose-500/5 dark:text-rose-400"
                leftIcon={<Square className="h-4 w-4" />}
              >
                Stop Recording
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`mx-auto flex items-center justify-center rounded-xl bg-teal-100 text-teal-600 border border-teal-200 dark:bg-slate-800 dark:text-teal-400 dark:border-slate-700 transition-all duration-300 ${sidebarOpen ? 'h-12 w-12' : 'h-16 w-16'}`}>
                <Mic className={`transition-all duration-300 ${sidebarOpen ? 'h-6 w-6' : 'h-8 w-8'}`} />
              </div>
              <div>
                <h4 className={`font-semibold text-slate-800 dark:text-slate-100 transition-all duration-300 ${sidebarOpen ? 'text-sm' : 'text-base'}`}>
                  Record Doctor-Patient Conversation
                </h4>
                <p className={`text-slate-500 dark:text-slate-400 mt-1 transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
                  Consultation audio is processed securely & transcription begins immediately on stopping
                </p>
              </div>
              <Button
                type="button"
                variant="primary"
                size={sidebarOpen ? 'sm' : 'md'}
                onClick={startRecording}
                leftIcon={<Mic className="h-4 w-4" />}
              >
                Start Recording Session
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Uploaded audio info tag */}
      {audioFileName && (
        <div className={`flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-1.5 text-teal-700 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-500/30 transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
          <FileAudio className="h-4 w-4 shrink-0 text-teal-500 dark:text-teal-400" />
          <span className="font-medium truncate max-w-[200px]">{audioFileName}</span>
          {audioDuration && <span className="text-slate-500 dark:text-slate-400">({audioDuration})</span>}
        </div>
      )}

      {/* Quick Demo Pre-loader */}
      <div className="flex items-center justify-between pt-1">
        <span className={`text-slate-500 dark:text-slate-400 flex items-center gap-1 transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
          <AlertCircle className="h-3.5 w-3.5" /> Testing without audio?
        </span>
        <Button type="button" variant="outline" size={sidebarOpen ? 'sm' : 'md'} onClick={loadSampleConsultation} leftIcon={<Sparkles className="h-3.5 w-3.5 text-teal-500 dark:text-teal-400" />}>
          Load Demo Interaction
        </Button>
      </div>
    </div>
  );
}
