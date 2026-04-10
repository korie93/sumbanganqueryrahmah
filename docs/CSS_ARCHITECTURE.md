# CSS Architecture and Component Styling Guide

Dokumen ini menerangkan cara styling disusun dalam frontend SQR, bila perlu
guna Tailwind berbanding CSS biasa, dan corak yang perlu diikut supaya tema,
responsive behavior, accessibility, dan performance kekal konsisten.

## Objectives

- Kekalkan satu sumber kebenaran untuk warna, spacing, shadow, radius, z-index, dan safe-area tokens.
- Bezakan dengan jelas tanggungjawab antara global CSS, app-shell CSS, route CSS, dan CSS modules.
- Elakkan hardcoded values yang memintas sistem tema atau breakpoints bersama.
- Pastikan komponen baharu terus serasi dengan dark mode, low-spec mode, reduced motion, dan mobile viewport quirks.

## Styling Layers

1. `client/src/public-shell.css`
   Digunakan oleh [main.tsx](../client/src/main.tsx) untuk memuatkan Tailwind `base`, `components`, dan `utilities` bagi shell awal aplikasi.

2. `client/src/theme-tokens.css`
   Sumber utama design tokens. Fail ini menyimpan token global seperti `--background`, `--border`, `--shadow-*`, `--spacing-*`, `--safe-area-inset-*`, dan keluarga token khusus seperti `--public-auth-*`, `--login-*`, `--banned-*`, `--not-found-*`, dan token navigasi/shell yang lain.

3. `client/src/index.css`
   Global app styling untuk perkara rentas-halaman seperti `prefers-reduced-motion`, print mode, dan reset/utility global yang perlu wujud selepas authenticated bundle dimuatkan.

4. `client/src/app/app-shell-bootstrap.css`
   Styling kecil yang diperlukan oleh shell bootstrap seperti `PageSpinner` dan `AppRouteErrorBoundary`. Fail ini patut kekal nipis dan fokus pada boot-time primitives.

5. `client/src/app/AuthenticatedAppShell.css`
   Shared operational shell classes seperti `glass-wrapper`, `ops-page`, `ops-toolbar`, `ops-summary-strip`, dan corak kad/metric yang dipakai merentas halaman operasi.

6. Route or feature CSS files
   Fail seperti `client/src/pages/Home.css`, `client/src/pages/Login.css`, `client/src/pages/Landing.css`, `client/src/components/Navbar.css`, dan `client/src/components/PublicAuthLayout.css` menyimpan styling visual yang khusus kepada experience atau family UI tertentu.

7. CSS modules
   Gunakan CSS modules untuk komponen yang memerlukan encapsulated geometry atau custom properties tempatan, contohnya `client/src/components/FloatingAI.module.css`, `client/src/pages/viewer/ViewerFooter.module.css`, dan `client/src/components/ui/sidebar.module.css`.

## Loading Order

- [main.tsx](../client/src/main.tsx) memuatkan `public-shell.css` dan `theme-tokens.css`.
- [AuthenticatedAppEntry.tsx](../client/src/app/AuthenticatedAppEntry.tsx) memuatkan `index.css` untuk global application rules selepas pengguna memasuki shell utama.
- Komponen dan halaman memuatkan fail CSS masing-masing secara setempat, contohnya [AuthenticatedAppShell.tsx](../client/src/app/AuthenticatedAppShell.tsx), [Navbar.tsx](../client/src/components/Navbar.tsx), dan [FloatingAI.tsx](../client/src/components/FloatingAI.tsx).

Urutan ini penting: tokens perlu dimuatkan lebih awal daripada mana-mana kelas yang bergantung pada `var(--token)`.

## Decision Guide

Gunakan Tailwind utilities apabila:

- Anda sedang menyusun layout, spacing, flex/grid, typography ringkas, atau state classes yang jelas dibaca terus dalam TSX.
- Gaya itu benar-benar lokal pada markup semasa dan tidak dijangka dikongsi sebagai visual pattern baharu.
- Anda boleh guna token sedia ada melalui utilities seperti `bg-background`, `border-border/60`, `text-muted-foreground`, atau spacing yang datang dari `tailwind.config.ts`.

Gunakan shared global CSS apabila:

- Pattern itu berulang merentas beberapa halaman operasi.
- Anda perlukan nama kelas semantik seperti `ops-page`, `ops-summary-strip`, atau `glass-wrapper`.
- Anda mahu satu tempat untuk melaras visual shell tanpa menyentuh banyak komponen.

Gunakan route-level CSS apabila:

- Halaman mempunyai visual language tersendiri seperti `Home`, `Landing`, `Login`, `Banned`, atau `Forbidden`.
- Terdapat state visual kompleks yang lebih sukar dibaca jika dipaksa sepenuhnya dalam utility classes.
- Gaya itu milik satu experience tertentu dan tidak sesuai dipromosikan ke shared shell.

Gunakan CSS modules apabila:

- Komponen memerlukan scoped class names untuk elak kebocoran global.
- Komponen bergantung pada custom properties setempat atau geometry yang sensitif, contohnya panel terapung, sticky footer safe-area, atau sidebar widths.
- Struktur dalaman komponen lebih stabil jika nama kelas disimpan berdekatan dengan komponen tanpa menambah global namespace baharu.

## Token Rules

- Jangan tambah warna terus seperti `#fff`, `rgba(...)`, atau `hsl(...)` di komponen jika token setara sudah wujud.
- Untuk warna bertema, guna `hsl(var(--token) / alpha)` atau token shadow/background sedia ada.
- Jika nilai baru benar-benar perlu dikongsi, daftarkan di `client/src/theme-tokens.css` mengikut keluarga yang jelas.
- Kekalkan pasangan light/dark dalam keluarga token yang sama. Jika menambah `--example-*` di `:root`, sediakan override yang sepadan di `.dark` jika komponen itu muncul dalam kedua-dua tema.
- Spacing baharu perlu berpunca daripada scale `--spacing-*` dan bukannya nilai raw yang sukar diseragamkan.

## Responsive and Viewport Rules

- Breakpoint utama repo diseragamkan kepada kontrak bersama yang dipakai oleh CSS dan JS. Rujuk helper responsive jika perlu menambah logic viewport dalam TypeScript.
- Untuk full-height mobile layouts, ikut corak `100svh` dengan fallback atau upgrade `100dvh` menggunakan `@supports`, seperti yang digunakan dalam shell dan bootstrap CSS.
- Jika komponen melekat pada tepi skrin atau bawah skrin, gunakan `--safe-area-inset-*` supaya peranti bertakuk dan gesture bar tidak memotong UI.
- Untuk landscape mobile yang padat, semak sama ada komponen perlukan variant khusus seperti corak yang sudah wujud dalam `AuthenticatedAppShell.css`.

## Accessibility and Performance Rules

- Setiap interactive surface perlu ada `:focus-visible` yang jelas.
- Hormati `prefers-reduced-motion`; jangan jadikan animasi penting untuk kefahaman asas.
- Jika effect berat seperti `backdrop-filter` digunakan, sediakan fallback atau simplification untuk `.low-spec`.
- Gunakan `transform` dan `opacity` untuk animasi utama apabila boleh; elakkan animation yang berat pada `box-shadow` atau layout properties.
- Pastikan touch targets sekurang-kurangnya sekitar `44x44px` untuk kawalan utama pada mobile.

## Recommended Workflow for New UI

1. Mulakan dengan markup dan Tailwind utilities menggunakan token sedia ada.
2. Jika pattern mula berulang merentas lebih daripada satu halaman, promosikan ke shared shell CSS atau token global.
3. Jika komponen memerlukan layout tempatan yang kompleks, pindahkan ke CSS module.
4. Uji sekurang-kurangnya pada light mode, dark mode, mobile width, dan keyboard focus path.
5. Jika komponen muncul berhampiran bawah skrin, semak safe-area dan mobile keyboard behavior.

## Do and Don't

- Buat: guna `bg-background`, `text-foreground`, `border-border/60`, dan token shadow/spacing repo.
- Buat: namakan kelas global mengikut family yang jelas seperti `ops-*`, `nav-*`, atau `public-auth-*`.
- Buat: simpan route-specific styling dalam fail route yang sepadan.
- Jangan: tambah hardcoded palette baru tanpa alasan yang kuat.
- Jangan: jadikan CSS module sebagai tempat membina theme token global.
- Jangan: campur dua sistem penamaan berbeza untuk pattern visual yang sama.

## Examples in This Repo

- Shared shell styling: [client/src/app/AuthenticatedAppShell.css](../client/src/app/AuthenticatedAppShell.css)
- Navigation-specific styling: [client/src/components/Navbar.css](../client/src/components/Navbar.css)
- Floating, scoped geometry: [client/src/components/FloatingAI.module.css](../client/src/components/FloatingAI.module.css)
- Tiny local module for safe area: [client/src/pages/viewer/ViewerFooter.module.css](../client/src/pages/viewer/ViewerFooter.module.css)
- Token source of truth: [client/src/theme-tokens.css](../client/src/theme-tokens.css)

## Review Checklist

- Adakah komponen ini guna token sedia ada sebelum menambah nilai baharu?
- Adakah tempat terbaik untuk gaya ini Tailwind, shared CSS, route CSS, atau CSS module?
- Adakah light mode dan dark mode kedua-duanya disemak?
- Adakah focus state, reduced motion, dan low-spec fallback masuk akal?
- Adakah ada nilai hardcoded yang patut dipromosikan ke token atau scale bersama?
