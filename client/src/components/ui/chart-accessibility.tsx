type AccessibleChartSummaryItem = {
  label: string;
  value: string;
};

type AccessibleChartSummaryProps = {
  title: string;
  summary: string;
  items?: AccessibleChartSummaryItem[];
};

export function AccessibleChartSummary({
  title,
  summary,
  items = [],
}: AccessibleChartSummaryProps) {
  if (!summary && items.length === 0) {
    return null;
  }

  return (
    <div className="sr-only">
      <h3>{title}</h3>
      {summary ? <p>{summary}</p> : null}
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={`${item.label}:${item.value}`}>
              {item.label}: {item.value}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
