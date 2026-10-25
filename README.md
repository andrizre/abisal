# ABISAL

Text-based browser game bertema **penyelam laut dalam** (inspirasi mekanik torn.com, tema original).

## Main
Buka `index.html` di browser (bisa langsung double-click, atau `python3 -m http.server` di folder ini). Progress tersimpan otomatis di **localStorage** browser.

## Mekanik
- Pilih zona kedalaman → selam turun bertahap (`Turun Lagi`), risiko naik jika di luar zona aman.
- `Periksa Sekitar` mengangkat artefak; `Naik ke Permukaan` menutup selam.
- Oksigen habis → naik darurat, separuh temuan hilang.
- Jual artefak di Pasar, beli upgrade di Bengkel (tangki, setelan, lampu, alat, neraca).
- `Tidur` = hari baru, energi penuh.

## Database (Postgres)
`schema.sql` berisi skema siap-import ke cloud DB (Supabase/Neon/RDS):
```bash
psql "$DATABASE_URL" -f schema.sql
```
Pemetaan: state localStorage → tabel `players`, `inventory`, `player_upgrades`, `journal`, `dives`. Katalog artefak ada di tabel `artifacts` agar nanti logika server konsisten dengan `ARTIFACTS` di `game.js`.

## Roadmap (dikembangkan harian via cronjob)
- [x] Prestige / level penyelam
- [x] Event spesial per zona & boss makhluk laut
- [x] Leaderboard lokal
- [ ] Migrasi localStorage → API backend (pemakaian schema.sql)
- [ ] Ekspor/impor save (JSON download/upload)
