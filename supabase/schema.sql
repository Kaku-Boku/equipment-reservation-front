-- =============================================
-- 設備予約システム - データベーススキーマ & RLS
-- =============================================
-- 目的: 本番環境初期構築・およびリポジトリ保存用のリファレンス
-- =============================================

-- ==========================================
-- 1. 拡張機能の有効化
-- ==========================================
-- gen_random_bytes用
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- 排他制御（EXCLUDE USING gist）用
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ==========================================
-- 2. 共通関数の作成
-- ==========================================
-- UUID v7 を生成するための関数 (時間順にソート可能なUUID)
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid AS $$
DECLARE
  timestamp_ms bigint;
  internal_val bytea;
BEGIN
  timestamp_ms := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;
  internal_val := decode(lpad(to_hex(timestamp_ms), 12, '0'), 'hex') || gen_random_bytes(10);
  internal_val := set_byte(internal_val, 6, (get_byte(internal_val, 6) & 15) | 112);
  internal_val := set_byte(internal_val, 8, (get_byte(internal_val, 8) & 63) | 128);
  RETURN encode(internal_val, 'hex')::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 管理者判定用の便利関数
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM members 
    WHERE email = auth.jwt()->>'email' AND role = 'admin' AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ==========================================
-- 3. テーブルの作成
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
  shared_event_id TEXT,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- 制約: 終了時間は開始時間より後であること
  CONSTRAINT start_before_end CHECK (start_time < end_time),
  
  -- 制約: ダブルブッキング防止 (rejected状態の予約は重複チェックから除外)
  CONSTRAINT prevent_double_booking EXCLUDE USING gist (
    facility_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status != 'rejected')
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

-- アプリケーション一般設定テーブル（フロントエンド公開用、シングルトン）
CREATE TABLE app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  start_hour INT NOT NULL DEFAULT 8,
  end_hour INT NOT NULL DEFAULT 20,
  reservation_lead_time_days INT NOT NULL DEFAULT 90,
  max_reservation_hours INT NOT NULL DEFAULT 8,
  min_reservation_minutes INT NOT NULL DEFAULT 10,
  auto_approve BOOLEAN NOT NULL DEFAULT true,
  shared_calendar_enabled BOOLEAN NOT NULL DEFAULT false,
  shared_calendar_email TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
INSERT INTO app_settings (id) VALUES (1);

-- アプリケーション秘密設定テーブル（機密情報用、シングルトン）
CREATE TABLE app_secrets (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shared_calendar_refresh_token TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
INSERT INTO app_secrets (id) VALUES (1);

-- 操作ログテーブル（証跡管理用）
CREATE TABLE reservation_logs (
  id UUID DEFAULT uuid_generate_v7() PRIMARY KEY,
  reservation_id UUID NOT NULL, -- 外部キー制約は付けない(削除後も残すため)
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_by UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 4. インデックスの作成
-- ==========================================
-- 予約検索の高速化用インデックス
CREATE INDEX idx_reservations_start_time ON reservations (start_time);
CREATE INDEX idx_reservations_end_time ON reservations (end_time);
CREATE INDEX idx_reservations_status ON reservations (status) WHERE status = 'pending';
CREATE INDEX idx_reservations_facility_id ON reservations (facility_id);

-- ==========================================
-- 5. 行レベルセキュリティ (RLS) の設定
-- ==========================================
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_logs ENABLE ROW LEVEL SECURITY;

-- 【Members】
CREATE POLICY "メンバーは誰でも閲覧可能" ON members FOR SELECT USING (true);
CREATE POLICY "メンバーの追加は管理者のみ" ON members FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "メンバーの更新は管理者のみ" ON members FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "メンバーの削除は管理者のみ" ON members FOR DELETE USING (is_admin());

-- 【Facilities】
CREATE POLICY "設備は誰でも閲覧可能" ON facilities FOR SELECT USING (true);
CREATE POLICY "設備の追加更新削除は管理者のみ" ON facilities FOR ALL USING (is_admin());

-- 【Reservations】
CREATE POLICY "予約は認証ユーザーのみ閲覧可能" ON reservations FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "予約の作成は本人のみ" ON reservations FOR INSERT WITH CHECK (
  created_by = (SELECT id FROM members WHERE email = auth.jwt()->>'email')
);
CREATE POLICY "予約の更新は本人か管理者のみ" ON reservations FOR UPDATE USING (
  created_by = (SELECT id FROM members WHERE email = auth.jwt()->>'email') OR is_admin()
) WITH CHECK (
  created_by = (SELECT id FROM members WHERE email = auth.jwt()->>'email') OR is_admin()
);
CREATE POLICY "予約の削除は本人か管理者のみ" ON reservations FOR DELETE USING (
  created_by = (SELECT id FROM members WHERE email = auth.jwt()->>'email') OR is_admin()
);

-- 【Reservation_Participants】
CREATE POLICY "参加者は誰でも閲覧可能" ON reservation_participants FOR SELECT USING (true);
CREATE POLICY "参加者の追加は予約作成者か管理者のみ" ON reservation_participants FOR INSERT WITH CHECK (
  is_admin() OR reservation_id IN (SELECT id FROM reservations WHERE created_by = (SELECT id FROM members WHERE email = auth.jwt()->>'email'))
);
CREATE POLICY "参加者の削除は予約作成者、管理者、または招待された本人のみ" ON reservation_participants FOR DELETE USING (
  is_admin() OR 
  reservation_id IN (SELECT id FROM reservations WHERE created_by = (SELECT id FROM members WHERE email = auth.jwt()->>'email')) OR 
  member_id = (SELECT id FROM members WHERE email = auth.jwt()->>'email')
);

-- 【User_Tokens】
CREATE POLICY "自分のトークンのみ操作可能" ON user_tokens FOR ALL USING (
  member_id = (SELECT id FROM members WHERE email = auth.jwt()->>'email')
) WITH CHECK (
  member_id = (SELECT id FROM members WHERE email = auth.jwt()->>'email')
);

-- 【App_Settings & App_Secrets】
CREATE POLICY "設定は認証ユーザー閲覧可能" ON app_settings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "設定の更新は管理者のみ" ON app_settings FOR UPDATE USING (is_admin());
CREATE POLICY "秘密情報の更新は管理者のみ" ON app_secrets FOR UPDATE USING (is_admin());

-- 【Reservation_Logs】
CREATE POLICY "ログの閲覧は管理者のみ" ON reservation_logs FOR SELECT USING (is_admin());

-- ==========================================
-- 6. データベース・トリガーの設定
-- ==========================================

-- ① 時間経過による変更・削除のロック
CREATE OR REPLACE FUNCTION enforce_reservation_time_lock()
RETURNS TRIGGER AS $$
BEGIN
    IF is_admin() OR auth.role() = 'service_role' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF NOW() > OLD.start_time + INTERVAL '1 hour' THEN
            RAISE EXCEPTION '開始時刻から1時間以上経過した予約は削除できません。';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NOW() > OLD.end_time + INTERVAL '1 hour' THEN
            RAISE EXCEPTION '終了時刻から1時間以上経過した予約は変更できません。';
        END IF;
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

CREATE TRIGGER trigger_enforce_time_lock
BEFORE UPDATE OR DELETE ON reservations
FOR EACH ROW EXECUTE FUNCTION enforce_reservation_time_lock();

-- ② 操作ログの自動記録 (エラーハンドリング・System考慮版)
CREATE OR REPLACE FUNCTION log_reservation_changes()
RETURNS TRIGGER AS $$
DECLARE
    current_member_id UUID;
    jwt_email TEXT;
BEGIN
    BEGIN
        jwt_email := auth.jwt()->>'email';
    EXCEPTION WHEN OTHERS THEN
        jwt_email := NULL;
    END;

    IF jwt_email IS NOT NULL THEN
        SELECT id INTO current_member_id FROM members WHERE email = jwt_email;
    END IF;

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

CREATE TRIGGER trigger_log_reservation_changes
AFTER INSERT OR UPDATE OR DELETE ON reservations
FOR EACH ROW EXECUTE FUNCTION log_reservation_changes();

-- ==========================================
-- 7. Realtime の有効化
-- ==========================================
-- UI自動更新のため、主要テーブルの変更通知を有効化
ALTER PUBLICATION supabase_realtime ADD TABLE reservations;
ALTER PUBLICATION supabase_realtime ADD TABLE facilities;
ALTER PUBLICATION supabase_realtime ADD TABLE members;