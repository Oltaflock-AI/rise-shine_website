import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Icon, type IconName } from "./Icon";

/** Service tile — fills with brand red on hover. */
export function ServiceCard({
  icon,
  title,
  description,
  href = "/services",
}: {
  icon: IconName;
  title: string;
  description: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative isolate flex h-full flex-col overflow-hidden rounded-brand border border-line bg-white p-8 transition-all duration-300 hover:-translate-y-2 hover:border-transparent hover:shadow-brand"
    >
      <span
        className="grad-red absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden
      />
      <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-cream-2 text-red transition-colors duration-300 group-hover:bg-white/20 group-hover:text-white">
        <Icon name={icon} size={26} />
      </span>
      <h3 className="mb-1.5 text-[1.2rem] transition-colors duration-300 group-hover:text-white">
        {title}
      </h3>
      <p className="text-[0.92rem] text-muted transition-colors duration-300 group-hover:text-white/90">
        {description}
      </p>
      <span className="mt-3.5 inline-flex items-center gap-1.5 text-[0.85rem] font-semibold text-red opacity-0 transition-all duration-300 group-hover:text-white group-hover:opacity-100">
        Learn more
        <ArrowRight size={15} strokeWidth={2.2} aria-hidden />
      </span>
    </Link>
  );
}
