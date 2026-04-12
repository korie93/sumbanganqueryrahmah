export async function collectOffsetChunkRows<T>(
  loadChunk: (offset: number) => Promise<T[]>,
  queryPageLimit: number,
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const chunk = await loadChunk(offset);
    if (!chunk.length) {
      break;
    }

    rows.push(...chunk);
    if (chunk.length < queryPageLimit) {
      break;
    }

    offset += chunk.length;
  }

  return rows;
}

export async function collectPagedResults<TPageResult extends {
  pageSize: number;
  total: number;
}, TRow>(
  loadPage: (page: number) => Promise<TPageResult>,
  selectRows: (pageResult: TPageResult) => TRow[],
): Promise<TRow[]> {
  const rows: TRow[] = [];
  let page = 1;

  while (true) {
    const pageResult = await loadPage(page);
    const pageRows = selectRows(pageResult);

    rows.push(...pageRows);
    if (rows.length >= pageResult.total || pageRows.length < pageResult.pageSize) {
      break;
    }

    page += 1;
  }

  return rows;
}
