import { drizzleDB } from '@/common/db'
import { isNull } from '@/common/functions'
import { elizaLogger, generateText, ModelClass } from '@elizaos/core'
import {
  Action,
  AgentcoinRuntime,
  Content,
  HandlerCallback,
  Memory,
  RAGKnowledgeItem,
  State
} from '@tribesxyz/ayaos'
import { sql } from 'drizzle-orm'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'

// Interface for the lookup results content
export interface LookupByRecordNumberContent extends Content {
  recordNumber: string
  results: RAGKnowledgeItem[]
  summary: string
}

export const lookupByRecordNumberAction: Action = {
  name: 'LOOKUP_BY_RECORD_NUMBER',
  similes: [
    'FIND_RECORD_NUMBER',
    'RETRIEVE_JFK_RECORD',
    'GET_DOCUMENT_BY_ID',
    'FETCH_RECORD_BY_NUMBER'
  ],
  description:
    'Looks up and summarizes documents related to a specific record number from the ' +
    'JFK assassination files database. This is useful when a user asks about a specific ' +
    'record number or when you need to retrieve all documents related to a particular ' +
    'document ID. The action handles large documents by breaking them into smaller chunks ' +
    'and progressively summarizing the content.',
  validate: async (
    _runtime: AgentcoinRuntime,
    _message: Memory,
    _options: { [key: string]: unknown }
  ) => {
    return true
  },
  handler: async (
    runtime: AgentcoinRuntime,
    message: Memory,
    _state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    elizaLogger.info('Starting LOOKUP_BY_RECORD_NUMBER handler...')

    try {
      // Extract record number from the message
      const userMessage = message.content.text
      if (isNull(userMessage)) {
        throw new Error('User message is required')
      }

      // Extract the record number from the user's query
      const recordNumber = await extractRecordNumber(userMessage, runtime)
      if (!recordNumber) {
        if (callback) {
          callback({
            text: "I couldn't identify a valid record number in your request. Please provide a specific record number like '104-10063-10153' or '124-10370-10283'.",
            content: { error: 'Record number not found in query' }
          }).catch((error) => {
            elizaLogger.error('Error sending callback:', error)
          })
        }
        return false
      }

      elizaLogger.info(`Looking up documents for record number: ${recordNumber}`)

      // Query drizzleDB directly using the recordNumber index
      // Using prepared SQL to avoid type assertion issues
      const rows = await drizzleDB.execute(
        sql`SELECT id, "agentId", content FROM knowledge 
            WHERE content->'metadata'->>'recordNumber' = ${recordNumber}
            LIMIT 100`
      )

      // Create knowledge items from the results
      const knowledgeItems: RAGKnowledgeItem[] = []

      for (const row of rows) {
        try {
          if (!row || typeof row !== 'object' || !row.id || !row.agentId || !row.content) {
            continue
          }

          // Get content text
          let contentText = ''
          if (
            row.content &&
            typeof row.content === 'object' &&
            'text' in row.content &&
            typeof row.content.text === 'string'
          ) {
            contentText = row.content.text
          }

          // Create metadata object
          const metadata: Record<string, unknown> = { recordNumber }

          // Add metadata properties from row if they exist
          if (
            row.content &&
            typeof row.content === 'object' &&
            'metadata' in row.content &&
            row.content.metadata &&
            typeof row.content.metadata === 'object'
          ) {
            // Add each property individually to avoid spread operator
            // Use unknown type to avoid assertions
            const sourceMetadata = row.content.metadata
            if (sourceMetadata && typeof sourceMetadata === 'object') {
              Object.keys(sourceMetadata).forEach((key) => {
                if (key in sourceMetadata) {
                  metadata[key] = sourceMetadata[key]
                }
              })
            }
          }

          // Create knowledge item with default UUID
          const defaultUuid = '00000000-0000-0000-0000-000000000000'
          knowledgeItems.push({
            id: defaultUuid,
            agentId: defaultUuid,
            content: {
              text: contentText,
              metadata
            },
            score: 1.0
          })
        } catch (err) {
          elizaLogger.error('Error processing knowledge item:', err)
        }
      }

      elizaLogger.info(
        `Found ${knowledgeItems.length} documents for record number: ${recordNumber}`
      )

      // Generate a summary of the search results
      let summary =
        `I couldn't find any documents with the record number ` +
        `${recordNumber} in the JFK files.`

      if (knowledgeItems.length > 0) {
        try {
          // Process and summarize content
          summary = await processSummaryForLargeDocuments(runtime, knowledgeItems, recordNumber)
          elizaLogger.info('Generated summary for record number documents')
        } catch (llmError) {
          elizaLogger.error('Error generating summary with LLM:', llmError)

          // Fallback to a simple summary if LLM fails, but still attempt to provide context
          // instead of just truncating text
          summary =
            `I found ${knowledgeItems.length} document(s) with record number ${recordNumber}, ` +
            `but encountered an error generating a detailed summary. Here's a brief overview:\n\n`

          // Instead of just truncating, generate a brief summary for each document
          for (let i = 0; i < Math.min(3, knowledgeItems.length); i++) {
            const item = knowledgeItems[i]
            const text = item.content.text || 'No text content'

            // Include key information rather than just truncated text
            const docType = item.content.metadata?.type || 'Document'
            const date = item.content.metadata?.date || 'Unknown date'
            const firstLine = text.split('\n')[0] || ''

            summary += `Document ${i + 1}: ${docType} from ${date}\n`
            summary += `First line: ${firstLine}\n`

            // Extract key entities if possible
            const entities = extractKeyEntities(text)
            if (entities.length > 0) {
              summary += `Mentions: ${entities.join(', ')}\n`
            }

            summary += '\n'
          }
        }
      }

      if (callback) {
        callback({
          text: summary,
          content: {
            recordNumber,
            results: knowledgeItems,
            summary
          }
        }).catch((error) => {
          elizaLogger.error('Error sending callback:', error)
        })
      }

      return true
    } catch (error) {
      elizaLogger.error('Error looking up record number:', error)
      if (callback) {
        callback({
          text: 'I encountered a technical error while retrieving documents for this record number. Please try again or specify a different record number.',
          content: { error: 'Error retrieving documents by record number' }
        }).catch((error) => {
          elizaLogger.error('Error sending callback:', error)
        })
      }
      return false
    }
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Can you find information about record number 104-10063-10153?'
        }
      },
      {
        user: '{{user2}}',
        content: {
          text: "I'll look up that record number for you in the JFK files.",
          action: 'LOOKUP_BY_RECORD_NUMBER'
        }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Based on my search, record number 104-10063-10153 contains details about communications from CIA Headquarters regarding an individual named Wright who traveled outside of Algiers, and inquiries about stolen passports. The document appears to be classified communication between stations in Dar Es Salaam and Nairobi from February 1973.'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Tell me about document 124-10370-10283'
        }
      },
      {
        user: '{{user2}}',
        content: {
          text: "I'll look up that document number in the JFK assassination files.",
          action: 'LOOKUP_BY_RECORD_NUMBER'
        }
      },
      {
        user: '{{user2}}',
        content: {
          text: "I found record 124-10370-10283 in the declassified JFK files. This document appears to be a memorandum regarding Lee Harvey Oswald's activities in Mexico City prior to the assassination. It contains details about his visa application at the Cuban embassy and meetings with Soviet officials. The document was declassified as part of the JFK Assassination Records Collection Act."
        }
      }
    ]
  ]
}

/**
 * Extracts a record number from the user's message
 * @param message The user's message
 * @param runtime The agent runtime for accessing LLM services
 * @returns The extracted record number or null if none found
 */
async function extractRecordNumber(
  message: string,
  runtime: AgentcoinRuntime
): Promise<string | null> {
  try {
    // First try to extract using regex
    const recordNumberRegex = /\b\d{3}-\d{5}-\d{5}\b/
    const match = message.match(recordNumberRegex)

    if (match) {
      return match[0]
    }

    // If regex fails, try with LLM
    const systemPrompt = `
You are an assistant tasked with extracting JFK assassination record numbers from user queries.
Record numbers typically follow the format XXX-XXXXX-XXXXX (e.g., 104-10063-10153, 124-10370-10283).
If you find a record number in the user's query, respond ONLY with that number.
If no record number is found, respond with "NO_RECORD_NUMBER_FOUND".
Do not include any other text in your response.`

    const extractedText = await generateText({
      runtime,
      context: `${systemPrompt}\n\nUser query: "${message}"`,
      modelClass: ModelClass.SMALL,
      maxSteps: 1
    })

    const trimmedResult = extractedText.trim()
    if (trimmedResult === 'NO_RECORD_NUMBER_FOUND' || !trimmedResult) {
      return null
    }

    // Verify the result matches the expected format
    if (recordNumberRegex.test(trimmedResult)) {
      return trimmedResult
    }

    return null
  } catch (error) {
    elizaLogger.error('Error extracting record number:', error)
    return null
  }
}

/**
 * Processes and summarizes large documents by breaking them into chunks
 * @param runtime The agent runtime for accessing LLM services
 * @param searchResults The search results to process
 * @param recordNumber The record number being looked up
 * @returns A summary of the processed documents
 */
async function processSummaryForLargeDocuments(
  runtime: AgentcoinRuntime,
  searchResults: RAGKnowledgeItem[],
  recordNumber: string
): Promise<string> {
  // If we have multiple documents or small documents, use the same approach as in search_knowledge
  if (
    searchResults.length > 1 ||
    searchResults.every((result) => {
      const textLength = result.content.text?.length || 0
      return textLength < 10000
    })
  ) {
    const resultTexts = searchResults
      .map((item) => {
        // Extract record number to avoid long line
        const itemRecordNum = item.content.metadata?.recordNumber || recordNumber
        const itemText = item.content.text || 'No text content'
        return `Record Number: ${itemRecordNum}\nContent: ${itemText}`
      })
      .join('\n---\n')

    return await generateSummaryFromResults(runtime, resultTexts, recordNumber)
  }

  // For large documents, use recursive summarization approach
  const document = searchResults[0]
  const documentText = document.content.text || ''

  // Use LangChain text splitter to break the document into chunks
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 4000,
    chunkOverlap: 200
  })

  const chunks = await textSplitter.splitText(documentText)
  elizaLogger.info(
    `Split large document (${documentText.length} chars) into ${chunks.length} chunks`
  )

  // If we only have a few chunks, summarize them directly
  if (chunks.length <= 3) {
    const combinedText = `Record Number: ${recordNumber}\n\nContent:\n${documentText}`
    return await generateSummaryFromResults(runtime, combinedText, recordNumber)
  }

  // For very large documents, use a progressive summarization approach
  // First, generate summaries for each chunk
  const chunkSummaries = []
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    elizaLogger.info(`Summarizing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`)

    const chunkSummary = await generateChunkSummary(
      runtime,
      chunk,
      recordNumber,
      i + 1,
      chunks.length
    )
    chunkSummaries.push(chunkSummary)
  }

  // Then combine and summarize the chunk summaries
  const combinedSummaries = chunkSummaries.join('\n\n---\n\n')

  return await generateFinalSummary(runtime, combinedSummaries, recordNumber)
}

/**
 * Generates a summary for a specific chunk of a document
 * @param runtime The agent runtime for accessing LLM services
 * @param chunk The document chunk to summarize
 * @param recordNumber The record number being looked up
 * @param chunkNumber The current chunk number
 * @param totalChunks The total number of chunks
 * @returns A summary of the chunk
 */
async function generateChunkSummary(
  runtime: AgentcoinRuntime,
  chunk: string,
  recordNumber: string,
  chunkNumber: number,
  totalChunks: number
): Promise<string> {
  const systemPrompt = `
You are an assistant summarizing a segment (chunk ${chunkNumber} of ${totalChunks}) of a 
declassified JFK assassination document.
Document Record Number: ${recordNumber}

Summarize this chunk of the document, focusing on key facts, names, dates, and events.
Be factual and objective - only include what is explicitly mentioned in the document.
Keep your summary concise (150-250 words) and include any important details from this segment.
`

  return await generateText({
    runtime,
    context: `${systemPrompt}\n\nDocument Chunk:\n${chunk}`,
    modelClass: ModelClass.LARGE,
    maxSteps: 1
  })
}

/**
 * Generates a final summary from the combined chunk summaries
 * @param runtime The agent runtime for accessing LLM services
 * @param combinedSummaries The combined summaries of all chunks
 * @param recordNumber The record number being looked up
 * @returns A final summary of the document
 */
async function generateFinalSummary(
  runtime: AgentcoinRuntime,
  combinedSummaries: string,
  recordNumber: string
): Promise<string> {
  const systemPrompt = `
You are an assistant providing information about declassified documents related to the
JFK assassination. The following text contains summaries of different segments of
Record Number ${recordNumber}.

Create a comprehensive, well-organized summary of this entire document.
Focus on the most significant facts, events, people, and findings.
Be factual and objective - only include what is explicitly mentioned in the document.
Begin your response by indicating you're sharing information from a declassified JFK file.
Always reference the Record Number (${recordNumber}).
Format your response in markdown with sections and bullet points as appropriate.
Keep your summary under 500 words and be as succinct as possible without losing important details.
`

  return await generateText({
    runtime,
    context: `${systemPrompt}\n\nCombined Document Summaries:\n${combinedSummaries}`,
    modelClass: ModelClass.LARGE,
    maxSteps: 1
  })
}

/**
 * Generates a summary of search results using an LLM
 * @param runtime The agent runtime for accessing LLM services
 * @param resultTexts The formatted search results text
 * @param recordNumber The record number being looked up
 * @returns A summary of the search results
 */
async function generateSummaryFromResults(
  runtime: AgentcoinRuntime,
  resultTexts: string,
  recordNumber: string
): Promise<string> {
  // Create a prompt for the LLM
  const systemPrompt = `
You are a helpful assistant analyzing declassified documents about the JFK assassination.
You are providing information about Record Number ${recordNumber}.

Summarize the following document(s) from the JFK assassination archives in a clear, 
informative way. These are part of approximately 80,000 pages of declassified files 
released to the public.

Be factual and objective - only state what is explicitly mentioned in the document(s).
Clearly distinguish between established facts and speculative information.
If documents contain contradictory information, note these discrepancies.
Format your response in markdown with sections and bullet points as appropriate.
Always begin your response by indicating you're sharing information from declassified JFK files.
IMPORTANT: Always reference the Record Number (${recordNumber}).
Keep your summary under 500 words.
Be as succinct as possible without losing important details. Less text is always better.`

  return await generateText({
    runtime,
    context: `${systemPrompt}\n\n${resultTexts}`,
    modelClass: ModelClass.LARGE,
    maxSteps: 1
  })
}

/**
 * Helper function to extract key entities (people, places, organizations) from text
 * @param text The text to extract entities from
 * @returns Array of extracted entity names
 */
function extractKeyEntities(text: string): string[] {
  // Extract names that appear to be in Title Case
  const namePattern = /\b[A-Z][a-z]+ (?:[A-Z][a-z]+\s?)+\b/g
  const nameMatches = text.match(namePattern) || []

  // Extract locations and organizations (uppercase words)
  const orgPattern = /\b(?:[A-Z]{2,}|(?:CIA|FBI|KGB|USA|USSR))\b/g
  const orgMatches = text.match(orgPattern) || []

  // Extract dates - break into smaller parts to avoid long line
  const months =
    '(?:January|February|March|April|May|June|July|August|' + 'September|October|November|December)'
  const dateFormat = `\\b${months}\\s+\\d{1,2}(?:st|nd|rd|th)?,\\s+\\d{4}\\b`
  const datePattern = new RegExp(dateFormat, 'g')
  const dateMatches = text.match(datePattern) || []

  // Add unique matches to a Set
  const allMatches = [...nameMatches, ...orgMatches, ...dateMatches]
  const uniqueEntities = new Set(allMatches)

  // Limit to 10 entities
  return Array.from(uniqueEntities).slice(0, 10)
}
