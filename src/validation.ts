export function validNumber(value: string): boolean {
  if (!/^\d{16}$/.test(value)) return false
  return [...value].reduce((sum, character, index) => {
    let digit = Number(character)
    if (index % 2 === 0) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    return sum + digit
  }, 0) % 10 === 0
}

// Keep amounts as decimal strings when sending JSON to avoid binary rounding.
// Limit to safe integer pennies, even though the API accepts larger amounts.
export function amountInPennies(value: string): number | null {
  if (!/^\d{1,14}(\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const pennies = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(pennies) && pennies > 0 ? pennies : null
}

export function formatMoney(balance: number | string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(balance))
}

export function formatNumber(value: string): string {
  return value.replace(/(.{4})(?=.)/g, '$1 ')
}
