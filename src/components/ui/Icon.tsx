import {
  ArrowRight,
  BedDouble,
  BookMarked,
  Calendar,
  Car,
  Check,
  ChevronDown,
  Clock,
  Compass,
  Gem,
  Globe,
  Headset,
  Heart,
  LifeBuoy,
  Mail,
  Map,
  MapPin,
  Menu,
  MountainSnow,
  Phone,
  PhoneCall,
  Plane,
  Plus,
  Quote,
  Search,
  Send,
  ShieldCheck,
  Ship,
  Sparkles,
  Stamp,
  Star,
  Target,
  TreePalm,
  Users,
  Wallet,
  X,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

/**
 * Central icon registry. Data files reference icons by string `IconName`,
 * keeping content serializable and the icon set tree-shakeable.
 * All glyphs are stroke SVG (no emoji).
 */
export const iconRegistry = {
  bed: BedDouble,
  plane: Plane,
  car: Car,
  ship: Ship,
  compass: Compass,
  visa: Stamp,
  tours: TreePalm,
  passport: BookMarked,
  insurance: LifeBuoy,
  target: Target,
  headset: Headset,
  wallet: Wallet,
  shield: ShieldCheck,
  users: Users,
  search: Search,
  gem: Gem,
  mapPin: MapPin,
  map: Map,
  phone: Phone,
  phoneCall: PhoneCall,
  mail: Mail,
  clock: Clock,
  calendar: Calendar,
  heart: Heart,
  star: Star,
  globe: Globe,
  mountain: MountainSnow,
  check: Check,
  arrowRight: ArrowRight,
  chevronDown: ChevronDown,
  menu: Menu,
  close: X,
  plus: Plus,
  send: Send,
  sparkles: Sparkles,
  quote: Quote,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof iconRegistry;

type IconProps = LucideProps & { name: IconName };

export function Icon({ name, strokeWidth = 1.9, ...rest }: IconProps) {
  const Glyph = iconRegistry[name];
  return <Glyph strokeWidth={strokeWidth} aria-hidden {...rest} />;
}
