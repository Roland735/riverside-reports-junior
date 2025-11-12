"use client";

import { useState } from "react";
import axios from "axios";

export default function StudentUploadPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
    setMessage("");
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await axios.post("/api/students/upload", formData);
      setMessage(res.data.message);
      setSelectedFile(null);
    } catch (err) {
      setMessage(err.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    window.location.href = "/api/students/template";
  };

  return (
    <div className="max-w-xl mx-auto mt-12 p-6 bg-slate-800 rounded shadow-lg text-white">
      <h1 className="text-2xl font-semibold mb-4">Upload Student Data</h1>

      <div className="mb-4">
        <button
          onClick={handleDownloadTemplate}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
        >
          Download Excel Template
        </button>
      </div>

      <div className="mb-4">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="block w-full text-white bg-slate-700 rounded border border-slate-600 px-4 py-2"
        />
      </div>

      <button
        disabled={uploading || !selectedFile}
        onClick={handleUpload}
        className="w-full py-2 bg-green-600 hover:bg-green-700 rounded disabled:opacity-50"
      >
        {uploading ? "Uploading..." : "Upload"}
      </button>

      {message && (
        <div className="mt-4 text-center text-sm text-green-400">{message}</div>
      )}
    </div>
  );
}
