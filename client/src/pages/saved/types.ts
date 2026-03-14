export interface SavedProps {
  onNavigate: (page: string, importId?: string) => void;
  userRole: string;
}

export interface ImportItem {
  id: string;
  name: string;
  filename: string;
  createdAt: string;
  rowCount?: number;
}
