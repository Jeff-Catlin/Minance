export interface Category {
  id: string
  name: string
  parent_id: string | null
  is_archived: boolean
  monthly_budget: number | null
  created_at: string
}

export interface ParsedRow {
  date: string            // YYYY-MM-DD
  amount: number
  type: 'expense' | 'income' | 'card_payment'
  description: string | null
  vendor: string
  account: string | null       // originating account text from file
  account_id: string | null    // resolved account FK (if matched to accounts table)
  accountName: string | null   // display name for preview
  rawCategory: string | null   // text from the file
  category_id: string | null   // resolved by categorizer
  categoryName: string | null  // display name for preview
  categorySource: 'name' | 'vendor' | null  // how category was assigned
}

export interface Account {
  id: string
  name: string
  institution: string | null
  type: string
  last_four: string | null
  color: string | null
  balance: number | null
  notes: string | null
  is_active: boolean
  created_at: string
}

export interface Transaction {
  id: string
  date: string
  amount: number
  type: 'expense' | 'income' | 'card_payment'
  description: string | null
  vendor: string
  account: string | null
  account_id: string | null
  category_id: string | null
  is_split: boolean
  source: string
  created_at: string
}

export interface TransactionSplit {
  id: string
  transaction_id: string
  amount: number
  category_id: string
  note: string | null
  created_at: string
}
