import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { api } from './api'
import type { Account } from './types'

const customer = { customerNumber: '1234567890123452', firstName: 'Alex', lastName: 'Morgan', email: 'alex@example.com' }
const pin = '012345'
beforeEach(() => api.clearSession())
const source: Account = { accountNumber: '9876543210987658', customerNumber: customer.customerNumber, balance: 100, closed: false, accountType: 'CURRENT' }
const destination: Account = { accountNumber: '1111111111111117', customerNumber: customer.customerNumber, balance: 0, closed: false, accountType: 'SAVINGS' }

function mockApi(initialAccounts: Account[] = []) {
  let accounts = initialAccounts.map(account => ({ ...account }))
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    let data: object
    if (url.includes('/customer/accounts')) data = { accounts }
    else if (url.endsWith('/customer/register')) data = { customer, pin, sessionToken: 'test-session' }
    else if (url.endsWith('/access/login')) data = { customer, sessionToken: 'test-session' }
    else if (url.endsWith('/access/logout')) return new Response(null, { status: 204 })
    else if (url.endsWith('/account/create')) {
      const account = { ...destination, accountType: body.accountType }
      accounts.push(account); data = { account }
    } else if (url.endsWith('/account/transfer')) {
      accounts = accounts.map(account => ({ ...account, balance: account.accountNumber === source.accountNumber ? 75 : 25 }))
      data = { fromAccount: accounts[0], toAccount: accounts[1] }
    } else if (url.endsWith('/account/deposit') || url.endsWith('/account/withdraw')) {
      const account = { ...accounts[0], balance: Number(accounts[0].balance) + (url.endsWith('/deposit') ? 1 : -1) * Number(body.transaction.amount) }
      accounts[0] = account; data = { account }
    } else if (url.endsWith('/account/close')) {
      accounts[0] = { ...accounts[0], closed: true }; data = { account: accounts[0] }
    } else throw new Error(`Unexpected request ${url}`)
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Customer number'), customer.customerNumber)
  await user.type(screen.getByLabelText('PIN'), pin)
  await user.click(screen.getByRole('button', { name: /Continue to accounts/ }))
  await screen.findByRole('heading', { name: /Hello, Alex/ })
  await waitFor(() => expect(screen.getByRole('button', { name: /Open Account/ })).toBeEnabled())
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
}

describe('customer and banking workflows', () => {
  it('rejects a mistyped customer number before calling the API', async () => {
    const fetchMock = mockApi(); const user = userEvent.setup(); render(<App />)
    await user.type(screen.getByLabelText('Customer number'), '1234567890123453')
    await user.type(screen.getByLabelText('PIN'), pin)
    await user.click(screen.getByRole('button', { name: /Continue to accounts/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('valid 16-digit')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('registers a customer and keeps the generated number visible', async () => {
    const fetchMock = mockApi(); const user = userEvent.setup(); render(<App />)
    await user.click(screen.getByRole('button', { name: 'New customer' }))
    await user.type(screen.getByLabelText('First name'), 'Alex')
    await user.type(screen.getByLabelText('Last name'), 'Morgan')
    await user.type(screen.getByLabelText('Email address'), 'alex@example.com')
    await user.click(screen.getByRole('button', { name: /Create customer/ }))
    await screen.findByRole('heading', { name: /Hello, Alex/ })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ customer: { firstName: 'Alex', lastName: 'Morgan', email: 'alex@example.com' } })
    expect(screen.getByText('Customer 1234 5678 9012 3452')).toBeInTheDocument()
    const dialog = await screen.findByRole('dialog', { name: 'Registration complete' })
    expect(dialog).toHaveTextContent('Customer created. Keep your customer number and PIN for your next visit.')
    expect(within(dialog).getByText('1234 5678 9012 3452')).toBeInTheDocument()
    expect(within(dialog).getByText(pin)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Customer created. Keep your customer number and PIN for your next visit.')).not.toBeInTheDocument()
    expect(screen.queryByText(pin)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reveal PIN' }))
    expect(screen.getByText(pin)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hide PIN' }))
    expect(screen.queryByText(pin)).not.toBeInTheDocument()
  })

  it('opens an account using the selected API type and displays the returned type', async () => {
    const fetchMock = mockApi(); const user = userEvent.setup(); render(<App />); await signIn(user)
    await user.click(screen.getByRole('button', { name: /Open Account/ }))
    await user.click(screen.getByRole('radio', { name: /Savings/ }))
    await user.click(screen.getByRole('button', { name: /Open savings account/ }))
    await screen.findByRole('heading', { name: 'Savings account' })
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/account/create'))!
    expect(JSON.parse(String(call[1]?.body))).toEqual({ accountType: 'SAVINGS' })
    expect(screen.getByRole('status')).toHaveTextContent('opened')
  })

  it.each(['Deposit', 'Withdraw'] as const)('sends %s with the correct transaction enum and exact decimal amount', async action => {
    const fetchMock = mockApi([source]); const user = userEvent.setup(); render(<App />); await signIn(user)
    await user.click(screen.getByRole('button', { name: /Current account/ }))
    await user.click(screen.getByRole('button', { name: action }))
    await user.type(screen.getByLabelText('Amount (£)'), '5.25')
    await user.click(screen.getByRole('button', { name: `Confirm ${action.toLowerCase()}` }))
    await screen.findByRole('status')
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith(`/account/${action.toLowerCase()}`))!
    expect(JSON.parse(String(call[1]?.body))).toEqual({ transaction: { transactionType: action === 'Deposit' ? 'DEPOSIT' : 'WITHDRAWAL', amount: '5.25', targetAccountNumber: source.accountNumber } })
    expect(screen.getByText(action === 'Deposit' ? '£105.25' : '£94.75')).toBeInTheDocument()
  })

  it('transfers to another account and refreshes both balances', async () => {
    const fetchMock = mockApi([source, destination]); const user = userEvent.setup(); render(<App />); await signIn(user)
    await user.click(screen.getByRole('button', { name: /Current account/ }))
    await user.click(screen.getByRole('button', { name: 'Transfer' }))
    const dropdown = screen.getByRole('combobox', { name: 'Transfer to' })
    expect(dropdown.querySelector(`option[value="${source.accountNumber}"]`)).toBeNull()
    await user.selectOptions(dropdown, destination.accountNumber)
    await user.type(screen.getByLabelText('Amount (£)'), '25.00')
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }))
    await screen.findByRole('status')
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/account/transfer'))!
    expect(JSON.parse(String(call[1]?.body))).toEqual({ transaction: { transactionType: 'TRANSFER', amount: '25.00', sourceAccountNumber: source.accountNumber, targetAccountNumber: destination.accountNumber } })
    await waitFor(() => expect(screen.getByRole('button', { name: /All accounts/ })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: /All accounts/ }))
    expect(screen.getByText('£75.00')).toBeInTheDocument(); expect(screen.getByText('£25.00')).toBeInTheDocument()
  })

  it('prevents withdrawing more than the account balance', async () => {
    const fetchMock = mockApi([source]); const user = userEvent.setup(); render(<App />); await signIn(user)
    await user.click(screen.getByRole('button', { name: /Current account/ }))
    await user.click(screen.getByRole('button', { name: 'Withdraw' }))
    await user.type(screen.getByLabelText('Amount (£)'), '101')
    await user.click(screen.getByRole('button', { name: 'Confirm withdraw' }))
    expect(screen.getByRole('alert')).toHaveTextContent('greater than the available balance')
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/withdraw'))).toBe(false)
  })

  it('requires a zero balance and explicit confirmation to close an account', async () => {
    const fetchMock = mockApi([{ ...source, balance: 0 }]); const user = userEvent.setup(); render(<App />); await signIn(user)
    await user.click(screen.getByRole('button', { name: /Current account/ }))
    await user.click(screen.getByRole('button', { name: 'Close Account' }))
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/close'))).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Confirm close account' }))
    await screen.findByRole('heading', { name: 'This account is closed.' })
    expect(screen.queryByRole('button', { name: 'Deposit' })).not.toBeInTheDocument()
  })

  it('blocks closing a nonzero account', async () => {
    mockApi([source]); const user = userEvent.setup(); render(<App />); await signIn(user)
    await user.click(screen.getByRole('button', { name: /Current account/ }))
    await user.click(screen.getByRole('button', { name: 'Close Account' }))
    expect(screen.getByRole('button', { name: 'Confirm close account' })).toBeDisabled()
  })

  it('shows API problem details while retaining the customer form', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Customer not found' }), { status: 404 })))
    const user = userEvent.setup(); render(<App />)
    await user.type(screen.getByLabelText('Customer number'), customer.customerNumber)
    await user.type(screen.getByLabelText('PIN'), pin)
    await user.click(screen.getByRole('button', { name: /Continue to accounts/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Customer not found')
    expect(screen.getByRole('button', { name: /Continue to accounts/ })).toBeEnabled()
  })

  it('logs in with customer number and PIN, and authenticates account requests', async () => {
    const fetchMock = mockApi(); const user = userEvent.setup(); render(<App />); await signIn(user)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ identifier: customer.customerNumber, pin })
    const accountCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/customer/accounts'))!
    expect(accountCall[1]?.headers).toMatchObject({ Authorization: 'Bearer test-session' })
    await user.click(screen.getByRole('button', { name: 'Reveal PIN' }))
    expect(screen.getByText(pin)).toBeInTheDocument()
  })

  it('logs in with email and PIN', async () => {
    const fetchMock = mockApi(); const user = userEvent.setup(); render(<App />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Log in with' }), 'email')
    await user.type(screen.getByLabelText('Email address'), customer.email)
    await user.type(screen.getByLabelText('PIN'), pin)
    await user.click(screen.getByRole('button', { name: /Continue to accounts/ }))
    await screen.findByRole('heading', { name: /Hello, Alex/ })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ identifier: customer.email, pin })
  })

  it('rejects invalid PIN length without calling the API', async () => {
    const fetchMock = mockApi(); const user = userEvent.setup(); render(<App />)
    await user.type(screen.getByLabelText('Customer number'), customer.customerNumber)
    await user.type(screen.getByLabelText('PIN'), '123')
    await user.click(screen.getByRole('button', { name: /Continue to accounts/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('six-digit PIN')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps incorrect PIN errors on the login screen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Customer details or PIN are incorrect.' }), { status: 401 })))
    const user = userEvent.setup(); render(<App />)
    await user.type(screen.getByLabelText('Customer number'), customer.customerNumber)
    await user.type(screen.getByLabelText('PIN'), '999999')
    await user.click(screen.getByRole('button', { name: /Continue to accounts/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Customer details or PIN are incorrect.')
    expect(screen.queryByRole('button', { name: 'Reveal PIN' })).not.toBeInTheDocument()
  })

  it('clears the PIN and session when logging out', async () => {
    const fetchMock = mockApi(); const user = userEvent.setup(); render(<App />); await signIn(user)
    await user.click(screen.getByRole('button', { name: 'Reveal PIN' }))
    await user.click(screen.getByRole('button', { name: /Logout/ }))
    await screen.findByRole('button', { name: /Continue to accounts/ })
    expect(screen.queryByText(pin)).not.toBeInTheDocument()
    expect(api.hasSession()).toBe(false)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/access/logout'))).toBe(true)
  })

  it('returns to login and clears the revealed PIN when the session expires', async () => {
    const fetchMock = mockApi([source]); const user = userEvent.setup(); render(<App />); await signIn(user)
    await user.click(screen.getByRole('button', { name: 'Reveal PIN' }))
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Your session has expired. Log in again.' }), { status: 401 }))
    await user.click(screen.getByRole('button', { name: /Refresh/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your session has expired')
    expect(screen.queryByText(pin)).not.toBeInTheDocument()
    expect(api.hasSession()).toBe(false)
  })

  it('excludes closed accounts from the transfer dropdown', async () => {
    mockApi([source, { ...destination, closed: true }]); const user = userEvent.setup(); render(<App />); await signIn(user)
    await user.click(screen.getByRole('button', { name: /Current account/ }))
    await user.click(screen.getByRole('button', { name: 'Transfer' }))
    const dropdown = screen.getByRole('combobox', { name: 'Transfer to' })
    expect(dropdown.querySelector(`option[value="${source.accountNumber}"]`)).toBeNull()
    expect(dropdown.querySelector(`option[value="${destination.accountNumber}"]`)).toBeNull()
    await user.selectOptions(dropdown, 'other')
    expect(screen.getByLabelText(/Destination account number/)).toBeInTheDocument()
  })
})
