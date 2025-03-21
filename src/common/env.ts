import { ensureString } from '@/common/functions'

export const OPENAI_API_URL = ensureString(process.env.OPENAI_API_URL, 'OPENAI_API_URL is not set')

export const OPENAI_API_KEY = ensureString(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY is not set')

// export const SMALL_OPENAI_MODEL = ensureString(
//   process.env.SMALL_OPENAI_MODEL,
//   'SMALL_OPENAI_MODEL is not set'
// )

// export const MEDIUM_OPENAI_MODEL = ensureString(
//   process.env.MEDIUM_OPENAI_MODEL,
//   'MEDIUM_OPENAI_MODEL is not set'
// )

// export const LARGE_OPENAI_MODEL = ensureString(
//   process.env.LARGE_OPENAI_MODEL,
//   'LARGE_OPENAI_MODEL is not set'
// )
