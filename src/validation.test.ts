import { amountInPennies, validNumber } from './validation'

describe('API validation rules', () => {
  it('validates 16-digit numbers using the API Luhn rule', () => {
    expect(validNumber('1234567890123452')).toBe(true)
    expect(validNumber('9876543210987658')).toBe(true)
    expect(validNumber('1234567890123453')).toBe(false)
    expect(validNumber('123')).toBe(false)
    expect(validNumber('abcdefghijklmnop')).toBe(false)
  })
  it('accepts positive decimal amounts as exact pennies', () => {
    expect(amountInPennies('0.01')).toBe(1)
    expect(amountInPennies('10.2')).toBe(1020)
    expect(amountInPennies('10')).toBe(1000)
  })
  it.each(['0', '-1', '1.001', '1e2', 'Infinity', '', '99999999999999.99'])('rejects invalid or unsafe amount %s', value => {
    expect(amountInPennies(value)).toBeNull()
  })
})
