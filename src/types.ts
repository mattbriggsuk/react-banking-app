export interface Customer {
  customerNumber: string
  firstName: string
  lastName: string
  email: string
}

export interface Account {
  accountNumber: string
  customerNumber: string
  balance: number | string
  closed: boolean
  accountType?: 'CURRENT' | 'SAVINGS' | 'CREDIT'
}

export type AccountType = 'Current' | 'Savings' | 'Credit'
export type MoneyAction = 'deposit' | 'withdraw' | 'transfer'
