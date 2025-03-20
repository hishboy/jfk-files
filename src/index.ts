import { lookupByRecordNumberAction } from '@/actions/lookup_by_record_number'
import { searchKnowledgeAction } from '@/actions/search_knowledge'
import { drizzleDB } from '@/common/db'
import { DocsIndexer } from '@/indexers/files'
import { elizaLogger } from '@elizaos/core'
import { Agent } from '@tribesxyz/ayaos'
import { sql } from 'drizzle-orm'

async function main(): Promise<void> {
  try {
    const agent = new Agent({
      dataDir: '/Users/hish/Data/jfk-files',
      knowledge: {
        // force the agent to use the knowledge base action and not the one in runtime
        matchThreshold: 1,
        matchLimit: 0
      }
    })

    agent.on('pre:llm', async (context) => {
      console.log('llm:pre', context.content)
      return true
    })

    agent.on('post:llm', async (context) => {
      console.log('llm:post', context.content)
      return true
    })

    await agent.register('action', searchKnowledgeAction)
    await agent.register('action', lookupByRecordNumberAction)
    await agent.start()

    // add index to recordNumber
    // Create index on knowledge.content.type
    await drizzleDB.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_knowledge_record_number
          ON knowledge((content->'metadata'->>'recordNumber'));`
    )

    // Sleep for 5 seconds before proceeding

    await new Promise((resolve) => setTimeout(resolve, 5000))
    console.log('Continuing execution...')

    const indexer = new DocsIndexer(agent)
    const rootDir = process.cwd()
    await indexer.indexFiles(`${rootDir}/src/files`, 'jfk', 'md')
  } catch {
    process.exit(1)
  }
}

console.log('hello, agent!')
main().catch(elizaLogger.error)
