import type { Metadata } from "next";
import { LegalPage } from "@/components/sections/LegalPage";

export const metadata: Metadata = {
  title: "Cancellation & Refund Policy",
  description:
    "Rise & Shine Co's cancellation and refund policy, including timelines for cancellations, replacements and refunds.",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      crumb="Cancellation & Refund Policy"
      title="Cancellation & Refund Policy"
      lastUpdated="16-07-2026 11:40:32"
      photoId="photo-1436491865332-7a61a109cc05"
    >
      <p>
        RISE AND SHINE CO believes in helping its customers as far as possible,
        and has therefore a liberal cancellation policy. Under this policy:
      </p>

      <ul>
        <li>
          Cancellations will be considered only if the request is made
          immediately after placing the order. However, the cancellation request
          may not be entertained if the orders have been communicated to the
          vendors/merchants and they have initiated the process of shipping them.
        </li>
        <li>
          RISE AND SHINE CO does not accept cancellation requests for perishable
          items like flowers, eatables etc. However, refund/replacement can be
          made if the customer establishes that the quality of product delivered
          is not good.
        </li>
        <li>
          In case of receipt of damaged or defective items please report the
          same to our Customer Service team. The request will, however, be
          entertained once the merchant has checked and determined the same at
          his own end. This should be reported within the same day of receipt of
          the products. In case you feel that the product received is not as
          shown on the site or as per your expectations, you must bring it to the
          notice of our customer service within the same day of receiving the
          product. The Customer Service Team, after looking into your complaint,
          will take an appropriate decision.
        </li>
        <li>
          In case of complaints regarding products that come with a warranty from
          manufacturers, please refer the issue to them. In case of any refunds
          approved by RISE AND SHINE CO, it&rsquo;ll take 16&ndash;30 days for
          the refund to be processed to the end customer.
        </li>
      </ul>
    </LegalPage>
  );
}
