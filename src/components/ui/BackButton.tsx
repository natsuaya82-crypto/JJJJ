import { useNavigate } from 'react-router-dom'
import { C } from '../../styles/tokens'
import { audio } from '../../utils/audio'

const buttonStyle = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: C.textSub, padding: '8px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minHeight: '44px', minWidth: '44px',
} as const

const icon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

function NavigateBack() {
  const navigate = useNavigate()
  return <button data-se="back" onClick={() => { audio.markBack(); audio.playSe('back'); navigate(-1) }} style={buttonStyle}>{icon}</button>
}

export default function BackButton({ onClick }: { onClick?: () => void }) {
  if (onClick) return <button data-se="back" onClick={() => { audio.playSe('back'); onClick() }} style={buttonStyle}>{icon}</button>
  return <NavigateBack />
}
