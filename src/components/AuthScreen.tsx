import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthScreen() {
  const [mode, setMode]       = useState<'signin' | 'signup'>('signin')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else {
        setSuccess('Account created! You can now sign in.')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    }

    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '380px',
        padding: '0 24px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px' }}>
            <span style={{ color: 'var(--color-primary)' }}>Mi</span>
            <span style={{ color: 'var(--color-text)' }}>nance</span>
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: '14px', color: 'var(--color-text-muted)' }}>
            Personal finance, your way
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '16px',
          padding: '32px',
        }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: '2px', background: 'var(--color-bg)', borderRadius: '8px', padding: '2px', border: '1px solid var(--color-border)', marginBottom: '24px' }}>
            {(['signin', 'signup'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setSuccess(null) }}
                style={{
                  flex: 1,
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  fontWeight: mode === m ? 600 : 400,
                  padding: '5px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: 'none',
                  background: mode === m ? 'var(--color-surface)' : 'transparent',
                  color: mode === m ? 'var(--color-text)' : 'var(--color-text-muted)',
                  boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-text)', marginBottom: '6px' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@example.com"
                style={{
                  width: '100%',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-text)', marginBottom: '6px' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Min. 6 characters"
                style={{
                  width: '100%',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            {error && (
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-expense)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '9px 12px' }}>
                {error}
              </p>
            )}

            {success && (
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-income)', background: 'rgba(34,195,166,0.08)', border: '1px solid rgba(34,195,166,0.2)', borderRadius: '8px', padding: '9px 12px' }}>
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                fontFamily: 'inherit',
                fontSize: '14px',
                fontWeight: 600,
                padding: '10px',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                border: 'none',
                background: 'var(--color-primary-text)',
                color: '#fff',
                opacity: loading ? 0.7 : 1,
                marginTop: '4px',
              }}
            >
              {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
