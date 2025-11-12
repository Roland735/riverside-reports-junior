'use client';

import { useState } from 'react';

export default function TeacherUploadPage() {
    const [file, setFile] = useState(null);
    const [message, setMessage] = useState('');

    const downloadTemplate = () => {
        // Triggers the GET /api/teachers/template route
        window.location.href = '/api/teachers/template';
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) {
            setMessage('Please select an .xlsx file');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/teachers/bulk', {
            method: 'POST',
            body: formData,
        });
        const data = await res.json();

        if (res.ok) {
            setMessage(
                'Upload complete. Results: ' +
                data.results.map((r) => `${r.email}→${r.status}`).join(', ')
            );
        } else {
            setMessage('Upload failed: ' + (data.error || res.statusText));
        }
    };

    return (
        <div className="p-6 bg-slate-900 min-h-screen">
            <h1 className="text-2xl text-white mb-4">Teacher Bulk-Create</h1>

            <button
                onClick={downloadTemplate}
                className="mb-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
                Download Excel Template
            </button>

            <form onSubmit={handleUpload} className="flex flex-col">
                <input
                    type="file"
                    accept=".xlsx"
                    onChange={(e) => setFile(e.target.files[0])}
                    className="mb-4 text-white"
                />
                <button
                    type="submit"
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                    Upload Filled Template
                </button>
            </form>

            {message && <p className="mt-4 text-white">{message}</p>}
        </div>
    );
}
