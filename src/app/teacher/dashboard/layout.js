import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';

export const metadata = { title: 'Teacher Dashboard' };

export default async function TeacherLayout({ children }) {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['teacher', 'classteacher'].includes(session.user.role)) {
        redirect('/login?error=AccessDenied');
    }

    const links = [
        { href: '/teacher/dashboard', label: 'Dashboard', iconName: 'FiHome' },
        { href: '/teacher/dashboard/marks', label: 'Enter Marks', iconName: 'FiBookOpen' },
        { href: '/teacher/dashboard/subject-comments', label: 'Subject Comments', iconName: 'FiClipboard' },
        { href: '/teacher/dashboard/class-comments', label: 'Class Comment', iconName: 'FiFileText' },
        // { href: '/teacher/dashboard/class-characteristics', label: 'Character Grading', iconName: 'FiFileText' },
    ];

    return (
        <DashboardLayout title="Teacher" links={links}>
            {children}
        </DashboardLayout>
    );
}
