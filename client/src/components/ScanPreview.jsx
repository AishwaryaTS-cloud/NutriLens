/**
 * Decorative illustration of a label being scanned. It deliberately shows no numbers or
 * results: it is artwork, not output.
 */
export default function ScanPreview() {
  return (
    <div className="scan-preview" aria-hidden="true">
      <div className="scan-preview__head" />
      <div className="scan-preview__title" />
      <div className="scan-preview__rule" />
      {[72, 54, 64, 40, 58, 46].map((width, index) => (
        <div className="scan-preview__row" key={index}>
          <span style={{ width: `${width}%` }} />
          <span className="scan-preview__value" />
        </div>
      ))}
      <div className="scan-preview__beam" />
    </div>
  );
}
