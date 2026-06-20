import type { Category, ParsedRow, Transaction } from '../types'

/**
 * Path C categorization logic (per PRD):
 * 1. Row's category text matches an existing category name → use it
 * 2. Most recent existing transaction with same vendor has a category → use it
 * 3. Leave uncategorized (null)
 */
export function categorizeRows(
  rows: ParsedRow[],
  categories: Category[],
  existingTransactions: Transaction[],
): ParsedRow[] {
  // Build a lowercase name → category map for fast lookup
  const categoryByName = new Map<string, Category>()
  for (const cat of categories) {
    categoryByName.set(cat.name.toLowerCase(), cat)
  }

  // Build vendor → most recent categorized transaction map
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
    // 1. Category text from file matches an existing category
    if (row.rawCategory) {
      const match = categoryByName.get(row.rawCategory.toLowerCase())
      if (match) {
        return { ...row, category_id: match.id, categoryName: match.name }
      }
    }

    // 2. Vendor memory
    const vendorMatch = vendorCategory.get(row.vendor.toLowerCase())
    if (vendorMatch) {
      return { ...row, category_id: vendorMatch.category_id, categoryName: vendorMatch.categoryName }
    }

    // 3. Uncategorized
    return { ...row, category_id: null, categoryName: null }
  })
}
