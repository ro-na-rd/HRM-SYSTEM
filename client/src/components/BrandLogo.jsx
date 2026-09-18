const LOGO_SRC = '/brand-assets/iiN_People_logo.png';

export default function BrandLogo({ className = '' }) {
  return <img src={LOGO_SRC} alt="People" className={className} />;
}
