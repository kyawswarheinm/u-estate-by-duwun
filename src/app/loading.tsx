import { Text } from "@/i18n/Text";
export default function Loading() {
  return <div className="loading-surface" role="status" >
    <span className="sr-only"><Text message="Loading…" /></span>
    <div aria-hidden="true" className="skeleton h-12 w-2/3 rounded-xl" />
    <div className="skeleton mt-6 h-80 rounded-3xl" />
    <div className="mt-8 grid gap-6 sm:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="skeleton h-72 rounded-3xl" />)}</div>
  </div>;
}
