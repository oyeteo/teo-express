import { Cormorant_Garamond, Courier_Prime } from 'next/font/google'
import './admin.css'

const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-admin-display',
})

const mono = Courier_Prime({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-admin-mono',
})

export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`admin-shell ${display.variable} ${mono.variable}`}>
      {children}
    </div>
  )
}
