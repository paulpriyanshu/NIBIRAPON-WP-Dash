import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex bg-[#f0f2f5] dark:bg-[#0b141a] overflow-hidden">
      <Sidebar />
      {/* top padding on mobile for the fixed header; bottom padding for the tab bar */}
      <main className="flex-1 flex flex-col overflow-hidden pt-14 pb-14 md:pt-0 md:pb-0">
        {children}
      </main>
    </div>
  );
}
