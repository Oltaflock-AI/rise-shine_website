// Single icon set (Lucide-style, 1.7 stroke) used across the dashboard.
type P = { className?: string };
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const IconOverview = (p: P) => (
  <svg {...base} {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
);
export const IconPhone = (p: P) => (
  <svg {...base} {...p}><path d="M5 4.5c0 8.3 5.2 13.5 13.5 13.5l1.4-3.2-3.8-1.6-1.6 1.6a10.5 10.5 0 0 1-4.8-4.8l1.6-1.6L9.7 4.6 5 4.5Z" /></svg>
);
export const IconUsers = (p: P) => (
  <svg {...base} {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-3-4.9" /></svg>
);
export const IconPlane = (p: P) => (
  <svg {...base} {...p}><path d="M10.5 13.5 3 11l1-2 6 .8 4-5.3a2 2 0 0 1 3.2 2.3L13.8 12l.7 6-2 1-2-5.5Z" /></svg>
);
export const IconCalendar = (p: P) => (
  <svg {...base} {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></svg>
);
export const IconCheck = (p: P) => (
  <svg {...base} {...p}><path d="M5 12.5l4 4L19 6.5" /></svg>
);
export const IconStar = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={p.className}><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.3l6.5-.9L12 2.5Z" /></svg>
);
export const IconChevron = (p: P) => (
  <svg {...base} {...p}><path d="M6 9l6 6 6-6" /></svg>
);
export const IconArrowLeft = (p: P) => (
  <svg {...base} {...p}><path d="M15 5l-7 7 7 7M8 12h12" /></svg>
);
export const IconClock = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></svg>
);
export const IconSun = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="14" r="4" /><path d="M12 3v2M4.5 7.5l1 1M19.5 7.5l-1 1M3 14h2M19 14h2M3 19h18" /></svg>
);
export const IconTrash = (p: P) => (
  <svg {...base} {...p}><path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13M10.5 10v6M13.5 10v6" /></svg>
);
export const IconInfo = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.6" /></svg>
);
