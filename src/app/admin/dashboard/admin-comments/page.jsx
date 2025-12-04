"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

/**
 * AdminCommentsPage (fixed)
 * - Avoids nested <button> by using an accessible div for the accordion header
 * - Keeps per-student Save + Save All (class) buttons
 * - High-contrast subject performance chart preserved
 */

function getBand(scoreOutOf50) {
  if (scoreOutOf50 == null) return "—";
  const s = Number(scoreOutOf50);
  if (s >= 45) return "A — Excellent";
  if (s >= 40) return "B — Very Good";
  if (s >= 35) return "C — Good";
  if (s >= 30) return "D — Fair";
  if (s >= 0) return "E — Weak";
  return "—";
}

function BandPill({ score }) {
  const label = getBand(score);
  const colour = label.startsWith("A")
    ? "bg-green-600 text-white"
    : label.startsWith("B")
    ? "bg-emerald-500 text-white"
    : label.startsWith("C")
    ? "bg-yellow-500 text-black"
    : label.startsWith("D")
    ? "bg-orange-500 text-black"
    : label.startsWith("E")
    ? "bg-red-600 text-white"
    : "bg-slate-700 text-slate-200";

  return (
    <span className={`inline-block text-xs px-2 py-1 rounded ${colour}`}>
      {label}
    </span>
  );
}

function genderColors(gender) {
  if (!gender)
    return { start: "from-slate-800", end: "to-slate-700", bar: "#64748b" };
  const g = String(gender).toLowerCase();
  if (g === "male")
    return { start: "from-sky-800", end: "to-cyan-700", bar: "#06b6d4" };
  if (g === "female")
    return { start: "from-pink-700", end: "to-violet-600", bar: "#db2777" };
  return { start: "from-slate-800", end: "to-slate-700", bar: "#64748b" };
}

export default function AdminCommentsPage() {
  const [classes, setClasses] = useState([]);
  const [openClass, setOpenClass] = useState(null);
  const [loadingClasses, setLoadingClasses] = useState(false);

  // dataMap[classId] = { rows: [...], classInfo: {...} }
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
      const sRes = await fetch(
        `/api/admin/admin-comments/students?classId=${encodeURIComponent(
          classId
        )}`
      );
      if (!sRes.ok) throw new Error("Failed to fetch students");
      const sJson = await sRes.json();
      const students = Array.isArray(sJson.students) ? sJson.students : sJson;

      const rows = students.map((st) => ({
        studentId: String(st._id),
        name: st.name ?? "—",
        gender: st.gender ?? "—",
        comment: st.adminCommentText ?? "",
        _commentId: st.adminCommentId ?? null,
        marksBySubject: st.marksBySubject ?? [],
        overallOutOf50: st.overallOutOf50 ?? null,
        subjectComments: st.subjectComments ?? [],
      }));

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

  // accessible header key handler
  function handleHeaderKey(e, cls, data) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const next = openClass === cls._id ? null : cls._id;
      setOpenClass(next);
      if (!data && next) fetchClassData(cls._id);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-slate-700">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-900 via-slate-900 to-slate-800 opacity-70" />
        <div className="relative p-6">
          <h1 className="text-2xl font-bold text-white">Admin Comments</h1>
          <p className="text-slate-200 mt-1 max-w-2xl">
            Use the subject breakdown below to write focused admin comments.
            Charts are coloured by student gender for fast scanning.
          </p>
        </div>
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
              {/* Accordion header: use an accessible div instead of button to avoid nested buttons */}
              <div
                role="button"
                tabIndex={0}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-700 transition cursor-pointer"
                onClick={() => {
                  const next = isOpen ? null : cls._id;
                  setOpenClass(next);
                  if (!data && next) fetchClassData(cls._id);
                }}
                onKeyDown={(e) => handleHeaderKey(e, cls, data)}
                aria-expanded={isOpen}
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

                <div className="flex items-center gap-3">
                  {/* Visible Save All at header too (shows only when class open) */}
                  {isOpen && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        saveClassComments(cls._id);
                      }}
                      disabled={Boolean(saving)}
                      className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-white text-sm shadow"
                    >
                      {saving ? "Saving…" : "Save All"}
                    </button>
                  )}
                  <div className="text-sm text-slate-300">
                    {isOpen ? "Collapse" : "Open"}
                  </div>
                </div>
              </div>

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
                      {/* Top action row */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-slate-300">
                          Editing comments for{" "}
                          <span className="font-medium text-white">
                            {cls.grade}-{cls.section}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
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
                            className="px-3 py-1 bg-slate-700 rounded text-slate-200 text-sm"
                          >
                            Reset
                          </button>

                          <button
                            onClick={() => saveClassComments(cls._id)}
                            disabled={saving}
                            className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-white text-sm shadow"
                          >
                            {saving
                              ? "Saving…"
                              : `Save All (${completedCount}/${total})`}
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-3">
                        {data.rows.map((row, idx) => {
                          const theme = genderColors(row.gender);
                          return (
                            <div
                              key={row.studentId}
                              className="bg-slate-900/40 p-3 rounded-lg border border-slate-700"
                            >
                              <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="text-white font-semibold text-lg truncate">
                                      {row.name}
                                    </div>
                                    <div className="text-slate-400 text-sm">
                                      ID: {row.studentId} • Gender:{" "}
                                      <span className="font-medium text-white">
                                        {row.gender}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    <div className="text-sm text-slate-300">
                                      Overall (out of 50)
                                    </div>
                                    <div className="text-2xl font-bold text-white">
                                      {row.overallOutOf50 ?? "—"}
                                    </div>
                                  </div>
                                </div>

                                {/* Decorative, higher-contrast chart on top */}
                                <div
                                  className={`mt-2 p-3 rounded-lg border border-slate-700 bg-gradient-to-r ${theme.start} ${theme.end} bg-opacity-5`}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="text-sm text-slate-200 font-medium">
                                      Subject performance (out of 50)
                                    </div>
                                    <div className="text-xs text-slate-300">
                                      Gender:{" "}
                                      <span className="font-semibold">
                                        {row.gender}
                                      </span>
                                    </div>
                                  </div>

                                  <div style={{ height: 180 }}>
                                    {row.marksBySubject &&
                                    row.marksBySubject.length ? (
                                      <ResponsiveContainer
                                        width="100%"
                                        height="100%"
                                      >
                                        <BarChart
                                          data={row.marksBySubject.map((m) => ({
                                            name: m.subject,
                                            value:
                                              m.outOf50 ??
                                              Math.round(
                                                ((m.avgPercentage ?? 0) / 100) *
                                                  50
                                              ),
                                          }))}
                                          margin={{
                                            top: 10,
                                            right: 12,
                                            left: 0,
                                            bottom: 40,
                                          }}
                                        >
                                          <CartesianGrid
                                            stroke="#1f2937"
                                            strokeDasharray="4 4"
                                          />
                                          <XAxis
                                            dataKey="name"
                                            tick={{
                                              fontSize: 12,
                                              fill: "#cbd5e1",
                                            }}
                                            interval={0}
                                            angle={-35}
                                            textAnchor="end"
                                            height={60}
                                          />
                                          <YAxis
                                            domain={[0, 50]}
                                            tick={{ fill: "#cbd5e1" }}
                                          />
                                          <Tooltip
                                            wrapperStyle={{
                                              backgroundColor: "#0b1220",
                                              borderRadius: 6,
                                              border: "1px solid #233044",
                                            }}
                                            contentStyle={{ color: "#e6eef8" }}
                                          />
                                          <Bar
                                            dataKey="value"
                                            barSize={22}
                                            radius={[6, 6, 0, 0]}
                                          >
                                            {row.marksBySubject.map((m, i) => (
                                              <Cell
                                                key={`cell-${i}`}
                                                fill={theme.bar}
                                                stroke="#0b1220"
                                                strokeWidth={1}
                                              />
                                            ))}
                                          </Bar>
                                        </BarChart>
                                      </ResponsiveContainer>
                                    ) : (
                                      <div className="text-slate-400 h-full flex items-center justify-center">
                                        No marks to chart
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Subject-by-subject table */}
                                <div className="mt-3 overflow-x-auto">
                                  <table className="w-full text-sm table-auto border-collapse rounded-lg overflow-hidden">
                                    <thead>
                                      <tr className="bg-slate-800 text-slate-300">
                                        <th className="text-left px-3 py-2">
                                          Subject
                                        </th>
                                        <th className="text-left px-3 py-2">
                                          Mark (out of 50)
                                        </th>
                                        <th className="text-left px-3 py-2">
                                          Class subject average
                                        </th>
                                        <th className="text-left px-3 py-2">
                                          Band
                                        </th>
                                        <th className="text-left px-3 py-2">
                                          Teacher's comment
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {row.marksBySubject &&
                                      row.marksBySubject.length ? (
                                        row.marksBySubject.map((m, i) => {
                                          const tCommentObj = (
                                            row.subjectComments || []
                                          ).find(
                                            (sc) =>
                                              (sc.subject ||
                                                sc.subjectName ||
                                                "General") ===
                                              (m.subject ||
                                                m.subjectName ||
                                                m.subjectLabel)
                                          );
                                          const tComment = tCommentObj
                                            ? tCommentObj.text
                                            : m.subjectTeacherComment || "";
                                          const classAvg =
                                            m.classAverage ?? null;

                                          return (
                                            <tr
                                              key={`${row.studentId}-${
                                                m.subject || i
                                              }`}
                                              className="border-t border-slate-800 hover:bg-slate-900"
                                            >
                                              <td className="px-3 py-3 align-top w-56">
                                                <div className="font-medium text-white truncate">
                                                  {m.subject ||
                                                    m.subjectLabel ||
                                                    "General"}
                                                </div>
                                              </td>
                                              <td className="px-3 py-3 align-top">
                                                <div className="text-white font-semibold">
                                                  {m.outOf50 ??
                                                    Math.round(
                                                      (m.avgPercentage ?? 0) / 2
                                                    )}
                                                </div>
                                                <div className="text-slate-400 text-xs mt-1">
                                                  Avg:{" "}
                                                  {m.avgPercentage
                                                    ? `${m.avgPercentage.toFixed(
                                                        1
                                                      )}%`
                                                    : "—"}
                                                </div>
                                              </td>
                                              <td className="px-3 py-3 align-top">
                                                <div className="text-white">
                                                  {typeof classAvg === "number"
                                                    ? classAvg
                                                    : "—"}
                                                </div>
                                                <div className="text-slate-400 text-xs">
                                                  {typeof classAvg === "number"
                                                    ? "out of 50"
                                                    : ""}
                                                </div>
                                              </td>
                                              <td className="px-3 py-3 align-top">
                                                <BandPill
                                                  score={
                                                    m.outOf50 ??
                                                    Math.round(
                                                      ((m.avgPercentage ?? 0) /
                                                        100) *
                                                        50
                                                    )
                                                  }
                                                />
                                              </td>
                                              <td className="px-3 py-3 align-top max-w-xl">
                                                <div className="text-slate-200 text-sm">
                                                  {tComment || "—"}
                                                </div>
                                                {m.components &&
                                                m.components.length ? (
                                                  <div className="mt-2 text-xs text-slate-400">
                                                    {m.components.map(
                                                      (c, ci) => (
                                                        <div
                                                          key={ci}
                                                          className="flex items-center gap-2"
                                                        >
                                                          <div className="w-28 truncate">
                                                            {c.paper ??
                                                              c.component ??
                                                              `Comp ${ci + 1}`}
                                                          </div>
                                                          <div className="font-medium">
                                                            {c.value50}
                                                          </div>
                                                          <div className="text-slate-500">
                                                            (
                                                            {c.percentage
                                                              ?.toFixed
                                                              ? c.percentage.toFixed(
                                                                  1
                                                                ) + "%"
                                                              : c.percentage ||
                                                                ""}
                                                            )
                                                          </div>
                                                        </div>
                                                      )
                                                    )}
                                                  </div>
                                                ) : null}
                                              </td>
                                            </tr>
                                          );
                                        })
                                      ) : (
                                        <tr>
                                          <td
                                            colSpan={5}
                                            className="px-3 py-6 text-center text-slate-500"
                                          >
                                            No marks available for this student
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>

                                {/* admin comment input + per-student actions */}
                                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
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
                                    className="w-full md:flex-1 mt-4 p-3 bg-slate-800 border border-slate-700 rounded text-white placeholder-slate-400 min-h-[100px]"
                                  />

                                  {/* per-student action column: Save (single) + Save All (class) */}
                                  <div className="flex-shrink-0 md:ml-4 md:w-44 flex flex-col items-stretch gap-2 mt-2 md:mt-0">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        saveSingleComment(cls._id, idx);
                                      }}
                                      disabled={Boolean(
                                        savingSingle[row.studentId]
                                      )}
                                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-white shadow w-full"
                                    >
                                      {savingSingle[row.studentId]
                                        ? "Saving…"
                                        : "Save"}
                                    </button>

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        saveClassComments(cls._id);
                                      }}
                                      disabled={Boolean(saving)}
                                      className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-white shadow w-full"
                                    >
                                      {saving ? "Saving…" : "Save All (class)"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* bottom actions (duplicate of top for convenience) */}
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
