import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';

export const metadata = { title: 'Admin Dashboard' };

export default async function AdminLayout({ children }) {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
        redirect('/login?error=AccessDenied');
    }

    const links = [
        { href: '/admin/dashboard', label: 'Dashboard', iconName: 'FiHome' },
        { href: '/admin/dashboard/upload', label: 'Bulk Teachers', iconName: 'FiUserPlus' },
        { href: '/admin/dashboard/students/upload', label: 'Bulk Students', iconName: 'FiUsers' },
        { href: '/admin/dashboard/subjects', label: 'Create Subjects', iconName: 'FiUsers' },
        { href: '/admin/dashboard/assign', label: 'Assign', iconName: 'FiUsers' },
        { href: '/admin/dashboard/exam-periods', label: 'Exam Periods', iconName: 'FiCalendar' },
        { href: '/admin/dashboard/admin-comments', label: 'Admin Comment', iconName: 'FiBookOpen' },
        // { href: '/admin/overview', label: 'Marks Overview', iconName: 'FiClipboard' },
        { href: '/admin/dashboard/reports', label: 'Report Preview', iconName: 'FiFileText' },
        { href: '/admin/dashboard/reports/anomaly', label: 'Analysis', iconName: 'FiFileText' },
        { href: '/admin/dashboard/schema', label: 'Download Schema', iconName: 'FiFileText' },
        // { href: '/admin/progress', label: 'Progress Tracker', iconName: 'FiCalendar' },
    ];

    return (
        <DashboardLayout title="Admin" links={links}>
            {children}
        </DashboardLayout>
    );
}
