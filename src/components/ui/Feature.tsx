import { Icon, type IconName } from "./Icon";

/** Inline icon/number + heading + text. Used for why-us, values and steps. */
export function Feature({
  icon,
  number,
  title,
  description,
}: {
  icon?: IconName;
  number?: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="grid h-14 w-14 flex-none place-items-center rounded-2xl bg-cream-2 text-xl font-bold text-red">
        {number != null ? number : icon ? <Icon name={icon} size={24} /> : null}
      </span>
      <div>
        <h3 className="mb-1 text-[1.12rem]">{title}</h3>
        <p className="text-[0.93rem] text-muted">{description}</p>
      </div>
    </div>
  );
}
