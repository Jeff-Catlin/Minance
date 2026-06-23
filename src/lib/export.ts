import type { Category, Transaction, TransactionSplit } from '../types'

// ── CSV ───────────────────────────────────────────────────────────────────────

function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function escapeCSV(val: string) {
  return `"${val.replace(/"/g, '""')}"`
}

export function exportCategoriesCSV(categories: Category[]) {
  const parents = categories.filter(c => c.parent_id === null).sort((a, b) => a.name.localeCompare(b.name))
  const rows: string[][] = [['Parent Category', 'Subcategory', 'Monthly Budget']]

  for (const parent of parents) {
    const children = categories.filter(c => c.parent_id === parent.id).sort((a, b) => a.name.localeCompare(b.name))
    if (children.length === 0) {
      rows.push([parent.name, '', parent.monthly_budget != null ? String(parent.monthly_budget) : ''])
    } else {
      for (const child of children) {
        rows.push([parent.name, child.name, child.monthly_budget != null ? String(child.monthly_budget) : ''])
      }
    }
  }

  downloadCSV('minance-categories.csv', rows.map(r => r.map(escapeCSV).join(',')).join('\n'))
}

export function exportTransactionsCSV(
  transactions: Transaction[],
  splits: TransactionSplit[],
  categories: Category[],
) {
  const catMap = new Map(categories.map(c => [c.id, c.name]))
  const splitsByTxn = new Map<string, TransactionSplit[]>()
  for (const sp of splits) {
    if (!splitsByTxn.has(sp.transaction_id)) splitsByTxn.set(sp.transaction_id, [])
    splitsByTxn.get(sp.transaction_id)!.push(sp)
  }

  const rows: string[][] = [['Date', 'Vendor', 'Description', 'Amount', 'Type', 'Category', 'Split']]

  for (const t of transactions) {
    if (t.is_split) {
      for (const sp of splitsByTxn.get(t.id) ?? []) {
        rows.push([
          t.date, t.vendor, t.description ?? '',
          String(sp.amount), t.type,
          catMap.get(sp.category_id) ?? '', 'Yes',
        ])
      }
    } else {
      rows.push([
        t.date, t.vendor, t.description ?? '',
        String(t.amount), t.type,
        t.category_id ? (catMap.get(t.category_id) ?? '') : '', 'No',
      ])
    }
  }

  downloadCSV('minance-transactions.csv', rows.map(r => r.map(escapeCSV).join(',')).join('\n'))
}

// ── PDF (browser print) ───────────────────────────────────────────────────────

const PRINT_BASE = `
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; padding: 32px; }
    .wordmark { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .wordmark span { color: #22C3A6; }
    .meta { font-size: 12px; color: #888; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; padding: 7px 10px; border-bottom: 2px solid #ddd; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; }
    td { padding: 6px 10px; border-bottom: 1px solid #eee; }
    .expense { color: #E06B6B; }
    .income { color: #3BA776; }
    .parent { font-weight: 600; }
    .child { padding-left: 24px; color: #555; }
    @media print { body { padding: 16px; } }
  </style>
`

function openPrint(title: string, body: string) {
  const w = window.open('', '_blank')
  if (!w) { alert('Allow pop-ups to export as PDF.'); return }
  w.document.write(`<html><head><title>${title}</title>${PRINT_BASE}</head><body>${body}</body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}

export function printCategoriesPDF(categories: Category[]) {
  const parents = categories.filter(c => c.parent_id === null).sort((a, b) => a.name.localeCompare(b.name))
  let rows = ''
  for (const p of parents) {
    const children = categories.filter(c => c.parent_id === p.id).sort((a, b) => a.name.localeCompare(b.name))
    if (children.length === 0) {
      rows += `<tr><td class="parent">${p.name}</td><td>—</td><td>${p.monthly_budget != null ? `$${p.monthly_budget.toLocaleString()}` : '—'}</td></tr>`
    } else {
      for (const child of children) {
        rows += `<tr><td class="parent">${p.name}</td><td class="child">${child.name}</td><td>${child.monthly_budget != null ? `$${child.monthly_budget.toLocaleString()}` : '—'}</td></tr>`
      }
    }
  }

  openPrint('Minance — Categories', `
    <div class="wordmark"><span>Mi</span>nance — Categories</div>
    <div class="meta">Exported ${new Date().toLocaleDateString()}</div>
    <table>
      <thead><tr><th>Parent</th><th>Subcategory</th><th>Monthly Budget</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `)
}

export function printTransactionsPDF(
  transactions: Transaction[],
  splits: TransactionSplit[],
  categories: Category[],
  currencySymbol: string,
) {
  const catMap = new Map(categories.map(c => [c.id, c.name]))
  const splitsByTxn = new Map<string, TransactionSplit[]>()
  for (const sp of splits) {
    if (!splitsByTxn.has(sp.transaction_id)) splitsByTxn.set(sp.transaction_id, [])
    splitsByTxn.get(sp.transaction_id)!.push(sp)
  }

  const fmt = (n: number) => `${currencySymbol}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  let rows = ''
  for (const t of transactions) {
    if (t.is_split) {
      for (const sp of splitsByTxn.get(t.id) ?? []) {
        rows += `<tr>
          <td>${t.date}</td><td>${t.vendor}</td>
          <td style="color:#666">${t.description ?? '—'}</td>
          <td class="${t.type}">${t.type === 'income' ? '+' : '−'}${fmt(sp.amount)}</td>
          <td>${catMap.get(sp.category_id) ?? '—'}</td>
        </tr>`
      }
    } else {
      rows += `<tr>
        <td>${t.date}</td><td>${t.vendor}</td>
        <td style="color:#666">${t.description ?? '—'}</td>
        <td class="${t.type}">${t.type === 'income' ? '+' : '−'}${fmt(t.amount)}</td>
        <td>${t.category_id ? (catMap.get(t.category_id) ?? '—') : 'Uncategorized'}</td>
      </tr>`
    }
  }

  openPrint('Minance — Transactions', `
    <div class="wordmark"><span>Mi</span>nance — Transactions</div>
    <div class="meta">Exported ${new Date().toLocaleDateString()} · ${transactions.length} transactions</div>
    <table>
      <thead><tr><th>Date</th><th>Vendor</th><th>Description</th><th>Amount</th><th>Category</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `)
}
