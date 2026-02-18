=========================================
  SQR - SUMBANGAN QUERY RAHMAH
  Windows Installation Guide v3
=========================================

REQUIREMENTS:
- Windows 10+
- Node.js 18+ (https://nodejs.org/)

INSTALLATION:
1. DELETE old folder completely
2. Extract this ZIP to fresh folder
3. Double-click INSTALL.bat
4. Wait for completion

RUNNING:
1. Double-click START.bat
2. Open browser: http://localhost:5000

LAN ACCESS:
- Other PCs: http://[YOUR-IP]:5000
- Allow port 5000 in Windows Firewall

LOGIN:
- Superuser: superuser / 0441024k
- Admin: admin1 / admin123
- User: user1 / user123

=========================================
  ID DETECTION - FIXED v3
=========================================

FIXES IN THIS VERSION:
- Short codes like P40, G27, M6, T2 are NO LONGER detected
- Minimum digit requirements applied to reduce false positives

NEW DETECTION RULES:

1. IC Malaysia (12 digits):
   - Valid YYMMDD format (month 01-12, day 01-31)
   - Male (Lelaki): Last digit odd
   - Female (Perempuan): Last digit even

2. Police No. (POLIS) - STRICT RULES:
   - P, G + 5+ digits (P12345, G101005)
   - RF, SW + 4+ digits (RF1234, SW5678)
   - RFT, PDRM, POLIS, POL + 3+ digits
   NOT detected: P40, G27, P198 (too short)

3. Military No. (TENTERA) - STRICT RULES:
   - T, M + 5+ digits (T12345, M54321)
   - TD, TA, TT + 4+ digits (TD1234)
   - TLDM, TUDM, ARMY, ATM, MAF, TEN, MIL + 3+ digits
   NOT detected: M6, T2, T120 (too short)

4. Passport Malaysia: A, H, K, Q + 6-9 digits

5. Foreign Passport: Other 1-2 letters + 6-9 digits

DATABASE: data/sqr.db (auto-created)
