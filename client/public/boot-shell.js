(function () {
  // Async execution can arrive after React starts; the app then owns metadata
  // and routing, so a late optional boot script must not overwrite either.
  if (document.getElementById("root")?.hasChildNodes()) return;

  const publicShellCopy = {
    "/": {
      mode: "landing",
      eyebrow: "",
      title: "Loading SQR…",
      copy: "",
    },
    "/login": {
      mode: "public-auth",
      eyebrow: "SQR System",
      title: "Log In SQR System",
      copy: "Platform operasi dalaman Sumbangan Query Rahmah sedang disediakan.",
    },
    "/forgot-password": {
      mode: "public-auth",
      eyebrow: "SQR System",
      title: "Lupa Kata Laluan",
      copy: "Paparan pemulihan akaun sedang dimuatkan dengan selamat.",
    },
    "/activate-account": {
      mode: "public-auth",
      eyebrow: "SQR System",
      title: "Aktifkan Akaun",
      copy: "Langkah pengaktifan akaun sedang disediakan.",
    },
    "/reset-password": {
      mode: "public-auth",
      eyebrow: "SQR System",
      title: "Reset Kata Laluan",
      copy: "Paparan tetapan semula kata laluan sedang dimuatkan.",
    },
    "/maintenance": {
      mode: "public-auth",
      eyebrow: "SQR System",
      title: "Status Penyelenggaraan",
      copy: "Maklumat sistem semasa sedang dimuatkan.",
    },
  };

  const path = String(window.location.pathname || "/").toLowerCase();
  document.documentElement.lang = path === "/" ? "en" : "ms";
  const shell = publicShellCopy[path];
  if (!shell) {
    return;
  }

  document.documentElement.setAttribute("data-boot-shell", shell.mode);
  window.__SQR_BOOT_SHELL__ = shell;

  // Resource hints only: authentication and routing remain owned by the app.
  // Each exact public route fetches only its own build-provided resources.
  // Existing sessions and denied storage keep normal lazy loading in place.
  const preloadPublicRouteAssets = function () {
    const resource = window.location.pathname === "/" ? "landing"
      : window.location.pathname === "/login" ? "login" : null;
    if (!resource) return;
    try {
      if (document.cookie.split(";").some(part => part.trim().startsWith("sqr_auth_hint="))
        || window.sessionStorage.getItem("user")
        || window.sessionStorage.getItem("banned") === "1"
        || document.querySelector('meta[name="sqr-maintenance"][content="active"]')) return;
      // Match the app's canonical preference and legacy migration without
      // writing storage or applying a theme before the app owns the page.
      const resolveLoginTheme = function () {
        try {
          const current = window.localStorage.getItem("theme");
          if (current === "light" || current === "dark") return current;
          const legacy = window.localStorage.getItem("sqr-landing-next-theme");
          if (legacy === "light" || legacy === "dark") return legacy;
        } catch { /* Storage denial falls back to the system preference. */ }
        return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark" : "light";
      };
      const loginTheme = resource === "login" ? resolveLoginTheme() : null;
      const prefix = "sqr-" + resource;
      const selector = 'meta[name="' + prefix + '-script"], meta[name="' + prefix + '-style"]'
        + ', meta[name="' + prefix + '-image"]';
      document.querySelectorAll(selector).forEach(meta => {
        const name = meta.getAttribute("name");
        const isScript = name === prefix + "-script";
        const isStyle = name === prefix + "-style";
        const isImage = name === prefix + "-image";
        if (!isScript && !isStyle && !isImage) return;
        const href = meta.getAttribute("content") || "";
        const allowed = isScript ? /^\/assets\/[A-Za-z0-9_-]+\.js$/
          : isStyle ? /^\/assets\/[A-Za-z0-9_-]+\.css$/
            : resource === "landing" ? /^\/landing-next\/radar-(?:animated|static)\.svg$/
              : /^\/assets\/sqr-illustration-[A-Za-z0-9_-]+\.webp$/;
        if (!allowed.test(href)) return;
        if (isImage && resource === "login") {
          const imageTheme = meta.getAttribute("data-theme");
          if (imageTheme !== loginTheme || (imageTheme !== "light" && imageTheme !== "dark")) return;
          const darkImage = /^\/assets\/sqr-illustration-dark-[A-Za-z0-9_-]+\.webp$/.test(href);
          if ((imageTheme === "dark") !== darkImage) return;
        }
        const media = isImage && resource === "landing" ? meta.getAttribute("media") : null;
        if (isImage && resource === "landing") {
          const expectedMedia = href === "/landing-next/radar-static.svg"
            ? "(prefers-reduced-motion: reduce)" : "(prefers-reduced-motion: no-preference)";
          if (media !== expectedMedia) return;
        }
        const link = document.createElement("link");
        link.href = href;
        link.fetchPriority = "high";
        if (media) link.media = media;
        // Match Vite's anonymous-CORS module and stylesheet requests, so the
        // eventual lazy import reuses these responses instead of fetching twice.
        // CSS background and ordinary image requests use no-CORS; preserve reuse.
        if (!isImage) link.crossOrigin = "anonymous";
        if (isScript) {
          link.rel = "modulepreload";
        } else {
          link.rel = "preload";
          link.as = isImage ? "image" : "style";
        }
        document.head.appendChild(link);
      });
    } catch {
      // Optional optimization must never block the public shell or session restore.
    }
  };
  preloadPublicRouteAssets();

  const applyShellCopy = function () {
    const eyebrow = document.getElementById("boot-shell-eyebrow");
    const title = document.getElementById("boot-shell-title");
    const copy = document.getElementById("boot-shell-copy");

    if (eyebrow && typeof shell.eyebrow === "string") {
      eyebrow.textContent = shell.eyebrow;
    }
    if (title && typeof shell.title === "string") {
      title.textContent = shell.title;
    }
    if (copy && typeof shell.copy === "string") {
      copy.textContent = shell.copy;
    }
    if (shell.mode === "landing" && title) {
      const brand = document.querySelector("#boot-shell .public-auth-boot-shell__brand");
      if (brand) {
        brand.setAttribute("src", "/brand/sidebar-q-static.png");
        document.documentElement.setAttribute("data-landing-boot-ready", "true");
      }
    }
  };

  // The shared HTML contains auth copy. Replace it before the first root-route
  // paint when its nodes are already parsed; keep the existing parsing fallback.
  if (document.readyState === "loading") {
    if (shell.mode === "landing") applyShellCopy();
    document.addEventListener("DOMContentLoaded", applyShellCopy, { once: true });
    return;
  }

  applyShellCopy();
})();
