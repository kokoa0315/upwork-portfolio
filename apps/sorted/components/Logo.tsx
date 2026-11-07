export function Logo() {
  return (
    <p className="flex items-center gap-2 font-semibold">
      <span className="grid size-6 place-items-center rounded-md bg-brand text-white">
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
          <path d="M3 4.5h10M3 8h7M3 11.5h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      Sorted
    </p>
  );
}
