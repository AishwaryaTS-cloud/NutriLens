import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

const FEATURES = [
  { icon: 'scan', title: 'Read any label from a photo', text: 'Snap or upload a packaged food label. Gemini Vision reads the nutrition table and ingredients for you.' },
  { icon: 'edit', title: 'You stay in control', text: 'Check what was read and correct any value before anything is calculated.' },
  { icon: 'sliders', title: 'Scored for you', text: 'A Personal Match Score reflects your diet, nutrient priorities and goals, not a one-size-fits-all rating.' },
  { icon: 'shield', title: 'Allergen warnings first', text: 'Confirmed allergens and “may contain” notes are shown separately. A good score never hides them.' },
  { icon: 'compare', title: 'Compare two products', text: 'Put two saved scans side by side and see which one fits you better, and why.' },
  { icon: 'history', title: 'Your scan history', text: 'Save scans, search them later and revisit the full analysis any time.' },
];

const STEPS = [
  { title: 'Scan the label', text: 'Upload a clear photo of the nutrition table and ingredient list.' },
  { title: 'Review what was read', text: 'Gemini extracts the values. You check them and fix anything that looks off.' },
  { title: 'Get your analysis', text: 'See your match score, nutrient levels, ingredient notes and allergen warnings.' },
  { title: 'Save and compare', text: 'Keep the scan in your history and compare it with another product.' },
];

const LEVELS = [
  { name: 'Sugar', value: '4.2 g', level: 'low' },
  { name: 'Sodium', value: '480 mg', level: 'medium' },
  { name: 'Saturated fat', value: '7.8 g', level: 'high' },
  { name: 'Fibre', value: '6.1 g', level: 'high', good: true },
];

function ExampleResult() {
  return (
    <figure className="example" aria-label="Example of an analysis result">
      <div className="example__bar">
        <span className="example__tag">Example</span>
        <span>Analysis result</span>
      </div>
      <div className="example__body">
        <div className="example__score">
          <div className="score-ring score-ring--good" aria-hidden="true">
            <span className="score-ring__value">78</span>
            <span className="score-ring__of">out of 100</span>
          </div>
          <div>
            <p className="example__label">Personal Match Score</p>
            <p className="example__product">Oat &amp; seed granola</p>
            <p className="example__muted">A strong match for your goals</p>
          </div>
        </div>
        <ul className="example__levels">
          {LEVELS.map((n) => (
            <li key={n.name}>
              <span>{n.name}</span>
              <span className="example__value">{n.value}</span>
              <span className={`level level--${n.level}${n.good ? ' level--good' : ''}`}>{n.level === 'low' ? 'Low' : n.level === 'medium' ? 'Medium' : 'High'}</span>
            </li>
          ))}
        </ul>
        <p className="example__allergen"><Icon name="alert" size={18} /> May contain: tree nuts</p>
      </div>
    </figure>
  );
}

export default function Landing() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="nl-container hero__inner">
          <div className="hero__copy">
            <p className="nl-eyebrow">AI-powered food label intelligence</p>
            <h1 id="hero-title" className="hero__title">See what’s really on the label.</h1>
            <p className="hero__lead">
              Understand nutrition. Discover ingredients. Make better food choices. NutriLens reads a packaged
              food label from a photo and explains it in plain language, based on your own diet and allergens.
            </p>
            <div className="hero__actions">
              <Link to="/register" className="nl-btn nl-btn--primary nl-btn--lg">
                <Icon name="scan" size={20} /> Scan a product
              </Link>
              <Link to="/login" className="nl-btn nl-btn--outline nl-btn--lg">Log in</Link>
            </div>
            <p className="hero__fine">Free to start. Your label photos are not stored.</p>
          </div>
          <div className="hero__aside"><ExampleResult /></div>
        </div>
      </section>

      <section className="section" id="features" aria-labelledby="features-title">
        <div className="nl-container">
          <div className="section__head">
            <p className="nl-eyebrow">Features</p>
            <h2 id="features-title" className="section__title">Everything you need to read a label with confidence</h2>
          </div>
          <ul className="feature-grid">
            {FEATURES.map((f) => (
              <li key={f.title} className="feature">
                <span className="feature__icon"><Icon name={f.icon} size={22} /></span>
                <h3 className="feature__title">{f.title}</h3>
                <p>{f.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section section--tint" id="how-it-works" aria-labelledby="how-title">
        <div className="nl-container">
          <div className="section__head">
            <p className="nl-eyebrow">How it works</p>
            <h2 id="how-title" className="section__title">From photo to personal insight in four steps</h2>
          </div>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="steps__item">
                <span className="steps__num" aria-hidden="true">{i + 1}</span>
                <h3 className="steps__title">{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section" id="analysis" aria-labelledby="analysis-title">
        <div className="nl-container split">
          <div>
            <p className="nl-eyebrow">Nutrition analysis</p>
            <h2 id="analysis-title" className="section__title">Numbers you can actually understand</h2>
            <p className="split__lead">
              Every nutrient is marked Low, Medium or High, so you can see at a glance what a product is made of.
              Your Personal Match Score combines your preferences, the nutrition quality and the ingredients into one clear number.
            </p>
            <ul className="checklist">
              <li><Icon name="check" size={20} /> Personal Match Score out of 100</li>
              <li><Icon name="check" size={20} /> Nutrition quality and ingredient scores</li>
              <li><Icon name="check" size={20} /> Plain-language explanation and suggestions</li>
            </ul>
          </div>
          <div className="split__panel split__panel--allergen">
            <p className="nl-eyebrow">Allergen detection</p>
            <h3 className="split__panel-title">Safety is never hidden behind a score</h3>
            <p>
              Save your allergens once, including custom ones. NutriLens flags confirmed ingredients and
              “may contain” warnings, and tells you when the label doesn’t give enough information to be sure.
            </p>
            <p className="split__panel-note"><Icon name="shield" size={18} /> Always check the printed label as well.</p>
          </div>
        </div>
      </section>

      <section className="section section--tint" aria-labelledby="compare-title">
        <div className="nl-container split split--reverse">
          <div className="compare-demo" aria-hidden="true">
            <div className="compare-demo__col"><span>Product A</span><strong>72</strong><i style={{ width: '72%' }} /></div>
            <div className="compare-demo__col compare-demo__col--b"><span>Product B</span><strong>54</strong><i style={{ width: '54%' }} /></div>
          </div>
          <div>
            <p className="nl-eyebrow">Product comparison</p>
            <h2 id="compare-title" className="section__title">Two products, one clear answer</h2>
            <p className="split__lead">
              Compare nutrition, ingredients, allergens and your Personal Match Score side by side,
              so choosing between two products takes seconds.
            </p>
          </div>
        </div>
      </section>

      <section className="cta" aria-labelledby="cta-title">
        <div className="nl-container cta__inner">
          <h2 id="cta-title" className="cta__title">Ready to see what’s really on the label?</h2>
          <p>Create a free account and scan your first product in under a minute.</p>
          <Link to="/register" className="nl-btn nl-btn--on-dark nl-btn--lg">
            Scan a product <Icon name="arrow" size={20} />
          </Link>
        </div>
      </section>
    </>
  );
}
