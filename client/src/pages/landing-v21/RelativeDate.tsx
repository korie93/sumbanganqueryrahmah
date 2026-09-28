export function RelativeDate({ daysAgo }: { daysAgo: number }) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return <div className="rel-date">{date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</div>;
}
