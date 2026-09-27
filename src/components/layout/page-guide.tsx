export function PageGuide({ children }: { children: string }) {
  return (
    <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
      {children}
    </p>
  );
}
