"use client";

import { useEffect, useState } from "react";

/**
 * AdminCommentsPage
 * - Uses unique API paths under /api/admin/admin-comments/*
 * - Lists classes as accordions. Open a class -> loads students + any existing admin comments.
 * - Edit per-student comment, Save per student or Save All for class (batch upsert).
 */

export default function AdminCommentsPage() {
  const [classes, setClasses] = useState([]);
  const [openClass, setOpenClass] = useState(null);
  const [loadingClasses, setLoadingClasses] = useState(false);

  // dataMap[classId] = { rows: [{ studentId, name, comment, _commentId? }], classInfo: {...} }
  const [dataMap, setDataMap] = useState({});
  const [loadingMap, setLoadingMap] = useState({}); // per-class loading
  const [savingMap, setSavingMap] = useState({}); // per-class saving
  const [savingSingle, setSavingSingle] = useState({}); // per-student saving

  useEffect(() => {
    (async () => {
      setLoadingClasses(true);
      try {
        const res = await fetch("/api/admin/admin-comments/classes");
        if (!res.ok) throw new Error("Failed to load classes");
        const json = await res.json();
        const list = Array.isArray(json.classes) ? json.classes : json;
        setClasses(list);
      } catch (err) {
        console.error(err);
        alert("Failed to load classes");
      } finally {
        setLoadingClasses(false);
      }
    })();
  }, []);

  async function fetchClassData(classId) {
    if (dataMap[classId]) return; // already loaded
    setLoadingMap((m) => ({ ...m, [classId]: true }));
    try {
      // 1) students for class
      const sRes = await fetch(
        `/api/admin/admin-comments/students?classId=${encodeURIComponent(
          classId
        )}`
      );
      if (!sRes.ok) throw new Error("Failed to fetch students");
      const sJson = await sRes.json();
      const students = Array.isArray(sJson.students) ? sJson.students : sJson;

      // 2) comments for these students (type=admin)
      const studentIds = students.map((s) => String(s._id)).filter(Boolean);
      let comments = [];
      if (studentIds.length) {
        const q = encodeURIComponent(studentIds.join(","));
        const cRes = await fetch(
          `/api/admin/admin-comments/comments?studentIds=${q}&type=admin`
        );
        if (cRes.ok) {
          const cJson = await cRes.json();
          comments = Array.isArray(cJson.comments) ? cJson.comments : cJson;
        }
      }

      // map comments by studentId
      const commentByStudent = comments.reduce((acc, c) => {
        acc[String(c.studentId)] = c;
        return acc;
      }, {});

      const rows = students.map((st) => {
        const sid = String(st._id);
        const existing = commentByStudent[sid];
        return {
          studentId: sid,
          name: st.name ?? "—",
          comment: existing?.text ?? "",
          _commentId: existing?._id ?? null,
        };
      });

      const classInfo = {
        studentCount: students.length,
        grade: students[0]?.grade ?? null,
        section: students[0]?.section ?? null,
      };
      setDataMap((m) => ({ ...m, [classId]: { rows, classInfo } }));
    } catch (err) {
      console.error("fetchClassData:", err);
      alert("Failed to load class data");
    } finally {
      setLoadingMap((m) => ({ ...m, [classId]: false }));
    }
  }

  function updateCommentLocal(classId, idx, value) {
    setDataMap((m) => {
      const copy = { ...(m[classId] || { rows: [] }) };
      copy.rows = (copy.rows || []).slice();
      copy.rows[idx] = { ...copy.rows[idx], comment: value };
      return { ...m, [classId]: copy };
    });
  }

  async function saveClassComments(classId) {
    const obj = dataMap[classId];
    if (!obj) return;
    const rows = obj.rows.map((r) => ({
      studentId: r.studentId,
      text: r.comment ?? "",
      type: "admin",
      _commentId: r._commentId ?? undefined,
    }));

    setSavingMap((s) => ({ ...s, [classId]: true }));
    try {
      const res = await fetch("/api/admin/admin-comments/comments/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, rows }),
      });
      if (!res.ok) throw new Error("Save failed");
      const json = await res.json();
      // Merge returned updated records (if any)
      if (json.updated && Array.isArray(json.updated)) {
        const map = Object.fromEntries(
          json.updated.map((u) => [String(u.studentId), u])
        );
        setDataMap((m) => {
          const copy = { ...(m[classId] || { rows: [] }) };
          copy.rows = (copy.rows || []).map((r) => {
            const u = map[r.studentId];
            if (!u) return r;
            return {
              ...r,
              _commentId: u._id ?? r._commentId,
              comment: u.text ?? r.comment,
            };
          });
          return { ...m, [classId]: copy };
        });
      }
      alert("Saved admin comments for class");
    } catch (err) {
      console.error("saveClassComments:", err);
      alert("Failed to save comments");
    } finally {
      setSavingMap((s) => ({ ...s, [classId]: false }));
    }
  }

  async function saveSingleComment(classId, idx) {
    const row = dataMap[classId]?.rows?.[idx];
    if (!row) return;
    setSavingSingle((s) => ({ ...s, [row.studentId]: true }));
    try {
      const res = await fetch("/api/admin/admin-comments/comments/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          rows: [
            {
              studentId: row.studentId,
              text: row.comment ?? "",
              type: "admin",
              _commentId: row._commentId ?? undefined,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      const json = await res.json();
      if (json.updated && Array.isArray(json.updated) && json.updated.length) {
        const u = json.updated[0];
        setDataMap((m) => {
          const copy = { ...(m[classId] || { rows: [] }) };
          copy.rows = (copy.rows || []).slice();
          copy.rows[idx] = {
            ...copy.rows[idx],
            _commentId: u._id ?? copy.rows[idx]._commentId,
            comment: u.text ?? copy.rows[idx].comment,
          };
          return { ...m, [classId]: copy };
        });
      }
      alert("Saved comment");
    } catch (err) {
      console.error("saveSingleComment:", err);
      alert("Failed to save comment");
    } finally {
      setSavingSingle((s) => ({ ...s, [row.studentId]: false }));
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h1 className="text-2xl font-bold text-white">Admin Comments</h1>
        <p className="text-slate-400 mt-1">
          Enter admin comments for students, grouped by class.
        </p>
      </div>

      {loadingClasses ? (
        <div className="text-center text-slate-300">Loading classes…</div>
      ) : classes.length === 0 ? (
        <div className="bg-slate-800 p-6 rounded-xl text-center text-slate-300">
          No classes found.
        </div>
      ) : (
        classes.map((cls) => {
          const isOpen = openClass === cls._id;
          const data = dataMap[cls._id];
          const loading = loadingMap[cls._id];
          const saving = savingMap[cls._id];

          const completedCount = data
            ? data.rows.filter((r) => r.comment && r.comment.trim()).length
            : 0;
          const total = data ? data.rows.length : cls.studentCount ?? 0;

          return (
            <div
              key={cls._id}
              className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden"
            >
              <button
                className="w-full flex items-center justify-between p-4 hover:bg-slate-700 transition"
                onClick={() => {
                  const next = isOpen ? null : cls._id;
                  setOpenClass(next);
                  if (!data && next) fetchClassData(cls._id);
                }}
              >
                <div className="text-left">
                  <div className="text-lg font-semibold text-white">
                    {cls.grade}-{cls.section}
                  </div>
                  <div className="text-sm text-slate-400 mt-1">
                    {cls.studentCount ?? total} students • Completed:{" "}
                    {completedCount}/{total}
                  </div>
                </div>

                <div className="text-sm text-slate-300">
                  {isOpen ? "Collapse" : "Open"}
                </div>
              </button>

              {isOpen && (
                <div className="p-4 border-t border-slate-700 space-y-4">
                  {loading ? (
                    <div className="text-slate-300">
                      Loading students & comments…
                    </div>
                  ) : !data || !data.rows.length ? (
                    <div className="text-slate-400">
                      No students found for this class.
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3">
                        {data.rows.map((row, idx) => (
                          <div
                            key={row.studentId}
                            className="bg-slate-900/40 p-3 rounded-lg border border-slate-700 flex flex-col md:flex-row md:items-start md:justify-between gap-3"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-white font-medium truncate">
                                    {row.name}
                                  </div>
                                  <div className="text-slate-400 text-sm">
                                    ID: {row.studentId}
                                  </div>
                                </div>
                                <div className="hidden md:block ml-4">
                                  <div
                                    className={`text-xs font-semibold px-2 py-1 rounded ${
                                      row.comment && row.comment.trim()
                                        ? "bg-green-600 text-white"
                                        : "bg-slate-700 text-slate-200"
                                    }`}
                                  >
                                    {row.comment && row.comment.trim()
                                      ? "Has comment"
                                      : "No comment"}
                                  </div>
                                </div>
                              </div>

                              <textarea
                                value={row.comment}
                                onChange={(e) =>
                                  updateCommentLocal(
                                    cls._id,
                                    idx,
                                    e.target.value
                                  )
                                }
                                placeholder="Enter admin comment..."
                                className="w-full mt-3 p-3 bg-slate-800 border border-slate-700 rounded text-white placeholder-slate-400 min-h-[80px]"
                              />
                            </div>

                            <div className="flex flex-col gap-2 w-full md:w-auto">
                              <button
                                onClick={() => saveSingleComment(cls._id, idx)}
                                disabled={Boolean(savingSingle[row.studentId])}
                                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-white shadow"
                              >
                                {savingSingle[row.studentId]
                                  ? "Saving…"
                                  : "Save"}
                              </button>

                              <div className="text-sm text-slate-400 md:hidden">
                                {row.comment && row.comment.trim()
                                  ? "Has comment"
                                  : "No comment"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => {
                            if (!data) return;
                            if (
                              !confirm(
                                "Discard local edits and reload from server?"
                              )
                            )
                              return;
                            setDataMap((m) => {
                              const copy = { ...m };
                              delete copy[cls._id];
                              return copy;
                            });
                            fetchClassData(cls._id);
                          }}
                          className="px-4 py-2 bg-slate-700 rounded text-slate-200"
                        >
                          Reset
                        </button>

                        <button
                          onClick={() => saveClassComments(cls._id)}
                          disabled={saving}
                          className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-white shadow"
                        >
                          {saving
                            ? "Saving…"
                            : `Save All (${completedCount}/${total})`}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
