// Shared layout for the public Terms of Service and Privacy Policy pages that the
// Queue apps link to from sign-up. Plain, readable, no auth required.
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', background: '#F8FAFC', color: '#0B1B1E', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <header style={{ background: 'linear-gradient(180deg, #0F766E, #134E4A)', color: '#FFFFFF', padding: '32px 20px 28px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ fontWeight: 800, fontSize: 20 }}>Queue</div>
          <div style={{ color: '#CCFBF1', fontSize: 13 }}>Better Access. Healthier Tomorrow.</div>
          <h1 style={{ margin: '18px 0 4px', fontSize: 28, fontWeight: 800 }}>{title}</h1>
          <div style={{ color: '#CCFBF1', fontSize: 13 }}>Last updated {updated}</div>
        </div>
      </header>
      <article style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px 64px', fontSize: 15, lineHeight: 1.65, color: '#33464A' }}>
        {children}
      </article>
    </main>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0B1B1E', margin: '0 0 8px' }}>{title}</h2>
      {children}
    </section>
  )
}
