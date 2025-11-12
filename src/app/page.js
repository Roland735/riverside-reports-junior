// /src/app/page.jsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Redirect as soon as possible
    router.replace("/login");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100 t">
      <p className="text-gray-700 text-lg">Please wait a moment…</p>
    </div>
  );
}
