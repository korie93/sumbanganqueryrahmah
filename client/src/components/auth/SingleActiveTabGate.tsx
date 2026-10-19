import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Info, LockKeyhole, RefreshCw, ShieldCheck, X } from "lucide-react";
import { SingleTabLock } from "@/lib/singleTabLock";
import "./SingleActiveTabGate.css";

type TabStatus = "checking" | "active" | "blocked" | "unsupported" | "error";

type SingleActiveTabGateProps = {
  accountId: string | number;
  children: ReactNode;
  /** Existing SQR project asset, never a redrawn or generated replacement. */
  logoSrc: string;
  /** Revalidate the existing backend identity before any protected tree mounts. */
  onBeforeActivate?: (signal: AbortSignal) => Promise<boolean>;
};

function Brand({ logoSrc }: { logoSrc: string }) {
  return <div className="sqr-tab-brand" aria-label="Sumbangan Query Rahmah">
    <img className="sqr-tab-brand-image" src={logoSrc} width={48} height={48} alt="" aria-hidden="true" />
    <span className="sqr-tab-brand-copy"><strong>SQR</strong><small>Sumbangan Query Rahmah</small></span>
  </div>;
}

function BrowserIllustration({ logoSrc }: { logoSrc: string }) {
  return <div className="sqr-tab-art" aria-hidden="true">
    <div className="sqr-tab-art-inner">
      <div className="sqr-tab-art-top"><span><i />SATU AKAUN. SATU TAB.</span><small>PERLINDUNGAN SESI</small></div>
      <div className="sqr-tab-windows">
        <div className="sqr-tab-window sqr-tab-window-first">
          <div className="sqr-tab-winbar"><i /><i /><i /><span><LockKeyhole size={10} />sqr-system.com</span></div>
          <div className="sqr-tab-win-content">
            <div className="sqr-tab-minihead"><b><img src={logoSrc} width={24} height={24} alt="" />SQR Utama</b><span>AKTIF</span></div>
            <div className="sqr-tab-skeleton"><i /><i /><i /></div>
            <div className="sqr-tab-skeleton-line" /><div className="sqr-tab-skeleton-line sqr-tab-skeleton-line-short" />
          </div>
        </div>
        <div className="sqr-tab-window sqr-tab-window-second">
          <div className="sqr-tab-winbar"><i /><i /><i /><span><LockKeyhole size={10} />sqr-system.com</span></div>
          <div className="sqr-tab-blocked-mini">
            <span className="sqr-tab-lock-art"><LockKeyhole size={22} /></span>
            <strong>Tab ini disekat</strong><p>Sila guna tab asal.</p>
            <span className="sqr-tab-pill">TAB 2 / DISEKAT</span>
          </div>
        </div>
      </div>
      <div className="sqr-tab-art-caption"><span>Tab asal kekal aktif</span><i /><i /><i /></div>
    </div>
  </div>;
}

type BlockedPageProps = {
  closeNotice: string;
  logoSrc: string;
  onClose: () => void;
  onRetry: () => void;
  retrying: boolean;
  status: Exclude<TabStatus, "checking" | "active">;
};

function BlockedPage({ status, onRetry, onClose, retrying, closeNotice, logoSrc }: BlockedPageProps) {
  const unsupported = status === "unsupported";
  const blocked = status === "blocked";
  return <div className="sqr-tab-page" lang="ms" data-single-tab-status={status}>
    <div className="sqr-tab-wrap">
      <header className="sqr-tab-header">
        <Brand logoSrc={logoSrc} />
        <div className="sqr-tab-header-secure"><i aria-hidden="true" />KAWALAN TAB AKTIF</div>
      </header>
      <main id="main-content" tabIndex={-1} className="sqr-tab-surface" aria-labelledby="sqr-tab-title">
        <section className="sqr-tab-copy">
          <div className="sqr-tab-eyebrow"><span><ShieldCheck size={17} aria-hidden="true" focusable="false" /></span>PERLINDUNGAN SESI SQR</div>
          <h1 id="sqr-tab-title">{blocked
            ? <>Tab tambahan <span>tidak dibenarkan.</span></>
            : unsupported ? <>Pelayar <span>tidak disokong.</span></> : <>Kawalan tab <span>gagal.</span></>}</h1>
          <p className="sqr-tab-lede">{blocked
            ? "Akaun anda sudah dibuka di tab lain. Sila gunakan tab asal untuk terus bekerja."
            : unsupported
              ? "Pelayar ini tidak menyokong kawalan tab yang diperlukan. Gunakan pelayar terkini melalui sambungan HTTPS."
              : "Sila tekan Semak Semula. Jika masih gagal, muat semula halaman."}</p>
          <div className="sqr-tab-rule" />
          <div className="sqr-tab-message" role="status" aria-live="polite" aria-atomic="true">
            <span className="sqr-tab-message-icon"><LockKeyhole size={19} aria-hidden="true" focusable="false" /></span>
            <div><strong>{blocked ? "Tab asal masih aktif" : "Akses belum tersedia"}</strong>
              <p>{blocked ? "Tutup tab asal dahulu jika mahu gunakan tab ini." : "Sistem belum boleh membuka halaman ini."}</p>
            </div>
          </div>
          <div className="sqr-tab-actions" aria-busy={retrying}>
            <button className="sqr-tab-button sqr-tab-primary" type="button" onClick={onRetry} disabled={retrying || unsupported}>
              <RefreshCw size={17} aria-hidden="true" focusable="false" />{retrying ? "Menyemak..." : "Semak Semula"}
            </button>
            <button className="sqr-tab-button sqr-tab-secondary" type="button" onClick={onClose}>
              <X size={17} aria-hidden="true" focusable="false" />Tutup Tab
            </button>
          </div>
          <p className="sqr-tab-footnote" role="status" aria-live="polite" aria-atomic="true">
            <Info size={16} aria-hidden="true" focusable="false" />
            <span>{closeNotice || "Jika tab ini tidak tertutup, tutup secara manual. Tab asal tidak terjejas."}</span>
          </p>
        </section>
        <BrowserIllustration logoSrc={logoSrc} />
      </main>
      <div className="sqr-tab-benefits">
        <span><ShieldCheck aria-hidden="true" focusable="false" />Tab asal tidak terjejas</span>
        <span><RefreshCw aria-hidden="true" focusable="false" />Semak jika tab asal ditutup</span>
      </div>
      <footer className="sqr-tab-footer">SQR <span aria-hidden="true">•</span> Perlindungan sesi</footer>
    </div>
  </div>;
}

function CheckingPage({ logoSrc }: { logoSrc: string }) {
  return <main id="main-content" tabIndex={-1} className="sqr-tab-page sqr-tab-checking" lang="ms" data-single-tab-status="checking" aria-busy="true" aria-label="Menyemak tab aktif">
    <Brand logoSrc={logoSrc} />
    <div className="sqr-tab-spinner" aria-hidden="true" />
    <p role="status" aria-live="polite">Menyemak tab aktif...</p>
  </main>;
}

/** The keyed child prevents an old account's active render surviving an account change. */
export default function SingleActiveTabGate(props: SingleActiveTabGateProps) {
  return <AccountTabGate key={String(props.accountId)} {...props} />;
}

function AccountTabGate({ accountId, children, logoSrc, onBeforeActivate }: SingleActiveTabGateProps) {
  const [status, setStatus] = useState<TabStatus>("checking");
  const [retrying, setRetrying] = useState(false);
  const [closeNotice, setCloseNotice] = useState("");
  const controller = useRef<SingleTabLock | null>(null);
  const validationAbort = useRef<AbortController | null>(null);
  const attemptSerial = useRef(0);
  const validation = useRef(onBeforeActivate);
  validation.current = onBeforeActivate;
  const attempt = useRef<((checking: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    let disposed = false;
    const acquire = async (checking: boolean) => {
      if (disposed || controller.current?.active) return;
      const serial = ++attemptSerial.current;
      if (checking) setStatus("checking");
      setRetrying(!checking);
      validationAbort.current?.abort();
      const validationController = new AbortController();
      validationAbort.current = validationController;
      controller.current?.release();
      controller.current = null;
      let lock: SingleTabLock;
      try {
        lock = new SingleTabLock(accountId, {
          onOwnershipLost: () => {
            if (disposed || serial !== attemptSerial.current || controller.current !== lock) return;
            ++attemptSerial.current;
            flushSync(() => { setStatus("error"); setRetrying(false); });
            validationController.abort();
            lock.release();
            controller.current = null;
          },
        });
      } catch {
        if (!disposed) { setStatus("error"); setRetrying(false); }
        return;
      }
      controller.current = lock;
      const current = () => !disposed && serial === attemptSerial.current && controller.current === lock;
      try {
        const next = await lock.tryAcquire();
        if (!current()) return;
        if (next !== "active") {
          setStatus(next);
          return;
        }
        const valid = validation.current ? await validation.current(validationController.signal) : true;
        if (!current()) return;
        if (!valid || validationController.signal.aborted || !lock.active || lock.disposed) {
          lock.release();
          controller.current = null;
          setStatus("error");
          return;
        }
        setStatus("active");
      } catch {
        if (current()) {
          lock.release();
          controller.current = null;
          setStatus("error");
        }
      } finally {
        if (!disposed && serial === attemptSerial.current) setRetrying(false);
      }
    };
    const release = () => {
      ++attemptSerial.current;
      validationAbort.current?.abort();
      validationAbort.current = null;
      controller.current?.release();
      controller.current = null;
    };
    const onPageHide = () => {
      // A BFCache snapshot must not retain a protected route without ownership.
      flushSync(() => { setStatus("checking"); setRetrying(false); });
      release();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && !disposed) void acquire(true);
    };
    attempt.current = acquire;
    // React StrictMode replays the first effect synchronously. Wait one
    // microtask so its disposed setup never requests a transient browser lock
    // that could make the real setup appear to be a blocked second tab.
    void Promise.resolve().then(() => {
      if (!disposed) void acquire(true);
    });
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      disposed = true;
      attempt.current = null;
      release();
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [accountId]);

  const onRetry = useCallback(() => {
    void attempt.current?.(false);
  }, []);

  const onClose = useCallback(() => {
    // Never call logout, clear cookies, or release the original tab's lock.
    try {
      window.close();
    } catch {
      // Some browser policies reject script-initiated tab closure.
    }
    setCloseNotice("Jika tab masih terbuka, sila tutup sendiri.");
  }, []);

  if (status === "active" && controller.current?.active && !controller.current.disposed) return <>{children}</>;
  if (status === "checking") return <CheckingPage logoSrc={logoSrc} />;
  return <BlockedPage status={status === "active" ? "error" : status} logoSrc={logoSrc} onRetry={onRetry} onClose={onClose} retrying={retrying} closeNotice={closeNotice} />;
}
