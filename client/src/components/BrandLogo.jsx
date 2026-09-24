const LOGO_SRC = '/brand-assets/people_logo.svg';

export default function BrandLogo({ className = '' }) {
  return <img src={LOGO_SRC} alt="People" className={className} />;
}
