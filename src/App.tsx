import { useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from './api'
import RegistrationDialog from './RegistrationDialog'
import type { Account, AccountType, Customer, MoneyAction } from './types'
import { amountInPennies, formatMoney, formatNumber, validNumber } from './validation'

type Panel = MoneyAction | 'close' | 'open' | null
const titles = { deposit: 'Deposit', withdraw: 'Withdraw', transfer: 'Transfer', close: 'Close Account', open: 'Open Account' }
const descriptions: Record<AccountType, string> = {
  Current: 'An account for your everyday banking.',
  Savings: 'A separate place for the money you set aside.',
  Credit: 'A credit account.',
}
const accountTitle = (account: Account) => account.accountType
  ? `${account.accountType[0]}${account.accountType.slice(1).toLowerCase()} account` : 'Account'
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.'

function BankIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3 9 9-6 9 6M4 21h16M6 11v7m6-7v7m6-7v7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
}

export default function App() {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [loginMethod, setLoginMethod] = useState<'number' | 'email'>('number')
  const [pin, setPin] = useState('')
  const [pinVisible, setPinVisible] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showRegistrationDialog, setShowRegistrationDialog] = useState(false)
  const [amount, setAmount] = useState('')
  const [target, setTarget] = useState('')
  const [transferChoice, setTransferChoice] = useState('')
  const [accountType, setAccountType] = useState<AccountType>('Current')
  const selected = accounts.find(account => account.accountNumber === selectedNumber)
  const openAccounts = accounts.filter(account => !account.closed)
  const transferAccounts = openAccounts.filter(account => account.accountNumber !== selectedNumber)

  function resetCustomer() {
    api.clearSession(); setCustomer(null); setAccounts([]); setSelectedNumber(null)
    setPanel(null); setPin(''); setPinVisible(false); setAmount(''); setTarget(''); setTransferChoice('')
    setShowRegistrationDialog(false)
  }

  function handleError(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 401 && api.hasSession()) {
      resetCustomer(); setNotice('')
      setError('Your session has expired. Log in again.')
    } else setError(errorMessage(cause))
  }

  function clearFeedback() { setError(''); setNotice('') }
  function showPanel(next: Panel) {
    clearFeedback(); setPanel(next); setAmount(''); setTarget(''); setTransferChoice('')
  }

  async function refresh(current: Customer) {
    try {
      const result = await api.accounts(current.customerNumber)
      setAccounts(result.accounts)
    } catch (cause) {
      handleError(cause)
    }
  }

  async function enterCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); clearFeedback()
    const form = new FormData(event.currentTarget)
    const customerNumber = String(form.get('customerNumber') || '').replace(/\s/g, '')
    if (mode === 'existing' && loginMethod === 'number' && !validNumber(customerNumber)) {
      setError('Enter a valid 16-digit customer number. Check the number for typing mistakes.'); return
    }
    const firstName = String(form.get('firstName') || '').trim()
    const lastName = String(form.get('lastName') || '').trim()
    const email = String(form.get('email') || '').trim()
    const loginPin = String(form.get('pin') || '')
    if (mode === 'existing' && !/^\d{6}$/.test(loginPin)) {
      setError('Enter your six-digit PIN.'); return
    }
    if (mode === 'new' && (!firstName || !lastName || !email)) {
      setError('Enter your first name, last name and email.'); return
    }
    setBusy(true)
    try {
      let current: Customer
      if (mode === 'new') {
        const result = await api.register({ firstName, lastName, email })
        current = result.customer; setPin(result.pin)
        setShowRegistrationDialog(true)
      } else {
        const result = await api.login(loginMethod === 'number' ? customerNumber : email, loginPin)
        current = result.customer; setPin(loginPin)
      }
      setPinVisible(false); setCustomer(current)
      await refresh(current)
    } catch (cause) { handleError(cause) }
    finally { setBusy(false) }
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); clearFeedback()
    if (!customer || !panel) return
    if (panel !== 'open' && (!selected || selected.closed)) {
      setError('Select an open account to continue.'); return
    }
    if (panel === 'close' && Number(selected!.balance) !== 0) {
      setError('Withdraw or transfer the remaining balance before closing this account.'); return
    }
    if (panel === 'deposit' || panel === 'withdraw' || panel === 'transfer') {
      const pennies = amountInPennies(amount)
      if (pennies === null) { setError('Enter a positive amount with no more than two decimal places.'); return }
      if (panel !== 'deposit' && pennies > Math.round(Number(selected!.balance) * 100)) {
        setError('This amount is greater than the available balance.'); return
      }
      if (panel === 'transfer' && (!validNumber(target) || target === selected!.accountNumber)) {
        setError('Enter a valid 16-digit destination account number, different from this account.'); return
      }
    }
    setBusy(true)
    try {
      if (panel === 'open') {
        const result = await api.create(accountType)
        setAccounts(previous => [...previous, result.account])
        setSelectedNumber(result.account.accountNumber)
        setNotice(`${accountTitle(result.account)} opened. Account number: ${formatNumber(result.account.accountNumber)}.`)
      } else if (panel === 'close') {
        const result = await api.close(selected!.accountNumber)
        setAccounts(previous => previous.map(account => account.accountNumber === result.account.accountNumber ? result.account : account))
        setNotice('Account closed successfully.')
      } else {
        const result = await api.move(panel, selected!.accountNumber, amount, target)
        const updates = [result.account, result.fromAccount, result.toAccount].filter((account): account is Account => !!account)
        setAccounts(previous => previous.map(account => updates.find(update => update.accountNumber === account.accountNumber) || account))
        setNotice(`${titles[panel]} of ${formatMoney(amount)} completed.`)
      }
      setPanel(null)
      await refresh(customer)
    } catch (cause) { handleError(cause) }
    finally { setBusy(false) }
  }

  return <div className="app">
    <header className="site-header">
      <a className="brand" href="/" onClick={event => { event.preventDefault(); if (!busy) { setSelectedNumber(null); setPanel(null); clearFeedback() } }} aria-label="bankwizz home"><span className="brand-icon"><BankIcon /></span>bank<span className="brand-accent">wizz</span></a>
      <span className="header-caption">Banking for brilliant minds.</span>
      {customer && <button className="button ghost" disabled={busy} onClick={async () => {
        setBusy(true)
        try { await api.logout() } catch { /* Clear local credentials even when the API is unavailable. */ }
        finally { resetCustomer(); clearFeedback(); setBusy(false) }
      }}>Logout <span aria-hidden="true">↗</span></button>}
    </header>
    <div className="app-body">
    <div className="app-scroll">
    {!customer ? <main className="welcome-layout">
      <section className="welcome-copy">
        <span className="eyebrow">YOUR MONEY. YOUR NEXT CHAPTER.</span>
        <h1>A little simpler.<br />A lot more <em>you.</em></h1>
        <p>Start with a customer profile. Your accounts and everyday banking are just a few steps away.</p>
        <div className="welcome-illustration" aria-hidden="true">
          <div className="illustration-orbit" />
          <div className="illustration-card"><BankIcon /><span>Room for what’s next.</span><div className="card-lines"><i /><i /><i /><i /></div><strong>bank<span className="brand-accent">wizz</span></strong></div>
          <span className="illustration-tag">A fresh start <span>↗</span></span>
        </div>
      </section>
      <section className="customer-card" aria-labelledby="customer-heading">
        <span className="eyebrow">LET’S GET STARTED</span>
        <h2 id="customer-heading">Welcome to bank<span className="brand-accent">wizz</span></h2>
        <p>Create a profile or find your existing customer.</p>
        <div className="segmented" aria-label="Customer options">
          <button aria-pressed={mode === 'existing'} disabled={busy} onClick={() => { setMode('existing'); clearFeedback() }}>Existing customer</button>
          <button aria-pressed={mode === 'new'} disabled={busy} onClick={() => { setMode('new'); clearFeedback() }}>New customer</button>
        </div>
        <form key={`${mode}-${loginMethod}`} onSubmit={enterCustomer}>
          <fieldset disabled={busy}>
            <div className="customer-form-body">
            {error && <div className="message error" role="alert">{error}</div>}
            <div className="customer-form-fields">
            {mode === 'new' ? <>
              <div className="field-row"><label>First name<input name="firstName" autoComplete="given-name" placeholder="Alex" required /></label><label>Last name<input name="lastName" autoComplete="family-name" placeholder="Morgan" required /></label></div>
              <label>Email address<input name="email" type="email" autoComplete="email" placeholder="alex@example.com" required /></label>
            </> : <>
              <label>Log in with<select value={loginMethod} onChange={event => { setLoginMethod(event.target.value as 'number' | 'email'); clearFeedback() }}><option value="number">Customer number</option><option value="email">Email address</option></select></label>
              {loginMethod === 'number' ? <>
                <label>Customer number<input name="customerNumber" inputMode="numeric" autoComplete="username" maxLength={19} placeholder="Your 16-digit customer number" required aria-describedby="number-help" /></label>
                <small id="number-help">Use the customer number you received when registering.</small>
              </> : <label>Email address<input name="email" type="email" autoComplete="username" placeholder="Your registered email address" required /></label>}
              <label>PIN<input name="pin" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} placeholder="Your six-digit PIN" required /></label>
            </>}
            </div>
            </div>
            <button type="submit" className="button primary full-width">{busy ? 'Please wait…' : mode === 'new' ? 'Create customer' : 'Continue to accounts'} <span aria-hidden="true">→</span></button>
          </fieldset>
        </form>
        <p className="card-footnote">One customer profile. All your accounts together.</p>
      </section>
    </main> : <main className="dashboard">
      <section className="dashboard-heading">
        <div><span className="eyebrow">YOUR BANKING SPACE</span><h1>Hello, {customer.firstName}<span className="brand-dot">.</span></h1><p>Here’s where things stand.</p></div>
        <div className="customer-identity"><span className="avatar">{customer.firstName[0]}{customer.lastName[0]}</span><div><strong>{customer.firstName} {customer.lastName}</strong><span>Customer {formatNumber(customer.customerNumber)}</span><small>{customer.email}</small><div className="pin-row"><span>PIN: <span className="pin-value" aria-label={pinVisible ? 'PIN' : 'PIN hidden'}>{pinVisible ? pin : '••••••'}</span></span><button className="pin-reveal" type="button" aria-pressed={pinVisible} onClick={() => setPinVisible(visible => !visible)}>{pinVisible ? 'Hide PIN' : 'Reveal PIN'}</button></div></div></div>
      </section>
      <div className="feedback" aria-live="polite">{notice && <div className="message success" role="status">{notice}</div>}{error && <div className="message error" role="alert">{error}</div>}</div>
      {selected ? <>
        <button className="back-link" disabled={busy} onClick={() => { setSelectedNumber(null); setPanel(null); clearFeedback() }}>← All accounts</button>
        {panel !== 'open' && <>
        <section className="account-detail" aria-labelledby="account-heading">
          <div><span className="eyebrow">{selected.closed ? 'CLOSED ACCOUNT' : 'ACCOUNT DETAILS'}</span><h2 id="account-heading">{accountTitle(selected)}</h2><p className="number">{formatNumber(selected.accountNumber)}</p></div>
          <div className="detail-balance"><span>Account balance</span><strong>{formatMoney(selected.balance)}</strong></div>
        </section>
        {selected.closed ? <div className="empty-state"><h3>This account is closed.</h3><p>You can still view its details or open a new account.</p></div> : <div className="action-grid">
          {(['deposit', 'withdraw', 'transfer', 'close'] as const).map(action => <button key={action} className={`action-button ${action === 'close' ? 'danger-text' : ''}`} aria-pressed={panel === action} disabled={busy || (Number(selected.balance) === 0 && (action === 'withdraw' || action === 'transfer'))} onClick={() => showPanel(action)}><span aria-hidden="true">{{ deposit: '↓', withdraw: '↑', transfer: '⇄', close: '×' }[action]}</span>{titles[action]}</button>)}
        </div>}
        </>}
      </> : <>
        {panel !== 'open' && <section className="overview"><div><span className="eyebrow">TOTAL BALANCE</span><strong>{formatMoney(openAccounts.reduce((sum, account) => sum + Number(account.balance), 0))}</strong><span>Across {openAccounts.length} open {openAccounts.length === 1 ? 'account' : 'accounts'}</span></div><div className="overview-decoration" aria-hidden="true"><BankIcon /></div></section>}
        {panel !== 'open' && accounts.length > 0 && <>
        <div className="section-heading"><h2>Your accounts <span className="count">{accounts.length}</span></h2><button className="button ghost" disabled={busy} onClick={async () => { setBusy(true); clearFeedback(); await refresh(customer); setBusy(false) }}>{busy ? 'Loading…' : 'Refresh'} <span aria-hidden="true">↻</span></button></div>
        <div className="accounts-grid">{accounts.map(account => <button className={`account-card ${account.closed ? 'is-closed' : ''}`} disabled={busy} key={account.accountNumber} onClick={() => { setSelectedNumber(account.accountNumber); setPanel(null); clearFeedback() }}>
          <div className="account-card-top"><span className="account-icon" aria-hidden="true"><BankIcon /></span><span className="badge">{account.closed ? 'Closed' : 'Open'}</span></div><h3>{accountTitle(account)}</h3><span className="number">{formatNumber(account.accountNumber)}</span><div className="account-card-bottom"><div><small>Balance</small><strong>{formatMoney(account.balance)}</strong></div><span className="card-arrow" aria-hidden="true">↗</span></div>
        </button>)}</div>
        </>}
      </>}
      {panel && <section className="operation-panel" aria-labelledby="operation-heading"><div className="section-heading"><h2 id="operation-heading">{titles[panel]}</h2><button className="button ghost" disabled={busy} onClick={() => showPanel(null)}>Cancel</button></div>
        <form onSubmit={submitAction}><fieldset disabled={busy}>
          {panel === 'open' ? <>
            <p>Choose an account for you</p>
            <div className="type-options">{(['Current', 'Savings', 'Credit'] as const).map(type => <label className={`type-option ${accountType === type ? 'chosen' : ''}`} key={type}><input type="radio" name="accountType" value={type} checked={accountType === type} onChange={() => setAccountType(type)} /><strong>{type}</strong><span>{descriptions[type]}</span></label>)}</div>
            <small>All accounts currently follow the same balance rules. Interest, overdrafts and credit limits are not configured.</small>
          </> : panel === 'close' ? <>
            <p>Close account <strong className="number">{formatNumber(selected!.accountNumber)}</strong>?</p><p>Closing is permanent. You can still view the closed account’s details.</p>
            {Number(selected!.balance) !== 0 && <div className="message warning">Withdraw or transfer the remaining {formatMoney(selected!.balance)} before closing this account.</div>}
          </> : <>
            <p>{panel === 'deposit' ? 'Add money to' : panel === 'withdraw' ? 'Take money out of' : 'Move money from'} account <strong className="number">{formatNumber(selected!.accountNumber)}</strong>.</p>
            {panel === 'transfer' && <>
              <label>Transfer to<select value={transferChoice} required onChange={event => { const value = event.target.value; setTransferChoice(value); setTarget(value === 'other' ? '' : value) }}>
                <option value="" disabled>Choose a destination account</option>
                {transferAccounts.map(account => <option key={account.accountNumber} value={account.accountNumber}>{accountTitle(account)} · {formatNumber(account.accountNumber)} · {formatMoney(account.balance)}</option>)}
                <option value="other">Another account (enter account number)</option>
              </select></label>
              {transferChoice === 'other' && <label>Destination account number<input value={target} onChange={event => setTarget(event.target.value.replace(/\s/g, ''))} inputMode="numeric" maxLength={19} placeholder="16-digit account number" required /><small>You can transfer to another customer’s account too.</small></label>}
            </>}
            <label>Amount (£)<input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" required autoFocus /></label>
          </>}
          <button className={`button ${panel === 'close' ? 'danger' : 'primary'}`} type="submit" disabled={panel === 'close' && Number(selected!.balance) !== 0}>{busy ? 'Please wait…' : panel === 'close' ? 'Confirm close account' : panel === 'open' ? `Open ${accountType.toLowerCase()} account` : `Confirm ${panel}`} <span aria-hidden="true">→</span></button>
        </fieldset></form>
      </section>}
      {!selected && panel !== 'open' && <section className="open-account-footer"><div><h3>Make room for what’s next.</h3><p>An account for every part of your life.</p></div><button className="button primary" disabled={busy} onClick={() => showPanel('open')}><span aria-hidden="true">＋</span> Open Account</button></section>}
    </main>}
    </div>
    </div>
    {customer && showRegistrationDialog && <RegistrationDialog customerNumber={customer.customerNumber} pin={pin} onDismiss={() => setShowRegistrationDialog(false)} />}
    <footer className="site-footer"><span>bank<span className="brand-accent">wizz</span> <span className="footer-muted">A simpler everyday.</span></span><span>Banking API playground</span></footer>
  </div>
}
