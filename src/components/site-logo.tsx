import Link from "next/link";

export function SiteLogo({
  className = "",
  variant = "hero",
}: {
  className?: string;
  variant?: "hero" | "light";
}) {
  const text =
    variant === "hero"
      ? "text-[#8ecae6]"
      : "text-[#6ba8c4]";
  return (
    <Link href="/" className={`group inline-flex flex-col ${className}`}>
      <span
        className={`font-[family-name:var(--font-lora)] text-2xl font-normal lowercase tracking-[0.02em] md:text-[1.65rem] ${text}`}
      >
        onalani
      </span>
      <svg
        className={`mt-1.5 h-2.5 w-[4.25rem] ${text}`}
        viewBox="0 0 68 10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M1 6C12 1 22 9 34 5C46 1 56 9 67 5"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
    </Link>
  );
}
