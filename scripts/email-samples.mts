/**
 * Sample renders of every Rise & Shine email, in one place.
 *
 * Shared by `email-preview.mts` (writes them to disk) and
 * `email-send-samples.mts` (mails them to you). Kept together so the set you
 * review in a browser and the set that lands in your inbox cannot drift apart —
 * and so adding a template means adding it here once.
 *
 * The sample data is deliberately realistic (a real route, a plausible fare, an
 * Ahmedabad name) because layout bugs hide behind lorem ipsum: a name that never
 * wraps and a fare that is always four digits will not show you the row that
 * breaks on "Thiruvananthapuram" or ₹1,24,500.
 */

export interface Sample {
  file: string;
  label: string;
  note: string;
  subject: string;
  html: string;
}

export async function buildSamples(): Promise<Sample[]> {
  const {
    flightConfirmationEmail,
    hotelConfirmationEmail,
    refundNoticeEmail,
    welcomeEmail,
    passwordResetEmail,
    offerEmail,
  } = await import("../src/lib/email.js");

  const flight = flightConfirmationEmail(
    {
      origin: "AMD",
      destination: "GOI",
      airlineCode: "6E",
      flightNumber: "6592",
      departDate: "2026-09-14",
      passengers: [
        { FirstName: "Hardik", LastName: "Patel", Email: "hardik@example.com" },
        { FirstName: "Meera", LastName: "Patel" },
      ],
    } as never,
    { pnr: "QK4TZP", ticketNumbers: ["0982416558231", "0982416558232"] } as never,
    24680,
  );

  const hotel = hotelConfirmationEmail(
    {
      rooms: [{ passengers: [{ firstName: "Hardik", lastName: "Patel", email: "hardik@example.com" }] }],
    } as never,
    {
      hotelName: "Taj Exotica Resort & Spa",
      city: "Goa",
      checkIn: "2026-09-14",
      checkOut: "2026-09-18",
    } as never,
    { confirmationNo: "TBO-99341827", bookingId: 99341827 } as never,
    61200,
  );

  return [
    {
      file: "flight-confirmation.html",
      label: "Flight booking confirmed",
      note: "Sent from /api/book once a ticket is issued. Green accent = confirmed.",
      ...flight,
    },
    {
      file: "hotel-confirmation.html",
      label: "Hotel booking confirmed",
      note: "Sent from /api/hotels/book after a confirmed Book.",
      ...hotel,
    },
    {
      file: "welcome.html",
      label: "Account created",
      note: "Sent from /api/account/welcome after signup. Navy accent = account.",
      ...welcomeEmail({ name: "Hardik Patel", email: "hardik@example.com" }),
    },
    {
      file: "password-reset.html",
      label: "Forgot password",
      note: "Sent from /api/auth/forgot-password. Amber accent = action needed.",
      ...passwordResetEmail({
        name: "Hardik Patel",
        resetUrl: "https://www.riseandshinetravel.in/auth/confirm?token_hash=sample&type=recovery",
      }),
    },
    {
      file: "refund.html",
      label: "Payment refunded",
      note: "Sent when a paid booking could not be completed.",
      ...refundNoticeEmail({ kind: "flight", amountInr: 24680, reference: "order_RS_8842190" }),
    },
    {
      file: "offer.html",
      label: "Offers / campaign",
      note: "Sent from /api/marketing/send. Red accent, and the only one with an unsubscribe.",
      ...offerEmail({
        name: "Hardik Patel",
        headline: "Three monsoon escapes, held until the 12th",
        intro:
          "The rains make these three cheaper and emptier than they will be all year. Fares below are per person, twin sharing, ex-Ahmedabad.",
        validUntil: "12-09-26",
        unsubscribeUrl: "https://www.riseandshinetravel.in/unsubscribe?t=sample-token",
        items: [
          {
            title: "Kerala · 6 nights",
            blurb: "Backwaters at Alleppey, tea country at Munnar, two nights on the coast.",
            fromInr: 38900,
            url: "https://www.riseandshinetravel.in/packages/domestic/kerala",
          },
          {
            title: "Andaman · 5 nights",
            blurb: "Havelock and Neil, with the ferry transfers and permits handled.",
            fromInr: 44500,
            url: "https://www.riseandshinetravel.in/packages/domestic/andaman",
          },
          {
            title: "Rajasthan · 7 nights",
            blurb: "Udaipur, Jodhpur and Jaisalmer, ending with a night in the dunes.",
            fromInr: 31200,
            url: "https://www.riseandshinetravel.in/packages/domestic/rajasthan",
          },
        ],
      }),
    },
  ];
}
