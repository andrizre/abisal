-- ============================================================
-- ABISAL — Postgres schema
-- Siap import ke database cloud:
--   psql "$DATABASE_URL" -f schema.sql
-- Struktur state localStorage dipetakan 1:1 ke tabel ini.
-- ============================================================

CREATE TABLE IF NOT EXISTS players (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  day           INTEGER NOT NULL DEFAULT 1,
  coins         BIGINT NOT NULL DEFAULT 50,
  energy        INTEGER NOT NULL DEFAULT 100,
  max_energy    INTEGER NOT NULL DEFAULT 100,
  safe_depth    INTEGER NOT NULL DEFAULT 50,
  luck          REAL NOT NULL DEFAULT 0,
  finds_per_dive INTEGER NOT NULL DEFAULT 2,
  safety        REAL NOT NULL DEFAULT 0,
  deepest       INTEGER NOT NULL DEFAULT 0,
  earned        BIGINT NOT NULL DEFAULT 0,  -- total koin sepanjang karier (lifetime)
  prestige      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inventory: artifactId -> qty
CREATE TABLE IF NOT EXISTS inventory (
  player_id   BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL,
  qty         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, artifact_id)
);

-- Upgrade levels: id -> level
CREATE TABLE IF NOT EXISTS player_upgrades (
  player_id   BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  upgrade_id  TEXT NOT NULL,
  level       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, upgrade_id)
);

-- Log jurnal
CREATE TABLE IF NOT EXISTS journal (
  id        BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  day       INTEGER NOT NULL,
  text      TEXT NOT NULL,
  kind      TEXT NOT NULL DEFAULT 'info',  -- info | good | bad
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_journal_player ON journal(player_id, id DESC);

-- Koleksi museum: set yang sudah didonasikan (bonus permanen)
CREATE TABLE IF NOT EXISTS player_museum (
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  set_id    TEXT NOT NULL,
  donated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, set_id)
);

-- Pencatatan setiap selam (untuk statistik/balancing nanti)
CREATE TABLE IF NOT EXISTS dives (
  id           BIGSERIAL PRIMARY KEY,
  player_id    BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  day          INTEGER NOT NULL,
  target_depth INTEGER NOT NULL,
  max_depth    INTEGER NOT NULL,
  finds        JSONB NOT NULL DEFAULT '[]',
  forced_ascent BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dives_player ON dives(player_id, id DESC);

-- Katalog artefak (mirror konstanta ARTIFACTS di game.js, agar server-side nanti konsisten)
CREATE TABLE IF NOT EXISTS artifacts (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  min_depth INTEGER NOT NULL,
  value     BIGINT NOT NULL
);

INSERT INTO artifacts (id, name, min_depth, value) VALUES
  ('koral_merah','Koral Merah',10,15),
  ('koin_tenggelam','Koin Tenggelam',10,25),
  ('amfora','Pecahan Amfora',50,60),
  ('mutiara','Mutiara Liar',50,90),
  ('kompas_kapal','Kompas Kapal Karam',100,180),
  ('emas_ingot','Batang Emas Korban',100,320),
  ('ikon_air','Ikon Air Kuno',200,700),
  ('teropong_sirine','Teropong Sirine',200,1100),
  ('jantung_abisal','Jantung Abisal',400,3000),
  ('topi_kapten','Topi Kapten Tenggelam',NULL,600),
  ('sisik_baja','Sisik Baja Ular Laut',NULL,1100),
  ('mata_abisal','Mata Sang Abisal',NULL,3500)
ON CONFLICT (id) DO NOTHING;

-- Artefak spesial (hadiah boss) tidak punya kedalaman minimum — hanya dari boss.
ALTER TABLE artifacts ALTER COLUMN min_depth DROP NOT NULL;
