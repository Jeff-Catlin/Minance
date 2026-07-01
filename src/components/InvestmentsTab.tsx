export default function InvestmentsTab() {
  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 24px' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 8px 0' }}>
        Investments
      </h2>
      <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', margin: '0 0 32px 0' }}>
        View balances and daily performance across your brokerage accounts, IRAs, HSAs, and more — all in one place.
      </p>

      <div style={{
        border: '2px dashed var(--color-border)',
        borderRadius: '16px',
        padding: '64px 32px',
        textAlign: 'center',
        background: 'var(--color-surface)',
      }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>📈</div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '8px' }}>
          Coming soon
        </div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', maxWidth: '400px', margin: '0 auto', lineHeight: 1.6 }}>
          Link your brokerage, IRA, HSA, and other investment accounts to track balances and daily net change without leaving Minance.
        </div>
      </div>
    </div>
  )
}
