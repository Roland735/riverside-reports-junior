// app/admin/exam-periods/page.js
"use client";
import { useState, useEffect } from "react";
import { FiLoader, FiEdit2, FiTrash2 } from "react-icons/fi";

export default function ExamPeriodsPage() {
    const [periods, setPeriods] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [name, setName] = useState("");
    const [term, setTerm] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [totalDays, setTotalDays] = useState("");
    const [active, setActive] = useState(false);

    // Fetch all periods
    const fetchPeriods = async () => {
        const res = await fetch("/api/exam-periods");
        const { periods } = await res.json();
        setPeriods(periods);
    };

    useEffect(() => {
        fetchPeriods();
    }, []);

    // Reset form
    const clearForm = () => {
        setEditingId(null);
        setName("");
        setTerm("");
        setStartDate("");
        setEndDate("");
        setTotalDays("");
        setActive(false);
    };

    // Create or update
    const handleSubmit = async e => {
        e.preventDefault();
        if (!name || !term || !startDate || !endDate || !totalDays) return;
        setLoading(true);

        const payload = { name, term, startDate, endDate, totalDays, active };

        if (editingId) {
            await fetch(`/api/exam-periods/${editingId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
        } else {
            await fetch("/api/exam-periods", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
        }

        clearForm();
        await fetchPeriods();
        setLoading(false);
    };

    // Load into form for editing
    const startEdit = p => {
        setEditingId(p._id);
        setName(p.name);
        setTerm(p.term);
        setStartDate(p.startDate.slice(0, 10));
        setEndDate(p.endDate.slice(0, 10));
        setTotalDays(String(p.totalDays));
        setActive(Boolean(p.active));
    };

    // Delete a period
    const handleDelete = async id => {
        if (!confirm("Delete this exam period?")) return;
        await fetch(`/api/exam-periods/${id}`, { method: "DELETE" });
        await fetchPeriods();
    };

    return (
        <div className="p-6 max-w-3xl mx-auto space-y-8">
            <h1 className="text-2xl text-white">
                {editingId ? "Edit Exam Period" : "Create Exam Period"}
            </h1>

            <form onSubmit={handleSubmit} className="space-y-4">
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Name (e.g. End Term 1)"
                    disabled={loading}
                    className="w-full px-3 py-2 bg-slate-700 text-white rounded"
                />
                <input
                    value={term}
                    onChange={e => setTerm(e.target.value)}
                    placeholder="Term"
                    disabled={loading}
                    className="w-full px-3 py-2 bg-slate-700 text-white rounded"
                />
                <div className="flex gap-4">
                    <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        disabled={loading}
                        className="flex-1 px-3 py-2 bg-slate-700 text-white rounded"
                    />
                    <input
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        disabled={loading}
                        className="flex-1 px-3 py-2 bg-slate-700 text-white rounded"
                    />
                </div>
                <input
                    type="number"
                    min="1"
                    value={totalDays}
                    onChange={e => setTotalDays(e.target.value)}
                    placeholder="Total Days"
                    disabled={loading}
                    className="w-full px-3 py-2 bg-slate-700 text-white rounded"
                />

                <label className="inline-flex items-center space-x-2 text-white">
                    <input
                        type="checkbox"
                        checked={active}
                        onChange={e => setActive(e.target.checked)}
                        disabled={loading}
                        className="form-checkbox"
                    />
                    <span>Active</span>
                </label>

                <div className="flex gap-2">
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex items-center px-4 py-2 bg-red-600 rounded text-white disabled:opacity-50"
                    >
                        {loading && <FiLoader className="animate-spin mr-2" />}
                        {editingId ? "Update Period" : "Create Period"}
                    </button>
                    {editingId && (
                        <button
                            type="button"
                            onClick={clearForm}
                            className="px-4 py-2 bg-gray-600 rounded text-white"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </form>

            <ul className="text-white space-y-2">
                {periods.map(p => (
                    <li
                        key={p._id}
                        className={`flex items-center justify-between p-2 rounded ${p.active ? "bg-red-700" : "bg-slate-800"
                            }`}
                    >
                        <div>
                            <strong>{p.name}</strong> ({p.term})<br />
                            {p.startDate.slice(0, 10)} → {p.endDate.slice(0, 10)} · {p.totalDays} days
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => startEdit(p)}
                                className="p-1 hover:bg-slate-700 rounded"
                                title="Edit"
                            >
                                <FiEdit2 className="text-gray-300" />
                            </button>
                            <button
                                onClick={() => handleDelete(p._id)}
                                className="p-1 hover:bg-slate-700 rounded"
                                title="Delete"
                            >
                                <FiTrash2 className="text-gray-300" />
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
