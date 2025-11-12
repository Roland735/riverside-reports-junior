'use client';

import { useEffect, useState } from 'react';
import { getSession, signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FiLoader } from 'react-icons/fi';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const params = useSearchParams();
    const error = params.get('error');

    // If already logged in, redirect immediately
    useEffect(() => {
        getSession().then((sess) => {
            if (sess?.user?.role) {
                redirectByRole(sess.user.role);
            }
        });
    }, []);

    // Map NextAuth errors to friendly messages
    useEffect(() => {
        if (error) {
            const map = {
                CredentialsSignin: 'Invalid email or password.',
                default: 'Unable to sign in.',
            };
            setErrorMsg(map[error] || map.default);
        }
    }, [error]);

    // After login, get session and redirect
    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setLoading(true);
        const res = await signIn('credentials', {
            redirect: false,
            email,
            password,
        });
        if (res.error) {
            setErrorMsg(res.error);
            setLoading(false);
        } else {
            const sess = await getSession();
            if (sess?.user?.role) {
                redirectByRole(sess.user.role);
            } else {
                setErrorMsg('No role assigned.');
                setLoading(false);
            }
        }
    };

    // Choose path by role
    function redirectByRole(role) {
        switch (role) {
            case 'admin':
                router.replace('/admin/dashboard');
                break;
            case 'teacher':
                router.replace('/teacher/dashboard');
                break;
            case 'classteacher':
                router.replace('/classteacher/dashboard');
                break;
            default:
                router.replace('/');
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-md bg-slate-800 p-8 rounded-lg shadow-lg"
            >
                <h1 className="text-2xl text-white mb-6 text-center">
                    Sign In to Riverside Portal
                </h1>

                {errorMsg && (
                    <p className="mb-4 text-red-400 bg-red-900 bg-opacity-20 p-2 rounded">
                        {errorMsg}
                    </p>
                )}

                <label className="block mb-2">
                    <span className="text-gray-300">Email</span>
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                        className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-red-500 text-white disabled:opacity-50"
                        placeholder="you@example.com"
                    />
                </label>

                <label className="block mb-4">
                    <span className="text-gray-300">Password</span>
                    <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                        className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-red-500 text-white disabled:opacity-50"
                        placeholder="••••••••"
                    />
                </label>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 mb-2 flex items-center justify-center text-white bg-red-600 rounded hover:bg-red-700 transition disabled:opacity-50"
                >
                    {loading ? <FiLoader className="animate-spin h-5 w-5" /> : 'Log In'}
                </button>

                <p className="text-center text-red-600 text-sm">
                    Please contact Riverside IT Department in case of any challenges.
                </p>
            </form>
        </div>
    );
}
