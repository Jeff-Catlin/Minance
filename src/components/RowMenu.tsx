import { useState, useEffect, useRef } from 'react'

interface RowMenuItem {
  label: string
  danger?: boolean
  onClick: () => void
}

export default function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        btnRef.current && !btnRef.current.contains(target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setOpen(o => !o)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        onClick={handleToggle}
        aria-label="Row actions"
        style={{
          fontFamily: 'inherit', fontSize: '16px', padding: '2px 6px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-muted)', lineHeight: 1, borderRadius: '4px',
        }}
      >
        ⋮
      </button>
      {open && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: pos.top,
            right: pos.right,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 9999,
            minWidth: '160px',
            overflow: 'hidden',
          }}
        >
          {items.map(item => (
            <button
              key={item.label}
              onClick={() => { setOpen(false); item.onClick() }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 14px', fontSize: '13px', fontFamily: 'inherit',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: item.danger ? 'var(--color-expense)' : 'var(--color-text)',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
