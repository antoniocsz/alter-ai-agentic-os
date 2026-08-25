import { fileURLToPath } from 'node:url'

export const harnessRoot = () => fileURLToPath(new URL('../../../../', import.meta.url))
export const templatesDir = () => fileURLToPath(new URL('../../templates/', import.meta.url))