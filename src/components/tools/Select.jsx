import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * One choice from a few, as a menu.
 *
 * These tools keep growing rows of chips — four indents, three output
 * formats, three ways to compare an array — and a row of chips says "these
 * are all available" when what is true is "pick exactly one of these". A
 * menu says the second thing, shows the current answer when it is closed,
 * and gives the row back its space.
 *
 * It is a listbox rather than a native <select> because a native one is
 * painted by the operating system and cannot be made to match a dark
 * interface. That means the keyboard contract has to be written out by
 * hand, so it is: arrows move, Home and End jump, Enter and Space choose,
 * Escape closes and hands focus back, Tab closes and moves on.
 */
export const Select = ({ label, value, options, onChange, align = "left", width }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const buttonRef = useRef(null);
  const id = useId();

  const index = Math.max(0, options.findIndex((option) => option.id === value));
  const current = options[index] || options[0];

  const show = () => {
    setActive(index);
    setOpen(true);
  };

  const close = ({ focusTrigger = true } = {}) => {
    setOpen(false);
    if (focusTrigger) buttonRef.current?.focus();
  };

  const choose = (option) => {
    onChange(option.id);
    close();
  };

  // The list takes focus when it opens, so the arrow keys land somewhere.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  // …and is nudged back on screen when the side it opened towards has no
  // room. Which side that is depends on where the row happened to wrap, so
  // it is measured rather than assumed.
  useEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;
    list.style.transform = "";
    const box = list.getBoundingClientRect();
    const edge = 10;
    let shift = 0;
    if (box.left < edge) shift = edge - box.left;
    else if (box.right > window.innerWidth - edge) shift = window.innerWidth - edge - box.right;
    if (shift) list.style.transform = `translateX(${Math.round(shift)}px)`;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onListKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(options[active]);
      return;
    }
    const move = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (move) {
      e.preventDefault();
      setActive((at) => (at + move + options.length) % options.length);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    }
    if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    }
  };

  return (
    <span className="tl-select" ref={wrapRef}>
      {label && (
        <span className="tl-select-label" id={`${id}-label`}>
          {label}
        </span>
      )}
      <button
        ref={buttonRef}
        type="button"
        className={`tl-select-btn${open ? " is-open" : ""}`}
        style={width ? { minWidth: width } : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={label ? `${id}-label ${id}-btn` : undefined}
        id={`${id}-btn`}
        onClick={() => (open ? close({ focusTrigger: false }) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className="tl-select-value">{current?.label}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={label ? `${id}-label` : undefined}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onListKey}
          onBlur={(e) => {
            if (!wrapRef.current?.contains(e.relatedTarget)) setOpen(false);
          }}
          className={`tl-select-list is-${align}`}
        >
          {options.map((option, at) => (
            <li
              key={option.id}
              id={`${id}-opt-${at}`}
              role="option"
              aria-selected={option.id === current?.id}
              className={at === active ? "is-active" : ""}
              onMouseEnter={() => setActive(at)}
              onClick={() => choose(option)}
            >
              <span className="tl-select-tick" aria-hidden="true">
                {option.id === current?.id && <Check size={12} />}
              </span>
              <span>
                {option.label}
                {option.hint && <em>{option.hint}</em>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
};

export default Select;
