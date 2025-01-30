import path from 'path'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { ComposerChat, ComposerData, ComposerMessage } from './types'
import { convertChatToMarkdown } from './output'
import readline from 'readline'
import os from 'os'


async function getDefaultWorkspacePath(): Promise<string> {
  const homeDir = os.homedir()
  const platform = process.platform

  switch (platform) {
    case 'win32':
      return path.join(homeDir, 'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage')
    case 'darwin':
      return path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage')
    case 'linux':
      try {
        // Check if running in WSL
        const procVersion = await fs.readFile('/proc/version', 'utf8')
        const isWSL = procVersion.toLowerCase().includes('microsoft')
        
        if (isWSL) {
          const windowsUsersPath = '/mnt/c/Users'
          if (existsSync(windowsUsersPath)) {
            const files = await fs.readdir(windowsUsersPath)
            const username = files.find(f => 
              f !== 'Public' && 
              f !== 'Default' && 
              f !== 'Default User' &&
              existsSync(path.join(windowsUsersPath, f))
            )
            
            if (username) {
              return path.join('/mnt/c/Users', username, 'AppData/Roaming/Cursor/User/workspaceStorage')
            }
          }
        }
      } catch (error) {
        // If WSL detection fails, use Linux path
        console.log('WSL detection failed, using Linux path')
      }
      return path.join(homeDir, '.config', 'Cursor', 'User', 'workspaceStorage')
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

async function getComposers() {
  const workspacePath = process.env.WORKSPACE_PATH || await getDefaultWorkspacePath()
  if (!existsSync(workspacePath)) {
    throw new Error(`Workspace path not found: ${workspacePath}. Please set WORKSPACE_PATH environment variable to the correct path.`)
  }

  const composers: (ComposerChat & { workspaceId: string; workspaceFolder?: string })[] = []
  const entries = await fs.readdir(workspacePath, { withFileTypes: true })
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const dbPath = path.join(workspacePath, entry.name, 'state.vscdb')
      const workspaceJsonPath = path.join(workspacePath, entry.name, 'workspace.json')
      
      if (!existsSync(dbPath)) continue

      // Get workspace folder info
      let workspaceFolder = undefined
      try {
        const workspaceData = JSON.parse(await fs.readFile(workspaceJsonPath, 'utf-8'))
        workspaceFolder = workspaceData.folder
      } catch (error) {
        console.log(`No workspace.json found for ${entry.name}`)
      }

      const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      })
      
      const result = await db.get(`
        SELECT value FROM ItemTable 
        WHERE [key] = 'composer.composerData'
      `)
      
      if (result?.value) {
        const composerData = JSON.parse(result.value) as ComposerData
        // Add workspace info to each composer
        const composersWithWorkspace = composerData.allComposers.map(composer => ({
          ...composer,
          workspaceId: entry.name,
          workspaceFolder
        }))
        composers.push(...composersWithWorkspace)
      }
      
      await db.close()
    }
  }

  return composers.sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0))
}

// Add helper function to extract project name from workspace folder
function getProjectName(composer: ComposerChat & { workspaceFolder?: string }): string {
  if (composer.workspaceFolder) {
    // Try to get the last part of the path as project name
    const parts = composer.workspaceFolder.split(/[\/\\]/)
    return parts[parts.length - 1]
  }
  return 'unknown-project'
}

// Format the log summary (first line or truncated text)
function getLogSummary(composer: ComposerChat): string {
  const text = composer.name || composer.text || ''
  const firstLine = text.split('\n')[0].trim()
  return firstLine.length > 50 ? firstLine.substring(0, 47) + '...' : firstLine
}

// Add helper function to format timestamp
function formatTimestamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}${month}${day}_${hour}${minute}`
}

async function promptUser(
  composers: (ComposerChat & { workspaceId: string; workspaceFolder?: string })[],
  rl: readline.Interface
): Promise<{ index: number, filename: string }> {
  console.log('\nRecent Composer Logs:')
  composers.slice(0, 10).forEach((composer, index) => {
    const date = new Date(composer.lastUpdatedAt || composer.createdAt).toLocaleString()
    const projectName = getProjectName(composer)
    const summary = getLogSummary(composer)
    console.log(`${index + 1}. [${date}] [${projectName}] ${summary}`)
  })

  const getInput = async (question: string): Promise<string> => {
    return new Promise((resolve) => rl.question(question, resolve))
  }

  let selectedIndex = 0
  while (true) {
    const answer = await getInput(`\nSelect a log number (1-${Math.min(10, composers.length)}) [default 1] or q to quit: `)
    if (answer.toLowerCase() === 'q') {
      rl.close()
      process.exit(0)
    }
    
    // Default to first option if empty input
    const input = answer.trim() || '1'
    const num = parseInt(input)
    if (num >= 1 && num <= 10 && num <= composers.length) {
      selectedIndex = num - 1
      break
    }
    console.log('Invalid selection. Please enter a number between 1 and', Math.min(10, composers.length))
  }

  const selected = composers[selectedIndex]
  const timestamp = formatTimestamp(new Date(selected.lastUpdatedAt || selected.createdAt))
  const defaultName = `${getProjectName(selected)}_${timestamp}`
  let filename: string

  while (true) {
    const answer = await getInput(`\nEnter filename (default: ${defaultName}.md): `)
    filename = answer.trim() || `${defaultName}.md`
    
    // Add .md extension if not present
    if (!filename.toLowerCase().endsWith('.md')) {
      filename += '.md'
    }

    // Validate filename
    if (/^[a-zA-Z0-9-_\.]+\.md$/.test(filename)) {
      break
    }
    console.log('Invalid filename. Please use only letters, numbers, dash, underscore, and dot.')
  }

  return { index: selectedIndex, filename }
}

// Add function to get composer details
async function getComposerDetails(dbPath: string, composerId: string) {
  // First get composer data from workspace db
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  })

  try {
    // Get composer data from workspace db
    const result = await db.get(`
      SELECT value FROM ItemTable 
      WHERE [key] = 'composer.composerData'
    `)

    if (result?.value) {
      // Get global storage path
      const workspacePath = path.dirname(path.dirname(dbPath))
      const globalDbPath = path.join(workspacePath, '..', 'globalStorage', 'state.vscdb')
      console.log(`globalDbPath:${globalDbPath}`);
      console.log(`cursorDiskKV key:composerData:${composerId}`);

      if (existsSync(globalDbPath)) {
        const globalDb = await open({
          filename: globalDbPath,
          driver: sqlite3.Database
        })

        try {
          // Get detailed conversation from global storage
          const detailResult = await globalDb.get(`
            SELECT value FROM cursorDiskKV
            WHERE [key] = ?
          `, [`composerData:${composerId}`])

          if (detailResult?.value) {
            return JSON.parse(detailResult.value)
          }
        } finally {
          await globalDb.close()
        }
      }

      // Fallback to basic data if global storage not available
      const composerData = JSON.parse(result.value) as ComposerData
      return composerData.allComposers.find(c => c.composerId === composerId)
    }
  } finally {
    await db.close()
  }

  return null
}

async function promptOutputPath(initialPath: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const getInput = async (question: string): Promise<string> => {
    return new Promise((resolve) => rl.question(question, resolve))
  }

  let outputPath = initialPath
  while (true) {
    const answer = await getInput(`\nEnter output directory (default: ${initialPath}): `)
    outputPath = answer.trim() || initialPath
    
    try {
      await fs.mkdir(outputPath, { recursive: true })
      break
    } catch (error) {
      console.log(`Invalid path: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  rl.close()
  return outputPath
}

// Add helper to group composers by project
function groupComposersByProject(
  composers: (ComposerChat & { workspaceId: string; workspaceFolder?: string })[]
): Map<string, (ComposerChat & { workspaceId: string; workspaceFolder?: string })[]> {
  const projectMap = new Map<string, (ComposerChat & { workspaceId: string; workspaceFolder?: string })[]>()
  
  for (const composer of composers) {
    const project = getProjectName(composer)
    if (!projectMap.has(project)) {
      projectMap.set(project, [])
    }
    projectMap.get(project)!.push(composer)
  }
  
  return projectMap
}

// Add project selection prompt
async function promptProjectSelection(
  projects: Map<string, (ComposerChat & { workspaceId: string; workspaceFolder?: string })[]>,
  rl: readline.Interface
): Promise<(ComposerChat & { workspaceId: string; workspaceFolder?: string })[]> {
  // Create array of projects sorted by latest log
  const sortedProjects = Array.from(projects.entries())
    .map(([project, composers]) => ({
      project,
      latest: Math.max(...composers.map(c => c.lastUpdatedAt || c.createdAt))
    }))
    .sort((a, b) => b.latest - a.latest)

  console.log('\nAvailable Projects:')
  sortedProjects.forEach(({ project, latest }, index) => {
    const date = new Date(latest).toLocaleString()
    console.log(`${index + 1}. ${project} (last updated: ${date})`)
  })

  const getInput = async (question: string): Promise<string> => {
    return new Promise((resolve) => rl.question(question, resolve))
  }

  // Auto-select if only one project
  if (sortedProjects.length === 1) {
    console.log(`\nAuto-selecting only project: ${sortedProjects[0].project}`)
    return projects.get(sortedProjects[0].project)!
  }

  let selectedIndex = 0
  while (true) {
    const answer = await getInput(`\nSelect a project (1-${sortedProjects.length}) [default 1] or q to quit: `)
    if (answer.toLowerCase() === 'q') {
      rl.close()
      process.exit(0)
    }
    
    // Default to first option if empty input
    const input = answer.trim() || '1'
    const num = parseInt(input)
    if (num >= 1 && num <= sortedProjects.length) {
      selectedIndex = num - 1
      break
    }
    console.log('Invalid selection. Please enter a number between 1 and', sortedProjects.length)
  }

  const selectedProject = sortedProjects[selectedIndex].project
  return projects.get(selectedProject)!
    .sort((a, b) => (b.lastUpdatedAt || b.createdAt) - (a.lastUpdatedAt || a.createdAt))
}

async function main() {
  try {
    // Get initial path from args or use default
    const initialOutputPath = process.argv[2] || '.composer-logs'
    
    // Prompt for output path confirmation
    const outputPath = await promptOutputPath(initialOutputPath)

    const composers = await getComposers()
    const projectMap = groupComposersByProject(composers)
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    // First select project
    const projectComposers = await promptProjectSelection(projectMap, rl)
    
    // Then select log from project
    const { index: selectedIndex, filename } = await promptUser(projectComposers, rl)
    
    const selected = projectComposers[selectedIndex]
    
    // Get detailed conversation data
    const dbPath = path.join(
      process.env.WORKSPACE_PATH || await getDefaultWorkspacePath(),
      selected.workspaceId,
      'state.vscdb'
    )
    const details = await getComposerDetails(dbPath, selected.composerId)

    // console.log(details);

    // Merge the conversation data
    const markdown = convertChatToMarkdown({
      id: selected.composerId,
      title: selected.name || selected.composerId,
      timestamp: new Date(selected.lastUpdatedAt || selected.createdAt).toISOString(),
      bubbles: details?.conversation?.map((msg: ComposerMessage) => ({
        type: msg.type === 1 ? 'user' : 'ai',
        text: msg.text || msg.richText,
        modelType: 'composer'
      })) || selected.conversation?.map((msg: ComposerMessage) => ({
        type: msg.type === 1 ? 'user' : 'ai',
        text: msg.text || msg.richText,
        modelType: 'composer'
      })) || []
    })

    const fullPath = path.join(outputPath, filename)
    await fs.writeFile(fullPath, markdown)
    console.log(`\nExported to: ${fullPath}`)

    // Close readline interface explicitly
    rl.close()
    process.exit(0)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

main() 