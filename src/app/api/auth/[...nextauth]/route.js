// src/app/api/auth/[...nextauth]/route.js
import { authOptions } from '@/lib/auth';
import NextAuth from 'next-auth';


// Initialize NextAuth handler
const handler = NextAuth(authOptions);

// Expose GET and POST for NextAuth
export { handler as GET, handler as POST };
