# Keyboard Shortcuts

Dokumen ini hanya menyenaraikan shortcut yang benar-benar wujud dalam kod semasa. Ia bertujuan membantu QA, support, dan pengguna kuasa memahami behavior keyboard tanpa meneka.

## Global Navigation

| Shortcut | Scope | Action |
|---------|-------|--------|
| `Cmd/Ctrl + B` | App shell dengan sidebar | Toggle sidebar buka/tutup |

## Page Shortcuts

| Shortcut | Page | Action |
|---------|------|--------|
| `/` | `Viewer` | Fokus dan pilih medan carian |
| `/` | `Saved Imports` | Fokus dan pilih medan carian |
| `Esc` | `Viewer` | Tutup panel filters dan column selector |
| `Cmd/Ctrl + S` | `Save Collection` | Hantar borang simpan collection |

## Component Shortcuts

| Shortcut | Component | Action |
|---------|-----------|--------|
| `ArrowLeft` | Focused carousel | Pergi ke slide sebelumnya |
| `ArrowRight` | Focused carousel | Pergi ke slide seterusnya |

## Notes

- Shortcut berasaskan `usePageShortcuts()` tidak aktif ketika fokus berada dalam `input`, `textarea`, `select`, atau elemen `contenteditable`, kecuali sesuatu page memang membenarkannya secara eksplisit.
- `Save Collection` sengaja membenarkan `Cmd/Ctrl + S` walaupun kursor berada dalam medan borang, supaya tindakan simpan kekal konsisten semasa menaip.
- Jika shortcut baru ditambah pada masa depan, kemas kini fail ini dalam patch yang sama supaya dokumentasi tidak tertinggal.
