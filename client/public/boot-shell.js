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
      const prefix = "sqr-" + resource;
      const selector = 'meta[name="' + prefix + '-script"], meta[name="' + prefix + '-style"]'
        + (resource === "login" ? ', meta[name="sqr-login-image"]' : "");
      document.querySelectorAll(selector).forEach(meta => {
        const name = meta.getAttribute("name");
        const isScript = name === prefix + "-script";
        const isStyle = name === prefix + "-style";
        const isImage = resource === "login" && name === "sqr-login-image";
        if (!isScript && !isStyle && !isImage) return;
        const href = meta.getAttribute("content") || "";
        const allowed = isScript ? /^\/assets\/[A-Za-z0-9_-]+\.js$/
          : isStyle ? /^\/assets\/[A-Za-z0-9_-]+\.css$/
            : /^\/assets\/sqr-illustration-[A-Za-z0-9_-]+\.webp$/;
        if (!allowed.test(href)) return;
        const link = document.createElement("link");
        link.href = href;
        link.fetchPriority = "high";
        // Match Vite's anonymous-CORS module and stylesheet requests, so the
        // eventual lazy import reuses these responses instead of fetching twice.
        // CSS background images use no-CORS requests; do not change that mode.
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
