import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import ScanPreview from '../components/ScanPreview.jsx';
import StatusPanel from '../components/StatusPanel.jsx';
import { useHealth } from '../hooks/useHealth.js';

const PLANNED_STEPS = [
  { title: 'Photograph the label', text: 'Take a photo or upload one. Blurry or unreadable photos are caught early.' },
  { title: 'Read it', text: 'The label text is read with OCR and turned into nutrition values and ingredients.' },
  { title: 'Check it', text: 'Allergens, marketing claims and serving sizes are checked with fixed, visible rules.' },
  { title: 'Understand it', text: 'A personal match score comes with a “Why” panel, and AI only explains the result.' },
];

export default function Landing() {
  const { view, health, latencyMs, isFetching, recheck } = useHealth();

  return (
    <>
      <section className="nl-container hero" aria-labelledby="hero-title">
        <div className="hero__copy">
          <p className="nl-eyebrow">AI-powered food label intelligence</p>
          <h1 id="hero-title" className="hero__title">
            See what’s really on the label.
          </h1>
          <p className="hero__lead">
            NutriLens will read a packaged food label from a photo and turn it into clear, personal
            insights: nutrition, allergens, claims and a score you can understand.
          </p>
          <p className="hero__note">
            <Icon name="minus" size={18} />
            Foundation build. Sign-in and scanning are not available yet.
          </p>
          <div className="hero__actions">
            <button type="button" className="nl-btn nl-btn--primary" onClick={recheck} disabled={isFetching}>
              {isFetching ? 'Checking…' : 'Check system status'}
            </button>
            {import.meta.env.DEV && (
              <Link to="/design-system" className="nl-btn nl-btn--outline">
                Design system
                <Icon name="arrow" size={18} />
              </Link>
            )}
          </div>
        </div>

        <div className="hero__aside">
          <StatusPanel view={view} health={health} latencyMs={latencyMs} />
        </div>
      </section>

      <section className="nl-container plan" aria-labelledby="plan-title">
        <div>
          <p className="nl-eyebrow">Planned</p>
          <h2 id="plan-title" className="plan__title">
            How NutriLens will work
          </h2>
          <ol className="plan__list">
            {PLANNED_STEPS.map((step, index) => (
              <li className="plan__item" key={step.title}>
                <span className="plan__number" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <h3 className="plan__item-title">{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <ScanPreview />
      </section>
    </>
  );
}
