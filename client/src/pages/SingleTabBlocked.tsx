import { AlertTriangle, RefreshCcw } from "lucide-react";
import { PublicAuthLayout } from "@/components/PublicAuthLayout";
import { Button } from "@/components/ui/button";

interface SingleTabBlockedProps {
  onRetry?: () => void;
}

export default function SingleTabBlocked({ onRetry }: SingleTabBlockedProps) {
  return (
    <PublicAuthLayout
      badge="Satu Tab Aktif"
      title="Tab tambahan tidak dibenarkan"
      description="Untuk elak konflik data dan kekeliruan semasa operasi, setiap akaun hanya dibenarkan menggunakan satu halaman sistem yang aktif pada satu masa."
      icon={<AlertTriangle className="h-7 w-7 text-amber-200" />}
      showBackButton={false}
    >
      <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-5 py-4 text-sm leading-7 text-white/85">
        Akaun ini sedang aktif dalam tab lain. Kembali ke tab utama anda, atau tutup tab tersebut dahulu sebelum meneruskan di sini.
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          className="flex-1"
          onClick={() => {
            onRetry?.();
          }}
        >
          <RefreshCcw className="h-4 w-4" />
          Semak Semula
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1 text-white"
          onClick={() => {
            window.close();
          }}
        >
          Tutup Tab Ini
        </Button>
      </div>

      <p className="text-center text-xs leading-6 text-white/60">
        Jika tab utama sudah ditutup, klik <span className="font-semibold text-white/80">Semak Semula</span>.
        Sistem akan aktif semula secara automatik apabila lock tab lama dilepaskan.
      </p>
    </PublicAuthLayout>
  );
}
