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


-- ==========================================
-- 6. 追加機能: アプリケーション設定管理
-- ==========================================

-- 一般設定テーブル（フロントエンドに公開しても安全な設定）
CREATE TABLE app_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- シングルトン設計（1行のみ）
    start_hour INT NOT NULL DEFAULT 8,
    end_hour INT NOT NULL DEFAULT 20,
    reservation_lead_time_days INT NOT NULL DEFAULT 90, -- 予約可能日数
    max_reservation_hours INT NOT NULL DEFAULT 8,
    min_reservation_minutes INT NOT NULL DEFAULT 10,
    auto_approve BOOLEAN NOT NULL DEFAULT true,
    shared_calendar_enabled BOOLEAN NOT NULL DEFAULT false,
    shared_calendar_email TEXT, -- 連携中のアカウント表示用
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
INSERT INTO app_settings (id) VALUES (1);

-- 秘密設定テーブル（絶対にフロントエンドに渡さない機密情報）
CREATE TABLE app_secrets (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    shared_calendar_refresh_token TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
INSERT INTO app_secrets (id) VALUES (1);

-- RLSの設定
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;

-- アプリ設定はログイン済みの全ユーザーが閲覧可能（UI描画に必要）
CREATE POLICY "設定は認証ユーザー閲覧可能" ON app_settings FOR SELECT USING (auth.role() = 'authenticated');
-- 更新は管理者のみ
CREATE POLICY "設定の更新は管理者のみ" ON app_settings FOR UPDATE USING (is_admin());

-- 秘密設定は誰もSELECTできない（Edge FunctionがService Roleキーで強制取得する）
-- ただし、管理者は新しいトークンのUPDATE（上書き）のみ可能とする
CREATE POLICY "秘密情報の更新は管理者のみ" ON app_secrets FOR UPDATE USING (is_admin());


-- ==========================================
-- 7. 追加機能: 予約テーブルの拡張
-- ==========================================

-- 共有カレンダーイベントIDと承認ステータスの追加
ALTER TABLE reservations ADD COLUMN shared_event_id TEXT;
ALTER TABLE reservations ADD COLUMN status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected'));


-- ==========================================
-- 8. 追加機能: 操作ログ（証跡管理）
-- ==========================================

-- ログテーブル
CREATE TABLE reservation_logs (
    id UUID DEFAULT uuid_generate_v7() PRIMARY KEY,
    reservation_id UUID NOT NULL, -- 削除されても履歴が残るよう外部キー制約(REFERENCES)はあえて付けない
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    changed_by UUID, -- 操作者のメンバーID
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE reservation_logs ENABLE ROW LEVEL SECURITY;
-- ログは管理者のみ閲覧可能、変更・削除は誰にも許可しない（完全なイミュータブル）
CREATE POLICY "ログの閲覧は管理者のみ" ON reservation_logs FOR SELECT USING (is_admin());


-- ==========================================
-- 9. データベース・トリガーによる強力な制約と自動ログ処理
-- ==========================================

-- トリガー関数①：時間経過による変更・削除のロック（バックエンドでの強制防御）
CREATE OR REPLACE FUNCTION enforce_reservation_time_lock()
RETURNS TRIGGER AS $$
BEGIN
    -- 管理者による操作、またはシステム(Service Role)の操作はロックを免除
    IF is_admin() OR auth.role() = 'service_role' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    -- DELETE 時の検証
    IF TG_OP = 'DELETE' THEN
        -- 開始から1時間経過で削除不可
        IF NOW() > OLD.start_time + INTERVAL '1 hour' THEN
            RAISE EXCEPTION '開始時刻から1時間以上経過した予約は削除できません。';
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE 時の検証
    IF TG_OP = 'UPDATE' THEN
        -- 終了時刻から1時間経過ですべての変更不可
        IF NOW() > OLD.end_time + INTERVAL '1 hour' THEN
            RAISE EXCEPTION '終了時刻から1時間以上経過した予約は変更できません。';
        END IF;

        -- 開始時刻から1時間経過で「開始時刻そのもの」の変更不可
        IF NOW() > OLD.start_time + INTERVAL '1 hour' THEN
            IF NEW.start_time IS DISTINCT FROM OLD.start_time THEN
                RAISE EXCEPTION '開始時刻から1時間以上経過したため、開始時刻は変更できません。';
            END IF;
        END IF;

        RETURN NEW;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガーの登録 (UPDATE と DELETE の前に実行)
CREATE TRIGGER trigger_enforce_time_lock
BEFORE UPDATE OR DELETE ON reservations
FOR EACH ROW EXECUTE FUNCTION enforce_reservation_time_lock();


-- トリガー関数②：操作ログの自動記録
-- APIや直接のSQL実行など、どこから変更されても確実にログを残す
CREATE OR REPLACE FUNCTION log_reservation_changes()
RETURNS TRIGGER AS $$
DECLARE
    current_member_id UUID;
BEGIN
    -- 現在操作しているユーザーのIDを取得
    SELECT id INTO current_member_id FROM members WHERE email = auth.jwt()->>'email';

    IF TG_OP = 'INSERT' THEN
        INSERT INTO reservation_logs (reservation_id, action, changed_by, new_data)
        VALUES (NEW.id, 'INSERT', current_member_id, row_to_json(NEW)::jsonb);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO reservation_logs (reservation_id, action, changed_by, old_data, new_data)
        VALUES (NEW.id, 'UPDATE', current_member_id, row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO reservation_logs (reservation_id, action, changed_by, old_data)
        VALUES (OLD.id, 'DELETE', current_member_id, row_to_json(OLD)::jsonb);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガーの登録 (INSERT, UPDATE, DELETE の後に実行)
CREATE TRIGGER trigger_log_reservation_changes
AFTER INSERT OR UPDATE OR DELETE ON reservations
FOR EACH ROW EXECUTE FUNCTION log_reservation_changes();