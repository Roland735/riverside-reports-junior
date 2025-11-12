// app/layout.js
import './globals.css';
import { Geist, Geist_Mono } from 'next/font/google';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../lib/auth';
import { Providers } from './providers';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata = {
  title: 'Riverside Reports',
  description: 'Exam reporting for teachers and admin',
};

export default async function RootLayout({ children }) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
