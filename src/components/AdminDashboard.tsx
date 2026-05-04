/**
 * 管理者ダッシュボードコンポーネント
 *
 * タブ切替で4つの管理機能を提供:
 * 1. 一般設定: app_settings の更新 + 共有カレンダー連携
 * 2. ユーザー管理: members 一覧・ロール変更・削除
 * 3. 設備管理: facilities 追加・編集・ステータス変更
 * 4. 予約承認: pending 予約の承認/却下
 */
import { useState } from 'preact/hooks';
import type { AppSettings, Member } from '../lib/types';
import SettingsTab from './admin/SettingsTab';
import MembersTab, { type MemberFull } from './admin/MembersTab';
import FacilitiesTab, { type FacilityFull } from './admin/FacilitiesTab';
import ApprovalsTab from './admin/ApprovalsTab';

interface Props {
  initialSettings: AppSettings;
  initialMembers: MemberFull[];
  initialFacilities: FacilityFull[];
  initialPendingReservations: any[];
  currentMember: Member;
  supabaseUrl: string;
  supabaseKey: string;
  accessToken: string;
}

type TabId = 'settings' | 'members' | 'facilities' | 'approvals';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'settings', label: '一般設定', icon: '⚙️' },
  { id: 'members', label: 'ユーザー管理', icon: '👥' },
  { id: 'facilities', label: '設備管理', icon: '🏢' },
  { id: 'approvals', label: '予約承認', icon: '✅' },
];

export default function AdminDashboard({
  initialSettings,
  initialMembers,
  initialFacilities,
  initialPendingReservations,
  currentMember,
  supabaseUrl,
  supabaseKey,
  accessToken,
}: Props) {

  const [activeTab, setActiveTab] = useState<TabId>('settings');
  return (
    <div>
      {/* ページタイトル */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--theme-text)' }}>
          システム管理
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--theme-text-secondary)' }}>
          アプリケーション設定・ユーザー・設備を管理します
        </p>
      </div>

      {/* タブナビゲーション */}
      <div
        className="flex gap-1 rounded-xl p-1 mb-6 overflow-x-auto"
        style={{ background: 'var(--theme-input-bg)', border: '1px solid var(--theme-card-border)' }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
            style={{
              background: activeTab === tab.id ? 'var(--theme-card-bg)' : 'transparent',
              color: activeTab === tab.id ? 'var(--theme-text)' : 'var(--theme-text-secondary)',
              boxShadow: activeTab === tab.id ? 'var(--shadow-sm)' : 'none',
            }}
          >
            <span>{tab.icon}</span> {tab.label}
            {tab.id === 'approvals' && initialPendingReservations.length > 0 && (
              <span className="ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full text-white"
                style={{ background: 'oklch(0.62 0.22 25)' }}>
                {initialPendingReservations.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* タブコンテンツ */}
      {activeTab === 'settings' && <SettingsTab initialSettings={initialSettings} />}
      {activeTab === 'members' && <MembersTab initialMembers={initialMembers} currentMemberId={currentMember.id} />}
      {activeTab === 'facilities' && <FacilitiesTab initialFacilities={initialFacilities} />}
      {activeTab === 'approvals' && <ApprovalsTab initialReservations={initialPendingReservations} supabaseUrl={supabaseUrl} supabaseKey={supabaseKey} accessToken={accessToken} />}
    </div>
  );
}
