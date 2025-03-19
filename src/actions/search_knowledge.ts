import { isNull } from '@/common/functions'
import { elizaLogger, generateText, ModelClass } from '@elizaos/core'
import {
  Action,
  AgentcoinRuntime,
  Content,
  HandlerCallback,
  KnowledgeBaseService,
  Memory,
  RAGKnowledgeItem,
  State
} from '@tribesxyz/ayaos'

// Interface for the search results content
export interface SearchKnowledgeContent extends Content {
  query: string
  results: RAGKnowledgeItem[]
  summary: string
}

export const searchKnowledgeAction: Action = {
  name: 'SEARCH_KNOWLEDGE',
  similes: [
    'QUERY_JFK_DOCUMENTS',
    'FIND_DECLASSIFIED_FILES',
    'LOOKUP_ASSASSINATION_RECORDS',
    'SEARCH_JFK_ARCHIVES'
  ],
  description:
    'Searches the knowledge base containing declassified files about the JFK assassination ' +
    'released to the public. This database contains approximately 80,000 pages of interviews,' +
    ' evidence, and reports collected over the years. Use this tool when the user asks for ' +
    'specific information related to the JFK assassination, involved individuals, or related ' +
    'historical events.',
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
    elizaLogger.info('Starting SEARCH_KNOWLEDGE handler for JFK assassination documents...')

    try {
      // Get the user's query from the message
      const userQuery = message.content.text
      if (isNull(userQuery)) {
        throw new Error('User query is required')
      }

      // Access the knowledge base through the runtime
      const knowledgeService = runtime.getService(KnowledgeBaseService)

      // Generate an optimized search query using LLM
      const optimizedQuery = await generateOptimizedQuery(userQuery, runtime)
      elizaLogger.info(`Original query: "${userQuery}", Optimized query: "${optimizedQuery}"`)

      // Search the knowledge base
      const searchResults = await knowledgeService.search({
        q: optimizedQuery,
        limit: 15,
        matchThreshold: 0.25
      })

      elizaLogger.info(`Found ${searchResults.length} results for query: ${optimizedQuery}`)

      // Generate a summary of the search results
      let summary =
        "I searched the declassified JFK files but couldn't find any relevant information about your query."

      if (searchResults.length > 0) {
        try {
          // Extract search results text
          const resultTexts = prepareSearchResultsText(searchResults)

          // Generate summary using LLM
          summary = await generateSummaryFromResults(runtime, resultTexts, userQuery)

          elizaLogger.info('Generated summary using LLM')
        } catch (llmError) {
          elizaLogger.error('Error generating summary with LLM:', llmError)

          // Fallback to a simple summary if LLM fails
          summary =
            'Based on my search of the declassified JFK assassination documents, here are the top results:\n\n'
          searchResults.slice(0, 5).forEach((result, index) => {
            const recordNumber = result.content.metadata?.recordNumber || 'Unknown Record'
            const text = result.content.text || 'No text content'
            summary += `${index + 1}. [Record ${recordNumber}] ${text.substring(0, 150)}${text.length > 150 ? '...' : ''}\n\n`
          })
        }
      } else {
        // No results found
        summary =
          "I've searched through the declassified JFK files but couldn't find any information related to your query. The knowledge base may not contain documents addressing this specific topic."
      }

      if (callback) {
        callback({
          text: summary,
          content: {
            query: optimizedQuery,
            results: searchResults,
            summary
          }
        }).catch((error) => {
          elizaLogger.error('Error sending callback:', error)
        })
      }

      return true
    } catch (error) {
      console.error('Error searching JFK assassination documents:', error)
      if (callback) {
        callback({
          text: 'I attempted to search the declassified JFK assassination documents, but encountered a technical error. Please try again with a different query.',
          content: { error: 'Error searching knowledge base' }
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
          text: 'What information do you have about Lee Harvey Oswald?'
        }
      },
      {
        user: '{{user2}}',
        content: {
          text: "I'll search the declassified JFK assassination files for information about Lee Harvey Oswald.",
          action: 'SEARCH_KNOWLEDGE'
        }
      },
      {
        user: '{{user2}}',
        content: {
          text: "Based on my search of the declassified documents, here's what I found about Lee Harvey Oswald (Record 104-10015-10057, Record 124-10370-10283): [Summary of search results]"
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Were there any Cuban connections to the JFK assassination?'
        }
      },
      {
        user: '{{user2}}',
        content: {
          text: "I'll search the declassified files for information about Cuban connections to the JFK assassination.",
          action: 'SEARCH_KNOWLEDGE'
        }
      },
      {
        user: '{{user2}}',
        content: {
          text: "After searching through the declassified documents, here's what I found about Cuban connections to the JFK assassination (Record 180-10147-10075, Record 124-10086-10190): [Summary of search results]"
        }
      }
    ]
  ]
}

/**
 * Generates an optimized search query based on the user's input
 * @param userQuery The original query from the user
 * @param runtime The agent runtime for accessing LLM services
 * @returns An optimized query for vector search
 */
async function generateOptimizedQuery(
  userQuery: string,
  runtime: AgentcoinRuntime
): Promise<string> {
  try {
    const systemPrompt = `
You are an expert at optimizing search queries for a vector database containing declassified
JFK assassination documents. Given a user's query about the JFK assassination, your task is
to rewrite it to be more effective for semantic search.

The knowledge base contains approximately 80,000 pages of declassified files including:
- Interviews with witnesses and persons of interest
- Evidence reports and forensic analyses
- Intelligence agency documents (CIA, FBI)
- Warren Commission materials
- House Select Committee on Assassinations (HSCA) documents
- Military and Secret Service reports
- Documents about key figures (Lee Harvey Oswald, Jack Ruby, etc.)

Focus on:
- Extracting key entities (people, places, organizations)
- Specific dates or time periods
- Key events or incidents
- Potential code names or operation names
- Relationships between entities

Remove filler words and focus on content-rich terms.
Do not add information that isn't implied by the original query.
Respond with ONLY the optimized query text, nothing else.`

    // Use generateText instead of reasoning.chat
    const optimizedQuery = await generateText({
      runtime,
      context: `${systemPrompt}\n\n${userQuery}`,
      modelClass: ModelClass.LARGE,
      maxSteps: 1
    })

    const result = optimizedQuery.trim() || userQuery

    console.log('optimizedQuery', optimizedQuery)

    return result
  } catch (error) {
    elizaLogger.error('Error generating optimized query:', error)
    return userQuery // Fall back to the original query if there's an error
  }
}

/**
 * Prepares search results as text for LLM summarization
 * @param searchResults The search results to format
 * @returns Formatted text of search results
 */
function prepareSearchResultsText(searchResults: RAGKnowledgeItem[]): string {
  return searchResults
    .map((item) => {
      return (
        `Record Number: ${item.content.metadata?.recordNumber}\n` +
        `Content: ${item.content.text || 'No text content'}\n`
      )
    })
    .join('\n---\n')
}

/**
 * Generates a summary of search results using an LLM
 * @param runtime The agent runtime for accessing LLM services
 * @param resultTexts The formatted search results text
 * @param userQuery The user's original query
 * @returns A summary of the search results
 */
async function generateSummaryFromResults(
  runtime: AgentcoinRuntime,
  resultTexts: string,
  userQuery: string
): Promise<string> {
  // Create a prompt for the LLM
  const systemPrompt = `
You are a helpful assistant analyzing declassified documents about the JFK assassination.
The user's original query was: "${userQuery}"

Summarize the following search results from the JFK assassination archives in a clear, 
informative way. These documents are part of approximately 80,000 pages of declassified files 
released to the public, including interviews, evidence reports, and investigations conducted over 
the years.

Focus on directly answering the user's query with the information provided in these documents.
Be factual and objective - only state what is explicitly mentioned in the documents.
Clearly distinguish between established facts and speculative information in the documents.
If documents contain contradictory information, note these discrepancies.
Format your response in markdown with sections and bullet points as appropriate.
If the search results don't contain relevant information to answer the query, state that clearly.
Always begin your response by indicating you're sharing information from declassified JFK files.
IMPORTANT: Always reference the Record Number for each piece of information 
you share (e.g., "According to Record 104-10015-10057...").
Keep your summary under 500 words.`

  // Use generateText instead of reasoning.chat
  return await generateText({
    runtime,
    context: `${systemPrompt}\n\n${resultTexts}`,
    modelClass: ModelClass.LARGE,
    maxSteps: 1
  })
}
