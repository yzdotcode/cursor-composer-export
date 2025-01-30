import { ChatTab } from './types'

export function convertChatToMarkdown(tab: ChatTab): string {
    let markdown = `# ${tab.title || `Chat ${tab.id}`}\n\n`
    markdown += `_Created: ${new Date(tab.timestamp).toLocaleString()}_\n\n---\n\n`

    tab.bubbles.forEach((bubble) => {
        // Add speaker
        markdown += `### ${bubble.type === 'ai' ? `AI (${bubble.modelType})` : 'User'}\n\n`

        // Add selections if any
        if (bubble.selections?.length) {
            markdown += '**Selected Code:**\n\n'
            bubble.selections.forEach((selection) => {
                markdown += '```\n' + selection.text + '\n```\n\n'
            })
        }

        // Add message text
        if (bubble.text) {
            markdown += bubble.text + '\n\n'
        }

        markdown += '---\n\n'
    })

    return markdown
}