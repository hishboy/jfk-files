import { findFilesWithExtension } from '@/common/functions'
import { Agent, stringToUuid } from '@tribesxyz/ayaos'
import fs from 'fs'

export class DocsIndexer {
  private readonly agent: Agent

  constructor(agent: Agent) {
    this.agent = agent
  }

  async indexFiles(path: string, type: string, extension: string): Promise<void> {
    console.log(`[${type}] Indexing [${path}]`)

    // step 1: get all files with given extension
    const files = await findFilesWithExtension(path, extension)
    console.log(`[${type}] Found files:`, files.length)

    // step 2: embed files
    const kbService = this.agent.knowledge
    for (const file of files) {
      console.log(`[${type}] Indexing file: ${file}`)
      const content = await fs.promises.readFile(file, 'utf-8')
      const docId = stringToUuid(`file:${file}`)

      // Extract the filename without extension to use as recordNumber
      const filePathParts = file.split('/')
      const fileName = filePathParts[filePathParts.length - 1]
      const recordNumber = fileName.substring(0, fileName.lastIndexOf('.'))

      await kbService.add(docId, {
        text: content,
        metadata: {
          type: 'file',
          filePath: file,
          recordNumber
        }
      })
    }

    console.log(`[${type}] indexing done.`)
  }
}
