export default function ResourcesTab() {
  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 24px' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 8px 0' }}>
        Resources
      </h2>
      <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', margin: '0 0 32px 0' }}>
        Financial tools, podcasts, advisors, and news curated to help you make smarter money decisions.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {[
          { icon: '🎙️', label: 'Podcasts',          desc: 'Top personal finance shows' },
          { icon: '📰', label: 'News & Articles',    desc: 'Recent financial news' },
          { icon: '🧑‍💼', label: 'Financial Advisors', desc: 'Connect with professionals' },
          { icon: '🛠️', label: 'Tools & Calculators', desc: 'Retirement, tax, and more' },
        ].map(card => (
          <div key={card.label} style={{
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            padding: '24px 20px',
            background: 'var(--color-surface)',
            opacity: 0.6,
          }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>{card.icon}</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '4px' }}>{card.label}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{card.desc}</div>
          </div>
        ))}
      </div>

      <div style={{
        border: '2px dashed var(--color-border)',
        borderRadius: '16px',
        padding: '48px 32px',
        textAlign: 'center',
        background: 'var(--color-surface)',
      }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔜</div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '8px' }}>
          Coming soon
        </div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', maxWidth: '420px', margin: '0 auto', lineHeight: 1.6 }}>
          Curated podcasts, advisors, articles, and tools will be featured here. Want to be listed? Reach out to us.
        </div>
      </div>
    </div>
  )
}
