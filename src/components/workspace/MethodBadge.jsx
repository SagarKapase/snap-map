import { methodColor, METHOD_SHORT } from "../../utils/constants";

const SIZES = {
  xs: "text-[10px] px-1.5 py-[3px] min-w-[38px]",
  sm: "text-[10px] px-2 py-[3px] min-w-[44px]",
  md: "text-xs px-2.5 py-1 min-w-[52px]",
  lg: "text-xs px-3 py-1.5 min-w-[56px]",
};

const MethodBadge = ({ method = "GET", size = "sm", short = true, className = "" }) => {
  const mc = methodColor(method);
  const label = short ? METHOD_SHORT[method] || method : method;

  return (
    <span
      className={`inline-flex items-center justify-center rounded-md font-bold tracking-wide uppercase ${SIZES[size]} ${mc.bg} ${mc.text} ${className}`}
    >
      {label}
    </span>
  );
};

export default MethodBadge;
