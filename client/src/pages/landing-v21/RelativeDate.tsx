// All preview rows share the same locale/options; avoid constructing a locale
// formatter for each cell (and again whenever the preview tab remounts).
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric",
});

export function RelativeDate({ daysAgo }: { daysAgo: number }) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return <div className="rel-date">{dateFormatter.format(date)}</div>;
}
