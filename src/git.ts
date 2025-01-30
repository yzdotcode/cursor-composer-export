import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs/promises'

export async function setupGitHook(outputPath = '.composer-logs') {
  const hookScript = `#!/bin/sh
cursor-composer-export --default
git add ${outputPath}/*
`

  try {
    // Ensure .husky directory exists
    await fs.mkdir('.husky', { recursive: true })
    await fs.writeFile('.husky/pre-commit', hookScript)
    execSync('chmod +x .husky/pre-commit')
    console.log('Git pre-commit hook installed successfully')
  } catch (error) {
    console.error('Error installing Git hook:', error)
    process.exit(1)
  }
} 