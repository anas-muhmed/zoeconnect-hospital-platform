'use client';

/**
 * Public Feedback Portal --- /feedback/f/[token]
 * Fully unauthenticated, no-login page a patient reaches by scanning a
 * printed QR code. Resolves the token via GET /feedback/public/:token
 * (QR -> campaign -> published form), renders the form top-to-bottom
 * (mirrors the admin builder's linear layout), evaluates simple show/hide
 * conditions client-side, and posts answers to POST /feedback/public/:token/submit.
 * Registered as a public route prefix in AuthProvider so the global auth
 * guard never bounces an anonymous visitor to /login.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import Rating from '@mui/material/Rating';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Snackbar from '@mui/material/Snackbar';
import StarIcon from '@mui/icons-material/Star';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import apiClientDefault from 'axios';

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/api\/v1\/?$/, '');
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? `${API_ORIGIN}/api/v1`;
const publicApi = apiClientDefault.create({ baseURL: API_BASE, timeout: 20000 });

const DEVICE_ID_KEY = 'hdsp_feedback_device_id';

/**
 * A persistent per-device id, stored in localStorage so it survives across
 * separate visits/QR scans -- NOT the same thing as the anonymousId the
 * backend used to hand out fresh on every page load (that reset every
 * visit and so could never actually cap "N submissions per device"; see
 * FeedbackPublicService's doc comment). Generated once and reused; if
 * localStorage is unavailable (private browsing, blocked storage) this
 * returns undefined and the backend falls back to an IP-based check.
 */
function getOrCreateDeviceId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

type QuestionType =
  | 'STAR_RATING' | 'EMOJI_RATING' | 'NPS_SCORE' | 'YES_NO' | 'RADIO' | 'CHECKBOX'
  | 'DROPDOWN' | 'MULTI_SELECT' | 'SINGLE_LINE_TEXT' | 'PARAGRAPH' | 'NUMBER'
  | 'DATE' | 'TIME' | 'EMAIL' | 'PHONE' | 'FILE_UPLOAD' | 'IMAGE_UPLOAD';

interface Option { id: string; label: string; value: string; displayOrder: number; }
interface Condition {
  id: string; sourceQuestionId: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'CONTAINS';
  comparisonValue: string; action: 'SHOW' | 'HIDE';
}
interface Question {
  id: string; questionType: QuestionType; questionText: string; helpText: string | null;
  placeholder: string | null; isRequired: boolean; displayOrder: number;
  options: Option[]; conditions: Condition[];
}
interface Section { id: string; title: string; description: string | null; displayOrder: number; questions: Question[]; }
interface ResolvedForm {
  formId: string; name: string; description: string | null; language: string;
  selectedLanguage: string; availableLanguages: { code: string; name: string }[];
  headerImageUrl: string | null; headerImageType: 'LOGO' | 'BANNER' | null;
  splashImageUrl: string | null; splashDurationSeconds: number | null;
  sections: Section[];
  /** Admin-configured via Settings (`FeedbackSettings.complaintCategories`) -- no longer a hardcoded frontend list. */
  complaintCategories: string[];
}

/** What POST /feedback/public/:token/submit returns -- decides the post-submit screen. */
interface SubmitResult {
  submissionId: string;
  thankYouMessage: string;
  showGoogleReview: boolean;
  googleReview: { url: string; thankYouMessage: string; invitationMessage: string } | null;
  showComplaintPrompt: boolean;
}

const EMOJIS = [
  { alt: '😡', hex: '1f621' },
  { alt: '😕', hex: '1f615' },
  { alt: '😐', hex: '1f610' },
  { alt: '🙂', hex: '1f642' },
  { alt: '😍', hex: '1f60d' },
].map(e => (
  <picture key={e.hex}>
    <source srcSet={`https://fonts.gstatic.com/s/e/notoemoji/latest/${e.hex}/512.webp`} type="image/webp" />
    <img src={`https://fonts.gstatic.com/s/e/notoemoji/latest/${e.hex}/512.gif`} alt={e.alt} width="32" height="32" style={{ width: '1em', height: '1em', display: 'block' }} />
  </picture>
));

function evaluateCondition(condition: Condition, answers: Record<string, unknown>): boolean {
  const actual = answers[condition.sourceQuestionId];
  const actualStr = Array.isArray(actual) ? actual.join(',') : String(actual ?? '');
  switch (condition.operator) {
    case 'EQUALS': return actualStr === condition.comparisonValue;
    case 'NOT_EQUALS': return actualStr !== condition.comparisonValue;
    case 'GREATER_THAN': return Number(actual) > Number(condition.comparisonValue);
    case 'LESS_THAN': return Number(actual) < Number(condition.comparisonValue);
    case 'CONTAINS': return actualStr.includes(condition.comparisonValue);
    default: return true;
  }
}

function isQuestionVisible(question: Question, answers: Record<string, unknown>): boolean {
  if (!question.conditions || question.conditions.length === 0) return true;
  // All conditions must agree the question should show; any HIDE match takes precedence.
  for (const c of question.conditions) {
    const matched = evaluateCondition(c, answers);
    if (c.action === 'HIDE' && matched) return false;
    if (c.action === 'SHOW' && !matched) return false;
  }
  return true;
}

export default function FeedbackPublicPortalPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [form, setForm] = useState<ResolvedForm | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [reviewFeedbackText, setReviewFeedbackText] = useState('');
  const [reviewChoiceMade, setReviewChoiceMade] = useState(false);
  const [copyHint, setCopyHint] = useState('');
  const [complaintChoiceMade, setComplaintChoiceMade] = useState(false);
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const [showSplash, setShowSplash] = useState(false);
  // Only decide whether to show the splash once, off the *first* successful
  // load -- background refetches (visibility/focus/bfcache, see below) must
  // not resurrect a splash screen the patient already dismissed mid-form.
  const splashDecidedRef = useRef(false);

  /**
   * QR codes get scanned repeatedly against the *same* URL, and mobile
   * browsers (Chrome on Android especially) often bring an already-open tab
   * for that URL back to the foreground instead of doing a fresh navigation
   * -- so a page that only fetched once on mount would keep showing a stale
   * "this link is disabled/expired" error even after an admin re-enables
   * the code, since the component never actually remounts. Refetching on
   * `visibilitychange`/`pageshow` (including bfcache restores) and offering
   * a manual retry button both work around that without needing every scan
   * to be a genuinely fresh page load.
   */
  const loadForm = useCallback((signal?: { cancelled: boolean }) => {
    setLoading(true);
    setLoadError('');
    publicApi.get(`/feedback/public/${token}`, {
      headers: { 'Cache-Control': 'no-cache' },
      params: language ? { lang: language } : undefined,
    })
      .then(res => {
        if (signal?.cancelled) return;
        setForm(res.data);
        setLoadError('');
        if (!splashDecidedRef.current) {
          splashDecidedRef.current = true;
          setShowSplash(!!res.data.splashImageUrl);
        }
      })
      .catch(err => { if (!signal?.cancelled) setLoadError(err?.response?.data?.message ?? 'This feedback link is no longer available.'); })
      .finally(() => { if (!signal?.cancelled) setLoading(false); });
  }, [token, language]);

  useEffect(() => {
    const signal = { cancelled: false };
    loadForm(signal);
    return () => { signal.cancelled = true; };
  }, [loadForm]);

  useEffect(() => {
    if (submitted) return; // don't yank a "thank you" screen back to a form mid-view
    const refetch = () => loadForm();
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') refetch(); };
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) refetch(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', refetch);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', refetch);
    };
  }, [loadForm, submitted]);

  const orderedSections = useMemo(() => (
    (form?.sections ?? [])
      .slice().sort((a, b) => a.displayOrder - b.displayOrder)
      .map(s => ({ ...s, questions: (s.questions ?? []).slice().sort((a, b) => a.displayOrder - b.displayOrder) }))
  ), [form]);

  const setAnswer = (questionId: string, value: unknown) => setAnswers(a => ({ ...a, [questionId]: value }));

  const handleSubmit = async () => {
    if (!form) return;
    setSubmitError('');
    const visibleQuestions = orderedSections.flatMap(s => s.questions).filter(q => isQuestionVisible(q, answers));
    for (const q of visibleQuestions) {
      const v = answers[q.id];
      if (q.isRequired && (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0))) {
        setSubmitError(`"${q.questionText}" is required`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await publicApi.post(`/feedback/public/${token}/submit`, {
        answers: visibleQuestions.map(q => ({ questionId: q.id, value: answers[q.id] ?? null })),
        anonymousId: getOrCreateDeviceId(),
        language: form.language,
      });
      setSubmitResult(res.data as SubmitResult);
      // Best-effort guess at "the patient's own words" to offer as a starting point for
      // their Google review -- prefer a PARAGRAPH (usually a general comments box) over a
      // SINGLE_LINE_TEXT field, and never invent text they didn't write themselves.
      const paragraph = visibleQuestions.find(q => q.questionType === 'PARAGRAPH' && String(answers[q.id] ?? '').trim());
      const shortText = visibleQuestions.find(q => q.questionType === 'SINGLE_LINE_TEXT' && String(answers[q.id] ?? '').trim());
      const freeText = paragraph ?? shortText;
      setReviewFeedbackText(freeText ? String(answers[freeText.id]).trim() : '');
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message ?? 'Something went wrong submitting your feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: '#f5f6f8' }}>
        <Paper sx={{ p: 4, maxWidth: 480, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>This link isn't available</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>{loadError}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            If this was just re-enabled, tap below to check again.
          </Typography>
          <Button variant="outlined" onClick={() => loadForm()} disabled={loading}>
            {loading ? 'Checking...' : 'Try Again'}
          </Button>
        </Paper>
      </Box>
    );
  }

  if (!form) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (submitted) {
    // Show the Google Review invite only while the patient hasn't yet chosen "Share" or
    // "Maybe Later" -- once they pick either, fall through to the plain thank-you below.
    if (submitResult?.showGoogleReview && submitResult.googleReview && !reviewChoiceMade) {
      return (
        <GoogleReviewPrompt
          googleReview={submitResult.googleReview}
          feedbackText={reviewFeedbackText}
          copyHint={copyHint}
          setCopyHint={setCopyHint}
          onChoiceMade={() => setReviewChoiceMade(true)}
        />
      );
    }
    if (submitResult?.showComplaintPrompt && submitResult.submissionId && !complaintChoiceMade) {
      return (
        <ComplaintPrompt
          token={token}
          submissionId={submitResult.submissionId}
          categories={form?.complaintCategories ?? []}
          onDone={() => setComplaintChoiceMade(true)}
        />
      );
    }
    return (
      <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: '#f5f6f8' }}>
        <Paper sx={{ p: 4, maxWidth: 480, textAlign: 'center' }}>
          <Typography variant="h5" fontWeight={700} gutterBottom>Thank you!</Typography>
          <Typography color="text.secondary">
            {submitResult?.thankYouMessage ?? 'Your feedback has been received. We appreciate you taking the time to help us improve.'}
          </Typography>
        </Paper>
      </Box>
    );
  }

  if (showSplash && form.splashImageUrl) {
    return (
      <SplashScreen
        imageUrl={form.splashImageUrl}
        durationSeconds={form.splashDurationSeconds ?? 3}
        onDone={() => setShowSplash(false)}
      />
    );
  }

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: '#f5f6f8', py: { xs: 2, sm: 5 }, px: 2 }}>
      <Box sx={{ maxWidth: 640, mx: 'auto' }}>
        {form.availableLanguages.length > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.75, mb: 1.5, flexWrap: 'wrap' }}>
            {form.availableLanguages.map(l => (
              <Chip
                key={l.code}
                size="small"
                label={l.name}
                color={l.code === form.selectedLanguage ? 'primary' : 'default'}
                variant={l.code === form.selectedLanguage ? 'filled' : 'outlined'}
                onClick={() => setLanguage(l.code)}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Box>
        )}
        {form.headerImageUrl && form.headerImageType === 'BANNER' && (
          <Box
            component="img"
            src={form.headerImageUrl}
            alt=""
            sx={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 2, mb: 2 }}
          />
        )}
        <Paper sx={{ p: { xs: 2.5, sm: 4 }, mb: 2 }}>
          {form.headerImageUrl && form.headerImageType === 'LOGO' && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <Box component="img" src={form.headerImageUrl} alt="" sx={{ maxHeight: 72, maxWidth: '100%', objectFit: 'contain' }} />
            </Box>
          )}
          <Typography variant="h5" fontWeight={700}>{form.name}</Typography>
          {form.description && <Typography color="text.secondary" sx={{ mt: 1 }}>{form.description}</Typography>}
        </Paper>

        {orderedSections.map(section => (
          <Paper key={section.id} sx={{ p: { xs: 2.5, sm: 4 }, mb: 2 }}>
            <Typography variant="h6" fontWeight={700}>{section.title}</Typography>
            {section.description && <Typography color="text.secondary" sx={{ mb: 2 }}>{section.description}</Typography>}
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {section.questions.filter(q => isQuestionVisible(q, answers)).map(q => (
                <QuestionField key={q.id} question={q} value={answers[q.id]} onChange={v => setAnswer(q.id, v)} />
              ))}
            </Box>
          </Paper>
        ))}

        {submitError && <Alert severity="error" sx={{ mb: 2 }}>{submitError}</Alert>}

        <Button variant="contained" size="large" fullWidth onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit Feedback'}
        </Button>
      </Box>
    </Box>
  );
}

function QuestionField({ question, value, onChange }: { question: Question; value: unknown; onChange: (v: unknown) => void }) {
  const label = (
    <Typography fontWeight={600} sx={{ mb: 1 }}>
      {question.questionText}{question.isRequired && <Typography component="span" color="error"> *</Typography>}
    </Typography>
  );
  const help = question.helpText && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{question.helpText}</Typography>;

  switch (question.questionType) {
    case 'STAR_RATING':
      return <Box>{label}{help}<Rating value={Number(value) || 0} onChange={(_, v) => onChange(v)} size="large" /></Box>;

    case 'EMOJI_RATING':
      return (
        <Box>{label}{help}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: { xs: 0.5, sm: 1.5 } }}>
            {EMOJIS.map((emoji, idx) => (
              <Box key={idx} onClick={() => onChange(idx + 1)}
                sx={{
                  fontSize: { xs: 28, sm: 32 }, cursor: 'pointer', p: { xs: 0.5, sm: 1 }, borderRadius: 2,
                  bgcolor: Number(value) === idx + 1 ? 'primary.light' : 'transparent',
                  opacity: Number(value) === idx + 1 ? 1 : 0.6,
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  transform: Number(value) === idx + 1 ? 'scale(1.3)' : 'scale(1)',
                  filter: Number(value) === idx + 1 ? 'drop-shadow(0px 8px 12px rgba(0,0,0,0.25))' : 'none',
                  animation: Number(value) === idx + 1 ? 'emojiPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
                  '@keyframes emojiPop': {
                    '0%': { transform: 'scale(0.8) translateY(10px)' },
                    '40%': { transform: 'scale(1.5) translateY(-15px) rotate(12deg)' },
                    '70%': { transform: 'scale(1.2) translateY(5px) rotate(-8deg)' },
                    '100%': { transform: 'scale(1.3) translateY(0) rotate(0deg)' }
                  },
                  '&:active': { transform: 'scale(0.85)' },
                }}>
                {emoji}
              </Box>
            ))}
          </Box>
        </Box>
      );

    case 'NPS_SCORE':
      return (
        <Box>{label}{help}
          <ToggleButtonGroup value={value ?? null} exclusive onChange={(_, v) => v !== null && onChange(v)} sx={{ flexWrap: 'wrap' }}>
            {Array.from({ length: 11 }, (_, i) => (
              <ToggleButton key={i} value={i} sx={{ minWidth: 40 }}>{i}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      );

    case 'YES_NO':
      return (
        <Box>{label}{help}
          <RadioGroup row value={value ?? ''} onChange={e => onChange(e.target.value)}>
            <FormControlLabel value="YES" control={<Radio />} label="Yes" />
            <FormControlLabel value="NO" control={<Radio />} label="No" />
          </RadioGroup>
        </Box>
      );

    case 'RADIO':
      return (
        <Box>{label}{help}
          <RadioGroup value={value ?? ''} onChange={e => onChange(e.target.value)}>
            {question.options.sort((a, b) => a.displayOrder - b.displayOrder).map(o => (
              <FormControlLabel key={o.id} value={o.value} control={<Radio />} label={o.label} />
            ))}
          </RadioGroup>
        </Box>
      );

    case 'CHECKBOX':
    case 'MULTI_SELECT': {
      const selected: string[] = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
      return (
        <Box>{label}{help}
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {question.options.sort((a, b) => a.displayOrder - b.displayOrder).map(o => (
              <FormControlLabel key={o.id}
                control={<Checkbox checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />}
                label={o.label} />
            ))}
          </Box>
        </Box>
      );
    }

    case 'DROPDOWN':
      return (
        <Box>{label}{help}
          <TextField select fullWidth value={value ?? ''} onChange={e => onChange(e.target.value)}>
            {question.options.sort((a, b) => a.displayOrder - b.displayOrder).map(o => (
              <MenuItem key={o.id} value={o.value}>{o.label}</MenuItem>
            ))}
          </TextField>
        </Box>
      );

    case 'PARAGRAPH':
      return <Box>{label}{help}<TextField fullWidth multiline minRows={3} placeholder={question.placeholder ?? ''} value={value ?? ''} onChange={e => onChange(e.target.value)} /></Box>;

    case 'NUMBER':
      return <Box>{label}{help}<TextField fullWidth type="number" placeholder={question.placeholder ?? ''} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} /></Box>;

    case 'DATE':
      return <Box>{label}{help}<TextField fullWidth type="date" InputLabelProps={{ shrink: true }} value={value ?? ''} onChange={e => onChange(e.target.value)} /></Box>;

    case 'TIME':
      return <Box>{label}{help}<TextField fullWidth type="time" InputLabelProps={{ shrink: true }} value={value ?? ''} onChange={e => onChange(e.target.value)} /></Box>;

    case 'EMAIL':
      return <Box>{label}{help}<TextField fullWidth type="email" placeholder={question.placeholder ?? ''} value={value ?? ''} onChange={e => onChange(e.target.value)} /></Box>;

    case 'PHONE':
      return <Box>{label}{help}<TextField fullWidth type="tel" placeholder={question.placeholder ?? ''} value={value ?? ''} onChange={e => onChange(e.target.value)} /></Box>;

    case 'FILE_UPLOAD':
    case 'IMAGE_UPLOAD':
      return <Box>{label}{help}<Alert severity="info">File/image upload isn't available yet -- this question is skipped for now.</Alert></Box>;

    case 'SINGLE_LINE_TEXT':
    default:
      return <Box>{label}{help}<TextField fullWidth placeholder={question.placeholder ?? ''} value={value ?? ''} onChange={e => onChange(e.target.value)} /></Box>;
  }
}

// -- Splash screen ------------------------------------------------------------------

/**
 * Full-screen image shown before the form, for `durationSeconds` or until
 * tapped -- whichever comes first. Only ever mounted once per page load
 * (see `splashDecidedRef` in the parent), so its own timer doesn't need to
 * worry about being reset by unrelated re-renders.
 */
function SplashScreen({ imageUrl, durationSeconds, onDone }: { imageUrl: string; durationSeconds: number; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, Math.max(1, durationSeconds) * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box
      onClick={onDone}
      sx={{
        position: 'fixed', inset: 0, bgcolor: '#000',
        cursor: 'pointer', zIndex: 1300,
      }}
    >
      {/* `cover` (not `contain`) so the image fills the whole screen edge-to-edge like the
          header banner does, auto-cropping whatever doesn't fit the device's aspect ratio,
          rather than letterboxing a smaller image in the middle with black bars. */}
      <Box component="img" src={imageUrl} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      <Typography
        variant="caption"
        sx={{ position: 'absolute', bottom: 24, color: 'rgba(255,255,255,0.8)', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
      >
        Tap to continue
      </Typography>
    </Box>
  );
}

// -- Google Review prompt ------------------------------------------------------------

/**
 * Shown after a high-rated submission, per the spec's "smart redirect"
 * flow. Hard constraint: this NEVER posts a review on the patient's
 * behalf. "Share on Google" only (1) copies their own feedback text to the
 * clipboard as a starting point, and (2) opens the hospital's Google
 * Review URL in a new tab -- the patient signs in and submits the review
 * themselves, entirely on Google's own page. No unofficial APIs, no
 * browser automation, no pre-filled/pre-submitted review.
 */
function GoogleReviewPrompt({
  googleReview, feedbackText, copyHint, setCopyHint, onChoiceMade,
}: {
  googleReview: { url: string; thankYouMessage: string; invitationMessage: string };
  feedbackText: string;
  copyHint: string;
  setCopyHint: (v: string) => void;
  onChoiceMade: () => void;
}) {
  const copyFeedback = async () => {
    if (!feedbackText) return;
    try {
      await navigator.clipboard.writeText(feedbackText);
      setCopyHint('Copied! Paste it into your Google review.');
    } catch {
      setCopyHint('Could not copy automatically -- please select and copy the text above.');
    }
  };

  const handleShare = async () => {
    if (feedbackText) await copyFeedback();
    window.open(googleReview.url, '_blank', 'noopener,noreferrer');
    onChoiceMade();
  };

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: '#f5f6f8' }}>
      <Paper sx={{ p: 4, maxWidth: 480, textAlign: 'center' }}>
        <StarIcon sx={{ fontSize: 40, color: '#f5a623', mb: 1 }} />
        <Typography variant="h5" fontWeight={700} gutterBottom>{googleReview.thankYouMessage}</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>{googleReview.invitationMessage}</Typography>

        {feedbackText && (
          <Paper variant="outlined" sx={{ p: 2, mb: 3, textAlign: 'left', bgcolor: '#fafafa' }}>
            <Typography variant="caption" color="text.secondary">Your feedback (you can copy this into your review)</Typography>
            <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{feedbackText}</Typography>
            <Button size="small" startIcon={<ContentCopyIcon fontSize="small" />} onClick={copyFeedback} sx={{ mt: 1 }}>
              Copy Review Text
            </Button>
          </Paper>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Button variant="contained" size="large" startIcon={<OpenInNewIcon />} onClick={handleShare}>
            Share on Google
          </Button>
          <Button variant="text" onClick={onChoiceMade}>
            Maybe Later
          </Button>
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          You'll sign in to your own Google account to post the review -- we never post anything on your behalf.
        </Typography>
      </Paper>

      <Snackbar
        open={!!copyHint}
        autoHideDuration={3000}
        onClose={() => setCopyHint('')}
        message={copyHint}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}

// -- Complaint / suggestion opt-in -----------------------------------------------------

/**
 * Shown after a low-rated submission instead of the Google Review prompt --
 * the "complaint/suggestion flow" the Google Review spec deferred to a
 * later phase. Entirely opt-in: "No Thanks" always falls through to the
 * plain thank-you screen with no complaint row ever created. Posts to
 * POST /feedback/public/:token/complaint, which re-resolves the token and
 * verifies the submissionId belongs to it server-side.
 */
function ComplaintPrompt({ token, submissionId, categories, onDone }: { token: string; submissionId: string; categories: string[]; onDone: () => void }) {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [wantsContact, setWantsContact] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!category || !description.trim()) {
      setError('Please choose a category and describe what happened.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await publicApi.post(`/feedback/public/${token}/complaint`, {
        submissionId,
        category,
        description: description.trim(),
        contactName: wantsContact && contactName.trim() ? contactName.trim() : undefined,
        contactPhone: wantsContact && contactPhone.trim() ? contactPhone.trim() : undefined,
        contactEmail: wantsContact && contactEmail.trim() ? contactEmail.trim() : undefined,
      });
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Something went wrong submitting this -- please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: '#f5f6f8' }}>
      <Paper sx={{ p: 4, maxWidth: 480, width: '100%' }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>We're sorry to hear that</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Would you like to tell us more so we can make it right? This is completely optional.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            select label="What was this about?" value={category}
            onChange={e => setCategory(e.target.value)} fullWidth
          >
            {categories.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <TextField
            label="Tell us what happened" value={description}
            onChange={e => setDescription(e.target.value)}
            multiline minRows={4} fullWidth
          />

          <FormControlLabel
            control={<Checkbox checked={wantsContact} onChange={e => setWantsContact(e.target.checked)} />}
            label="I'd like someone to follow up with me about this"
          />
          {wantsContact && (
            <>
              <TextField label="Your name" value={contactName} onChange={e => setContactName(e.target.value)} fullWidth />
              <TextField label="Phone" value={contactPhone} onChange={e => setContactPhone(e.target.value)} fullWidth />
              <TextField label="Email" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} fullWidth />
            </>
          )}

          {error && <Alert severity="error">{error}</Alert>}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
            <Button variant="contained" size="large" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Sending...' : 'Send Feedback'}
            </Button>
            <Button variant="text" onClick={onDone}>
              No Thanks
            </Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
