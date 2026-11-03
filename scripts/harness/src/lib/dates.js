/** Data local (não UTC) no formato YYYY-MM-DD. */
export function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

/** Mês local no formato YYYY-MM. */
export function localMonth(date = new Date()) {
  return localDate(date).slice(0, 7)
}
