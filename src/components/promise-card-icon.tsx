/** Hand + value motif aligned with marketing cards */
export function PromiseCardIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        width="40"
        height="40"
        rx="12"
        className="fill-[#f0f0f0]"
      />
      <path
        d="M12 22c0-1.5 1-2.5 2.5-2.5h1c.8 0 1.5.4 2 1l1.2 1.6c.3.4.8.6 1.3.5l3.5-.8c1.2-.3 2.4.5 2.7 1.7l.3 1.2c.2.8-.3 1.6-1.1 1.8l-4.5 1.2c-2 .5-4.1-.3-5.2-2l-1.5-2.2"
        className="stroke-[#4a5563]"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="25" cy="14" r="4.5" className="fill-[#c9a227]" />
      <path
        d="M23 14h4M25 12v4"
        className="stroke-[#8b6914]"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </svg>
  );
}
