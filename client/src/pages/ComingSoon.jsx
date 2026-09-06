import Layout from '../components/Layout';

const SKELETON_ROWS = [
  ['65%', '40%', '30%', '20%'],
  ['45%', '55%', '35%', '25%'],
  ['70%', '35%', '40%', '20%'],
  ['50%', '45%', '30%', '25%'],
  ['60%', '38%', '32%', '22%'],
];

export default function ComingSoon({ title, icon: Icon, description }) {
  return (
    <Layout title={title}>
      <div className="page-header">
        <h2>{title}</h2>
        <span className="coming-soon-badge">Coming soon</span>
      </div>

      <div className="coming-soon-preview">
        <div className="skeleton-table" aria-hidden="true">
          <div className="skeleton-row skeleton-row-head">
            {SKELETON_ROWS[0].map((_, i) => (
              <span key={i} className="skeleton-bar" style={{ width: '60%' }} />
            ))}
          </div>
          {SKELETON_ROWS.map((cols, r) => (
            <div className="skeleton-row" key={r}>
              {cols.map((w, i) => (
                <span key={i} className="skeleton-bar" style={{ width: w }} />
              ))}
            </div>
          ))}
        </div>

        <div className="coming-soon-overlay">
          <span className="coming-soon-icon">
            <Icon size={28} />
          </span>
          <h3>{title} is on the way</h3>
          <p>
            {description ||
              `We're building out ${title} next. Once it's ready, your real data will show up right here.`}
          </p>
        </div>
      </div>
    </Layout>
  );
}
