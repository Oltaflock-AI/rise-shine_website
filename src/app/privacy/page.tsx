import type { Metadata } from "next";
import { LegalPage } from "@/components/sections/LegalPage";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Rise & Shine Co collects, uses, shares and protects your personal information when you browse, enquire or book.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      crumb="Privacy Policy"
      title="Privacy Policy"
      lastUpdated="18-08-2026 13:55:00"
      photoId="photo-1521295121783-8a321d551ad2"
    >
      <p>
        This Privacy Policy describes how RISE AND SHINE CO (&ldquo;we&rdquo;,
        &ldquo;us&rdquo; or &ldquo;our&rdquo;) collects, uses, shares and
        protects your information when you visit {site.url}, make an enquiry, or
        book travel through us. By using our website and services, you consent
        to the practices described here.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <b>Details you give us.</b> Your name, email address, phone number and
          any message you send through an enquiry, callback or trip-planning
          form.
        </li>
        <li>
          <b>Traveller details needed to book.</b> When you book a flight or
          hotel, the airline, hotel or supplier requires passenger and guest
          details &mdash; title, full name, date of birth, gender, nationality,
          contact details, and where the fare, the destination or Indian
          regulation requires it, PAN, passport number, passport expiry and
          GSTIN. We collect these only because the booking cannot be issued
          without them.
        </li>
        <li>
          <b>Account information.</b> If you create an account, your email
          address and a securely hashed password, plus any traveller details you
          choose to save for faster checkout.
        </li>
        <li>
          <b>Payment information.</b> We do <b>not</b> collect or store your
          card, UPI or netbanking details. Payments are collected on our payment
          gateway&rsquo;s own hosted checkout. We receive only a payment
          reference, the amount, the status and the method used.
        </li>
        <li>
          <b>Call recordings and transcripts.</b> If you request a callback, the
          call may be handled by an automated voice assistant and recorded and
          transcribed so we can follow up accurately.
        </li>
        <li>
          <b>Technical and usage data.</b> IP address, browser and device type,
          pages visited and referring links, collected through our analytics
          provider.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To respond to your enquiries and prepare quotes and itineraries.</li>
        <li>
          To search, hold, book, reissue and cancel flights, hotels and packages
          with our suppliers.
        </li>
        <li>
          To take payment, issue receipts and process refunds, and to reconcile
          payments against bookings.
        </li>
        <li>
          To send you booking confirmations, tickets, vouchers, cancellation and
          refund notices, and service messages about a trip you have booked.
        </li>
        <li>
          To operate and secure your account, prevent fraud and misuse, and meet
          our legal, tax and regulatory obligations.
        </li>
        <li>To improve our website and our services.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        We do not sell your personal information. We share it only with those
        who need it to deliver what you have asked for:
      </p>
      <ul>
        <li>
          <b>Travel suppliers and their booking systems</b> &mdash; airlines,
          hotels and the global distribution and consolidator platforms we book
          through. A booking cannot be made without passing them the traveller
          details above.
        </li>
        <li>
          <b>Our payment gateway</b> &mdash; to create orders, confirm payment
          and process refunds.
        </li>
        <li>
          <b>Service providers</b> who host our website, send our transactional
          email, provide our voice assistant and provide analytics, in each case
          only to perform those services for us.
        </li>
        <li>
          <b>Authorities</b>, where disclosure is required by law or is
          necessary to establish, exercise or defend a legal claim.
        </li>
      </ul>
      <p>
        Where a booking is international, or a supplier or service provider
        operates outside India, your information may be processed outside India
        in order to complete that booking.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep enquiry records for as long as needed to serve you and for a
        reasonable period afterwards. Booking, payment and refund records are
        kept for as long as required under applicable tax, accounting and
        regulatory rules. You may ask us to delete your account at any time; we
        will do so except where we are required to retain specific records.
      </p>

      <h2>Security</h2>
      <p>
        Your connection to this website is encrypted. Passwords are stored
        hashed, never in plain text, and card details never reach our systems.
        Access to booking and payment records is restricted to authorised
        personnel. No method of transmission or storage is completely secure, so
        we cannot guarantee absolute security, but we take reasonable steps to
        protect your information.
      </p>

      <h2>Cookies</h2>
      <p>
        We use cookies and similar technologies to keep you signed in, remember
        your preferences and understand how the site is used. You can block or
        delete cookies in your browser settings; parts of the site, including
        sign-in and checkout, may not work correctly if you do.
      </p>

      <h2>Your choices and rights</h2>
      <p>
        You may ask us to access, correct or delete the personal information we
        hold about you, withdraw a consent you have given, or ask us to stop
        sending you promotional messages. Write to us using the contact details
        below and we will respond within a reasonable period. Withdrawing
        consent for information that is essential to a booking may mean we can
        no longer provide that booking.
      </p>

      <h2>Children</h2>
      <p>
        Our services are not directed at children under 18, and we do not
        knowingly collect their information except as traveller details supplied
        by a parent or guardian making a booking.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. The revised version
        takes effect when it is posted here, and the &ldquo;last updated&rdquo;
        date above will change.
      </p>

      <h2>Contact us</h2>
      <p>
        For any question about this policy or about your information, contact{" "}
        {site.legalName} at{" "}
        <a href={`mailto:${site.email}`}>{site.email}</a> or{" "}
        <a href={site.phone.mobileHref}>{site.phone.mobileDisplay}</a>.
        Registered address: {site.address.full}.
      </p>
    </LegalPage>
  );
}
