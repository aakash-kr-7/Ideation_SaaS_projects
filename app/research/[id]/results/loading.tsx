export default function Loading() {
  return <main className="report-loading sf-report-skeleton" aria-label="Loading research report" aria-busy="true">
    <section className="skeleton hero-skeleton"><i/><b/><span/><span/></section>
    <div className="skeleton nav-skeleton">{Array.from({ length: 7 }, (_, index) => <i key={index}/>)}</div>
    <div className="sf-skeleton-layout">
      <aside className="skeleton sidebar-skeleton"><i/><b/>{Array.from({ length: 5 }, (_, index) => <span key={index}/>)}</aside>
      <section className="skeleton card-skeleton"><i/><b/><span/><span/><span/></section>
    </div>
  </main>;
}
