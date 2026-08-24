"use client";

import { usePathname } from "next/navigation";
import { waHref } from "@/lib/whatsapp";

/**
 * Pages that own the bottom of the phone screen. Both checkouts pin a pay bar
 * there, and the float landed on top of it — so the bars each reserved 84px of
 * their own width to dodge it, which left 58px for the total and truncated a
 * real fare to "Rs 1,23...". A chat button is not worth a mangled price on the
 * screen where someone is about to pay, so it stands down instead.
 */
const NO_FLOAT = ["/checkout", "/hotels/checkout"];

/** Floating WhatsApp contact button (keeps WhatsApp's official green). */
export function WhatsAppFloat() {
  const pathname = usePathname();
  const href = waHref();
  if (NO_FLOAT.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
    return null;
  // Nothing to float to while the mobile is not on WhatsApp.
  if (!href) return null;
  return (
    /* z-30, not z-40: the search bar's own stacking context is z-40 so its
       destination, date and traveller popovers open ABOVE this button rather
       than behind it. Everything modal — the nav drawer, the filter sheet —
       is z-50 and still wins. */
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-[calc(1.5rem+env(safe-area-inset-right))] z-30 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-[0_14px_34px_rgba(37,211,102,0.45)] transition-transform duration-300 hover:scale-110"
    >
      <svg viewBox="0 0 24 24" width={28} height={28} fill="currentColor" aria-hidden>
        <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12 2a10 10 0 0 0-8.6 15.06L2 22l5.07-1.33A10 10 0 1 0 12 2z" />
      </svg>
    </a>
  );
}
