import Link from "next/link";

export function SiteFooter() {
  return (
    <footer id="contact" className="border-t border-[#e5e5e5] bg-[#ededed]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#d99e64] shadow-inner">
            <span className="font-[family-name:var(--font-lora)] text-lg font-semibold text-white">
              O
            </span>
          </div>
          <div>
            <p className="font-[family-name:var(--font-lora)] text-lg font-semibold text-[#2d3330]">
              Onalani
            </p>
            <p className="text-sm text-[#6b7280]">Consistently easy stays</p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-[#5c6360]">
          <Link href="/#why-us" className="transition hover:text-[#2d3330]">
            Why Book Direct
          </Link>
          <Link href="/properties" className="transition hover:text-[#2d3330]">
            Cancellation Policy
          </Link>
          <Link href="/properties" className="transition hover:text-[#2d3330]">
            Privacy
          </Link>
          <Link href="/properties" className="transition hover:text-[#2d3330]">
            Terms
          </Link>
          <Link href="/#contact" className="transition hover:text-[#2d3330]">
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}
