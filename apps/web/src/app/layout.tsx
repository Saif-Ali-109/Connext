import type { Metadata } from 'next'
// import { Inter } from 'next/font/google'
import '../styles/globals.css'
import ClientProviders from '../components/ClientProviders'
import { ThemeProvider } from '../components/ThemeProvider'

// const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Wallet Chat',
  description: 'Decentralized chat for wallets',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        <ThemeProvider>
          <ClientProviders>
            {children}
          </ClientProviders>
        </ThemeProvider>
      </body>
    </html>
  )
}
