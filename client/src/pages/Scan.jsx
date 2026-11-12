import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AnalysisView from '../components/AnalysisView.jsx';
import Icon from '../components/Icon.jsx';
import ImageDropzone from '../components/ImageDropzone.jsx';
import LabelReviewForm from '../components/LabelReviewForm.jsx';
import { formToLabel, quickCheck } from '../hooks/labelForm.js';
import { FALLBACK_OPTIONS, initialScanState, scanReducer, validateImageFile } from '../hooks/scanFlow.js';
import { toApiError } from '../services/apiError.js';
import { analyseLabel, extractLabel, fetchScanOptions, saveScan } from '../services/scanService.js';

const STEPS = ['Choose image', 'Gemini reads it', 'Check and correct', 'Analysis'];
const stepIndex = { idle: 0, selected: 0, extracting: 1, failed: 1, review: 2, analysing: 3, results: 3 };

function Progress({ state }) {
  const uploading = state.progress < 100;
  return (
    <div className="scan-reading" role="status">
      <figure className="scan-reading__figure"><img src={state.previewUrl} alt="The label image being read" /></figure>
      <div>
        <p className="scan-reading__title"><Icon name="loader" size={22} className="nl-spin" />{uploading ? 'Sending the image…' : 'Gemini is reading the label…'}</p>
        <div className="nl-progress" aria-hidden="true"><span style={{ width: `${uploading ? state.progress : 100}%` }} className={uploading ? '' : 'is-indeterminate'} /></div>
        <p className="nl-field__hint">This usually takes a few seconds. Please keep this page open.</p>
      </div>
    </div>
  );
}

export default function Scan() {
  const [state, dispatch] = useReducer(scanReducer, initialScanState);
  const [options, setOptions] = useState(FALLBACK_OPTIONS);
  const abortRef = useRef(null);
  const headingRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchScanOptions().then((o) => !cancelled && setOptions(o)).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const url = state.previewUrl;
    return () => url && URL.revokeObjectURL(url);
  }, [state.previewUrl]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { if (state.phase === 'results' || state.phase === 'review') headingRef.current?.focus(); }, [state.phase]);

  const handleFile = useCallback((file) => {
    const problem = validateImageFile(file, options);
    if (problem) dispatch({ type: 'REJECT_FILE', message: problem });
    else dispatch({ type: 'SELECT', file, previewUrl: URL.createObjectURL(file) });
  }, [options]);

  async function read() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: 'EXTRACT_START' });
    try {
      const extraction = await extractLabel(state.file, { signal: controller.signal, onUploadProgress: (percent) => dispatch({ type: 'PROGRESS', percent }) });
      dispatch({ type: 'EXTRACT_OK', extraction });
    } catch (err) {
      if (err?.code === 'ERR_CANCELED') return;
      dispatch({ type: 'EXTRACT_FAIL', error: toApiError(err) });
    }
  }

  async function analyse() {
    const problems = quickCheck(state.form);
    if (problems.length) {
      dispatch({ type: 'ANALYSE_START' });
      dispatch({ type: 'ANALYSE_FAIL', error: { message: problems.join(' ') }, issues: [] });
      return;
    }
    dispatch({ type: 'ANALYSE_START' });
    try {
      const result = await analyseLabel(formToLabel(state.form));
      dispatch({ type: 'ANALYSE_OK', ...result });
    } catch (err) {
      const error = toApiError(err);
      dispatch({ type: 'ANALYSE_FAIL', error, issues: error.fieldErrors?.issues ?? [] });
    }
  }

  async function save() {
    dispatch({ type: 'SAVE_START' });
    try {
      const scan = await saveScan({ label: state.analysis.label, explanation: state.explanation });
      dispatch({ type: 'SAVED', id: scan.id });
    } catch (err) {
      dispatch({ type: 'SAVE_FAIL', error: toApiError(err) });
    }
  }

  function startOver() {
    abortRef.current?.abort();
    dispatch({ type: 'RESET' });
  }

  const { phase } = state;
  const current = stepIndex[phase];

  return (
    <section className="nl-container scan">
      <header className="scan__header">
        <p className="nl-eyebrow">Scan a label</p>
        <h1 className="scan__title" tabIndex={-1} ref={headingRef}>{phase === 'results' ? 'Your analysis' : phase === 'review' || phase === 'analysing' ? 'Check the label values' : 'Analyse a food label'}</h1>
        {(phase === 'idle' || phase === 'selected') && (
          <p className="scan__lead">Add a photo of a packaged food label. Gemini reads the picture directly, then you check and correct what it found before anything is calculated. Your image is not saved.</p>
        )}
        <ol className="scan__steps" aria-label="Steps">
          {STEPS.map((name, i) => <li key={name} className={i === current ? 'is-current' : i < current ? 'is-done' : ''}>{i + 1}. {name}</li>)}
        </ol>
      </header>

      {state.error && ['idle', 'selected', 'failed', 'review', 'results'].includes(phase) && (
        <p className="nl-alert" role="alert"><Icon name="alert" size={20} /><span>{state.error.message}</span></p>
      )}

      {phase === 'idle' && (
        <>
          <p className="privacy-note">The image you choose is sent to Google’s Gemini API through this server so it can read the label. Do not upload photos of people or personal documents.</p>
          <ImageDropzone onFile={handleFile} maxUploadMb={options.maxUploadMb ?? FALLBACK_OPTIONS.maxUploadMb} allowedTypes={options.allowedTypes} />
          <p className="scan__manual">No photo? <button type="button" className="link-button" onClick={() => dispatch({ type: 'MANUAL' })}>Enter the label values by hand</button></p>
        </>
      )}

      {(phase === 'selected' || phase === 'failed') && (
        <div className="scan-selected">
          <figure className="scan-selected__figure"><img src={state.previewUrl} alt="The label image you chose" /></figure>
          <div className="scan-selected__panel">
            <p className="scan-selected__name">{phase === 'failed' ? 'The label could not be read' : 'Image ready'}</p>
            <p className="nl-field__hint">{phase === 'failed' ? 'You can try again, choose a different photo, or type the values in yourself.' : 'Check that the label is sharp and fully in view. The image is sent only when you press the button.'}</p>
            <div className="review__actions">
              <button type="button" className="nl-btn nl-btn--primary" onClick={read}>{phase === 'failed' ? 'Try again' : 'Read with Gemini'}</button>
              {phase === 'failed' && <button type="button" className="nl-btn nl-btn--outline" onClick={() => dispatch({ type: 'MANUAL' })}>Enter values by hand</button>}
              <button type="button" className="nl-btn nl-btn--ghost" onClick={startOver}>Choose a different image</button>
            </div>
          </div>
        </div>
      )}

      {phase === 'extracting' && <Progress state={state} />}

      {(phase === 'review' || phase === 'analysing') && (
        <LabelReviewForm form={state.form} onChange={(form) => dispatch({ type: 'EDIT', form })} issues={state.issues} extraction={state.extraction} previewUrl={state.previewUrl} busy={phase === 'analysing'} onAnalyse={analyse} onStartOver={startOver} />
      )}

      {phase === 'results' && state.analysis && (
        <AnalysisView analysis={state.analysis} explanation={state.explanation}>
          <div className="result-actions">
            {state.savedId ? (
              <p className="result-actions__saved" role="status"><Icon name="check" size={20} /> Saved. <Link to={`/history/${state.savedId}`}>Open the saved scan</Link> or <Link to="/history">see your history</Link>.</p>
            ) : (
              <button type="button" className="nl-btn nl-btn--primary" onClick={save} disabled={state.saving}>{state.saving ? 'Saving…' : 'Save this scan'}</button>
            )}
            <button type="button" className="nl-btn nl-btn--outline" onClick={() => dispatch({ type: 'BACK_TO_EDIT' })}>Correct the values</button>
            <button type="button" className="nl-btn nl-btn--ghost" onClick={startOver}>Scan another label</button>
          </div>
        </AnalysisView>
      )}
    </section>
  );
}
