/** Real traveller testimonials carried over from the existing site. */

export type Testimonial = {
  initials: string;
  name: string;
  trip: string;
  date: string;
  rating: number;
  quote: string;
};

export const testimonials: Testimonial[] = [
  {
    initials: "NP",
    name: "Naresh Patel",
    trip: "Kerala",
    date: "Jun 2019",
    rating: 5,
    quote:
      "Best experience with Rise & Shine Travel. My memorable tour of Kerala was perfectly arranged. I recommend them to everyone — special thanks to Alpeshbhai & Hardikbhai. Good job!",
  },
  {
    initials: "KM",
    name: "Mr & Mrs. Kumawat",
    trip: "Mauritius",
    date: "Feb 2019",
    rating: 5,
    quote:
      "Our Mauritius trip was very well planned. Everything was well coordinated and at the best price. Thank you, Team Rise & Shine Travel!",
  },
  {
    initials: "PP",
    name: "Prakash Patel",
    trip: "Dubai",
    date: "Aug 2018",
    rating: 5,
    quote:
      "Thank you for organising a beautiful tour of Dubai — well planned and well organised, one of our best trips. Any trip henceforth will be through Rise & Shine only!",
  },
];
