import type { Category, ParsedRow, Transaction } from '../types'

export function categorizeRows(
  rows: ParsedRow[],
  categories: Category[],
  existingTransactions: Transaction[],
): ParsedRow[] {
  const categoryByName = new Map<string, Category>()
  for (const cat of categories) {
    categoryByName.set(cat.name.toLowerCase(), cat)
  }

  const vendorCategory = new Map<string, { category_id: string; categoryName: string }>()
  const sorted = [...existingTransactions]
    .filter(t => t.category_id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  for (const t of sorted) {
    const key = t.vendor.toLowerCase()
    if (!vendorCategory.has(key)) {
      const cat = categories.find(c => c.id === t.category_id)
      if (cat) vendorCategory.set(key, { category_id: t.category_id!, categoryName: cat.name })
    }
  }

  return rows.map(row => {
    if (row.type === 'card_payment') {
      return { ...row, category_id: null, categoryName: null, categorySource: null }
    }

    // 1. Category text from file matches an existing category name → blue
    if (row.rawCategory) {
      const match = categoryByName.get(row.rawCategory.toLowerCase())
      if (match) {
        return { ...row, category_id: match.id, categoryName: match.name, categorySource: 'name' as const }
      }
    }

    // 2. Vendor memory → yellow
    const vendorMatch = vendorCategory.get(row.vendor.toLowerCase())
    if (vendorMatch) {
      return { ...row, category_id: vendorMatch.category_id, categoryName: vendorMatch.categoryName, categorySource: 'vendor' as const }
    }

    // 3. Uncategorized → grey
    return { ...row, category_id: null, categoryName: null, categorySource: null }
  })
}
