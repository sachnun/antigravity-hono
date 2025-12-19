import type { FC } from 'hono/jsx'
import { raw } from 'hono/html'

const { clientScript } = await import('./client/auth.js') as { clientScript: string }

const scrollbarStyles = `
  .scrollbar-thin::-webkit-scrollbar { width: 6px; }
  .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
  .scrollbar-thin::-webkit-scrollbar-thumb { background: #404040; border-radius: 3px; }
  .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #525252; }
  .scrollbar-thin { scrollbar-width: thin; scrollbar-color: #404040 transparent; }
`

export const AuthPage: FC = () => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Antigravity Auth</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>{raw(scrollbarStyles)}</style>
      </head>
      <body class="bg-neutral-950 text-neutral-300 min-h-screen p-6 overflow-y-auto font-sans">
        <div id="root"></div>
        <script type="module">{raw(clientScript)}</script>
      </body>
    </html>
  )
}
