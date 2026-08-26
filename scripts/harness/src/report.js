import { computeMetrics, formatTable, toCsv } from './lib/metrics.js'

export async function report(args) {
  const root = process.cwd()
  const flag = (names) => {
    const i = args.findIndex((a) => names.includes(a))
    return i !== -1 ? args[i + 1] : null
  }
  const format = flag(['--format']) ?? 'table'
  const module = flag(['--module'])
  const days = flag(['--days']) ? Number(flag(['--days'])) : null

  const metrics = computeMetrics(root, { module, days })

  if (format === 'json') {
    process.stdout.write(JSON.stringify(metrics, null, 2) + '\n')
  } else if (format === 'csv') {
    process.stdout.write(toCsv(metrics) + '\n')
  } else {
    process.stdout.write(formatTable(metrics) + '\n')
  }
}