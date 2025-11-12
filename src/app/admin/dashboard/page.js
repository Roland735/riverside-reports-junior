// app/admin/dashboard/page.js

import AdminDashboard from '@/components/AdminDashboard';

export default function AdminDashboardPage() {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl text-white">Welcome to Admin Dashboard</h1>
            <AdminDashboard />
        </div>
    );
}
