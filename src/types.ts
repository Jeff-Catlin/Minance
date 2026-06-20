export interface Category {
  id: string
  name: string
  parent_id: string | null
  is_archived: boolean
  created_at: string
}

export interface ParsedRow {
  date: string            // YYYY-MM-DD
  amount: number
  type: 'expense' | 'income'
  description: string | null
  vendor: string
  rawCategory: string | null   // text from the file
  category_id: string | null   // resolved by categorizer
  categoryName: string | null  // display name for preview
}

export interface Transaction {
  id: string
  date: string
  amount: number
  type: 'expense' | 'income'
  description: string | null
  vendor: string
  category_id: string | null
  created_at: string
}
