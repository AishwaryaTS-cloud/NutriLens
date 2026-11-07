import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="nl-container not-found">
      <p className="nl-eyebrow">Error 404</p>
      <h1 className="not-found__title">Page not found</h1>
      <p className="not-found__text">That address doesn’t exist in NutriLens.</p>
      <Link to="/" className="nl-btn nl-btn--primary">
        Back to status
      </Link>
    </section>
  );
}
