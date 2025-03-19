import { elizaLogger } from '@elizaos/core'
import { Agent } from '@tribesxyz/ayaos'

async function main(): Promise<void> {
  try {
    const agent = new Agent({
      dataDir: '/Users/hish/Data/jfk-files',
    })

    agent.on('pre:llm', async (context) => {
      console.log('llm:pre', context.memory)
      return true
    })

    agent.on('post:llm', async (context) => {
      console.log('llm:post', context.memory)
      return true
    })

    await agent.start()
  } catch {
    process.exit(1)
  }
}

console.log('hello, agent!')
main().catch(elizaLogger.error)
