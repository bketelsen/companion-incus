import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Companion Incus',
  description: 'Multi-agent web UI for Claude Code & Codex, powered by Incus containers',
  base: '/companion-incus/',

  ignoreDeadLinks: [
    // localhost links are examples, not real links
    /^http:\/\/localhost/,
    // Pages created in later migration tasks
    /\/guides\/incus-environments/,
    /\/deploy\/cloud-vm/,
    /\/reference\/troubleshooting/,
  ],

  head: [
    ['link', { rel: 'icon', href: '/companion-incus/favicon.svg' }],
  ],

  themeConfig: {
    siteTitle: 'Companion Incus',

    nav: [
      { text: 'Docs', link: '/get-started/installation' },
      { text: 'GitHub', link: 'https://github.com/bketelsen/companion-incus' },
      { text: 'npm', link: 'https://www.npmjs.com/package/companion-incus' },
    ],

    sidebar: {
      '/': [
        {
          text: 'Get Started',
          items: [
            { text: 'Introduction', link: '/' },
            { text: 'Installation', link: '/get-started/installation' },
          ]
        },
        {
          text: 'Guides',
          items: [
            { text: 'Sessions & Permissions', link: '/guides/sessions-and-permissions' },
            { text: 'Incus Environments', link: '/guides/incus-environments' },
            { text: 'Git Worktrees', link: '/guides/git-worktrees' },
            { text: 'Agents', link: '/guides/agents' },
            { text: 'Chat Webhooks', link: '/guides/chat-webhooks' },
            { text: 'Saved Prompts', link: '/guides/saved-prompts' },
            { text: 'Linear Integration', link: '/guides/linear-integration' },
          ]
        },
        {
          text: 'Deploy',
          items: [
            { text: 'Cloud VM', link: '/deploy/cloud-vm' },
          ]
        },
        {
          text: 'Reference',
          items: [
            { text: 'CLI & API', link: '/reference/cli-and-api' },
            { text: 'Troubleshooting', link: '/reference/troubleshooting' },
          ]
        },
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/bketelsen/companion-incus' },
    ],

    footer: {
      message: 'Based on <a href="https://github.com/The-Vibe-Company/companion">The Companion</a> by The Vibe Company',
      copyright: 'Released under the MIT License',
    },

    search: {
      provider: 'local',
    },
  },
})
