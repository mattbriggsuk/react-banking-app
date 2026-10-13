import type { Account, AccountType, Customer, MoneyAction } from './types'

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
let sessionToken: string | null = null

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

interface LoginResponse { customer: Customer; sessionToken: string }
interface RegistrationResponse extends LoginResponse { pin: string }

async function request<T>(path: string, body?: object): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}/api${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new Error('Could not reach the banking API. Check that it is running. If you submitted a change, refresh your accounts before trying again.')
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const problem = data as { detail?: string; message?: string; title?: string } | null
    throw new ApiError(problem?.detail || problem?.message || problem?.title || `The banking API returned an error (${response.status}). Check that it is running and try again.`, response.status)
  }
  if (response.status === 204) return undefined as T
  if (!data) throw new Error('The banking API returned an empty response. Refresh your accounts before trying again.')
  return data as T
}

export const api = {
  register: async (customer: Pick<Customer, 'firstName' | 'lastName' | 'email'>) => {
    const result = await request<RegistrationResponse>('/customer/register', { customer })
    sessionToken = result.sessionToken
    return result
  },
  login: async (identifier: string, pin: string) => {
    const result = await request<LoginResponse>('/access/login', { identifier, pin })
    sessionToken = result.sessionToken
    return result
  },
  clearSession: () => { sessionToken = null },
  hasSession: () => !!sessionToken,
  logout: async () => {
    try { await request<void>('/access/logout', {}) }
    finally { sessionToken = null }
  },
  accounts: (customerNumber: string) =>
    request<{ accounts: Account[] }>(`/customer/accounts?customerNumber=${encodeURIComponent(customerNumber)}`),
  create: (accountType: AccountType) =>
    request<{ account: Account }>('/account/create', { accountType: accountType.toUpperCase() }),
  close: (accountNumber: string) => request<{ account: Account }>('/account/close', { accountNumber }),
  move: (action: MoneyAction, accountNumber: string, amount: string, targetAccountNumber?: string) => {
    const transactionType = { deposit: 'DEPOSIT', withdraw: 'WITHDRAWAL', transfer: 'TRANSFER' }[action]
    return request<{ account?: Account; fromAccount?: Account; toAccount?: Account }>(`/account/${action}`, {
      transaction: {
        transactionType,
        amount,
        targetAccountNumber: action === 'transfer' ? targetAccountNumber : accountNumber,
        ...(action === 'transfer' ? { sourceAccountNumber: accountNumber } : {}),
      },
    })
  },
}
