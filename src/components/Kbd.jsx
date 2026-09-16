// Small always-visible key hint, not a hover tooltip — the GM asked to see shortcuts on the
// button itself so they don't have to remember or hover to find them.
export default function Kbd({ children }) {
  return (
    <span className="ml-1.5 px-1 text-[10px] font-mono leading-4 rounded border border-current opacity-60 align-middle">
      {children}
    </span>
  );
}
