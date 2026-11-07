export function Logo({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <span className="flex items-center gap-2 font-semibold">
      <span className={`grid place-items-center rounded-md bg-brand text-white ${size === "md" ? "size-7" : "size-6"}`}>
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
          <path d="M8 2 13.2 5v6L8 14 2.8 11V5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      </span>
      Cobalt
    </span>
  );
}
