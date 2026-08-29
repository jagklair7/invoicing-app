// src/components/SuspendedBanner.jsx
import { useOrg } from '../context/OrgContext'

const css = `
  .suspended-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #fff5f5;
    border: 1.5px solid #fecaca;
    border-radius: 10px;
    padding: 14px 18px;
    margin-bottom: 20px;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    color: #b91c1c;
  }
  .suspended-banner-icon { font-size: 16px; flex-shrink: 0; }
  .suspended-banner-text { line-height: 1.5; }
  .suspended-banner-text strong { font-weight: 700; }
`

export default function SuspendedBanner() {
  const { isSuspended, activeOrg } = useOrg()
  if (!isSuspended) return null

  return (
    <>
      <style>{css}</style>
      <div className="suspended-banner">
        <span className="suspended-banner-icon">⚠</span>
        <span className="suspended-banner-text">
          <strong>{activeOrg?.name || 'This organization'} is currently suspended.</strong>{' '}
          You can view existing data, but creating or editing anything is disabled until your account is reactivated. Contact support if you believe this is a mistake.
        </span>
      </div>
    </>
  )
}