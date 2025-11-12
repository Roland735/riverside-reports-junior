// lib/auth.js
import CredentialsProvider from 'next-auth/providers/credentials';
import { NextAuthOptions } from 'next-auth';
import dbConnect from './mongoose';
import User from '../models/User';

export const authOptions = /** @type {NextAuthOptions} */ ({
    session: { strategy: 'jwt' },
    providers: [
        CredentialsProvider({
            name: 'Email and Password',
            credentials: {
                email: { label: 'Email', type: 'email', placeholder: 'you@example.com' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                await dbConnect();
                const user = await User.findOne({ email: credentials.email });
                if (user && await user.comparePassword(credentials.password)) {
                    return { id: user._id, name: user.name, email: user.email, role: user.role };
                }
                throw new Error('Invalid credentials');
            }
        })
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.role = user.role;
            }
            return token;
        },
        async session({ session, token }) {
            session.user.id = token.id;
            session.user.role = token.role;
            return session;
        }
    },
    pages: {
        signIn: '/login',
        error: '/login'
    }
});
