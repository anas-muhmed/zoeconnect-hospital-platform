'use client';

/**
 * Feedback Form Builder --- linear, Google-Forms-style drag-reorder editor
 * (sections -> questions top to bottom), NOT the free-form X/Y canvas the
 * clinical Dynamic Form Builder uses (@hdsp/canvas-engine-react) -- a
 * deliberate choice, since a patient survey is filled top-to-bottom, not
 * laid out on a page. Drag-and-drop uses plain HTML5 DnD (draggable +
 * onDragStart/onDragOver/onDrop) rather than a library, so reordering both
 * sections and questions-within-a-section share one small helper.
 */

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Divider from '@mui/material/Divider';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import PublishIcon from '@mui/icons-material/Publish';
import UnpublishedIcon from '@mui/icons-material/Unpublished';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import ImageCropDialog from '@/components/feedback/ImageCropDialog';

// -- Types ------------------------------------------------------------------------

type QuestionType =
  | 'STAR_RATING' | 'EMOJI_RATING' | 'NPS_SCORE' | 'YES_NO' | 'RADIO' | 'CHECKBOX'
  | 'DROPDOWN' | 'MULTI_SELECT' | 'SINGLE_LINE_TEXT' | 'PARAGRAPH' | 'NUMBER'
  | 'DATE' | 'TIME' | 'EMAIL' | 'PHONE' | 'FILE_UPLOAD' | 'IMAGE_UPLOAD';

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'STAR_RATING', label: 'Star Rating' },
  { value: 'EMOJI_RATING', label: 'Emoji Rating' },
  { value: 'NPS_SCORE', label: 'NPS Score (0-10)' },
  { value: 'YES_NO', label: 'Yes / No' },
  { value: 'RADIO', label: 'Radio Button' },
  { value: 'CHECKBOX', label: 'Checkbox' },
  { value: 'DROPDOWN', label: 'Dropdown' },
  { value: 'MULTI_SELECT', label: 'Multi Select' },
  { value: 'SINGLE_LINE_TEXT', label: 'Single Line Text' },
  { value: 'PARAGRAPH', label: 'Paragraph' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'DATE', label: 'Date' },
  { value: 'TIME', label: 'Time' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'FILE_UPLOAD', label: 'File Upload (future ready)' },
  { value: 'IMAGE_UPLOAD', label: 'Image Upload (future ready)' },
];
const OPTION_BASED_TYPES = new Set<QuestionType>(['RADIO', 'CHECKBOX', 'DROPDOWN', 'MULTI_SELECT']);
const typeLabel = (t: QuestionType) => QUESTION_TYPES.find(q => q.value === t)?.label ?? t;

interface FeedbackOption { id?: string; label: string; value: string; displayOrder?: number; }
interface FeedbackCondition {
  id?: string; sourceQuestionId: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'CONTAINS';
  comparisonValue: string; action: 'SHOW' | 'HIDE';
}
interface FeedbackQuestion {
  id: string; questionType: QuestionType; questionText: string; helpText: string | null;
  placeholder: string | null; isRequired: boolean; displayOrder: number;
  minLength: number | null; maxLength: number | null; defaultValue: string | null;
  options: FeedbackOption[]; conditions: FeedbackCondition[];
}
interface FeedbackSection { id: string; title: string; description: string | null; displayOrder: number; questions: FeedbackQuestion[]; }
interface FeedbackFormDetail {
  id: string; name: string; description: string | null; language: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; sections: FeedbackSection[];
  headerImageUrl: string | null; headerImageType: 'LOGO' | 'BANNER' | null;
  splashImageUrl: string | null; splashDurationSeconds: number | null;
}

/**
 * A text field that saves on a debounce instead of every keystroke, and
 * never sends an empty value to the server for a required field. Fixes a
 * bug where clearing a required field (e.g. section title) fired a PATCH
 * on every keystroke, the server correctly rejected the empty string
 * (`title should not be empty`), and -- because the field's value was
 * bound straight to server data with no local state -- the failed mutation
 * left the DOM value stuck at whatever was last successfully saved,
 * making it look like the field couldn't be cleared at all. Now the local
 * value is free to go empty; only a non-empty value is ever sent, and
 * "<Label> is required" is shown inline instead of silently refusing the
 * keystroke.
 */
function DebouncedTextField({
  value, onSave, required, requiredLabel = 'This field', delay = 600, ...textFieldProps
}: {
  value: string;
  onSave: (value: string) => void;
  required?: boolean;
  requiredLabel?: string;
  delay?: number;
} & Omit<React.ComponentProps<typeof TextField>, 'value' | 'onChange'>) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  // Only resync from the server value when the user isn't mid-edit, so an
  // invalidate()-triggered refetch (e.g. from a different field's save)
  // can't clobber what they're currently typing.
  useEffect(() => {
    if (!dirtyRef.current) setLocal(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setLocal(next);
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      dirtyRef.current = false;
      if (required && next.trim() === '') return; // show the inline error instead of saving
      onSave(next);
    }, delay);
  };

  const showRequiredError = !!required && local.trim() === '';

  return (
    <TextField
      {...textFieldProps}
      value={local}
      onChange={handleChange}
      error={showRequiredError || textFieldProps.error}
      helperText={showRequiredError ? `${requiredLabel} is required` : textFieldProps.helperText}
    />
  );
}

/**
 * Touch fallback for the drag-reorder below (touch interaction audit,
 * Phase 2): plain HTML5 DnD (`draggable`/`onDragStart`/`onDragOver`/
 * `onDrop`) has no touch equivalent in any mobile browser, so on a tablet
 * neither sections nor questions in this form builder could be reordered
 * at all. Mirrors the Up/Down button pattern already used correctly for
 * this exact problem in cms/playlists/[id]/page.tsx's `moveItem` -- computes
 * the same new id order the drag handlers already produce and calls the
 * same `onReorder`/mutation, so both interaction paths stay in sync with
 * no duplicated reorder logic.
 */
function reorderedIds<T extends { id: string }>(items: T[], index: number, direction: -1 | 1): string[] | null {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) return null;
  const ids = items.map(i => i.id);
  const [moved] = ids.splice(index, 1);
  ids.splice(targetIndex, 0, moved);
  return ids;
}

/** Generic HTML5 drag-reorder: attach to any list, calls onReorder(newIdOrder) on drop. */
function useDragReorder<T extends { id: string }>(items: T[], onReorder: (ids: string[]) => void) {
  const dragIndex = useRef<number | null>(null);
  return {
    onDragStart: (index: number) => () => { dragIndex.current = index; },
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (index: number) => () => {
      const from = dragIndex.current;
      dragIndex.current = null;
      if (from === null || from === index) return;
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      onReorder(next.map(i => i.id));
    },
  };
}

export default function FeedbackFormBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.id as string;
  const queryClient = useQueryClient();

  const [editingQuestion, setEditingQuestion] = useState<{ sectionId: string; question: FeedbackQuestion | 'new' } | null>(null);

  const { data: form, isLoading, error } = useQuery<FeedbackFormDetail>({
    queryKey: ['feedback-form', formId],
    queryFn: () => apiClient.get(`/feedback/forms/${formId}`).then(r => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['feedback-form', formId] });

  const updateFormMutation = useMutation({
    mutationFn: (data: Partial<Pick<FeedbackFormDetail, 'name' | 'description' | 'language'>>) =>
      apiClient.patch(`/feedback/forms/${formId}`, data),
    onSuccess: invalidate,
  });

  const publishMutation = useMutation({
    mutationFn: (publish: boolean) => apiClient.post(`/feedback/forms/${formId}/${publish ? 'publish' : 'unpublish'}`),
    onSuccess: invalidate,
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Failed to change publish state'),
  });

  // Header image (hospital logo/banner) -- allowed even on a PUBLISHED form,
  // see FeedbackFormService.setHeaderImage's doc comment for why branding is
  // exempt from the "published forms are frozen" rule.
  const uploadHeaderImageMutation = useMutation({
    mutationFn: ({ file, type }: { file: File; type: 'LOGO' | 'BANNER' }) => {
      const body = new FormData();
      body.append('file', file);
      return apiClient.post(`/feedback/forms/${formId}/header-image?type=${type}`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: invalidate,
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Failed to upload header image'),
  });

  const removeHeaderImageMutation = useMutation({
    mutationFn: () => apiClient.delete(`/feedback/forms/${formId}/header-image`),
    onSuccess: invalidate,
  });

  // Splash screen -- full-screen image shown first on the public portal, before
  // the form itself; same "allowed even when published" rationale as the header image.
  const uploadSplashImageMutation = useMutation({
    mutationFn: ({ file, fileName, durationSeconds }: { file: Blob; fileName: string; durationSeconds: number }) => {
      const body = new FormData();
      body.append('file', file, fileName);
      return apiClient.post(`/feedback/forms/${formId}/splash-image?durationSeconds=${durationSeconds}`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: invalidate,
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Failed to upload splash screen image'),
  });

  const removeSplashImageMutation = useMutation({
    mutationFn: () => apiClient.delete(`/feedback/forms/${formId}/splash-image`),
    onSuccess: invalidate,
  });

  const addSectionMutation = useMutation({
    mutationFn: () => apiClient.post(`/feedback/forms/${formId}/sections`, { title: 'New Section' }),
    onSuccess: invalidate,
  });

  const updateSectionMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Pick<FeedbackSection, 'title' | 'description'>> }) =>
      apiClient.patch(`/feedback/sections/${id}`, data),
    onSuccess: invalidate,
  });

  const removeSectionMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/feedback/sections/${id}`),
    onSuccess: invalidate,
  });

  const reorderSectionsMutation = useMutation({
    mutationFn: (sectionIds: string[]) => apiClient.patch(`/feedback/forms/${formId}/sections/reorder`, { sectionIds }),
    onSuccess: invalidate,
  });

  const removeQuestionMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/feedback/questions/${id}`),
    onSuccess: invalidate,
  });

  const reorderQuestionsMutation = useMutation({
    mutationFn: ({ sectionId, questionIds }: { sectionId: string; questionIds: string[] }) =>
      apiClient.patch(`/feedback/sections/${sectionId}/questions/reorder`, { questionIds }),
    onSuccess: invalidate,
  });

  const sectionDrag = useDragReorder(form?.sections ?? [], (ids) => reorderSectionsMutation.mutate(ids));
  const moveSection = (index: number, direction: -1 | 1) => {
    const ids = reorderedIds(form?.sections ?? [], index, direction);
    if (ids) reorderSectionsMutation.mutate(ids);
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading form...</Typography>
      </Box>
    );
  }
  if (error || !form) {
    return <Box sx={{ p: 3 }}><Alert severity="error">Form not found.</Alert></Box>;
  }

  const allQuestions = form.sections.flatMap(s => s.questions);
  // A PUBLISHED form's content is frozen server-side (see FeedbackFormService.assertEditable) --
  // the builder mirrors that here so the UI never lets you start an edit that the API would
  // then reject with a 409; Unpublish is the only enabled action until you do.
  const isLocked = form.status === 'PUBLISHED';

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton size="small" onClick={() => router.push('/feedback/forms')} aria-label="Back to forms"><ArrowBackIcon /></IconButton>
        <Typography variant="body2" color="text.secondary">Back to Feedback Forms</Typography>
      </Box>

      {isLocked && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This form is published and live. Unpublish it to edit sections, questions, or settings.
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 3 }}>
        <HeaderImageEditor
          headerImageUrl={form.headerImageUrl}
          headerImageType={form.headerImageType}
          uploading={uploadHeaderImageMutation.isPending}
          onUpload={(file, type) => uploadHeaderImageMutation.mutate({ file, type })}
          onRemove={() => removeHeaderImageMutation.mutate()}
        />
        <SplashScreenEditor
          splashImageUrl={form.splashImageUrl}
          splashDurationSeconds={form.splashDurationSeconds}
          uploading={uploadSplashImageMutation.isPending}
          onUpload={(file, fileName, durationSeconds) => uploadSplashImageMutation.mutate({ file, fileName, durationSeconds })}
          onRemove={() => removeSplashImageMutation.mutate()}
        />
        <TranslationsEditor formId={form.id} baseLanguage={form.language} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <DebouncedTextField
              variant="standard" fullWidth value={form.name} disabled={isLocked}
              required requiredLabel="Form name"
              onSave={name => updateFormMutation.mutate({ name })}
              InputProps={{ sx: { fontSize: '1.5rem', fontWeight: 700 } }}
            />
            <DebouncedTextField
              variant="standard" fullWidth multiline placeholder="Form description..." disabled={isLocked}
              value={form.description ?? ''}
              onSave={description => updateFormMutation.mutate({ description })}
              sx={{ mt: 1 }}
            />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
            <Chip label={form.status} color={form.status === 'PUBLISHED' ? 'success' : form.status === 'ARCHIVED' ? 'warning' : 'default'} />
            {form.status === 'PUBLISHED' ? (
              <Button size="small" color="warning" startIcon={<UnpublishedIcon />} onClick={() => publishMutation.mutate(false)}>
                Unpublish
              </Button>
            ) : (
              <Button size="small" variant="contained" color="success" startIcon={<PublishIcon />} onClick={() => publishMutation.mutate(true)}>
                Publish
              </Button>
            )}
          </Box>
        </Box>
        <TextField select size="small" label="Language" value={form.language} disabled={isLocked}
          onChange={e => updateFormMutation.mutate({ language: e.target.value })} sx={{ width: 160 }}>
          <MenuItem value="en">English</MenuItem>
          <MenuItem value="ar">Arabic</MenuItem>
          <MenuItem value="hi">Hindi</MenuItem>
        </TextField>
      </Paper>

      {form.sections.map((section, sIndex) => (
        <Paper
          key={section.id}
          sx={{ p: 2.5, mb: 2, opacity: isLocked ? 0.75 : 1 }}
          draggable={!isLocked}
          onDragStart={isLocked ? undefined : sectionDrag.onDragStart(sIndex)}
          onDragOver={isLocked ? undefined : sectionDrag.onDragOver}
          onDrop={isLocked ? undefined : sectionDrag.onDrop(sIndex)}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled', cursor: isLocked ? 'default' : 'grab' }} />
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              {/* Phase 3 polish: `p: 0.25` shrank these below even MUI's own
                  "small" IconButton default touch target -- dropping the
                  override restores the same effective hit area every other
                  small IconButton in this app already uses uncontested. */}
              <IconButton size="small" disabled={isLocked || sIndex === 0} onClick={() => moveSection(sIndex, -1)} aria-label="Move section up">
                <ArrowUpwardIcon sx={{ fontSize: 14 }} />
              </IconButton>
              <IconButton size="small" disabled={isLocked || sIndex === form.sections.length - 1} onClick={() => moveSection(sIndex, 1)} aria-label="Move section down">
                <ArrowDownwardIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
            <DebouncedTextField
              variant="standard" value={section.title} sx={{ flex: 1 }} disabled={isLocked}
              required requiredLabel="Section title"
              InputProps={{ sx: { fontWeight: 600 } }}
              onSave={title => updateSectionMutation.mutate({ id: section.id, data: { title } })}
            />
            <Tooltip title="Delete section">
              <IconButton size="small" color="error" disabled={isLocked} onClick={() => {
                if (confirm(`Delete section "${section.title}" and all its questions?`)) removeSectionMutation.mutate(section.id);
              }} aria-label="Delete section">
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <DebouncedTextField
            variant="standard" fullWidth placeholder="Section description (optional)" disabled={isLocked}
            value={section.description ?? ''}
            onSave={description => updateSectionMutation.mutate({ id: section.id, data: { description } })}
            sx={{ mb: 2 }}
          />

          <QuestionList
            section={section}
            isLocked={isLocked}
            onEdit={(q) => setEditingQuestion({ sectionId: section.id, question: q })}
            onDelete={(id) => removeQuestionMutation.mutate(id)}
            onReorder={(questionIds) => reorderQuestionsMutation.mutate({ sectionId: section.id, questionIds })}
          />

          <Button size="small" startIcon={<AddIcon />} sx={{ mt: 1 }} disabled={isLocked}
            onClick={() => setEditingQuestion({ sectionId: section.id, question: 'new' })}>
            Add Question
          </Button>
        </Paper>
      ))}

      <Button variant="outlined" startIcon={<AddIcon />} disabled={isLocked} onClick={() => addSectionMutation.mutate()}>
        Add Section
      </Button>

      {editingQuestion && (
        <QuestionEditorDialog
          sectionId={editingQuestion.sectionId}
          question={editingQuestion.question}
          allQuestions={allQuestions}
          onClose={() => setEditingQuestion(null)}
          onSaved={() => { setEditingQuestion(null); invalidate(); }}
        />
      )}
    </Box>
  );
}

// -- Question list (drag-reorder within a section) --------------------------------

function QuestionList({
  section, isLocked, onEdit, onDelete, onReorder,
}: {
  section: FeedbackSection;
  isLocked: boolean;
  onEdit: (q: FeedbackQuestion) => void;
  onDelete: (id: string) => void;
  onReorder: (questionIds: string[]) => void;
}) {
  const drag = useDragReorder(section.questions, onReorder);
  const moveQuestion = (index: number, direction: -1 | 1) => {
    const ids = reorderedIds(section.questions, index, direction);
    if (ids) onReorder(ids);
  };

  if (section.questions.length === 0) {
    return <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>No questions yet.</Typography>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {section.questions.map((q, index) => (
        <Box
          key={q.id}
          draggable={!isLocked}
          onDragStart={isLocked ? undefined : drag.onDragStart(index)}
          onDragOver={isLocked ? undefined : drag.onDragOver}
          onDrop={isLocked ? undefined : drag.onDrop(index)}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
            bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'divider',
          }}
        >
          <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled', cursor: isLocked ? 'default' : 'grab' }} />
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {/* Phase 3 polish: see the matching comment on the section-level
                reorder buttons above -- same fix, same reasoning. */}
            <IconButton size="small" disabled={isLocked || index === 0} onClick={() => moveQuestion(index, -1)} aria-label="Move question up">
              <ArrowUpwardIcon sx={{ fontSize: 12 }} />
            </IconButton>
            <IconButton size="small" disabled={isLocked || index === section.questions.length - 1} onClick={() => moveQuestion(index, 1)} aria-label="Move question down">
              <ArrowDownwardIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Box>
          <Chip size="small" label={typeLabel(q.questionType)} sx={{ flexShrink: 0 }} />
          <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {q.questionText}
          </Typography>
          {q.isRequired && <Chip size="small" color="primary" label="Required" />}
          {q.conditions.length > 0 && <Chip size="small" variant="outlined" label={`${q.conditions.length} condition(s)`} />}
          <IconButton size="small" disabled={isLocked} onClick={() => onEdit(q)} aria-label="Edit question"><EditIcon fontSize="small" /></IconButton>
          <IconButton size="small" color="error" disabled={isLocked} onClick={() => {
            if (confirm('Delete this question?')) onDelete(q.id);
          }} aria-label="Delete question">
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
    </Box>
  );
}

// -- Question editor dialog ---------------------------------------------------------

function QuestionEditorDialog({
  sectionId, question, allQuestions, onClose, onSaved,
}: {
  sectionId: string;
  question: FeedbackQuestion | 'new';
  allQuestions: FeedbackQuestion[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = question === 'new';
  const existing = isNew ? null : question;

  const [questionType, setQuestionType] = useState<QuestionType>(existing?.questionType ?? 'SINGLE_LINE_TEXT');
  const [questionText, setQuestionText] = useState(existing?.questionText ?? '');
  const [helpText, setHelpText] = useState(existing?.helpText ?? '');
  const [placeholder, setPlaceholder] = useState(existing?.placeholder ?? '');
  const [isRequired, setIsRequired] = useState(existing?.isRequired ?? false);
  const [minLength, setMinLength] = useState(existing?.minLength?.toString() ?? '');
  const [maxLength, setMaxLength] = useState(existing?.maxLength?.toString() ?? '');
  const [defaultValue, setDefaultValue] = useState(existing?.defaultValue ?? '');
  const [options, setOptions] = useState<FeedbackOption[]>(existing?.options ?? []);
  const [conditions, setConditions] = useState<FeedbackCondition[]>(existing?.conditions ?? []);
  const [error, setError] = useState('');

  const otherQuestions = allQuestions.filter(q => q.id !== existing?.id);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const basePayload = {
        questionType, questionText, helpText: helpText || null, placeholder: placeholder || null,
        isRequired, minLength: minLength ? Number(minLength) : null, maxLength: maxLength ? Number(maxLength) : null,
        defaultValue: defaultValue || null,
      };
      const questionId = isNew
        ? (await apiClient.post(`/feedback/sections/${sectionId}/questions`, basePayload)).data.id
        : existing!.id;
      if (!isNew) await apiClient.patch(`/feedback/questions/${questionId}`, basePayload);

      if (OPTION_BASED_TYPES.has(questionType)) {
        await apiClient.put(`/feedback/questions/${questionId}/options`, {
          options: options.map((o, i) => ({ id: o.id, label: o.label, value: o.value, displayOrder: i })),
        });
      }
      await apiClient.put(`/feedback/questions/${questionId}/conditions`, {
        conditions: conditions.map(c => ({
          id: c.id, sourceQuestionId: c.sourceQuestionId, operator: c.operator,
          comparisonValue: c.comparisonValue, action: c.action,
        })),
      });
    },
    onSuccess: onSaved,
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Failed to save question'),
  });

  return (
    <ResponsiveDialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? 'Add Question' : 'Edit Question'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 3 }}>
        <TextField select size="small" label="Question Type" value={questionType}
          onChange={e => setQuestionType(e.target.value as QuestionType)} fullWidth>
          {QUESTION_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
        </TextField>

        <TextField size="small" label="Question Text" value={questionText}
          onChange={e => setQuestionText(e.target.value)} multiline minRows={2} fullWidth />

        <TextField size="small" label="Help Text (optional)" value={helpText}
          onChange={e => setHelpText(e.target.value)} fullWidth />

        <TextField size="small" label="Placeholder (optional)" value={placeholder}
          onChange={e => setPlaceholder(e.target.value)} fullWidth />

        <FormControlLabel
          control={<Switch checked={isRequired} onChange={e => setIsRequired(e.target.checked)} />}
          label="Required"
        />

        {(questionType === 'SINGLE_LINE_TEXT' || questionType === 'PARAGRAPH') && (
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField size="small" label="Min Length" type="number" value={minLength}
              onChange={e => setMinLength(e.target.value)} fullWidth />
            <TextField size="small" label="Max Length" type="number" value={maxLength}
              onChange={e => setMaxLength(e.target.value)} fullWidth />
          </Box>
        )}

        <TextField size="small" label="Default Value (optional)" value={defaultValue}
          onChange={e => setDefaultValue(e.target.value)} fullWidth />

        {OPTION_BASED_TYPES.has(questionType) && (
          <>
            <Divider />
            <Typography variant="subtitle2">Options</Typography>
            {options.map((opt, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField size="small" label="Label" value={opt.label} fullWidth
                  onChange={e => setOptions(prev => prev.map((o, idx) => idx === i ? { ...o, label: e.target.value, value: o.value || e.target.value } : o))} />
                <TextField size="small" label="Value" value={opt.value} fullWidth
                  onChange={e => setOptions(prev => prev.map((o, idx) => idx === i ? { ...o, value: e.target.value } : o))} />
                <IconButton size="small" color="error" onClick={() => setOptions(prev => prev.filter((_, idx) => idx !== i))} aria-label={`Delete option ${i + 1}`}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button size="small" startIcon={<AddIcon />}
              onClick={() => setOptions(prev => [...prev, { label: '', value: '' }])}>
              Add Option
            </Button>
          </>
        )}

        <Divider />
        <Typography variant="subtitle2">Conditional Display Logic</Typography>
        <Typography variant="caption" color="text.secondary">
          Show or hide this question based on the answer to an earlier question. Multiple conditions are combined with AND.
        </Typography>
        {conditions.map((c, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField select size="small" label="Action" value={c.action} sx={{ width: 100 }}
              onChange={e => setConditions(prev => prev.map((cc, idx) => idx === i ? { ...cc, action: e.target.value as any } : cc))}>
              <MenuItem value="SHOW">Show</MenuItem>
              <MenuItem value="HIDE">Hide</MenuItem>
            </TextField>
            <Typography variant="body2">if</Typography>
            <TextField select size="small" label="Question" value={c.sourceQuestionId} sx={{ minWidth: 160 }}
              onChange={e => setConditions(prev => prev.map((cc, idx) => idx === i ? { ...cc, sourceQuestionId: e.target.value } : cc))}>
              {otherQuestions.map(q => <MenuItem key={q.id} value={q.id}>{q.questionText.slice(0, 40)}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Operator" value={c.operator} sx={{ width: 140 }}
              onChange={e => setConditions(prev => prev.map((cc, idx) => idx === i ? { ...cc, operator: e.target.value as any } : cc))}>
              <MenuItem value="EQUALS">Equals</MenuItem>
              <MenuItem value="NOT_EQUALS">Not Equals</MenuItem>
              <MenuItem value="GREATER_THAN">Greater Than</MenuItem>
              <MenuItem value="LESS_THAN">Less Than</MenuItem>
              <MenuItem value="CONTAINS">Contains</MenuItem>
            </TextField>
            <TextField size="small" label="Value" value={c.comparisonValue} sx={{ width: 100 }}
              onChange={e => setConditions(prev => prev.map((cc, idx) => idx === i ? { ...cc, comparisonValue: e.target.value } : cc))} />
            <IconButton size="small" color="error" onClick={() => setConditions(prev => prev.filter((_, idx) => idx !== i))} aria-label={`Delete condition ${i + 1}`}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        <Button size="small" startIcon={<AddIcon />} disabled={otherQuestions.length === 0}
          onClick={() => setConditions(prev => [...prev, {
            sourceQuestionId: otherQuestions[0]?.id ?? '', operator: 'EQUALS', comparisonValue: '', action: 'SHOW',
          }])}>
          Add Condition
        </Button>

        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!questionText.trim() || saveMutation.isPending}
          onClick={() => { setError(''); saveMutation.mutate(); }}>
          {saveMutation.isPending ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// -- Header image (hospital logo/banner) ---------------------------------------------

function HeaderImageEditor({
  headerImageUrl, headerImageType, uploading, onUpload, onRemove,
}: {
  headerImageUrl: string | null;
  headerImageType: 'LOGO' | 'BANNER' | null;
  uploading: boolean;
  onUpload: (file: File, type: 'LOGO' | 'BANNER') => void;
  onRemove: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingType, setPendingType] = useState<'LOGO' | 'BANNER'>(headerImageType ?? 'LOGO');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file, pendingType);
    e.target.value = '';
  };

  return (
    <Box sx={{ mb: 2, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Hospital Logo / Banner</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Shown above the form title on the public feedback portal. A logo is shown small and centered;
        a banner spans the full width as a hero image.
      </Typography>

      {headerImageUrl ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box
            component="img"
            src={headerImageUrl}
            alt="Form header"
            sx={{
              maxWidth: headerImageType === 'BANNER' ? 320 : 120,
              maxHeight: 90,
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              objectFit: 'contain',
            }}
          />
          <Chip size="small" label={headerImageType ?? 'LOGO'} />
          <Button size="small" startIcon={<CloudUploadIcon />} disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Uploading...' : 'Replace'}
          </Button>
          <Button size="small" color="error" onClick={onRemove}>Remove</Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField select size="small" label="Type" value={pendingType}
            onChange={e => setPendingType(e.target.value as 'LOGO' | 'BANNER')} sx={{ width: 140 }}>
            <MenuItem value="LOGO">Logo</MenuItem>
            <MenuItem value="BANNER">Banner</MenuItem>
          </TextField>
          <Button size="small" variant="outlined" startIcon={<CloudUploadIcon />} disabled={uploading}
            onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Uploading...' : 'Upload Image'}
          </Button>
        </Box>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        hidden
        onChange={handleFileChange}
      />
    </Box>
  );
}

// -- Splash screen (shown before the form, on first visit) --------------------------

const MIN_SPLASH_DURATION = 1;
const MAX_SPLASH_DURATION = 15;
const DEFAULT_SPLASH_DURATION = 3;

/** width / height -- matches a typical phone screen, so what the admin frames in the crop tool is exactly what patients will see full-screen. */
const SPLASH_ASPECT_RATIO = 9 / 16;

function SplashScreenEditor({
  splashImageUrl, splashDurationSeconds, uploading, onUpload, onRemove,
}: {
  splashImageUrl: string | null;
  splashDurationSeconds: number | null;
  uploading: boolean;
  onUpload: (file: Blob, fileName: string, durationSeconds: number) => void;
  onRemove: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDuration, setPendingDuration] = useState(splashDurationSeconds ?? DEFAULT_SPLASH_DURATION);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const clampDuration = (n: number) => Math.min(MAX_SPLASH_DURATION, Math.max(MIN_SPLASH_DURATION, Math.round(n) || DEFAULT_SPLASH_DURATION));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCropFile(file); // opens the crop dialog -- upload happens once they hit "Apply Crop"
    e.target.value = '';
  };

  return (
    <Box sx={{ mb: 2, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Splash Screen</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        A full-screen image shown for a few seconds before the form appears, the first time someone opens this
        feedback link. Great for a welcome message or hospital branding. After you pick an image, you'll be able
        to drag and zoom it to fit a phone screen exactly, so nothing important gets cropped off unexpectedly.
      </Typography>

      {splashImageUrl ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box
            component="img"
            src={splashImageUrl}
            alt="Splash screen"
            sx={{ maxWidth: 90, maxHeight: 140, borderRadius: 1, border: '1px solid', borderColor: 'divider', objectFit: 'cover' }}
          />
          <Chip size="small" label={`${splashDurationSeconds ?? DEFAULT_SPLASH_DURATION}s`} />
          <Button size="small" startIcon={<CloudUploadIcon />} disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Uploading...' : 'Replace'}
          </Button>
          <Button size="small" color="error" onClick={onRemove}>Remove</Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField
            size="small" type="number" label="Seconds" value={pendingDuration}
            onChange={e => setPendingDuration(Number(e.target.value))}
            inputProps={{ min: MIN_SPLASH_DURATION, max: MAX_SPLASH_DURATION }}
            sx={{ width: 110 }}
          />
          <Button size="small" variant="outlined" startIcon={<CloudUploadIcon />} disabled={uploading}
            onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Uploading...' : 'Upload Image'}
          </Button>
        </Box>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={handleFileChange}
      />

      <ImageCropDialog
        open={!!cropFile}
        file={cropFile}
        aspectRatio={SPLASH_ASPECT_RATIO}
        title="Adjust Splash Screen"
        onCancel={() => setCropFile(null)}
        onCropped={(blob, fileName) => {
          onUpload(blob, fileName, clampDuration(pendingDuration));
          setCropFile(null);
        }}
      />
    </Box>
  );
}

// -- Translations (multi-language) --------------------------------------------------

interface FeedbackLanguagePoolEntry { id: string; code: string; name: string; isActive: boolean; }
interface TranslatableFieldRow {
  entityType: 'FORM' | 'SECTION' | 'QUESTION' | 'OPTION';
  entityId: string;
  fieldName: string;
  sourceText: string;
  translatedText: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Form Name', description: 'Description', title: 'Section Title',
  questionText: 'Question', helpText: 'Help Text', placeholder: 'Placeholder', label: 'Option',
};

/**
 * Self-contained -- fetches its own data rather than threading translation
 * state through the parent's form-fetch/mutations, since translating is a
 * mostly-independent concern from editing the form's own-language content.
 * Not shown at all if there's no other active language in the pool besides
 * the form's own base language (nothing to translate into).
 */
function TranslationsEditor({ formId, baseLanguage }: { formId: string; baseLanguage: string }) {
  const [open, setOpen] = useState(false);
  const [languageCode, setLanguageCode] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const queryClient = useQueryClient();

  const { data: pool = [] } = useQuery<FeedbackLanguagePoolEntry[]>({
    queryKey: ['feedback-languages'],
    queryFn: () => apiClient.get('/feedback/languages').then(r => r.data),
  });
  const translatableLanguages = pool.filter(l => l.isActive && l.code !== baseLanguage);

  const { data: fields = [], isLoading: fieldsLoading } = useQuery<TranslatableFieldRow[]>({
    queryKey: ['feedback-form-translations', formId, languageCode],
    queryFn: () => apiClient.get(`/feedback/forms/${formId}/translations/${languageCode}`).then(r => r.data),
    enabled: open && !!languageCode,
  });

  const openFor = (code: string) => {
    setLanguageCode(code);
    setEdits({});
    setSaveError('');
    setOpen(true);
  };

  const fieldKey = (f: { entityType: string; entityId: string; fieldName: string }) => `${f.entityType}:${f.entityId}:${f.fieldName}`;
  const valueFor = (f: TranslatableFieldRow) => edits[fieldKey(f)] ?? f.translatedText ?? '';

  const saveMutation = useMutation({
    mutationFn: () => apiClient.put(`/feedback/forms/${formId}/translations/${languageCode}`, {
      items: fields.map(f => ({
        entityType: f.entityType, entityId: f.entityId, fieldName: f.fieldName,
        value: edits[fieldKey(f)] ?? f.translatedText ?? '',
      })),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback-form-translations', formId, languageCode] });
      queryClient.invalidateQueries({ queryKey: ['feedback-form-languages', formId] });
      setOpen(false);
    },
    onError: (e: any) => setSaveError(e?.response?.data?.message ?? 'Failed to save translations'),
  });

  if (translatableLanguages.length === 0) return null;

  return (
    <Box sx={{ mb: 2, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Translations</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Translate this form's text into another language for the public portal. Untranslated fields fall back to
        the original text ({baseLanguage.toUpperCase()}) automatically -- there's no need to translate everything at once.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {translatableLanguages.map(l => (
          <Button key={l.code} size="small" variant="outlined" onClick={() => openFor(l.code)}>
            {l.name}
          </Button>
        ))}
      </Box>

      <ResponsiveDialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Translate to {pool.find(l => l.code === languageCode)?.name ?? languageCode}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {fieldsLoading && <CircularProgress size={24} />}
          {!fieldsLoading && fields.map(f => (
            <Box key={fieldKey(f)}>
              <Typography variant="caption" color="text.secondary">
                {FIELD_LABELS[f.fieldName] ?? f.fieldName} -- original: <em>{f.sourceText}</em>
              </Typography>
              <TextField
                fullWidth size="small"
                multiline={f.fieldName === 'description' || f.fieldName === 'questionText' || f.fieldName === 'helpText'}
                placeholder={f.sourceText}
                value={valueFor(f)}
                onChange={e => setEdits(prev => ({ ...prev, [fieldKey(f)]: e.target.value }))}
              />
            </Box>
          ))}
          {saveError && <Alert severity="error">{saveError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || fieldsLoading}>
            {saveMutation.isPending ? 'Saving...' : 'Save Translations'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
