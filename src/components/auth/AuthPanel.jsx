import { Link } from "react-router-dom";
import BrandMark from "../BrandMark";

/**
 * The form side of the account pages: a light panel with the card in the
 * middle, the other account action as a pill in the corner, and — on
 * phones, where the brand panel is hidden — the brand above the card.
 */
const AuthPanel = ({ alternate, children, footer }) => (
  <section className="auth-side">
    <div className="auth-side-head">
      <Link to="/" className="auth-side-brand">
        <BrandMark size={22} />
        Vizroute
      </Link>
      {alternate && (
        <Link to={alternate.to} className="auth-pill">{alternate.label}</Link>
      )}
    </div>
    <div className="auth-side-body">
      <div className="auth-card">
        <div className="auth-card-brand">
          <BrandMark size={22} />
          Vizroute
        </div>
        {children}
        {footer && <div className="auth-foot">{footer}</div>}
      </div>
    </div>
  </section>
);

export default AuthPanel;
