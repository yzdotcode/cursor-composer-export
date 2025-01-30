import { execSync } from 'child_process'
import fs from 'fs/promises'

export async function setupGitHook(outputPath = '.composer-logs') {
  const hookContent = `
# Cursor Composer Export Start
# Ensure output directory exists
mkdir -p ${outputPath}

# Export with default settings to specified path
cursor-composer-export ${outputPath} --default

# Add all exported files (including hidden files)
git add -f ${outputPath}/.
# Cursor Composer Export End
`.trim()

  try {
    const hookFile = '.husky/pre-commit'
    let existingContent = ''
    
    // Check if hook file exists
    try {
      existingContent = await fs.readFile(hookFile, 'utf-8')
      
      // Check if already installed
      if (existingContent.includes('Cursor Composer Export Start')) {
        console.log('Git hook already contains composer export commands')
        return
      }
    } catch (error) {
      // File doesn't exist yet, that's OK
    }

    // Ensure .husky directory exists
    await fs.mkdir('.husky', { recursive: true })
    
    // Append to existing hook content
    const newContent = `${existingContent}\n\n${hookContent}\n`
    await fs.writeFile(hookFile, newContent)
    
    execSync(`chmod +x ${hookFile}`)
    console.log('Composer export commands added to pre-commit hook successfully')
  } catch (error) {
    console.error('Error installing Git hook:', error)
    process.exit(1)
  }
}

export async function removeGitHook() {
  try {
    const hookFile = '.husky/pre-commit'
    let existingContent = ''
    
    try {
      existingContent = await fs.readFile(hookFile, 'utf-8')
    } catch (error) {
      console.log('No existing hook file found')
      return
    }

    // Split content into lines and remove our section
    const markerStart = '# Cursor Composer Export Start'
    const markerEnd = '# Cursor Composer Export End'
    
    const lines = existingContent.split('\n')
    const startIndex = lines.findIndex(line => line.includes(markerStart))
    const endIndex = lines.findIndex(line => line.includes(markerEnd))

    if (startIndex === -1 || endIndex === -1) {
      console.log('Composer export section not found in hook file')
      return
    }

    const newContent = [
      ...lines.slice(0, startIndex),
      ...lines.slice(endIndex + 1)
    ].join('\n').trim()

    await fs.writeFile(hookFile, newContent)
    console.log('Composer export commands removed from pre-commit hook')
  } catch (error) {
    console.error('Error removing Git hook:', error)
    process.exit(1)
  }
} 