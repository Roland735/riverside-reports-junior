"use client";

import { useEffect, useState } from "react";

export default function TeacherDashboard() {
  const [subjects, setSubjects] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/dashboard/teacher")
      .then((res) => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
      })
      .then((data) => setSubjects(data.subjects))
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return <p className="text-red-500">Error: {error}</p>;
  }
  if (!subjects.length) {
    return <p className="text-white">No subjects assigned yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {subjects.map((s, i) => (
        <li
          key={i}
          className="p-3 bg-slate-800 rounded text-white flex justify-between"
        >
          <span>{s.subject}</span>
          <span className="font-mono">{s.paper}</span>
        </li>
      ))}
    </ul>
  );
}
