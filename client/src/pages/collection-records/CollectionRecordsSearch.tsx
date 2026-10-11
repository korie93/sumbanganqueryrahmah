import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CollectionRecordsSearchProps = {
  mobile: boolean;
  value: string;
  onChange: (value: string) => void;
};

/** Search stays mounted outside the optional filters, including on mobile. */
export function CollectionRecordsSearch({ mobile, value, onChange }: CollectionRecordsSearchProps) {
  const id = mobile ? "collection-records-search-mobile" : "collection-records-search";
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <Label htmlFor={id}>Search</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id={id}
          name={mobile ? "collectionRecordsSearchMobile" : "collectionRecordsSearch"}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Cari nama / IC / akaun / Card No / batch / telefon / jumlah bayaran"
          className="h-11 min-w-0 rounded-md bg-background pl-9 text-base sm:h-11 md:text-sm"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
