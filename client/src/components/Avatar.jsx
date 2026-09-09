// Shows an employee's uploaded photo, or falls back to their initial in a
// colored circle (same look as the header avatar) when they have no photo.
export default function Avatar({ id, name, hasPhoto, size = 32 }) {
  if (hasPhoto && id) {
    return (
      <img
        src={`/api/employees/${id}/photo`}
        alt={name || 'Employee photo'}
        className="avatar-photo"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      />
    );
  }
  return (
    <span className="avatar-circle" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {name?.[0]?.toUpperCase() || '?'}
    </span>
  );
}
