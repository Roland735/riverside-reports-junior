"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  FiUsers,
  FiUser,
  FiCalendar,
  FiClipboard,
  FiTrendingUp,
} from "react-icons/fi";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/dashboard/admin")
      .then((res) => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
      })
      .then((data) => setStats(data))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-red-500">Error: {error}</p>;
  if (!stats) return <p className="text-white">Loading...</p>;

  // Prepare data for the bar chart
  const chartData = [
    { name: "Teachers", value: stats.teacherCount },
    { name: "Students", value: stats.studentCount },
    { name: "Periods", value: stats.periodCount },
    { name: "Allocations", value: stats.allocationCount },
  ];

  const cards = [
    {
      label: "Teachers",
      value: stats.teacherCount,
      icon: <FiUser size={24} className="text-red-400" />,
      bg: "bg-red-600",
    },
    {
      label: "Students",
      value: stats.studentCount,
      icon: <FiUsers size={24} className="text-red-400" />,
      bg: "bg-blue-600",
    },
    {
      label: "Periods",
      value: stats.periodCount,
      icon: <FiCalendar size={24} className="text-red-400" />,
      bg: "bg-green-600",
    },
    {
      label: "Allocations",
      value: stats.allocationCount,
      icon: <FiClipboard size={24} className="text-red-400" />,
      bg: "bg-purple-600",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map(({ label, value, icon, bg }) => (
          <div
            key={label}
            className={`${bg} p-4 rounded-lg flex items-center space-x-4 shadow-lg`}
          >
            <div className="p-2 bg-white/20 rounded-full">{icon}</div>
            <div>
              <h3 className="text-sm text-white opacity-80">{label}</h3>
              <p className="text-2xl font-bold text-white">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart overview */}
      <div className="p-6 bg-slate-800 rounded-lg shadow-lg text-white">
        <div className="flex items-center mb-4">
          <FiTrendingUp className="mr-2 text-red-400" size={20} />
          <h2 className="text-lg font-semibold">Overview</h2>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
            <XAxis dataKey="name" stroke="#ccc" />
            <YAxis stroke="#ccc" />
            <Tooltip
              contentStyle={{ backgroundColor: "#1e293b", border: "none" }}
              itemStyle={{ color: "#fff" }}
            />
            <Bar
              dataKey="value"
              fill="oklch(50.5% 0.213 27.518)"
              barSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
