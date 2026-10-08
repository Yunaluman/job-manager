// Display rounding never changes the integer amount stored by the server.
export const usd = (nano) => {
  const value = Number(nano) / 1e9
  return value > 0 && value < 0.000001 ? '< 0,000001 USD' : `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USD`
}
export const tokenNumber = (value) => value === null ? 'Inconnus' : BigInt(value).toLocaleString('fr-FR')
