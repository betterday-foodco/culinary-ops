// Corporate portal layout — completely separate from culinary dashboard.
// No sidebar, no kitchen nav. Full-page, mobile-first layout.
export default function CorporateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ fontFamily: "'DM Sans', sans-serif", background: '#faebda' }}>
      {children}
    </div>
  );
}
