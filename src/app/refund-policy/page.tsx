import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/sections/LegalPage";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Cancellation & Refund Policy",
  description:
    "How cancellations and refunds work for flights, hotels and travel arranged by Rise & Shine Co — what is deducted, how long a refund takes, and how to raise one.",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      crumb="Cancellation & Refund Policy"
      title="Cancellation & Refund Policy"
      lastUpdated="22-08-2026 17:10:00"
      photoId="photo-1436491865332-7a61a109cc05"
    >
      <p>
        This policy explains how cancellations and refunds work for travel
        booked with {site.legalName} (&ldquo;Rise &amp; Shine Travels&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;) &mdash; flights and hotels booked on
        this website, and tours, cruises, visa assistance and other services we
        arrange for you offline. It forms part of our{" "}
        <Link href="/terms">Terms &amp; Conditions</Link>.
      </p>
      <p>
        We are a travel agent. We book on your behalf with airlines, hotels and
        travel suppliers, so{" "}
        <strong>
          what you get back is governed first by the airline&rsquo;s fare rules
          or the hotel rate&rsquo;s cancellation policy
        </strong>{" "}
        &mdash; both of which are shown to you on this website before you pay.
        We cannot refund more than the supplier releases to us.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>
          The airline&rsquo;s fare rules or the hotel rate&rsquo;s cancellation
          policy decide what is refundable. Non-refundable means non-refundable.
        </li>
        <li>
          If we take your money and the booking does not get confirmed, you are{" "}
          <strong>refunded in full, automatically</strong>. That is the one case
          where nothing at all is deducted.
        </li>
        <li>
          Every refund is paid back to the same payment method you paid from. We
          cannot pay a refund to a different card, account or person.
        </li>
        <li>
          Our service fee is included in the fare we quote you and is not
          refundable once a ticket or booking has been issued.
        </li>
        <li>
          Once we release a refund it usually reaches your bank in{" "}
          <strong>5&ndash;7 working days</strong>. Where an airline or hotel has
          to release the money to us first, that step takes longer &mdash; see
          the timelines below.
        </li>
      </ul>

      <h2>Flights</h2>
      <p>
        Air tickets are sold on the airline&rsquo;s terms. Before you pay, the
        flight you selected shows whether the fare is refundable or
        non-refundable, the airline&rsquo;s cancellation and date-change
        penalties, and the airline&rsquo;s full fare rules. Those are the
        conditions you are buying.
      </p>
      <ul>
        <li>
          <b>How to cancel.</b> Air tickets cannot be cancelled from your
          account. Write to{" "}
          <a href={`mailto:${site.email}`}>{site.email}</a> or call{" "}
          <a href={site.phone.mobileHref}>{site.phone.mobileDisplay}</a> with
          your booking reference and PNR, and we will cancel with the airline.
          Send the request{" "}
          <strong>well before departure and within our working hours</strong>{" "}
          ({site.hours}) &mdash; a request that reaches us after the flight has
          departed is a no-show, and a no-show is normally worth nothing back.
        </li>
        <li>
          <b>What is deducted.</b> The airline&rsquo;s cancellation charge for
          that fare, any statutory charge the airline applies, our service fee,
          and taxes on those charges where applicable. The balance is your
          refund. On a date change you pay the airline&rsquo;s change fee{" "}
          <em>plus</em> any difference in fare, and our service fee is charged
          again on the new booking.
        </li>
        <li>
          <b>Non-refundable fares.</b> Nothing comes back from the fare itself.
          Some airlines will still release certain statutory taxes and user
          development fees on cancellation; where they do, we pass that on. Where
          they do not, there is no refund.
        </li>
        <li>
          <b>If the airline cancels or reschedules.</b> We pass on the full
          amount the airline releases, without deducting a cancellation charge.
          If the airline only offers a credit shell, voucher or rebooking rather
          than money back, that is what we can pass on, and we will tell you
          plainly which one it is.
        </li>
        <li>
          <b>Timeline.</b> Airlines refund to us first. Once we file the
          cancellation, airlines commonly take{" "}
          <strong>15&ndash;45 days</strong> to release the amount, and longer for
          international and low-cost carriers. We pass it on to you within{" "}
          <strong>5 working days</strong> of receiving it, and it then takes
          5&ndash;7 working days to appear in your account.
        </li>
      </ul>

      <h2>Hotels</h2>
      <p>
        Every room rate on this site is labelled refundable or non-refundable,
        and a refundable rate shows the cancellation deadline and the charge that
        applies after it &mdash; both taken from the hotel&rsquo;s own policy at
        the moment you book.
      </p>
      <ul>
        <li>
          <b>How to cancel.</b> Sign in and cancel the booking from{" "}
          <Link href="/account">your account</Link>, or contact us and we will do
          it for you. Cancelling raises a request with the hotel; the booking is
          cancelled when the hotel confirms it, and we will confirm that to you.
        </li>
        <li>
          <b>What is deducted.</b> Exactly what that rate&rsquo;s cancellation
          policy states, plus our service fee. Cancel before the deadline shown
          and the hotel&rsquo;s charge is usually nil; cancel after it, and the
          charge can be one night or the whole stay.
        </li>
        <li>
          <b>Non-refundable rates and no-shows.</b> Nothing is refundable, at any
          point, including if you do not arrive or leave early. This is the
          trade-off for the lower price on those rates.
        </li>
        <li>
          <b>Deadlines are in UTC.</b> The cancellation deadline we show is the
          supplier&rsquo;s, in UTC, not local time at the hotel. If you are close
          to it, cancel early rather than exactly on time.
        </li>
        <li>
          <b>Timeline.</b> Once the hotel confirms the cancellation and releases
          the amount, we refund within <strong>5 working days</strong>, and it
          reaches your account in 5&ndash;7 working days after that.
        </li>
        <li>
          <b>Problems at the hotel.</b> If the hotel cannot honour a confirmed
          booking, tell us the same day. We will get you an alternative or a
          refund of what the supplier releases &mdash; but a complaint raised
          after check-out is very difficult to recover anything on.
        </li>
      </ul>

      <h2>If you paid and the booking did not go through</h2>
      <ul>
        <li>
          <b>Payment taken, ticket or booking not issued.</b> We refund it in
          full, automatically, without you asking, and email you the refund
          reference. If that automatic refund fails for any reason, our team is
          alerted and settles it manually. You are never left paying for a
          booking you did not get.
        </li>
        <li>
          <b>Payment failed or you closed the payment window.</b> That money
          never reaches us. Your bank reverses it on its own, usually within
          5&ndash;7 working days. Do not pay again for the same trip until you
          have checked with us &mdash; contact us and we will confirm whether
          anything was captured.
        </li>
        <li>
          <b>Charged twice.</b> Send us both payment references. Duplicate
          payments are refunded in full, in the same way.
        </li>
        <li>
          <b>Payment succeeded but you did not receive a confirmation.</b> Do not
          assume it failed. Contact us with the payment reference &mdash; we can
          check the booking directly with the airline or hotel before anything is
          cancelled or rebooked.
        </li>
      </ul>

      <h2>Tour packages, cruises, visas and other arranged travel</h2>
      <p>
        Packages, group tours, cruises, car rentals, insurance and visa
        assistance are quoted and confirmed individually, not bought online here.
        The cancellation terms for those are set out in the quotation or invoice
        we send you, and they are what apply.
      </p>
      <ul>
        <li>
          Booking deposits are normally non-refundable, because hotels, cruise
          lines and ground operators charge us the moment a booking is confirmed.
        </li>
        <li>
          Cancellation charges usually increase the closer you get to departure,
          and are commonly 100% inside the final weeks. Your quotation states the
          slabs.
        </li>
        <li>
          <b>Visa, embassy, consular and biometric fees are never refundable</b>{" "}
          &mdash; not by us and not by the mission &mdash; whether the visa is
          granted, refused or withdrawn. A visa decision is made by the
          authorities of that country alone; we have no influence over it and a
          refusal is not a service failure on our part. Our own visa service
          charge is refundable only if we have not yet begun work on the file.
        </li>
      </ul>

      <h2>Our service fee</h2>
      <p>
        Our service fee is included in the fare you are quoted rather than added
        on at the end, so the price you see is the price you pay. It covers the
        work of making, issuing and supporting the booking, and once a ticket or
        booking has been issued that work is done, so it is not refundable on a
        customer cancellation or a no-show. It <em>is</em> returned in full when
        the booking fails, when we cancel something in error, or when you are
        refunded because we could not deliver the service.
      </p>

      <h2>How refunds are paid</h2>
      <ul>
        <li>
          Refunds go back to the <b>original payment method</b>, against the
          original order. We do not pay refunds in cash, to a different card or
          account, or to anyone other than the person who paid.
        </li>
        <li>
          We refund the amount actually received against that payment. Where an
          offer, cashback or bank discount meant you paid less than the ticket
          price, the refund is worked out on what was actually charged.
        </li>
        <li>
          The final leg is your bank&rsquo;s. Once we release a refund, the
          5&ndash;7 working days it takes to appear, and the way it is shown on
          your statement, are outside our control.
        </li>
      </ul>

      <h2>How to raise a cancellation or refund</h2>
      <p>
        Email <a href={`mailto:${site.email}`}>{site.email}</a>, or call{" "}
        <a href={site.phone.mobileHref}>{site.phone.mobileDisplay}</a> or{" "}
        <a href={site.phone.landlineHref}>{site.phone.landlineDisplay}</a> during{" "}
        {site.hours}. Include your booking reference or PNR, the lead
        passenger&rsquo;s name, the travel date and what you would like us to do.
        A request is acted on from the time it reaches us in writing, so email is
        the safest record.
      </p>
      <p>
        We acknowledge cancellation and refund requests within{" "}
        <strong>2 working days</strong> and tell you exactly what the airline or
        hotel will release before anything is cancelled, wherever their rules
        allow us to check first. If you are unhappy with how a refund has been
        handled, write to us at the same address marking it{" "}
        <b>&ldquo;Grievance&rdquo;</b> and it will be reviewed by the
        agency&rsquo;s management; you can also write to us at{" "}
        {site.address.full}.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy from time to time. The version in force when
        you made your booking is the one that applies to it, and the &ldquo;last
        updated&rdquo; date above will change whenever this page is revised.
      </p>
    </LegalPage>
  );
}