export type CategoryRule = {
  key: string;
  terms: string[];
  fields: string[];
  matchMode?: string;
  enabled?: boolean;
};

export type CategoryStatSample = {
  name: string;
  ic: string;
  source: string | null;
};

export type CategoryStatRow = {
  key: string;
  total: number;
  samples: CategoryStatSample[];
  updatedAt: Date | null;
};
