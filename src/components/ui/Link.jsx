/**
 * بديل خفيف لـ <Link> بتاع react-router-dom — المشروع ده بيتنقل بـ
 * window.location.search (?page=...) مش React Router، فبدل ما نضيف مكتبة
 * جديدة، اللينك هنا بينده على window.__navigate(to) اللي main.jsx بيعرفها.
 */
export default function Link({ to, children, className, onClick, ...rest }) {
  function handleClick(e) {
    e.preventDefault();
    onClick?.(e);
    window.__navigate?.(to);
  }
  return (
    <a href={to} className={className} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
