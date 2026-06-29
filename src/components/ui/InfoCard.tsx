import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/** Icon + heading + body card. Body is flexible (text, links, etc.). */
export function InfoCard({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 rounded-brand border border-line bg-white p-6 shadow-brand-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-brand">
      <span className="grad-red grid h-12 w-12 flex-none place-items-center rounded-xl text-white">
        <Icon name={icon} size={22} />
      </span>
      <div className="min-w-0">
        <h3 className="mb-1 text-[1.05rem]">{title}</h3>
        <div className="text-[0.92rem] leading-relaxed text-muted [&_a]:font-semibold [&_a]:text-red [&_a:hover]:underline">
          {children}
        </div>
      </div>
    </div>
  );
}
