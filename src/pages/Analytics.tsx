import React, { useState, useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = 'all' | 'broadcast' | 'keyword' | 'richmenu'
type Period = '7天' | '30天' | '90天'

interface BroadcastRow {
  id: string; type: '廣播'
  name: string; sent: number; clicks: number; date: string
}
interface KeywordRow {
  id: string; type: '關鍵字'
  name: string; triggers: number; lastTriggered: string
}
interface RichMenuRow {
  id: string; type: '圖文選單'
  name: string
  buttons: Array<{ label: string; clicks: number }>
  date: string
}
type AnyRow = BroadcastRow | KeywordRow | RichMenuRow

// ─── Mock Data ────────────────────────────────────────────────────────────────
const BROADCASTS: BroadcastRow[] = [
  { id: 'b1', type: '廣播', name: '週末特惠活動',  sent: 5200,  clicks: 1820, date: '2026-03-28' },
  { id: 'b2', type: '廣播', name: '新品上市通知',  sent: 4100,  clicks: 984,  date: '2026-03-22' },
  { id: 'b3', type: '廣播', name: '會員專屬優惠',  sent: 2800,  clicks: 756,  date: '2026-03-10' },
  { id: 'b4', type: '廣播', name: '春季限定折扣',  sent: 6300,  clicks: 2835, date: '2026-03-05' },
]
const KEYWORDS: KeywordRow[] = [
  { id: 'k1', type: '關鍵字', name: '優惠碼領取', triggers: 2210, lastTriggered: '2026-03-31' },
  { id: 'k2', type: '關鍵字', name: '查詢訂單',   triggers: 1654, lastTriggered: '2026-04-01' },
  { id: 'k3', type: '關鍵字', name: '門市地址',   triggers: 892,  lastTriggered: '2026-03-30' },
  { id: 'k4', type: '關鍵字', name: '客服聯繫',   triggers: 438,  lastTriggered: '2026-03-29' },
]
const RICHMENUS: RichMenuRow[] = [
  {
    id: 'r1', type: '圖文選單', name: '春季主選單', date: '2026-03-15',
    buttons: [
      { label: '最新優惠', clicks: 4820 },
      { label: '商品瀏覽', clicks: 3210 },
      { label: '我的訂單', clicks: 2140 },
      { label: '聯絡我們', clicks: 870 },
    ],
  },
  {
    id: 'r2', type: '圖文選單', name: '夏季主選單', date: '2026-03-01',
    buttons: [
      { label: '夏季新品', clicks: 5120 },
      { label: '限時特賣', clicks: 4200 },
      { label: '門市地圖', clicks: 1830 },
    ],
  },
]

const TREND_14D = [380, 420, 510, 475, 620, 585, 715, 690, 545, 880, 925, 840, 775, 980]
const TREND_7D  = [545, 880, 925, 840, 775, 910, 980]

// ─── Animated Number ──────────────────────────────────────────────────────────
function useAnimatedNumber(target: number, delay = 0) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)
  useEffect(() => {
    const timer = setTimeout(() => {
      const duration = 1100
      const start = Date.now()
      const tick = () => {
        const p = Math.min((Date.now() - start) / duration, 1)
        setValue(Math.round((1 - Math.pow(1 - p, 4)) * target))
        if (p < 1) rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }, delay)
    return () => { clearTimeout(timer); cancelAnimationFrame(rafRef.current) }
  }, [target, delay])
  return value
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[], color: string }) {
  const W = 100, H = 36
  const max = Math.max(...data), min = Math.min(...data), rng = max - min || 1
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * W},${H - ((v - min) / rng) * H * 0.82 - H * 0.09}`
  )
  const id = `sg${color.replace('#', '')}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="36" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill={`url(#${id})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Trend Chart ──────────────────────────────────────────────────────────────
function TrendChart({ data }: { data: number[] }) {
  const W = 500, H = 80
  const max = Math.max(...data), min = Math.min(...data), rng = max - min || 1
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * W},${H - ((v - min) / rng) * H * 0.82 - H * 0.09}`
  )
  const labels = data.length === 14
    ? ['14天前', '', '', '', '', '', '7天前', '', '', '', '', '', '昨天', '今天']
    : ['7天前', '', '', '', '', '昨天', '今天']
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="80" preserveAspectRatio="none">
        <defs>
          <linearGradient id="trendG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06C755" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#06C755" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(y => (
          <line key={y} x1="0" y1={H * y} x2={W} y2={H * y}
            stroke="#F0EDE8" strokeWidth="0.8" strokeDasharray="3 3" />
        ))}
        <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill="url(#trendG)" />
        <polyline points={pts.join(' ')} fill="none" stroke="#06C755" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" />
        {[0, data.length - 1].map(i => {
          const [x, y] = pts[i].split(',').map(Number)
          return <circle key={i} cx={x} cy={y} r="3" fill="#06C755" />
        })}
      </svg>
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
  const color = ctr >= 50 ? '#06C755' : ctr >= 25 ? '#F59E0B' : '#D1CCC7'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13,
        color: ctr >= 50 ? '#06C755' : ctr >= 25 ? '#D97706' : '#8B8680',
        minWidth: 36, textAlign: 'right' }}>{ctr}%</span>
      <div style={{ flex: 1, height: 4, background: '#F0EDE8', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color,
          borderRadius: 2, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
      </div>
    </div>
  )
}

// ─── Button Breakdown Bar ─────────────────────────────────────────────────────
// Shows stacked proportional segments for rich menu buttons
const BTN_COLORS = ['#06C755', '#F59E0B', '#A35D5D', '#818CF8', '#34D399']
function ButtonBreakdown({ buttons }: { buttons: RichMenuRow['buttons'] }) {
  const total = buttons.reduce((s, b) => s + b.clicks, 0) || 1
  return (
    <div>
      {/* Stacked bar */}
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1, marginBottom: 6 }}>
        {buttons.map((b, i) => (
          <div key={i} title={`${b.label}: ${b.clicks.toLocaleString()} 次`}
            style={{ width: `${(b.clicks / total) * 100}%`, background: BTN_COLORS[i % BTN_COLORS.length],
              transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)', minWidth: 2 }} />
        ))}
      </div>
      {/* Labels */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
        {buttons.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: 1,
              background: BTN_COLORS[i % BTN_COLORS.length], flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#888888', fontFamily: 'DM Mono, monospace',
              whiteSpace: 'nowrap' }}>
              {b.label} {Math.round((b.clicks / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Type Badge ───────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: AnyRow['type'] }) {
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
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [period, setPeriod]       = useState<Period>('30天')

  // KPI values
  const avgBroadcastCtr   = Math.round(BROADCASTS.reduce((s, b) => s + b.clicks / b.sent, 0) / BROADCASTS.length * 100)
  const totalKeyword       = KEYWORDS.reduce((s, k) => s + k.triggers, 0)
  const totalRichMenuClicks = RICHMENUS.reduce((s, r) => s + r.buttons.reduce((bs, b) => bs + b.clicks, 0), 0)
  const bestBroadcast      = [...BROADCASTS].sort((a, b) => (b.clicks / b.sent) - (a.clicks / a.sent))[0]
  const bestCtr            = Math.round((bestBroadcast.clicks / bestBroadcast.sent) * 100)

  const ctrAnim   = useAnimatedNumber(avgBroadcastCtr, 0)
  const kwAnim    = useAnimatedNumber(totalKeyword, 80)
  const rmAnim    = useAnimatedNumber(totalRichMenuClicks, 160)
  const bestAnim  = useAnimatedNumber(bestCtr, 240)

  const trendData = period === '7天' ? TREND_7D : TREND_14D

  const tabs: { id: Tab, label: string }[] = [
    { id: 'all',       label: '全部' },
    { id: 'broadcast', label: '廣播' },
    { id: 'keyword',   label: '關鍵字' },
    { id: 'richmenu',  label: '圖文選單' },
  ]

  // ── Broadcast table ────────────────────────────────────────────────────────
  const maxBroadcastCtr = Math.max(...BROADCASTS.map(b => Math.round((b.clicks / b.sent) * 100)))
  const BroadcastTable = () => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 160px 72px',
        gap: 12, padding: '10px 20px', borderBottom: '1px solid #F5F5F5' }}>
        {['活動名稱', '發送人次', '按鈕點擊', '互動率', '日期'].map(h => (
          <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#CCCCCC', letterSpacing: '0.06em' }}>{h}</div>
        ))}
      </div>
      {BROADCASTS.map((row, i) => {
        const ctr = Math.round((row.clicks / row.sent) * 100)
        return (
          <div key={row.id} className="analytics-row"
            style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 160px 72px',
              gap: 12, padding: '13px 20px', alignItems: 'center',
              borderBottom: i < BROADCASTS.length - 1 ? '1px solid #F9F9F9' : 'none' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: '#AAAAAA' }}>
              {row.sent.toLocaleString()}</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 500, color: '#1A1A1A' }}>
              {row.clicks.toLocaleString()}</span>
            <CtrBar ctr={ctr} max={maxBroadcastCtr} />
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#CCCCCC' }}>
              {row.date.slice(5).replace('-', '/')}</span>
          </div>
        )
      })}
    </>
  )

  // ── Keyword table ──────────────────────────────────────────────────────────
  const maxTriggers = Math.max(...KEYWORDS.map(k => k.triggers))
  const KeywordTable = () => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 100px',
        gap: 12, padding: '10px 20px', borderBottom: '1px solid #F5F5F5' }}>
        {['關鍵字名稱', '觸發次數', '最後觸發'].map(h => (
          <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#CCCCCC', letterSpacing: '0.06em' }}>{h}</div>
        ))}
      </div>
      {KEYWORDS.map((row, i) => {
        const pct = Math.min((row.triggers / maxTriggers) * 100, 100)
        return (
          <div key={row.id} className="analytics-row"
            style={{ display: 'grid', gridTemplateColumns: '1fr 200px 100px',
              gap: 12, padding: '13px 20px', alignItems: 'center',
              borderBottom: i < KEYWORDS.length - 1 ? '1px solid #F9F9F9' : 'none' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A' }}>{row.name}</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 500,
                  color: '#1A1A1A' }}>{row.triggers.toLocaleString()}</span>
                <span style={{ fontSize: 11, color: '#AAAAAA' }}>次</span>
              </div>
              <div style={{ height: 3, background: '#F0EDE8', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: '#F59E0B', borderRadius: 2,
                  transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
              </div>
            </div>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#CCCCCC' }}>
              {row.lastTriggered.slice(5).replace('-', '/')}</span>
          </div>
        )
      })}
    </>
  )

  // ── Rich menu table ────────────────────────────────────────────────────────
  const RichMenuTable = () => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 80px',
        gap: 12, padding: '10px 20px', borderBottom: '1px solid #F5F5F5' }}>
        {['選單名稱', '按鈕點擊分布', '總點擊'].map(h => (
          <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#CCCCCC', letterSpacing: '0.06em' }}>{h}</div>
        ))}
      </div>
      {RICHMENUS.map((row, i) => {
        const total = row.buttons.reduce((s, b) => s + b.clicks, 0)
        return (
          <div key={row.id} className="analytics-row"
            style={{ display: 'grid', gridTemplateColumns: '140px 1fr 80px',
              gap: 12, padding: '16px 20px', alignItems: 'start',
              borderBottom: i < RICHMENUS.length - 1 ? '1px solid #F9F9F9' : 'none' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A', marginBottom: 4 }}>{row.name}</div>
              <div style={{ fontSize: 11, color: '#CCCCCC', fontFamily: 'DM Mono, monospace' }}>
                {row.date.slice(5).replace('-', '/')}</div>
            </div>
            <ButtonBreakdown buttons={row.buttons} />
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 500,
              color: '#1A1A1A', paddingTop: 2 }}>{total.toLocaleString()}</div>
          </div>
        )
      })}
    </>
  )

  // ── All tab (unified overview) ─────────────────────────────────────────────
  const AllTable = () => {
    const allRows: Array<{ id: string, badge: React.ReactElement, name: string, metric: string, metricLabel: string, date: string }> = [
      ...BROADCASTS.map(b => ({
        id: b.id,
        badge: <TypeBadge type="廣播" />,
        name: b.name,
        metric: `${Math.round((b.clicks / b.sent) * 100)}%`,
        metricLabel: '互動率',
        date: b.date,
      })),
      ...KEYWORDS.map(k => ({
        id: k.id,
        badge: <TypeBadge type="關鍵字" />,
        name: k.name,
        metric: k.triggers.toLocaleString(),
        metricLabel: '觸發次數',
        date: k.lastTriggered,
      })),
      ...RICHMENUS.map(r => ({
        id: r.id,
        badge: <TypeBadge type="圖文選單" />,
        name: r.name,
        metric: r.buttons.reduce((s, b) => s + b.clicks, 0).toLocaleString(),
        metricLabel: '總點擊',
        date: r.date,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date))

    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 72px',
          gap: 12, padding: '10px 20px', borderBottom: '1px solid #F5F5F5' }}>
          {['名稱', '指標', '', '日期'].map((h, i) => (
            <div key={i} style={{ fontSize: 11, fontWeight: 600, color: '#CCCCCC', letterSpacing: '0.06em' }}>{h}</div>
          ))}
        </div>
        {allRows.map((row, i) => (
          <div key={row.id} className="analytics-row"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 72px',
              gap: 12, padding: '13px 20px', alignItems: 'center',
              borderBottom: i < allRows.length - 1 ? '1px solid #F9F9F9' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {row.badge}
              <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
            </div>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 500,
              color: '#1A1A1A' }}>{row.metric}</span>
            <span style={{ fontSize: 11, color: '#AAAAAA' }}>{row.metricLabel}</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#CCCCCC' }}>
              {row.date.slice(5).replace('-', '/')}</span>
          </div>
        ))}
      </>
    )
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Instrument+Serif:ital@0;1&display=swap');
        .analytics-row { transition: background 0.12s; }
        .analytics-row:hover { background: #FAFAF8; }
        .period-btn, .tab-pill { transition: all 0.12s; }
      ` }} />

      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* ── Page Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.02em', margin: 0 }}>
              點擊成效分析</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#999999' }}>
              追蹤廣播互動率 · 關鍵字觸發量 · 圖文選單按鈕點擊
            </p>
          </div>
          <div style={{ display: 'flex', gap: 4, background: '#F0EDE8', padding: 3, borderRadius: 8 }}>
            {(['7天', '30天', '90天'] as Period[]).map(p => (
              <button key={p} className="period-btn" onClick={() => setPeriod(p)} style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: period === p ? '#FFFFFF' : 'transparent',
                color: period === p ? '#1A1A1A' : '#999999',
                boxShadow: period === p ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>{p}</button>
            ))}
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>

          {/* 廣播平均互動率 */}
          <div style={{ background: '#FFFFFF', border: '1px solid #EFEFEF', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#BBBBBB', letterSpacing: '0.08em', marginBottom: 10 }}>
              廣播平均互動率</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ fontSize: 26, fontWeight: 400, color: '#06C755', lineHeight: 1,
                fontFamily: 'Instrument Serif, serif' }}>{ctrAnim}</span>
              <span style={{ fontSize: 14, color: '#BBBBBB', fontFamily: 'DM Mono, monospace' }}>%</span>
            </div>
            <div style={{ marginTop: 12, height: 3, background: '#F0EDE8', borderRadius: 2 }}>
              <div style={{ height: '100%', borderRadius: 2, background: '#06C755',
                width: `${avgBroadcastCtr * 2}%`, transition: 'width 1s ease' }} />
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#CCCCCC' }}>（按鈕點擊 / 發送人次）</div>
          </div>

          {/* 關鍵字觸發次數 */}
          <div style={{ background: '#FFFFFF', border: '1px solid #EFEFEF', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#BBBBBB', letterSpacing: '0.08em', marginBottom: 10 }}>
              關鍵字觸發次數</div>
            <div style={{ fontSize: 26, fontWeight: 400, color: '#1A1A1A', lineHeight: 1,
              fontFamily: 'Instrument Serif, serif' }}>{kwAnim.toLocaleString()}</div>
            <div style={{ marginTop: 10 }}>
              <Sparkline data={trendData} color="#F59E0B" />
            </div>
          </div>

          {/* 圖文選單總點擊 */}
          <div style={{ background: '#FFFFFF', border: '1px solid #EFEFEF', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#BBBBBB', letterSpacing: '0.08em', marginBottom: 10 }}>
              圖文選單總點擊</div>
            <div style={{ fontSize: 26, fontWeight: 400, color: '#1A1A1A', lineHeight: 1,
              fontFamily: 'Instrument Serif, serif' }}>{rmAnim.toLocaleString()}</div>
            <div style={{ marginTop: 10 }}>
              <Sparkline data={trendData} color="#818CF8" />
            </div>
          </div>

          {/* 最佳廣播互動率 */}
          <div style={{ background: '#FFFFFF', border: '1px solid #EFEFEF', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#BBBBBB', letterSpacing: '0.08em', marginBottom: 10 }}>
              最佳廣播互動率</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ fontSize: 26, fontWeight: 400, color: '#D97706', lineHeight: 1,
                fontFamily: 'Instrument Serif, serif' }}>{bestAnim}</span>
              <span style={{ fontSize: 14, color: '#BBBBBB', fontFamily: 'DM Mono, monospace' }}>%</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: '#999999',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {bestBroadcast.name}
            </div>
          </div>
        </div>

        {/* ── Trend Chart ── */}
        <div style={{ background: '#FFFFFF', border: '1px solid #EFEFEF', borderRadius: 10,
          padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>互動趨勢</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#06C755' }} />
              <span style={{ fontSize: 12, color: '#999999' }}>每日互動次數（各類型合計）</span>
            </div>
          </div>
          <TrendChart data={trendData} />
        </div>

        {/* ── Table Card ── */}
        <div style={{ background: '#FFFFFF', border: '1px solid #EFEFEF', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2,
            padding: '12px 16px', borderBottom: '1px solid #F5F5F5' }}>
            {tabs.map(tab => (
              <button key={tab.id} className="tab-pill" onClick={() => setActiveTab(tab.id)}
                style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: activeTab === tab.id ? '#1A1A1A' : 'transparent',
                  color: activeTab === tab.id ? '#FFFFFF' : '#999999' }}>{tab.label}</button>
            ))}
          </div>
          {activeTab === 'all'       && <AllTable />}
          {activeTab === 'broadcast' && <BroadcastTable />}
          {activeTab === 'keyword'   && <KeywordTable />}
          {activeTab === 'richmenu'  && <RichMenuTable />}
        </div>

        <p style={{ marginTop: 16, fontSize: 11, color: '#CCCCCC', textAlign: 'center' }}>
          * 目前顯示示範資料，實際資料需整合 Postback 事件追蹤至 Supabase
        </p>
      </div>
    </>
  )
}
