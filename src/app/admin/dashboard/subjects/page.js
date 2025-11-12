// app/admin/subjects/page.js

"use client";

import { useState, useEffect } from "react";
import { FiLoader } from "react-icons/fi";

export default function SubjectPage() {
    const [subjects, setSubjects] = useState([]);
    const [newSubject, setNewSubject] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        fetchSubjects();
    }, []);

    const fetchSubjects = async () => {
        const res = await fetch("/api/subjects");
        const data = await res.json();
        setSubjects(data.subjects || []);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setMessage("");
        setIsLoading(true);

        try {
            const res = await fetch("/api/subjects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newSubject }),
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to add subject");
            }

            setMessage("Subject added successfully");
            setNewSubject("");
            await fetchSubjects();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <h1 className="text-2xl text-white font-semibold">Create Subjects</h1>

            <form onSubmit={handleSubmit} className="space-y-4">
                <input
                    type="text"
                    placeholder="Enter subject name"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    disabled={isLoading}
                    className="w-full px-4 py-2 rounded bg-slate-700 text-white focus:outline-none disabled:opacity-50"
                />

                <button
                    type="submit"
                    disabled={isLoading}
                    className="flex items-center justify-center space-x-2 bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 disabled:opacity-50"
                >
                    {isLoading && <FiLoader className="animate-spin" />}
                    <span>{isLoading ? "Adding..." : "Add Subject"}</span>
                </button>

                {error && <p className="text-red-500 mt-2">{error}</p>}
                {message && <p className="text-green-500 mt-2">{message}</p>}
            </form>

            <div className="bg-slate-800 p-4 rounded-lg shadow mt-6">
                <h2 className="text-white text-lg mb-4">Existing Subjects</h2>
                <ul className="text-white space-y-1">
                    {subjects.map((s) => (
                        <li key={s._id} className="border-b border-slate-700 py-1">
                            {s.name}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
