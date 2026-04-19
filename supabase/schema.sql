-- =============================================
-- 設備予約システム - データベーススキーマ & RLS
-- =============================================
-- Supabase SQL Editorで実行済み。
-- このファイルはリファレンスとしてリポジトリに保存する。
--
-- ※ 本番環境では既に適用済みのため、再実行は不要。
--   スキーマ変更時は新しいマイグレーションファイルを作成すること。
-- =============================================

-- 必須：gen_random_bytes を使うための拡張機能を有効化
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- UUID v7 を生成するための関数
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid AS $$
DECLARE
  timestamp_ms bigint;
  internal_val bytea;
BEGIN
  -- 現在のミリ秒を取得
  timestamp_ms := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  -- 16バイトのバイト列を生成（48ビットのタイムスタンプ + ランダムなデータ）
  internal_val := decode(lpad(to_hex(timestamp_ms), 12, '0'), 'hex') || gen_random_bytes(10);

  -- バージョン(7)とバリアントを設定
  internal_val := set_byte(internal_val, 6, (get_byte(internal_val, 6) & 15) | 112);
  internal_val := set_byte(internal_val, 8, (get_byte(internal_val, 8) & 63) | 128);

  RETURN encode(internal_val, 'hex')::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;


-- ==========================================
-- 1. 拡張機能の有効化
-- ※ uuid-ossp は廃止し、排他制御用の btree_gist のみ有効化
-- ==========================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ==========================================
-- 2. テーブルの作成
-- ==========================================

-- メンバーテーブル
CREATE TABLE members (
  id UUID DEFAULT uuid_generate_v7() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 設備テーブル
-- ※ nameにUNIQUE制約を追加し、重複登録を防止
CREATE TABLE facilities (
  id UUID DEFAULT uuid_generate_v7() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 予約テーブル
CREATE TABLE reservations (
  id UUID DEFAULT uuid_generate_v7() PRIMARY KEY,
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES members(id),
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  purpose TEXT NOT NULL,
  memo TEXT,
  notice TEXT,
  event_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- 前後関係のチェック
  CONSTRAINT start_before_end CHECK (start_time < end_time),
  -- ダブルブッキング防止 (facility_idと時間の重なりを禁止)
  CONSTRAINT prevent_double_booking EXCLUDE USING gist (
    facility_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  )
);

-- 参加者テーブル
CREATE TABLE reservation_participants (
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  PRIMARY KEY (reservation_id, member_id)
);

-- トークン管理テーブル（Googleカレンダー連携用）
CREATE TABLE user_tokens (
  member_id UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 3. 管理者判定用の便利関数の作成
-- ==========================================
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM members 
    WHERE email = auth.jwt()->>'email' AND role = 'admin' AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ==========================================
-- 4. 行レベルセキュリティ (RLS) の設定
-- ==========================================
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;

-- 【Members のポリシー】
-- SELECT: 全ユーザー閲覧可（匿名キーも含む → Pre-Checkで使用）
CREATE POLICY "メンバーは誰でも閲覧可能" ON members FOR SELECT USING (true);
-- INSERT/UPDATE/DELETE: 管理者のみ
CREATE POLICY "メンバーの追加更新は管理者のみ" ON members FOR ALL USING (is_admin());

-- 【Facilities のポリシー】
-- SELECT: 全ユーザー閲覧可
CREATE POLICY "設備は誰でも閲覧可能" ON facilities FOR SELECT USING (true);
-- INSERT/UPDATE/DELETE: 管理者のみ
CREATE POLICY "設備の追加更新は管理者のみ" ON facilities FOR ALL USING (is_admin());

-- 【Reservations のポリシー】
-- SELECT: 全ユーザー閲覧可
CREATE POLICY "予約は誰でも閲覧可能" ON reservations FOR SELECT USING (true);

-- INSERT: 自分自身のIDをcreated_byに設定する場合のみ許可
-- → 他人になりすまして予約を作成することを防止
CREATE POLICY "予約の作成は本人のみ" ON reservations FOR INSERT WITH CHECK (
  created_by = (SELECT id FROM members WHERE email = auth.jwt()->>'email')
);

-- UPDATE: 作成者本人 または 管理者のみ許可
-- USING: 既存行の読み取り条件, WITH CHECK: 更新後の値の条件
CREATE POLICY "予約の更新は本人か管理者のみ" ON reservations FOR UPDATE USING (
  created_by = (SELECT id FROM members WHERE email = auth.jwt()->>'email') OR is_admin()
) WITH CHECK (
  created_by = (SELECT id FROM members WHERE email = auth.jwt()->>'email') OR is_admin()
);

-- DELETE: 作成者本人 または 管理者のみ許可
CREATE POLICY "予約の削除は本人か管理者のみ" ON reservations FOR DELETE USING (
  created_by = (SELECT id FROM members WHERE email = auth.jwt()->>'email') OR is_admin()
);

-- 【Reservation_Participants のポリシー】
-- SELECT: 全ユーザー閲覧可
CREATE POLICY "参加者は誰でも閲覧可能" ON reservation_participants FOR SELECT USING (true);

-- INSERT: 予約の作成者、または管理者のみ
CREATE POLICY "参加者の追加は予約作成者か管理者のみ" ON reservation_participants FOR INSERT WITH CHECK (
  is_admin() OR 
  reservation_id IN (
    SELECT id FROM reservations 
    WHERE created_by = (SELECT id FROM members WHERE email = auth.jwt()->>'email')
  )
);

-- DELETE: 予約の作成者、管理者、または招待された本人
CREATE POLICY "参加者の削除は予約作成者、管理者、または招待された本人のみ" ON reservation_participants FOR DELETE USING (
  is_admin() OR 
  reservation_id IN (
    SELECT id FROM reservations 
    WHERE created_by = (SELECT id FROM members WHERE email = auth.jwt()->>'email')
  ) OR 
  member_id = (SELECT id FROM members WHERE email = auth.jwt()->>'email')
);

-- 【User_Tokens のポリシー】
-- ALL: 本人のみ読み書き可能（超重要 - refresh_tokenは機密情報）
CREATE POLICY "自分のトークンのみ操作可能" ON user_tokens FOR ALL USING (
  member_id = (SELECT id FROM members WHERE email = auth.jwt()->>'email')
) WITH CHECK (
  member_id = (SELECT id FROM members WHERE email = auth.jwt()->>'email')
);

-- ==========================================
-- 5. Realtime の有効化
-- ==========================================
-- reservations テーブルの変更通知を有効化
-- → クライアント側で Supabase Realtime (postgres_changes) を購読し、
--   UI を自動的に再描画する
ALTER PUBLICATION supabase_realtime ADD TABLE reservations;
