'use client';

import { useState } from 'react';

export default function AdminCreatePage() {
    const [form, setForm] = useState({ name: '', email: '', password: '' });
    const [message, setMessage] = useState('');

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');

        const res = await fetch('/api/admin/create', {
            method: 'POST',
            body: JSON.stringify({ ...form }),
            headers: { 'Content-Type': 'application/json' },
        });

        const data = await res.json();
        if (res.ok) {
            setMessage('✅ Admin created successfully');
        } else {
            setMessage('❌ Error: ' + data.error);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900">
            <form onSubmit={handleSubmit} className="bg-slate-800 p-8 rounded shadow-lg w-full max-w-md">
                <h1 className="text-2xl text-white mb-6 text-center">Create Admin Account</h1>

                {message && <p className="text-white mb-4">{message}</p>}

                <label className="block mb-2 text-gray-300">
                    Name
                    <input
                        type="text"
                        name="name"
                        required
                        onChange={handleChange}
                        className="mt-1 w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    />
                </label>

                <label className="block mb-2 text-gray-300">
                    Email
                    <input
                        type="email"
                        name="email"
                        required
                        onChange={handleChange}
                        className="mt-1 w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    />
                </label>

                <label className="block mb-4 text-gray-300">
                    Password
                    <input
                        type="password"
                        name="password"
                        required
                        onChange={handleChange}
                        className="mt-1 w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    />
                </label>

                <button
                    type="submit"
                    className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                    Create Admin
                </button>
            </form>
        </div>
    );
}
