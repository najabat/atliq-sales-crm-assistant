"use client";
import { usePathname } from "next/navigation";

// The top menu. The screen you are on is marked for sight with an underline and for screen readers with aria-current.
export default function NavMenu({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  const isCurrent = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  return (
    <nav aria-label="Main menu">
      <ul>
        {items.map((m) => (
          <li key={m.href}>
            <a href={m.href} aria-current={isCurrent(m.href) ? "page" : undefined} className={isCurrent(m.href) ? "current" : undefined}>{m.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
