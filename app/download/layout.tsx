import { Space_Mono } from 'next/font/google'

const mono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
})

export default function DownloadLayout({ children }: { children: React.ReactNode }) {
  return <div className={mono.className}>{children}</div>
}
