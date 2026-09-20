export type SystemStatusKind = "404" | "502" | "503" | "504" | "maintenance" | "offline" | "restored";

export const SYSTEM_STATUS_CONTENT = {
  "404": {
    label: "Halaman tidak tersedia", title: "Halaman Tidak Ditemui",
    description: "Halaman yang anda cuba buka mungkin telah dipindahkan, dipadam atau alamatnya tidak tepat.",
    guidance: "Kembali ke ruang kerja anda", steps: ["Gunakan pautan pada halaman ini untuk kembali ke SQR.", "Jika pautan ini dikongsi dengan anda, semak semula dengan pengirim."],
    note: "Tidak perlu berkongsi alamat penuh atau maklumat akaun untuk melaporkan pautan ini.",
    tone: "info", code: "404",
  },
  "502": {
    label: "Gangguan perkhidmatan", title: "Perkhidmatan Tidak Tersedia",
    description: "SQR tidak dapat dihubungi buat sementara waktu. Sila cuba semula sebentar lagi.",
    guidance: "Sambung apabila sedia", steps: ["Semak sambungan sebelum meneruskan kerja.", "Jika anda baru menyimpan sesuatu, semak rekod selepas masuk semula sebelum menghantarnya sekali lagi."],
    note: "Jika gangguan berterusan, maklumkan kod ralat kepada pentadbir sistem.", tone: "critical", code: "502",
  },
  "503": {
    label: "Perkhidmatan sementara tergendala", title: "SQR Belum Tersedia",
    description: "Perkhidmatan belum dapat menerima permintaan anda. Sila cuba semula sebentar lagi.",
    guidance: "Tidak perlu memuat semula berulang kali", steps: ["Gunakan Cuba Semula untuk menyemak perkhidmatan.", "Teruskan hanya selepas pengesahan sambungan berjaya."],
    note: "Tiada anggaran masa pemulihan tersedia buat masa ini.", tone: "warning", code: "503",
  },
  "504": {
    label: "Respons mengambil masa", title: "Sambungan Mengambil Masa Terlalu Lama",
    description: "SQR belum memberikan respons dalam tempoh yang dijangka. Sila cuba semula.",
    guidance: "Semak sebelum menghantar semula", steps: ["Tunggu sebentar, kemudian semak sambungan.", "Jika permintaan tadi melibatkan simpanan, semak rekod dahulu untuk mengelakkan penghantaran berganda."],
    note: "Masa menunggu tamat tidak mengesahkan sama ada simpanan berjaya atau gagal.", tone: "warning", code: "504",
  },
  maintenance: {
    label: "Penyelenggaraan sistem", title: "Sistem Sedang Diselenggara",
    description: "Kami sedang menjalankan penyelenggaraan bagi meningkatkan kestabilan dan prestasi SQR.",
    guidance: "Tiada tindakan diperlukan daripada anda", steps: ["Gunakan Cuba Semula untuk menyemak status perkhidmatan.", "Pentadbir boleh log masuk untuk akses yang dibenarkan semasa penyelenggaraan."],
    note: "Anggaran masa hanya dipaparkan apabila disediakan oleh pentadbir.", tone: "warning", code: "503",
  },
  offline: {
    label: "Sambungan peranti", title: "Tiada Sambungan Internet",
    description: "Peranti ini kelihatan terputus daripada rangkaian. Semak sambungan dan cuba semula.",
    guidance: "Semak rangkaian anda", steps: ["Pastikan Wi-Fi atau sambungan rangkaian diaktifkan.", "Gunakan Cuba Semula apabila sambungan kembali tersedia."],
    note: "Sambungan peranti sahaja belum mengesahkan bahawa perkhidmatan SQR telah pulih.", tone: "warning", code: null,
  },
  restored: {
    label: "Perkhidmatan dipulihkan", title: "SQR Kembali Online",
    description: "Perkhidmatan telah memberikan respons. Anda boleh kembali ke SQR apabila bersedia.",
    guidance: "Teruskan dengan tenang", steps: ["Pilih Sambung ke SQR apabila anda bersedia.", "Semak rekod terakhir sebelum mengulangi sebarang simpanan yang belum disahkan."],
    note: "Anda tidak akan dialihkan secara automatik. Sesi log masuk mungkin perlu disahkan semula.", tone: "success", code: null,
  },
} as const;
