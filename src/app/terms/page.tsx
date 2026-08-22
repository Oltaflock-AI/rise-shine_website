import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/sections/LegalPage";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "The terms on which Rise & Shine Co sells flights, hotels and travel arrangements, and the terms governing your use of this website.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      crumb="Terms & Conditions"
      title="Terms & Conditions"
      lastUpdated="22-08-2026 17:10:00"
      photoId="photo-1450101499163-c8848c66ca85"
    >
      <p>
        These Terms &amp; Conditions, together with our{" "}
        <Link href="/refund-policy">Cancellation &amp; Refund Policy</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link> (together, the
        &ldquo;Terms&rdquo;), are a binding agreement between{" "}
        <strong>{site.legalName}</strong>, trading as Rise &amp; Shine Travels
        (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;), and you. They
        govern your use of {site.url} and every booking or travel arrangement we
        make for you.
      </p>
      <p>
        By using this website, making an enquiry, or paying for a booking, you
        confirm that you have read and accepted these Terms &mdash; on your own
        behalf and on behalf of every traveller in your booking.
      </p>

      <h2>Who we are</h2>
      <p>
        {site.legalName}, GSTIN {site.gstin}, {site.address.full}. Contact:{" "}
        <a href={`mailto:${site.email}`}>{site.email}</a>,{" "}
        <a href={site.phone.mobileHref}>{site.phone.mobileDisplay}</a>,{" "}
        <a href={site.phone.landlineHref}>{site.phone.landlineDisplay}</a>.
        Working hours: {site.hours}.
      </p>

      <h2>We are an agent, not the airline or the hotel</h2>
      <p>
        We book travel on your behalf with airlines, hotels, cruise lines, ground
        operators and other suppliers. We are not the carrier, the hotelier or the
        operator, and we do not own or control the services you travel on.
      </p>
      <ul>
        <li>
          Each supplier&rsquo;s own conditions of carriage, fare rules, house
          rules and cancellation policy apply to your booking in addition to
          these Terms, and <strong>those conditions prevail</strong> over
          anything on this site where the two differ.
        </li>
        <li>
          Our responsibility is to make the booking you asked for, accurately and
          on the terms shown to you, and to support you through changes and
          cancellations. The delivery of the flight or the stay itself is the
          supplier&rsquo;s.
        </li>
        <li>
          Availability, timings, aircraft, room type, inclusions and hotel
          facilities are the supplier&rsquo;s to change. We pass on such changes
          as soon as we are told of them.
        </li>
      </ul>

      <h2>Using this website and your account</h2>
      <ul>
        <li>
          You must be at least 18 and legally able to enter into a contract to
          make a booking. If you book for others, you confirm you are authorised
          to accept these Terms for them.
        </li>
        <li>
          The details you give us must be true, accurate and complete. You are
          responsible for everything done through your account, and for keeping
          your password confidential.
        </li>
        <li>
          You may not use this site for anything unlawful, scrape or copy its
          content, attempt to interfere with it or with our suppliers&rsquo;
          systems, or make speculative, false or fraudulent bookings.
        </li>
        <li>
          The design, text, code and compilation of content on this site are
          ours. Airline, hotel and destination content belongs to its owners and
          is reproduced with the supplier&rsquo;s data. Nothing here transfers any
          intellectual-property right to you.
        </li>
      </ul>

      <h2>Prices, taxes and our service fee</h2>
      <ul>
        <li>
          All prices are in Indian Rupees and shown exactly as calculated, to two
          decimal places, with no hidden rounding.
        </li>
        <li>
          <b>Our service fee is included in the fare we quote you</b>, not added
          at the end. The total shown before payment is the total you pay.
        </li>
        <li>
          Fares and room rates are live supplier prices and are{" "}
          <strong>not held for you until payment is confirmed</strong>. A price
          can change or sell out between search and payment; we re-check it with
          the supplier at checkout and show you the confirmed price before you
          pay.
        </li>
        <li>
          Taxes, statutory fees and surcharges are the supplier&rsquo;s and the
          government&rsquo;s, and can change up to the moment of ticketing. Where
          a supplier raises a charge after booking and it is legitimately payable,
          we will tell you and you may pay it or cancel under the applicable
          cancellation rules.
        </li>
        <li>
          Where a fare requires GST details, the booking form asks for your GSTIN
          and registered name. A GSTIN cannot be added to a ticket once it has
          been issued, so tell us before you pay if you need an input credit.
        </li>
        <li>
          Obvious pricing errors &mdash; a fare or rate that is clearly wrong
          because of a technical or supplier data fault &mdash; do not create a
          binding contract. Where one occurs we will tell you promptly and either
          honour the correct price with your consent or cancel and refund you in
          full.
        </li>
      </ul>

      <h2>Booking a flight</h2>
      <ul>
        <li>
          <b>Names must match the ID you will travel on.</b> Enter each
          passenger&rsquo;s name exactly as it appears on their passport or
          government photo ID. Airlines treat a name correction as a change or a
          cancellation, and the cost of one is yours.
        </li>
        <li>
          Some fares and routes require a PAN, passport details or a GSTIN before
          the airline will issue the ticket. Where the form asks for them, the
          ticket cannot be issued without them.
        </li>
        <li>
          <b>A booking is confirmed only when we send you a confirmation
          carrying the airline PNR / ticket number.</b> A payment receipt, an
          on-screen message or a pending status is not a ticket.
        </li>
        <li>
          Baggage allowance, seat and meal entitlements and fare conditions are
          the airline&rsquo;s and are shown to you from the airline&rsquo;s own
          data before you pay. Where an itinerary has several legs, the allowance
          we show is the most restrictive one.
        </li>
        <li>
          Check-in times, boarding cut-offs and document requirements are the
          airline&rsquo;s. Reconfirm your flight timing with the airline before
          departure &mdash; schedules change.
        </li>
      </ul>

      <h2>Booking a hotel</h2>
      <ul>
        <li>
          The rate is re-checked with the supplier at checkout; the price, board
          basis and cancellation policy confirmed at that point are the ones that
          apply.
        </li>
        <li>
          Guest nationality is collected because rates and eligibility depend on
          it, and it must match the guests who will actually stay.
        </li>
        <li>
          Every guest must present valid photo ID at check-in, and hotels may
          refuse check-in without it. Hotel house rules &mdash; check-in and
          check-out times, age and local-ID restrictions, deposits, resort fees
          and city taxes payable at the property &mdash; are the hotel&rsquo;s and
          are payable by you.
        </li>
        <li>
          Special requests (bed type, floor, early check-in, adjoining rooms) are
          passed on but never guaranteed.
        </li>
        <li>
          After a booking is confirmed, the supplier&rsquo;s systems can take a
          short while to settle. Your voucher reflects the supplier&rsquo;s
          confirmed record.
        </li>
      </ul>

      <h2>Payments</h2>
      <ul>
        <li>
          Payments are collected through our payment gateway&rsquo;s own hosted
          checkout. <b>We never see or store your card, UPI or netbanking
          credentials.</b>
        </li>
        <li>
          A payment is treated as received only when our servers independently
          confirm it with the gateway. A message in your browser is not, by
          itself, proof of payment either way.
        </li>
        <li>
          If your payment is debited but you do not receive a confirmation,{" "}
          <strong>do not pay again</strong> &mdash; contact us first. Duplicate
          payments are refunded in full.
        </li>
        <li>
          If we take payment and the booking cannot be issued, we refund it
          automatically and in full. See the{" "}
          <Link href="/refund-policy">Cancellation &amp; Refund Policy</Link>.
        </li>
        <li>
          We may cancel a booking, before or after issue, where a payment is
          reversed, disputed or found to be fraudulent, or where the booking
          breaches these Terms or a supplier&rsquo;s rules.
        </li>
      </ul>

      <h2>Changes, cancellations and refunds</h2>
      <p>
        Cancellations, date changes and refunds are governed by the airline&rsquo;s
        fare rules or the hotel rate&rsquo;s cancellation policy shown to you
        before you pay, and by our{" "}
        <Link href="/refund-policy">Cancellation &amp; Refund Policy</Link>, which
        forms part of these Terms. In short: we cannot refund more than the
        supplier releases, refunds go back to the original payment method, and our
        service fee is not refundable once a booking has been issued.
      </p>

      <h2>Passports, visas, health and entry rules</h2>
      <ul>
        <li>
          Valid travel documents are <strong>your responsibility</strong> &mdash;
          passport validity (commonly six months beyond travel), visas, transit
          visas, OCI/PIO cards, permits, insurance and any health or vaccination
          requirement at your destination and at every transit point.
        </li>
        <li>
          Any information we give about visas or entry rules is guidance offered
          in good faith. Requirements change without notice and only the relevant
          embassy, airline and immigration authority can confirm them.
        </li>
        <li>
          Visa decisions are made by the authorities of the destination country
          alone. A refusal, or a denial of boarding or entry for want of
          documents, is not a failure of our service and is not refundable by us.
        </li>
        <li>
          We strongly recommend travel insurance covering cancellation, medical
          costs, baggage and delays.
        </li>
      </ul>

      <h2>Delays, disruption and matters outside our control</h2>
      <ul>
        <li>
          Schedule changes, delays, cancellations, diversions, overbooking,
          denied boarding, downgrades, lost baggage and hotel relocation are
          matters for the operating airline or hotel. Your remedy for these lies
          against them, under their conditions and applicable law. We will help
          you pursue it, at no charge.
        </li>
        <li>
          Neither party is liable for a failure caused by an event beyond its
          reasonable control &mdash; weather, natural disaster, war, civil unrest,
          strikes, epidemics, government or regulatory action, airspace or airport
          closure, or failure of a supplier&rsquo;s or a payment or communication
          system.
        </li>
        <li>
          Where such an event forces a cancellation, we refund whatever the
          suppliers release to us, less charges they retain. We are not able to
          refund amounts the suppliers keep.
        </li>
      </ul>

      <h2>Content from third parties</h2>
      <p>
        Fare rules, baggage allowances, hotel descriptions, photographs, ratings,
        maps and reviews on this site come from airlines, hotels, our booking
        suppliers and other third parties, and are reproduced as supplied. We take
        care in presenting them but do not warrant that they are complete or
        error-free. Links to third-party websites are for convenience; their terms
        and privacy policies, not ours, apply once you leave this site.
      </p>

      <h2>Communications</h2>
      <p>
        By giving us your phone number or email address you agree that we may
        contact you about your enquiry or booking by call, SMS, WhatsApp or email
        &mdash; including where you request a callback, by an automated voice
        assistant, in which case the call may be recorded and transcribed. This
        consent covers service and transactional messages even if your number is
        registered on a Do Not Disturb list. You can opt out of promotional
        messages at any time by writing to us; we will still send messages that
        are essential to a booking. See our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Limitation of liability</h2>
      <ul>
        <li>
          Nothing in these Terms excludes any liability that cannot lawfully be
          excluded, including for fraud, or for death or personal injury caused by
          our negligence.
        </li>
        <li>
          Subject to that, our total liability arising out of a booking is limited
          to the amount you paid us for that booking, and{" "}
          <strong>
            we are not liable for indirect or consequential loss
          </strong>{" "}
          &mdash; missed connections on separately booked tickets, loss of
          enjoyment, loss of profit, or costs incurred because of a
          supplier&rsquo;s delay or cancellation.
        </li>
        <li>
          We do not guarantee that this website will be uninterrupted or
          error-free, and we are not liable for a booking that could not be made
          because of a technical or supplier outage.
        </li>
      </ul>

      <h2>Indemnity</h2>
      <p>
        You agree to indemnify us against claims, losses and reasonable costs
        arising from information you gave us that was wrong or incomplete, from a
        traveller&rsquo;s failure to hold the required documents, or from your
        breach of these Terms or of a supplier&rsquo;s conditions.
      </p>

      <h2>Complaints</h2>
      <p>
        Tell us as soon as a problem arises &mdash; while you are travelling if at
        all possible, since most issues can only be fixed at the time and most
        suppliers will not consider a claim raised later. Write to{" "}
        <a href={`mailto:${site.email}`}>{site.email}</a> or call{" "}
        <a href={site.phone.mobileHref}>{site.phone.mobileDisplay}</a>. We
        acknowledge complaints within <strong>2 working days</strong>. If you are
        not satisfied with the response, mark your email{" "}
        <b>&ldquo;Grievance&rdquo;</b> and it will be reviewed by the
        agency&rsquo;s management, or write to us at {site.address.full}.
      </p>

      <h2>Governing law and jurisdiction</h2>
      <p>
        These Terms and any dispute arising out of them are governed by the laws
        of India, and the courts at Ahmedabad, Gujarat have exclusive
        jurisdiction.
      </p>

      <h2>Changes to these Terms and general</h2>
      <p>
        We may revise these Terms at any time; the revised version takes effect
        when posted here and the &ldquo;last updated&rdquo; date changes. The
        version in force when you made a booking is the one that applies to that
        booking. If any clause is held unenforceable, the rest continues to apply.
        Our not enforcing a term on one occasion does not waive it.
      </p>
    </LegalPage>
  );
}
