import Icon from '../components/Icon.jsx';

const SWATCHES = [
  { name: 'Label stock', token: '--bg', use: 'Page background' },
  { name: 'Surface', token: '--surface', use: 'Panels and cards' },
  { name: 'Ink', token: '--ink', use: 'Text and heavy rules' },
  { name: 'Leaf', token: '--leaf', use: 'Primary actions' },
  { name: 'Turmeric', token: '--turmeric', use: 'Highlights that need attention' },
  { name: 'Chilli', token: '--chilli', use: 'Errors and destructive actions' },
];

const OUTCOMES = [
  { label: 'Good', icon: 'check', className: 'nl-chip--good' },
  { label: 'Fair', icon: 'minus', className: 'nl-chip--fair' },
  { label: 'Caution', icon: 'alert', className: 'nl-chip--caution' },
  { label: 'Poor', icon: 'x', className: 'nl-chip--poor' },
];

function Section({ title, note, children }) {
  return (
    <section className="ds-section">
      <h2 className="ds-section__title">{title}</h2>
      {note && <p className="ds-section__note">{note}</p>}
      <div className="ds-section__body">{children}</div>
    </section>
  );
}

/** Development-only page (hidden in production builds) for reviewing the design tokens. */
export default function DesignSystem() {
  return (
    <div className="nl-container ds">
      <header>
        <p className="nl-eyebrow">Development</p>
        <h1 className="ds__title">Design system</h1>
        <p className="ds__lead">
          Every screen uses these tokens, defined once as CSS variables. The look comes from a
          printed food label: heavy rules, tight numerals and plain ink on label stock. Use the
          toggle in the header to check both themes.
        </p>
      </header>

      <Section title="Colour" note="Defined in assets/styles/tokens.css for light and dark themes.">
        <ul className="ds-swatches">
          {SWATCHES.map((swatch) => (
            <li key={swatch.token}>
              <div className="ds-swatch" style={{ backgroundColor: `var(${swatch.token})` }} aria-hidden="true" />
              <p className="ds-swatch__name">{swatch.name}</p>
              <p className="ds-swatch__use">{swatch.use}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Type"
        note="Bricolage Grotesque for headings, IBM Plex Sans for reading. Numbers use tabular figures so columns line up."
      >
        <p className="ds-type ds-type--display">Display</p>
        <p className="ds-type ds-type--heading">Heading</p>
        <p className="ds-type ds-type--sub">Subheading</p>
        <p className="ds-type ds-type--body">
          Body text. Sodium, sugar and saturated fat are shown per 100 g so two products can be
          compared fairly.
        </p>
        <p className="ds-type ds-type--small">Small text for supporting detail and hints.</p>
        <p className="ds-type ds-type--numbers">1,284 mg &nbsp; 12.5 g &nbsp; 340 kcal</p>
      </Section>

      <Section title="Buttons" note="Touch targets are at least 44 px tall. Hover, focus and pressed states are all defined.">
        <div className="ds-row">
          <button type="button" className="nl-btn nl-btn--primary">Primary</button>
          <button type="button" className="nl-btn nl-btn--secondary">Secondary</button>
          <button type="button" className="nl-btn nl-btn--outline">Outline</button>
          <button type="button" className="nl-btn nl-btn--ghost">Ghost</button>
          <button type="button" className="nl-btn nl-btn--danger">Delete scan</button>
          <button type="button" className="nl-btn nl-btn--primary" disabled>Disabled</button>
        </div>
        <div className="ds-row">
          <button type="button" className="nl-btn nl-btn--primary nl-btn--sm">Small</button>
          <button type="button" className="nl-btn nl-btn--primary">Default</button>
          <button type="button" className="nl-btn nl-btn--primary nl-btn--lg">Large</button>
        </div>
      </Section>

      <Section
        title="Outcome markers"
        note="Meaning always comes from the word and the icon, never from colour alone. Final names and thresholds are decided with the scoring rules."
      >
        <ul className="ds-row">
          {OUTCOMES.map((outcome) => (
            <li key={outcome.label} className={`nl-chip ${outcome.className}`}>
              <Icon name={outcome.icon} size={16} />
              {outcome.label}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
