'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { FinanceService } from '../../lib/services/FinanceService';
import type { Profile, TransactionLog } from '../../types/platform';

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
interface ProfileWithAnomaly extends Profile {
  anomalyCount: number;
}

/* ─────────────────────────────────────────────
   AdminPanel
───────────────────────────────────────────── */
export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'users' | 'flow'>('users');
  const [profiles, setProfiles] = useState<ProfileWithAnomaly[]>([]);
  const [selectedUser, setSelectedUser] = useState<ProfileWithAnomaly | null>(null);
  const [flow, setFlow] = useState<TransactionLog[]>([]);
  const [anomalies, setAnomalies] = useState<TransactionLog[]>([]);
  const [search, setSearch] = useState('');
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [loadingFlow, setLoadingFlow] = useState(false);

  // Deposit / Withdraw form
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  /* ── Load all profiles ── */
  const loadProfiles = useCallback(async () => {
    setLoadingProfiles(true);
    try {
      const data = await FinanceService.adminFetchProfiles();
      // Detect anomaly count per user quickly using a lightweight approach:
      // fetch max 50 recent logs per user — heavy version done in drill-down
      const enriched: ProfileWithAnomaly[] = (data as Profile[]).map(p => ({
        ...p,
        anomalyCount: 0, // will be computed on drill-down
      }));
      setProfiles(enriched);
    } finally {
      setLoadingProfiles(false);
    }
  }, []);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  /* ── Drill-down into a user ── */
  const openUserFlow = useCallback(async (user: ProfileWithAnomaly) => {
    setSelectedUser(user);
    setTab('flow');
    setLoadingFlow(true);
    setAdjustAmount('');
    setAdjustNote('');
    try {
      const logs = await FinanceService.adminFetchUserFlow(user.id);
      const flagged = FinanceService.detectAnomalies(logs);
      setFlow(logs);
      setAnomalies(flagged);
    } finally {
      setLoadingFlow(false);
    }
  }, []);

  /* ── Admin adjust balance ── */
  const handleAdjust = useCallback(async (isDeposit: boolean) => {
    if (!selectedUser) return;
    const raw = parseFloat(adjustAmount.replace(/[^0-9.-]/g, ''));
    if (isNaN(raw) || raw <= 0) { alert('Số tiền không hợp lệ'); return; }
    const amount = isDeposit ? raw : -raw;
    const note = adjustNote.trim() || (isDeposit ? 'Nạp tiền bởi Admin' : 'Trừ tiền bởi Admin');
    setAdjusting(true);
    try {
      await FinanceService.adminExecuteTransaction(selectedUser.id, amount, note);
      alert(`✅ Thành công: ${isDeposit ? '+' : '-'}${raw.toLocaleString()} đ cho ${selectedUser.username}`);
      // Refresh
      await openUserFlow(selectedUser);
      await loadProfiles();
    } catch (err) {
      alert(`❌ Lỗi: ${(err as Error).message}`);
    } finally {
      setAdjusting(false);
    }
  }, [selectedUser, adjustAmount, adjustNote, openUserFlow, loadProfiles]);

  /* ── Filtered profiles ── */
  const filtered = profiles.filter(p =>
    p.username.toLowerCase().includes(search.toLowerCase())
  );

  /* ─────────────────── Render ─────────────────── */
  return (
    <div style={S.overlay}>
      <div style={S.panel}>

        {/* ── Header ── */}
        <div style={S.header}>
          <span style={S.headerTitle}>🛡️ ADMIN DASHBOARD</span>
          <div style={S.headerTabs}>
            <button
              style={tab === 'users' ? S.tabActive : S.tab}
              onClick={() => setTab('users')}
            >
              👥 Người dùng
            </button>
            {selectedUser && (
              <button
                style={tab === 'flow' ? S.tabActive : S.tab}
                onClick={() => setTab('flow')}
              >
                📊 Dòng tiền: {selectedUser.username}
              </button>
            )}
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕ Đóng</button>
        </div>

        {/* ══════════ TAB: USER LIST ══════════ */}
        {tab === 'users' && (
          <div style={S.body}>
            <input
              style={S.searchInput}
              placeholder="🔍 Tìm theo username..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {loadingProfiles
              ? <p style={S.hint}>Đang tải danh sách...</p>
              : (
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>#</th>
                      <th style={S.th}>Username</th>
                      <th style={S.th}>Số dư (đ)</th>
                      <th style={S.th}>ID</th>
                      <th style={S.th}>Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p, i) => (
                      <tr key={p.id} style={i % 2 === 0 ? S.rowEven : S.rowOdd}>
                        <td style={S.td}>{i + 1}</td>
                        <td style={S.td}>
                          <strong>{p.username}</strong>
                        </td>
                        <td style={{ ...S.td, color: p.balance < 0 ? '#ff4444' : '#00cc77', fontWeight: 700 }}>
                          {p.balance.toLocaleString()}
                        </td>
                        <td style={{ ...S.td, fontSize: '0.72rem', color: '#aaa' }}>
                          {p.id.slice(0, 8)}…
                        </td>
                        <td style={S.td}>
                          <button
                            style={S.btnDetail}
                            onClick={() => openUserFlow(p)}
                          >
                            🔍 Xem dòng tiền
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </div>
        )}

        {/* ══════════ TAB: USER FLOW ══════════ */}
        {tab === 'flow' && selectedUser && (
          <div style={S.body}>

            {/* ── User summary ── */}
            <div style={S.summaryCard}>
              <div>
                <div style={S.summaryName}>{selectedUser.username}</div>
                <div style={S.summaryId}>ID: {selectedUser.id}</div>
              </div>
              <div style={S.summaryBalance}>
                💰 {selectedUser.balance.toLocaleString()} đ
              </div>
            </div>

            {/* ── Anomaly banner ── */}
            {anomalies.length > 0 && (
              <div style={S.anomalyBanner}>
                🚩 Phát hiện <strong>{anomalies.length}</strong> giao dịch bất thường (≥ 50 triệu đ):
                <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                  {anomalies.map(a => (
                    <li key={a.id} style={{ marginBottom: 2 }}>
                      [{a.type}] {a.amount > 0 ? '+' : ''}{a.amount.toLocaleString()} đ — {a.description} —&nbsp;
                      <span style={{ color: '#aaa', fontSize: '0.78rem' }}>
                        {new Date(a.created_at).toLocaleString('vi-VN')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── Deposit / Withdraw controls ── */}
            <div style={S.adjustCard}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: '#d4af37' }}>⚡ Điều chỉnh số dư</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  style={S.adjustInput}
                  type="number"
                  placeholder="Số tiền (đ)"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(e.target.value)}
                  min="0"
                />
                <input
                  style={{ ...S.adjustInput, flex: 2 }}
                  type="text"
                  placeholder="Ghi chú (tuỳ chọn)"
                  value={adjustNote}
                  onChange={e => setAdjustNote(e.target.value)}
                />
                <button
                  style={{ ...S.btnAdjust, background: '#006644' }}
                  onClick={() => handleAdjust(true)}
                  disabled={adjusting}
                >
                  ＋ Nạp tiền
                </button>
                <button
                  style={{ ...S.btnAdjust, background: '#660000' }}
                  onClick={() => handleAdjust(false)}
                  disabled={adjusting}
                >
                  － Trừ tiền
                </button>
              </div>
            </div>

            {/* ── Full cash-flow table ── */}
            {loadingFlow
              ? <p style={S.hint}>Đang tải dòng tiền...</p>
              : (
                <>
                  <div style={S.hint}>Tổng {flow.length} giao dịch (mới nhất trước)</div>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Thời gian</th>
                        <th style={S.th}>Loại</th>
                        <th style={S.th}>Số tiền (đ)</th>
                        <th style={S.th}>Ghi chú</th>
                        <th style={S.th}>Cảnh báo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flow.map((log, i) => {
                        const isAnomaly = Math.abs(log.amount) >= 50_000_000;
                        return (
                          <tr
                            key={log.id}
                            style={{
                              ...(i % 2 === 0 ? S.rowEven : S.rowOdd),
                              background: isAnomaly ? 'rgba(255,60,0,0.08)' : undefined,
                            }}
                          >
                            <td style={{ ...S.td, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                              {new Date(log.created_at).toLocaleString('vi-VN')}
                            </td>
                            <td style={{ ...S.td, fontSize: '0.82rem' }}>
                              <span style={S.typeBadge}>{log.type}</span>
                            </td>
                            <td style={{
                              ...S.td,
                              fontWeight: 700,
                              color: log.amount > 0 ? '#00cc77' : '#ff4444',
                            }}>
                              {log.amount > 0 ? '+' : ''}{log.amount.toLocaleString()}
                            </td>
                            <td style={{ ...S.td, fontSize: '0.82rem' }}>{log.description}</td>
                            <td style={{ ...S.td, textAlign: 'center' }}>
                              {isAnomaly ? '🚩' : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )
            }
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Styles (inline — no external CSS required)
───────────────────────────────────────────── */
const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    paddingTop: 40, overflowY: 'auto',
  },
  panel: {
    width: '96%', maxWidth: 1100,
    background: '#0f0f0f',
    border: '1px solid #333',
    borderRadius: 12,
    marginBottom: 40,
    fontFamily: 'monospace',
    color: '#e0e0e0',
    fontSize: '0.9rem',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 20px',
    borderBottom: '1px solid #222',
    background: '#111',
    borderRadius: '12px 12px 0 0',
    flexWrap: 'wrap',
  },
  headerTitle: {
    fontWeight: 900, fontSize: '1rem', color: '#d4af37', letterSpacing: 1,
    marginRight: 'auto',
  },
  headerTabs: {
    display: 'flex', gap: 6,
  },
  tab: {
    background: '#1a1a1a', border: '1px solid #333', borderRadius: 6,
    color: '#aaa', padding: '5px 12px', cursor: 'pointer', fontSize: '0.83rem',
  },
  tabActive: {
    background: '#222', border: '1px solid #d4af37', borderRadius: 6,
    color: '#d4af37', padding: '5px 12px', cursor: 'pointer', fontSize: '0.83rem', fontWeight: 700,
  },
  closeBtn: {
    background: '#330000', border: '1px solid #660000', borderRadius: 6,
    color: '#ff6666', padding: '5px 14px', cursor: 'pointer', fontSize: '0.83rem',
  },
  body: {
    padding: '20px',
    overflowX: 'auto',
  },
  searchInput: {
    width: '100%', maxWidth: 400, marginBottom: 14,
    background: '#1a1a1a', border: '1px solid #333', borderRadius: 6,
    color: '#e0e0e0', padding: '8px 12px', fontSize: '0.9rem', outline: 'none',
  },
  table: {
    width: '100%', borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left', padding: '8px 10px',
    background: '#1a1a1a', color: '#d4af37',
    borderBottom: '1px solid #333', fontSize: '0.82rem', whiteSpace: 'nowrap',
  },
  td: {
    padding: '7px 10px', borderBottom: '1px solid #1a1a1a',
    verticalAlign: 'middle',
  },
  rowEven: { background: '#111' },
  rowOdd: { background: '#0d0d0d' },
  btnDetail: {
    background: '#1a2a3a', border: '1px solid #336', borderRadius: 5,
    color: '#66aaff', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem',
  },
  summaryCard: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#1a1a1a', border: '1px solid #333', borderRadius: 8,
    padding: '12px 18px', marginBottom: 14,
  },
  summaryName: { fontSize: '1.1rem', fontWeight: 700, color: '#d4af37' },
  summaryId: { fontSize: '0.75rem', color: '#666', marginTop: 2 },
  summaryBalance: { fontSize: '1.2rem', fontWeight: 900, color: '#00cc77' },
  anomalyBanner: {
    background: 'rgba(255,60,0,0.12)', border: '1px solid rgba(255,60,0,0.4)',
    borderRadius: 8, padding: '10px 16px', marginBottom: 14,
    color: '#ff8866', fontSize: '0.87rem',
  },
  adjustCard: {
    background: '#111', border: '1px solid #333', borderRadius: 8,
    padding: '14px 18px', marginBottom: 16,
  },
  adjustInput: {
    flex: 1, minWidth: 120,
    background: '#1a1a1a', border: '1px solid #333', borderRadius: 6,
    color: '#e0e0e0', padding: '7px 10px', fontSize: '0.9rem', outline: 'none',
  },
  btnAdjust: {
    border: 'none', borderRadius: 6, color: '#fff',
    padding: '7px 16px', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem',
  },
  hint: {
    color: '#666', fontSize: '0.82rem', marginBottom: 8,
  },
  typeBadge: {
    background: '#1a2a1a', border: '1px solid #2a4a2a', borderRadius: 4,
    padding: '2px 6px', color: '#88cc88', fontSize: '0.78rem',
  },
};
