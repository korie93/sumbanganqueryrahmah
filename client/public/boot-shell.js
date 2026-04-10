(function () {
  const publicAuthShellCopy = {
    "/login": {
      eyebrow: "SQR System",
      title: "Log In SQR System",
      copy: "Platform operasi dalaman Sumbangan Query Rahmah sedang disediakan.",
    },
    "/forgot-password": {
      eyebrow: "SQR System",
      title: "Lupa Kata Laluan",
      copy: "Paparan pemulihan akaun sedang dimuatkan dengan selamat.",
    },
    "/activate-account": {
      eyebrow: "SQR System",
      title: "Aktifkan Akaun",
      copy: "Langkah pengaktifan akaun sedang disediakan.",
    },
    "/reset-password": {
      eyebrow: "SQR System",
      title: "Reset Kata Laluan",
      copy: "Paparan tetapan semula kata laluan sedang dimuatkan.",
    },
    "/maintenance": {
      eyebrow: "SQR System",
      title: "Status Penyelenggaraan",
      copy: "Maklumat sistem semasa sedang dimuatkan.",
    },
  };

  const path = String(window.location.pathname || "/").toLowerCase();
  const shell = publicAuthShellCopy[path];
  if (!shell) {
    return;
  }

  document.documentElement.setAttribute("data-boot-shell", "public-auth");
  window.__SQR_BOOT_SHELL__ = shell;

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
