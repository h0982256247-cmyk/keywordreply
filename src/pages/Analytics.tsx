import React, { useState, useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = 'all' | 'broadcast' | 'keyword' | 'richmenu'
type Period = '7天' | '30天' | '90天'

interface AnalyticsRow {
  id: string
  name: string
  type: '廣播' | '關鍵字' | '圖文選單'
  sent: number
  interactions: number
  date: string
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK_DATA: AnalyticsRow[] = [
  { id: '1', name: '週末特惠活動',   type: '廣播',     sent: 5200,  interactions: 1820, date: '2026-03-28' },
  { id: '2', name: '新品上市通知',   type: '廣播',     sent: 4100,  interactions: 984,  date: '2026-03-22' },
  { id: '3', name: '優惠碼領取',     type: '關鍵字',   sent: 3400,  interactions: 2210, date: '2026-03-20' },
  { id: '4', name: '春季主選單',     type: '圖文選單', sent: 12450, interactions: 4820, date: '2026-03-15' },
  { id: '5', name: '會員專屬優惠',   type: '廣播',     sent: 2800,  interactions: 756,  date: '2026-03-10' },
  { id: '6', name: '查詢訂單',       type: '關鍵字',   sent: 1920,  interactions: 1654, date: '2026-03-08' },
  { id: '7', name: '夏季圖文選單',   type: '圖文選單', sent: 11800, interactions: 4200, date: '2026-03-01' },
]

const TREND_14D = [380, 420, 510, 475, 620, 585, 715, 690, 545, 880, 925, 840, 775, 980]
const TREND_7D  = [545, 880, 925, 840, 775, 910, 980]

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useAnimatedNumber(target: number, delay = 0) {
  const [value, setValue] = useState(0)
  const ref = useRef<number>(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      const duration = 1100
      const start = Date.now()
      const tick = () => {
        const elapsed = Date.now() - start
        const p = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - p, 4)
        ref.current = Math.round(eased * target)
        setValue(ref.current)
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, delay)
    return () => clearTimeout(timer)
  }, [target, delay])

  return value
}

// ─── Mini Sparkline ───────────────────────────────────────────────────────────
function Sparkline({ data, color = '#06C755' }: { data: number[], color?: string }) {
  const W = 100, H = 36
  const max = Math.max(...data)
  const min = Math.min(...data)
  const rng = max - min || 1
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * W},${H - ((v - min) / rng) * H * 0.82 - H * 0.09}`
  )
  const line = pts.join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  const id = `sg-${color.replace('#', '')}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="36" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Full Trend Chart ─────────────────────────────────────────────────────────
function TrendChart({ data }: { data: number[] }) {
  const W = 500, H = 80
  const max = Math.max(...data)
  const min = Math.min(...data)
  const rng = max - min || 1
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * W},${H - ((v - min) / rng) * H * 0.82 - H * 0.09}`
  )
  const line = pts.join(' ')
  const area = `0,${H} ${line} ${W},${H}`

  // X-axis labels
  const labels = data.length === 14
    ? ['14天前', '', '', '', '', '', '7天前', '', '', '', '', '', '昨天', '今天']
    : ['7天前', '', '', '', '', '昨天', '今天']

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="80" preserveAspectRatio="none">
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06C755" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#06C755" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(y => (
          <line key={y} x1="0" y1={H * y} x2={W} y2={H * y}
            stroke="#F0EDE8" strokeWidth="0.8" strokeDasharray="3 3" />
        ))}
        <polygon points={area} fill="url(#trendGrad)" />
        <polyline points={line} fill="none" stroke="#06C755" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots for first and last */}
        {[0, data.length - 1].map(i => {
          const [x, y] = pts[i].split(',').map(Number)
          return <circle key={i} cx={x} cy={y} r="3" fill="#06C755" />
        })}
      </svg>
      {/* X labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        {labels.map((l, i) => (
          <span key={i} style={{ fontSize: 10, color: '#BBBBBB', fontFamily: 'DM Mono, monospace',
            visibility: l ? 'visible' : 'hidden' }}>{l}</span>
        ))}
      </div>
    </div>
  )
}

// ─── CTR Bar ─────────────────────────────────────────────────────────────────
function CtrBar({ ctr, max }: { ctr: number, max: number }) {
  const pct = Math.min((ctr / Math.max(max, 1)) * 100, 100)
  const color = ctr >= 60 ? '#06C755' : ctr >= 35 ? '#F59E0B' : '#D1CCC7'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13,
        color: ctr >= 60 ? '#06C755' : ctr >= 35 ? '#D97706' : '#8B8680',
        minWidth: 36, textAlign: 'right' }}>{ctr}%</span>
      <div style={{ flex: 1, height: 4, background: '#F0EDE8', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color,
          borderRadius: 2, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
      </div>
    </div>
  )
}

// ─── Type Badge ───────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: AnalyticsRow['type'] }) {
  const map = {
    '廣播':     { bg: '#EAF4ED', color: '#4E735D', border: '#B8D9C4' },
    '關鍵字':   { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
    '圖文選單': { bg: '#EDE9FE', color: '#5B21B6', border: '#C4B5FD' },
  }
  const s = map[type]
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap' }}>{type}</span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Analytics() {
  const [activeTab, setActiveTab]   = useState<Tab>('all')
  const [period, setPeriod]         = useState<Period>('30天')

  const totalSent         = MOCK_DATA.reduce((s, d) => s + d.sent, 0)
  const totalInteractions = MOCK_DATA.reduce((s, d) => s + d.interactions, 0)
  const avgCtr            = Math.round((totalInteractions / totalSent) * 100)
  const maxCtr            = Math.max(...MOCK_DATA.map(d => Math.round((d.interactions / d.sent) * 100)))
  const bestRow           = MOCK_DATA.find(d => Math.round((d.interactions / d.sent) * 100) === maxCtr)

  const sentAnim         = useAnimatedNumber(totalSent, 0)
  const interactionsAnim = useAnimatedNumber(totalInteractions, 80)
  const ctrAnim          = useAnimatedNumber(avgCtr, 160)
  const maxCtrAnim       = useAnimatedNumber(maxCtr, 240)

  const trendData = period === '7天' ? TREND_7D : TREND_14D

  const filtered = activeTab === 'all' ? MOCK_DATA : MOCK_DATA.filter(d => {
    if (activeTab === 'broadcast') return d.type === '廣播'
    if (activeTab === 'keyword')   return d.type === '關鍵字'
    if (activeTab === 'richmenu')  return d.type === '圖文選單'
    return true
  })

  const tableMaxCtr = Math.max(...filtered.map(d => Math.round((d.interactions / d.sent) * 100)))

  const tabs: { id: Tab, label: string }[] = [
    { id: 'all',       label: '全部' },
    { id: 'broadcast', label: '廣播' },
    { id: 'keyword',   label: '關鍵字' },
    { id: 'richmenu',  label: '圖文選單' },
  ]

  return (
    <>
      {/* Font import */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Instrument+Serif:ital@0;1&display=swap');
        .analytics-row { transition: background 0.12s; }
        .analytics-row:hover { background: #FAFAF8; }
        .period-btn { transition: all 0.12s; }
        .tab-pill { transition: all 0.12s; }
      ` }} />

      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* ── Page Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1A1A1A',
              letterSpacing: '-0.02em', margin: 0 }}>點擊成效分析</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#999999' }}>
              追蹤廣播、關鍵字與圖文選單的用戶互動表現
            </p>
          </div>
          {/* Period selector */}
          <div style={{ display: 'flex', gap: 4, background: '#F0EDE8',
            padding: 3, borderRadius: 8 }}>
            {(['7天', '30天', '90天'] as Period[]).map(p => (
              <button key={p} className="period-btn" onClick={() => setPeriod(p)}
                style={{
                  padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: 'pointer',
                  background: period === p ? '#FFFFFF' : 'transparent',
                  color: period === p ? '#1A1A1A' : '#999999',
                  boxShadow: period === p ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  fontFamily: 'inherit',
                }}>{p}</button>
            ))}
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>

          {/* Total Sent */}
          <div style={{ background: '#FFFFFF', border: '1px solid #EFEFEF',
            borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#BBBBBB',
              letterSpacing: '0.08em', marginBottom: 10 }}>總發送人次</div>
            <div style={{ fontSize: 26, fontWeight: 400, color: '#1A1A1A', lineHeight: 1,
              fontFamily: 'Instrument Serif, serif' }}>
              {sentAnim.toLocaleString()}
            </div>
            <div style={{ marginTop: 10 }}>
              <Sparkline data={trendData} color="#BBBBBB" />
            </div>
          </div>

          {/* Interactions */}
          <div style={{ background: '#FFFFFF', border: '1px solid #EFEFEF',
            borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#BBBBBB',
              letterSpacing: '0.08em', marginBottom: 10 }}>互動次數</div>
            <div style={{ fontSize: 26, fontWeight: 400, color: '#06C755', lineHeight: 1,
              fontFamily: 'Instrument Serif, serif' }}>
              {interactionsAnim.toLocaleString()}
            </div>
            <div style={{ marginTop: 10 }}>
              <Sparkline data={trendData} color="#06C755" />
            </div>
          </div>

          {/* Avg CTR */}
          <div style={{ background: '#FFFFFF', border: '1px solid #EFEFEF',
            borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#BBBBBB',
              letterSpacing: '0.08em', marginBottom: 10 }}>平均互動率</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ fontSize: 26, fontWeight: 400, color: '#1A1A1A', lineHeight: 1,
                fontFamily: 'Instrument Serif, serif' }}>{ctrAnim}</span>
              <span style={{ fontSize: 14, color: '#BBBBBB', fontFamily: 'DM Mono, monospace' }}>%</span>
            </div>
            <div style={{ marginTop: 12, height: 3, background: '#F0EDE8', borderRadius: 2 }}>
              <div style={{ height: '100%', borderRadius: 2, background: '#A35D5D',
                width: `${avgCtr * 1.5}%`, transition: 'width 1s ease' }} />
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#CCCCCC' }}>
              vs 30% 行業平均
            </div>
          </div>

          {/* Best CTR */}
          <div style={{ background: '#FFFFFF', border: '1px solid #EFEFEF',
            borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#BBBBBB',
              letterSpacing: '0.08em', marginBottom: 10 }}>最高互動率</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ fontSize: 26, fontWeight: 400, color: '#D97706', lineHeight: 1,
                fontFamily: 'Instrument Serif, serif' }}>{maxCtrAnim}</span>
              <span style={{ fontSize: 14, color: '#BBBBBB', fontFamily: 'DM Mono, monospace' }}>%</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: '#999999',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {bestRow?.name}
            </div>
            <div style={{ marginTop: 2 }}>
              {bestRow && <TypeBadge type={bestRow.type} />}
            </div>
          </div>
        </div>

        {/* ── Trend Chart Card ── */}
        <div style={{ background: '#FFFFFF', border: '1px solid #EFEFEF',
          borderRadius: 10, padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>互動趨勢</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#06C755' }} />
              <span style={{ fontSize: 12, color: '#999999' }}>每日互動次數</span>
            </div>
          </div>
          <TrendChart data={trendData} />
        </div>

        {/* ── Table Card ── */}
        <div style={{ background: '#FFFFFF', border: '1px solid #EFEFEF',
          borderRadius: 10, overflow: 'hidden' }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2,
            padding: '12px 16px', borderBottom: '1px solid #F5F5F5' }}>
            {tabs.map(tab => (
              <button key={tab.id} className="tab-pill" onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: activeTab === tab.id ? '#1A1A1A' : 'transparent',
                  color: activeTab === tab.id ? '#FFFFFF' : '#999999',
                }}>{tab.label}</button>
            ))}
            <div style={{ marginLeft: 'auto', fontSize: 12, color: '#CCCCCC',
              fontFamily: 'DM Mono, monospace' }}>
              {filtered.length} 筆
            </div>
          </div>

          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 160px 72px',
            gap: 12, padding: '10px 20px', borderBottom: '1px solid #F5F5F5' }}>
            {['活動名稱', '發送', '互動', '互動率', '日期'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#CCCCCC',
                letterSpacing: '0.06em' }}>{h}</div>
            ))}
          </div>

          {/* Table rows */}
          {filtered.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#CCCCCC', fontSize: 13 }}>
              此分類暫無資料
            </div>
          ) : filtered.map((row, i) => {
            const ctr = Math.round((row.interactions / row.sent) * 100)
            return (
              <div key={row.id} className="analytics-row"
                style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 160px 72px',
                  gap: 12, padding: '13px 20px',
                  borderBottom: i < filtered.length - 1 ? '1px solid #F9F9F9' : 'none',
                  alignItems: 'center' }}>

                {/* Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <TypeBadge type={row.type} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.name}
                  </span>
                </div>

                {/* Sent */}
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13,
                  color: '#AAAAAA' }}>{row.sent.toLocaleString()}</div>

                {/* Interactions */}
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13,
                  fontWeight: 500, color: '#1A1A1A' }}>{row.interactions.toLocaleString()}</div>

                {/* CTR */}
                <CtrBar ctr={ctr} max={tableMaxCtr} />

                {/* Date */}
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11,
                  color: '#CCCCCC' }}>{row.date.slice(5).replace('-', '/')}</div>
              </div>
            )
          })}
        </div>

        {/* ── Empty state note ── */}
        <p style={{ marginTop: 16, fontSize: 11, color: '#CCCCCC', textAlign: 'center' }}>
          * 目前顯示示範資料，實際資料需整合 postback 事件追蹤
        </p>
      </div>
    </>
  )
}
