import { useState } from 'react'
import ScoutPage from '../scout/ScoutPage'
import TransferPage from '../transfer/TransferPage'
import { C } from '../../styles/tokens'

type Tab = 'scout' | 'transfer'

export default function AcquisitionPage() {
  const [tab, setTab] = useState<Tab>('scout')

  return (
    <div>
      {/* Tab switcher */}
      <div style={{
        display: 'flex', gap: '2px', margin: '12px 16px 0',
        backgroundColor: C.bg, borderRadius: '12px', padding: '3px',
        border: `1px solid ${C.border}`,
      }}>
        {([
          { key: 'scout', label: 'スカウト' },
          { key: 'transfer', label: '移籍・FA' },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
              borderRadius: '9px', fontFamily: 'inherit',
              fontSize: '13px', fontWeight: tab === key ? '700' : '400',
              background: tab === key
                ? `linear-gradient(135deg, ${C.surface2} 0%, ${C.surface3} 100%)`
                : 'none',
              color: tab === key ? C.gold : C.textDim,
              boxShadow: tab === key ? '0 1px 4px rgba(0,0,0,0.4)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'scout' ? <ScoutPage /> : <TransferPage />}
    </div>
  )
}
