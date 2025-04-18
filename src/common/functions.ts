import fs from 'fs'
import { join } from 'path'

export async function findFilesWithExtension(dir: string, ext: string): Promise<string[]> {
  const files: string[] = []
  const entries = await fs.promises.readdir(dir)

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = await fs.promises.stat(fullPath)

    if (stat.isDirectory()) {
      files.push(...(await findFilesWithExtension(fullPath, ext)))
    } else if (entry.endsWith('.' + ext)) {
      files.push(fullPath)
    }
  }

  return files
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isRequiredString(arg: any): arg is string {
  return typeof arg === 'string'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNull(obj: any): obj is null | undefined {
  return obj === null || obj === undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ensureString(value: any, message: string | undefined = undefined): string {
  if (!value) {
    throw new Error(message || 'Value is undefined')
  }
  return value
}
