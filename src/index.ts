import { searchKnowledgeAction } from '@/actions/search_knowledge'
import { DocsIndexer } from '@/indexers/files'
import { elizaLogger } from '@elizaos/core'
import { Agent } from '@tribesxyz/ayaos'

async function main(): Promise<void> {
  try {
    const agent = new Agent({
      dataDir: '/Users/hish/Data/jfk-files'
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
    await agent.start()

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
