# AI chat — header cerah, notifikasi dan sesi panjang

9 November 2026. Pembetulan frontend dan pengesahan lokal selesai selepas commit 8c656153. Perubahan baharu ini belum di-commit, di-push atau di-deploy.

## Hasil

- Header “Bantuan untuk koleksi dan rekod SQR.” dalam mod cerah kini berkongsi warna permukaan chat. Hanya dua token latar tema cerah diubah; teks, fon, saiz, susunan, animasi dan tetapan khusus tema gelap dikekalkan.
- Badge Q kini mengesan ID balasan baharu walaupun sejarah sudah penuh. Snapshot terhad kepada ID dalam sejarah semasa; tiada cache seluruh sejarah, timer atau storan baharu.
- Tiga profil akhir melengkapkan 120 pertukaran sintetik. Floating CPU 1× turut meliputi 12 kali buka semula dan empat pusingan Saved → Viewer. Floating CPU 6× mengasingkan 40 pertukaran tanpa kitaran itu supaya muat dalam had asal. Halaman penuh meliputi 40 pertukaran dan reset. Semua semakan kandungan balasan, had sejarah dan jumlah permintaan lulus. Ini tidak membuktikan ketiadaan kebocoran memori dalam semua keadaan.

## Punca yang disahkan sebelum pembetulan

Tangkapan neutral bagi empat kes sebelum pembetulan menunjukkan header cerah menggunakan rgb(242,242,243), sedangkan chat menggunakan rgb(250,250,250). Token header merujuk kepada muted. Selepas perubahan, kedua-duanya menggunakan rgb(250,250,250).
Had floating sebanyak 30 mesej bersamaan 15 pasangan. Apabila pasangan baharu menggantikan pasangan lama, jumlah balasan pembantu kekal 15. Pengesan lama yang membandingkan jumlah tidak melihat pertambahan. Ujian merah 6bedc47cb4ed mengesahkan balasan ke-16 selesai tetapi badge tersembunyi. Pembetulan membandingkan Set ID semasa dengan snapshot sebelumnya dan mengemas kini ref sebelum menambah unread menggunakan nilai sebelumnya.

## Fail yang berubah

- [Token AI](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/styles/tokens/colors/_ai.css:58): tema cerah desktop dan mobile menggunakan --ai-surface-bg.
- [Hook notifikasi](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/useFloatingAIBehaviorState.ts:32) dan [helper ID](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/ai-chat-unread.ts:4): mengesan ID baharu, mengehadkan snapshot kepada sejarah semasa dan memulakannya daripada sejarah sedia ada.
- [Unit unread](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/ai-chat-unread.test.ts:11) dan kontrak hook: had sejarah tetap, beberapa balasan serentak, ID pendua atau sama, mesej pengguna sahaja, pemulaan snapshot, reset dan 500 snapshot berturut-turut.
- [Regresi browser badge](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/tests/visual/ai-unread-cap.spec.ts:71): had sejarah, buka dan kosongkan unread, pemasangan semula AIChat ketika melahu, kiraan sekali sahaja serta reset dengan respons lewat.
- [Regresi header](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/tests/visual/ai-header-unity.spec.ts:5): tema cerah dan gelap pada lebar 375 dan 1366 px, warna latar, geometri dan tangkapan skrin.

## Visual pada viewport sepadan

| Tema/lebar | Header sebelum → selepas | Chat selepas | Kontras penerangan |
|---|---|---|---:|
| light/375px | rgb(242, 242, 243) → rgb(250, 250, 250) | rgb(250, 250, 250) | 7.21:1 |
| light/1366px | rgb(242, 242, 243) → rgb(250, 250, 250) | rgb(250, 250, 250) | 7.21:1 |
| dark/375px | rgb(35, 35, 35) → rgb(35, 35, 35) | rgb(27, 27, 27) | 10.60:1 |
| dark/1366px | rgb(35, 35, 35) → rgb(35, 35, 35) | rgb(27, 27, 27) | 10.60:1 |

Semua koordinat header, penerangan dan panel sepadan dalam toleransi 0.5 CSS px. Warna teks dan latar mod gelap sama seperti baseline. Nisbah kontras di atas mengambil kira kelegapan warna teks pada latar header yang dirender; ia bukan audit WCAG seluruh aplikasi.

## Sesi panjang dan memori

Setiap profil menggunakan 40 pertukaran pendek melalui UI sebenar dengan data sintetik, tanpa suntikan state React. Had 30 mesej bagi floating, 50 mesej bagi halaman penuh dan jumlah tepat 40 permintaan POST disahkan. Ketika pengukuran selepas GC pada checkpoint 30 dan 40, kedua-dua paparan sudah mencapai had sejarah masing-masing.

| Profil | Heap pertukaran 30 → 40 (MiB) | Listener pertukaran 30 → 40 | Heap buka semula 1 → 12 (MiB) | Listener buka semula 1 → 12 |
|---|---:|---:|---:|---:|
| Baseline floating/light/CPU 1× | 8.708 → 8.746 | 285 → 285 | 8.825 → 9.103 | 416 → 416 |
| Akhir floating/light/CPU 1× | 8.695 → 8.737 | 285 → 285 | 8.812 → 9.182 | 416 → 416 |
| Akhir floating/dark/CPU 6× | 8.783 → 8.829 | 285 → 285 | — → — | — → — |
| Akhir full/light/CPU 1× | 8.227 → 8.091 | 233 → 233 | — → — | — → — |

Baseline menunjukkan lonjakan listener pada buka semula pertama, kemudian kekal pada 416 bagi buka semula ke-1, ke-4, ke-8 dan ke-12. Dalam probe tersebut, listener tidak bertambah pada setiap kali panel dibuka semula; punca tepat perubahan awal belum dikenal pasti. Heap masih berubah sedikit dan navigasi memuatkan modul tambahan. Semua nilai asal, timer, nod dan pembilang kumulatif dikekalkan dalam manifest. Tiada optimasi memori spekulatif atau pengurangan animasi dibuat.

## Ujian akhir

- 104/104 ujian unit, SSR dan kontrak, lint, TypeScript terfokus pada enam fail serta binaan frontend produksi lulus.
- 18/18 ujian Playwright lulus: dua badge, empat header, lapan keyboard dan empat input. Empat probe penaipan pendek masih mencatatkan sifar keadaan height: 0 dan sifar mutasi atribut style.
- Tiga profil akhir selesai daripada lima cubaan pada binaan akhir; satu cubaan bootstrap gagal sebelum mesej pertama dan satu profil CPU 6× gabungan dihentikan pada had CPU. Kedua-duanya direkodkan di bawah. Setiap profil lengkap mempunyai 40 pertukaran, sifar permintaan AI tertunggak pada checkpoint, tiada ralat fixture atau permintaan luar jangka, dan browser ditutup dengan bersih.
- 2016 hash sumber client sepadan dengan binaan akhir; hash artifak yang dikumpul turut disahkan. Semakan sumber baca sahaja tidak menemui halangan.

## Cubaan yang gagal dan batas

- receipt-adaptive-tests-7474119d162f: Probe awal gagal pada butang Back browser kerana navigasi menggunakan replaceState. Sebanyak 40 pertukaran dan 12 kali buka semula selesai, tetapi keseluruhan cubaan gagal. Harness dibetulkan supaya menggunakan menu sebenar.
- receipt-adaptive-tests-6bedc47cb4ed: Regresi merah aplikasi: pada had 30 mesej dengan 15 balasan pembantu, balasan ke-16 selesai ketika panel dikecilkan tetapi badge kekal tersembunyi.
- receipt-adaptive-tests-17515d4212f0: Ujian header tersangkut pada tooltip fokus awal sebelum pengukuran warna. Hanya ujian dibetulkan: input difokuskan, kemudian fokus dialihkan sebelum tangkapan skrin.
- receipt-adaptive-tests-d0623b77ce4f: Profil akhir pertama gagal memuatkan Viewer dalam tempoh bootstrap 10 s, sebelum sebarang pertukaran mesej; punca muktamad belum disahkan. Ulangan menggunakan had dan timeout sama, dengan diagnostik kegagalan tambahan sahaja.
- receipt-adaptive-tests-e6325c7299e1: Profil gabungan CPU 6× dihentikan oleh had CPU cgroup 120 s selepas log checkpoint 40. Tiada JSON akhir; bukan lulus. Ulangan mengasingkan 40 pertukaran CPU 6× daripada kitaran buka semula/navigasi yang telah diuji pada CPU 1×; had tidak dinaikkan.

- Profil menggunakan Chromium headless dan data sintetik, dengan simulasi CPU pada kadar 1× dan 6×. Ia tidak menguji perkakasan fizikal, FPS, penggunaan berjam-jam atau keseluruhan proses browser.
- JSHeapUsedSize selepas kutipan sampah paksa (GC) mengukur heap halaman, bukan penggunaan keseluruhan tab dalam Chrome Task Manager. Bacaan pengguna 150–178 MB tidak diukur semula melalui kaedah yang sama.
- Heap, nod, listener dan timer ialah ukuran deskriptif. Tiada ambang kebocoran rekaan digunakan. Pertumbuhan kecil sahaja tidak membuktikan kebocoran atau ketiadaannya.
- TaskDuration/LayoutCount/RecalcStyleCount ialah pembilang kerja kumulatif; kenaikannya tidak membuktikan penggunaan CPU ketika melahu atau kebocoran.
- Pembalut timer menambah kos pengukuran dan hanya menjejak timer JavaScript halaman, bukan timer natif atau browser. Set pembalut hanya menyimpan ID angka.
- Navigasi pertama memuatkan modul Saved. Kestabilan selepas banyak kumpulan navigasi berulang dengan modul yang sudah dimuatkan belum diukur. Chat halaman penuh diuji dengan 40 pertukaran dan reset, tanpa cuba pergi dan kembali melalui menu AI yang tidak wujud.
- Pemulaan snapshot pemilik diuji sebagai fungsi tulen. Ujian browser hanya memasang semula AIChat, bukan menguji log masuk, log keluar atau pemasangan semula provider. Susunan StrictMode disemak melalui sumber dan kontrak, bukan pelaksanaan React StrictMode dalam mod pembangunan.
- Ujian tidak mengakses production, data sebenar atau servis AI sebenar. Ia tidak meliputi pengesahan backend atau permission baharu, TypeScript seluruh projek atau keseluruhan CI.

Semua pelaksanaan target berjalan bersiri dalam SQR-Audit WSL bwrap dengan had CPU 100%, memori 768 MiB/high 704/swap 0, pids 128, masa CPU 120 s dan masa sebenar 180 s. Tiada dependency dimuat turun atau had dilonggarkan.

[Manifest](ui-ai-chat-session-verification.json) · [Handoff](ui-ai-chat-session-handoff.md)

## Header cerah sebelum dan selepas

![Sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-dcd938e1197a/ai-header-light-375.jpg)

![Selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-2295bb626d93/ai-header-light-375.jpg)
