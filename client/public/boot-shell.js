(function () {
  const publicShellCopy = {
    "/": {
      mode: "landing",
      eyebrow: "SQR Operations Platform",
      title: "Operational data, structured for faster decisions.",
      copy: "SQR consolidates search, analysis, monitoring and access control into a single operational workspace designed for clarity, speed and governance.",
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
  // Do not download landing assets on login/internal routes or while restoring
  // an existing session. Denied storage simply leaves normal lazy loading in place.
  const preloadLandingAssets = function () {
    if (window.location.pathname !== "/") return;
    try {
      if (document.cookie.split(";").some(part => part.trim().startsWith("sqr_auth_hint="))
        || window.sessionStorage.getItem("user")
        || window.sessionStorage.getItem("banned") === "1"
        || document.querySelector('meta[name="sqr-maintenance"][content="active"]')) return;
      document.querySelectorAll('meta[name="sqr-landing-script"], meta[name="sqr-landing-style"]').forEach(meta => {
        const isScript = meta.getAttribute("name") === "sqr-landing-script";
        const href = meta.getAttribute("content") || "";
        const allowed = isScript ? /^\/assets\/[A-Za-z0-9_-]+\.js$/ : /^\/assets\/[A-Za-z0-9_-]+\.css$/;
        if (!allowed.test(href)) return;
        const link = document.createElement("link");
        link.href = href;
        link.fetchPriority = "high";
        // Match Vite's anonymous-CORS module and stylesheet requests, so the
        // eventual lazy import reuses these responses instead of fetching twice.
        link.crossOrigin = "anonymous";
        if (isScript) {
          link.rel = "modulepreload";
        } else {
          link.rel = "preload";
          link.as = "style";
        }
        document.head.appendChild(link);
      });
    } catch {
      // Optional optimization must never block the public shell or session restore.
    }
  };
  preloadLandingAssets();

  const applyShellCopy = function () {
    const eyebrow = document.getElementById("boot-shell-eyebrow");
    const title = document.getElementById("boot-shell-title");
    const copy = document.getElementById("boot-shell-copy");

    if (eyebrow && shell.eyebrow) {
      eyebrow.textContent = shell.eyebrow;
    }
    if (title && shell.title) {
      title.textContent = shell.title;
    }
    if (copy && shell.copy) {
      copy.textContent = shell.copy;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyShellCopy, { once: true });
    return;
  }

  applyShellCopy();
})();
