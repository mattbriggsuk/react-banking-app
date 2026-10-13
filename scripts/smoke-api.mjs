import assert from 'node:assert/strict'

// Run only against a deliberately selected local, disposable API instance.
const base = process.env.BANKING_TEST_BASE_URL
if (!base || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) {
  throw new Error('Set BANKING_TEST_BASE_URL to a disposable local API or Vite proxy origin. This test creates a customer and accounts.')
}
let checks = 0
let sessionToken = null
async function request(path, body, status = 200, token = sessionToken) {
  const response = await fetch(`${base.replace(/\/$/, '')}/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  })
  const data = response.status === 204 ? null : await response.json()
  assert.equal(response.status, status, `${path}: unexpected HTTP status`)
  checks++
  return data
}
const registration = await request('/customer/register', {
  customer: { firstName: 'Frontend', lastName: 'SmokeTest', email: `frontend-${Date.now()}@example.com` },
}, 201)
const { customer, pin } = registration
sessionToken = registration.sessionToken
assert.match(pin, /^\d{6}$/)
assert.ok(sessionToken)
const number = customer.customerNumber
assert.match(number, /^\d{16}$/)
await request(`/customer/accounts?customerNumber=${number}`, undefined, 401, null)
const wrongPin = pin === '999999' ? '000000' : '999999'
await request('/access/login', { identifier: number, pin: wrongPin }, 401)
await request('/access/login', { identifier: 'missing@example.com', pin }, 401)
await request('/access/login', { identifier: number, pin: '123' }, 400)
const numberLogin = await request('/access/login', { identifier: number, pin })
assert.equal(numberLogin.customer.customerNumber, number)
assert.equal(numberLogin.pin, undefined)
assert.ok(numberLogin.sessionToken)
const emailLogin = await request('/access/login', { identifier: ` ${customer.email.toUpperCase()} `, pin })
assert.equal(emailLogin.customer.customerNumber, number)
sessionToken = emailLogin.sessionToken
await request('/customer/register', { customer: { ...customer, email: customer.email.toUpperCase() } }, 409)
const lookup = await request(`/customer/get?customerNumber=${number}`)
assert.equal(lookup.customer.email, customer.email)
assert.deepEqual(Object.keys(lookup.customer).sort(), ['customerNumber', 'email', 'firstName', 'lastName'])
assert.deepEqual((await request(`/customer/accounts?customerNumber=${number}`)).accounts, [])
const accounts = []
for (const accountType of ['CURRENT', 'SAVINGS', 'CREDIT']) {
  const { account } = await request('/account/create', { accountType }, 201)
  assert.equal(account.accountType, accountType)
  assert.equal(Number(account.balance), 0)
  accounts.push(account)
}
const legacy = await request('/account/create', {}, 201)
assert.equal(legacy.account.accountType, 'CURRENT')
await request('/account/create', { accountType: 'INVALID' }, 400)
await request('/account/create', { accountType: null }, 400)
const [source, target] = accounts
const movement = (transactionType, amount, targetAccountNumber, sourceAccountNumber) => ({
  transaction: { transactionType, amount, targetAccountNumber, ...(sourceAccountNumber ? { sourceAccountNumber } : {}) },
})
const deposit = await request('/account/deposit', movement('DEPOSIT', '100.25', source.accountNumber))
assert.equal(Number(deposit.account.balance), 100.25)
assert.equal(deposit.account.accountType, 'CURRENT')
const withdrawal = await request('/account/withdraw', movement('WITHDRAWAL', '0.25', source.accountNumber))
assert.equal(Number(withdrawal.account.balance), 100)
const transfer = await request('/account/transfer', movement('TRANSFER', '25.00', target.accountNumber, source.accountNumber))
assert.equal(Number(transfer.fromAccount.balance), 75)
assert.equal(Number(transfer.toAccount.balance), 25)
assert.equal(transfer.toAccount.accountType, 'SAVINGS')
// Verify every protected route denies another customer's records or source account.
const other = await request('/customer/register', {
  customer: { firstName: 'Other', lastName: 'Customer', email: `other-${Date.now()}@example.com` },
}, 201)
const otherNumber = other.customer.customerNumber
const otherToken = other.sessionToken
const otherAccount = (await request('/account/create', {}, 201, otherToken)).account
await request(`/customer/get?customerNumber=${otherNumber}`, undefined, 403)
await request(`/customer/accounts?customerNumber=${otherNumber}`, undefined, 403)
// Account creation always uses the customer represented by the bearer token.
await request('/account/deposit', movement('DEPOSIT', '1.00', otherAccount.accountNumber), 403)
await request('/account/withdraw', movement('WITHDRAWAL', '1.00', otherAccount.accountNumber), 403)
await request('/account/close', { accountNumber: otherAccount.accountNumber }, 403)
await request('/account/transfer', movement('TRANSFER', '1.00', target.accountNumber, otherAccount.accountNumber), 403)
const external = await request('/account/transfer', movement('TRANSFER', '1.00', otherAccount.accountNumber, source.accountNumber))
assert.equal(Number(external.toAccount.balance), 1)
const returned = await request('/account/transfer', movement('TRANSFER', '1.00', source.accountNumber, otherAccount.accountNumber), 200, otherToken)
assert.equal(Number(returned.toAccount.balance), 75)
await request('/account/close', { accountNumber: source.accountNumber }, 409)
await request('/account/withdraw', movement('WITHDRAWAL', '76.00', source.accountNumber), 409)
await request('/account/withdraw', movement('WITHDRAWAL', '75.00', source.accountNumber))
const closed = await request('/account/close', { accountNumber: source.accountNumber }, 202)
assert.equal(closed.account.closed, true)
assert.equal(closed.account.accountType, 'CURRENT')
await request('/account/deposit', movement('DEPOSIT', '1.00', source.accountNumber), 409)
const list = await request(`/customer/accounts?customerNumber=${number}`)
assert.equal(list.accounts.length, 4)
assert.deepEqual(list.accounts.map(account => account.accountType), ['CURRENT', 'SAVINGS', 'CREDIT', 'CURRENT'])
assert.equal(list.accounts[0].closed, true)
assert.equal(Number(list.accounts[1].balance), 25)
await request('/access/logout', {}, 204)
await request(`/customer/accounts?customerNumber=${number}`, undefined, 401)
console.log(`Passed ${checks} live API checks: PIN registration, number/email login, session logout, ownership checks, account types, transfers, balances and closure.`)
