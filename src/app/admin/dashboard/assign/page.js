"use client";
import { useState, useEffect } from "react";
import { FiLoader, FiEdit2, FiTrash2 } from "react-icons/fi";

export default function AssignPage() {
    const [classes, setClasses] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [allocs, setAllocs] = useState([]);

    // ── CLASS–TEACHER form & edit ──
    const [selClassCT, setSelClassCT] = useState(null);
    const [selTeacherCT, setSelTeacherCT] = useState(null);
    const [loadingCT, setLoadingCT] = useState(false);
    const [editingCTClassId, setEditingCTClassId] = useState(null);

    // ── SUBJECT–TEACHER form, edit & delete ──
    const [selClassSA, setSelClassSA] = useState(null);
    const [selSubject, setSelSubject] = useState(null);
    const [paper, setPaper] = useState("");
    const [selTeacherSA, setSelTeacherSA] = useState(null);
    const [loadingSA, setLoadingSA] = useState(false);
    const [dupError, setDupError] = useState("");
    const [editingSAId, setEditingSAId] = useState(null);

    // fetch & bootstrap
    const initAndFetch = async () => {
        await fetch("/api/classes/init", { method: "POST" });
        const [cRes, tRes, sRes, aRes] = await Promise.all([
            fetch("/api/classes"),
            fetch("/api/users?role=teacher"),
            fetch("/api/subjects"),
            fetch("/api/allocations"),
        ]);
        const [{ classes }, { users }, { subjects }, { allocations }] =
            await Promise.all([cRes.json(), tRes.json(), sRes.json(), aRes.json()]);

        setClasses(classes);
        setTeachers(users);
        setSubjects(subjects);
        setAllocs(allocations);
    };

    useEffect(() => {
        initAndFetch();
    }, []);

    // ── CLASS–TEACHER: create/update ──
    const handleCT = async e => {
        e.preventDefault();
        if (!selClassCT || !selTeacherCT) return;
        setLoadingCT(true);

        await fetch("/api/classes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ classId: selClassCT, classTeacherId: selTeacherCT }),
        });

        // reset
        setSelClassCT(null);
        setSelTeacherCT(null);
        setEditingCTClassId(null);

        await initAndFetch();
        setLoadingCT(false);
    };

    const startEditCT = c => {
        setEditingCTClassId(c._id);
        setSelClassCT(c._id);
        setSelTeacherCT(c.classTeacherId?._id || null);
    };

    const cancelEditCT = () => {
        setEditingCTClassId(null);
        setSelClassCT(null);
        setSelTeacherCT(null);
    };

    // ── SUBJECT–TEACHER: create/update/delete ──
    useEffect(() => setDupError(""), [selClassSA, selSubject, paper]);

    const handleSA = async e => {
        e.preventDefault();
        setDupError("");

        if (!editingSAId) {
            const exists = allocs.some(a =>
                a.classId._id === selClassSA &&
                a.subject === selSubject &&
                String(a.paper) === paper.trim()
            );
            if (exists) {
                setDupError("⚠️ Already allocated for this class, subject & paper.");
                return;
            }
        }

        if (!selClassSA || !selSubject || !paper.trim() || !selTeacherSA) return;
        setLoadingSA(true);

        const payload = { subject: selSubject, paper: Number(paper), teacherId: selTeacherSA };

        if (editingSAId) {
            await fetch(`/api/allocations/${editingSAId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
        } else {
            await fetch("/api/allocations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ classId: selClassSA, ...payload }),
            });
        }

        // reset
        setEditingSAId(null);
        setSelClassSA(null);
        setSelSubject(null);
        setPaper("");
        setSelTeacherSA(null);

        await initAndFetch();
        setLoadingSA(false);
    };

    const startEditSA = a => {
        setEditingSAId(a._id);
        setSelClassSA(a.classId._id);
        setSelSubject(a.subject);
        setPaper(String(a.paper));
        setSelTeacherSA(a.teacherId._id);
    };

    const cancelEditSA = () => {
        setEditingSAId(null);
        setSelClassSA(null);
        setSelSubject(null);
        setPaper("");
        setSelTeacherSA(null);
    };

    const handleDeleteSA = async id => {
        if (!confirm("Delete this allocation?")) return;
        await fetch(`/api/allocations/${id}`, { method: "DELETE" });
        await initAndFetch();
    };

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-12">
            {/* ── Assign Class Teacher ── */}
            <section className="space-y-4">
                <h2 className="text-xl text-white">
                    {editingCTClassId ? "Edit Class Teacher" : "Assign Class Teacher"}
                </h2>
                <form onSubmit={handleCT} className="space-y-4">
                    <div>
                        <p className="text-sm text-gray-300 mb-1">Select Class:</p>
                        <div className="grid grid-cols-3 gap-2 max-h-40 overflow-auto">
                            {classes.map(c => (
                                <button
                                    key={c._id}
                                    type="button"
                                    onClick={() => setSelClassCT(c._id)}
                                    className={`px-2 py-1 rounded text-sm ${selClassCT === c._id
                                        ? "bg-red-600 text-white"
                                        : "bg-slate-600 text-gray-200"
                                        }`}
                                    disabled={loadingCT}
                                >
                                    {c.grade}-{c.section}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="text-sm text-gray-300 mb-1">Select Teacher:</p>
                        <div className="grid grid-cols-3 gap-2 max-h-40 overflow-auto">
                            {teachers.map(t => (
                                <button
                                    key={t._id}
                                    type="button"
                                    onClick={() => setSelTeacherCT(t._id)}
                                    className={`px-2 py-1 text-sm rounded ${selTeacherCT === t._id
                                        ? "bg-red-600 text-white"
                                        : "bg-slate-600 text-gray-200"
                                        }`}
                                    disabled={loadingCT}
                                >
                                    {t.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-x-2">
                        <button
                            type="submit"
                            disabled={loadingCT}
                            className="flex items-center px-4 py-2 bg-red-600 rounded text-white disabled:opacity-50"
                        >
                            {loadingCT && <FiLoader className="animate-spin mr-2" />}
                            {editingCTClassId ? "Update Class Teacher" : "Assign Class Teacher"}
                        </button>
                        {editingCTClassId && (
                            <button
                                type="button"
                                onClick={cancelEditCT}
                                className="px-4 py-2 bg-gray-600 rounded text-white"
                            >
                                Cancel
                            </button>
                        )}
                    </div>

                </form>

                <ul className="text-white space-y-1">
                    {classes.map(c => (
                        <li key={c._id} className="flex justify-between">
                            <span>
                                {c.grade}-{c.section} ➔ {c.classTeacherId?.name || "-- no teacher --"}
                            </span>
                            <button
                                onClick={() => startEditCT(c)}
                                className="p-1 hover:bg-slate-700 rounded"
                                title="Edit"
                            >
                                <FiEdit2 className="text-gray-300" />
                            </button>
                        </li>
                    ))}
                </ul>
            </section>

            {/* ── Assign Subject Teacher ── */}
            <section className="space-y-4">
                <h2 className="text-xl text-white">
                    {editingSAId ? "Edit Allocation" : "Assign Subject Teacher"}
                </h2>
                <form onSubmit={handleSA} className="space-y-4">
                    <div>
                        <p className="text-sm text-gray-300 mb-1">Select Class:</p>
                        <div className="grid grid-cols-3 gap-2 max-h-40 overflow-auto">
                            {classes.map(c => (
                                <button
                                    key={c._id}
                                    type="button"
                                    onClick={() => setSelClassSA(c._id)}
                                    className={`px-2 py-1 rounded text-sm ${selClassSA === c._id
                                        ? "bg-red-600 text-white"
                                        : "bg-slate-600 text-gray-200"
                                        }`}
                                    disabled={loadingSA}
                                >
                                    {c.grade}-{c.section}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="text-sm text-gray-300 mb-1">Select Subject:</p>
                        <div className="grid grid-cols-3 gap-2 max-h-40 overflow-auto">
                            {subjects.map(s => (
                                <button
                                    key={s._id}
                                    type="button"
                                    onClick={() => setSelSubject(s.name)}
                                    className={`px-2 py-1 rounded text-sm ${selSubject === s.name
                                        ? "bg-red-600 text-white"
                                        : "bg-slate-600 text-gray-200"
                                        }`}
                                    disabled={loadingSA}
                                >
                                    {s.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <input
                        type="number"
                        min="1"
                        value={paper}
                        onChange={e => setPaper(e.target.value)}
                        placeholder="Paper (e.g. 1)"
                        disabled={loadingSA}
                        className="w-full px-3 py-2 bg-slate-700 rounded text-white"
                    />

                    <div>
                        <p className="text-sm text-gray-300 mb-1">Select Teacher:</p>
                        <div className="grid grid-cols-3 gap-2 max-h-40 overflow-auto">
                            {teachers.map(t => (
                                <button
                                    key={t._id}
                                    type="button"
                                    onClick={() => setSelTeacherSA(t._id)}
                                    className={`px-2 py-1 text-sm rounded ${selTeacherSA === t._id
                                        ? "bg-red-600 text-white"
                                        : "bg-slate-600 text-gray-200"
                                        }`}
                                    disabled={loadingSA}
                                >
                                    {t.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {dupError && <p className="text-yellow-300">{dupError}</p>}

                    <div className="space-x-2">
                        <button
                            type="submit"
                            disabled={loadingSA}
                            className="flex items-center px-4 py-2 bg-red-600 rounded text-white disabled:opacity-50"
                        >
                            {loadingSA && <FiLoader className="animate-spin mr-2" />}
                            {editingSAId ? "Update Allocation" : "Assign Subject Teacher"}
                        </button>
                        {editingSAId && (
                            <button
                                type="button"
                                onClick={cancelEditSA}
                                className="px-4 py-2 bg-gray-600 rounded text-white"
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </form>

                <ul className="text-white space-y-2">
                    {allocs.map(a => (
                        <li
                            key={a._id}
                            className="flex items-center justify-between bg-slate-800 p-2 rounded"
                        >
                            <div>
                                <strong>
                                    {a.classId.grade}-{a.classId.section}
                                </strong>{" "}
                                • {a.subject} Paper {a.paper} ➔ {a.teacherId.name}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => startEditSA(a)}
                                    className="p-1 hover:bg-slate-700 rounded"
                                    title="Edit"
                                >
                                    <FiEdit2 />
                                </button>
                                <button
                                    onClick={() => handleDeleteSA(a._id)}
                                    className="p-1 hover:bg-slate-700 rounded"
                                    title="Delete"
                                >
                                    <FiTrash2 />
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
