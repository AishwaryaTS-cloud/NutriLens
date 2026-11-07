/** The NutriLens mark: a food label with its heavy header rule. */
export default function LabelMark({ size = 28 }) {
  return (
    <svg
      className="nl-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="3" strokeWidth="2" />
      <path d="M3 9h18" strokeWidth="3.5" />
      <path d="M7 14h10M7 17.5h6" strokeWidth="1.5" />
    </svg>
  );
}
