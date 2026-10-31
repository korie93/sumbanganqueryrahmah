import { createContext, useContext, useEffect, useRef, useState, type ComponentProps, type RefObject } from "react";
import { ArrowRight, ArrowUp, Check, Menu, Moon, Sun, X } from "lucide-react";
import { SQR_BRAND_ASSETS } from "@shared/brand-assets";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import { useLandingNextMotion } from "./useLandingNextMotion";
import "./landing-next.css";

type Theme = "light" | "dark";
type CapabilityId = "search" | "analyse" | "import" | "monitor" | "security";
type LandingNextProps = { onLoginClick: () => void };
const NavigationContext = createContext<{
  root: RefObject<HTMLDivElement>; onLoginClick: () => void; paused: boolean; closeMenu: () => void;
} | null>(null);

function LandingNextLink({ href, onClick, ...props }: ComponentProps<"a"> & { href: string }) {
  const navigation = useContext(NavigationContext);
  return <a {...props} href={href} onClick={event => {
    onClick?.(event);
    if (!navigation || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (href === "/login") { event.preventDefault(); navigation.onLoginClick(); return; }
    if (!href.startsWith("#")) return;
    const target = [...(navigation.root.current?.querySelectorAll<HTMLElement>("[id]") ?? [])]
      .find(element => element.id === href.slice(1)) ?? (href === "#top" ? navigation.root.current : null);
    if (!target) return;
    event.preventDefault();
    navigation.closeMenu();
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start", behavior: navigation.paused ? "instant" : "smooth" });
    window.history.replaceState(null, "", href);
  }} />;
}

const Link = LandingNextLink;
type Capability = {
  id: CapabilityId; number: string; eyebrow: string; title: string; description: string;
  light: boolean; specs: Array<[string, string]>; frame: string; instrument: string; system: string; label: string;
};

const capabilities: Capability[] = [
  { id: "search", number: "02", eyebrow: "Find records", title: "Search",
    description: "Type a name or reference number. The exact record appears instantly.", light: false,
    specs: [["INPUT", "NAME OR REF"], ["RESULT", "INSTANT"], ["MATCH", "EXACT"]],
    frame: "01", instrument: "INSTANT LOOKUP", system: "QUERY", label: "MATCH" },
  { id: "analyse", number: "03", eyebrow: "Insights", title: "Analyse",
    description: "Totals, distribution and change. Clear at first glance.", light: true,
    specs: [["SHOWS", "TOTALS"], ["SHOWS", "DISTRIBUTION"], ["SHOWS", "CHANGE"]],
    frame: "02", instrument: "DISTRIBUTION", system: "METRICS", label: "TRENDS" },
  { id: "import", number: "04", eyebrow: "Bring in data", title: "Import",
    description: "Upload a file. Your data is organised neatly and consistently.", light: false,
    specs: [["SCHEMA", "STRUCTURED"], ["OUTPUT", "ORGANISED"], ["FORMAT", "CONSISTENT"]],
    frame: "03", instrument: "DATA INGEST", system: "INGEST", label: "VALIDATED" },
  { id: "monitor", number: "05", eyebrow: "Stay informed", title: "Monitor",
    description: "System status and operational activity, right in front of you.", light: true,
    specs: [["SHOWS", "SYSTEM STATUS"], ["SHOWS", "ACTIVITY"], ["VIEW", "AT A GLANCE"]],
    frame: "04", instrument: "ACTIVITY VIEW", system: "PULSE", label: "ACTIVITY" },
  { id: "security", number: "06", eyebrow: "Protection", title: "Security",
    description: "Access to SQR is controlled, and the platform is reviewed on an ongoing basis.", light: false,
    specs: [["AUTH", "TOKEN-BASED"], ["AUDITS", "ONGOING"], ["ACCESS", "REGISTERED ONLY"]],
    frame: "05", instrument: "ACCESS GUARD", system: "SHIELD", label: "VERIFIED" },
];

const sectionIndex = [
  ["top", "00", "Top"], ["about", "01", "About"], ["search", "02", "Search"],
  ["analyse", "03", "Analyse"], ["import", "04", "Import"], ["monitor", "05", "Monitor"],
  ["security", "06", "Security"], ["start", "07", "Get started"],
] as const;
const workflow = [
  ["import", "Import", "Bring data in, organised and consistent."],
  ["search", "Search", "Find the exact record in an instant."],
  ["analyse", "Analyse", "Understand totals, distribution and change."],
  ["monitor", "Monitor", "Keep system status and activity in view."],
] as const;
const safeguards = [
  ["Authenticated access", "Only registered users can sign in and reach the platform."],
  ["Controlled sessions", "Token-based authentication keeps every session under control."],
  ["Regular security audits", "Security and quality are reviewed in an ongoing audit cycle."],
  ["Dependency checks", "Third-party packages are audited for known vulnerabilities."],
] as const;

function locationProps(current: boolean): { "aria-current"?: "location" } {
  return current ? { "aria-current": "location" } : {};
}

/** Native images preserve the supplied SVG geometry; only visible artwork animates. */
function SuppliedArtwork({ name, theme = "dark", paused, boosted = false, replayVersion = 0, className }: {
  name: CapabilityId | "radar"; theme?: Theme; paused: boolean; boosted?: boolean; replayVersion?: number; className: string;
}) {
  const ref = useRef<HTMLImageElement>(null);
  // The hero radar is above the fold; do not fetch a static intermediary before
  // its first observer callback. The observer still pauses artwork offscreen.
  const [visible, setVisible] = useState(name === "radar");
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!window.IntersectionObserver) { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(Boolean(entry?.isIntersecting));
    }, { threshold: [0, 0.08] });
    observer.observe(element);
    return () => observer.disconnect();
  }, [boosted, replayVersion]);
  const state = paused || !visible ? "static" : boosted && name !== "radar" ? "boost" : "animated";
  const asset = name === "radar" ? `radar-${state}` : `${name}-${theme}-${state}`;
  const dimension = name === "radar" ? 400 : 120;
  return <img key={boosted ? replayVersion : 0} ref={ref} className={className} src={`/landing-next/${asset}.svg`} width={dimension} height={dimension}
    alt="" aria-hidden="true" decoding="async" loading={name === "radar" ? "eager" : "lazy"}
    fetchPriority={name === "radar" ? "high" : "auto"} />;
}

export default function LandingNext({ onLoginClick }: LandingNextProps) {
  const root = useRef<HTMLDivElement>(null);
  const motion = useLandingNextMotion(root);
  const isPaused = motion.motionPaused;
  const navigationLinks = () => (
    <>
      <Link className="hide" href="#about" {...locationProps(motion.activeSection === "about")}>About</Link>
      <Link className="hide" href="#search" {...locationProps(["search", "analyse", "import", "monitor"].includes(motion.activeSection))}>Capabilities</Link>
      <Link className="hide" href="#security" {...locationProps(motion.activeSection === "security")}>Security</Link>
    </>
  );
  return (
    <NavigationContext.Provider value={{ root, onLoginClick, paused: isPaused, closeMenu: () => motion.setMenuOpen(false) }}>
    <div ref={root} id="top" tabIndex={-1} className={`sqr-landing-next${isPaused ? " motion-paused" : ""}`} data-theme={motion.theme}>
      <Link className="skip" href="#main-content">Skip to content</Link>
      <header>
        <div className="wrap nav">
          <Link className="brand" href="#top" aria-label="SQR">
            <img src={SQR_BRAND_ASSETS.transparentIcon} width={30} height={30} alt="" aria-hidden="true" decoding="async" />SQR
          </Link>
          <nav className="nav-links" aria-label="Main">
            {navigationLinks()}
            <Link className="login" href="/login">Log in</Link>
            <button type="button" className="theme-btn" onClick={motion.toggleTheme} aria-label="Toggle color theme" title="Toggle theme">
              {motion.theme === "dark" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
            </button>
            <button type="button" id="landing-next-menu-toggle" className="theme-btn menu-btn" aria-label="Menu"
              {...getAriaExpandedProps(motion.menuOpen)} aria-controls="landing-next-mobile-menu"
              onClick={() => motion.setMenuOpen(!motion.menuOpen)}>
              {motion.menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
          </nav>
        </div>
        <nav className={`mmenu${motion.menuOpen ? " open" : ""}`} id="landing-next-mobile-menu" aria-label="Mobile" hidden={!motion.menuOpen}>
          <Link href="#about">About</Link><Link href="#search">Capabilities</Link><Link href="#security">Security</Link>
        </nav>
        <i className="prog" aria-hidden="true" />
      </header>
      <nav className="rail" aria-label="Section index">
        {sectionIndex.map(([id, number, label]) => <Link key={id} href={`#${id}`} aria-label={label}
          {...locationProps(motion.activeSection === id)}><span>{number} · {label === "Get started" ? "Start" : label}</span></Link>)}
      </nav>
      <main id="main-content" tabIndex={-1}>
        <section className="hero" aria-labelledby="landing-next-title">
          <SuppliedArtwork name="radar" paused={isPaused} className="mark radar-artwork" />
          <div className="wrap">
            <div className="hero-tag"><i aria-hidden="true" /><span>SQR Operations Platform</span><b>{motion.coordinateLabel}</b></div>
            <h1 id="landing-next-title"><Link href="#search">Search.</Link><Link href="#analyse">Analyse.</Link><Link href="#monitor">Monitor.</Link></h1>
            <p className="lead">The operations platform for Sumbangan Query Rahmah. Search, analyse, import and monitor your data in one fast, structured place.</p>
            <div className="actions"><Link className="btn btn-blue" href="/login">Log in<ArrowRight width={16} height={12} aria-hidden="true" /></Link><Link className="btn btn-line" href="#about">Learn more</Link></div>
            <ul className="assure"><li>Internal platform</li><li>Registered users only</li><li>Ongoing security audits</li></ul>
          </div>
          <Link className="cue" href="#about" aria-label="Scroll down"><span>Scroll</span><i aria-hidden="true" /></Link>
        </section>
        <section className="panel strip" aria-labelledby="landing-next-workflow-title">
          <div className="wrap">
            <h2 className="rv" id="landing-next-workflow-title">From raw data to operational control.</h2>
            <ol className="flow">{workflow.map(([id, title, description], index) => (
              <li className="rv" data-stagger={index + 1} key={id}><Link href={`#${id}`}><span className="n">Step 0{index + 1}</span><h3>{title}</h3><p>{description}</p><span className="go"><ArrowRight width={16} height={12} aria-hidden="true" /></span></Link></li>
            ))}</ol>
          </div>
        </section>
        <section className="panel light about" id="about" data-num="01" aria-labelledby="landing-next-about-title">
          <div className="wrap">
            <div><span className="eyebrow rv">01 / Overview</span><h2 className="rv" id="landing-next-about-title">About</h2></div>
            <div className="rv" data-stagger="1">
              <p className="big">SQR is the operations platform of Sumbangan Query Rahmah. It brings data search, analysis, import and operational monitoring together in one fast, structured and responsive system.</p>
              <ul className="pillars"><li><b>Fast</b><span>Search and results that keep pace with your work.</span></li><li><b>Structured</b><span>Data organised consistently from the point of import.</span></li><li><b>Responsive</b><span>A clean experience on desktop and mobile.</span></li></ul>
              <dl className="facts"><div><dt>Platform</dt><dd>Internal operations</dd></div><div><dt>Capabilities</dt><dd>Search, analysis, import and monitoring</dd></div><div><dt>Access</dt><dd>Registered users</dd></div></dl>
            </div>
          </div>
        </section>
        {capabilities.map(capability => (
          <section className={`panel${capability.light ? " light" : ""}`} id={capability.id} data-num={capability.number}
            aria-labelledby={`landing-next-${capability.id}-title`} key={capability.id}>
            <div className="wrap">
              <div><span className="eyebrow rv">{capability.number} / {capability.eyebrow}</span><h2 className="rv" id={`landing-next-${capability.id}-title`}>{capability.title}</h2>
                <p className="rv" data-stagger="1">{capability.description}</p>
                <ul className="specs rv" data-stagger="2" aria-label={`${capability.title} specifications`}>
                  {capability.specs.map(([label, value]) => <li key={`${label}-${value}`}>{label} <b>{value}</b></li>)}
                </ul>
              </div>
              <button type="button" className={`fig rv${motion.boostedFigure === capability.id ? " boost" : ""}`}
                data-stagger="2" data-label={capability.label} data-active="REPLAYING"
                aria-label={`Replay ${capability.title} instrument animation`} onClick={() => motion.replay(capability.id)}>
                <span className="hud-top"><span>FRM // {capability.frame}</span><span>{capability.instrument}</span></span>
                <SuppliedArtwork name={capability.id} theme={capability.light ? motion.theme : "dark"} paused={isPaused}
                  boosted={motion.boostedFigure === capability.id} replayVersion={motion.boostedFigure === capability.id ? motion.replayVersion : 0} className="instrument-image" />
                <span className="hud"><span>SYS.{capability.frame} // {capability.system}</span><b>{motion.boostedFigure === capability.id && !isPaused ? "REPLAYING" : capability.label}</b></span>
              </button>
              {capability.id === "security" && <ul className="sec">{safeguards.map(([title, description], index) => (
                <li className="rv" data-stagger={index + 3} key={title}><Check className="tick" aria-hidden="true" /><div><h3>{title}</h3><p>{description}</p></div></li>
              ))}</ul>}
            </div>
          </section>
        ))}
        <section className="panel light" id="start" data-num="07" aria-labelledby="landing-next-start-title">
          <div className="wrap"><div className="rv"><span className="eyebrow">07 / Access</span><h2 id="landing-next-start-title">Get started</h2><p>Log in with your registered account to access SQR.</p>
            <div className="actions"><Link className="btn btn-blue" href="/login">Log in<ArrowRight width={16} height={12} aria-hidden="true" /></Link></div>
          </div></div>
        </section>
      </main>
      <div className="toast" role="status" aria-live="polite" aria-atomic="true" />
      <footer><div className="wrap"><div className="foot-grid">
        <div className="foot-id"><Link className="brand" href="#top" aria-label="Back to top">SQR</Link><p>The operations platform of Sumbangan Query Rahmah.</p></div>
        <nav className="foot-col" aria-label="Platform"><span className="h4">Platform</span><Link href="#search">Search</Link><Link href="#analyse">Analyse</Link><Link href="#import">Import</Link><Link href="#monitor">Monitor</Link></nav>
        <nav className="foot-col" aria-label="SQR"><span className="h4">SQR</span><Link href="#about">About</Link><Link href="#security">Security</Link></nav>
        <nav className="foot-col" aria-label="Access"><span className="h4">Access</span><Link href="/login">Log in</Link></nav>
      </div><div className="foot-bot"><span>© 2026 Sumbangan Query Rahmah</span><span>Internal platform for registered users</span></div></div></footer>
      <button type="button" className="totop" aria-label="Back to top" onClick={() => {
        root.current?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: isPaused ? "instant" : "smooth" });
        window.history.replaceState(null, "", "#top");
      }}><ArrowUp aria-hidden="true" /></button>
    </div>
    </NavigationContext.Provider>
  );
}
