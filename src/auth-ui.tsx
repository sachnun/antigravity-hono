import type { FC } from 'hono/jsx'
import { raw } from 'hono/html'

const { clientScript } = await import('./client/auth.js') as { clientScript: string }

const inlineStyles = `
  :root{--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-color:rgb(59 130 246/.5)}
  *,::after,::before{box-sizing:border-box;border:0 solid #e5e7eb}
  html{line-height:1.5;-webkit-text-size-adjust:100%;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
  body{margin:0;line-height:inherit}
  h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}
  a{color:inherit;text-decoration:inherit}
  button,input,textarea{font-family:inherit;font-size:100%;font-weight:inherit;line-height:inherit;color:inherit;margin:0;padding:0}
  button{background-color:transparent;background-image:none;cursor:pointer}
  ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#404040;border-radius:3px}::-webkit-scrollbar-thumb:hover{background:#525252}
  .scrollbar-thin{scrollbar-width:thin;scrollbar-color:#404040 transparent}
  .bg-neutral-950{background-color:#0a0a0a}.bg-neutral-900{background-color:#171717}.bg-neutral-800{background-color:#262626}.bg-neutral-700{background-color:#404040}
  .bg-blue-600{background-color:#2563eb}.bg-blue-500{background-color:#3b82f6}.bg-red-600{background-color:#dc2626}.bg-amber-500{background-color:#f59e0b}
  .bg-blue-500\\/10{background-color:rgb(59 130 246/.1)}.bg-green-500\\/10{background-color:rgb(34 197 94/.1)}.bg-red-500\\/10{background-color:rgb(239 68 68/.1)}
  .text-neutral-300{color:#d4d4d4}.text-neutral-400{color:#a3a3a3}.text-neutral-500{color:#737373}.text-neutral-600{color:#525252}
  .text-white{color:#fff}.text-black{color:#000}.text-blue-500{color:#3b82f6}.text-green-500{color:#22c55e}.text-red-500{color:#ef4444}
  .border-neutral-700{border-color:#404040}.border-neutral-800{border-color:#262626}.border-blue-500{border-color:#3b82f6}
  .border-blue-500\\/30{border-color:rgb(59 130 246/.3)}.border-green-500\\/30{border-color:rgb(34 197 94/.3)}.border-red-500\\/30{border-color:rgb(239 68 68/.3)}
  .min-h-screen{min-height:100vh}.w-full{width:100%}.w-2{width:.5rem}.w-6{width:1.5rem}.h-2{height:.5rem}.h-6{height:1.5rem}.h-fit{height:fit-content}
  .max-w-5xl{max-width:64rem}.max-h-20{max-height:5rem}.min-h-16{min-height:4rem}
  .flex{display:flex}.grid{display:grid}.items-center{align-items:center}.justify-between{justify-content:space-between}.flex-1{flex:1 1 0%}.shrink-0{flex-shrink:0}
  .gap-2{gap:.5rem}.gap-3{gap:.75rem}.gap-6{gap:1.5rem}.space-y-1>:not([hidden])~:not([hidden]){margin-top:.25rem}
  .grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}
  .p-2{padding:.5rem}.p-3{padding:.75rem}.p-5{padding:1.25rem}.p-6{padding:1.5rem}
  .px-2{padding-left:.5rem;padding-right:.5rem}.px-3{padding-left:.75rem;padding-right:.75rem}.px-4{padding-left:1rem;padding-right:1rem}
  .py-0\\.5{padding-top:.125rem;padding-bottom:.125rem}.py-1\\.5{padding-top:.375rem;padding-bottom:.375rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}.py-2\\.5{padding-top:.625rem;padding-bottom:.625rem}.py-3{padding-top:.75rem;padding-bottom:.75rem}
  .mb-1{margin-bottom:.25rem}.mb-2{margin-bottom:.5rem}.mb-3{margin-bottom:.75rem}.mb-4{margin-bottom:1rem}.mb-6{margin-bottom:1.5rem}
  .mt-1{margin-top:.25rem}.mt-2{margin-top:.5rem}.mt-3{margin-top:.75rem}.mx-auto{margin-left:auto;margin-right:auto}
  .text-xs{font-size:.75rem;line-height:1rem}.text-sm{font-size:.875rem;line-height:1.25rem}.text-2xl{font-size:1.5rem;line-height:2rem}.text-\\[11px\\]{font-size:11px}
  .font-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.font-sans{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif}
  .font-medium{font-weight:500}.font-semibold{font-weight:600}
  .uppercase{text-transform:uppercase}.tracking-wide{letter-spacing:.025em}.break-all{word-break:break-all}
  .rounded{border-radius:.25rem}.rounded-md{border-radius:.375rem}.rounded-lg{border-radius:.5rem}.rounded-full{border-radius:9999px}
  .border{border-width:1px}.overflow-hidden{overflow:hidden}.overflow-y-auto{overflow-y:auto}.resize-y{resize:vertical}
  .transition-colors{transition-property:color,background-color,border-color;transition-duration:.15s}
  .hover\\:bg-blue-700:hover{background-color:#1d4ed8}.hover\\:bg-neutral-600:hover{background-color:#525252}.hover\\:bg-red-700:hover{background-color:#b91c1c}
  .disabled\\:bg-neutral-700:disabled{background-color:#404040}.disabled\\:cursor-not-allowed:disabled{cursor:not-allowed}.disabled\\:opacity-50:disabled{opacity:.5}
  .focus\\:outline-none:focus{outline:2px solid transparent;outline-offset:2px}.focus\\:border-blue-500:focus{border-color:#3b82f6}
  @media(min-width:1024px){.lg\\:col-span-3{grid-column:span 3/span 3}.lg\\:grid-cols-5{grid-template-columns:repeat(5,minmax(0,1fr))}.lg\\:sticky{position:sticky}.lg\\:top-6{top:1.5rem}}
`

export const AuthPage: FC = () => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Antigravity Auth</title>
        <style>{raw(inlineStyles)}</style>
      </head>
      <body class="bg-neutral-950 text-neutral-300 min-h-screen p-6 overflow-y-auto font-sans">
        <div id="root"></div>
        <script type="module">{raw(clientScript)}</script>
      </body>
    </html>
  )
}
